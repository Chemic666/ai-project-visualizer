"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { makeCuts, digest, names } = require("./fixture.cjs");
const { reconcile } = require("./oracle.cjs");
const { validateFaultEvidence } = require("./policy.cjs");
const { uuid, inside } = require("./checks.cjs");
const fixture = {
  runId: "00000000-0000-4000-8000-000000000001",
  project: "PA",
  generation: "GEN-1",
  epoch: 1,
  baselineNonce: "00000000-0000-4000-8000-000000000002",
  operationNonce: "00000000-0000-4000-8000-000000000003",
};
const cuts = makeCuts(fixture),
  settlement = {
    observedExit: true,
    workerComplete: true,
    pid: 9,
    nonce: "worker",
    status: 0,
    signal: null,
    error: null,
  };
const check = (cut) =>
  reconcile({
    cut,
    before: cuts.before,
    after: cuts.after,
    settlement,
    writer: { pid: 9, nonce: "worker" },
  });
test("real fixture has seven exact tables and preserves original assertion/history/receipt", () => {
  assert.deepEqual(Object.keys(cuts.after.tables), names);
  for (const name of [
    "event_ledger",
    "assertions",
    "history",
    "snapshots",
    "receipts",
  ])
    assert.equal(
      cuts.after.tables[name][0].value,
      cuts.before.tables[name][0].value,
    );
  const s = JSON.parse(cuts.after.tables.snapshots[1].value);
  assert.equal(s.watermark, 2);
  assert.equal(s.state.verification, "UNVERIFIED");
  assert.equal(s.stateDigest, digest(s.state));
  assert.deepEqual(s.state.correctionHistory, ["history-1", "history-2"]);
  assert.equal(cuts.candidate.nonce, fixture.operationNonce);
  assert.equal(
    cuts.candidate.resultDigest,
    digest(
      Object.fromEntries(
        names
          .filter((n) => n !== "receipts")
          .map((n) => [n, cuts.after.tables[n]]),
      ),
    ),
  );
});
for (const which of ["before", "after"])
  test(
    "actual fixture " + which + " reconciles without publication/replay/ACK",
    () => {
      const r = check(cuts[which]);
      assert.equal(
        r.outcome,
        which === "before" ? "not_committed" : "committed",
      );
      assert.equal(r.ack, false);
      assert.equal(r.publish, false);
      assert.equal(r.replay, false);
    },
  );
for (const [field, value] of [
  ["nonce", "wrong"],
  ["epoch", 2],
  ["generation", "GEN-2"],
  ["intentDigest", "0".repeat(64)],
  ["resultDigest", "0".repeat(64)],
  ["stateDigest", "0".repeat(64)],
])
  test("actual receipt " + field + " mismatch is unavailable", () => {
    const c = structuredClone(cuts.after),
      r = JSON.parse(c.tables.receipts[1].value);
    r[field] = value;
    c.tables.receipts[1].value = JSON.stringify(r);
    assert.equal(check(c).outcome, "unavailable");
  });
for (const name of names)
  test("partial authority " + name + " is unavailable", () => {
    const c = structuredClone(cuts.after);
    c.tables[name] = structuredClone(cuts.before.tables[name]);
    assert.equal(check(c).outcome, "unavailable");
  });
test("root UUID and path escape checks are pure and strict", () => {
  assert.throws(() => uuid("../x"));
  assert.throws(() => inside("C:\\root", "C:\\outside"));
  assert.throws(() => inside("C:\\root", "C:\\root"));
  assert.equal(inside("C:\\root", "C:\\root\\target.sqlite"), true);
});
test("importing Runner/Worker has no runtime execution or Driver/DLL import", () => {
  require("./runner.cjs");
  require("./worker.cjs");
  require("./audit.cjs");
  assert(
    !Object.keys(require.cache).some(
      (p) =>
        p.endsWith(".node") || p.includes("node_modules\\better-sqlite3\\lib"),
    ),
  );
});
test("fault Oracle cannot grant HIT to an unbound connection", () => {
  assert.throws(() =>
    validateFaultEvidence({ hitCount: 1, events: [] }, { runId: "required" }),
  );
});
