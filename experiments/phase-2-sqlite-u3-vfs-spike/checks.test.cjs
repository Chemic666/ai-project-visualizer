"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("execution is disabled unless G1 and execute flags are both supplied", () => {
  const { parse } = require("./checks.cjs");
  assert.equal(parse([]).mode, "help");
  assert.equal(parse(["--list"]).mode, "list");
  assert.throws(() => parse(["--run-g1"]));
  assert.throws(() => parse(["--execute"]));
  assert.throws(() =>
    parse(["--run-g1", "--execute", "--database", "D:\\production.sqlite"]),
  );
  assert.equal(
    parse([
      "--run-g1",
      "--execute",
      "--build-id",
      "00000000-0000-4000-8000-000000000001",
    ]).mode,
    "g1",
  );
});
test("build/run IDs and paths cannot escape their owned roots", () => {
  const { uuid, inside } = require("./checks.cjs");
  assert.throws(() => uuid("../history"));
  assert.throws(() => inside("C:\\temp\\owned", "C:\\temp\\owned2\\a"));
  assert.throws(() =>
    inside("C:\\temp\\owned", "C:\\temp\\owned\\..\\historical"),
  );
  assert.throws(() => inside("C:\\temp\\owned", "C:\\temp\\owned"));
  assert.equal(inside("C:\\temp\\owned", "C:\\temp\\owned\\new.sqlite"), true);
});
test("complete G1 SQL cuts, not just counts or runner summaries, determine equivalence", () => {
  const { validateCut } = require("./oracle.cjs");
  const tables = {};
  const values = {
    event_ledger: ["event-1", "event-2"],
    assertions: ["assertion-1", "assertion-2"],
    history: ["history-1", "history-2"],
    snapshots: ['{"head":1}', '{"head":2}'],
    cursors: ["unit-1", "unit-2"],
    receipts: ["operation-1", "operation-2"],
  };
  for (const [name, value] of Object.entries(values))
    tables[name] = value.map((v, i) => ({ id: i + 1, value: v }));
  const cut = { integrity: ["ok"], foreignKeys: [], tables };
  assert.equal(validateCut(cut), true);
  for (const name of Object.keys(tables)) {
    const wrong = structuredClone(cut);
    wrong.tables[name][1].value = "mixed-cut";
    assert.throws(() => validateCut(wrong));
  }
  const missing = structuredClone(cut);
  missing.tables.history.pop();
  assert.throws(() => validateCut(missing));
  assert.throws(() =>
    validateCut({ ...cut, foreignKeys: [{ table: "history" }] }),
  );
});
test("native source contains no injection control or direct SQLite linkage", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "native", "apv_vfs.c"),
    "utf8",
  );
  assert(!source.includes("SQLITE_IOERR"));
  assert(!source.includes("SQLITE_CORE"));
  assert(source.includes("SQLITE_EXTENSION_INIT2(api)"));
  assert(source.includes("SQLITE_OK_LOAD_PERMANENTLY"));
  assert(source.includes("SQLITE_FCNTL_VFS_POINTER"));
});
