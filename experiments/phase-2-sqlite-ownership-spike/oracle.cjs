"use strict";
const { hash, failure, intentDigest } = require("./protocol.cjs");
const CASE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_, i) => `OP${String(i + 1).padStart(2, "0")}`),
);
function aggregate(statuses) {
  if (
    statuses.some((status) => !["PASS", "FAIL", "NOT TESTED"].includes(status))
  )
    throw failure("APV_VERDICT");
  if (statuses.includes("FAIL")) return "FAIL";
  return statuses.length && statuses.every((status) => status === "PASS")
    ? "PASS"
    : "NOT TESTED";
}
function classifyCounterexample(result) {
  if (
    typeof result.ownerLost !== "boolean" ||
    typeof result.committed !== "boolean" ||
    typeof result.sameEpoch !== "boolean"
  )
    return "NOT TESTED";
  if (result.ownerLost && result.committed && result.sameEpoch)
    return result.mode === "unsafe_baseline"
      ? "EXPECTED COUNTEREXAMPLE"
      : "FAIL";
  return result.mode === "unsafe_baseline" ? "NOT REPRODUCED" : "PASS";
}
function validateReceipt(receipt, expected, lastSequence) {
  if (!receipt || typeof receipt !== "object") throw failure("APV_RECEIPT");
  for (const key of ["runId", "caseId", "workerId", "nonce"])
    if (receipt[key] !== expected[key]) throw failure("APV_RECEIPT_BINDING");
  if (
    !Number.isSafeInteger(receipt.sequence) ||
    receipt.sequence !== lastSequence + 1 ||
    typeof receipt.kind !== "string" ||
    !receipt.data ||
    typeof receipt.data !== "object"
  )
    throw failure("APV_RECEIPT_SEQUENCE");
  return true;
}
function verifySQL(snapshot, expected) {
  if (
    !snapshot ||
    snapshot.meta?.project_id !== expected.projectId ||
    snapshot.meta.generation !== expected.generation
  )
    throw failure("APV_ORACLE_BINDING");
  const { meta, state, writes } = snapshot;
  if (
    !Number.isSafeInteger(meta.head) ||
    meta.head < 0 ||
    !Number.isSafeInteger(meta.epoch) ||
    meta.epoch < 0 ||
    meta.head !== state?.value ||
    meta.digest !== state.digest ||
    state.digest !== hash({ head: meta.head, value: state.value }) ||
    !Array.isArray(writes) ||
    writes.length !== meta.head
  )
    throw failure("APV_ORACLE_CUT");
  writes.forEach((row, index) => {
    if (
      row.base_head !== index ||
      row.new_head !== index + 1 ||
      row.result_digest !== hash({ head: index + 1, value: index + 1 }) ||
      row.epoch < 1 ||
      row.epoch > meta.epoch ||
      !row.token
    )
      throw failure("APV_ORACLE_HISTORY");
  });
  return snapshot;
}

// OP04's exact fixture history, including the acquisition that authored each
// row. This is an evidence assertion, not a change to the ownership protocol.
function verifyOP04Cut(snapshot, binding, current, history) {
  verifySQL(snapshot, binding);
  if (
    snapshot.meta.lifecycle !== "active" ||
    snapshot.meta.epoch !== current.epoch ||
    snapshot.meta.token !== current.token ||
    snapshot.meta.head !== history.length
  )
    throw failure("APV_ORACLE_CUT");
  snapshot.writes.forEach((row, index) => {
    if (
      row.operation_id !== `O${index + 1}` ||
      row.epoch !== history[index].epoch ||
      row.token !== history[index].token ||
      row.intent_digest !==
        intentDigest({
          operationId: `O${index + 1}`,
          base: index,
          increment: 1,
        })
    )
      throw failure("APV_ORACLE_HISTORY");
  });
  return snapshot;
}
module.exports = {
  CASE_IDS,
  aggregate,
  classifyCounterexample,
  validateReceipt,
  verifySQL,
  verifyOP04Cut,
};
