"use strict";
// Synthetic SQL rows for pure decision tests, never runtime evidence.
const { createRequire, Module } = require("node:module");
const path = require("node:path");
const { hash } = require("./checks.cjs");
function fixtureModule() {
  const toolRoot =
    process.env.APV_PREP_TOOL_ROOT || path.resolve(__dirname, "../..");
  const local = createRequire(path.join(toolRoot, "package.json"));
  const result = local("esbuild").buildSync({
    entryPoints: [path.join(__dirname, "fixtures.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
  const filename = path.join(__dirname, "pure-fixture.cjs");
  const module = new Module(filename);
  module.filename = filename;
  module._compile(result.outputFiles[0].text, filename);
  return module.exports;
}
function testData() {
  const fixture = fixtureModule().createFixtures();
  const execution = { epoch: 1, token: "original-acquisition-nonce" };
  const binding = {
    runId: "test-run",
    unit: "test-unit",
    project: "PA",
    generation: "G1",
    fingerprint: "test-fingerprint",
  };
  const intent = hash({
    operationId: fixture.operationId,
    project: fixture.projectId,
    generation: fixture.generation,
    before: fixture.before,
    after: fixture.after,
    event: fixture.event,
    checkpoint: fixture.checkpoint,
  });
  const cut = {
    control: [
      {
        id: 1,
        project: "PA",
        generation: "G1",
        epoch: 1,
        token: execution.token,
        head: 2,
        digest: hash(fixture.after),
      },
    ],
    commits: [
      {
        seq: 1,
        operation: "BOOTSTRAP",
        base: 0,
        epoch: 0,
        token: "",
        previous_digest: "",
        result_digest: hash(fixture.before),
      },
      {
        seq: 2,
        operation: "OP-E1",
        base: 1,
        epoch: 1,
        token: execution.token,
        previous_digest: hash(fixture.before),
        result_digest: hash(fixture.after),
      },
    ],
    events: [
      {
        id: "E1",
        source: "SRC-A",
        source_event: "K1",
        seq: 2,
        body: JSON.stringify(fixture.event),
      },
    ],
    assertions: fixture.after.assertions.map((a) => ({
      id: a.id,
      seq: fixture.before.assertions.some((old) => old.id === a.id) ? 1 : 2,
      body: JSON.stringify(a),
    })),
    entity_versions: [],
    correction_versions: [],
    conclusion_versions: [],
    dedup: [
      {
        source: "SRC-A",
        source_event: "K1",
        event_id: "E1",
        seq: 2,
        digest: hash(fixture.event),
      },
    ],
    snapshots: [],
    checkpoints: [
      {
        source: "SRC-A",
        stream: "fixture",
        seq: 2,
        body: JSON.stringify(fixture.checkpoint),
      },
    ],
    fixture_meta: [{ id: 1, ...binding, schema: 1 }],
    operation_receipts: [
      {
        operation: "OP-E1",
        project: "PA",
        generation: "G1",
        seq: 2,
        epoch: 1,
        nonce: execution.token,
        intent_digest: intent,
        result_digest: hash(fixture.after),
        coverage: JSON.stringify(fixture.checkpoint),
      },
    ],
  };
  for (const [seq, state] of [
    [1, fixture.before],
    [2, fixture.after],
  ]) {
    for (const kind of ["projects", "phases", "tasks", "sessions"])
      state[kind].forEach((v, ordinal) =>
        cut.entity_versions.push({
          kind,
          id: v.id,
          seq,
          ordinal,
          body: JSON.stringify(v),
        }),
      );
    for (const c of state.corrections)
      cut.correction_versions.push({ id: c.id, seq, body: JSON.stringify(c) });
    for (const c of state.resolvedConclusions)
      cut.conclusion_versions.push({
        target: c.target,
        target_id: c.targetId,
        seq,
        body: JSON.stringify(c),
      });
    const { acceptedEvents: _events, ...image } = state;
    cut.snapshots.push({
      watermark: seq,
      body: JSON.stringify(image),
      digest: hash(state),
      vector: JSON.stringify(seq === 1 ? [] : [fixture.checkpoint]),
    });
  }
  return {
    fixture,
    execution,
    binding,
    intent,
    cut,
    suspect: { pid: 10, nonce: "writer-nonce", workerId: "writer-1" },
    settlement: {
      confirmed: true,
      kind: "verified_rollback_close",
      evidenceRef: "writer-1:1",
      pid: 10,
      workerNonce: "writer-nonce",
      inTransaction: false,
      closeConfirmed: true,
    },
  };
}
module.exports = { fixtureModule, testData };
