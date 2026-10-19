"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = process.env.APV_VFS_TEST_ROOT || __dirname;
const expected = {
  runId: "11111111-1111-4111-8111-111111111111",
  nonce: "22222222-2222-4222-8222-222222222222",
  pid: 3210,
  databaseFile: "C:\\owned\\run\\wrapped.sqlite",
  connectionRole: "target",
};
function sample() {
  return {
    type: "target-vfs-selected",
    role: "wrapped",
    runId: expected.runId,
    nonce: expected.nonce,
    pid: expected.pid,
    connectionRole: "target",
    databaseFile: expected.databaseFile,
    info: {
      actualVfsName: "apv_g1_nofault_v1",
      vfsQueryStatus: "ok",
      fileControlRc: 0,
      selectedShim: 1,
      databaseFile: expected.databaseFile,
      pid: expected.pid,
      api: "ABC",
      thread: 77,
    },
  };
}
function validate(receipt, binding = expected) {
  const fn = require(path.join(root, "audit.cjs")).validateVfsIdentity;
  assert.equal(
    typeof fn,
    "function",
    "Independent runtime identity validator must exist",
  );
  return fn(receipt, binding);
}
test("audit accepts the native actual name only on the bound target connection", () => {
  assert.equal(validate(sample()), true);
});
const invalid = [
  [
    "missing actual name",
    (r) => {
      delete r.info.actualVfsName;
    },
  ],
  [
    "null actual name",
    (r) => {
      r.info.actualVfsName = null;
    },
  ],
  [
    "wrong actual name despite selectedShim=1",
    (r) => {
      r.info.actualVfsName = "win32";
    },
  ],
  [
    "missing query status",
    (r) => {
      delete r.info.vfsQueryStatus;
    },
  ],
  [
    "failed VFS query",
    (r) => {
      r.info.vfsQueryStatus = "file_control_failed";
      r.info.fileControlRc = 1;
    },
  ],
  [
    "nonzero return despite ok status",
    (r) => {
      r.info.fileControlRc = 12;
    },
  ],
  [
    "string return code",
    (r) => {
      r.info.fileControlRc = "0";
    },
  ],
  [
    "missing return code",
    (r) => {
      delete r.info.fileControlRc;
    },
  ],
  [
    "correct name but selectedShim=0",
    (r) => {
      r.info.selectedShim = 0;
    },
  ],
  [
    "native name has wrong type",
    (r) => {
      r.info.actualVfsName = 1;
    },
  ],
  [
    "receipt nonce mismatch",
    (r) => {
      r.nonce = "another-execution";
    },
  ],
  [
    "receipt RunId mismatch",
    (r) => {
      r.runId = "another-run";
    },
  ],
  [
    "native PID mismatch",
    (r) => {
      r.info.pid++;
    },
  ],
  [
    "receipt PID mismatch",
    (r) => {
      r.pid++;
    },
  ],
  [
    "bootstrap substituted for target",
    (r) => {
      r.connectionRole = "bootstrap";
      r.info.databaseFile = "";
    },
  ],
  [
    "native database file mismatch",
    (r) => {
      r.info.databaseFile = "C:\\owned\\other.sqlite";
    },
  ],
  [
    "missing native file identity",
    (r) => {
      delete r.info.databaseFile;
    },
  ],
  [
    "receipt file binding mismatch",
    (r) => {
      r.databaseFile = "C:\\owned\\other.sqlite";
    },
  ],
];
for (const [label, mutate] of invalid)
  test("audit rejects " + label, () => {
    const candidate = sample();
    mutate(candidate);
    /* First ensure this is exercising a real validator, not an absent export. */
    assert.equal(
      typeof require(path.join(root, "audit.cjs")).validateVfsIdentity,
      "function",
    );
    assert.throws(() => validate(candidate));
  });
test("reopened target has its own explicit receipt binding", () => {
  const candidate = sample();
  candidate.type = "reopened-vfs-selected";
  candidate.connectionRole = "reopened-target";
  assert.equal(
    validate(candidate, { ...expected, connectionRole: "reopened-target" }),
    true,
  );
  assert.throws(() => validate(candidate));
});
test("Worker receipt preserves native values and never fills a missing actual name", () => {
  const workerPath = path.join(root, "worker.cjs");
  assert.match(
    fs.readFileSync(workerPath, "utf8"),
    /if\s*\(require\.main\s*===\s*module\)/,
    "Worker must be import-safe for pure receipt tests",
  );
  const { targetVfsReceipt, requireTargetVfs } = require(workerPath);
  const native = sample().info;
  const data = targetVfsReceipt(native, expected.databaseFile, "target");
  assert.strictEqual(data.info, native);
  assert.equal(data.info.actualVfsName, "apv_g1_nofault_v1");
  assert.equal(data.databaseFile, expected.databaseFile);
  assert.equal(
    requireTargetVfs(native, expected.databaseFile, expected.pid),
    true,
  );
  const missing = { ...native };
  delete missing.actualVfsName;
  assert(
    !Object.hasOwn(
      targetVfsReceipt(missing, expected.databaseFile, "target").info,
      "actualVfsName",
    ),
  );
  assert.throws(() =>
    requireTargetVfs(missing, expected.databaseFile, expected.pid),
  );
  const wrong = { ...native, actualVfsName: "win32" };
  assert.equal(
    targetVfsReceipt(wrong, expected.databaseFile, "target").info.actualVfsName,
    "win32",
  );
  assert.throws(() =>
    requireTargetVfs(wrong, expected.databaseFile, expected.pid),
  );
});
