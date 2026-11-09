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
