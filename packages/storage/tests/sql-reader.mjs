// Independent SQL oracle. Imports neither the adapter/codec nor its restoration.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  return v;
}
const digest = (v) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
const require = createRequire(path.join(spec.driverRoot, "package.json"));
const Database = require(spec.driverRoot);
const db = new Database(spec.databaseFile, {
  readonly: true,
  fileMustExist: true,
});
const tableNames = [
  "store_meta",
  "commits",
  "normalized_events",
  "entity_versions",
  "assertions",
  "correction_versions",
  "conclusion_versions",
  "snapshots",
  "source_checkpoint_versions",
];
try {
  assert.equal(spec.writerSettlement.status, 0);
  assert.equal(spec.writerSettlement.closed, true);
  assert.notEqual(spec.writerSettlement.pid, process.pid);
  if (spec.recoverySettlement) {
    assert.equal(spec.recoverySettlement.status, 0);
    assert.equal(spec.recoverySettlement.closed, true);
    assert.notEqual(spec.recoverySettlement.pid, process.pid);
  }
  db.exec("BEGIN");
  const cut = {
    pid: process.pid,
    parentPid: process.ppid,
    writerSettlement: spec.writerSettlement,
    sqliteVersion: db.prepare("SELECT sqlite_version() AS v").get().v,
    recoverySettlement: spec.recoverySettlement ?? null,
    integrity: db.pragma("integrity_check"),
    foreignKeys: db.pragma("foreign_key_check"),
    tables: Object.fromEntries(
      tableNames.map((name) => [
        name,
        db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
      ]),
    ),
  };
  db.exec("COMMIT");
  db.close();
  // Preserve raw Reader output even if an independent invariant fails below.
  fs.writeFileSync(
    path.join(spec.evidence, "reader.cut.json"),
    JSON.stringify(cut, null, 2),
    { flag: "wx" },
  );
  assert.equal(cut.sqliteVersion, "3.53.4");
  assert.deepEqual(cut.integrity, [{ integrity_check: "ok" }]);
  assert.deepEqual(cut.foreignKeys, []);
  const t = cut.tables,
    expected = spec.expectedState,
    head = spec.expectedHead ?? 2;
  assert([1, 2].includes(head));
  assert.equal(t.store_meta.length, 1);
  assert.equal(t.commits.length, head);
  assert.equal(t.normalized_events.length, head - 1);
  assert.equal(t.assertions.length, head + 1);
  assert.equal(t.entity_versions.length, 3 * head);
  assert.equal(t.correction_versions.length, head);
  assert.equal(t.conclusion_versions.length, head);
  assert.equal(t.snapshots.length, head);
  assert.equal(t.source_checkpoint_versions.length, head - 1);
  const meta = t.store_meta[0];
  assert.equal(meta.project_id, "PA");
  assert.equal(meta.generation, "G1");
  assert.equal(meta.processor, spec.processorFingerprint);
  assert.equal(meta.head, head);
  assert.equal(meta.writer_epoch, spec.expectedWriterEpoch ?? 1);
  assert.equal(meta.lifecycle, "active");
  assert.match(meta.owner_token, /^[0-9a-f-]{36}$/);
  assert.match(meta.control_nonce, /^[0-9a-f-]{36}$/);
  for (const table of tableNames)
    for (const row of t[table])
      if (row.body !== undefined)
        assert.equal(digest(JSON.parse(row.body)), row.body_digest);
  const current = {};
  for (const k of ["projects", "phases", "tasks", "sessions"])
    current[k] = t.entity_versions
      .filter((r) => r.kind === k && r.seq === head)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((r) => JSON.parse(r.body));
  current.assertions = [...t.assertions]
    .sort((a, b) => a.seq - b.seq || a.ordinal - b.ordinal)
    .map((r) => JSON.parse(r.body));
  current.corrections = t.correction_versions
    .filter((r) => r.seq === head)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((r) => JSON.parse(r.body));
  current.resolvedConclusions = t.conclusion_versions
    .filter((r) => r.seq === head)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((r) => JSON.parse(r.body));
  current.acceptedEvents = t.normalized_events.map((r) => JSON.parse(r.body));
  assert.deepEqual(current, expected);
  assert.equal(meta.state_digest, digest(expected));
  const e = t.normalized_events[0];
  const c =
    head === 2 ? JSON.parse(t.source_checkpoint_versions[0].body) : undefined;
  let claim;
  if (head === 2) {
    assert.equal(e.event_id, "E1");
    assert.equal(e.seq, 2);
    assert.equal(e.source_id, "SRC");
    assert.equal(e.source_event_id, "source:E1");
    const { id: _id, receivedAt: _time, ...body } = expected.acceptedEvents[0];
    claim = body;
    assert.equal(e.claim_digest, digest(claim));
    assert.deepEqual(c, {
      sourceId: "SRC",
      streamId: "stream",
      codec: "synthetic.v1",
      position: "batch:1",
      expectedPrevious: null,
      coveredEventIds: ["E1"],
    });
  }
  const old =
    head === 1
      ? expected
      : {
          ...expected,
          tasks: expected.tasks.map((task) => ({
            ...task,
            statusAssertionIds: [],
          })),
          assertions: expected.assertions.filter(
            (a) => a.id !== "core:assertion:task.status:E1",
          ),
          acceptedEvents: [],
        };
  for (const r of t.entity_versions)
    assert.deepEqual(
      JSON.parse(r.body),
      (r.seq === 1 ? old : expected)[r.kind][r.ordinal],
    );
  for (const r of t.correction_versions)
    assert.deepEqual(JSON.parse(r.body), expected.corrections[r.ordinal]);
  for (const r of t.conclusion_versions)
    assert.deepEqual(
      JSON.parse(r.body),
      expected.resolvedConclusions[r.ordinal],
    );
  for (const r of t.snapshots) {
    const state = r.watermark === 1 ? old : expected,
      { acceptedEvents: _events, ...domain } = state;
    assert.deepEqual(JSON.parse(r.body), {
      domain,
      generation: "G1",
      processor: spec.processorFingerprint,
      sourceVector: r.watermark === 1 ? [] : [c],
      watermark: r.watermark,
    });
  }
  for (const r of t.commits) {
    const intent = JSON.parse(r.intent_json),
      result = JSON.parse(r.result_json),
      state = r.seq === 1 ? old : expected;
    assert.equal(r.seq, intent.expectedHead + 1);
    assert.equal(r.operation_id, intent.operationId);
    assert.equal(r.nonce, intent.operationNonce);
    assert.equal(r.project_id, "PA");
    assert.equal(r.generation, "G1");
    assert.equal(r.epoch, r.seq - 1);
    assert.equal(intent.projectId, "PA");
    assert.equal(intent.generation, "G1");
    assert.equal(r.intent_digest, digest(intent));
    assert.equal(r.result_digest, digest(result));
    assert.equal(r.state_digest, digest(state));
    assert.equal(result.stateDigest, digest(state));
    assert.equal(result.head, r.seq);
    assert.equal(result.cursorVectorDigest, digest(r.seq === 1 ? [] : [c]));
    assert.deepEqual(result.canonicalEventIds, r.seq === 1 ? [] : ["E1"]);
    if (r.seq === 1) {
      assert.equal(intent.seedDigest, digest(old));
      assert.equal(intent.operationId, "bootstrap");
    } else {
      assert.equal(intent.operationId, "op:E1");
      assert.equal(intent.operationNonce, "nonce:E1");
      assert.deepEqual(intent.eventClaims, [
        { internalId: null, claim: digest(claim) },
      ]);
      assert.deepEqual(intent.cursor, c);
      assert.equal(intent.createSnapshot, true);
    }
  }
  if (head === 2) {
    assert.equal(current.assertions.at(-1).provenance, "agent_reported");
    assert.equal(current.assertions.at(-1).value, "completed");
  }
  fs.writeFileSync(
    path.join(spec.evidence, "reader.result.json"),
    JSON.stringify(
      {
        pid: process.pid,
        tableCount: tableNames.length,
        head,
        fullStateMatch: true,
        stateDigest: digest(expected),
        cutSha256: createHash("sha256")
          .update(fs.readFileSync(path.join(spec.evidence, "reader.cut.json")))
          .digest("hex"),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
} catch {
  if (db.open) db.close();
  console.error("independent_sql_oracle_failed");
  process.exitCode = 1;
}
