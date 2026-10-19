"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const sql = require("./sql.cjs"),
  { validateCut } = require("./oracle.cjs"),
  { reconcile, compareClaim } = require("./policy.cjs");
const { fail, hash } = require("./checks.cjs"),
  { confined, physicalDirectory, errorRecord } = require("./safety.cjs");
async function main() {
  if (!process.send || !process.env.APV_RECOVERY_WORKER)
    throw fail("EXPLICIT_PARENT_REQUIRED");
  const c = JSON.parse(process.env.APV_RECOVERY_WORKER);
  if (
    path.basename(c.root) !== c.runId ||
    !["setup", "writer", "recovery", "reader", "fault"].includes(c.role)
  )
    throw fail("WORKER_BINDING");
  physicalDirectory(c.root, c.repo);
  const spawnIntent = JSON.parse(
    fs.readFileSync(
      confined(c.root, "raw", `spawn-${c.workerId}.json`),
      "utf8",
    ),
  );
  if (
    spawnIntent.nonce !== c.nonce ||
    spawnIntent.unit !== c.unit ||
    spawnIntent.role !== c.role
  )
    throw fail("SPAWN_BINDING");
  const manifest = JSON.parse(
    fs.readFileSync(confined(c.root, "manifest.json"), "utf8"),
  );
  if (
    manifest.runId !== c.runId ||
    !fs.existsSync(confined(c.root, "execution-start.json"))
  )
    throw fail("EXECUTION_BINDING");
  const local = createRequire(
    path.join(c.repo, "experiments/phase-2-sqlite-driver-spike/package.json"),
  );
  if (local("better-sqlite3/package.json").version !== "13.0.3")
    throw fail("DRIVER_VERSION");
  const Database = local("better-sqlite3");
  const fixture = JSON.parse(
    fs.readFileSync(confined(c.root, "fixture.json"), "utf8"),
  );
  const binding = {
    runId: c.runId,
    unit: c.unit,
    project: fixture.projectId,
    generation: fixture.generation,
    fingerprint: manifest.fingerprint,
  };
  const dir = confined(c.root, c.unit),
    file = confined(dir, "project.sqlite"),
    ownerFile = confined(dir, "owner.sqlite");
  let project,
    owner,
    capability,
    active = false,
    complete = false,
    sequence = 0,
    handling = false;
  function emit(commandId, kind, data) {
    const row = {
      runId: c.runId,
      workerId: c.workerId,
      nonce: c.nonce,
      pid: process.pid,
      unit: c.unit,
      role: c.role,
      sequence: ++sequence,
      commandId,
      kind,
      at: new Date().toISOString(),
      monotonicMs: performance.now(),
      data,
    };
    fs.writeFileSync(
      confined(c.root, "raw", `${c.workerId}-${sequence}.json`),
      JSON.stringify(row, null, 2),
      { flag: "wx" },
    );
    if (process.connected) process.send(row);
  }
  function identity(filePath) {
    const s = fs.statSync(filePath);
    return { dev: s.dev, ino: s.ino };
  }
  function checkFiles(unit = c.unit) {
    const unitDir = confined(c.root, unit);
    physicalDirectory(unitDir, c.repo);
    const expected = JSON.parse(
      fs.readFileSync(
        confined(c.root, "unit-identities", `${unit}.json`),
        "utf8",
      ),
    );
    for (const name of ["project.sqlite", "owner.sqlite"]) {
      const f = confined(unitDir, name),
        s = fs.lstatSync(f);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.nlink !== 1 ||
        fs.realpathSync.native(f).toLowerCase() !== f.toLowerCase() ||
        hash(identity(f)) !== hash(expected[name])
      )
        throw fail("PHYSICAL_FIXTURE_IDENTITY");
    }
  }
  function recordFiles() {
    fs.writeFileSync(
      confined(c.root, "unit-identities", `${c.unit}.json`),
      JSON.stringify(
        {
          "project.sqlite": identity(file),
          "owner.sqlite": identity(ownerFile),
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
  function createOwner() {
    const db = new Database(ownerFile);
    db.exec(
      "CREATE TABLE binding (runId TEXT, unit TEXT, project TEXT, generation TEXT)",
    );
    db.prepare("INSERT INTO binding VALUES (?,?,?,?)").run(
      c.runId,
      c.unit,
      fixture.projectId,
      fixture.generation,
    );
    db.close();
  }
  function open(readonly = false) {
    checkFiles();
    project = new Database(file, {
      readonly,
      fileMustExist: true,
      timeout: 250,
    });
    project.pragma("foreign_keys = ON");
    const version = project
      .prepare("SELECT sqlite_version() AS version")
      .get().version;
    if (version !== "3.53.4") throw fail("SQLITE_TUPLE_OUT_OF_SCOPE");
  }
  function holdOwner() {
    checkFiles();
    owner = new Database(ownerFile, { fileMustExist: true, timeout: 250 });
    owner.exec("BEGIN IMMEDIATE");
    const row = owner.prepare("SELECT * FROM binding").get();
    if (
      row.runId !== c.runId ||
      row.unit !== c.unit ||
      row.project !== fixture.projectId ||
      row.generation !== fixture.generation
    )
      throw fail("OWNER_BINDING");
  }
  function held() {
    if (!owner?.open || !owner.inTransaction) throw fail("OWNER_REVOKED");
  }
  function guard() {
    if (!active) throw fail("WRITER_DISABLED");
    held();
    sql.guard(project, capability);
  }
  function settle(commandId) {
    active = false;
    complete = false;
    const beforeInTransaction = Boolean(project?.inTransaction);
    if (beforeInTransaction) project.exec("ROLLBACK");
    if (project?.inTransaction) throw fail("SETTLEMENT_UNPROVEN");
    project?.close();
    if (project?.open) throw fail("CLOSE_UNPROVEN");
    project = undefined;
    const proof = {
      confirmed: true,
      kind: "verified_rollback_close",
      pid: process.pid,
      workerNonce: c.nonce,
      evidenceRef: `${c.workerId}:${sequence + 1}`,
      beforeInTransaction,
      inTransaction: false,
      closeConfirmed: true,
      ownerRetained: Boolean(owner?.inTransaction),
    };
    emit(commandId, "settled", proof);
    return proof;
  }
  const allowed = {
    setup: ["setup"],
    writer: ["acquire", "stage", "commit_loss", "commit_park"],
    recovery: ["acquire", "resume"],
    reader: ["read"],
    fault: ["clone", "mutate"],
  };
  process.on("message", async (message) => {
    const { commandId, command, args = {} } = message;
    if (handling || message.runId !== c.runId || message.nonce !== c.nonce) {
      active = false;
      emit(commandId, "protocol_error", {
        code: "COMMAND_BINDING_OR_CONCURRENCY",
      });
      return;
    }
    handling = true;
    try {
      if (command !== "close" && !allowed[c.role].includes(command))
        throw fail("ROLE_COMMAND");
      let value;
      if (command === "setup") {
        fs.mkdirSync(dir);
        physicalDirectory(dir, c.repo);
        createOwner();
        project = new Database(file);
        sql.bootstrap(project, fixture, binding);
        project.close();
        project = undefined;
        recordFiles();
        value = { syntheticBootstrap: true };
      } else if (command === "clone") {
        checkFiles(args.sourceUnit);
        fs.mkdirSync(dir);
        physicalDirectory(dir, c.repo);
        const source = new Database(
          confined(c.root, args.sourceUnit, "project.sqlite"),
          { readonly: true, fileMustExist: true },
        );
        try {
          await source.backup(file);
        } finally {
          source.close();
        }
        project = new Database(file, { fileMustExist: true });
        project
          .prepare("UPDATE fixture_meta SET unit=? WHERE id=1")
          .run(c.unit);
        project.close();
        project = undefined;
        createOwner();
        recordFiles();
        emit(commandId, "copy_created", {
          sourceUnit: args.sourceUnit,
          copyOnly: true,
          method: "SQLite backup API; new private binding",
        });
        value = { copyOnly: true };
      } else if (command === "mutate") {
        holdOwner();
        if (args.variant === "unreadable") sql.unreadableCopy(file);
        else {
          open();
          sql.mutate(project, args.variant);
          project.close();
          project = undefined;
        }
        emit(commandId, "copy_fault_injected", {
          variant: args.variant,
          controlledDataFault: true,
          notPowerLoss: true,
        });
        value = { injected: args.variant };
      } else if (command === "acquire") {
        if (project || owner) throw fail("CONNECTION_REUSE");
        holdOwner();
        emit(commandId, "barrier", {
          barrier: "owner_acquired_before_recovery",
          ownerInTransaction: true,
        });
        open();
        const observed = sql.read(project);
        emit(commandId, "sql_recovery_read", { ...observed, binding });
        if (!observed.healthy) throw fail("RECOVERY_UNAVAILABLE");
        const restored = validateCut(observed.cut, fixture, binding);
        emit(commandId, "restored", restored);
        capability = sql.fence(project, fixture, held);
        active = true;
        emit(commandId, "fence_committed", {
          capability,
          recoveredHead: restored.head,
        });
        value = { capability, restored };
      } else if (command === "read") {
        open(true);
        const observed = sql.read(project);
        emit(commandId, "sql_oracle", {
          ...observed,
          binding,
          independentReader: true,
          label: args.label,
          transaction: "one BEGIN-consistent read; explicit ROLLBACK",
          sqlite: "3.53.4",
        });
        value = { ...observed, binding };
        project.close();
        project = undefined;
      } else if (command === "stage") {
        held();
        if (!active) throw fail("WRITER_DISABLED");
        project.exec("BEGIN IMMEDIATE");
        guard();
        sql.writeBundle(
          project,
          fixture,
          capability,
          args.stop,
          (barrier) => {
            if (barrier !== "before_commit")
              emit(commandId, "barrier", {
                barrier,
                operationId: fixture.operationId,
                generation: fixture.generation,
                inTransaction: project.inTransaction,
              });
          },
          args.inject,
        );
        complete = !args.stop;
        if (complete) {
          sql.writeReceipt(project, fixture, capability);
          emit(commandId, "barrier", {
            barrier: "before_commit",
            operationId: fixture.operationId,
            generation: fixture.generation,
            inTransaction: true,
          });
        }
        value = {
          parked: true,
          complete,
          inTransaction: project.inTransaction,
          barrier: args.stop || "before_commit",
        };
      } else if (command === "commit_loss" || command === "commit_park") {
        if (!complete) throw fail("INCOMPLETE_BUNDLE");
        guard();
        project.exec("COMMIT");
        complete = false;
        if (command === "commit_loss") {
          emit(commandId, "controlled_post_success_response_loss", {
            sqliteCommitReturnedSuccess: true,
            realIOUncertainty: false,
            applicationOutcome: "unknown_simulated",
          });
          emit(
            commandId,
            "raw_simulated_error",
            errorRecord(fail("SIMULATED_POST_SUCCESS_RESULT_LOSS")),
          );
          value = {
            applicationOutcome: "unknown_simulated",
            settlement: settle(commandId),
          };
        } else {
          emit(commandId, "barrier", {
            barrier: "after_commit_before_ack",
            sqliteCommitReturnedSuccess: true,
            operationId: fixture.operationId,
            generation: fixture.generation,
            inTransaction: project.inTransaction,
          });
          value = { parked: true, barrier: "after_commit_before_ack" };
        }
      } else if (command === "resume") {
        if (!active) throw fail("WRITER_DISABLED");
        held();
        const observed = sql.read(project),
          decision = reconcile({
            ...args,
            cut: observed.cut,
            fixture,
            binding,
          });
        emit(commandId, "reconciliation", {
          decision,
          ...observed,
          binding,
          originalExecution: args.execution,
          settlement: args.settlement,
        });
        if (!observed.healthy) throw fail("RECOVERY_UNAVAILABLE");
        if (decision.status !== "committed")
          throw fail("RECONCILIATION_UNAVAILABLE");
        const candidate = args.event || {
          ...fixture.event,
          id: "E1-RECOVERY-ALIAS",
          receivedAt: "2026-10-11T00:00:00.000Z",
        };
        if (
          !["internal_duplicate", "stable_duplicate"].includes(
            compareClaim(fixture.event, candidate),
          )
        )
          throw fail("IDENTITY_CONFLICT");
        const core = require(confined(c.root, "fixture-module.cjs"));
        const applied = core.replayRestored(decision.restored.state, candidate);
        if (
          applied.status !== "duplicate" ||
          hash(applied.state) !== decision.restored.digest
        )
          throw fail("CORE_REPLAY_MISMATCH");
        emit(commandId, "replay_duplicate", {
          actualCore: true,
          result: applied.status,
          aliasRecorded: applied.state.acceptedEvents.some(
            (e) => e.id === candidate.id,
          ),
          businessCommitPerformed: false,
        });
        project.exec("BEGIN IMMEDIATE");
        try {
          guard();
        } finally {
          if (project.inTransaction) project.exec("ROLLBACK");
        }
        emit(commandId, "ack_eligible", {
          operationId: fixture.operationId,
          generation: fixture.generation,
          checkpoint: fixture.checkpoint,
          activeCapability: capability,
          ownerInTransaction: owner.inTransaction,
          sourceProtocol: "synthetic-complete-unit-v1",
          fixtureOnly: true,
        });
        value = { decision, capability, mayAckFixtureUnit: true };
      } else if (command === "close") {
        const settlement = settle(commandId);
        if (owner?.inTransaction) owner.exec("ROLLBACK");
        owner?.close();
        owner = undefined;
        emit(commandId, "owner_released", { afterDataSettlement: true });
        value = { settlement, ownerReleased: true };
      }
      emit(commandId, "done", { ok: true, value });
      if (command === "close") process.disconnect();
    } catch (error) {
      const during = {
        error: errorRecord(error),
        inTransaction: Boolean(project?.inTransaction),
        ownerInTransaction: Boolean(owner?.inTransaction),
        publication: false,
        ack: false,
      };
      emit(commandId, "error_before_settlement", during);
      let settlement;
      try {
        settlement = settle(commandId);
      } catch (cause) {
        active = false;
        emit(commandId, "settlement_failed", errorRecord(cause));
        settlement = {
          confirmed: false,
          ownerRetained: Boolean(owner?.inTransaction),
        };
      }
      emit(commandId, "done", { ok: false, error: during.error, settlement });
    } finally {
      handling = false;
    }
  });
  // No startup in-memory database: version is observed on the actual project connection later.
  emit("startup", "ready", {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    driver: "better-sqlite3@13.0.3",
  });
}
if (require.main === module)
  main().catch((error) => {
    console.error(JSON.stringify(errorRecord(error)));
    process.exitCode = 2;
  });
