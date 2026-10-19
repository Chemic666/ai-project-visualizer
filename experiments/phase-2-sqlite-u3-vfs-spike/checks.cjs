"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
function uuid(value) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value || ""))
    throw new Error("INVALID_ID");
  return value;
}
function inside(root, target) {
  const rel = path.win32.relative(
    path.win32.resolve(root),
    path.win32.resolve(target),
  );
  if (!rel || rel.startsWith("..") || path.win32.isAbsolute(rel))
    throw new Error("PATH_ESCAPE");
  return true;
}
function parse(args) {
  if (!args.length) return { mode: "help" };
  if (args.length === 1 && args[0] === "--list") return { mode: "list" };
  const pre =
    args.length === 3 && args[0] === "--preflight" && args[1] === "--build-id";
  const run =
    args.length === 4 &&
    args[0] === "--run-g1" &&
    args[1] === "--execute" &&
    args[2] === "--build-id";
  if (!pre && !run) throw new Error("EXECUTION_DISABLED_OR_INVALID_ARGUMENTS");
  return { mode: pre ? "preflight" : "g1", buildId: uuid(args.at(-1)) };
}
function hash(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
function write(file, data) {
  fs.writeFileSync(
    file,
    typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n",
    { flag: "wx" },
  );
}
function identity(file) {
  const s = fs.statSync(file, { bigint: true });
  return { dev: String(s.dev), ino: String(s.ino), nlink: String(s.nlink) };
}
function physical(target) {
  if (process.platform !== "win32" || !/^\w:\\/.test(path.resolve(target)))
    throw new Error("WINDOWS_LOCAL_PATH_REQUIRED");
  const check = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      path.join(__dirname, "physical-path.ps1"),
      "-Target",
      path.resolve(target),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (check.error || check.status !== 0)
    throw new Error("PHYSICAL_PATH_REJECTED: " + (check.stderr || check.error));
  const metadata = JSON.parse(check.stdout.replace(/^\uFEFF/, ""));
  if (
    fs.realpathSync.native(target).toLowerCase() !==
    path.resolve(target).toLowerCase()
  )
    throw new Error("PHYSICAL_ALIAS");
  return { ...metadata, identity: identity(target) };
}
function tempRoot() {
  const expected = path.join(os.homedir(), "AppData", "Local", "Temp");
  if (path.resolve(os.tmpdir()).toLowerCase() !== expected.toLowerCase())
    throw new Error("TEMP_OVERRIDE_NOT_ADMITTED");
  physical(expected);
  return expected;
}
function driverPaths() {
  const base = path.resolve(
    __dirname,
    "../phase-2-sqlite-driver-spike/node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3",
  );
  return {
    base,
    package: path.join(base, "package.json"),
    native: path.join(base, "prebuilds/win32-x64.node"),
    headers: path.join(base, "deps/sqlite3"),
  };
}
function preflight(buildId) {
  uuid(buildId);
  const buildDir = path.join(__dirname, "build", buildId);
  physical(buildDir);
  const m = JSON.parse(
    fs.readFileSync(path.join(buildDir, "build.json"), "utf8"),
  );
  const driver = driverPaths();
  if (
    m.status !== "BUILD PASS" ||
    m.buildId !== buildId ||
    process.version !== "v24.21.0" ||
    process.arch !== "x64" ||
    process.platform !== "win32"
  )
    throw new Error("BUILD_OR_RUNTIME_MISMATCH");
  if (JSON.parse(fs.readFileSync(driver.package, "utf8")).version !== "13.0.3")
    throw new Error("DRIVER_VERSION_MISMATCH");
  for (const [file, digest] of Object.entries(m.inputs))
    if (hash(file) !== digest) throw new Error("BUILD_INPUT_CHANGED");
  const dll = path.join(buildDir, "apv_vfs.dll");
  if (
    hash(dll) !== m.binarySha256 ||
    hash(driver.native) !== m.driverSha256 ||
    hash(process.execPath) !== m.nodeSha256
  )
    throw new Error("BINARY_MISMATCH");
  return {
    buildId,
    buildDir,
    dll,
    driver,
    metadata: m,
    temp: tempRoot(),
    integration: "NOT TESTED",
    databaseOpens: 0,
  };
}
module.exports = {
  uuid,
  inside,
  parse,
  hash,
  write,
  identity,
  physical,
  tempRoot,
  driverPaths,
  preflight,
};
