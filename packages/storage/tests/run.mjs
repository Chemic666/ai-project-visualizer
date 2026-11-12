import fs from "node:fs";
import { readNativePackage } from "../src/native-attestor.mjs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    "Storage integration disabled. Explicit synthetic tests: --execute-synthetic --driver-root ABSOLUTE_INSTALLED_DRIVER_ROOT",
  );
} else {
  const mode = new Map([
    ["--execute-synthetic", { test: "integration.test.mjs" }],
    ["--execute-host-synthetic", { test: "host-integration.test.mjs" }],
    [
      "--execute-b1-synthetic",
      { test: "native-identity.test.mjs", native: true },
    ],
    ["--execute-catalog-synthetic", { test: "catalog-quota.test.mjs" }],
    [
      "--execute-catalog-native-synthetic",
      { test: "catalog-quota.test.mjs", native: true },
    ],
    ["--execute-cache-synthetic", { test: "snapshot-cache.test.mjs" }],
    [
      "--execute-cache-native-synthetic",
      { test: "snapshot-cache.test.mjs", native: true },
    ],
    ["--execute-checkpoint-synthetic", { test: "checkpoint-only.test.mjs" }],
    [
      "--execute-checkpoint-native-synthetic",
      { test: "checkpoint-only.test.mjs", native: true },
    ],
    ["--execute-plan-synthetic", { test: "plan-storage.test.mjs" }],
    [
      "--execute-plan-native-synthetic",
      { test: "plan-storage.test.mjs", native: true },
    ],
  ]).get(args[0]);
  if (
    !mode ||
    args.length !== (mode.native ? 5 : 3) ||
    args[1] !== "--driver-root" ||
    !path.isAbsolute(args[2]) ||
    (mode.native &&
      (args[3] !== "--native-manifest" || !path.isAbsolute(args[4])))
  )
    throw new Error("INVALID_TEST_ARGUMENTS");
  const nativePackage = mode.native ? readNativePackage(args[4]) : undefined;
  const driverRoot = fs.realpathSync.native(args[2]);
  const driver = JSON.parse(
    fs.readFileSync(path.join(driverRoot, "package.json"), "utf8"),
  );
  if (
    driver.name !== "better-sqlite3" ||
    driver.version !== "13.0.3" ||
    process.platform !== "win32" ||
    process.arch !== "x64"
  )
    throw new Error("UNSUPPORTED_TEST_TUPLE");
  const repo = path.resolve(
    fileURLToPath(new URL("../../../", import.meta.url)),
  );
  const require = createRequire(path.join(repo, "package.json"));
  const esbuild = require("esbuild");
  const runId = randomUUID(),
    evidence = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-evidence-"));
  const planMode = mode.test === "plan-storage.test.mjs";
  const core = esbuild.buildSync({
    ...(planMode
      ? {
          stdin: {
            contents:
              'export * from "./packages/core/src/index.ts"; export { validatePlan } from "./packages/core/src/plan-engine.ts";',
            sourcefile: "apv-synthetic-plan.ts",
            resolveDir: repo,
          },
        }
      : { entryPoints: [path.join(repo, "packages/core/src/index.ts")] }),
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const corePath = path.join(evidence, "core.mjs");
  fs.writeFileSync(corePath, core.outputFiles[0].contents, { flag: "wx" });
  const fingerprint = createHash("sha256")
    .update(fs.readFileSync(corePath))
    .digest("hex");
  const hash = (p) =>
    createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  function inventory(root) {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isSymbolicLink()) throw new Error("UNEXPECTED_EVIDENCE_LINK");
      return entry.isDirectory()
        ? inventory(full)
        : [{ path: full, bytes: fs.statSync(full).size, sha256: hash(full) }];
    });
  }
  const childArgs = [
    "--test",
    path.join(repo, "packages/storage/tests", mode.test),
  ];
  const sources = ["src", "tests", "native"].flatMap((dir) =>
    inventory(path.join(repo, "packages/storage", dir)),
  );
  const driverBinary = path.join(driverRoot, "prebuilds/win32-x64.node");
  const spec = {
    validationMode: args[0],
    ...(nativePackage ? { nativePackage } : {}),
    runId,
    evidence,
    corePath,
    processorFingerprint: fingerprint,
    driverRoot,
    driverVersion: driver.version,
    driverBinary,
    driverBinarySha256: hash(driverBinary),
    sources,
    node: process.version,
    parentPid: process.pid,
    args: childArgs,
  };
  fs.writeFileSync(
    path.join(evidence, "manifest.json"),
    JSON.stringify(spec, null, 2),
    { flag: "wx" },
  );
  const result = spawnSync(process.execPath, childArgs, {
    cwd: repo,
    env: {
      ...process.env,
      APV_STORAGE_TEST_SPEC: path.join(evidence, "manifest.json"),
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  fs.writeFileSync(
    path.join(evidence, "tests.stdout.txt"),
    result.stdout ?? "",
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(evidence, "tests.stderr.txt"),
    result.stderr ?? "",
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(evidence, "tests.exit.json"),
    JSON.stringify({
      pid: result.pid,
      status: result.status,
      signal: result.signal,
      error: result.error ? "process_failure" : null,
    }),
    { flag: "wx" },
  );
  const sealed = inventory(evidence);
  const roots = sealed
    .filter((r) => /synthetic-root-\d+\.json$/.test(r.path))
    .map((r) => JSON.parse(fs.readFileSync(r.path, "utf8")).root);
  const files = [...sealed, ...roots.flatMap(inventory)];
  fs.writeFileSync(
    path.join(evidence, "inventory.json"),
    JSON.stringify(
      {
        runId,
        scope: "post-exit file bytes; inventory excludes itself",
        files,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  console.log(
    JSON.stringify({ runId, evidenceRoot: evidence, exitCode: result.status }),
  );
  process.exitCode = result.status ?? 1;
}
