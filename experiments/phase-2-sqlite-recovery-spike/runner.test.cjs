"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { main } = require("./runner.cjs");
test("import/default CLI never loads experiment execution modules", async () => {
  let value;
  await main([], (v) => {
    value = v;
  });
  assert.equal(value.status, "NOT TESTED");
  assert.equal(value.workersStarted, false);
  assert.equal(value.databasesCreated, false);
  assert.equal(
    Object.keys(require.cache).some((key) =>
      /[\\/]actors\.cjs$|[\\/]worker\.cjs$|[\\/]better-sqlite3[\\/]/.test(key),
    ),
    false,
  );
});
test("missing switch and U3 fail before any execution import", async () => {
  await assert.rejects(main(["--case", "R1"]));
  await assert.rejects(main(["--case", "U3", "--execute"]));
  assert.equal(
    Object.keys(require.cache).some((key) => /[\\/]actors\.cjs$/.test(key)),
    false,
  );
});
