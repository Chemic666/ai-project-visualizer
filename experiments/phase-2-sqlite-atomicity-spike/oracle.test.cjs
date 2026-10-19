"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkReceipts, checkComplete } = require("./oracle.cjs");
const { hash } = require("./checks.cjs");
test("missing or mismatched receipt evidence is an infrastructure gap, not protocol FAIL", () => {
  const identity = { runId: "R", workerId: "W", nonce: "N", pid: 7 };
  const rows = [{ ...identity, sequence: 1, kind: "ready" }];
  assert.throws(() => checkReceipts(rows, identity, true), {
    code: "EVIDENCE_INCOMPLETE",
  });
  assert.throws(
    () => checkReceipts([{ ...rows[0], nonce: "OTHER" }], identity),
    { code: "EVIDENCE_INCOMPLETE" },
  );
  assert.throws(() => checkReceipts([{ sequence: 1 }], {}), {
    code: "EVIDENCE_INCOMPLETE",
  });
});
test("raw receipt binding, contiguous sequence and actual SQL are required", () => {
  const identity = { runId: "R", workerId: "W", nonce: "N", pid: 7 };
  const rows = [
    { ...identity, sequence: 1, kind: "ready" },
    {
      ...identity,
      sequence: 2,
      kind: "sql_oracle",
      data: { queries: ["SELECT"], cut: {} },
    },
  ];
  assert.doesNotThrow(() => checkReceipts(rows, identity, true));
  assert.throws(() => checkReceipts(rows.slice(0, 1), identity, true));
  assert.throws(() =>
    checkReceipts([{ ...rows[0], nonce: "OTHER" }], identity),
  );
  assert.throws(() => checkReceipts([{ ...rows[0], sequence: 2 }], identity));
});
test("complete SQL oracle cannot accept missing tables or Writer summary", () => {
  assert.throws(() => checkComplete({ head: 2, writerSaysSuccess: true }, {}));
  assert.throws(() => checkComplete({ control: [{ head: 2 }] }, {}));
});
test("complete independent synthetic cut rejects changed cursor, provenance or receipt epoch", () => {
  // Handwritten plain evidence test only, never SQLite/runtime evidence.
  const event = {
    id: "E",
    sourceId: "SRC",
    sourceIdentity: { sourceEventId: "K" },
  };
  const a = { id: "A", provenance: "agent_reported" };
  const before = {
    projects: [],
    phases: [],
    tasks: [],
    sessions: [],
    assertions: [],
    corrections: [],
    resolvedConclusions: [],
    acceptedEvents: [],
  };
  const after = { ...before, assertions: [a], acceptedEvents: [event] };
  const checkpoint = {
    sourceId: "SRC",
    stream: "stream",
    position: "one",
    ledgerSequence: 2,
    coveredEventIds: ["E"],
  };
  const f = {
    projectId: "P",
    generation: "G",
    operationId: "O",
    before,
    after,
    event,
    checkpoint,
  };
  const cap = { epoch: 2, token: "new" };
  const { acceptedEvents: _events, ...image } = after;
  const cut = {
    control: [
      {
        project: "P",
        generation: "G",
        epoch: 2,
        token: "new",
        head: 2,
        digest: hash(after),
      },
    ],
    commits: [
      { seq: 1 },
      {
        seq: 2,
        operation: "O",
        base: 1,
        epoch: 2,
        token: "new",
        previous_digest: hash(before),
        result_digest: hash(after),
      },
    ],
    events: [
      {
        id: "E",
        source: "SRC",
        source_event: "K",
        seq: 2,
        body: JSON.stringify(event),
      },
    ],
    assertions: [{ id: "A", seq: 2, body: JSON.stringify(a) }],
    entity_versions: [],
    correction_versions: [],
    conclusion_versions: [],
    dedup: [
      {
        source: "SRC",
        source_event: "K",
        event_id: "E",
        seq: 2,
        digest: hash(event),
      },
    ],
    snapshots: [
      { watermark: 1 },
      {
        watermark: 2,
        body: JSON.stringify(image),
        digest: hash(after),
        vector: JSON.stringify([checkpoint]),
      },
    ],
    checkpoints: [
      {
        source: "SRC",
        stream: "stream",
        seq: 2,
        body: JSON.stringify(checkpoint),
      },
    ],
  };
  assert.doesNotThrow(() => checkComplete(cut, f, cap));
  const badCursor = structuredClone(cut);
  badCursor.checkpoints[0].body = JSON.stringify({
    ...checkpoint,
    position: "two",
  });
  assert.throws(() => checkComplete(badCursor, f, cap));
  const badProvenance = structuredClone(cut);
  badProvenance.assertions[0].body = JSON.stringify({
    ...a,
    provenance: "observed",
  });
  assert.throws(() => checkComplete(badProvenance, f, cap));
  const badEpoch = structuredClone(cut);
  badEpoch.commits[1].epoch = 1;
  assert.throws(() => checkComplete(badEpoch, f, cap));
});
