import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as storage from "../src/development.mjs";
import { logicalBytes } from "../src/records.mjs";
import { cursor, input, seed, time } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const native = spec.validationMode === "--execute-plan-native-synthetic";
assert.equal(Boolean(spec.nativePackage), native);
const scope = { projectId: "PA", sourceId: "SRC", planId: "PLAN" };
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  applyPlanEvent: core.applyPlanEvent,
  validatePlan: core.validatePlan,
  planScope: scope,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
let roots = 0;

function syntheticRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  fs.writeFileSync(
    path.join(spec.evidence, "synthetic-root-" + ++roots + ".json"),
    JSON.stringify({ root, runId: spec.runId }),
    { flag: "wx" },
  );
  const cap = storage.admitSyntheticRoot({ enabled: true, root });
  return { root, cap };
}

function fixture(extra = {}) {
  assert.equal(typeof storage.openSyntheticPlanStore, "function");
  const { cap } = syntheticRoot();
  const store = storage.openSyntheticPlanStore(cap, {
    ...options,
    bootstrap: seed(),
    ...extra,
  });
  const binding = store.resourceBinding();
  assert.equal(
    binding.actualDriverHandleIdentity,
    native ? "main-confirmed-only" : "unavailable",
  );
  if (native) assert.ok(binding.nativeAttestation?.reports.project);
  return { cap, store, dbPath: store.paths().project };
}

function observation(id, sequence, steps, previous, extra = {}) {
  return {
    id,
    schemaVersion: 1,
    projectId: scope.projectId,
    sourceId: scope.sourceId,
    receivedAt: time,
    sourceSequence: sequence,
    sourceIdentity: {
      kind: "source_event",
      sourceId: scope.sourceId,
      sourceEventId: "plan:" + id,
    },
    type: previous === undefined ? "plan.detected" : "plan.updated",
    payload: {
      planId: scope.planId,
      provenance: "agent_reported",
      completeness: "complete",
      steps,
      ...(previous === undefined ? {} : { previousEventId: previous }),
      ...extra,
    },
  };
}

const primary = {
  title: "Implement",
  sourceItemId: "implement",
  sourcePhaseId: "delivery",
  certainty: "confirmed",
};
const secondary = {
  title: "Review",
  sourceItemId: "review",
  sourcePhaseId: "delivery",
  certainty: "tentative",
};
const first = observation("P1", 1, [primary, secondary], undefined, {
  phases: [{ sourcePhaseId: "delivery", title: "Delivery" }],
  sourceReference: { sourceId: "SRC", revision: "revision-a" },
});
const second = observation(
  "P2",
  2,
  [{ ...primary, title: "Implement and verify" }],
  "P1",
  { completeness: "partial", deletedSourceItemIds: ["review"] },
);
const third = observation(
  "P3",
  3,
  [{ ...primary, title: "Implement and verify" }, secondary],
  "P2",
);

function request(store, operationId, events, checkpoint) {
  return {
    operationId,
    operationNonce: "nonce:" + operationId,
    expectedHead: store.read().head,
    writer: store.writer(),
    events,
    ...(checkpoint ? { cursor: checkpoint } : {}),
  };
}

function sql(f, fn, readonly = true) {
  const db = new Database(f.dbPath, { readonly, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

test("plan store restores actual revision history and keeps a removed task separate from its re-entry", () => {
  const f = fixture();
  let initialIds, committed, retry;
  try {
    const initial = f.store.commit(request(f.store, "initial", [first]));
    const initialPlan = core.getPlanSnapshot(initial.plan, scope);
    assert.equal(initialPlan.status, "available");
    initialIds = initialPlan.snapshot.entries.map((entry) => entry.taskId);
    const status = input("E1");
    status.payload.taskId = initialIds[0];
    f.store.commit(request(f.store, "status", [status]));
    retry = request(
      f.store,
      "revision-batch",
      [second, third],
      cursor(["P2", "P3"]),
    );
    committed = f.store.commit(retry);
  } finally {
    f.store.close();
  }
  function unexpectedReplay() {
    throw new Error("UNEXPECTED_PROCESSOR_REPLAY");
  }
  const store = storage.openSyntheticPlanStore(f.cap, {
    ...options,
    applyNormalizedEvent: unexpectedReplay,
    applyPlanEvent: unexpectedReplay,
  });
  try {
    const restored = store.read();
    assert.equal(restored.head, 4);
    assert.deepEqual(restored.plan, committed.plan);
    assert.deepEqual(restored.state, restored.plan.core);
    assert.deepEqual(restored.cursor, [cursor(["P2", "P3"])]);
    const revisions = restored.plan.revisions;
    assert.deepEqual(
      revisions.map((r) => r.eventId),
      ["P1", "P2", "P3"],
    );
    assert.deepEqual(
      revisions[0].snapshot.entries.map((e) => e.title),
      ["Implement", "Review"],
    );
    assert.deepEqual(
      revisions[1].snapshot.entries.map((e) => e.title),
      ["Implement and verify"],
    );
    const current = core.getPlanSnapshot(restored.plan, scope);
    assert.equal(current.status, "available");
    assert.equal(current.snapshot.entries[0].taskId, initialIds[0]);
    assert.notEqual(current.snapshot.entries[1].taskId, initialIds[1]);
    const removed = core.getTaskHistory(restored.plan, scope, initialIds[1]);
    assert.equal(removed.status, "available");
    assert.equal(removed.current.status, "not_member");
    assert.ok(
      restored.state.assertions.some(
        (a) =>
          a.eventId === "E1" &&
          a.targetId === initialIds[0] &&
          a.value === "completed",
      ),
    );
    const repeated = store.commit({ ...retry, writer: store.writer() });
    assert.equal(repeated.status, "already_committed");
    assert.deepEqual(repeated.receipt, committed.receipt);
    assert.deepEqual(repeated.plan, restored.plan);
  } finally {
    store.close();
  }
});

test("plan store rolls back the event, revision, receipt and cursor together", () => {
  let fail = false;
  const f = fixture({
    testHooks: {
      afterRecords() {
        if (fail) throw new Error("FIXTURE_ROLLBACK");
      },
    },
  });
  try {
    const before = f.store.read();
    const candidate = request(f.store, "first-plan", [first], cursor(["P1"]));
    fail = true;
    assert.throws(() => f.store.commit(candidate), { code: "unavailable" });
    assert.deepEqual(f.store.read(), before);
    assert.deepEqual(
      sql(f, (db) =>
        db
          .prepare(
            "SELECT (SELECT count(*) FROM plan_versions) AS plans, (SELECT count(*) FROM normalized_events) AS events, (SELECT count(*) FROM commits) AS receipts, (SELECT count(*) FROM source_checkpoint_versions) AS cursors",
          )
          .get(),
      ),
      { plans: 0, events: 0, receipts: 1, cursors: 0 },
    );
    fail = false;
    const accepted = f.store.commit(candidate);
    assert.equal(accepted.head, 2);
    assert.deepEqual(
      accepted.plan.revisions.map((r) => r.eventId),
      ["P1"],
    );
  } finally {
    f.store.close();
  }
});

test("plan store refuses to open when recorded revision authority is missing", () => {
  const f = fixture();
  try {
    f.store.commit(request(f.store, "recorded-plan", [first], cursor(["P1"])));
  } finally {
    f.store.close();
  }
  sql(
    f,
    (db) => db.prepare("DELETE FROM plan_versions WHERE event_id=?").run("P1"),
    false,
  );
  const before = sql(f, (db) => db.prepare("SELECT * FROM store_meta").get());
  assert.throws(() => storage.openSyntheticPlanStore(f.cap, options).close(), {
    code: "unavailable",
  });
  assert.deepEqual(
    sql(f, (db) => db.prepare("SELECT * FROM store_meta").get()),
    before,
  );
});

test("plan store records a repeat without a new change and preserves an unresolved revision", () => {
  const f = fixture();
  const repeat = observation("P2", 2, [primary, secondary], "P1");
  const unresolved = observation("P3", 3, [primary], "WrongBase", {
    completeness: "partial",
  });
  try {
    f.store.commit(request(f.store, "initial", [first, repeat, unresolved]));
  } finally {
    f.store.close();
  }
  const store = storage.openSyntheticPlanStore(f.cap, options);
  try {
    const cut = store.read();
    assert.deepEqual(
      cut.plan.revisions.map(({ outcome }) => outcome),
      ["applied", "applied", "unknown"],
    );
    assert.deepEqual(
      cut.plan.changes.map(({ causedBy }) => causedBy),
      ["P1"],
    );
    const current = core.getPlanSnapshot(cut.plan, scope);
    assert.equal(current.status, "unknown");
    assert.equal(current.lastKnown.eventId, "P2");
    assert.ok(current.issues.includes("revision_base_mismatch"));
  } finally {
    store.close();
  }
});

test("plan store refuses an unapproved scope and unknown fields before writing", () => {
  const f = fixture();
  try {
    const before = f.store.read();
    for (const event of [
      { ...first, payload: { ...first.payload, planId: "OTHER" } },
      {
        ...first,
        payload: {
          ...first.payload,
          steps: [{ ...primary, rawPrompt: "PRIVATE_SENTINEL" }],
        },
      },
      {
        ...first,
        payload: {
          ...first.payload,
          sourceReference: { sourceId: "FOREIGN", revision: "revision-a" },
        },
      },
    ]) {
      assert.throws(
        () =>
          f.store.commit(request(f.store, "refused", [event], cursor(["P1"]))),
        { code: "admission_rejected", message: "admission_rejected" },
      );
    }
    assert.deepEqual(f.store.read(), before);
    f.store.commit(request(f.store, "admitted", [first]));
  } finally {
    f.store.close();
  }
  const before = sql(f, (db) => db.prepare("SELECT * FROM store_meta").get());
  assert.throws(() => storage.openSyntheticStore(f.cap, options).close(), {
    code: "unavailable",
  });
  assert.throws(
    () =>
      storage
        .openSyntheticPlanStore(f.cap, {
          ...options,
          planScope: { ...scope, planId: "OTHER" },
        })
        .close(),
    { code: "unavailable" },
  );
  assert.deepEqual(
    sql(f, (db) => db.prepare("SELECT * FROM store_meta").get()),
    before,
  );
});

test("plan store reuses a stable source alias without creating a second revision", () => {
  const f = fixture();
  try {
    const initial = f.store.commit(
      request(f.store, "initial", [first], cursor(["P1"])),
    );
    const alias = {
      ...first,
      id: "PAlias",
      receivedAt: "2026-10-20T00:00:00.000Z",
    };
    const next = f.store.commit(
      request(f.store, "alias", [alias], cursor(["P1"], "batch:2", "batch:1")),
    );
    assert.equal(next.head, 3);
    assert.deepEqual(next.plan, initial.plan);
    assert.equal(next.stateDigest, initial.stateDigest);
  } finally {
    f.store.close();
  }
  const store = storage.openSyntheticPlanStore(f.cap, options);
  try {
    const cut = store.read();
    assert.deepEqual(
      cut.plan.revisions.map(({ eventId }) => eventId),
      ["P1"],
    );
    assert.deepEqual(cut.cursor, [cursor(["P1"], "batch:2", "batch:1")]);
  } finally {
    store.close();
  }
});

test("a fresh process restores the same complete plan after the writer exits", () => {
  const { root } = syntheticRoot();
  const { nonce } = JSON.parse(
    fs.readFileSync(path.join(root, "synthetic-marker.json"), "utf8"),
  );
  function launch(mode, extra) {
    const evidence = path.join(spec.evidence, mode);
    fs.mkdirSync(evidence);
    const specFile = path.join(evidence, "spec.json");
    fs.writeFileSync(
      specFile,
      JSON.stringify({
        ...spec,
        mode,
        planScope: scope,
        root,
        nonce,
        evidence,
        ...extra,
      }),
      { flag: "wx" },
    );
    const script = fileURLToPath(
      new URL("./writer-process.mjs", import.meta.url),
    );
    const processRun = spawnSync(process.execPath, [script, specFile], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
    });
    const { pid, status, signal } = processRun;
    fs.writeFileSync(
      path.join(evidence, "process.json"),
      JSON.stringify({
        pid,
        status,
        signal,
        error: processRun.error?.code ?? null,
        stdout: processRun.stdout,
        stderr: processRun.stderr,
      }),
      { flag: "wx" },
    );
    assert.equal(status, 0, mode);
    assert.equal(signal, null);
    assert.equal(processRun.stderr, "");
    const report = JSON.parse(
      fs.readFileSync(path.join(evidence, "writer.result.json"), "utf8"),
    );
    assert.equal(report.pid, pid);
    assert.equal(report.closed, true);
    return {
      status,
      signal,
      closed: report.closed,
      result: report.result,
      dbPath: report.databaseFile,
    };
  }
  const writer = launch("write-plan", { planEvents: [first, second] });
  const recovered = launch("recover-plan", {
    writerSettlement: {
      status: writer.status,
      signal: writer.signal,
      closed: writer.closed,
    },
  });
  assert.equal(recovered.dbPath, writer.dbPath);
  assert.equal(recovered.result.epoch, 2);
  assert.equal(recovered.result.cut.head, 2);
  assert.equal(
    recovered.result.cut.stateDigest,
    writer.result.receipt.stateDigest,
  );
  assert.deepEqual(recovered.result.cut.plan, writer.result.plan);
  assert.deepEqual(recovered.result.cut.cursor, [cursor(["P1", "P2"])]);
  assert.deepEqual(
    sql(writer, (db) =>
      db
        .prepare("SELECT event_id FROM plan_versions ORDER BY seq,ordinal")
        .all(),
    ),
    [{ event_id: "P1" }, { event_id: "P2" }],
  );
});

for (const [label, corrupt] of [
  [
    "retains a removed task",
    (before, result) => {
      const old = before.heads[0].entries[1];
      const revision = result.state.revisions.at(-1);
      revision.snapshot.entries.push(old);
      revision.taskIds.push(old.taskId);
      result.state.core.phases
        .find((phase) => phase.id === old.phaseId)
        .taskIds.push(old.taskId);
      const change = result.state.changes.at(-1);
      change.changes = change.changes.filter(
        (item) => item.kind !== "task.removed",
      );
    },
  ],
  [
    "claims the wrong changed field",
    (_before, result) => {
      result.state.changes
        .at(-1)
        .changes.find((item) => item.kind === "task.changed").fields = [
        "certainty",
      ];
    },
  ],
  [
    "claims an unobserved sequence",
    (_before, result) => {
      result.state.revisions.at(-1).snapshot.lastSourceSequence = 99;
    },
  ],
]) {
  test("plan store rejects a processor output that " + label, () => {
    const f = fixture({
      applyPlanEvent(before, event) {
        const result = core.applyPlanEvent(before, event);
        if (event.id === "P2" && result.status === "applied")
          corrupt(before, result);
        return result;
      },
    });
    try {
      f.store.commit(request(f.store, "initial", [first]));
      const before = f.store.read();
      assert.throws(
        () =>
          f.store.commit(
            request(f.store, "bad-output", [second], cursor(["P2"])),
          ),
        { code: "admission_rejected" },
      );
      assert.deepEqual(f.store.read(), before);
    } finally {
      f.store.close();
    }
  });
}

test("plan store refuses an applied result with a conflicting observed base", () => {
  const f = fixture({
    applyPlanEvent(before, event) {
      if (event.id !== "P2") return core.applyPlanEvent(before, event);
      const result = core.applyPlanEvent(before, structuredClone(second));
      result.state.core.acceptedEvents.at(-1).payload.previousEventId =
        event.payload.previousEventId;
      return result;
    },
  });
  try {
    f.store.commit(request(f.store, "initial", [first]));
    const before = f.store.read();
    const wrongBase = {
      ...second,
      payload: { ...second.payload, previousEventId: "WrongBase" },
    };
    assert.throws(
      () => f.store.commit(request(f.store, "wrong-base", [wrongBase])),
      { code: "admission_rejected" },
    );
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});

test("plan store preserves generated IDs for the largest supported internal event ID", () => {
  const f = fixture();
  const event = { ...first, id: "P".repeat(256) };
  try {
    const cut = f.store.commit(request(f.store, "long-id", [event]));
    assert.equal(cut.plan.revisions[0].eventId, event.id);
    assert.equal(cut.plan.heads[0].entries.length, 2);
  } finally {
    f.store.close();
  }
  const store = storage.openSyntheticPlanStore(f.cap, options);
  try {
    assert.equal(store.read().plan.heads[0].entries[0].sourceEventId, event.id);
  } finally {
    store.close();
  }
});

test("plan store recovers a valid chain across an unresolved observation without sequence numbers", () => {
  const withoutSequence = ({ sourceSequence: _sequence, ...event }) => event;
  const earlier = withoutSequence(first);
  const unresolved = withoutSequence(
    observation(
      "P2",
      2,
      [{ ...primary, sourcePhaseId: "unknown-phase" }],
      "P1",
      { completeness: "partial" },
    ),
  );
  const resolved = withoutSequence(
    observation("P3", 3, [secondary, primary], "P2", {
      phases: [{ sourcePhaseId: "delivery", title: "Validated delivery" }],
      provenance: "observed",
    }),
  );
  const f = fixture();
  try {
    f.store.commit(
      request(f.store, "unsequenced-chain", [earlier, unresolved, resolved]),
    );
  } finally {
    f.store.close();
  }
  const store = storage.openSyntheticPlanStore(f.cap, options);
  try {
    const cut = store.read();
    assert.deepEqual(
      cut.plan.revisions.map(({ outcome }) => outcome),
      ["applied", "unknown", "applied"],
    );
    const current = core.getPlanSnapshot(cut.plan, scope);
    assert.equal(current.status, "available");
    assert.equal(current.snapshot.lastSourceSequence, undefined);
    assert.deepEqual(
      current.snapshot.entries.map(({ sourceItemId }) => sourceItemId),
      ["review", "implement"],
    );
    assert.equal(current.snapshot.phases[0].title, "Validated delivery");
    assert.equal(current.snapshot.phases[0].provenance, "observed");
    assert.deepEqual(
      cut.plan.changes.at(-1).changes.map(({ kind }) => kind),
      ["phase.changed", "tasks.reordered"],
    );
  } finally {
    store.close();
  }
});

test("plan store refuses an invented unresolved outcome for an applicable observation", () => {
  const f = fixture({
    applyPlanEvent(before, event) {
      const accepted = core.applyNormalizedEvent(before.core, event);
      const issues = ["revision_base_mismatch"];
      return {
        status: "unknown",
        issues,
        state: {
          ...before,
          core: accepted.state,
          revisions: [
            {
              eventId: event.id,
              scope,
              outcome: "unknown",
              issues,
              taskIds: [],
            },
          ],
        },
      };
    },
  });
  try {
    const before = f.store.read();
    assert.throws(
      () =>
        f.store.commit(
          request(f.store, "false-unknown", [first], cursor(["P1"])),
        ),
      { code: "admission_rejected" },
    );
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});

for (const startFirst of [true, false]) {
  test(
    "plan recovery uses session visibility at the observation, start first = " +
      startFirst,
    () => {
      const sessionId = "SESSION";
      const planScope = { ...scope, sessionId };
      const start = {
        ...input("S1"),
        sessionId,
        type: "session.started",
        payload: { sessionId },
      };
      const observation = { ...first, sessionId };
      const f = fixture({ planScope });
      try {
        f.store.commit(
          request(
            f.store,
            "session-plan",
            startFirst ? [start, observation] : [observation, start],
          ),
        );
      } finally {
        f.store.close();
      }
      const store = storage.openSyntheticPlanStore(f.cap, {
        ...options,
        planScope,
      });
      try {
        const cut = store.read();
        assert.equal(cut.state.sessions[0].id, sessionId);
        const revision = cut.plan.revisions[0];
        assert.equal(revision.outcome, startFirst ? "applied" : "unknown");
        assert.deepEqual(
          revision.issues,
          startFirst ? [] : ["session_scope_mismatch"],
        );
      } finally {
        store.close();
      }
    },
  );
}

test("plan store refuses a Session that appeared before its start observation", () => {
  const sessionId = "SESSION";
  const planScope = { ...scope, sessionId };
  const f = fixture({
    planScope,
    applyNormalizedEvent(before, event) {
      const result = core.applyNormalizedEvent(before, event);
      if (event.id === "E1" && result.status === "applied") {
        result.state.sessions = [
          ...result.state.sessions,
          {
            id: sessionId,
            sourceId: "SRC",
            sourceSessionId: null,
            projectAssociationAssertionIds: [],
          },
        ];
      }
      return result;
    },
  });
  const start = {
    ...input("S1"),
    sessionId,
    type: "session.started",
    payload: { sessionId },
  };
  try {
    const before = f.store.read();
    const candidate = request(f.store, "premature-session", [
      input("E1"),
      { ...first, sessionId },
      start,
    ]);
    assert.throws(() => f.store.commit(candidate), {
      code: "admission_rejected",
    });
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});

test("plan authority quota counts exact UTF-8 bytes with a streaming SQLite reader", () => {
  const f = fixture();
  try {
    const localized = {
      ...first,
      payload: {
        ...first.payload,
        phases: [{ sourcePhaseId: "delivery", title: "阶段 “甲” \\ 分支" }],
        steps: [{ ...primary, title: "校验变更" }, secondary],
      },
    };
    f.store.commit(request(f.store, "localized-plan", [localized]));
    sql(f, (db) => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT IN ('snapshots','store_meta')",
        )
        .all()
        .map(({ name }) => name);
      assert.ok(tables.includes("plan_versions"));
      const exact = tables.reduce((bytes, name) => {
        const rows = db.prepare("SELECT * FROM " + name).all();
        return bytes + Buffer.byteLength(JSON.stringify(rows), "utf8");
      }, 0);
      const iteratorOnly = {
        prepare(query) {
          const statement = db.prepare(query);
          return { iterate: () => statement.iterate() };
        },
      };
      assert.equal(logicalBytes(iteratorOnly, scope, exact), exact);
      assert.throws(() => logicalBytes(iteratorOnly, scope, exact - 1), {
        code: "quota_exceeded",
      });
      assert.equal(logicalBytes(iteratorOnly, scope, exact), exact);
    });
  } finally {
    f.store.close();
  }
});

for (const [barrier, statementPrefix] of [
  ["receipt", "INSERT INTO commits"],
  ["normalized observation", "INSERT INTO normalized_events"],
  ["plan version", "INSERT INTO plan_versions"],
  ["checkpoint", "INSERT INTO source_checkpoint_versions"],
  ["head update", "UPDATE store_meta SET head="],
]) {
  test(
    "plan transaction rolls back when the " +
      barrier +
      " write fails after SQLite applies it",
    () => {
      let armed = false;
      let injected = 0;
      class FaultDatabase extends Database {
        prepare(statement) {
          const sqlStatement = super.prepare(statement);
          if (!armed || !statement.startsWith(statementPrefix))
            return sqlStatement;
          return {
            run(...args) {
              sqlStatement.run(...args);
              armed = false;
              injected++;
              throw new Error("CONTROLLED_PLAN_WRITE_FAILURE");
            },
          };
        }
      }
      const f = fixture({ Database: FaultDatabase });
      try {
        const before = f.store.read();
        const checkpoint = cursor(["P1", "P2"]);
        const candidate = request(
          f.store,
          "plan-barrier",
          [first, second],
          checkpoint,
        );
        const readRows = () =>
          sql(f, (db) =>
            Object.fromEntries(
              [
                "store_meta",
                "commits",
                "normalized_events",
                "entity_versions",
                "assertions",
                "correction_versions",
                "conclusion_versions",
                "source_checkpoint_versions",
                "plan_versions",
              ].map((name) => [
                name,
                db.prepare("SELECT * FROM " + name + " ORDER BY rowid").all(),
              ]),
            ),
          );
        const originalRows = readRows();
        armed = true;
        assert.throws(() => f.store.commit(candidate), { code: "unavailable" });
        assert.equal(injected, 1);
        assert.deepEqual(f.store.read(), before);
        assert.deepEqual(readRows(), originalRows);
        assert.ok(
          f.store
            .evidence()
            .some(
              (record) =>
                record.phase === "rollback" && record.status === "returned",
            ),
        );
        const retry = f.store.commit(candidate);
        assert.equal(retry.head, 2);
        assert.deepEqual(
          retry.plan.revisions.map(({ eventId }) => eventId),
          ["P1", "P2"],
        );
        assert.deepEqual(retry.cursor, [checkpoint]);
      } finally {
        f.store.close();
      }
    },
  );
}

test("plan store refuses a database that lost its table constraints while retaining every recorded row", () => {
  const f = fixture();
  try {
    f.store.commit(request(f.store, "recorded", [first], cursor(["P1"])));
  } finally {
    f.store.close();
  }
  sql(
    f,
    (db) => {
      const records = db.prepare("SELECT * FROM plan_versions").all();
      db.exec(
        "BEGIN IMMEDIATE;" +
          "ALTER TABLE plan_versions RENAME TO prior_plan_versions;" +
          "CREATE TABLE plan_versions(event_id TEXT PRIMARY KEY,seq INTEGER NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL,UNIQUE(seq,ordinal)) STRICT;" +
          "INSERT INTO plan_versions SELECT * FROM prior_plan_versions;" +
          "DROP TABLE prior_plan_versions;" +
          "COMMIT;",
      );
      assert.deepEqual(
        db.prepare("SELECT * FROM plan_versions").all(),
        records,
      );
      assert.deepEqual(db.pragma("integrity_check"), [
        { integrity_check: "ok" },
      ]);
      assert.deepEqual(db.pragma("foreign_key_check"), []);
    },
    false,
  );
  const before = sql(f, (db) => db.prepare("SELECT * FROM store_meta").get());
  assert.throws(() => storage.openSyntheticPlanStore(f.cap, options).close(), {
    code: "unavailable",
  });
  assert.deepEqual(
    sql(f, (db) => db.prepare("SELECT * FROM store_meta").get()),
    before,
  );
});
