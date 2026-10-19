"use strict";
const { isDeepStrictEqual } = require("node:util");
const { validateCut, intentDigest } = require("./oracle.cjs");
function unavailable(reason) {
  return {
    status: "unavailable",
    reason,
    mayAck: false,
    mayReplay: false,
    mayPublish: false,
  };
}
function settled(proof, suspect) {
  if (
    proof?.confirmed !== true ||
    !Number.isInteger(suspect?.pid) ||
    suspect.pid <= 0 ||
    typeof suspect.nonce !== "string" ||
    !suspect.nonce ||
    typeof suspect.workerId !== "string" ||
    !/^[a-z]+-\d+$/.test(suspect.workerId) ||
    proof.pid !== suspect.pid ||
    proof.workerNonce !== suspect.nonce
  )
    return false;
  if (proof.kind === "verified_rollback_close") {
    const prefix = `${suspect.workerId}:`;
    return (
      proof.inTransaction === false &&
      proof.closeConfirmed === true &&
      typeof proof.evidenceRef === "string" &&
      proof.evidenceRef.startsWith(prefix) &&
      /^[1-9]\d*$/.test(proof.evidenceRef.slice(prefix.length))
    );
  }
  if (proof.kind === "owned_process_exit")
    return (
      proof.evidenceRef === `lifecycle:${suspect.workerId}` &&
      proof.exitObserved === true &&
      proof.throughOwnedChildProcess === true &&
      !!proof.exit &&
      Number.isInteger(proof.exit.parentOrder) &&
      proof.exit.parentOrder > 0 &&
      (Number.isInteger(proof.exit.code) ||
        (typeof proof.exit.signal === "string" && proof.exit.signal.length > 0))
    );
  return false;
}
function reconcile({
  cut,
  fixture,
  binding,
  execution,
  settlement,
  suspect,
  allowProvenAbsence = false,
}) {
  if (!settled(settlement, suspect)) return unavailable("UNSETTLED");
  try {
    const restored = validateCut(cut, fixture, binding);
    const receipt = cut.operation_receipts.find(
      (r) => r.operation === fixture.operationId,
    );
    if (!receipt) {
      // Only the specifically reviewed U1/R1 old-cut proof may use absence.
      if (
        allowProvenAbsence &&
        restored.head === 1 &&
        execution?.epoch > 0 &&
        execution.token
      )
        return {
          status: "not_committed_proven",
          restored,
          mayAck: false,
          mayReplay: false,
          mayPublish: false,
        };
      return unavailable("RECEIPT_ABSENT_WITHOUT_FULL_ABSENCE_PROOF");
    }
    if (
      receipt.nonce !== execution?.token ||
      receipt.epoch !== execution?.epoch ||
      receipt.intent_digest !== intentDigest(fixture)
    )
      return unavailable("EXECUTION_OR_INTENT_MISMATCH");
    return {
      status: "committed",
      restored,
      receipt,
      mayAck: false,
      mayReplay: false,
      mayPublish: false,
    };
  } catch {
    return unavailable("AUTHORITY_OR_BINDING_UNPROVEN");
  }
}
function compareClaim(existing, incoming) {
  if (
    existing.projectId !== incoming.projectId ||
    existing.sourceId !== incoming.sourceId
  )
    return "identity_conflict";
  if (existing.id === incoming.id)
    return isDeepStrictEqual(existing, incoming)
      ? "internal_duplicate"
      : "identity_conflict";
  const a = existing.sourceIdentity,
    b = incoming.sourceIdentity;
  if (
    a?.kind !== "source_event" ||
    b?.kind !== "source_event" ||
    a.sourceId !== b.sourceId ||
    a.sourceEventId !== b.sourceEventId
  )
    return "new_input";
  const { id: _aId, receivedAt: _aTime, ...aClaim } = existing;
  const { id: _bId, receivedAt: _bTime, ...bClaim } = incoming;
  return isDeepStrictEqual(aClaim, bClaim)
    ? "stable_duplicate"
    : "identity_conflict";
}
function ackEligibility(input) {
  if (
    input.ownerHeld !== true ||
    input.sourceProtocol !== "synthetic-complete-unit-v1"
  )
    return false;
  const decision = reconcile(input),
    row = input.cut?.control?.[0],
    cap = input.capability;
  return (
    decision.status === "committed" &&
    cap?.project === row?.project &&
    cap?.generation === row?.generation &&
    cap?.epoch === row?.epoch &&
    cap?.token === row?.token
  );
}
module.exports = {
  reconcile,
  compareClaim,
  settled,
  unavailable,
  ackEligibility,
};
