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
export async function buildSurface({ outDir }) {
  if (!path.isAbsolute(outDir)) throw Error("surface_output_rejected");
  try {
    fs.mkdirSync(outDir);
  } catch (error) {
    if (error.code === "EEXIST") throw Error("surface_output_exists");
    throw error;
  }
  const sourcePaths = [
    ...walk(path.join(repo, "packages/core/src")),
    ...walk(path.join(repo, "packages/core/examples")),
    ...walk(path.join(here, "src")),
    ...walk(path.join(here, "web")),
    ...["package.json", "README.md", "extension.cjs", "build.mjs"].map((name) =>
      path.join(here, name),
    ),
    ...["app.ts", "index.html", "style.css"].map((name) =>
      path.join(repo, "experiments/core-preview", name),
    ),
  ].sort();
  const sourceInputs = sourcePaths.map(record);
  const client = await build({
    entryPoints: [path.join(repo, "experiments/core-preview/app.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2023",
    write: false,
    logLevel: "silent",
  });
  const host = await build({
    entryPoints: [path.join(here, "extension.cjs")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["vscode"],
    write: false,
    logLevel: "silent",
  });
  for (const row of sourceInputs)
    if (hash(row.path) !== row.sha256) throw Error("surface_source_changed");
  fs.mkdirSync(path.join(outDir, "dist"));
  fs.mkdirSync(path.join(outDir, "media"));
  const write = (name, bytes) =>
    fs.writeFileSync(path.join(outDir, name), bytes, { flag: "wx" });
  write("dist/extension.cjs", host.outputFiles[0].contents);
  write("media/app.js", client.outputFiles[0].contents);
  for (const name of ["package.json", "README.md"])
    write(name, fs.readFileSync(path.join(here, name)));
  for (const name of ["index.html", "style.css"])
    write(
      "media/" + name,
      fs.readFileSync(path.join(repo, "experiments/core-preview", name)),
    );
  for (const name of ["overview.html", "surface.css", "bridge.js"])
    write("media/" + name, fs.readFileSync(path.join(here, "web", name)));
  const receipt = {
    kind: "apv-surface-build-v1",
    buildId: randomUUID(),
    productionEnabled: false,
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
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help")
    console.log(
      "pnpm build:surface [--out ABSOLUTE_NEW_DIRECTORY] — builds only own disconnected/synthetic assets; no install or connection",
    );
  else if (
    args.length !== 0 &&
    !(args.length === 2 && args[0] === "--out" && path.isAbsolute(args[1]))
  ) {
    console.error("INVALID_SURFACE_BUILD_ARGUMENTS");
    process.exitCode = 2;
  } else
    try {
      const outDir =
        args[1] ??
        path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), "apv-surface-build-")),
          "package",
        );
      const receipt = await buildSurface({ outDir });
      console.log(
        JSON.stringify({
          buildId: receipt.buildId,
          outDir,
          files: receipt.files.length,
          productionEnabled: false,
        }),
      );
    } catch {
      console.error("SURFACE_BUILD_UNAVAILABLE");
      process.exitCode = 1;
    }
}
