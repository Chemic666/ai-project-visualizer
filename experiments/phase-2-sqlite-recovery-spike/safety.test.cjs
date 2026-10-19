"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const { gate, inside, confined } = require("./safety.cjs");
test("default and list do not authorize execution", () => {
  assert.deepEqual(gate([]), { mode: "list" });
  assert.deepEqual(gate(["--list"]), { mode: "list" });
  assert.throws(() => gate(["--case", "R1"]));
  assert.throws(() => gate(["--case", "U3", "--execute"]));
  assert.throws(() => gate(["--case", "R1", "--execute", "--execute"]));
  assert.throws(() =>
    gate(["--case", "U2", "--execute", "--db", "user.sqlite"]),
  );
});
test("fresh run identity cannot be a path or non-v4 UUID", () => {
  assert.throws(() => gate(["--case", "U1", "--execute", "--run-id"]));
  assert.throws(() =>
    gate(["--case", "U1", "--execute", "--run-id", "../old"]),
  );
  assert.equal(gate(["--case", "R2", "--execute"]).mode, "execute");
});
test("confined evidence components reject escapes and sibling-prefix tricks", () => {
  const root = path.resolve("owned");
  assert.equal(inside(root, `${root}-other`), false);
  assert.throws(() => confined(root, "..", "data.sqlite"));
  assert.throws(() => confined(root, "nested/escape"));
  assert.equal(
    confined(root, "unit", "project.sqlite"),
    path.join(root, "unit", "project.sqlite"),
  );
});
