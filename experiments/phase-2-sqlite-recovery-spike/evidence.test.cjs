"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { verifyEntries } = require("./evidence.cjs"),
  { checkReceipts } = require("./reference-oracle.cjs");
test("inventory detects rewritten, removed and extra evidence", () => {
  const expected = [{ path: "raw/a.json", size: 10, sha256: "sha-a" }];
  assert.doesNotThrow(() => verifyEntries(structuredClone(expected), expected));
  assert.throws(() =>
    verifyEntries([{ ...expected[0], sha256: "sha-b" }], expected),
  );
  assert.throws(() => verifyEntries([], expected));
  assert.throws(() =>
    verifyEntries(
      [...expected, { path: "extra", size: 1, sha256: "x" }],
      expected,
    ),
  );
});
test("raw receipt binding rejects nonce substitution and sequence gaps", () => {
  const identity = {
    runId: "run",
    workerId: "reader",
    nonce: "nonce",
    pid: 10,
  };
  const row = {
    ...identity,
    sequence: 1,
    kind: "sql_oracle",
    data: { queries: ["SELECT * FROM control"], cut: { control: [] } },
  };
  assert.doesNotThrow(() => checkReceipts([row], identity, true));
  assert.throws(() => checkReceipts([{ ...row, nonce: "other" }], identity));
  assert.throws(() => checkReceipts([row, { ...row, sequence: 3 }], identity));
});
