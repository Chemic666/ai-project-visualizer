import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const filename = fileURLToPath(new URL("../build.mjs", import.meta.url));
const target = fs.existsSync(filename)
  ? await import(new URL("../build.mjs", import.meta.url))
  : {};
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const build = (options) => {
  assert.equal(
    typeof target.buildSurface,
    "function",
    "surface build is not implemented",
  );
  return target.buildSurface(options);
};
test("surface output: actual extension and Core bundle have an exact own-asset manifest", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "apv-surface-output-")),
    outDir = path.join(parent, "package");
  const receipt = await build({ outDir });
  const expected = [
    "README.md",
    "dist/extension.cjs",
    "media/app.js",
    "media/bridge.js",
    "media/index.html",
    "media/overview.html",
    "media/style.css",
    "media/surface.css",
    "package.json",
  ].sort();
  assert.deepEqual(receipt.files.map((row) => row.path).sort(), expected);
  assert.equal(receipt.productionEnabled, false);
  for (const row of receipt.files) {
    const file = path.join(outDir, row.path);
    assert.equal(hash(file), row.sha256);
    assert.equal(fs.statSync(file).size, row.bytes);
  }
  for (const row of receipt.sourceInputs) {
    assert.equal(hash(row.path), row.sha256);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outDir, "package.json"), "utf8"),
  );
  assert.equal(manifest.main, "./dist/extension.cjs");
  assert.deepEqual(manifest.activationEvents, []);
  assert.deepEqual(
    manifest.contributes.commands.map((c) => c.command),
    ["apv.open", "apv.openSyntheticDemo"],
  );
  assert.ok(!manifest.dependencies);
});
test("surface output: existing output is refused without overwriting its bytes", async () => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "apv-surface-output-existing-"),
  );
  const sentinel = path.join(outDir, "keep.txt");
  fs.writeFileSync(sentinel, "DO_NOT_OVERWRITE");
  await assert.rejects(() => build({ outDir }), {
    message: "surface_output_exists",
  });
  assert.equal(fs.readFileSync(sentinel, "utf8"), "DO_NOT_OVERWRITE");
  assert.deepEqual(fs.readdirSync(outDir), ["keep.txt"]);
});

test("a requested recovery with no admissible Driver leaves no extension package", async () => {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "apv-surface-recovery-failed-"),
  );
  const outDir = path.join(parent, "package");
  await assert.rejects(
    () =>
      build({
        outDir,
        recoveryDriverRoot: path.join(parent, "missing-driver"),
      }),
    {
      message: "surface_recovery_unavailable",
    },
  );
  assert.equal(fs.existsSync(outDir), false);
});

const driverRoot = process.env.APV_SURFACE_TEST_DRIVER_ROOT;
test(
  "the explicit recovery package carries the restored display and an optional command",
  {
    skip:
      driverRoot === undefined
        ? "Set APV_SURFACE_TEST_DRIVER_ROOT to the reviewed installed Driver."
        : false,
  },
  async () => {
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), "apv-surface-recovered-output-"),
    );
    const outDir = path.join(parent, "package");
    const receipt = await build({ outDir, recoveryDriverRoot: driverRoot });
    assert.equal(receipt.recoveredSample, true);
    assert.equal(receipt.files.length, 10);
    const asset = receipt.files.find(
      ({ path }) => path === "media/recovered.js",
    );
    assert.ok(asset);
    const file = path.join(outDir, asset.path);
    assert.equal(asset.sha256, hash(file));
    const text = fs.readFileSync(file, "utf8").replace(/\\u2192/g, "→");
    assert.match(text, /60% → 50%/);
    assert.doesNotMatch(
      text,
      /synthetic-marker|processorFingerprint|operationNonce|fixture\.json|apv-recovery-current-claim|apv-storage-slice-/,
    );
    const host = fs.readFileSync(
      path.join(outDir, "dist/extension.cjs"),
      "utf8",
    );
    assert.doesNotMatch(
      host,
      /better-sqlite3|recovery-driver|synthetic-marker/,
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf8"),
    );
    assert.deepEqual(
      manifest.contributes.commands.map(({ command }) => command),
      ["apv.open", "apv.openSyntheticDemo", "apv.openRecoveredDemo"],
    );
    assert.ok(
      receipt.sourceInputs.some(({ path }) =>
        path.endsWith("recovery-case.ts"),
      ),
    );
  },
);
