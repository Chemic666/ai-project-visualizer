import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  bootstrap: seed(),
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
let roots = 0;
const save = (name, value) =>
  fs.writeFileSync(
    path.join(spec.evidence, name),
    JSON.stringify(value, null, 2),
    { flag: "wx" },
  );
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  return v;
}
const encode = (v) => JSON.stringify(canonical(v));
const digest = (v) => createHash("sha256").update(encode(v)).digest("hex");
function sql(f, fn, readonly = true) {
  const db = new Database(f.paths.project, { fileMustExist: true, readonly });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
function rows(f) {
  return sql(f, (db) =>
    Object.fromEntries(
      [
        "commits",
        "normalized_events",
        "entity_versions",
        "assertions",
        "correction_versions",
        "conclusion_versions",
        "source_checkpoint_versions",
        "snapshots",
      ].map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()]),
    ),
  );
}
function request(
  store,
  suffix,
  events = [],
  checkpoint = cursor(["E1"], "batch:2", "batch:1"),
) {
  return {
    operationId: "op:" + suffix,
    operationNonce: "nonce:" + suffix,
    expectedHead: store.read().head,
    writer: store.writer(),
    events,
    ...(checkpoint == null ? {} : { cursor: checkpoint }),
  };
}
function fixture(extra = {}, checkpoint = cursor(["E1"])) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  save(`synthetic-root-${++roots}.json`, { root, runId: spec.runId });
  const cap = admitSyntheticRoot({ enabled: true, root });
  const store = openSyntheticStore(cap, { ...options, ...extra });
  const f = { root, cap, store, paths: store.paths() };
  try {
    store.commit(request(store, "E1", [input()], checkpoint));
    f.cut = store.read();
    return f;
  } catch (error) {
    store.close();
    throw error;
  }
}
function rejected(f, candidate, code = "coverage_conflict") {
  const before = f.store.read(),
    beforeRows = rows(f);
  assert.throws(() => f.store.commit(candidate), { code });
  assert.deepEqual(f.store.read(), before);
  assert.deepEqual(rows(f), beforeRows);
}
function reviseReceipt(db, seq, change) {
  const row = db.prepare("SELECT * FROM commits WHERE seq=?").get(seq);
  const intent = JSON.parse(row.intent_json),
    result = JSON.parse(row.result_json);
  change(intent, result);
  db.prepare(
    "UPDATE commits SET intent_json=?,intent_digest=?,result_json=?,result_digest=? WHERE seq=?",
  ).run(encode(intent), digest(intent), encode(result), digest(result), seq);
}

test("checkpoint-only: unchanged recorded state, empty event receipt, atomic new cursor and cache", () => {
  let applies = 0;
  const f = fixture({
    applyNormalizedEvent: (...args) => {
      applies++;
      return core.applyNormalizedEvent(...args);
    },
  });
  try {
    const beforeRows = rows(f);
    const committed = f.store.commit(request(f.store, "checkpoint"));
    assert.equal(committed.status, "committed");
    assert.equal(committed.head, 3);
    assert.equal(committed.stateDigest, f.cut.stateDigest);
    assert.deepEqual(committed.state, f.cut.state);
    assert.equal(applies, 1);
    assert.deepEqual(committed.cursor, [cursor(["E1"], "batch:2", "batch:1")]);
    assert.equal(committed.ack, false);
    assert.equal(committed.publish, false);
    assert.equal(committed.replay, false);
    const afterRows = rows(f),
      row = afterRows.commits.find((r) => r.seq === 3);
    assert.deepEqual(JSON.parse(row.intent_json).eventClaims, []);
    assert.deepEqual(JSON.parse(row.result_json).canonicalEventIds, []);
    assert.deepEqual(afterRows.normalized_events, beforeRows.normalized_events);
    assert.deepEqual(afterRows.assertions, beforeRows.assertions);
    assert.deepEqual(
      afterRows.snapshots.map((r) => r.watermark),
      [2, 3],
    );
    const snapshot = JSON.parse(
      afterRows.snapshots.find((r) => r.watermark === 3).body,
    );
    const { acceptedEvents: _events, ...domain } = committed.state;
    assert.deepEqual(snapshot.domain, domain);
    assert.deepEqual(snapshot.sourceVector, committed.cursor);
    assert.equal(snapshot.watermark, committed.head);
    save("checkpoint-atomic.json", {
      before: f.cut,
      committed,
      beforeRows,
      afterRows,
      applies,
    });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: reopen and retry original operation retain receipt and one contiguous commit", () => {
  const f = fixture();
  let store = f.store;
  try {
    const original = request(store, "checkpoint");
    const committed = store.commit(original);
    store.close();
    store = openSyntheticStore(f.cap, options);
    const retry = store.commit({ ...original, writer: store.writer() });
    assert.equal(retry.status, "already_committed");
    assert.deepEqual(retry.receipt, committed.receipt);
    assert.equal(retry.head, 3);
    assert.deepEqual(retry.state, f.cut.state);
    assert.deepEqual(retry.cursor, committed.cursor);
    assert.deepEqual(
      rows(f).commits.map((r) => r.seq),
      [1, 2, 3],
    );
    rejected(
      { ...f, store },
      { ...original, operationNonce: "different", writer: store.writer() },
      "identity_conflict",
    );
    save("checkpoint-restart.json", {
      committed,
      retry,
      epoch: store.writer().epoch,
    });
  } finally {
    store.close();
  }
});

test("checkpoint-only: existing input without checkpoint and opaque nonlexical positions remain legal", () => {
  const f = fixture({}, null);
  try {
    assert.deepEqual(f.cut.cursor, []);
    // No earlier checkpoint exists; opaque positions supply no sortable order.
    const first = cursor(["E1"], "z-final", null);
    first.streamId = "other-stream";
    const next = { ...first, position: "a-next", expectedPrevious: "z-final" };
    f.store.commit(request(f.store, "first-other-stream", [], first));
    const result = f.store.commit(request(f.store, "nonlexical", [], next));
    assert.equal(result.head, 4);
    assert.deepEqual(result.state, f.cut.state);
    assert.deepEqual(
      result.cursor.find((c) => c.streamId === "other-stream"),
      next,
    );
    save("checkpoint-opaque.json", { result });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: missing declaration, empty, absent, alias and foreign-source coverage reject atomically", () => {
  const f = fixture();
  try {
    const noCursor = request(f.store, "none");
    delete noCursor.cursor;
    rejected(f, noCursor, "admission_rejected");
    for (const ids of [[], ["missing"], ["new-alias"]])
      rejected(
        f,
        request(
          f.store,
          "bad:" + ids.join(),
          [],
          cursor(ids, "batch:2", "batch:1"),
        ),
      );
    const foreign = cursor(["E1"], "foreign", null);
    foreign.sourceId = "ANOTHER";
    rejected(f, request(f.store, "foreign", [], foreign));
    save("checkpoint-coverage-rejected.json", {
      cut: f.store.read(),
      rows: rows(f),
    });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: prior mismatch, current and historical position reuse reject without ordering opaque strings", () => {
  const f = fixture();
  try {
    rejected(
      f,
      request(f.store, "gap", [], cursor(["E1"], "batch:3", "missing")),
    );
    rejected(
      f,
      request(f.store, "same", [], cursor(["E1"], "batch:1", "batch:1")),
    );
    f.store.commit(request(f.store, "checkpoint"));
    rejected(
      f,
      request(f.store, "back", [], cursor(["E1"], "batch:1", "batch:2")),
    );
    rejected(
      f,
      request(
        f.store,
        "data-back",
        [input("E2")],
        cursor(["E2"], "batch:1", "batch:2"),
      ),
    );
    save("checkpoint-position-rejected.json", {
      cut: f.store.read(),
      rows: rows(f),
    });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: rollback retains all rows and cursor, then retry consumes only one ledger sequence", () => {
  let fail = false;
  const f = fixture({
    testHooks: {
      afterRecords: () => {
        if (fail) throw new Error("CONTROLLED_CHECKPOINT_ROLLBACK");
      },
    },
  });
  try {
    const candidate = request(f.store, "rollback"),
      before = rows(f);
    fail = true;
    rejected(f, candidate, "unavailable");
    fail = false;
    const result = f.store.commit(candidate);
    assert.equal(result.head, 3);
    assert.deepEqual(result.state, f.cut.state);
    assert.deepEqual(
      rows(f).commits.map((r) => r.seq),
      [1, 2, 3],
    );
    save("checkpoint-rollback.json", { before, after: rows(f), result });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: current writer guard remains required before any row is written", () => {
  const f = fixture();
  try {
    const candidate = request(f.store, "stale");
    candidate.writer.epoch++;
    rejected(f, candidate, "stale_writer");
    assert.ok(
      f.store
        .evidence()
        .some((r) => r.phase === "rollback" && r.status === "returned"),
    );
    save("checkpoint-stale-rejected.json", {
      cut: f.store.read(),
      rows: rows(f),
    });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only recovery: a digest-consistent event commit cannot masquerade as eventless", () => {
  const f = fixture();
  try {
    f.store.commit(
      request(
        f.store,
        "E2",
        [input("E2")],
        cursor(["E2"], "batch:2", "batch:1"),
      ),
    );
  } finally {
    f.store.close();
  }
  sql(
    f,
    (db) =>
      reviseReceipt(db, 3, (intent, result) => {
        intent.eventClaims = [];
        result.canonicalEventIds = [];
      }),
    false,
  );
  const before = rows(f);
  assert.throws(() => openSyntheticStore(f.cap, options), {
    code: "unavailable",
  });
  assert.deepEqual(rows(f), before);
  save("checkpoint-forged-eventless-rejected.json", { rows: before });
});

test("checkpoint-only recovery: digest-consistent cursor/receipt cannot revisit an older opaque position", () => {
  const f = fixture();
  try {
    f.store.commit(request(f.store, "checkpoint"));
    f.store.commit(
      request(f.store, "third", [], cursor(["E1"], "batch:3", "batch:2")),
    );
  } finally {
    f.store.close();
  }
  sql(
    f,
    (db) => {
      const c = cursor(["E1"], "batch:1", "batch:2");
      db.prepare("DELETE FROM snapshots").run();
      db.prepare(
        "UPDATE source_checkpoint_versions SET body=?,body_digest=? WHERE seq=4",
      ).run(encode(c), digest(c));
      reviseReceipt(db, 4, (intent, result) => {
        intent.cursor = c;
        result.cursorVectorDigest = digest([c]);
      });
    },
    false,
  );
  const before = rows(f);
  assert.throws(() => openSyntheticStore(f.cap, options), {
    code: "unavailable",
  });
  assert.deepEqual(rows(f), before);
  save("checkpoint-forged-cycle-rejected.json", { rows: before });
});

test("checkpoint-only: several prior canonical inputs can advance without creating a Snapshot", () => {
  const f = fixture();
  let store = f.store;
  try {
    store.commit(
      request(store, "E2", [input("E2")], cursor(["E2"], "batch:2", "batch:1")),
    );
    const before = store.read(),
      beforeRows = rows(f);
    const candidate = request(
      store,
      "multi",
      [],
      cursor(["E1", "E2"], "batch:3", "batch:2"),
    );
    candidate.createSnapshot = false;
    const committed = store.commit(candidate);
    assert.equal(committed.head, 4);
    assert.deepEqual(committed.state, before.state);
    assert.deepEqual(rows(f).normalized_events, beforeRows.normalized_events);
    assert.deepEqual(rows(f).snapshots, beforeRows.snapshots);
    store.close();
    store = openSyntheticStore(f.cap, options);
    assert.deepEqual(store.read().state, before.state);
    assert.deepEqual(store.read().cursor, committed.cursor);
    assert.equal(store.read().head, 4);
    save("checkpoint-multi-tail.json", {
      before,
      committed,
      recovered: store.read(),
    });
  } finally {
    store.close();
  }
});

test("checkpoint-only: lowered Snapshot quota rejects the entire cut and a later no-cache commit remains usable", () => {
  const f = fixture();
  f.store.close();
  f.store = openSyntheticStore(f.cap, {
    ...options,
    limits: { snapshotBytes: 1 },
  });
  try {
    const candidate = request(f.store, "quota");
    const before = rows(f);
    rejected(f, candidate, "quota_exceeded");
    candidate.createSnapshot = false;
    const result = f.store.commit(candidate);
    assert.equal(result.head, 3);
    assert.deepEqual(result.state, f.cut.state);
    assert.deepEqual(rows(f).snapshots, before.snapshots);
    save("checkpoint-quota.json", { before, after: rows(f), result });
  } finally {
    f.store.close();
  }
});

test("checkpoint-only: the same opaque position in a different stream is a separate declaration", () => {
  const f = fixture();
  try {
    const c = cursor(["E1"]);
    c.streamId = "other-stream";
    const result = f.store.commit(request(f.store, "other-stream", [], c));
    assert.equal(result.head, 3);
    assert.deepEqual(result.state, f.cut.state);
    assert.equal(result.cursor.length, 2);
    assert.ok(result.cursor.every((row) => row.position === "batch:1"));
    save("checkpoint-stream-isolation.json", { result });
  } finally {
    f.store.close();
  }
});

for (const boundary of ["before-driver-call", "after-driver-return"]) {
  test(`checkpoint-only: controlled COMMIT-boundary exception ${boundary} retires the instance until settled healthy reconciliation`, () => {
    let armed = false;
    const injected = [],
      handles = [];
    class BoundaryDatabase extends Database {
      constructor(...args) {
        super(...args);
        handles.push(this);
      }
      exec(statement) {
        if (
          armed &&
          path.basename(this.name) === "project.sqlite" &&
          statement === "COMMIT"
        ) {
          armed = false;
          if (boundary === "after-driver-return") super.exec(statement);
          injected.push({
            boundary,
            transactionStillActive: this.inTransaction,
            driverCommitReturned: boundary === "after-driver-return",
          });
          throw new Error("CONTROLLED_RETURN_BOUNDARY");
        }
        return super.exec(statement);
      }
    }
    const f = fixture({ Database: BoundaryDatabase });
    let store = f.store;
    try {
      const candidate = request(store, "return-boundary");
      const before = rows(f);
      armed = true;
      assert.throws(() => store.commit(candidate), { code: "unavailable" });
      assert.equal(injected.length, 1);
      assert.throws(() => store.read(), { code: "unavailable" });
      assert.throws(() => store.commit(candidate), { code: "unavailable" });
      const trail = store.evidence();
      const outcome = trail.find((row) => row.phase === "outcome");
      assert.ok(outcome);
      assert.equal(outcome.status, "unavailable");
      assert.equal(outcome.ack, false);
      assert.equal(outcome.publish, false);
      assert.equal(outcome.replay, false);
      assert.equal(
        trail.filter((row) => row.phase === "commit-enter" && row.head === 3)
          .length,
        1,
      );
      store.close();
      assert.ok(
        handles.every((db) => !db.open),
        "all suspect handles must be closed before any healthy absence check",
      );
      const closedTrail = store.evidence();
      const projectClosed = closedTrail.findIndex(
        (row) => row.phase === "project-close" && row.status === "returned",
      );
      const ownerReleased = closedTrail.findIndex(
        (row) => row.phase === "owner-release" && row.status === "returned",
      );
      assert.ok(projectClosed >= 0 && ownerReleased > projectClosed);
      store = openSyntheticStore(f.cap, options);
      const reconciled = store.read();
      assert.deepEqual(reconciled.state, f.cut.state);
      if (boundary === "after-driver-return") {
        assert.equal(reconciled.head, 3);
        assert.deepEqual(reconciled.cursor, [
          cursor(["E1"], "batch:2", "batch:1"),
        ]);
      } else {
        assert.deepEqual(reconciled, f.cut);
        assert.deepEqual(rows(f), before);
      }
      const historical = sql(f, (db) =>
        db
          .prepare("SELECT * FROM commits WHERE operation_id=?")
          .get(candidate.operationId),
      );
      assert.equal(!!historical, boundary === "after-driver-return");
      const retry = store.commit({ ...candidate, writer: store.writer() });
      assert.equal(
        retry.status,
        boundary === "after-driver-return" ? "already_committed" : "committed",
      );
      assert.equal(retry.head, 3);
      assert.deepEqual(retry.state, f.cut.state);
      assert.deepEqual(
        rows(f).commits.map((row) => row.seq),
        [1, 2, 3],
      );
      assert.deepEqual(rows(f).normalized_events, before.normalized_events);
      if (historical)
        assert.deepEqual(retry.receipt, {
          operationId: historical.operation_id,
          operationNonce: historical.nonce,
          projectId: historical.project_id,
          generation: historical.generation,
          epoch: historical.epoch,
          head: historical.seq,
          intentDigest: historical.intent_digest,
          resultDigest: historical.result_digest,
          stateDigest: historical.state_digest,
        });
      save(`checkpoint-response-${boundary}.json`, {
        scope: "controlled Driver-call boundary only; no I/O fault",
        injected,
        allSuspectHandlesClosedBeforeReconciliation: true,
        before,
        reconciled,
        historical: historical ?? null,
        retry,
        after: rows(f),
        closedTrail,
      });
    } finally {
      store.close();
    }
  });
}

for (const invalid of ["zero-business-epoch", "decreasing-recorded-epoch"]) {
  test(`checkpoint-only recovery: impossible recorded Writer epoch ${invalid} rejects even with otherwise valid authority`, () => {
    const f = fixture();
    let store = f.store;
    try {
      store.close();
      store = openSyntheticStore(f.cap, options);
      assert.equal(store.writer().epoch, 2);
      store.commit(request(store, "epoch-two"));
      if (invalid === "decreasing-recorded-epoch")
        store.commit(
          request(
            store,
            "epoch-two-next",
            [],
            cursor(["E1"], "batch:3", "batch:2"),
          ),
        );
    } finally {
      store.close();
    }
    const seq = invalid === "zero-business-epoch" ? 3 : 4;
    const epoch = invalid === "zero-business-epoch" ? 0 : 1;
    sql(
      f,
      (db) =>
        db.prepare("UPDATE commits SET epoch=? WHERE seq=?").run(epoch, seq),
      false,
    );
    const before = rows(f);
    save(`checkpoint-epoch-input-${invalid}.json`, {
      scope: "recorded business epochs only; no control-history inference",
      seq,
      epoch,
      before,
    });
    let recovered;
    try {
      assert.throws(
        () => {
          recovered = openSyntheticStore(f.cap, options);
        },
        { code: "unavailable" },
      );
    } finally {
      recovered?.close();
    }
    assert.deepEqual(rows(f), before);
  });
}

test("checkpoint-only recovery: skipped fencing epochs and historical receipt epochs remain legal", () => {
  const f = fixture();
  let store = f.store;
  try {
    store.close();
    for (const epoch of [2, 3]) {
      store = openSyntheticStore(f.cap, options);
      assert.equal(store.writer().epoch, epoch);
      assert.deepEqual(store.read(), f.cut);
      store.close();
    }
    store = openSyntheticStore(f.cap, options);
    assert.equal(store.writer().epoch, 4);
    const candidate = request(store, "after-skipped-fences");
    const committed = store.commit(candidate);
    assert.equal(committed.receipt.epoch, 4);
    store.close();
    store = openSyntheticStore(f.cap, options);
    assert.equal(store.writer().epoch, 5);
    const retry = store.commit({ ...candidate, writer: store.writer() });
    assert.equal(retry.status, "already_committed");
    assert.deepEqual(retry.receipt, committed.receipt);
    assert.deepEqual(retry.state, f.cut.state);
    assert.deepEqual(
      rows(f).commits.map((row) => row.epoch),
      [0, 1, 4],
    );
    save("checkpoint-skipped-epochs.json", {
      committed,
      retry,
      currentEpoch: store.writer().epoch,
      rows: rows(f),
    });
  } finally {
    store.close();
  }
});
