import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectCapability, checkFile } from "./host-admission.mjs";
export { admitSyntheticRoot } from "./host-admission.mjs";
import { StorageError, demand, safeFailure } from "./errors.mjs";
import {
  plain,
  closed,
  id,
  encode,
  digest,
  validateState,
  validateEvent,
  validateCursor,
  sourceClaim,
} from "./codec.mjs";
import {
  APPLICATION_ID,
  schema,
  restore,
  cacheBody,
  logicalBytes,
  writeState,
  addReceipt,
} from "./records.mjs";

const quarantined = new Set();
const CATALOG_ID = 0x41504331;
const OWNER_ID = 0x41504f31;
const defaults = Object.freeze({
  logicalBytes: 128 * 1024 * 1024,
  snapshotBytes: 8 * 1024 * 1024,
  physicalBytes: 512 * 1024 * 1024,
});
const copy = (v) => structuredClone(v);
function safeCode(error) {
  return typeof error?.code === "string" &&
    /^SQLITE_[A-Z_]{1,50}$/.test(error.code)
    ? error.code
    : "application_failure";
}
function configure(db, mode) {
  db.pragma("busy_timeout=0");
  db.pragma("foreign_keys=ON");
  db.pragma("trusted_schema=OFF");
  db.pragma("temp_store=MEMORY");
  db.pragma(`journal_mode=${mode}`);
  db.pragma("synchronous=FULL");
  if (mode === "WAL") db.pragma("wal_autocheckpoint=0");
  demand(
    db.pragma("journal_mode", { simple: true }) === mode.toLowerCase() &&
      db.pragma("synchronous", { simple: true }) === 2 &&
      db.pragma("foreign_keys", { simple: true }) === 1,
    "unavailable",
  );
  demand(
    db.prepare("SELECT sqlite_version() AS version").get().version === "3.53.4",
    "unavailable",
  );
}
function touch(filename) {
  fs.writeFileSync(filename, "", { flag: "wx" });
  return checkFile(filename);
}
function directory(filename) {
  if (!fs.existsSync(filename)) fs.mkdirSync(filename);
  checkFile(filename);
}
function physicalBytes(root) {
  let total = 0;
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, d.name);
    checkFile(p);
    total += d.isDirectory() ? physicalBytes(p) : fs.statSync(p).size;
  }
  return total;
}
function receiptFromRow(row) {
  return {
    operationId: row.operation_id,
    operationNonce: row.nonce,
    projectId: row.project_id,
    generation: row.generation,
    epoch: row.epoch,
    intentDigest: row.intent_digest,
    resultDigest: row.result_digest,
    stateDigest: row.state_digest,
    head: row.seq,
  };
}
export function openSyntheticStore(capability, options = {}) {
  let catalog,
    owner,
    project,
    ownerHeld = false;
  const events = [];
  const note = (phase, fields = {}) =>
    events.push({ seq: events.length + 1, phase, ...fields });
  const admitted = inspectCapability(capability);
  const scope = {
    projectId: options.projectId,
    generation: options.generation,
    processorFingerprint: options.processorFingerprint,
    observedRoot: admitted.observedRoot,
  };
  id(scope.projectId);
  demand(
    typeof scope.generation === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(scope.generation),
  );
  demand(
    /^[a-f0-9]{64}$/.test(scope.processorFingerprint) &&
      typeof options.Database === "function" &&
      typeof options.applyNormalizedEvent === "function",
  );
  if (options.bootstrap !== undefined)
    validateState(options.bootstrap, scope.projectId, {
      allowedLocations: [scope.observedRoot],
    });
  const limits = Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => {
      const n = options.limits?.[k] ?? v;
      demand(Number.isSafeInteger(n) && n > 0 && n <= v);
      return [k, n];
    }),
  );
  let paths,
    identities,
    context,
    retired = false;
  function checkBinding() {
    inspectCapability(capability);
    for (const key of ["catalog", "owner", "project"])
      checkFile(paths[key], identities[key]);
    checkFile(path.dirname(paths.owner));
    checkFile(path.dirname(paths.project));
    for (const file of [
      paths.project + "-wal",
      paths.project + "-shm",
      paths.project + "-journal",
      paths.owner + "-journal",
    ])
      if (fs.existsSync(file)) checkFile(file);
  }
  function closeProjectFirst() {
    retired = true;
    try {
      if (project?.open) {
        project.close();
        demand(!project.open, "unavailable");
      }
      note("project-close", { status: "returned" });
    } catch {
      quarantined.add({ project, owner, catalog });
      note("project-close", { status: "unknown" });
      throw new StorageError();
    }
    try {
      if (owner?.open && ownerHeld) {
        owner.exec("ROLLBACK");
        ownerHeld = false;
      }
      if (owner?.open) owner.close();
      note("owner-release", { status: "returned" });
    } catch {
      quarantined.add({ project, owner, catalog });
      note("owner-release", { status: "unknown" });
      throw new StorageError();
    }
  }
  try {
    const catalogPath = path.join(admitted.privateRoot, "catalog.sqlite");
    const newCatalog = !fs.existsSync(catalogPath);
    if (newCatalog) {
      demand(
        fs.readdirSync(admitted.privateRoot).length === 0,
        "binding_conflict",
      );
      touch(catalogPath);
    }
    const catalogIdentity = checkFile(catalogPath);
    catalog = new options.Database(catalogPath, { fileMustExist: true });
    checkFile(catalogPath, catalogIdentity);
    if (!newCatalog)
      demand(
        catalog.pragma("application_id", { simple: true }) === CATALOG_ID &&
          catalog.pragma("user_version", { simple: true }) === 1,
        "unavailable",
      );
    configure(catalog, "DELETE");
    if (newCatalog) {
      catalog.exec(
        `BEGIN IMMEDIATE; PRAGMA application_id=${CATALOG_ID}; PRAGMA user_version=1; CREATE TABLE bindings(project_id TEXT PRIMARY KEY,root_locator TEXT NOT NULL UNIQUE,store_key TEXT NOT NULL UNIQUE,generation TEXT NOT NULL,lifecycle TEXT NOT NULL CHECK(lifecycle IN ('creating','active')),owner_identity TEXT,project_identity TEXT) STRICT; COMMIT;`,
      );
    }
    demand(
      catalog.pragma("application_id", { simple: true }) === CATALOG_ID &&
        catalog.pragma("user_version", { simple: true }) === 1,
      "unavailable",
    );
    catalog.exec("BEGIN IMMEDIATE");
    let binding = catalog
      .prepare("SELECT * FROM bindings WHERE root_locator=? OR project_id=?")
      .get(admitted.observedRoot, scope.projectId);
    const newBinding = !binding;
    if (newBinding) {
      demand(options.bootstrap !== undefined, "unavailable");
      catalog
        .prepare("INSERT INTO bindings VALUES(?,?,?,?, 'creating',NULL,NULL)")
        .run(
          scope.projectId,
          admitted.observedRoot,
          randomUUID(),
          scope.generation,
        );
      binding = catalog
        .prepare("SELECT * FROM bindings WHERE project_id=?")
        .get(scope.projectId);
    }
    demand(
      binding.project_id === scope.projectId &&
        binding.generation === scope.generation &&
        binding.root_locator === admitted.observedRoot,
      "binding_conflict",
    );
    demand(
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(binding.store_key),
      "binding_conflict",
    );
    demand(newBinding || binding.lifecycle === "active", "unavailable");
    catalog.exec("COMMIT");
    const ownership = path.join(admitted.privateRoot, "ownership"),
      projects = path.join(admitted.privateRoot, "projects");
    if (newBinding) {
      directory(ownership);
      directory(projects);
      directory(path.join(ownership, binding.store_key));
      directory(path.join(projects, binding.store_key));
      directory(path.join(projects, binding.store_key, scope.generation));
    }
    paths = {
      catalog: catalogPath,
      owner: path.join(ownership, binding.store_key, "owner.sqlite"),
      project: path.join(
        projects,
        binding.store_key,
        scope.generation,
        "project.sqlite",
      ),
    };
    if (newBinding) {
      touch(paths.owner);
      touch(paths.project);
    }
    identities = {
      catalog: catalogIdentity,
      owner: checkFile(
        paths.owner,
        newBinding ? undefined : JSON.parse(binding.owner_identity),
      ),
      project: checkFile(
        paths.project,
        newBinding ? undefined : JSON.parse(binding.project_identity),
      ),
    };
    checkBinding();
    owner = new options.Database(paths.owner, { fileMustExist: true });
    checkFile(paths.owner, identities.owner);
    if (!newBinding)
      demand(
        owner.pragma("application_id", { simple: true }) === OWNER_ID &&
          owner.pragma("user_version", { simple: true }) === 1,
        "unavailable",
      );
    configure(owner, "DELETE");
    if (newBinding)
      owner.exec(
        `BEGIN IMMEDIATE; PRAGMA application_id=${OWNER_ID}; PRAGMA user_version=1; CREATE TABLE owner_binding(store_key TEXT PRIMARY KEY,project_id TEXT NOT NULL) STRICT; COMMIT;`,
      );
    if (newBinding)
      owner
        .prepare("INSERT INTO owner_binding VALUES(?,?)")
        .run(binding.store_key, scope.projectId);
    demand(
      owner.pragma("application_id", { simple: true }) === OWNER_ID,
      "unavailable",
    );
    const ownerBinding = owner.prepare("SELECT * FROM owner_binding").all();
    demand(
      ownerBinding.length === 1 &&
        ownerBinding[0].store_key === binding.store_key &&
        ownerBinding[0].project_id === scope.projectId,
      "binding_conflict",
    );
    try {
      owner.exec("BEGIN IMMEDIATE");
      ownerHeld = true;
    } catch (error) {
      if (error.code === "SQLITE_BUSY")
        throw new StorageError("ownership_busy");
      throw error;
    }
    note("owner-acquired");
    project = new options.Database(paths.project, { fileMustExist: true });
    checkFile(paths.project, identities.project);
    if (!newBinding)
      demand(
        project.pragma("application_id", { simple: true }) === APPLICATION_ID &&
          project.pragma("user_version", { simple: true }) === 1,
        "unavailable",
      );
    configure(project, "WAL");
    note("configuration", {
      journalMode: project.pragma("journal_mode", { simple: true }),
      synchronous: project.pragma("synchronous", { simple: true }),
      walAutocheckpoint: project.pragma("wal_autocheckpoint", { simple: true }),
    });
    if (newBinding) {
      project.exec("BEGIN IMMEDIATE");
      project.pragma(`application_id=${APPLICATION_ID}`);
      project.pragma("user_version=1");
      project.exec(schema);
      const initial = copy(options.bootstrap),
        intent = {
          operationId: "bootstrap",
          operationNonce: admitted.nonce,
          projectId: scope.projectId,
          generation: scope.generation,
          expectedHead: 0,
          seedDigest: digest(initial),
        };
      addReceipt(project, {
        state: initial,
        cursor: [],
        head: 1,
        intent,
        epoch: 0,
        canonicalEventIds: initial.acceptedEvents.map((e) => e.id),
      });
      writeState(project, initial, 1);
      project
        .prepare("INSERT INTO store_meta VALUES(1,?,?,?,?,?,0,NULL,?,'active')")
        .run(
          scope.projectId,
          scope.generation,
          scope.processorFingerprint,
          1,
          digest(initial),
          admitted.nonce,
        );
      const snapshot = cacheBody(initial, [], 1, scope);
      demand(
        Buffer.byteLength(encode(snapshot)) <= limits.snapshotBytes,
        "quota_exceeded",
      );
      project
        .prepare("INSERT INTO snapshots VALUES(?,?,?)")
        .run(1, encode(snapshot), digest(snapshot));
      demand(logicalBytes(project) <= limits.logicalBytes, "quota_exceeded");
      project.exec("COMMIT");
      catalog.exec("BEGIN IMMEDIATE");
      catalog
        .prepare(
          "UPDATE bindings SET lifecycle='active',owner_identity=?,project_identity=? WHERE project_id=? AND lifecycle='creating'",
        )
        .run(
          encode(identities.owner),
          encode(identities.project),
          scope.projectId,
        );
      catalog.exec("COMMIT");
    }
    const restored = restore(project, scope);
    project.exec("BEGIN IMMEDIATE");
    const meta = project.prepare("SELECT * FROM store_meta WHERE id=1").get();
    demand(
      meta.head === restored.head &&
        meta.writer_epoch < Number.MAX_SAFE_INTEGER,
      "unavailable",
    );
    context = {
      generation: scope.generation,
      epoch: meta.writer_epoch + 1,
      token: randomUUID(),
    };
    const changed = project
      .prepare(
        "UPDATE store_meta SET writer_epoch=?,owner_token=?,control_nonce=? WHERE id=1 AND writer_epoch=?",
      )
      .run(
        BigInt(context.epoch),
        context.token,
        randomUUID(),
        BigInt(meta.writer_epoch),
      );
    demand(changed.changes === 1, "unavailable");
    project.exec("COMMIT");
    checkBinding();
    catalog.close();
    catalog = undefined;
    note("fenced", { epoch: context.epoch, head: restored.head });
  } catch (error) {
    // An initialization/control COMMIT error never becomes an empty successful store.
    try {
      if (project?.open && project.inTransaction) project.exec("ROLLBACK");
    } catch {
      quarantined.add({ project, owner, catalog });
      throw new StorageError();
    }
    try {
      closeProjectFirst();
    } catch {
      throw new StorageError();
    }
    try {
      if (catalog?.open) {
        if (catalog.inTransaction) catalog.exec("ROLLBACK");
        catalog.close();
      }
    } catch {
      quarantined.add({ catalog });
    }
    throw safeFailure(error);
  }

  function active() {
    try {
      demand(
        !retired &&
          project.open &&
          owner.open &&
          ownerHeld &&
          owner.inTransaction,
        "unavailable",
      );
      checkBinding();
    } catch (error) {
      retired = true;
      note("capability-revoked", { status: "unavailable" });
      throw safeFailure(error);
    }
  }
  function read() {
    try {
      active();
      project.exec("BEGIN");
      const cut = restore(project, scope);
      project.exec("COMMIT");
      return copy(cut);
    } catch {
      retired = true;
      try {
        if (project.open && project.inTransaction) project.exec("ROLLBACK");
      } catch {
        quarantined.add({ project, owner });
      }
      throw new StorageError();
    }
  }
  function commit(request) {
    let phase = "admission";
    try {
      active();
      plain(request);
      closed(
        request,
        ["operationId", "operationNonce", "expectedHead", "writer", "events"],
        ["cursor", "createSnapshot"],
      );
      id(request.operationId);
      id(request.operationNonce);
      demand(
        Number.isSafeInteger(request.expectedHead) && request.expectedHead >= 1,
      );
      closed(request.writer, ["generation", "epoch", "token"]);
      id(request.writer.generation);
      id(request.writer.token);
      demand(
        Number.isSafeInteger(request.writer.epoch) && request.writer.epoch >= 0,
      );
      demand(Array.isArray(request.events) && request.events.length > 0);
      request.events.forEach((e) => validateEvent(e, scope.projectId));
      if (request.cursor !== undefined) validateCursor(request.cursor);
      demand(
        request.createSnapshot === undefined ||
          typeof request.createSnapshot === "boolean",
      );
      const intent = {
        operationId: request.operationId,
        operationNonce: request.operationNonce,
        projectId: scope.projectId,
        generation: scope.generation,
        expectedHead: request.expectedHead,
        eventClaims: request.events.map((e) => ({
          internalId: e.sourceIdentity?.kind === "source_event" ? null : e.id,
          claim: sourceClaim(e),
        })),
        cursor: request.cursor ?? null,
        createSnapshot: request.createSnapshot ?? true,
      };
      phase = "begin";
      project.exec("BEGIN IMMEDIATE");
      phase = "guard";
      const meta = project.prepare("SELECT * FROM store_meta WHERE id=1").get();
      demand(
        meta.project_id === scope.projectId &&
          meta.generation === request.writer.generation &&
          meta.writer_epoch === request.writer.epoch &&
          meta.owner_token === request.writer.token &&
          meta.writer_epoch === context.epoch &&
          meta.owner_token === context.token &&
          meta.lifecycle === "active",
        "stale_writer",
      );
      note("guard", { epoch: meta.writer_epoch, head: meta.head });
      const existing = project
        .prepare("SELECT * FROM commits WHERE operation_id=?")
        .get(request.operationId);
      if (existing) {
        demand(existing.intent_digest === digest(intent), "identity_conflict");
        const current = restore(project, scope);
        project.exec("ROLLBACK");
        return {
          status: "already_committed",
          receipt: receiptFromRow(existing),
          ...current,
          replay: false,
          publish: false,
          ack: false,
        };
      }
      demand(meta.head === request.expectedHead, "revision_conflict");
      const before = restore(project, scope);
      let state = before.state;
      const canonicalEventIds = [];
      for (const event of request.events) {
        let old = state.acceptedEvents.find((e) => e.id === event.id);
        if (old) demand(encode(old) === encode(event), "identity_conflict");
        else if (event.sourceIdentity?.kind === "source_event") {
          old = state.acceptedEvents.find(
            (e) =>
              e.sourceId === event.sourceId &&
              e.sourceIdentity?.kind === "source_event" &&
              e.sourceIdentity.sourceEventId ===
                event.sourceIdentity.sourceEventId,
          );
          if (old)
            demand(
              sourceClaim(old) === sourceClaim(event),
              "identity_conflict",
            );
        }
        if (old) canonicalEventIds.push(old.id);
        else {
          const result = options.applyNormalizedEvent(state, copy(event));
          demand(result.status === "applied", "admission_rejected");
          state = result.state;
          canonicalEventIds.push(event.id);
        }
      }
      validateState(state, scope.projectId, {
        allowedLocations: [scope.observedRoot],
      });
      demand(
        encode(state.assertions.slice(0, before.state.assertions.length)) ===
          encode(before.state.assertions),
        "identity_conflict",
      );
      const head = meta.head + 1;
      demand(Number.isSafeInteger(head), "quota_exceeded");
      let nextCursor = before.cursor;
      if (request.cursor) {
        const c = request.cursor;
        demand(
          request.events.every((e) => e.sourceId === c.sourceId),
          "coverage_conflict",
        );
        demand(
          encode([...new Set(canonicalEventIds)].sort()) ===
            encode([...c.coveredEventIds].sort()),
          "coverage_conflict",
        );
        const prior = before.cursor.find(
          (old) => old.sourceId === c.sourceId && old.streamId === c.streamId,
        );
        demand(
          (prior?.position ?? null) === c.expectedPrevious,
          "coverage_conflict",
        );
        nextCursor = [
          ...before.cursor.filter(
            (old) =>
              !(old.sourceId === c.sourceId && old.streamId === c.streamId),
          ),
          c,
        ].sort((a, b) => {
          const x = encode([a.sourceId, a.streamId]),
            y = encode([b.sourceId, b.streamId]);
          return x < y ? -1 : x > y ? 1 : 0;
        });
      }
      const snapshot =
        request.createSnapshot === false
          ? null
          : cacheBody(state, nextCursor, head, scope);
      if (snapshot)
        demand(
          Buffer.byteLength(encode(snapshot)) <= limits.snapshotBytes,
          "quota_exceeded",
        );
      // Conservative pre-write whole-bundle estimate; exact retained SQL-row
      // accounting below is a second transactional backstop, not a disk guarantee.
      const estimate =
        logicalBytes(project) +
        Buffer.byteLength(encode({ state, intent, nextCursor })) * 2 +
        2048;
      demand(
        estimate <= limits.logicalBytes &&
          physicalBytes(admitted.privateRoot) < limits.physicalBytes,
        "quota_exceeded",
      );
      phase = "records";
      const receipt = addReceipt(project, {
        state,
        cursor: nextCursor,
        head,
        intent,
        epoch: context.epoch,
        canonicalEventIds,
      });
      writeState(project, state, head);
      if (request.cursor)
        project
          .prepare("INSERT INTO source_checkpoint_versions VALUES(?,?,?,?,?)")
          .run(
            request.cursor.sourceId,
            request.cursor.streamId,
            head,
            encode(request.cursor),
            digest(request.cursor),
          );
      if (snapshot) {
        project
          .prepare("INSERT INTO snapshots VALUES(?,?,?)")
          .run(head, encode(snapshot), digest(snapshot));
        project
          .prepare(
            "DELETE FROM snapshots WHERE watermark NOT IN (SELECT watermark FROM snapshots ORDER BY watermark DESC LIMIT 2)",
          )
          .run();
      }
      options.testHooks?.afterRecords?.();
      const changed = project
        .prepare(
          "UPDATE store_meta SET head=?,state_digest=? WHERE id=1 AND head=? AND writer_epoch=? AND owner_token=?",
        )
        .run(
          head,
          digest(state),
          meta.head,
          BigInt(context.epoch),
          context.token,
        );
      demand(changed.changes === 1, "stale_writer");
      demand(logicalBytes(project) <= limits.logicalBytes, "quota_exceeded");
      try {
        demand(ownerHeld && owner.open && owner.inTransaction, "unavailable");
        checkBinding();
      } catch (error) {
        retired = true;
        note("capability-revoked", { status: "unavailable" });
        throw error;
      }
      phase = "commit_attempted";
      note("commit-enter", { head });
      project.exec("COMMIT");
      phase = "committed";
      note("commit-return", { head, status: "returned" });
      return {
        status: "committed",
        receipt,
        state: copy(state),
        cursor: copy(nextCursor),
        head,
        stateDigest: digest(state),
        replay: false,
        publish: false,
        ack: false,
      };
    } catch (error) {
      if (error?.code === "binding_conflict") retired = true;
      note("error", {
        operationPhase: phase,
        errorCode: safeCode(error),
        transactionActive: project.open && project.inTransaction,
      });
      try {
        if (project.open && project.inTransaction) {
          project.exec("ROLLBACK");
          note("rollback", {
            status: "returned",
            transactionActive: project.inTransaction,
          });
          demand(!project.inTransaction, "unavailable");
        }
      } catch {
        retired = true;
        quarantined.add({ project, owner });
        note("rollback", { status: "unknown" });
        throw new StorageError();
      }
      if (phase === "commit_attempted" || phase === "committed") {
        retired = true;
        note("outcome", {
          status: "unavailable",
          replay: false,
          publish: false,
          ack: false,
        });
        throw new StorageError();
      }
      if (phase === "guard" && error?.code === "unavailable") retired = true;
      throw safeFailure(error);
    }
  }
  return Object.freeze({
    read,
    commit,
    writer: () => copy(context),
    paths: () => copy(paths),
    evidence: () => copy(events),
    close: () => {
      closeProjectFirst();
      return { status: "closed", processSettlementRequired: true };
    },
    admission: () => ({
      productionWriteEnabled: false,
      bindingAssurance: admitted.bindingAssurance,
    }),
  });
}
