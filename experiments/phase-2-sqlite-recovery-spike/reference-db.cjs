"use strict";
const { randomUUID } = require("node:crypto");
const { fail, hash, admitEvent } = require("./checks.cjs");

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
];
const barriers = [
  "after_begin",
  "after_event_dedup",
  "after_assertions",
  "after_entities",
  "after_corrections",
  "after_conclusions",
  "after_snapshot",
  "after_checkpoint",
  "after_head",
  "before_commit",
];
function schema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE control (id INTEGER PRIMARY KEY CHECK(id=1), project TEXT NOT NULL, generation TEXT NOT NULL, epoch INTEGER NOT NULL, token TEXT NOT NULL, head INTEGER NOT NULL, digest TEXT NOT NULL);
    CREATE TABLE commits (seq INTEGER PRIMARY KEY, operation TEXT UNIQUE NOT NULL, base INTEGER NOT NULL, epoch INTEGER NOT NULL, token TEXT NOT NULL, previous_digest TEXT NOT NULL, result_digest TEXT NOT NULL);
    CREATE TABLE events (id TEXT PRIMARY KEY, source TEXT NOT NULL, source_event TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES commits(seq), body TEXT NOT NULL, UNIQUE(source,source_event));
    CREATE TABLE assertions (id TEXT PRIMARY KEY, seq INTEGER NOT NULL REFERENCES commits(seq), body TEXT NOT NULL);
    CREATE TABLE entity_versions (kind TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES commits(seq), ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id,seq));
    CREATE TABLE correction_versions (id TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES commits(seq), body TEXT NOT NULL, PRIMARY KEY(id,seq));
    CREATE TABLE conclusion_versions (target TEXT NOT NULL, target_id TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES commits(seq), body TEXT NOT NULL, PRIMARY KEY(target,target_id,seq));
    CREATE TABLE dedup (source TEXT NOT NULL, source_event TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES events(id), seq INTEGER NOT NULL REFERENCES commits(seq), digest TEXT NOT NULL, PRIMARY KEY(source,source_event));
    CREATE TABLE snapshots (watermark INTEGER PRIMARY KEY REFERENCES commits(seq), body TEXT NOT NULL, digest TEXT NOT NULL, vector TEXT NOT NULL);
    CREATE TABLE checkpoints (source TEXT NOT NULL, stream TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES commits(seq), body TEXT NOT NULL, PRIMARY KEY(source,stream,seq));
  `);
}
function snapshot(state) {
  const { acceptedEvents: _events, ...image } = state;
  return image;
}
function images(db, state, seq, oldAssertionIds = []) {
  for (const a of state.assertions) {
    if (!oldAssertionIds.includes(a.id))
      db.prepare("INSERT INTO assertions VALUES (?,?,?)").run(
        a.id,
        seq,
        JSON.stringify(a),
      );
  }
  for (const kind of ["projects", "phases", "tasks", "sessions"]) {
    state[kind].forEach((value, ordinal) =>
      db
        .prepare("INSERT INTO entity_versions VALUES (?,?,?,?,?)")
        .run(kind, value.id, seq, ordinal, JSON.stringify(value)),
    );
  }
  for (const c of state.corrections)
    db.prepare("INSERT INTO correction_versions VALUES (?,?,?)").run(
      c.id,
      seq,
      JSON.stringify(c),
    );
  for (const c of state.resolvedConclusions)
    db.prepare("INSERT INTO conclusion_versions VALUES (?,?,?,?)").run(
      c.target,
      c.targetId,
      seq,
      JSON.stringify(c),
    );
}
function bootstrap(db, fixture) {
  schema(db);
  db.transaction(() => {
    db.prepare("INSERT INTO control VALUES (1,?,?,0,'',1,?)").run(
      fixture.projectId,
      fixture.generation,
      hash(fixture.before),
    );
    db.prepare("INSERT INTO commits VALUES (1,'BOOTSTRAP',0,0,'','',?)").run(
      hash(fixture.before),
    );
    images(db, fixture.before, 1);
    db.prepare("INSERT INTO snapshots VALUES (1,?,?,?)").run(
      JSON.stringify(snapshot(fixture.before)),
      hash(fixture.before),
      "[]",
    );
  })();
}
function control(db) {
  return db.prepare("SELECT * FROM control WHERE id=1").get();
}
function guard(db, capability) {
  if (!db.inTransaction) throw fail("NO_PROJECT_TRANSACTION");
  const row = control(db);
  if (
    row.project !== capability.project ||
    row.generation !== capability.generation ||
    row.epoch !== capability.epoch ||
    row.token !== capability.token
  )
    throw fail("GUARD_MISMATCH");
  return row;
}
function fence(db, fixture, checkOwner) {
  db.exec("BEGIN IMMEDIATE");
  const row = control(db);
  if (
    row.project !== fixture.projectId ||
    row.generation !== fixture.generation
  )
    throw fail("GENERATION_MISMATCH");
  const token = randomUUID();
  const changed = db
    .prepare(
      "UPDATE control SET epoch=epoch+1, token=? WHERE id=1 AND epoch=? AND token=?",
    )
    .run(token, row.epoch, row.token);
  if (changed.changes !== 1) throw fail("FENCE_CAS");
  checkOwner();
  db.exec("COMMIT");
  return {
    project: row.project,
    generation: row.generation,
    epoch: row.epoch + 1,
    token,
  };
}
function writeBundle(db, fixture, capability, stop, notify, inject) {
  admitEvent(fixture.event);
  const row = guard(db, capability);
  if (row.head !== fixture.base || row.digest !== hash(fixture.before))
    throw fail("BASE_CONFLICT");
  const seq = fixture.base + 1;
  const point = (name) => {
    notify(name);
    if (inject === name) {
      // Real SQLite PK constraint exception; not a fake automatic rollback.
      db.prepare("INSERT INTO control SELECT * FROM control WHERE id=1").run();
      throw fail("INJECTION_DID_NOT_THROW");
    }
    return stop === name;
  };
  if (point("after_begin")) return;
  db.prepare("INSERT INTO commits VALUES (?,?,?,?,?,?,?)").run(
    seq,
    fixture.operationId,
    fixture.base,
    capability.epoch,
    capability.token,
    row.digest,
    hash(fixture.after),
  );
  const e = fixture.event;
  db.prepare("INSERT INTO events VALUES (?,?,?,?,?)").run(
    e.id,
    e.sourceId,
    e.sourceIdentity.sourceEventId,
    seq,
    JSON.stringify(e),
  );
  db.prepare("INSERT INTO dedup VALUES (?,?,?,?,?)").run(
    e.sourceId,
    e.sourceIdentity.sourceEventId,
    e.id,
    seq,
    hash(e),
  );
  if (point("after_event_dedup")) return;
  for (const a of fixture.after.assertions)
    if (!fixture.before.assertions.some((old) => old.id === a.id))
      db.prepare("INSERT INTO assertions VALUES (?,?,?)").run(
        a.id,
        seq,
        JSON.stringify(a),
      );
  if (point("after_assertions")) return;
  for (const kind of ["projects", "phases", "tasks", "sessions"])
    fixture.after[kind].forEach((v, n) =>
      db
        .prepare("INSERT INTO entity_versions VALUES (?,?,?,?,?)")
        .run(kind, v.id, seq, n, JSON.stringify(v)),
    );
  if (point("after_entities")) return;
  for (const c of fixture.after.corrections)
    db.prepare("INSERT INTO correction_versions VALUES (?,?,?)").run(
      c.id,
      seq,
      JSON.stringify(c),
    );
  if (point("after_corrections")) return;
  for (const c of fixture.after.resolvedConclusions)
    db.prepare("INSERT INTO conclusion_versions VALUES (?,?,?,?)").run(
      c.target,
      c.targetId,
      seq,
      JSON.stringify(c),
    );
  if (point("after_conclusions")) return;
  db.prepare("INSERT INTO snapshots VALUES (?,?,?,?)").run(
    seq,
    JSON.stringify(snapshot(fixture.after)),
    hash(fixture.after),
    JSON.stringify([fixture.checkpoint]),
  );
  if (point("after_snapshot")) return;
  db.prepare("INSERT INTO checkpoints VALUES (?,?,?,?)").run(
    fixture.checkpoint.sourceId,
    fixture.checkpoint.stream,
    seq,
    JSON.stringify(fixture.checkpoint),
  );
  if (point("after_checkpoint")) return;
  db.prepare("UPDATE control SET head=?,digest=? WHERE id=1").run(
    seq,
    hash(fixture.after),
  );
  if (point("after_head")) return;
  point("before_commit");
}
function readCut(db) {
  // The caller pins a read transaction before reading any table.
  return Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
        .all()
        .map((row) => ({ ...row })),
    ]),
  );
}
module.exports = {
  tables,
  barriers,
  bootstrap,
  control,
  guard,
  fence,
  writeBundle,
  readCut,
};
