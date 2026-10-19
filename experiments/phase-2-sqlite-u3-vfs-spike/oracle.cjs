"use strict";
const assert = require("node:assert/strict");
const names = [
  "event_ledger",
  "assertions",
  "history",
  "snapshots",
  "cursors",
  "receipts",
];
function validateCut(cut) {
  assert.deepEqual(cut.integrity, ["ok"]);
  assert.deepEqual(cut.foreignKeys, []);
  const expected = {
    event_ledger: ["event-1", "event-2"],
    assertions: ["assertion-1", "assertion-2"],
    history: ["history-1", "history-2"],
    snapshots: ['{"head":1}', '{"head":2}'],
    cursors: ["unit-1", "unit-2"],
    receipts: ["operation-1", "operation-2"],
  };
  assert.deepEqual(Object.keys(cut.tables).sort(), [...names].sort());
  for (const name of names)
    assert.deepEqual(
      cut.tables[name],
      expected[name].map((value, i) => ({ id: i + 1, value })),
    );
  return true;
}
/* Used by a new uninstrumented Reader process, never a Writer/SQL summary. */
function readCut(db) {
  db.exec("BEGIN");
  try {
    const cut = {
      integrity: db.pragma("integrity_check").map((r) => Object.values(r)[0]),
      foreignKeys: db.pragma("foreign_key_check"),
      tables: {},
    };
    for (const name of names)
      cut.tables[name] = db
        .prepare(`SELECT id,value FROM ${name} ORDER BY id`)
        .all();
    db.exec("COMMIT");
    return cut;
  } catch (e) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
module.exports = { names, validateCut, readCut };
