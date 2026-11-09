import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { buildSurface } from "./build.mjs";
import { readVsixInventory } from "../storage-host-validation/archive-inventory.mjs";

const args = process.argv.slice(2),
  here = fileURLToPath(new URL(".", import.meta.url)),
  repo = path.resolve(here, "../..");
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
if (args.length === 0)
  console.log(
    "Installed surface verification disabled. --execute --code-root ABS [--review]; no download or normal-profile install.",
  );
else if (!(
  [3, 4].includes(args.length) &&
  args[0] === "--execute" &&
  args[1] === "--code-root" &&
  path.isAbsolute(args[2]) &&
  (args.length === 3 || args[3] === "--review")
)) {
  console.error("INVALID_SURFACE_VALIDATION_ARGUMENTS");
  process.exitCode = 2;
} else {
  const runId = randomUUID(),
    evidence = path.join(
      fs.realpathSync.native(os.tmpdir()),
      "apv-surface-host-" + runId,
    );
  fs.mkdirSync(evidence);
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(evidence, name),
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
      { flag: "wx" },
    );
  let phase = "admission",
    status = "FAIL";
  const execute = (label, exe, argv, options = {}) => {
    save(label + ".command.json", { exe, argv });
    const result = spawnSync(exe, argv, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
      ...options,
    });
    save(label + ".stdout.txt", result.stdout ?? "");
    save(label + ".stderr.txt", result.stderr ?? "");
    save(label + ".exit.json", {
      pid: result.pid,
      status: result.status,
      signal: result.signal,
      error: result.error ? "process_failure" : null,
    });
    assert.equal(result.status, 0, label + "_failed");
    assert.equal(result.signal, null);
    assert.ok(!result.error);
  };
  const inventory = (root) =>
    fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(root, entry.name);
      if (entry.isSymbolicLink()) throw Error("surface_inventory_link");
      return entry.isDirectory()
        ? inventory(file)
        : [{ path: file, bytes: fs.statSync(file).size, sha256: hash(file) }];
    });
  try {
    assert.equal(process.platform, "win32");
    assert.equal(process.arch, "x64");
    const codeRoot = fs.realpathSync.native(args[2]),
      codeExe = path.join(codeRoot, "Code.exe");
    const appDirs = fs
      .readdirSync(codeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(codeRoot, entry.name, "resources/app"))
      .filter(
        (dir) =>
          fs.existsSync(path.join(dir, "out/cli.js")) &&
          json(path.join(dir, "package.json")).version === "1.144.0",
      );
    assert.equal(appDirs.length, 1);
    const appDir = appDirs[0],
      vsce = path.join(
        repo,
        "experiments/phase-2-sqlite-driver-spike/node_modules/@vscode/vsce/vsce",
      );
    assert.equal(
      json(path.join(path.dirname(vsce), "package.json")).version,
      "4.0.0",
    );
    const stage = path.join(evidence, "stage"),
      receipt = await buildSurface({ outDir: stage });
    const executionInputs = [
      fileURLToPath(import.meta.url),
      path.join(here, "tests/installed-smoke.cjs"),
      path.join(repo, "packages/storage-host-validation/archive-inventory.mjs"),
    ].map((file) => ({
      path: file,
      bytes: fs.statSync(file).size,
      sha256: hash(file),
    }));
    save("execution-inputs.json", executionInputs);
    const runtimeFiles = receipt.files.filter(
      (row) => row.path !== "package.json",
    );
    phase = "package";
    const vsix = path.join(evidence, "ai-project-visualizer-win32-x64.vsix");
    execute(
      "package",
      process.execPath,
      [
        vsce,
        "package",
        "--no-dependencies",
        "--allow-missing-repository",
        "--skip-license",
        "--target",
        "win32-x64",
        "--out",
        vsix,
      ],
      { cwd: stage },
    );
    phase = "archive";
    const archive = await readVsixInventory(
      vsix,
      path.join(path.dirname(vsce), "package.json"),
    );
    const expected = [
      ...receipt.files.map(
        (row) =>
          "extension/" + (row.path === "README.md" ? "readme.md" : row.path),
      ),
      "extension.vsixmanifest",
      "[Content_Types].xml",
    ].sort();
    assert.deepEqual(archive.map((row) => row.path).sort(), expected);
    for (const row of runtimeFiles) {
      const match = archive.find(
        (item) =>
          item.path ===
          "extension/" + (row.path === "README.md" ? "readme.md" : row.path),
      );
      assert.equal(match.sha256, row.sha256);
      assert.equal(match.bytes, row.bytes);
    }
    save("archive.json", archive);
    const profile = path.join(evidence, "profile"),
      extensions = path.join(evidence, "extensions");
    fs.mkdirSync(profile);
    fs.mkdirSync(extensions);
    fs.mkdirSync(path.join(profile, "User"));
    const windowTitle = "APV Surface Review " + runId.slice(0, 8);
    fs.writeFileSync(
      path.join(profile, "User/settings.json"),
      JSON.stringify({
        "telemetry.telemetryLevel": "off",
        "extensions.autoCheckUpdates": false,
        "extensions.autoUpdate": false,
        "update.mode": "none",
        "workbench.startupEditor": "none",
        "window.title": windowTitle,
      }),
    );
    phase = "install";
    execute(
      "install",
      codeExe,
      [
        path.join(appDir, "out/cli.js"),
        "--user-data-dir",
        profile,
        "--extensions-dir",
        extensions,
        "--install-extension",
        vsix,
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
    );
    const installed = fs
      .readdirSync(extensions)
      .filter((name) =>
        /^apv-local\.apv-project-visualizer-0\.0\.0(?:-win32-x64)?$/.test(name),
      );
    assert.equal(installed.length, 1);
    const installedRoot = path.join(extensions, installed[0]),
      installedManifest = json(path.join(installedRoot, "package.json")),
      sourceManifest = json(path.join(stage, "package.json"));
    for (const [key, value] of Object.entries(sourceManifest))
      assert.deepEqual(
        installedManifest[key],
        value,
        "surface_manifest_" + key,
      );
    for (const key of Object.keys(installedManifest))
      assert.ok(
        key in sourceManifest || key === "__metadata",
        "surface_unexpected_manifest_field",
      );
    for (const row of runtimeFiles)
      assert.equal(
        hash(path.join(installedRoot, ...row.path.split("/"))),
        row.sha256,
      );
    const controller = path.join(evidence, "controller");
    fs.mkdirSync(controller);
    fs.writeFileSync(
      path.join(controller, "package.json"),
      JSON.stringify({
        name: "apv-surface-controller",
        publisher: "apv-local-validation",
        version: "0.0.0",
        engines: { vscode: "1.144.0" },
        main: "main.cjs",
      }),
    );
    fs.writeFileSync(
      path.join(controller, "main.cjs"),
      "exports.activate=()=>{};",
    );
    fs.copyFileSync(
      path.join(here, "tests/installed-smoke.cjs"),
      path.join(controller, "installed-smoke.cjs"),
      fs.constants.COPYFILE_EXCL,
    );
    const spec = {
      runId,
      evidence,
      stage,
      installedRoot,
      runtimeFiles,
      executionInputs,
      sourceInputs: receipt.sourceInputs,
      buildId: receipt.buildId,
      codeExe,
      codeExeSha256: hash(codeExe),
      vsix,
      vsixSha256: hash(vsix),
      windowTitle,
      review: args[3] === "--review",
    };
    save("manifest.json", spec);
    const childEnv = {
      ...process.env,
      APV_SURFACE_SPEC: path.join(evidence, "manifest.json"),
    };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.VSCODE_IPC_HOOK_CLI;
    phase = "extension-host";
    console.log(
      JSON.stringify({
        runId,
        evidenceRoot: evidence,
        phase,
        review: spec.review,
        windowTitle,
      }),
    );
    execute(
      "extension-host",
      codeExe,
      [
        "--new-window",
        "--user-data-dir",
        profile,
        "--extensions-dir",
        extensions,
        "--extensionDevelopmentPath",
        controller,
        "--extensionTestsPath",
        path.join(controller, "installed-smoke.cjs"),
        "--disable-extension",
        "github.copilot-chat",
        "--disable-extension",
        "github.copilot",
        "--skip-welcome",
        "--skip-release-notes",
      ],
      {
        env: childEnv,
        windowsHide: !spec.review,
        timeout: spec.review ? 330000 : 120000,
      },
    );
    const result = json(path.join(evidence, "host-result.json"));
    assert.equal(result.runId, runId);
    assert.equal(result.status, "PASS WITH LIMITATION");
    for (const row of [...receipt.sourceInputs, ...executionInputs])
      assert.equal(hash(row.path), row.sha256, "surface_source_changed");
    save("installed-binding.json", {
      installedRoot,
      filesMatched: runtimeFiles.length,
      manifestFieldsMatched: Object.keys(sourceManifest).length,
      archiveEntries: archive.length,
      vsixSha256: hash(vsix),
    });
    status = "PASS WITH LIMITATION";
  } catch (error) {
    save("failure.json", {
      runId,
      phase,
      status: "unavailable",
      category: error.code ?? "validation_failed",
      detail: String(error.message),
    });
    process.exitCode = 1;
  }
  save("result.json", { runId, status, phase, productionEnabled: false });
  save("inventory.json", {
    runId,
    scope: "post validation-process exit file bytes; inventory excludes itself",
    files: inventory(evidence),
  });
  console.log(JSON.stringify({ runId, evidenceRoot: evidence, status }));
}
