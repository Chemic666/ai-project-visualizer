exports.run = async () => {
  const vscode = require("vscode"),
    fs = require("node:fs"),
    path = require("node:path"),
    assert = require("node:assert/strict"),
    { createHash } = require("node:crypto");
  const spec = JSON.parse(
    fs.readFileSync(process.env.APV_SURFACE_SPEC, "utf8"),
  );
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(spec.evidence, name),
      JSON.stringify(value, null, 2),
      { flag: "wx" },
    );
  const hash = (file) =>
    createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const extension = vscode.extensions.getExtension(
    "apv-local.apv-project-visualizer",
  );
  assert.ok(extension);
  assert.equal(
    fs.realpathSync.native(extension.extensionPath),
    fs.realpathSync.native(spec.installedRoot),
  );
  assert.notEqual(extension.extensionPath, spec.stage);
  const runtime = {
    vscode: vscode.version,
    node: process.version,
    electron: process.versions.electron,
    modules: process.versions.modules,
    platform: process.platform,
    arch: process.arch,
  };
  assert.deepEqual(runtime, {
    vscode: "1.144.0",
    node: "v24.22.1",
    electron: "43.8.3",
    modules: "148",
    platform: "win32",
    arch: "x64",
  });
  const api = await extension.activate(),
    steps = [];
  assert.deepEqual(api.inspectSurface(), { mode: null, health: "closed" });
  for (const row of spec.runtimeFiles)
    assert.equal(
      hash(path.join(extension.extensionPath, ...row.path.split("/"))),
      row.sha256,
    );
  async function ready(mode) {
    const deadline = Date.now() + 30000;
    while (api.inspectSurface().health === "loading" && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(api.inspectSurface(), { mode, health: "ready" });
    steps.push({ mode, health: "ready" });
  }
  await vscode.commands.executeCommand("apv.open");
  await ready("overview");
  await vscode.commands.executeCommand("apv.open");
  await ready("overview");
  await vscode.commands.executeCommand("apv.openSyntheticDemo");
  await ready("synthetic");
  await vscode.commands.executeCommand("apv.open");
  await ready("overview");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  assert.deepEqual(api.inspectSurface(), { mode: null, health: "closed" });
  await vscode.commands.executeCommand("apv.open");
  await ready("overview");
  let visualReview = "not_requested";
  if (spec.review) {
    save("review-ready.json", {
      runId: spec.runId,
      title: spec.windowTitle,
      steps,
      runtime,
      scope: "own empty isolated profile only",
    });
    const ack = path.join(spec.evidence, "review-complete.json"),
      deadline = Date.now() + 240000;
    while (!fs.existsSync(ack) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(fs.existsSync(ack), "surface_visual_review_timeout");
    const completed = JSON.parse(fs.readFileSync(ack, "utf8"));
    assert.equal(completed.runId, spec.runId);
    assert.ok(["verified", "skipped"].includes(completed.status));
    visualReview = completed.status;
  }
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  assert.deepEqual(api.inspectSurface(), { mode: null, health: "closed" });
  save("host-result.json", {
    runId: spec.runId,
    status: "PASS WITH LIMITATION",
    runtime,
    pid: process.pid,
    steps,
    runtimeFilesMatched: spec.runtimeFiles.length,
    visualReview,
    productionEnabled: false,
    observation: "unavailable",
    storage: "unavailable",
    scope:
      "installed disconnected/synthetic surface startup and lifecycle only",
  });
};
