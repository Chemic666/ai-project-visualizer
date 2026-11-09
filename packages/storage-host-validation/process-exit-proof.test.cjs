const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const file = path.join(__dirname, "process-exit-proof.cjs");
const api = fs.existsSync(file) ? require(file) : {};
test("recorded exit distinguishes a reused PID from the original live process", () => {
  assert.equal(typeof api.classifyRecordedExit, "function");
  assert.equal(api.classifyRecordedExit({ inUse: false }), "absent");
  assert.equal(
    api.classifyRecordedExit({ inUse: true, createdMs: 2000, recordMs: 1000 }),
    "pid_reused",
  );
  for (const value of [
    { inUse: true, createdMs: 500, recordMs: 1000 },
    { inUse: true, createdMs: 1000, recordMs: 1000 },
    { inUse: true, createdMs: NaN, recordMs: 1000 },
    { inUse: true, createdMs: 2000, recordMs: NaN },
  ])
    assert.throws(() => api.classifyRecordedExit(value), {
      message: "recorded_process_not_exited",
    });
});

test("exit proof rejects an actual live original process and a different record identity", () => {
  const os = require("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-exit-probe-test-"));
  const record = path.join(root, "record.json");
  fs.writeFileSync(record, JSON.stringify({ pid: process.pid }), {
    flag: "wx",
  });
  assert.throws(() => api.observeRecordedExit(process.pid, record), {
    message: "recorded_process_not_exited",
  });
  assert.throws(() => api.observeRecordedExit(process.pid + 1, record), {
    message: "process_record_identity_conflict",
  });
});
