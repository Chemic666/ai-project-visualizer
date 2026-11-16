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
import { launchSyntheticHost } from "../src/host-development.mjs";
import { cursor, seed } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const native = spec.validationMode === "--execute-timeline-native-synthetic";
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
  updateProgress: core.updateProgress,
  appendTimelineEvents: core.appendTimelineEvents,
  describeCorrectionRecord: core.describeCorrectionRecord,
  planScope: scope,
  processorFingerprint: spec.processorFingerprint,
  projectId: scope.projectId,
  generation: "G1",
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
function unexpectedReplay() {
  throw new Error("UNEXPECTED_SOURCE_REPLAY");
}
const reopen = {
  ...options,
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
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  fs.writeFileSync(
    path.join(spec.evidence, "synthetic-root-" + ++roots + ".json"),
    JSON.stringify({ root, runId: spec.runId }),
    { flag: "wx" },
  );
  return { root, cap: storage.admitSyntheticRoot({ enabled: true, root }) };
}
function fixture(extra = {}) {
  const { cap } = makeRoot();
  assert.equal(typeof storage.openSyntheticTimelineStore, "function");
  const store = storage.openSyntheticTimelineStore(cap, {
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
function at(minute) {
  return "2026-10-19T00:" + String(minute).padStart(2, "0") + ":00.000Z";
}
function observation(id, type, payload, minute) {
  return {
    id,
    type,
    payload,
    receivedAt: at(minute),
    projectId: "PA",
    sourceId: "SRC",
    sessionId: "S1",
    schemaVersion: 1,
    sourceIdentity: {
      kind: "source_event",
      sourceId: "SRC",
      sourceEventId: "source:" + id,
    },
  };
}
const start = observation("S", "session.started", { sessionId: "S1" }, 0);
const end = observation("X", "session.ended", { sessionId: "S1" }, 12);
const first = observation(
  "P1",
  "plan.detected",
  {
    planId: "PLAN",
    completeness: "complete",
    provenance: "agent_reported",
    steps: [
      { title: "Build", sourceItemId: "build", certainty: "confirmed" },
      { title: "Review", sourceItemId: "review", certainty: "confirmed" },
    ],
  },
  2,
);
function correction(id, taskId, minute, value) {
  const current = value === undefined;
  return {
    id,
    scope: current
      ? { kind: "current_task", projectId: "PA", sessionId: "S1" }
      : { kind: "task_weight", projectId: "PA", taskId, sessionId: "S1" },
    effectiveAt: at(minute),
    assertion: {
      id: "a:" + id,
      sourceId: "USER",
      observedAt: at(minute),
      target: current ? "project.currentTask" : "task.weight",
      targetId: current ? "PA" : taskId,
      value: current ? taskId : value,
      provenance: "user_confirmed",
    },
  };
}
function request(store, id, work) {
  return {
    operationId: id,
    operationNonce: "nonce:" + id,
    writer: store.writer(),
    expectedHead: store.read().head,
    ...work,
  };
}
function commit(store, id, work) {
  return store.commit(request(store, id, work));
}
function openPlan(store) {
  const cut = commit(store, "open", {
    events: [start, first],
    cursor: cursor(["S", "P1"]),
  });
  return cut.plan.heads[0].entries.map((entry) => entry.taskId);
}
function query(f, fn, readonly = true) {
  const db = new Database(f.dbPath, { readonly, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

test("reopening preserves activity, provenance, progress reasons and an existing pagination cursor", () => {
  const f = fixture();
  const pageQuery = { projectId: "PA", limit: 2 };
  let final, priorPage;
  try {
    assert.deepEqual(f.store.read().timeline, { entries: [] });
    const [build, review] = openPlan(f.store);
    assert.deepEqual(
      f.store.read().timeline.entries.map(({ kind }) => kind),
      ["session.started", "plan.changed", "progress.changed"],
    );
    commit(f.store, "select", { correction: correction("C", build, 3) });
    commit(f.store, "build-weight", {
      correction: correction("W1", build, 4, 3),
    });
    commit(f.store, "review-weight", {
      correction: correction("W2", review, 5, 2),
    });
    const done = observation(
      "DONE",
      "task.status_reported",
      {
        taskId: build,
        status: "completed",
      },
      6,
    );
    const estimate = observation(
      "VERIFY",
      "task.status_reported",
      {
        taskId: review,
        status: "verified",
      },
      7,
    );
    const reports = commit(f.store, "report", { events: [done, estimate] });
    const reportEntries = reports.timeline.entries.filter((entry) =>
      ["DONE", "VERIFY"].includes(entry.eventId),
    );
    assert.deepEqual(
      reportEntries.map(({ provenance }) => provenance),
      ["agent_reported", "agent_reported"],
    );
    assert.equal(reportEntries[1].detail.reportedStatus, "verified");
    assert.equal(reports.timeline.entries.at(-1).observedAt, at(7));
    commit(f.store, "replace", {
      correction: {
        ...correction("W3", review, 8, 3),
        supersedes: "W2",
        originalAssertionId: "a:W2",
      },
    });
    const beforeLateEvent = f.store.read().timeline;
    const page = core.getTimelinePage(beforeLateEvent, pageQuery);
    assert.equal(page.status, "available");
    assert.deepEqual(
      page.entries.map(({ kind }) => kind),
      ["session.started", "plan.changed"],
    );
    const nextQuery = {
      ...pageQuery,
      after: JSON.parse(JSON.stringify(page.nextCursor)),
    };
    priorPage = {
      nextQuery,
      expected: core.getTimelinePage(beforeLateEvent, nextQuery),
    };
    // It was received earlier, but was admitted only in this later cut.
    const late = observation("LATE", "session.started", { sessionId: "S2" }, 2);
    late.sessionId = "S2";
    final = commit(f.store, "end-with-late", { events: [end, late] });
    const entries = final.timeline.entries;
    const replacedProgress = entries.find(
      (entry) =>
        entry.kind === "progress.changed" && entry.detail.before?.ratio === 0.6,
    );
    assert.deepEqual(replacedProgress.detail.reasons, ["weight_corrected"]);
    assert.equal(replacedProgress.observedAt, at(8));
    assert.equal(replacedProgress.detail.before.ratio, 0.6);
    assert.equal(replacedProgress.detail.after.ratio, 0.5);
    const oldCorrection = entries.find(
      (entry) =>
        entry.kind === "correction.superseded" &&
        entry.detail.correctionId === "W2",
    );
    assert.ok(
      oldCorrection.evidenceRefs.some(
        (ref) => ref.kind === "correction" && ref.correctionId === "W3",
      ),
    );
    const after = entries.slice(beforeLateEvent.entries.length);
    assert.deepEqual(
      after.slice(0, 3).map(({ kind }) => kind),
      ["session.ended", "correction.expired", "session.started"],
    );
    const expired = after[1];
    assert.equal(expired.detail.correctionId, "C");
    assert.equal(expired.detail.reasonCode, "session_ended");
    assert.ok(
      expired.evidenceRefs.some(
        (ref) => ref.kind === "event" && ref.eventId === "X",
      ),
    );
  } finally {
    f.store.close();
  }
  const restored = storage.openSyntheticTimelineStore(f.cap, reopen);
  try {
    const cut = restored.read();
    assert.deepEqual(cut.timeline, final.timeline);
    assert.equal(cut.stateDigest, final.stateDigest);
    assert.deepEqual(cut.cursor, final.cursor);
    assert.deepEqual(
      core.getTimelinePage(cut.timeline, priorPage.nextQuery),
      priorPage.expected,
    );
    const freshPage = core.getTimelinePage(cut.timeline, {
      projectId: "PA",
      limit: 4,
    });
    assert.deepEqual(
      freshPage.entries.map(({ kind }) => kind),
      [
        "session.started",
        "plan.changed",
        "progress.changed",
        "session.started",
      ],
    );
    assert.equal(freshPage.entries[3].eventId, "LATE");
    const projected = cut.timeline.entries.find(
      ({ eventId }) => eventId === "VERIFY",
    );
    const details = core.getTimelineEntryDetails(
      { ...cut, scope },
      projected.id,
    );
    assert.equal(details.status, "available");
    assert.equal(details.evidence[0].status, "available");
    assert.equal(details.evidence[0].record.kind, "normalized_event");
    assert.equal(details.evidence[0].record.event.type, "task.status_reported");
    assert.equal(details.evidence[0].record.event.payload.status, "verified");
  } finally {
    restored.close();
  }
});

test("canonical retries and checkpoint-only commits do not add timeline entries", () => {
  const f = fixture();
  try {
    const [build] = openPlan(f.store);
    const source = observation(
      "DONE",
      "task.status_reported",
      {
        taskId: build,
        status: "completed",
      },
      6,
    );
    const originalRequest = request(f.store, "original", {
      events: [source],
      cursor: cursor(["DONE"], "batch:2", "batch:1"),
    });
    const firstCut = f.store.commit(originalRequest);
    const alias = { ...source, id: "ALIAS", receivedAt: at(8) };
    const second = commit(f.store, "alias", {
      events: [alias],
      cursor: cursor(["DONE"], "batch:3", "batch:2"),
    });
    const last = commit(f.store, "checkpoint", {
      events: [],
      cursor: cursor(["DONE"], "batch:4", "batch:3"),
    });
    assert.deepEqual(second.cursor[0].coveredEventIds, ["DONE"]);
    assert.deepEqual(last.timeline, firstCut.timeline);
    assert.equal(last.stateDigest, firstCut.stateDigest);
    assert.equal(
      last.timeline.entries.find(({ eventId }) => eventId === "DONE")
        .observedAt,
      at(6),
    );
    assert.equal(
      query(
        f,
        (db) =>
          db.prepare("SELECT count(*) AS n FROM timeline_versions").get().n,
      ),
      2,
    );
    const retry = f.store.commit(originalRequest);
    assert.equal(retry.receipt.head, firstCut.head);
    assert.equal(retry.head, last.head);
    assert.deepEqual(retry.timeline, last.timeline);
  } finally {
    f.store.close();
  }
});

test("timeline, domain changes, source checkpoint and receipt roll back together", () => {
  let abort = false;
  const f = fixture({
    testHooks: {
      afterRecords() {
        if (abort) throw new Error("CONTROLLED_BEFORE_COMMIT");
      },
    },
  });
  try {
    const before = f.store.read();
    const next = request(f.store, "open", {
      events: [start, first],
      cursor: cursor(["S", "P1"]),
    });
    abort = true;
    assert.throws(() => f.store.commit(next), { code: "unavailable" });
    assert.deepEqual(f.store.read(), before);
    assert.equal(
      query(
        f,
        (db) =>
          db.prepare("SELECT count(*) AS n FROM timeline_versions").get().n,
      ),
      0,
    );
    abort = false;
    assert.equal(f.store.commit(next).timeline.entries.length, 3);
    assert.deepEqual(f.store.commit(next).cursor, [cursor(["S", "P1"])]);
  } finally {
    f.store.close();
  }
});

test("a missing timeline row stops recovery instead of silently replacing history", () => {
  const f = fixture();
  openPlan(f.store);
  f.store.close();
  query(
    f,
    (db) => db.prepare("DELETE FROM timeline_versions WHERE seq=2").run(),
    false,
  );
  const readHead = () =>
    query(f, (db) => db.prepare("SELECT * FROM store_meta").get());
  const before = readHead();
  assert.throws(() => storage.openSyntheticTimelineStore(f.cap, reopen), {
    code: "unavailable",
  });
  assert.deepEqual(readHead(), before);
});

test("a false timeline claim is refused even when row and receipt digests agree", () => {
  const f = fixture();
  openPlan(f.store);
  const cut = f.store.read();
  f.store.close();
  const { head, plan, progress, timeline } = cut;
  timeline.entries[0].observedAt = at(1);
  const stateDigest = digest({ plan, progress, timeline });
  query(
    f,
    (db) => {
      const projection = JSON.parse(
        db.prepare("SELECT body FROM timeline_versions WHERE seq=?").get(head)
          .body,
      );
      projection.entries[0].observedAt = at(1);
      const receipt = JSON.parse(
        db.prepare("SELECT result_json FROM commits WHERE seq=?").get(head)
          .result_json,
      );
      receipt.stateDigest = stateDigest;
      db.transaction(() => {
        db.prepare(
          "UPDATE timeline_versions SET body=?,body_digest=? WHERE seq=?",
        ).run(encode(projection), digest(projection), head);
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
  assert.throws(() => storage.openSyntheticTimelineStore(f.cap, reopen), {
    code: "unavailable",
  });
});

test("a projection cannot write fields outside the closed timeline record", () => {
  const f = fixture({
    appendTimelineEvents(prior, inputs) {
      const result = core.appendTimelineEvents(prior, inputs);
      if (result.added.length > 0)
        result.added[0].detail.rawOutput =
          "SYNTHETIC_PRIVATE_TIMELINE_SENTINEL";
      return result;
    },
  });
  try {
    const before = f.store.read();
    assert.throws(() => openPlan(f.store), { code: "admission_rejected" });
    assert.deepEqual(f.store.read(), before);
    assert.equal(
      query(
        f,
        (db) =>
          db.prepare("SELECT count(*) AS n FROM timeline_versions").get().n,
      ),
      0,
    );
    assert.ok(
      !JSON.stringify(f.store.evidence()).includes(
        "SYNTHETIC_PRIVATE_TIMELINE_SENTINEL",
      ),
    );
  } finally {
    f.store.close();
  }
});

test("separate processes agree on the recorded timeline and its source references", () => {
  const { root } = makeRoot();
  const { nonce } = JSON.parse(
    fs.readFileSync(path.join(root, "synthetic-marker.json"), "utf8"),
  );
  const plan = core.applyPlanEvent(
    core.createPlanEngineState(
      core.applyNormalizedEvent(bootstrap, start).state,
    ),
    first,
  ).state;
  const task = plan.heads[0].entries[0].taskId;
  const done = observation(
    "DONE",
    "task.status_reported",
    { taskId: task, status: "completed" },
    6,
  );
  const script = fileURLToPath(
    new URL("./writer-process.mjs", import.meta.url),
  );
  function launch(mode, overrides) {
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
        ...overrides,
      }),
      { flag: "wx" },
    );
    const { pid, status, signal, stdout, stderr } = spawnSync(
      process.execPath,
      [script, specFile],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
      },
    );
    fs.writeFileSync(
      path.join(evidence, "process.json"),
      JSON.stringify({
        pid,
        status,
        signal,
        stdout,
        stderr,
      }),
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
  const writer = launch("write-timeline", {
    bootstrap,
    planEvents: [start, first, done],
    correction: correction("W1", task, 9, 3),
  });
  const { pid, status, signal, closed } = writer;
  const reader = launch("recover-timeline", {
    writerSettlement: { pid, status, signal, closed },
  });
  assert.notEqual(reader.pid, writer.pid);
  assert.equal(reader.databaseFile, writer.databaseFile);
  assert.equal(reader.result.epoch, 2);
  const { cut } = reader.result;
  assert.equal(cut.head, 3);
  assert.equal(cut.stateDigest, writer.result.stateDigest);
  assert.deepEqual(cut.timeline, writer.result.timeline);
  assert.deepEqual(cut.cursor, [cursor(["S", "P1", "DONE"])]);
  assert.deepEqual(
    cut.timeline.entries.map(({ kind }) => kind),
    [
      "session.started",
      "plan.changed",
      "task.status_reported",
      "progress.changed",
      "correction.applied",
      "progress.changed",
    ],
  );
  const report = cut.timeline.entries.find(({ eventId }) => eventId === "DONE");
  assert.deepEqual(report.evidenceRefs, [{ kind: "event", eventId: "DONE" }]);
});

test("bootstrap projects recorded observations and leaves untimed baseline progress out of the timeline", () => {
  const prior = core.applyNormalizedEvent(bootstrap, start).state;
  const f = fixture({ bootstrap: prior });
  try {
    const { timeline, progress } = f.store.read();
    assert.deepEqual(
      timeline.entries.map(({ kind, eventId, observedAt }) => ({
        kind,
        eventId,
        observedAt,
      })),
      [{ kind: "session.started", eventId: "S", observedAt: at(0) }],
    );
    assert.equal(progress.snapshots[0].result.status, "unavailable");
  } finally {
    f.store.close();
  }
});

test("a late status keeps its original time without moving confirmed progress before its basis", () => {
  const f = fixture();
  try {
    const [build, review] = openPlan(f.store);
    commit(f.store, "build-weight", {
      correction: correction("W1", build, 4, 3),
    });
    const before = commit(f.store, "review-weight", {
      correction: correction("W2", review, 5, 2),
    });
    assert.equal(before.progress.snapshots.at(-1).result.ratio, 0);
    const late = observation(
      "LATE-DONE",
      "task.status_reported",
      {
        taskId: build,
        status: "completed",
      },
      1,
    );
    const cut = commit(f.store, "late-status", { events: [late] });
    const [source, change] = cut.timeline.entries.slice(
      before.timeline.entries.length,
    );
    assert.equal(source.kind, "task.status_reported");
    assert.equal(source.observedAt, at(1));
    assert.equal(change.kind, "progress.changed");
    assert.equal(change.detail.before.ratio, 0);
    assert.equal(change.detail.after.ratio, 0.6);
    assert.equal(change.observedAt, at(5));
    assert.ok(
      change.evidenceRefs.some(
        (ref) => ref.kind === "event" && ref.eventId === "LATE-DONE",
      ),
    );
    const display = core.getTimelinePage(cut.timeline, {
      projectId: "PA",
      limit: 20,
    });
    const sequence = display.entries.map((entry) => entry.id);
    const latestWeight = display.entries.find(
      ({ kind, detail }) =>
        kind === "correction.applied" && detail.correctionId === "W2",
    );
    assert.ok(sequence.indexOf(source.id) < sequence.indexOf(latestWeight.id));
    assert.ok(sequence.indexOf(latestWeight.id) < sequence.indexOf(change.id));
    assert.deepEqual(f.store.read().timeline, cut.timeline);
  } finally {
    f.store.close();
  }
});

test("the Worker Host restores a v5 cut and matches an old receipt in a new epoch", async () => {
  const { cap } = makeRoot();
  const hostOptions = {
    driverRoot: spec.driverRoot,
    driverBinarySha256: spec.driverBinarySha256,
    corePath: spec.corePath,
    processorFingerprint: spec.processorFingerprint,
    projectId: scope.projectId,
    generation: "G1",
    planScope: scope,
    ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
  };
  const firstHost = launchSyntheticHost(cap, { ...hostOptions, bootstrap });
  let original, originalRequest, firstReady;
  try {
    firstReady = await firstHost.ready;
    const init = await firstHost.commit({
      operationId: "host-plan",
      operationNonce: "host-nonce-plan",
      expectedHead: 1,
      writer: firstReady.writer,
      events: [start, first],
      cursor: cursor(["S", "P1"]),
    });
    const [entry] = init.plan.heads[0].entries;
    originalRequest = {
      operationId: "host-weight",
      operationNonce: "host-nonce-weight",
      expectedHead: 2,
      writer: firstReady.writer,
      correction: correction("HW", entry.taskId, 4, 3),
    };
    const sendCount = firstHost
      .evidence()
      .filter(({ kind }) => kind === "request-envelope").length;
    await assert.rejects(
      firstHost.commit({ ...originalRequest, cursor: cursor(["S", "P1"]) }),
      {
        code: "admission_rejected",
      },
    );
    assert.equal(
      firstHost.evidence().filter(({ kind }) => kind === "request-envelope")
        .length,
      sendCount,
    );
    original = await firstHost.commit(originalRequest);
    assert.equal(original.status, "committed");
    assert.ok(
      original.timeline.entries.some(
        ({ kind }) => kind === "correction.applied",
      ),
    );
    assert.deepEqual(original.cursor, init.cursor);
  } finally {
    const closed = await firstHost.close();
    assert.equal(closed.status, "closed");
    assert.equal(closed.processExited, true);
  }
  const nextHost = launchSyntheticHost(cap, hostOptions);
  try {
    const ready = await nextHost.ready;
    assert.notEqual(nextHost.status().nonce, firstHost.status().nonce);
    assert.equal(ready.writer.epoch, 2);
    assert.deepEqual(ready.paths, firstReady.paths);
    const cut = await nextHost.read();
    for (const field of [
      "state",
      "plan",
      "progress",
      "timeline",
      "cursor",
      "head",
      "stateDigest",
    ])
      assert.deepEqual(cut[field], original[field]);
    const match = await nextHost.commit({
      ...originalRequest,
      writer: ready.writer,
    });
    assert.equal(match.status, "already_committed");
    assert.deepEqual(match.receipt, original.receipt);
    assert.deepEqual(await nextHost.read(), cut);
  } finally {
    const closed = await nextHost.close();
    assert.equal(closed.status, "closed");
    assert.equal(closed.processExited, true);
  }
});
