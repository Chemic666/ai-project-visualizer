import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readNativePackage } from "../storage/src/native-attestor.mjs";
const args = process.argv.slice(2);
if (!args.length) {
  console.log(
    "Installed VSIX validation disabled. --execute --code-root ABS --driver-root ABS --native-manifest ABS",
  );
} else {
  if (
    args.length !== 7 ||
    !["--execute", "--execute-local-validation"].includes(args[0]) ||
    args[1] !== "--code-root" ||
    args[3] !== "--driver-root" ||
    args[5] !== "--native-manifest" ||
    process.platform !== "win32" ||
    process.arch !== "x64"
  )
    throw Error("ARGUMENTS_REJECTED");
  const repo = fileURLToPath(new URL("../../", import.meta.url)),
    source = fileURLToPath(new URL("./", import.meta.url)),
    codeRoot = fs.realpathSync.native(args[2]),
    driverRoot = fs.realpathSync.native(args[4]);
  const approved = readNativePackage(args[6]),
    build = JSON.parse(fs.readFileSync(approved.manifestPath, "utf8"));
  const runId = randomUUID(),
    evidence = path.join(
      fs.realpathSync.native(os.tmpdir()),
      "apv-b1-host-" + runId,
    );
  fs.mkdirSync(evidence);
  const save = (name, data) =>
    fs.writeFileSync(
      path.join(evidence, name),
      typeof data === "string" ? data : JSON.stringify(data, null, 2),
      { flag: "wx" },
    );
  const hash = (p) =>
    createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  function inventory(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) throw Error("LINK_REJECTED");
      return e.isDirectory()
        ? inventory(p)
        : [
            (() => {
              try {
                return { path: p, bytes: fs.statSync(p).size, sha256: hash(p) };
              } catch (e) {
                return {
                  path: p,
                  bytes: fs.statSync(p).size,
                  sha256: null,
                  readError: e.code ?? "unavailable",
                };
              }
            })(),
          ];
    });
  }
  function run(label, exe, argv, options = {}) {
    save(label + ".command.json", { exe, argv });
    const r = spawnSync(exe, argv, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
    save(label + ".stdout.txt", r.stdout ?? "");
    save(label + ".stderr.txt", r.stderr ?? "");
    save(label + ".exit.json", {
      pid: r.pid,
      status: r.status,
      signal: r.signal,
      error: r.error ? String(r.error.message) : null,
    });
    if (r.status !== 0 || r.signal || r.error) throw Error(label + "_FAILED");
    return r;
  }
  let status = "FAIL";
  try {
    const stage = path.join(evidence, "stage");
    fs.mkdirSync(stage);
    for (const f of ["package.json", "extension.cjs", "host-tests.cjs"])
      fs.copyFileSync(
        path.join(source, f),
        path.join(stage, f),
        fs.constants.COPYFILE_EXCL,
      );
    const runtime = path.join(stage, "runtime");
    fs.mkdirSync(runtime);
    fs.mkdirSync(path.join(runtime, "storage"));
    fs.cpSync(
      path.join(repo, "packages/storage/src"),
      path.join(runtime, "storage/src"),
      {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: (p) => !p.endsWith(".d.mts"),
      },
    );
    fs.mkdirSync(path.join(runtime, "storage/native-resource"));
    fs.copyFileSync(
      build.dll,
      path.join(runtime, "storage/native-resource/apv_identity.dll"),
      fs.constants.COPYFILE_EXCL,
    );
    fs.writeFileSync(
      path.join(runtime, "storage/native-resource/manifest.json"),
      JSON.stringify({
        kind: "packaged-readonly-attestor-v1",
        ...approved,
        manifestPath: undefined,
        nativeSourceSha256: build.inputs[0].sha256,
      }),
      { flag: "wx" },
    );
    fs.mkdirSync(path.join(runtime, "driver"));
    fs.copyFileSync(
      path.join(driverRoot, "package.json"),
      path.join(runtime, "driver/package.json"),
      fs.constants.COPYFILE_EXCL,
    );
    fs.cpSync(path.join(driverRoot, "lib"), path.join(runtime, "driver/lib"), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    fs.mkdirSync(path.join(runtime, "driver/prebuilds"));
    fs.copyFileSync(
      path.join(driverRoot, "prebuilds/win32-x64.node"),
      path.join(runtime, "driver/prebuilds/win32-x64.node"),
      fs.constants.COPYFILE_EXCL,
    );
    const require = createRequire(path.join(repo, "package.json"));
    const core = require("esbuild").buildSync({
      entryPoints: [path.join(repo, "packages/core/src/index.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    fs.writeFileSync(
      path.join(runtime, "core.mjs"),
      core.outputFiles[0].contents,
      { flag: "wx" },
    );
    for (const name of ["fixtures.mjs", "sql-reader.mjs"])
      fs.copyFileSync(
        path.join(repo, "packages/storage/tests", name),
        path.join(runtime, name),
        fs.constants.COPYFILE_EXCL,
      );
    fs.copyFileSync(
      path.join(source, "negative-tests.mjs"),
      path.join(runtime, "negative-tests.mjs"),
      fs.constants.COPYFILE_EXCL,
    );
    fs.copyFileSync(
      path.join(source, "local-shm.cjs"),
      path.join(runtime, "local-shm.cjs"),
      fs.constants.COPYFILE_EXCL,
    );
    const files = inventory(runtime).map((f) => ({
      path: path.relative(runtime, f.path).split(path.sep).join("/"),
      sha256: f.sha256,
    }));
    fs.writeFileSync(
      path.join(runtime, "deployment.json"),
      JSON.stringify({ kind: "synthetic-host-resources-v1", runId, files }),
      { flag: "wx" },
    );
    const spec = {
      runId,
      rootMode:
        args[0] === "--execute-local-validation" ? "local-validation" : "temp",
      storeKey:
        args[0] === "--execute-local-validation" ? randomUUID() : undefined,
      evidence,
      nativeBuild: approved,
      driverNativeSha256: hash(
        path.join(runtime, "driver/prebuilds/win32-x64.node"),
      ),
      codeRoot,
      codeExeSha256: hash(path.join(codeRoot, "Code.exe")),
      sources: inventory(source),
      runtimeFiles: files,
    };
    save("manifest.json", spec);
    const vsce = path.join(
        repo,
        "experiments/phase-2-sqlite-driver-spike/node_modules/@vscode/vsce/vsce",
      ),
      vsix = path.join(evidence, "validation-win32-x64.vsix");
    run(
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
    const archive = run("archive", "powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(source, "archive.ps1"),
      "-Vsix",
      vsix,
    ]);
    const contents = JSON.parse(archive.stdout);
    for (const f of files) {
      const entry = contents.find(
        (e) => e.path === "extension/runtime/" + f.path,
      );
      if (entry?.sha256 !== f.sha256) throw Error("VSIX_CONTENT_MISMATCH");
    }
    save("package-binding.json", {
      vsixSha256: hash(vsix),
      runtimeFilesMatched: files.length,
      actualArchive: contents,
    });
    const extensions = path.join(evidence, "extensions"),
      profile = path.join(evidence, "profile"),
      workspace = path.join(evidence, "workspace");
    for (const p of [extensions, profile, workspace]) fs.mkdirSync(p);
    const appDir = fs
      .readdirSync(codeRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(codeRoot, e.name, "resources/app"))
      .find((p) => fs.existsSync(path.join(p, "out/cli.js")));
    if (!appDir) throw Error("CODE_CLI_MISSING");
    const codeExe = path.join(codeRoot, "Code.exe"),
      env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    run(
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
      { env },
    );
    const installed = fs
      .readdirSync(extensions)
      .filter((n) =>
        /^apv-local-validation.apv-storage-host-validation-0\.0\.0(?:-win32-x64)?$/.test(
          n,
        ),
      );
    if (installed.length !== 1) throw Error("INSTALLED_IDENTITY");
    const installedRoot = path.join(extensions, installed[0]);
    for (const f of files)
      if (
        hash(path.join(installedRoot, "runtime", ...f.path.split("/"))) !==
        f.sha256
      )
        throw Error("INSTALLED_HASH");
    save("installed-binding.json", {
      installedRoot,
      runtimeFilesMatched: files.length,
      vsixSha256: hash(vsix),
    });
    const controller = path.join(evidence, "controller");
    fs.mkdirSync(controller);
    fs.writeFileSync(
      path.join(controller, "package.json"),
      JSON.stringify({
        name: "apv-test-controller",
        publisher: "apv-local-validation",
        version: "0.0.0",
        engines: { vscode: "1.140.0" },
        main: "main.cjs",
      }),
      { flag: "wx" },
    );
    fs.writeFileSync(
      path.join(controller, "main.cjs"),
      "exports.activate=()=>{};",
      { flag: "wx" },
    );
    const hostEnv = {
      ...process.env,
      APV_B1_HOST_SPEC: path.join(evidence, "manifest.json"),
      APV_B1_CONTROLLER: controller,
    };
    delete hostEnv.ELECTRON_RUN_AS_NODE;
    run(
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
        path.join(installedRoot, "host-tests.cjs"),
        "--disable-extension",
        "github.copilot-chat",
        "--disable-extension",
        "github.copilot",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        workspace,
      ],
      { env: hostEnv, timeout: 180000 },
    );
    const report = JSON.parse(
      fs.readFileSync(path.join(evidence, "host-result.json"), "utf8"),
    );
    if (report.status !== "PASS WITH LIMITATION")
      throw Error("NO_HOST_EVIDENCE");
    status = report.status;
  } catch (error) {
    save("failure.json", {
      status: "unavailable",
      error: String(error.message),
    });
    process.exitCode = 1;
  } finally {
    const files = inventory(evidence);
    const rootFile = path.join(evidence, "synthetic-root.json");
    if (fs.existsSync(rootFile))
      files.push(
        ...inventory(JSON.parse(fs.readFileSync(rootFile, "utf8")).root),
      );
    save("inventory.json", {
      runId,
      scope: "post-process file bytes; inventory excludes itself",
      files,
    });
    console.log(JSON.stringify({ runId, evidenceRoot: evidence, status }));
  }
}
