"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { read, tables } = require("./sql.cjs");
test("pure Reader projection preserves an unhealthy raw cut and its FK diagnostics", () => {
  // Driver boundary double only; never a SQLite result or runtime evidence.
  const foreignKeys = [{ table: "dedup", rowid: 1, parent: "events", fkid: 0 }];
  const db = {
    inTransaction: false,
    exec(statement) {
      this.inTransaction = statement === "BEGIN";
    },
    pragma(name) {
      return name === "integrity_check"
        ? [{ integrity_check: "ok" }]
        : foreignKeys;
    },
    prepare() {
      return { all: () => [] };
    },
  };
  const result = read(db);
  assert.equal(result.healthy, false);
  assert.deepEqual(result.foreignKeys, foreignKeys);
  assert.deepEqual(Object.keys(result.cut), tables);
  assert.equal(db.inTransaction, false);
});
