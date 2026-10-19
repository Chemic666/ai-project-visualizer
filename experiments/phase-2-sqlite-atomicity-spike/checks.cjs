"use strict";
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
function fail(code) {
  return Object.assign(new Error(code), { code });
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function verdict(executed, checks) {
  if (!executed) return "NOT TESTED";
  if (checks.some((x) => x.status === "FAIL")) return "FAIL";
  if (
    !checks.length ||
    checks.some((x) => !["PASS", "PASS WITH LIMITATION"].includes(x.status))
  )
    return "NOT TESTED";
  return "PASS WITH LIMITATION";
}
function admitEvent(event) {
  const id = event?.sourceIdentity;
  if (
    id?.kind !== "source_event" ||
    typeof id.sourceEventId !== "string" ||
    !id.sourceEventId
  )
    throw fail("CONTRACT_SCOPE_BLOCKED");
  if (id.sourceId !== event.sourceId) throw fail("SOURCE_NAMESPACE");
}
function requireSettled(state) {
  if (!(
    state.inTransaction === false &&
    (state.rollbackConfirmed === true || state.closeConfirmed === true)
  ))
    throw fail("UNSETTLED");
}
function verifyCut(actual, expected) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    throw fail("CUT_MISMATCH");
  }
}
module.exports = { fail, hash, verdict, admitEvent, requireSettled, verifyCut };
