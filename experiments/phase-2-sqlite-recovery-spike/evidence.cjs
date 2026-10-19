"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { fail } = require("./checks.cjs");
const lateFiles = new Set([
  "inventory.json",
  "seal.json",
  "cmd-stdout.txt",
  "cmd-stderr.txt",
  "cmd-exit.txt",
  "cmd-inventory.json",
  "cmd-seal.json",
]);
const fileHash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(root, e.name);
    if (e.isSymbolicLink()) throw fail("EVIDENCE_LINK");
    return e.isDirectory() ? files(file) : [file];
  });
}
function inventory(root) {
  return files(root)
    .filter((f) => !lateFiles.has(path.relative(root, f).replaceAll("\\", "/")))
    .map((f) => ({
      path: path.relative(root, f).replaceAll("\\", "/"),
      size: fs.statSync(f).size,
      sha256: fileHash(f),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
function verifyInventory(root, expected) {
  if (!Array.isArray(expected)) throw fail("INVENTORY_MISSING");
  const actual = inventory(root);
  verifyEntries(actual, expected);
  return actual.length;
}
function verifyEntries(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw fail("INVENTORY_CHANGED");
}
module.exports = {
  fileHash,
  files,
  inventory,
  verifyInventory,
  verifyEntries,
  lateFiles,
};
