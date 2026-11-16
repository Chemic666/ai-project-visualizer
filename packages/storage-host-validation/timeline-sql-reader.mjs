// A final-cut reader for the fixed v5 case. It does not import the store,
// codec, or any Core processors.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const columns = ["projects", "phases", "tasks", "sessions"];
const tables = [
  "store_meta",
  "commits",
  "normalized_events",
  "entity_versions",
  "assertions",
  "correction_versions",
  "conclusion_versions",
  "snapshots",
  "source_checkpoint_versions",
  "plan_versions",
  "progress_versions",
  "timeline_versions",
];
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
let db,
  phase = "admission";
try {
  const specFile = process.argv[2];
  const spec = json(specFile);
  const temp = fs.realpathSync.native(os.tmpdir());
  assert.equal(spec.storeModel, "timeline-v5");
  assert.equal(spec.rootMode, "temp");
  assert.match(spec.runId, uuid);
  assert.match(spec.storeKey, uuid);
  assert.equal(spec.evidence, path.join(temp, "apv-b1-host-" + spec.runId));
  assert.equal(specFile, path.join(spec.evidence, "reader.spec.json"));
  assert.equal(
    spec.databaseFile,
    path.join(
      temp,
      "apv-storage-slice-" + spec.runId,
      "private",
      "projects",
      spec.storeKey,
      "G1",
      "project.sqlite",
    ),
  );
  assert.equal(fs.realpathSync.native(spec.databaseFile), spec.databaseFile);
  const { observeRecordedExit } = createRequire(import.meta.url)(
    "./process-exit-proof.cjs",
  );
  for (const [operation, settlement] of [
    ["write", spec.writerSettlement],
    ["recover", spec.recoverySettlement],
  ]) {
    assert.equal(settlement.status, 0);
    assert.equal(settlement.closed, true);
    // Windows can reuse the numeric PID after a normal exit.
    const record = path.join(spec.evidence, operation + "-ready.json");
    assert.equal(observeRecordedExit(settlement.pid, record).notRunning, true);
  }

  const ownDriver = fileURLToPath(new URL("./driver", import.meta.url));
  assert.equal(spec.driverRoot, ownDriver);
  const require = createRequire(path.join(ownDriver, "package.json"));
  const Database = require(ownDriver);
  db = new Database(spec.databaseFile, { readonly: true, fileMustExist: true });
  phase = "schema";
  db.exec("BEGIN");
  assert.equal(db.pragma("user_version", { simple: true }), 5);
  assert.equal(db.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
  assert.deepEqual(db.pragma("integrity_check"), [{ integrity_check: "ok" }]);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  const actual = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  assert.deepEqual(
    actual.map(({ name }) => name),
    [...tables].sort(),
  );
  const rows = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all(),
    ]),
  );
  db.exec("COMMIT");
  db.close();

  phase = "record-bodies";
  for (const table of tables)
    for (const row of rows[table])
      if (Object.hasOwn(row, "body")) {
        const body = JSON.parse(row.body);
        assert.equal(row.body, JSON.stringify(canonical(body)));
        assert.equal(row.body_digest, digest(body));
      }
  assert.equal(rows.store_meta.length, 1);
  assert.equal(rows.snapshots.length, 0);
  const [meta] = rows.store_meta;
  const expected = spec.expectedCut;
  const head = 8;
  assert.equal(expected.head, head);
  assert.equal(meta.project_id, "apv-recovery-project");
  assert.equal(meta.generation, "G1");
  assert.equal(meta.processor, spec.processorFingerprint);
  assert.equal(meta.head, head);
  assert.equal(meta.writer_epoch, 2);
  assert.equal(meta.lifecycle, "active");

  phase = "state";
  const bodies = (records) => records.map(({ body }) => JSON.parse(body));
  const ordinal = (a, b) => a.ordinal - b.ordinal;
  const byCommit = (a, b) => a.seq - b.seq || ordinal(a, b);
  const atHead = (name) =>
    bodies(rows[name].filter((row) => row.seq === head).sort(ordinal));
  const state = Object.fromEntries(
    columns.map((kind) => [
      kind,
      bodies(
        rows.entity_versions
          .filter((row) => row.seq === head && row.kind === kind)
          .sort(ordinal),
      ),
    ]),
  );
  state.assertions = bodies(rows.assertions.sort(byCommit));
  state.corrections = atHead("correction_versions");
  state.resolvedConclusions = atHead("conclusion_versions");
  state.acceptedEvents = bodies(rows.normalized_events.sort(byCommit));

  phase = "history";
  const planRows = bodies(rows.plan_versions.sort(byCommit));
  const revisions = planRows.map(({ revision }) => revision);
  const plan = {
    core: state,
    heads: [
      revisions.findLast((revision) => revision.outcome === "applied")
        ?.snapshot,
    ],
    revisions,
    changes: planRows.flatMap(({ change }) =>
      change === undefined ? [] : [change],
    ),
  };
  const progressRows = bodies(rows.progress_versions.sort(byCommit));
  const progress = {
    snapshots: progressRows.map(({ change, correctionHistory }) => ({
      result: change.current,
      correctionHistory,
    })),
    changes: progressRows.map(({ change }) => change),
  };
  const timeline = {
    entries: bodies(rows.timeline_versions.sort(byCommit)).flatMap(
      ({ entries }) => entries,
    ),
  };
  assert.equal(rows.source_checkpoint_versions.length, 1);
  assert.equal(rows.source_checkpoint_versions[0].seq, head);
  const cursor = atHead("source_checkpoint_versions");
  const stateDigest = digest({ plan, progress, timeline });
  const cut = { state, plan, progress, timeline, cursor, head, stateDigest };
  assert.deepEqual(cut, expected);
  assert.equal(meta.state_digest, stateDigest);

  phase = "receipts";
  assert.equal(rows.commits.length, head);
  for (const [index, row] of rows.commits.entries()) {
    const intent = JSON.parse(row.intent_json);
    const result = JSON.parse(row.result_json);
    assert.equal(row.seq, index + 1);
    assert.equal(intent.expectedHead, index);
    assert.equal(result.head, index + 1);
    assert.equal(row.intent_digest, digest(intent));
    assert.equal(row.result_digest, digest(result));
    assert.equal(row.state_digest, result.stateDigest);
  }
  const last = rows.commits.at(-1);
  const result = JSON.parse(last.result_json);
  assert.equal(last.state_digest, stateDigest);
  assert.equal(result.cursorVectorDigest, digest(cursor));
  if (spec.surface === true) {
    // The final checkpoint covers an already recorded report.
    const [covered] = cursor[0].coveredEventIds;
    assert.equal(cursor[0].coveredEventIds.length, 1);
    const coveredRow = rows.normalized_events.find(
      ({ event_id }) => event_id === covered,
    );
    assert.ok(coveredRow && coveredRow.seq < head);
    const report = JSON.parse(coveredRow.body);
    assert.equal(report.type, "task.status_reported");
    assert.equal(report.sourceId, cursor[0].sourceId);
    for (const table of [
      "normalized_events",
      "assertions",
      "plan_versions",
      "progress_versions",
      "timeline_versions",
    ])
      assert.ok(
        !rows[table].some(({ seq }) => seq === head),
        table + " changed at checkpoint",
      );
    assert.deepEqual(JSON.parse(last.intent_json).eventClaims, []);
    assert.deepEqual(result.canonicalEventIds, []);
    assert.equal(last.state_digest, rows.commits.at(-2).state_digest);
  } else {
    assert.deepEqual(result.canonicalEventIds, cursor[0].coveredEventIds);
  }
  const receipt = {
    operationId: last.operation_id,
    operationNonce: last.nonce,
    projectId: last.project_id,
    generation: last.generation,
    epoch: last.epoch,
    head: last.seq,
    intentDigest: last.intent_digest,
    resultDigest: last.result_digest,
    stateDigest: last.state_digest,
  };
  assert.deepEqual(receipt, spec.expectedReceipt);
  assert.equal(receipt.epoch, 1);
  const output = JSON.stringify({ ...cut, receipt }, null, 2);
  fs.writeFileSync(path.join(spec.evidence, "reader.cut.json"), output, {
    flag: "wx",
  });
  fs.writeFileSync(
    path.join(spec.evidence, "reader.result.json"),
    JSON.stringify(
      {
        pid: process.pid,
        tableCount: tables.length,
        head,
        fullStateMatch: true,
        stateDigest,
        cutSha256: createHash("sha256").update(output).digest("hex"),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
} catch {
  if (db?.open) db.close();
  console.error("independent_timeline_sql_failed:" + phase);
  process.exitCode = 1;
}
