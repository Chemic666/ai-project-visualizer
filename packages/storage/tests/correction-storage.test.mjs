import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, encode } from "../src/codec.mjs";
import * as storage from "../src/development.mjs";
import { cursor, seed, time } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const native = spec.validationMode === "--execute-correction-native-synthetic";
assert.equal(Boolean(spec.nativePackage), native);
const scope = {
  projectId: "PA",
  sourceId: "SRC",
  planId: "PLAN",
  sessionId: "S1",
};
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  applyPlanEvent: core.applyPlanEvent,
  validatePlan: core.validatePlan,
  prepareUserCorrection: core.prepareUserCorrection,
  prepareCorrectionExpiry: core.prepareCorrectionExpiry,
  planScope: scope,
  processorFingerprint: spec.processorFingerprint,
  projectId: scope.projectId,
  generation: "G1",
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
const noReplay = () => {
  throw new Error("UNEXPECTED_SOURCE_REPLAY");
};
const restartOptions = {
  ...options,
  applyNormalizedEvent: noReplay,
  applyPlanEvent: noReplay,
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

function freshSeed() {
  const bootstrap = seed();
  bootstrap.tasks[0].weightAssertionIds = [];
  return {
    ...bootstrap,
    assertions: [],
    corrections: [],
    resolvedConclusions: [],
  };
}

function fixture(extra = {}) {
  const { cap } = syntheticRoot();
  const bootstrap = freshSeed();
  const store = storage.openSyntheticCorrectionStore(cap, {
    ...options,
    bootstrap,
    ...extra,
  });
  const binding = store.resourceBinding();
  assert.equal(
    binding.actualDriverHandleIdentity,
    native ? "main-confirmed-only" : "unavailable",
  );
  if (native) assert.ok(binding.nativeAttestation?.reports.project);
  return { cap, store, bootstrap, dbPath: store.paths().project };
}

function event(id, type, at, payload) {
  return {
    id,
    schemaVersion: 1,
    projectId: scope.projectId,
    sourceId: scope.sourceId,
    sessionId: scope.sessionId,
    receivedAt: at,
    type,
    payload,
  };
}
const at = (hour) => time.replace("T00:", "T0" + hour + ":");
const started = event("S-start", "session.started", at(0), { sessionId: "S1" });
const ended = event("S-end", "session.ended", at(6), { sessionId: "S1" });
const first = event("P1", "plan.detected", at(1), {
  planId: "PLAN",
  provenance: "agent_reported",
  completeness: "complete",
  steps: [
    { title: "Build", sourceItemId: "build" },
    { title: "Review", sourceItemId: "review" },
  ],
});
const removal = event("P2", "plan.updated", at(4), {
  planId: "PLAN",
  provenance: "agent_reported",
  completeness: "partial",
  previousEventId: first.id,
  steps: [],
  deletedSourceItemIds: ["review"],
});
const reentry = event("P3", "plan.updated", at(5), {
  planId: "PLAN",
  provenance: "agent_reported",
  completeness: "partial",
  previousEventId: removal.id,
  steps: [first.payload.steps[1]],
});

function operation(store, id) {
  return {
    operationId: id,
    operationNonce: "nonce:" + id,
    expectedHead: store.read().head,
    writer: store.writer(),
  };
}
function initialize(store) {
  const { plan } = store.commit({
    ...operation(store, "init"),
    events: [started, first],
    cursor: cursor([started.id, first.id]),
  });
  const current = core.getPlanSnapshot(plan, scope);
  assert.equal(current.status, "available", JSON.stringify(plan.revisions));
  return current.snapshot.entries[1].taskId;
}
function weight(id, taskId, value, hour = 2) {
  return {
    id,
    scope: { kind: "task_weight", projectId: "PA", sessionId: "S1", taskId },
    effectiveAt: at(hour),
    assertion: {
      id: "a:" + id,
      sourceId: "USER",
      observedAt: at(hour),
      target: "task.weight",
      targetId: taskId,
      value,
      provenance: "user_confirmed",
    },
  };
}
function selection(taskId) {
  const c = weight("select", taskId, 1, 3);
  return {
    ...c,
    scope: { kind: "current_task", projectId: "PA", sessionId: "S1" },
    assertion: {
      ...c.assertion,
      target: "project.currentTask",
      targetId: "PA",
      value: taskId,
    },
  };
}
function correct(store, id, correction) {
  return store.commit({ ...operation(store, id), correction });
}
function rows(f, table) {
  const db = new Database(f.dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  } finally {
    db.close();
  }
}

test("user changes survive reopen with original assertions, supersession and source expiry", () => {
  const f = fixture();
  const taskId = initialize(f.store);
  const initial = f.store.read();
  const w1 = weight("W1", taskId, 2);
  const firstCorrection = correct(f.store, "set-weight", w1);
  assert.deepEqual(
    firstCorrection.plan,
    core.applyUserCorrection(initial.plan, scope, w1).state,
  );
  const w2 = {
    ...weight("W2", taskId, 5, 3),
    supersedes: w1.id,
    originalAssertionId: w1.assertion.id,
  };
  const replacement = correct(f.store, "replace-weight", w2);
  assert.equal(replacement.cursor[0].position, "batch:1");
  const s1 = selection(taskId);
  const selected = correct(f.store, "select-task", s1);
  assert.equal(f.store.close().status, "closed");
  const restored = storage.openSyntheticCorrectionStore(f.cap, options);
  try {
    assert.deepEqual(restored.read().plan, selected.plan);
    const selectedTask = core.getUserCorrectedCurrentTask(
      restored.read().state,
      "PA",
      "S1",
    );
    assert.equal(selectedTask.taskId, taskId);
    assert.equal(selectedTask.provenance, "user_confirmed");
    const reduced = restored.commit({
      ...operation(restored, "change-plan"),
      events: [removal, reentry],
      cursor: cursor([removal.id, reentry.id], "batch:2", "batch:1"),
    });
    const current = core.getPlanSnapshot(reduced.plan, scope).snapshot;
    assert.notEqual(current.entries[1].taskId, taskId);
    assert.deepEqual(
      reduced.state.corrections.map((r) => r.lifecycle),
      [
        {
          status: "superseded",
          supersededBy: "W2",
          supersededAt: at(3),
          reasonCode: "user_replaced",
          ruleId: "core.correction.lifecycle",
          ruleVersion: "1",
        },
        {
          status: "expired",
          triggeringEventId: removal.id,
          expiredAt: removal.receivedAt,
          reasonCode: "task_removed",
          ruleId: "core.correction.lifecycle",
          ruleVersion: "1",
        },
        { status: "active" },
      ],
    );
    assert.deepEqual(
      reduced.state.assertions.filter(
        (a) => a.sourceId === "USER" && a.targetId === taskId,
      ),
      [w1.assertion, w2.assertion],
    );
    const closedSession = restored.commit({
      ...operation(restored, "close-session"),
      events: [ended],
    });
    assert.equal(
      closedSession.state.corrections[2].lifecycle.reasonCode,
      "session_ended",
    );
    assert.equal(
      closedSession.state.corrections[2].lifecycle.triggeringEventId,
      ended.id,
    );
    assert.equal(
      core.getUserCorrectedCurrentTask(closedSession.state, "PA", "S1").status,
      "unknown",
    );
    assert.deepEqual(restored.read().plan, closedSession.plan);
  } finally {
    restored.close();
  }
  const reopened = storage.openSyntheticCorrectionStore(f.cap, restartOptions);
  try {
    assert.equal(reopened.read().head, 7);
    assert.equal(
      reopened.read().state.corrections[1].originalAssertionId,
      w1.assertion.id,
    );
    assert.equal(reopened.read().cursor[0].position, "batch:2");
  } finally {
    reopened.close();
  }
});

test("manual receipt retries preserve the original receipt and cannot carry source intake", () => {
  const f = fixture();
  try {
    const taskId = initialize(f.store);
    const request = {
      ...operation(f.store, "correction"),
      correction: weight("W1", taskId, 2),
    };
    const first = f.store.commit(request);
    const retry = f.store.commit(request);
    assert.equal(retry.status, "already_committed");
    assert.deepEqual(retry.receipt, first.receipt);
    assert.throws(
      () => f.store.commit({ ...request, correction: weight("W1", taskId, 9) }),
      { code: "identity_conflict" },
    );
    for (const extra of [
      { cursor: cursor([started.id]) },
      { events: [ended] },
    ]) {
      assert.throws(
        () =>
          f.store.commit({
            ...operation(f.store, "mixed"),
            correction: weight("W2", taskId, 3),
            ...extra,
          }),
        { code: "admission_rejected" },
      );
    }
    const invalid = weight("W2", taskId, 3);
    invalid.assertion.provenance = "agent_reported";
    assert.throws(() => correct(f.store, "bad", invalid), {
      code: "admission_rejected",
    });
    assert.equal(f.store.read().head, first.head);
    assert.deepEqual(f.store.read().plan, first.plan);
    assert.equal(rows(f, "source_checkpoint_versions").length, 1);
  } finally {
    f.store.close();
  }
});

test("manual and source changes leave the same history after a failure before COMMIT", () => {
  let fail = false;
  const f = fixture({
    testHooks: {
      afterRecords() {
        if (fail) throw new Error("CONTROLLED_FAILURE_BEFORE_COMMIT");
      },
    },
  });
  const tables = [
    "assertions",
    "correction_versions",
    "commits",
    "normalized_events",
    "plan_versions",
    "source_checkpoint_versions",
    "store_meta",
  ];
  function checkRollback(request) {
    const before = f.store.read();
    const saved = tables.map((table) => rows(f, table));
    fail = true;
    assert.throws(() => f.store.commit(request), { code: "unavailable" });
    assert.deepEqual(f.store.read(), before);
    assert.deepEqual(
      tables.map((table) => rows(f, table)),
      saved,
    );
    fail = false;
    return f.store.commit(request);
  }
  try {
    const taskId = initialize(f.store);
    const corrected = checkRollback({
      ...operation(f.store, "manual"),
      correction: weight("W1", taskId, 2),
    });
    assert.equal(corrected.state.corrections[0].lifecycle.status, "active");
    const expired = checkRollback({
      ...operation(f.store, "remove"),
      events: [removal],
      cursor: cursor([removal.id], "batch:2", "batch:1"),
    });
    assert.equal(expired.state.corrections[0].lifecycle.status, "expired");
    assert.equal(expired.cursor[0].position, "batch:2");
  } finally {
    f.store.close();
  }
});

test("bootstrap and source events cannot introduce untracked manual authority", () => {
  const { cap, root } = syntheticRoot();
  const untrackedSeed = { ...seed(), corrections: [], resolvedConclusions: [] };
  assert.throws(
    () =>
      storage.openSyntheticCorrectionStore(cap, {
        ...options,
        bootstrap: untrackedSeed,
      }),
    { code: "admission_rejected" },
  );
  assert.deepEqual(fs.readdirSync(path.join(root, "private")), []);

  const f = fixture({
    applyNormalizedEvent(state, input) {
      const applied = core.applyNormalizedEvent(state, input);
      if (input.id !== ended.id) return applied;
      const project = applied.state.projects[0];
      const taskId = applied.state.tasks.find(
        (task) => task.title === "Review",
      ).id;
      const { assertion } = selection(taskId);
      return {
        ...applied,
        state: {
          ...applied.state,
          projects: [{ ...project, currentTaskAssertionIds: [assertion.id] }],
          assertions: [...applied.state.assertions, assertion],
        },
      };
    },
  });
  try {
    initialize(f.store);
    const before = f.store.read();
    assert.throws(
      () =>
        f.store.commit({
          ...operation(f.store, "bad-source"),
          events: [ended],
        }),
      { code: "admission_rejected" },
    );
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});

test("recovery rejects a falsely active correction even with matching digests", () => {
  const f = fixture();
  let plan, head;
  try {
    const taskId = initialize(f.store);
    const active = correct(f.store, "manual", weight("W1", taskId, 2));
    const expired = f.store.commit({
      ...operation(f.store, "remove"),
      events: [removal],
    });
    assert.equal(expired.state.corrections[0].lifecycle.status, "expired");
    head = expired.head;
    plan = expired.plan;
    plan.core.corrections[0] = active.state.corrections[0];
  } finally {
    f.store.close();
  }

  // A coherent checksum is not evidence that the retained lifecycle obeys
  // the admitted source observation. Only this owned synthetic DB is altered.
  const forged = plan.core.corrections[0];
  const stateDigest = digest(plan);
  const db = new Database(f.dbPath, { fileMustExist: true });
  try {
    const receipt = JSON.parse(
      db.prepare("SELECT result_json FROM commits WHERE seq=?").get(head)
        .result_json,
    );
    receipt.stateDigest = stateDigest;
    db.transaction(() => {
      db.prepare(
        "UPDATE correction_versions SET body=?,body_digest=? WHERE seq=? AND id=?",
      ).run(encode(forged), digest(forged), head, forged.id);
      db.prepare(
        "UPDATE commits SET state_digest=?,result_json=?,result_digest=? WHERE seq=?",
      ).run(stateDigest, encode(receipt), digest(receipt), head);
      db.prepare("UPDATE store_meta SET state_digest=?").run(stateDigest);
    })();
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
  const control = rows(f, "store_meta");
  assert.throws(
    () => storage.openSyntheticCorrectionStore(f.cap, restartOptions),
    { code: "unavailable" },
  );
  assert.deepEqual(rows(f, "store_meta"), control);
});

test("a new process recovers the original manual correction after the writer exits", () => {
  const { root } = syntheticRoot();
  const { nonce } = JSON.parse(
    fs.readFileSync(path.join(root, "synthetic-marker.json"), "utf8"),
  );
  const bootstrap = freshSeed();
  const sourceCore = core.applyNormalizedEvent(bootstrap, started).state;
  const expectedPlan = core.applyPlanEvent(
    core.createPlanEngineState(sourceCore),
    first,
  ).state;
  const chosen = selection(expectedPlan.heads[0].entries[1].taskId);
  function launch(mode, extra) {
    const evidence = path.join(spec.evidence, mode);
    fs.mkdirSync(evidence);
    const specFile = path.join(evidence, "spec.json");
    fs.writeFileSync(
      specFile,
      JSON.stringify({
        ...spec,
        root,
        nonce,
        mode,
        evidence,
        planScope: scope,
        ...extra,
      }),
      { flag: "wx" },
    );
    const script = fileURLToPath(
      new URL("./writer-process.mjs", import.meta.url),
    );
    const { pid, status, signal, stdout, stderr } = spawnSync(
      process.execPath,
      [script, specFile],
      { encoding: "utf8", windowsHide: true, timeout: 20000 },
    );
    fs.writeFileSync(
      path.join(evidence, "process.json"),
      JSON.stringify({ pid, status, signal, stdout, stderr }),
      { flag: "wx" },
    );
    assert.equal(status, 0, stderr);
    assert.equal(signal, null);
    const report = JSON.parse(
      fs.readFileSync(path.join(evidence, "writer.result.json"), "utf8"),
    );
    assert.equal(report.pid, pid);
    assert.equal(report.closed, true);
    return { ...report, status, signal };
  }
  const writer = launch("write-correction", {
    bootstrap,
    planEvents: [started, first],
    correction: chosen,
  });
  const reader = launch("recover-correction", {
    writerSettlement: {
      pid: writer.pid,
      status: writer.status,
      signal: writer.signal,
      closed: writer.closed,
    },
  });
  assert.notEqual(reader.pid, writer.pid);
  assert.equal(reader.databaseFile, writer.databaseFile);
  assert.equal(reader.result.epoch, 2);
  assert.equal(reader.result.cut.head, 3);
  assert.equal(
    reader.result.cut.stateDigest,
    writer.result.receipt.stateDigest,
  );
  assert.deepEqual(reader.result.cut.plan, writer.result.plan);
  assert.deepEqual(reader.result.cut.cursor, [cursor([started.id, first.id])]);
  const projected = core.getUserCorrectedCurrentTask(
    reader.result.cut.state,
    "PA",
    "S1",
  );
  assert.equal(projected.status, "available");
  assert.deepEqual(projected.assertion, chosen.assertion);
});

test("plan and correction entries refuse one another's stored version", () => {
  const f = fixture();
  initialize(f.store);
  f.store.close();
  const meta = rows(f, "store_meta");
  assert.throws(() => storage.openSyntheticPlanStore(f.cap, options), {
    code: "unavailable",
  });
  assert.deepEqual(rows(f, "store_meta"), meta);
  const { cap } = syntheticRoot();
  const plan = storage.openSyntheticPlanStore(cap, {
    ...options,
    bootstrap: freshSeed(),
  });
  initialize(plan);
  const planFixture = { dbPath: plan.paths().project };
  plan.close();
  const prior = rows(planFixture, "store_meta");
  assert.throws(
    () => storage.openSyntheticCorrectionStore(cap, restartOptions),
    { code: "unavailable" },
  );
  assert.deepEqual(rows(planFixture, "store_meta"), prior);
});
