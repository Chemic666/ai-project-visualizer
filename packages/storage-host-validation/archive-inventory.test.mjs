import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolPackage = fileURLToPath(
  new URL(
    "../../experiments/phase-2-sqlite-driver-spike/node_modules/@vscode/vsce/package.json",
    import.meta.url,
  ),
);
const require = createRequire(fs.realpathSync.native(toolPackage));
const { ZipFile } = require("yazl");
const source = fileURLToPath(
  new URL("./archive-inventory.mjs", import.meta.url),
);
const api = fs.existsSync(source)
  ? await import(pathToFileURL(source).href)
  : {};

async function generated(entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-restart-vsix-test-"));
  const zip = new ZipFile(),
    target = path.join(root, "synthetic.vsix");
  const written = pipeline(
    zip.outputStream,
    fs.createWriteStream(target, { flags: "wx" }),
  );
  for (const [name, body] of entries) zip.addBuffer(Buffer.from(body), name);
  zip.end();
  await written;
  return { root, target };
}

test("generated VSIX inventory hashes actual entry bytes without extracting files", async () => {
  assert.equal(typeof api.readVsixInventory, "function");
  const f = await generated([
    ["extension/runtime/core.mjs", "synthetic-core"],
    ["extension/package.json", "{}"],
  ]);
  const result = await api.readVsixInventory(f.target, toolPackage);
  assert.deepEqual(result, [
    {
      path: "extension/runtime/core.mjs",
      bytes: 14,
      sha256: createHash("sha256").update("synthetic-core").digest("hex"),
    },
    {
      path: "extension/package.json",
      bytes: 2,
      sha256: createHash("sha256").update("{}").digest("hex"),
    },
  ]);
  assert.deepEqual(fs.readdirSync(f.root), ["synthetic.vsix"]);
});

test("Windows case-alias archive entries are refused before installation", async () => {
  const f = await generated([
    ["extension/runtime/core.mjs", "a"],
    ["extension/runtime/CORE.mjs", "b"],
  ]);
  await assert.rejects(api.readVsixInventory(f.target, toolPackage), {
    message: "archive_identity_rejected",
  });
  assert.deepEqual(fs.readdirSync(f.root), ["synthetic.vsix"]);
});
