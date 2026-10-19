"use strict";
const assert = require("node:assert/strict");
const { hash, fail } = require("./checks.cjs");
function checkReceipts(rows, identity, requireSQL = false) {
  try {
    assert.ok(rows.length);
    for (const key of ["runId", "workerId", "nonce"])
      assert.ok(typeof identity[key] === "string" && identity[key].length > 0);
    assert.ok(Number.isInteger(identity.pid) && identity.pid > 0);
    rows.forEach((row, index) => {
      for (const key of ["runId", "workerId", "nonce", "pid"])
        assert.equal(row[key], identity[key]);
      assert.equal(row.sequence, index + 1);
    });
    if (requireSQL)
      assert.ok(
        rows.some(
          (row) =>
            row.kind === "sql_oracle" &&
            Array.isArray(row.data?.queries) &&
            row.data.queries.length > 0 &&
            row.data.cut,
        ),
      );
  } catch (cause) {
    throw Object.assign(fail("EVIDENCE_INCOMPLETE"), { cause });
  }
}
function checkComplete(cut, fixture, capability) {
  // Reconstruction uses raw SQL, never a Writer success summary.
  const control = cut.control[0];
  assert.equal(cut.control.length, 1);
  assert.equal(control.project, fixture.projectId);
  assert.equal(control.generation, fixture.generation);
  assert.equal(control.epoch, capability.epoch);
  assert.equal(control.token, capability.token);
  assert.equal(control.head, 2);
  assert.equal(control.digest, hash(fixture.after));
  assert.equal(cut.commits.length, 2);
  const receipt = cut.commits[1];
  assert.deepEqual(receipt, {
    seq: 2,
    operation: fixture.operationId,
    base: 1,
    epoch: capability.epoch,
    token: capability.token,
    previous_digest: hash(fixture.before),
    result_digest: hash(fixture.after),
  });
  assert.equal(cut.events.length, 1);
  assert.deepEqual(cut.events[0], {
    id: fixture.event.id,
    source: fixture.event.sourceId,
    source_event: fixture.event.sourceIdentity.sourceEventId,
    seq: 2,
    body: JSON.stringify(fixture.event),
  });
  for (const kind of ["projects", "phases", "tasks", "sessions"]) {
    const rows = cut.entity_versions
      .filter((row) => row.kind === kind && row.seq === 2)
      .sort((a, b) => a.ordinal - b.ordinal);
    assert.deepEqual(
      rows.map((row) => JSON.parse(row.body)),
      fixture.after[kind],
    );
  }
  const assertions = cut.assertions.map((row) => JSON.parse(row.body));
  assert.deepEqual(assertions, fixture.after.assertions);
  for (const old of fixture.before.assertions)
    assert.deepEqual(
      assertions.find((a) => a.id === old.id),
      old,
    );
  for (const [table, key] of [
    ["correction_versions", "corrections"],
    ["conclusion_versions", "resolvedConclusions"],
  ]) {
    assert.deepEqual(
      cut[table]
        .filter((row) => row.seq === 1)
        .map((row) => JSON.parse(row.body)),
      fixture.before[key],
    );
    assert.deepEqual(
      cut[table]
        .filter((row) => row.seq === 2)
        .map((row) => JSON.parse(row.body)),
      fixture.after[key],
    );
  }
  const { acceptedEvents: _events, ...image } = fixture.after;
  assert.deepEqual(fixture.after.acceptedEvents, [fixture.event]);
  assert.equal(cut.snapshots.length, 2);
  assert.equal(cut.snapshots[1].watermark, 2);
  assert.deepEqual(JSON.parse(cut.snapshots[1].body), image);
  assert.equal(cut.snapshots[1].digest, hash(fixture.after));
  assert.deepEqual(JSON.parse(cut.snapshots[1].vector), [fixture.checkpoint]);
  assert.equal(cut.checkpoints.length, 1);
  assert.deepEqual(cut.checkpoints[0], {
    source: fixture.checkpoint.sourceId,
    stream: fixture.checkpoint.stream,
    seq: 2,
    body: JSON.stringify(fixture.checkpoint),
  });
  assert.equal(cut.dedup.length, 1);
  assert.deepEqual(cut.dedup[0], {
    source: fixture.event.sourceId,
    source_event: fixture.event.sourceIdentity.sourceEventId,
    event_id: fixture.event.id,
    seq: 2,
    digest: hash(fixture.event),
  });
}
module.exports = { checkReceipts, checkComplete };
