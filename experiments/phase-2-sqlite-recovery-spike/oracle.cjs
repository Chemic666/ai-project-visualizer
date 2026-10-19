"use strict";
const assert = require("node:assert/strict");
const { hash, fail } = require("./checks.cjs");
const { checkComplete } = require("./reference-oracle.cjs");
const collections = ["projects", "phases", "tasks", "sessions"];
const tables = [
  "control",
  "commits",
  "events",
  "assertions",
  "entity_versions",
  "correction_versions",
  "conclusion_versions",
  "dedup",
  "snapshots",
  "checkpoints",
  "fixture_meta",
  "operation_receipts",
];
function intentDigest(fixture) {
  return hash({
    operationId: fixture.operationId,
    project: fixture.projectId,
    generation: fixture.generation,
    before: fixture.before,
    after: fixture.after,
    event: fixture.event,
    checkpoint: fixture.checkpoint,
  });
}
function reconstruct(cut, head) {
  const state = {};
  for (const kind of collections)
    state[kind] = cut.entity_versions
      .filter((row) => row.kind === kind && row.seq === head)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((row) => JSON.parse(row.body));
  state.assertions = cut.assertions
    .filter((row) => row.seq <= head)
    .map((row) => JSON.parse(row.body));
  state.resolvedConclusions = cut.conclusion_versions
    .filter((row) => row.seq === head)
    .map((row) => JSON.parse(row.body));
  state.corrections = cut.correction_versions
    .filter((row) => row.seq === head)
    .map((row) => JSON.parse(row.body));
  state.acceptedEvents = cut.events
    .filter((row) => row.seq <= head)
    .map((row) => JSON.parse(row.body));
  return state;
}
function validateCut(cut, fixture, binding) {
  try {
    for (const name of tables)
      assert.ok(Array.isArray(cut?.[name]), `MISSING_TABLE:${name}`);
    assert.deepEqual(cut.fixture_meta, [{ id: 1, ...binding, schema: 1 }]);
    assert.equal(cut.control.length, 1);
    const control = cut.control[0],
      head = control.head;
    assert.ok(head === 1 || head === 2, "FIXTURE_HEAD_OUT_OF_SCOPE");
    assert.equal(control.project, fixture.projectId);
    assert.equal(control.generation, fixture.generation);
    assert.ok(Number.isSafeInteger(control.epoch) && control.epoch >= 0);
    assert.equal(typeof control.token, "string");
    assert.ok(
      control.epoch === 0 ? control.token === "" : control.token.length > 0,
    );
    assert.deepEqual(cut.commits[0], {
      seq: 1,
      operation: "BOOTSTRAP",
      base: 0,
      epoch: 0,
      token: "",
      previous_digest: "",
      result_digest: hash(fixture.before),
    });
    assert.equal(cut.commits.length, head);
    let entityCount = 0,
      correctionCount = 0,
      conclusionCount = 0;
    for (let seq = 1; seq <= head; seq++) {
      const expected = seq === 1 ? fixture.before : fixture.after;
      for (const kind of collections) {
        const rows = cut.entity_versions.filter(
          (row) => row.kind === kind && row.seq === seq,
        );
        entityCount += expected[kind].length;
        assert.deepEqual(
          rows,
          expected[kind].map((v, ordinal) => ({
            kind,
            id: v.id,
            seq,
            ordinal,
            body: JSON.stringify(v),
          })),
        );
      }
      correctionCount += expected.corrections.length;
      conclusionCount += expected.resolvedConclusions.length;
      assert.deepEqual(
        cut.correction_versions.filter((r) => r.seq === seq),
        expected.corrections.map((c) => ({
          id: c.id,
          seq,
          body: JSON.stringify(c),
        })),
      );
      assert.deepEqual(
        cut.conclusion_versions.filter((r) => r.seq === seq),
        expected.resolvedConclusions.map((c) => ({
          target: c.target,
          target_id: c.targetId,
          seq,
          body: JSON.stringify(c),
        })),
      );
      const { acceptedEvents: _events, ...image } = expected;
      assert.deepEqual(cut.snapshots[seq - 1], {
        watermark: seq,
        body: JSON.stringify(image),
        digest: hash(expected),
        vector: JSON.stringify(seq === 1 ? [] : [fixture.checkpoint]),
      });
    }
    assert.equal(cut.entity_versions.length, entityCount);
    assert.equal(cut.correction_versions.length, correctionCount);
    assert.equal(cut.conclusion_versions.length, conclusionCount);
    assert.equal(cut.snapshots.length, head);
    const expected = head === 1 ? fixture.before : fixture.after;
    assert.deepEqual(
      cut.assertions,
      expected.assertions.map((a) => ({
        id: a.id,
        seq: fixture.before.assertions.some((v) => v.id === a.id) ? 1 : 2,
        body: JSON.stringify(a),
      })),
    );
    if (head === 1) {
      for (const name of [
        "events",
        "dedup",
        "checkpoints",
        "operation_receipts",
      ])
        assert.deepEqual(cut[name], []);
    } else {
      const commit = cut.commits[1];
      assert.ok(commit.epoch > 0 && commit.epoch <= control.epoch);
      if (commit.epoch === control.epoch)
        assert.equal(commit.token, control.token);
      // Historical operation token need not equal a legitimately newer Owner.
      checkComplete(
        {
          ...cut,
          control: [{ ...control, epoch: commit.epoch, token: commit.token }],
        },
        fixture,
        { epoch: commit.epoch, token: commit.token },
      );
      assert.deepEqual(cut.operation_receipts, [
        {
          operation: fixture.operationId,
          project: fixture.projectId,
          generation: fixture.generation,
          seq: 2,
          epoch: commit.epoch,
          nonce: commit.token,
          intent_digest: intentDigest(fixture),
          result_digest: hash(fixture.after),
          coverage: JSON.stringify(fixture.checkpoint),
        },
      ]);
    }
    const state = reconstruct(cut, head);
    assert.deepEqual(state, expected);
    assert.equal(control.digest, hash(state));
    return {
      state,
      head,
      digest: hash(state),
      checkpoints: head === 1 ? [] : [fixture.checkpoint],
    };
  } catch (cause) {
    throw Object.assign(fail("RECOVERY_UNAVAILABLE"), { cause });
  }
}
module.exports = { validateCut, reconstruct, intentDigest, tables };
