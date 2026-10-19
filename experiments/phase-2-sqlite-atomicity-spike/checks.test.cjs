"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  verdict,
  admitEvent,
  requireSettled,
  verifyCut,
} = require("./checks.cjs");

test("missing execution or independent SQL never creates a runtime PASS", () => {
  assert.equal(verdict(false, [{ status: "PASS" }]), "NOT TESTED");
  assert.equal(verdict(true, []), "NOT TESTED");
  assert.equal(verdict(true, [{ status: "NOT TESTED" }]), "NOT TESTED");
});
test("executed invariant failure dominates later missing checkpoints", () => {
  assert.equal(
    verdict(true, [{ status: "FAIL" }, { status: "NOT TESTED" }]),
    "FAIL",
  );
  assert.equal(verdict(true, [{ status: "PASS" }]), "PASS WITH LIMITATION");
});
test("unapproved cursor or missing identity cannot enter the stable-source fixture", () => {
  for (const sourceIdentity of [
    undefined,
    { kind: "cursor", sourceId: "SRC-A", reference: "batch" },
  ]) {
    assert.throws(
      () => admitEvent({ id: "E1", sourceId: "SRC-A", sourceIdentity }),
      /CONTRACT_SCOPE_BLOCKED/,
    );
  }
  assert.throws(
    () =>
      admitEvent({
        id: "E1",
        sourceId: "SRC-A",
        sourceIdentity: {
          kind: "source_event",
          sourceId: "OTHER",
          sourceEventId: "K1",
        },
      }),
    /SOURCE_NAMESPACE/,
  );
  assert.doesNotThrow(() =>
    admitEvent({
      id: "E1",
      sourceId: "SRC-A",
      sourceIdentity: {
        kind: "source_event",
        sourceId: "SRC-A",
        sourceEventId: "K1",
      },
    }),
  );
});
test("receipt absence is unusable until suspect transaction settlement", () => {
  assert.throws(
    () => requireSettled({ inTransaction: true, closeConfirmed: false }),
    /UNSETTLED/,
  );
  assert.throws(() => requireSettled({}), /UNSETTLED/);
  assert.doesNotThrow(() =>
    requireSettled({ inTransaction: false, rollbackConfirmed: true }),
  );
});
test("independent cut oracle detects any partial table mutation on rollback", () => {
  const before = {
    meta: [{ head: 1 }],
    events: [],
    snapshots: [{ watermark: 1 }],
    checkpoints: [],
  };
  assert.doesNotThrow(() => verifyCut(structuredClone(before), before));
  for (const table of ["events", "snapshots", "checkpoints"]) {
    const cut = structuredClone(before);
    cut[table].push({ illegal: true });
    assert.throws(() => verifyCut(cut, before), /CUT_MISMATCH/);
  }
  const cut = structuredClone(before);
  cut.meta[0].head = 2;
  assert.throws(() => verifyCut(cut, before), /CUT_MISMATCH/);
});
