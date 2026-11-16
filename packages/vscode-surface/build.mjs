import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { build, version as esbuildVersion } from "esbuild";

const here = fileURLToPath(new URL(".", import.meta.url)),
  repo = path.resolve(here, "../..");
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const record = (file) => ({
  path: file,
  bytes: fs.statSync(file).size,
  sha256: hash(file),
});
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(dir, item.name);
    if (item.isSymbolicLink()) throw Error("surface_source_link_rejected");
    return item.isDirectory() ? walk(file) : [file];
  });
export async function buildSurface({ outDir, recoveryDriverRoot }) {
  if (!path.isAbsolute(outDir)) throw Error("surface_output_rejected");
  if (fs.existsSync(outDir)) throw Error("surface_output_exists");
  const recoveredSample = recoveryDriverRoot !== undefined;
  const preview = path.join(repo, "experiments/core-preview");
  const sourcePaths = [
    ...walk(path.join(repo, "packages/core/src")),
    ...walk(path.join(repo, "packages/core/examples")),
    ...walk(path.join(here, "src")),
    ...walk(path.join(here, "web")),
    ...["package.json", "README.md", "extension.cjs", "build.mjs"].map((name) =>
      path.join(here, name),
    ),
    ...["app.ts", "index.html", "style.css"].map((name) =>
      path.join(preview, name),
    ),
    ...(recoveredSample
      ? [
          ...[
            "recovery.mjs",
            "recovery-case.ts",
            "recovery-writer.mjs",
            "recovery-driver.mjs",
          ].map((name) => path.join(preview, name)),
          ...walk(path.join(repo, "packages/storage/src")),
        ]
      : []),
  ].sort();
  const sourceInputs = sourcePaths.map(record);
  let checkpoint;
  if (recoveredSample) {
    try {
      const { loadRecoveredCheckpoint } =
        await import("../../experiments/core-preview/recovery.mjs");
      checkpoint = await loadRecoveredCheckpoint(recoveryDriverRoot, {
        endSession: false,
      });
    } catch {
      throw Error("surface_recovery_unavailable");
    }
  }
  const compileClient = (recovered) =>
    build({
      entryPoints: [path.join(preview, "app.ts")],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2023",
      write: false,
      logLevel: "silent",
      ...(recovered === undefined
        ? {}
        : {
            define: { APV_RECOVERED_CHECKPOINT: JSON.stringify(recovered) },
          }),
    });
  const [client, recovered] = await Promise.all([
    compileClient(),
    checkpoint === undefined ? undefined : compileClient(checkpoint),
  ]);
  const host = await build({
    entryPoints: [path.join(here, "extension.cjs")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["vscode"],
    define: { APV_SURFACE_RECOVERED_SAMPLE: String(recoveredSample) },
    write: false,
    logLevel: "silent",
  });
  for (const row of sourceInputs)
    if (hash(row.path) !== row.sha256) throw Error("surface_source_changed");
  try {
    fs.mkdirSync(outDir);
  } catch (error) {
    if (error.code === "EEXIST") throw Error("surface_output_exists");
    throw error;
  }
  fs.mkdirSync(path.join(outDir, "dist"));
  fs.mkdirSync(path.join(outDir, "media"));
  const write = (name, bytes) =>
    fs.writeFileSync(path.join(outDir, name), bytes, { flag: "wx" });
  write("dist/extension.cjs", host.outputFiles[0].contents);
  write("media/app.js", client.outputFiles[0].contents);
  if (recovered !== undefined) {
    write("media/recovered.js", recovered.outputFiles[0].contents);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(here, "package.json"), "utf8"),
    );
    manifest.contributes.commands.push({
      command: "apv.openRecoveredDemo",
      title: "查看已恢复的合成历史",
      category: "AI Project Visualizer",
    });
    write("package.json", JSON.stringify(manifest, null, 2) + "\n");
  } else {
    write("package.json", fs.readFileSync(path.join(here, "package.json")));
  }
  write("README.md", fs.readFileSync(path.join(here, "README.md")));
  for (const name of ["index.html", "style.css"])
    write("media/" + name, fs.readFileSync(path.join(preview, name)));
  for (const name of ["overview.html", "surface.css", "bridge.js"])
    write("media/" + name, fs.readFileSync(path.join(here, "web", name)));
  const receipt = {
    kind: "apv-surface-build-v1",
    buildId: randomUUID(),
    productionEnabled: false,
    recoveredSample,
    toolchain: { node: process.version, esbuild: esbuildVersion },
    sourceInputs,
    files: walk(outDir).map((file) => ({
      ...record(file),
      path: path.relative(outDir, file).replaceAll("\\", "/"),
    })),
  };
  write("build.json", JSON.stringify(receipt, null, 2));
  return receipt;
}
function buildOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key =
      args[i] === "--out"
        ? "outDir"
        : args[i] === "--recovered-demo-driver"
          ? "recoveryDriverRoot"
          : undefined;
    const value = args[i + 1];
    if (!key || Object.hasOwn(options, key) || !path.isAbsolute(value ?? ""))
      return undefined;
    options[key] = value;
  }
  return options;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const options = buildOptions(args);
  if (args.length === 1 && args[0] === "--help")
    console.log(
      "pnpm build:surface [--out ABSOLUTE_NEW_DIRECTORY] [--recovered-demo-driver ABSOLUTE_DRIVER_ROOT]",
    );
  else if (options === undefined) {
    console.error("INVALID_SURFACE_BUILD_ARGUMENTS");
    process.exitCode = 2;
  } else
    try {
      const outDir =
        options.outDir ??
        path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), "apv-surface-build-")),
          "package",
        );
      const receipt = await buildSurface({ ...options, outDir });
      console.log(
        JSON.stringify({
          buildId: receipt.buildId,
          outDir,
          files: receipt.files.length,
          recoveredSample: receipt.recoveredSample,
          productionEnabled: false,
        }),
      );
    } catch (error) {
      console.error(
        error.message === "surface_recovery_unavailable"
          ? "SURFACE_RECOVERY_UNAVAILABLE"
          : "SURFACE_BUILD_UNAVAILABLE",
      );
      process.exitCode = 1;
    }
}
