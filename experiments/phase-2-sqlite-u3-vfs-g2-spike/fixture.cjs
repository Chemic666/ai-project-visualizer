"use strict";
// Synthetic complete persistence image. No production Core/Storage imports.
const crypto = require("node:crypto");
const names = [
  "control",
  "event_ledger",
  "assertions",
  "history",
  "snapshots",
  "cursors",
  "receipts",
];
const digest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function makeCuts(spec) {
  const scope = {
    project: spec.project,
    generation: spec.generation,
    epoch: spec.epoch,
  };
  const cuts = [];
  let prior;
  for (const head of [1, 2]) {
    const tables = Object.fromEntries(names.map((n) => [n, []]));
    const state = {
      ...scope,
      head,
      status: head === 1 ? "RUNNING" : "COMPLETED",
      verification: "UNVERIFIED",
      provenance: [],
      correctionHistory: [],
    };
    for (let id = 1; id <= head; id++) {
      const provenance = {
        sourceId: "fixture-source",
        sourceEventId: "source-event-" + id,
      };
      state.provenance.push(provenance);
      state.correctionHistory.push("history-" + id);
      const values = {
        event_ledger: {
          ...scope,
          eventId: "event-" + id,
          sourceIdentity: provenance,
          body: { task: "TASK-1", status: id === 1 ? "RUNNING" : "COMPLETED" },
        },
        assertions: {
          ...scope,
          assertionId: "assertion-" + id,
          eventId: "event-" + id,
          provenance,
          status: id === 1 ? "RUNNING" : "COMPLETED",
          verification: "UNVERIFIED",
        },
        history: {
          ...scope,
          historyId: "history-" + id,
          eventId: "event-" + id,
          assertionId: "assertion-" + id,
          priorAssertion: id === 1 ? null : "assertion-1",
          kind: id === 1 ? "initial" : "correction",
        },
      };
      for (const n of Object.keys(values))
        tables[n].push({ id, value: JSON.stringify(values[n]) });
    }
    const stateDigest = digest(state);
    tables.control = [
      {
        id: 1,
        value: JSON.stringify({
          ...scope,
          head,
          stateDigest,
          runId: spec.runId,
        }),
      },
    ];
    tables.cursors = [
      {
        id: 1,
        value: JSON.stringify({
          ...scope,
          position: "unit-" + head,
          coverage: Array.from({ length: head }, (_, i) => "event-" + (i + 1)),
        }),
      },
    ];
    if (prior) tables.snapshots = structuredClone(prior.tables.snapshots);
    tables.snapshots.push({
      id: head,
      value: JSON.stringify({ ...scope, watermark: head, state, stateDigest }),
    });
    if (prior) tables.receipts = structuredClone(prior.tables.receipts);
    const intent = {
      ...scope,
      operationId: (head === 1 ? "seed:" : "candidate:") + spec.runId,
      sourceEventId: "source-event-" + head,
      expectedBase: head - 1,
    };
    const receipt = {
      ...intent,
      nonce: head === 1 ? spec.baselineNonce : spec.operationNonce,
      intentDigest: digest(intent),
      resultDigest: digest(
        Object.fromEntries(
          names.filter((n) => n !== "receipts").map((n) => [n, tables[n]]),
        ),
      ),
      stateDigest,
    };
    tables.receipts.push({ id: head, value: JSON.stringify(receipt) });
    const cut = { integrity: ["ok"], foreignKeys: [], tables };
    cuts.push(cut);
    prior = cut;
  }
  return {
    before: cuts[0],
    after: cuts[1],
    candidate: JSON.parse(cuts[1].tables.receipts[1].value),
  };
}
module.exports = { names, digest, makeCuts };
