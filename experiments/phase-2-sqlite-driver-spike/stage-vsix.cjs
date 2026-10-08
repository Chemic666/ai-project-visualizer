// Disposable packaging staging. Copy physical files instead of pnpm symlinks.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = __dirname;
const stage = path.join(root, "artifacts", "extension");
const driverRoot = fs.realpathSync(
  path.join(root, "node_modules", "better-sqlite3"),
);
const metadata = JSON.parse(
  fs.readFileSync(path.join(driverRoot, "package.json"), "utf8"),
);
assert.equal(metadata.version, "13.0.3");
assert.ok(
  fs.existsSync(path.join(driverRoot, "prebuilds", "win32-x64.node")),
  "Expected Windows x64 prebuild missing; do not silently substitute another target",
);
fs.mkdirSync(stage, { recursive: true });
for (const file of ["package.json", "extension.cjs", "probe.cjs", "README.md"])
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
for (const name of [
  "better-sqlite3",
  ...Object.keys(metadata.dependencies ?? {}),
]) {
  // Resolve the driver's own installed dependency, not an unrelated global copy.
  const packageFile =
    name === "better-sqlite3"
      ? path.join(driverRoot, "package.json")
      : require.resolve(`${name}/package.json`, { paths: [driverRoot] });
  fs.cpSync(
    path.dirname(fs.realpathSync(packageFile)),
    path.join(stage, "node_modules", name),
    { recursive: true, dereference: true },
  );
}
const nativePath = path.join(
  stage,
  "node_modules",
  "better-sqlite3",
  "prebuilds",
  "win32-x64.node",
);
const sha256 = require("node:crypto")
  .createHash("sha256")
  .update(fs.readFileSync(nativePath))
  .digest("hex");
fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
const stageEvidence = {
  driverVersion: metadata.version,
  target: "win32-x64",
  nativeFile: "node_modules/better-sqlite3/prebuilds/win32-x64.node",
  sha256,
  stagedOnly: true,
  vsixPackagingVerified: false,
};
const evidenceFile = path.join(root, "evidence", "native-stage.json");
if (fs.existsSync(evidenceFile)) {
  // Preserve earlier evidence; fail rather than overwrite a different receipt.
  assert.deepEqual(
    JSON.parse(fs.readFileSync(evidenceFile, "utf8")),
    stageEvidence,
    "Existing staging evidence differs; preserve it for review",
  );
} else {
  fs.writeFileSync(evidenceFile, JSON.stringify(stageEvidence, null, 2) + "\n");
}
console.log(
  "Staged physical runtime resources; this is not a VSIX or host verification.",
);
