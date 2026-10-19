"use strict";
const assert = require("node:assert/strict");
function increasing(values) {
  for (let i = 0; i < values.length; i++) {
    assert.ok(Number.isInteger(values[i]) && values[i] > 0);
    if (i) assert.ok(values[i - 1] < values[i], "EVIDENCE_ORDER");
  }
}
function assertRecoveryTimeline(x) {
  increasing([x.settled, x.spawn, x.owner, x.read, x.restored, x.fence]);
  assert.equal(x.after.epoch, x.before.epoch + 1);
  assert.ok(
    typeof x.after.token === "string" &&
      x.after.token.length > 0 &&
      x.after.token !== x.before.token,
  );
}
function assertReadAfterSettlement(settled, spawn, read) {
  increasing([settled, spawn, read]);
}
function assertAckTimeline(x) {
  increasing([
    x.reconciled,
    x.eligible,
    x.reader,
    x.publication,
    x.ack,
    x.release,
  ]);
}
module.exports = {
  assertRecoveryTimeline,
  assertReadAfterSettlement,
  assertAckTimeline,
};
