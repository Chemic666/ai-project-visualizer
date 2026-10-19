"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parse, validateFaultEvidence } = require("./policy.cjs");
const { reconcile } = require("./oracle.cjs");
const id = "00000000-0000-4000-8000-000000000001";
const binding = {
  runId: id,
  nonce: id,
  operationNonce: id,
  operationId: "candidate",
  intentDigest: "a".repeat(64),
  project: "PA",
  generation: "GEN-1",
  epoch: 1,
  pid: 123,
  thread: 456,
  databaseFile: "C:\\fixture\\target.sqlite",
  mainFileId: 1,
  case: "G2-W",
};
function evidence() {
  const e = {
    ...binding,
    connection: "native-target",
    hitCount: 1,
    commitSerial: 1,
    queryStatus: "ok",
    actualVfsName: "apv_g2_fault_v1",
    events: [
      {
        seq: 1,
        method: "commit-enter",
        phase: 40,
        commitSerial: 1,
        fileId: 0,
        kind: 0,
        path: "",
        pid: 123,
        thread: 456,
        rc: 0,
        injected: 0,
        delegated: 0,
      },
      {
        seq: 2,
        method: "xWrite",
        phase: 40,
        commitSerial: 1,
        fileId: 2,
        mainFileId: 1,
        kind: 2,
        path: "C:\\fixture\\target.sqlite-wal",
        pid: 123,
        thread: 456,
        rc: 778,
        injected: 1,
        delegated: 0,
      },
      {
        seq: 3,
        method: "commit-profile",
        phase: 40,
        commitSerial: 1,
        fileId: 0,
        kind: 0,
        path: "",
        pid: 123,
        thread: 456,
        rc: 0,
        injected: 0,
        delegated: 0,
      },
    ],
  };
  for (const r of e.events)
    Object.assign(r, {
      connection: "native-target",
      statement: "native-commit",
      sql: "COMMIT",
      txnState: 2,
    });
  return e;
}
test("disabled unless the exact execution gate is supplied", () => {
  assert.deepEqual(parse([]), { mode: "help" });
  assert.throws(() => parse(["--run-g2"]));
});
test("preflight is metadata-only mode", () =>
  assert.deepEqual(parse(["--preflight", "--build-id", id]), {
    mode: "preflight",
    buildId: id,
  }));
for (const scenario of ["G2-W", "G2-S"])
  test("admits exactly " + scenario, () =>
    assert.deepEqual(
      parse(["--run-g2", "--execute", "--case", scenario, "--build-id", id]),
      { mode: "run", case: scenario, buildId: id },
    ),
  );
for (const args of [
  ["--run-g2", "--execute", "--case", "G2-X", "--build-id", id],
  ["--preflight", "--build-id", "../escape"],
  ["--run-g2", "--execute", "--case", "G2-W", "--build-id", id, "--retry"],
  ["--g1", "--execute"],
])
  test("rejects " + args.join(" "), () => assert.throws(() => parse(args)));
test("native COMMIT-bound write evidence is accepted", () =>
  assert.equal(validateFaultEvidence(evidence(), binding).status, "HIT"));
test("native COMMIT-bound sync evidence is accepted", () => {
  const e = evidence();
  e.case = "G2-S";
  e.events[1].method = "xSync";
  e.events[1].rc = 1034;
  assert.equal(
    validateFaultEvidence(e, { ...binding, case: "G2-S" }).status,
    "HIT",
  );
});
test("no actual hit is NOT TESTED", () => {
  const e = evidence();
  e.hitCount = 0;
  e.events = e.events.filter((x) => !x.injected);
  assert.equal(validateFaultEvidence(e, binding).status, "NOT TESTED");
});
for (const [name, mutate] of [
  [
    "wrong nonce",
    (e) => {
      e.nonce = "wrong";
    },
  ],
  [
    "wrong connection",
    (e) => {
      e.events[1].mainFileId = 7;
    },
  ],
  [
    "wrong filename",
    (e) => {
      e.events[1].path = "C:\\other.sqlite-wal";
    },
  ],
  [
    "checkpoint phase",
    (e) => {
      e.events[1].phase = 5;
    },
  ],
  [
    "delegated instead of denied",
    (e) => {
      e.events[1].delegated = 1;
    },
  ],
  [
    "two faults",
    (e) => {
      e.hitCount = 2;
    },
  ],
  [
    "missing native COMMIT trace",
    (e) => {
      e.events.shift();
    },
  ],
  [
    "wrong original native error",
    (e) => {
      e.events[1].rc = 1;
    },
  ],
  [
    "wrong runtime VFS name",
    (e) => {
      e.actualVfsName = "win32";
    },
  ],
  [
    "wrong native PID",
    (e) => {
      e.events[1].pid = 999;
    },
  ],
])
  test("rejects fault evidence: " + name, () => {
    const e = evidence();
    mutate(e);
    assert.throws(() => validateFaultEvidence(e, binding));
  });
// Explicit small authority cuts: production Core behavior is not mocked or claimed.
const before = {
  integrity: ["ok"],
  foreignKeys: [],
  tables: {
    control: [{ id: 1, value: "old" }],
    event_ledger: [{ id: 1, value: "old" }],
    assertions: [],
    history: [],
    snapshots: [],
    cursors: [],
    receipts: [{ id: 1, value: "seed" }],
  },
};
const after = structuredClone(before);
after.tables.control[0].value = "new";
after.tables.event_ledger.push({ id: 2, value: "new" });
after.tables.receipts.push({ id: 2, value: "candidate-receipt" });
const settled = {
  observedExit: true,
  pid: 123,
  nonce: id,
  status: 0,
  signal: null,
  error: null,
  workerComplete: true,
};
const evaluate = (cut, settlement = settled) =>
  reconcile({
    cut,
    before,
    after,
    settlement,
    writer: { pid: 123, nonce: id },
  });
test("settled exact old cut proves not committed; no automatic retry", () => {
  const r = evaluate(before);
  assert.equal(r.outcome, "not_committed");
  assert.equal(r.replay, false);
  assert.equal(r.ack, false);
});
test("settled exact complete new cut proves committed; no external ACK", () => {
  const r = evaluate(after);
  assert.equal(r.outcome, "committed");
  assert.equal(r.ack, false);
  assert.equal(r.publish, false);
});
test("missing receipt with new business rows is unavailable", () => {
  const c = structuredClone(after);
  c.tables.receipts.pop();
  assert.equal(evaluate(c).outcome, "unavailable");
});
test("receipt alone with old business rows is unavailable", () => {
  const c = structuredClone(before);
  c.tables.receipts = after.tables.receipts;
  assert.equal(evaluate(c).outcome, "unavailable");
});
for (const field of ["nonce", "epoch", "intent", "generation"])
  test("contradictory " + field + " receipt is unavailable", () => {
    const c = structuredClone(after);
    c.tables.receipts[1].value = field + "-mismatch";
    assert.equal(evaluate(c).outcome, "unavailable");
  });
for (const state of [
  { ...settled, observedExit: false },
  { ...settled, pid: 999 },
  { ...settled, nonce: "wrong" },
  { ...settled, workerComplete: false },
])
  test(
    "unsettled/unbound writer never authorizes reconciliation " +
      JSON.stringify(state),
    () => assert.equal(evaluate(before, state).outcome, "unavailable"),
  );
test("unreadable authority is unavailable", () =>
  assert.equal(evaluate(null).outcome, "unavailable"));
test("failed integrity is unavailable", () => {
  const c = structuredClone(before);
  c.integrity = ["corrupt"];
  assert.equal(evaluate(c).outcome, "unavailable");
});
