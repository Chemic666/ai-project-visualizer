"use strict";
const { Buffer } = require("node:buffer");
// Driver injected only by an explicitly executed new recovery Worker.
const fs = require("node:fs");
const base = require("./reference-db.cjs");
const { tables, intentDigest } = require("./oracle.cjs");
const { hash, fail } = require("./checks.cjs");
function bootstrap(db, fixture, binding) {
  base.bootstrap(db, fixture);
  db.transaction(() => {
    db.exec(
      "CREATE TABLE fixture_meta (id INTEGER PRIMARY KEY, runId TEXT, unit TEXT, project TEXT, generation TEXT, fingerprint TEXT, schema INTEGER); CREATE TABLE operation_receipts (operation TEXT PRIMARY KEY, project TEXT, generation TEXT, seq INTEGER REFERENCES commits(seq), epoch INTEGER, nonce TEXT, intent_digest TEXT, result_digest TEXT, coverage TEXT)",
    );
    db.prepare("INSERT INTO fixture_meta VALUES (1,?,?,?,?,?,1)").run(
      binding.runId,
      binding.unit,
      binding.project,
      binding.generation,
      binding.fingerprint,
    );
  })();
}
function writeReceipt(db, fixture, capability) {
  if (!db.inTransaction) throw fail("RECEIPT_OUTSIDE_TRANSACTION");
  db.prepare("INSERT INTO operation_receipts VALUES (?,?,?,?,?,?,?,?,?)").run(
    fixture.operationId,
    fixture.projectId,
    fixture.generation,
    2,
    capability.epoch,
    capability.token,
    intentDigest(fixture),
    hash(fixture.after),
    JSON.stringify(fixture.checkpoint),
  );
}
function read(db) {
  db.exec("BEGIN");
  try {
    const integrity = db.pragma("integrity_check"),
      foreignKeys = db.pragma("foreign_key_check");
    const cut = Object.fromEntries(
      tables.map((name) => [
        name,
        db
          .prepare(`SELECT * FROM ${name} ORDER BY rowid`)
          .all()
          .map((row) => ({ ...row })),
      ]),
    );
    const unhealthy =
      integrity.length !== 1 ||
      Object.values(integrity[0])[0] !== "ok" ||
      foreignKeys.length !== 0;
    return {
      cut,
      integrity,
      foreignKeys,
      healthy: !unhealthy,
      queries: [
        "PRAGMA integrity_check",
        "PRAGMA foreign_key_check",
        ...tables.map((name) => `SELECT * FROM ${name} ORDER BY rowid`),
      ],
    };
  } finally {
    if (db.inTransaction) db.exec("ROLLBACK");
  }
}
function mutate(db, variant) {
  // Deliberate fault injection ONLY into a fresh SQLite backup copy.
  db.pragma("foreign_keys = OFF");
  const statements = {
    receipt_missing: "DELETE FROM operation_receipts",
    nonce_mismatch: "UPDATE operation_receipts SET nonce='wrong-nonce'",
    epoch_mismatch: "UPDATE operation_receipts SET epoch=epoch+10",
    generation_mismatch: "UPDATE control SET generation='G2'",
    ledger_mismatch: "UPDATE commits SET result_digest='wrong' WHERE seq=2",
    event_missing: "DELETE FROM events",
    correction_missing: "DELETE FROM correction_versions WHERE seq=1",
    cursor_ahead: "UPDATE checkpoints SET seq=3",
    foreign_fingerprint: "UPDATE fixture_meta SET fingerprint='unsupported'",
  };
  if (!statements[variant]) throw fail("UNKNOWN_COPY_FAULT");
  db.exec(statements[variant]);
}
function unreadableCopy(file) {
  const handle = fs.openSync(file, "r+");
  try {
    fs.writeSync(handle, Buffer.alloc(100, 0x58), 0, 100, 0);
  } finally {
    fs.closeSync(handle);
  }
}
module.exports = {
  ...base,
  tables,
  bootstrap,
  writeReceipt,
  read,
  mutate,
  unreadableCopy,
};
