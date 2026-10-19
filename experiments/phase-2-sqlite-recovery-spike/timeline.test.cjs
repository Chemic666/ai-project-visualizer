"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  assertRecoveryTimeline,
  assertReadAfterSettlement,
  assertAckTimeline,
} = require("./timeline.cjs");
test("recovery audit rejects early new owner and stale or reused capability", () => {
  const valid = {
    settled: 1,
    spawn: 2,
    owner: 3,
    read: 4,
    restored: 5,
    fence: 6,
    before: { epoch: 1, token: "old" },
    after: { epoch: 2, token: "new" },
  };
  assert.doesNotThrow(() => assertRecoveryTimeline(valid));
  for (const mutate of [
    (x) => {
      x.spawn = 1;
    },
    (x) => {
      x.fence = 4;
    },
    (x) => {
      x.after.epoch = 1;
    },
    (x) => {
      x.after.token = "old";
    },
  ]) {
    const x = structuredClone(valid);
    mutate(x);
    assert.throws(() => assertRecoveryTimeline(x));
  }
});
test("receipt lookup cannot retroactively use a later settlement", () => {
  assert.doesNotThrow(() => assertReadAfterSettlement(1, 2, 3));
  assert.throws(() => assertReadAfterSettlement(3, 1, 2));
});
test("ACK audit rejects acknowledgement before Reader or after Owner release", () => {
  const valid = {
    reconciled: 1,
    eligible: 2,
    reader: 3,
    publication: 4,
    ack: 5,
    release: 6,
  };
  assert.doesNotThrow(() => assertAckTimeline(valid));
  assert.throws(() => assertAckTimeline({ ...valid, ack: 2 }));
  assert.throws(() => assertAckTimeline({ ...valid, release: 4 }));
});
