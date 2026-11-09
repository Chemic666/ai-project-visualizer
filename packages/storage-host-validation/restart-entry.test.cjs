const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { run } = require("./restart-validation.cjs");
const environment = {
  vscode: "1.144.0",
  node: "v24.22.1",
  electron: "43.8.3",
  modules: "148",
  platform: "win32",
  arch: "x64",
  remoteName: null,
};
const own = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
for (const [label, runId, evidence] of [
  ["malformed run", "not-a-run", `C:\\synthetic\\apv-b1-host-${own}`],
  ["other run evidence", own, `C:\\synthetic\\apv-b1-host-${other}`],
])
  test(`restart entry rejects ${label} before loading admission or creating a root`, async () => {
    let loads = 0,
      saves = 0;
    await assert.rejects(
      run({
        spec: { runId, rootMode: "temp", phase: "write" },
        evidence,
        resources: {},
        environment,
        load: async () => {
          loads++;
          throw Error("unexpected_load");
        },
        save: () => {
          saves++;
        },
      }),
      (error) => error.code === "ERR_ASSERTION",
    );
    assert.equal(loads, 0);
    assert.equal(saves, 0);
  });
