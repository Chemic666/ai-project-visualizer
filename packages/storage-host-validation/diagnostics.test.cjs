const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");

const marker = "APV_SYNTHETIC_PRIVATE_DIAGNOSTIC";

test("validation extension reports only a fixed diagnostic for a private exception", async () => {
  const testFile = path.join(__dirname, "host-tests.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-host-diagnostic-"));
  const spec = path.join(root, "fixture.json");
  const mockedRequire = createRequire(testFile);
  const failure = new Error("raw contents " + marker);
  failure.stack = "raw stack " + marker;
  failure.code = marker;
  const exports = {};
  vm.runInNewContext(
    fs.readFileSync(testFile, "utf8"),
    {
      exports,
      process: { env: { APV_B1_HOST_SPEC: spec } },
      require: (name) =>
        name === "vscode"
          ? {
              extensions: {
                getExtension: () => ({
                  extensionPath: "own-fixture",
                  activate: async () => ({
                    validate: async () => {
                      throw failure;
                    },
                  }),
                }),
              },
            }
          : mockedRequire(name),
    },
    { filename: testFile },
  );
  await assert.rejects(exports.run(), (error) => {
    assert.equal(error.message, "storage_host_validation_unavailable");
    assert.doesNotMatch(error.stack, new RegExp(marker));
    assert.equal(error.cause, undefined);
    return true;
  });
  const report = fs.readFileSync(path.join(root, "host-error.json"), "utf8");
  assert.deepEqual(JSON.parse(report), {
    status: "unavailable",
    code: "unavailable",
  });
  assert.doesNotMatch(report, new RegExp(marker));
});

test(
  "unavailable setup does not print the rejected path or raw stack",
  {
    skip: process.platform !== "win32" || process.arch !== "x64",
  },
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apv-diagnostic-setup-"));
    const missing = path.join(tmp, marker);
    const r = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "run.mjs"),
        "--execute-temp-timeline-restart",
        "--code-root",
        missing,
        "--driver-root",
        missing,
        "--native-manifest",
        missing,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    );
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(marker));
    assert.match(r.stderr, /storage_host_validation_/);
    assert.deepEqual(fs.readdirSync(tmp), []);
  },
);

test("a child process report keeps exit status and output presence without output text", () => {
  const { processOutcome } = require("./runtime/diagnostics.cjs");
  const fixture = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(process.argv[1]); process.stderr.write(process.argv[1]); process.exitCode = 4;",
      marker,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 5000 },
  );
  assert.ok(fixture.stdout.includes(marker) && fixture.stderr.includes(marker));
  const report = processOutcome(fixture);
  assert.deepEqual(report, {
    pid: fixture.pid,
    status: 4,
    signal: null,
    error: null,
    stdoutPresent: true,
    stderrPresent: true,
  });
  assert.doesNotMatch(JSON.stringify(report), new RegExp(marker));
});

test("a known failure keeps its code through a second projection", () => {
  const {
    diagnostic,
    safeValidationError,
  } = require("./runtime/diagnostics.cjs");
  const original = Object.assign(new Error(marker), { code: "EACCES" });
  const safe = safeValidationError(diagnostic(original).code);
  assert.deepEqual(diagnostic(safe), { status: "unavailable", code: "EACCES" });
  assert.doesNotMatch(safe.stack, new RegExp(marker));
});
