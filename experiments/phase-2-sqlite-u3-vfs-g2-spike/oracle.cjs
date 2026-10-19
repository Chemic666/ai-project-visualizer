"use strict";
const { isDeepStrictEqual } = require("node:util");
function reconcile({ cut, before, after, settlement, writer }) {
  const blocked = (reason) => ({
    outcome: "unavailable",
    reason,
    replay: false,
    publish: false,
    ack: false,
  });
  if (
    !settlement ||
    !settlement.observedExit ||
    !settlement.workerComplete ||
    settlement.pid !== writer.pid ||
    settlement.nonce !== writer.nonce ||
    settlement.status !== 0 ||
    settlement.signal !== null ||
    settlement.error !== null
  )
    return blocked("writer settlement not proven");
  if (
    !cut ||
    !isDeepStrictEqual(cut.integrity, ["ok"]) ||
    !isDeepStrictEqual(cut.foreignKeys, [])
  )
    return blocked("unreadable or unhealthy authority");
  if (isDeepStrictEqual(cut, after))
    return {
      outcome: "committed",
      reason: "exact complete candidate authority and receipt",
      replay: false,
      publish: false,
      ack: false,
    };
  if (isDeepStrictEqual(cut, before))
    return {
      outcome: "not_committed",
      reason:
        "settled healthy exact complete baseline; candidate absent in every table",
      replay: false,
      publish: false,
      ack: false,
    };
  return blocked("authority/receipt/nonce/epoch/intent/cut contradiction");
}
module.exports = { reconcile };
