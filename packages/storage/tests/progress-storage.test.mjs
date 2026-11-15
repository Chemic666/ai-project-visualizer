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
import { cursor, time, seed } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const native = spec.validationMode === "--execute-progress-native-synthetic";
assert.equal(Boolean(spec.nativePackage), native);
const scope = { projectId: "PA", sourceId: "SRC", planId: "PLAN" };
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  applyPlanEvent: core.applyPlanEvent,
  validatePlan: core.validatePlan,
  prepareUserCorrection: core.prepareUserCorrection,
  prepareCorrectionExpiry: core.prepareCorrectionExpiry,
  updateProgress: core.updateProgress,
  planScope: scope,
  processorFingerprint: spec.processorFingerprint,
  projectId: scope.projectId,
  generation: "G1",
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
const unexpectedReplay = () => {
  throw new Error("UNEXPECTED_SOURCE_REPLAY");
};
const reopen = {
  ...options,
  planScope: { planId: "PLAN", sourceId: "SRC", projectId: "PA" },
  applyNormalizedEvent: unexpectedReplay,
  applyPlanEvent: unexpectedReplay,
};
const bootstrap = {
  ...seed(),
  phases: [],
  tasks: [],
  assertions: [],
  corrections: [],
  resolvedConclusions: [],
};
bootstrap.projects[0].phaseIds = [];
let roots = 0;

function rootFixture() {
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
  const { cap } = rootFixture();
  const store = storage.openSyntheticProgressStore(cap, {
    ...options,
    bootstrap,
    ...extra,
  });
  assert.equal(
    store.resourceBinding().actualDriverHandleIdentity,
    native ? "main-confirmed-only" : "unavailable",
  );
  return { cap, store, dbPath: store.paths().project };
}
function event(id, type, payload) {
  return {
    id,
    type,
    payload,
    receivedAt: time,
    projectId: "PA",
    sourceId: "SRC",
    schemaVersion: 1,
    sourceIdentity: {
      kind: "source_event",
      sourceId: "SRC",
      sourceEventId: "source:" + id,
    },
  };
}
const first = event("P1", "plan.detected", {
  planId: "PLAN",
  completeness: "complete",
  provenance: "agent_reported",
  steps: [
    { title: "Build", sourceItemId: "build", certainty: "confirmed" },
    { title: "Review", sourceItemId: "review", certainty: "confirmed" },
  ],
});
function weight(taskId, id, value) {
  return {
    id,
    scope: { kind: "task_weight", projectId: "PA", taskId },
    effectiveAt: time,
    assertion: {
      id: "a:" + id,
      sourceId: "USER",
      observedAt: time,
      target: "task.weight",
      targetId: taskId,
      value,
      provenance: "user_confirmed",
    },
  };
}
function request(store, id, update) {
  return {
    operationId: id,
    operationNonce: "nonce:" + id,
    writer: store.writer(),
    expectedHead: store.read().head,
    ...update,
  };
}
function commit(store, id, update) {
  return store.commit(request(store, id, update));
}
function initialize(store) {
  const cut = commit(store, "plan", {
    events: [first],
    cursor: cursor([first.id]),
  });
  return cut.plan.heads[0].entries.map((entry) => entry.taskId);
}
const latest = (cut) => cut.progress.snapshots.at(-1).result;
function query(f, fn, readonly = true) {
  const db = new Database(f.dbPath, { readonly, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

test("reopening keeps changes to confirmed progress and the original basis for each result", () => {
  const f = fixture();
  let final, original;
  try {
    assert.equal(latest(f.store.read()).status, "unavailable");
    assert.deepEqual(latest(f.store.read()).issues, [{ code: "plan_unknown" }]);
    const [build, review] = initialize(f.store);
    const unweighted = latest(f.store.read());
    assert.equal(unweighted.status, "unavailable");
    assert.equal("ratio" in unweighted, false);
    assert.deepEqual(
      unweighted.issues
        .filter((i) => i.code === "weight_unknown")
        .map((i) => i.taskId),
      [build, review],
    );
    commit(f.store, "build-weight", { correction: weight(build, "W1", 3) });
    assert.equal(latest(f.store.read()).status, "unavailable");
    commit(f.store, "review-weight", { correction: weight(review, "W2", 2) });
    const complete = event("E1", "task.status_reported", {
      taskId: build,
      status: "completed",
    });
    original = commit(f.store, "done", {
      events: [complete],
      cursor: cursor([complete.id], "batch:2", "batch:1"),
    });
    assert.equal(latest(original).ratio, 0.6);
    assert.equal(latest(original).completedWeight, 3);
    const basis = latest(original).tasks.find((t) => t.entry.taskId === build);
    assert.equal(basis.statusAssertions[0].eventId, complete.id);
    assert.equal(basis.statusAssertions[0].provenance, "agent_reported");
    const replaced = commit(f.store, "manual-replace", {
      correction: {
        ...weight(review, "W3", 3),
        supersedes: "W2",
        originalAssertionId: "a:W2",
      },
    });
    const change = replaced.progress.changes.at(-1);
    assert.equal(change.previous.ratio, 0.6);
    assert.equal(change.current.ratio, 0.5);
    assert.deepEqual(change.reasons, ["weight_corrected"]);
    assert.deepEqual(replaced.cursor, original.cursor);
    assert.deepEqual(
      latest(replaced),
      core.calculateProgress(replaced.plan, scope),
    );
    final = commit(f.store, "checkpoint-only", {
      events: [],
      cursor: cursor([complete.id], "batch:3", "batch:2"),
    });
    assert.deepEqual(final.progress, replaced.progress);
    assert.equal(final.stateDigest, replaced.stateDigest);
  } finally {
    f.store.close();
  }
  const restored = storage.openSyntheticProgressStore(f.cap, reopen);
  try {
    const cut = restored.read();
    assert.deepEqual(cut.progress, final.progress);
    assert.equal(cut.stateDigest, final.stateDigest);
    assert.deepEqual(cut.cursor, final.cursor);
    const basis = cut.progress.snapshots.find(
      ({ result }) => result.status === "available" && result.ratio === 0.6,
    );
    assert.deepEqual(basis.result, latest(original));
    assert.equal(
      basis.correctionHistory.find((c) => c.id === "W2").lifecycle.status,
      "active",
    );
    assert.equal(
      cut.progress.snapshots.at(-1).correctionHistory.find((c) => c.id === "W2")
        .lifecycle.status,
      "superseded",
    );
  } finally {
    restored.close();
  }
});

test("a removal and re-entry in one source batch leave one unavailable result with retained history", () => {
  const f = fixture();
  try {
    const [build, review] = initialize(f.store);
    commit(f.store, "w1", { correction: weight(build, "W1", 3) });
    commit(f.store, "w2", { correction: weight(review, "W2", 2) });
    const complete = event("E1", "task.status_reported", {
      taskId: build,
      status: "completed",
    });
    const before = commit(f.store, "complete", { events: [complete] });
    assert.equal(latest(before).ratio, 0.6);
    const remove = event("P2", "plan.updated", {
      ...first.payload,
      previousEventId: first.id,
      steps: [first.payload.steps[1]],
    });
    const add = event("P3", "plan.updated", {
      ...first.payload,
      previousEventId: remove.id,
    });
    const cut = commit(f.store, "one-batch", { events: [remove, add] });
    const newBuild = cut.plan.heads[0].entries[0].taskId;
    assert.notEqual(newBuild, build);
    assert.equal(
      cut.progress.changes.length,
      before.progress.changes.length + 1,
    );
    assert.equal(latest(cut).status, "unavailable");
    assert.ok(
      latest(cut).issues.some(
        (issue) => issue.code === "weight_unknown" && issue.taskId === newBuild,
      ),
    );
    const change = cut.progress.changes.at(-1);
    assert.equal(change.previous.ratio, 0.6);
    assert.equal(
      cut.progress.snapshots.at(-1).correctionHistory.find((r) => r.id === "W1")
        .lifecycle.triggeringEventId,
      remove.id,
    );
    assert.deepEqual(f.store.read().progress, cut.progress);
  } finally {
    f.store.close();
  }
});

test("progress records, receipts and the checkpoint roll back together", () => {
  let fail = false;
  const f = fixture({
    testHooks: {
      afterRecords() {
        if (fail) throw new Error("CONTROLLED_PRE_COMMIT");
      },
    },
  });
  const scan = () =>
    query(f, (db) =>
      [
        "progress_versions",
        "plan_versions",
        "normalized_events",
        "source_checkpoint_versions",
        "commits",
        "store_meta",
      ].map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()),
    );
  try {
    const before = f.store.read(),
      oldRows = scan();
    const r = request(f.store, "plan", {
      events: [first],
      cursor: cursor([first.id]),
    });
    fail = true;
    assert.throws(() => f.store.commit(r), { code: "unavailable" });
    assert.deepEqual(f.store.read(), before);
    assert.deepEqual(scan(), oldRows);
    fail = false;
    assert.equal(f.store.commit(r).progress.changes.length, 2);
    assert.deepEqual(f.store.commit(r).cursor, [cursor([first.id])]);
    assert.equal(scan()[0].length, 2);
  } finally {
    f.store.close();
  }
});

test("missing progress authority refuses recovery without rebuilding the cut", () => {
  const f = fixture();
  initialize(f.store);
  const head = f.store.read().head;
  f.store.close();
  query(
    f,
    (db) => db.prepare("DELETE FROM progress_versions WHERE seq=?").run(head),
    false,
  );
  const control = () =>
    query(f, (db) => db.prepare("SELECT * FROM store_meta").get());
  const before = control();
  assert.throws(() => storage.openSyntheticProgressStore(f.cap, reopen), {
    code: "unavailable",
  });
  assert.deepEqual(control(), before);
});

test("source processors cannot invent new weights or completion evidence", () => {
  const f = fixture({
    applyNormalizedEvent(state, event) {
      const result = core.applyNormalizedEvent(state, event);
      const task = result.state.tasks[0];
      const a = {
        id: "unobserved-weight",
        target: "task.weight",
        targetId: task.id,
        value: 55,
        sourceId: "SRC",
        provenance: "observed",
        observedAt: time,
        sourceReference: { sourceId: "SRC", reference: "missing-weight-claim" },
      };
      const b = {
        ...a,
        id: "unobserved-status",
        target: "task.status",
        value: "completed",
      };
      const injected = event.id === "E-weight" ? a : b;
      if (event.id === "E-weight") task.weightAssertionIds.push(a.id);
      else task.statusAssertionIds.push(b.id);
      result.state.assertions.push(injected);
      return result;
    },
  });
  try {
    initialize(f.store);
    const before = f.store.read();
    for (const id of ["E-weight", "E-status"]) {
      const observation = event(id, "session.started", { sessionId: id });
      assert.throws(
        () =>
          commit(f.store, id, {
            events: [observation],
            cursor: cursor([id], "batch:2", "batch:1"),
          }),
        { code: "admission_rejected" },
      );
      assert.deepEqual(f.store.read(), before);
    }
  } finally {
    f.store.close();
  }
});

test("a false change reason is refused even with recomputed digests", () => {
  const f = fixture();
  let cut;
  try {
    initialize(f.store);
    cut = f.store.read();
  } finally {
    f.store.close();
  }
  const { plan, progress, head } = cut;
  progress.changes.at(-1).reasons = ["plan_reduced"];
  const stateDigest = digest({ plan, progress });
  query(
    f,
    (db) => {
      const raw = JSON.parse(
        db.prepare("SELECT body FROM progress_versions WHERE seq=?").get(head)
          .body,
      );
      raw.change.reasons = progress.changes.at(-1).reasons;
      const receipt = JSON.parse(
        db.prepare("SELECT result_json FROM commits WHERE seq=?").get(head)
          .result_json,
      );
      receipt.stateDigest = stateDigest;
      db.transaction(() => {
        db.prepare(
          "UPDATE progress_versions SET body=?,body_digest=? WHERE seq=?",
        ).run(encode(raw), digest(raw), head);
        db.prepare(
          "UPDATE commits SET result_json=?,result_digest=?,state_digest=? WHERE seq=?",
        ).run(encode(receipt), digest(receipt), stateDigest, head);
        db.prepare("UPDATE store_meta SET state_digest=?").run(stateDigest);
      })();
      assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
      assert.deepEqual(db.pragma("foreign_key_check"), []);
    },
    false,
  );
  assert.throws(() => storage.openSyntheticProgressStore(f.cap, reopen), {
    code: "unavailable",
  });
});

test("an unsupported progress output cannot persist raw fields", () => {
  const f = fixture({
    updateProgress(before, plan, planScope) {
      const outcome = core.updateProgress(before, plan, planScope);
      if (plan.heads.length > 0)
        outcome.result.rawOutput = "SYNTHETIC_PRIVATE_PROGRESS_SENTINEL";
      return outcome;
    },
  });
  try {
    const before = f.store.read();
    assert.throws(() => initialize(f.store), { code: "admission_rejected" });
    assert.deepEqual(f.store.read(), before);
    assert.equal(
      query(
        f,
        (db) =>
          db.prepare("SELECT count(*) AS n FROM progress_versions").get().n,
      ),
      1,
    );
    assert.equal(
      JSON.stringify(f.store.evidence()).includes(
        "SYNTHETIC_PRIVATE_PROGRESS_SENTINEL",
      ),
      false,
    );
  } finally {
    f.store.close();
  }
});

test("new writer and reader processes settle independently and agree on the recorded progress", () => {
  const { root } = rootFixture();
  const { nonce } = JSON.parse(
    fs.readFileSync(path.join(root, "synthetic-marker.json"), "utf8"),
  );
  const planEvent = event("a", "plan.detected", {
    ...first.payload,
    steps: [first.payload.steps[0]],
  });
  const plan = core.applyPlanEvent(
    core.createPlanEngineState(bootstrap),
    planEvent,
  ).state;
  const taskId = plan.heads[0].entries[0].taskId;
  const complete = event("A", "task.status_reported", {
    taskId,
    status: "completed",
  });
  function launch(mode, extra) {
    const evidence = path.join(spec.evidence, mode);
    fs.mkdirSync(evidence);
    const specFile = path.join(evidence, "spec.json");
    fs.writeFileSync(
      specFile,
      JSON.stringify({
        ...spec,
        mode,
        evidence,
        root,
        nonce,
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
  const writer = launch("write-progress", {
    bootstrap,
    planEvents: [planEvent, complete],
    correction: weight(taskId, "W1", 3),
  });
  const reader = launch("recover-progress", {
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
  assert.deepEqual(reader.result.cut.progress, writer.result.progress);
  assert.deepEqual(reader.result.cut.cursor, [
    cursor([planEvent.id, complete.id]),
  ]);
  assert.equal(latest(reader.result.cut).ratio, 1);
  assert.deepEqual(
    latest(reader.result.cut)
      .evidenceRefs.filter((ref) => ref.kind === "event")
      .map((ref) => ref.eventId),
    ["A", "a"],
  );
  assert.equal(
    latest(reader.result.cut).tasks[0].statusAssertions[0].eventId,
    complete.id,
  );
});

test("a source saying verified does not supply independent verification support", () => {
  const f = fixture();
  try {
    const [build, review] = initialize(f.store);
    commit(f.store, "w1", { correction: weight(build, "W1", 3) });
    commit(f.store, "w2", { correction: weight(review, "W2", 2) });
    const claim = event("V1", "task.status_reported", {
      taskId: build,
      status: "verified",
    });
    const result = latest(commit(f.store, "claimed", { events: [claim] }));
    assert.equal(result.ratio, 0);
    const task = result.tasks.find(({ entry }) => entry.taskId === build);
    assert.equal(task.statusAssertions[0].value, "verified");
    assert.equal(task.statusAssertions[0].provenance, "agent_reported");
    assert.equal(task.completionReason, "verification_evidence_missing");
    assert.equal("verificationSupport" in task, false);
  } finally {
    f.store.close();
  }
});
