"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createRequire } = require("node:module");
const { randomUUID, createHash } = require("node:crypto");
const { failure, hash } = require("./protocol.cjs");
const REPO = path.resolve(__dirname, "../..");
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const boundedText = (file) => {
  if (fs.statSync(file).size > 1024 * 1024) throw failure("APV_EVIDENCE_SIZE");
  return fs.readFileSync(file, "utf8");
};
function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
function noLinks(file) {
  const absolute = path.resolve(file);
  for (let cursor = absolute; ; cursor = path.dirname(cursor)) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw failure("APV_PATH_LINK");
    if (path.dirname(cursor) === cursor) break;
  }
  const resolved = fs.realpathSync.native(absolute);
  if (
    resolved.toLowerCase() !== absolute.toLowerCase() ||
    absolute.startsWith("\\\\")
  )
    throw failure("APV_PATH_ALIAS");
  return resolved;
}
function identity(file) {
  noLinks(file);
  const stat = fs.statSync(file, { bigint: true });
  if (!stat.isFile() || stat.ino === 0n || stat.birthtimeNs <= 0n)
    throw failure("APV_FILE_IDENTITY");
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    birth: stat.birthtimeNs.toString(),
  };
}
function sameIdentity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function writeExclusive(file, data) {
  noLinks(path.dirname(file));
  if (JSON.stringify(data).length > 1024 * 1024)
    throw failure("APV_EVIDENCE_SIZE");
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}
function readJSON(file) {
  noLinks(file);
  return JSON.parse(boundedText(file));
}
function resolveDriver() {
  const anchor = path.join(
    REPO,
    "experiments/phase-2-sqlite-driver-spike/package.json",
  );
  const localRequire = createRequire(anchor);
  const pkgFile = localRequire.resolve("better-sqlite3/package.json");
  if (readJSON(pkgFile).version !== "13.0.3")
    throw failure("APV_DRIVER_VERSION");
  return { localRequire, pkgFile };
}
function preflight() {
  let stage = "runtime";
  try {
    if (
      process.platform !== "win32" ||
      process.arch !== "x64" ||
      process.version !== "v24.21.0"
    )
      throw failure("APV_RUNTIME_SCOPE");
    stage = "temporary_root_metadata";
    const temp = noLinks(os.tmpdir());
    if (temp.toLowerCase() === REPO.toLowerCase() || inside(REPO, temp))
      throw failure("APV_TEMP_REPO");
    stage = "temporary_root_access";
    fs.accessSync(temp, fs.constants.R_OK | fs.constants.W_OK);
    stage = "local_driver_metadata";
    const { pkgFile } = resolveDriver();
    const nativeFile = path.join(
      path.dirname(pkgFile),
      "prebuilds/win32-x64.node",
    );
    stage = "native_resource_metadata";
    noLinks(nativeFile);
    const binaryHash = createHash("sha256")
      .update(fs.readFileSync(nativeFile))
      .digest("hex");
    return {
      status: "READY FOR REVIEW",
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      modules: process.versions.modules,
      napi: process.versions.napi,
      driver: "13.0.3",
      binaryHash,
      databaseOpened: false,
      workerStarted: false,
      nativeLoad: "NOT TESTED",
      ownership: "NOT TESTED",
    };
  } catch (error) {
    error.preflightStage = stage;
    throw error;
  }
}
function loadDriver() {
  return resolveDriver().localRequire("better-sqlite3");
}
function makeRun() {
  preflight();
  const runId = randomUUID();
  const temp = noLinks(os.tmpdir());
  const base = path.join(temp, "apv-sqlite-ownership");
  if (!fs.existsSync(base)) fs.mkdirSync(base, { mode: 0o700 });
  noLinks(base);
  const root = path.join(base, runId);
  fs.mkdirSync(root, { mode: 0o700 });
  noLinks(root);
  writeExclusive(path.join(root, "manifest.json"), {
    magic: "APV_OWNERSHIP_RUN",
    runId,
    parentPid: process.pid,
    createdAt: new Date().toISOString(),
    runtime: preflight(),
    sourceHashes: Object.fromEntries(
      fs
        .readdirSync(__dirname)
        .filter((name) => /\.(cjs|mjs)$/.test(name))
        .map((name) => [
          name,
          createHash("sha256")
            .update(fs.readFileSync(path.join(__dirname, name)))
            .digest("hex"),
        ]),
    ),
    decisionAccepted: false,
  });
  return { root, runId };
}
function settings(db, mode) {
  db.pragma(`journal_mode = ${mode}`);
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 250");
  if (
    db.pragma("journal_mode", { simple: true }) !== mode.toLowerCase() ||
    db.pragma("synchronous", { simple: true }) !== 2 ||
    db.pragma("foreign_keys", { simple: true }) !== 1 ||
    db.pragma("temp_store", { simple: true }) !== 2
  )
    throw failure("APV_SETTINGS");
}
function setupCase(run, caseId, variant) {
  const root = path.join(run.root, `${caseId}-${variant}`);
  fs.mkdirSync(root, { mode: 0o700 });
  for (const dir of ["ownership/S1", "projects/S1/G1", "evidence", "control"])
    fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 });
  const ownerPath = path.join(root, "ownership/S1/owner.sqlite");
  const projectPath = path.join(root, "projects/S1/G1/project.sqlite");
  const Database = loadDriver();
  let db;
  try {
    db = new Database(ownerPath);
    settings(db, "DELETE");
    db.exec(
      "CREATE TABLE owner_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),magic TEXT NOT NULL,schema_version INTEGER NOT NULL,store_key TEXT NOT NULL); INSERT INTO owner_meta VALUES(1,'APV_OWNER_SPIKE',1,'S1');",
    );
    db.close();
    db = new Database(projectPath);
    settings(db, "WAL");
    db.exec(
      "CREATE TABLE store_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),project_id TEXT NOT NULL,generation TEXT NOT NULL,lifecycle TEXT NOT NULL,epoch INTEGER NOT NULL CHECK(epoch>=0),token TEXT,head INTEGER NOT NULL CHECK(head>=0),digest TEXT NOT NULL); CREATE TABLE fixture_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),value INTEGER NOT NULL,digest TEXT NOT NULL); CREATE TABLE writes(operation_id TEXT PRIMARY KEY,intent_digest TEXT NOT NULL,epoch INTEGER NOT NULL,token TEXT NOT NULL,base_head INTEGER NOT NULL,new_head INTEGER NOT NULL UNIQUE,result_digest TEXT NOT NULL);",
    );
    const digest = hash({ head: 0, value: 0 });
    db.prepare(
      "INSERT INTO store_meta VALUES(1,'PA','G1','active',0,NULL,0,?)",
    ).run(digest);
    db.prepare("INSERT INTO fixture_state VALUES(1,0,?)").run(digest);
    const sqliteVersion = db
      .prepare("SELECT sqlite_version() AS version")
      .get().version;
    db.close();
    db = undefined;
    // Copied marker rejection: copy only the quiescent fresh Owner DB, never
    // inspect/copy a live SQLite file with another raw descriptor.
    fs.copyFileSync(
      ownerPath,
      path.join(root, "ownership/S1/copied.sqlite"),
      fs.constants.COPYFILE_EXCL,
    );
    const binding = {
      magic: "APV_OWNERSHIP_CASE",
      runId: run.runId,
      caseId,
      variant,
      root,
      projectId: "PA",
      storeKey: "S1",
      generation: "G1",
      ownerPath,
      projectPath,
      ownerIdentity: identity(ownerPath),
      projectIdentity: identity(projectPath),
      sqliteVersion,
    };
    writeExclusive(path.join(root, "binding.json"), binding);
    return binding;
  } finally {
    if (db?.open) db.close();
  }
}
function validateBinding(binding, ownerAlias, reader = false) {
  if (
    !binding ||
    binding.magic !== "APV_OWNERSHIP_CASE" ||
    !UUID.test(binding.runId) ||
    !/^OP\d\d$/.test(binding.caseId) ||
    binding.storeKey !== "S1" ||
    binding.projectId !== "PA"
  )
    throw failure("APV_BINDING");
  const runRoot = path.join(
    noLinks(os.tmpdir()),
    "apv-sqlite-ownership",
    binding.runId,
  );
  if (
    !inside(runRoot, binding.root) ||
    !inside(binding.root, binding.ownerPath) ||
    !inside(binding.root, binding.projectPath)
  )
    throw failure("APV_ROOT_ESCAPE");
  noLinks(binding.root);
  const manifest = readJSON(path.join(runRoot, "manifest.json"));
  if (
    manifest.magic !== "APV_OWNERSHIP_RUN" ||
    manifest.runId !== binding.runId
  )
    throw failure("APV_RUN_BINDING");
  if (ownerAlias !== undefined) throw failure("APV_PATH_ALIAS");
  if (
    (!reader &&
      !sameIdentity(identity(binding.ownerPath), binding.ownerIdentity)) ||
    !sameIdentity(identity(binding.projectPath), binding.projectIdentity)
  )
    throw failure("APV_FILE_IDENTITY");
  return manifest;
}
function budget(root, limit = 32 * 1024 * 1024) {
  let size = 0;
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw failure("APV_PATH_LINK");
      if (stat.isDirectory()) scan(file);
      else size += stat.size;
      if (size > limit) throw failure("APV_BUDGET");
    }
  }
  scan(root);
  return size;
}
function inventory(root) {
  const files = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw failure("APV_PATH_LINK");
      if (entry.isDirectory()) scan(file);
      else
        files.push({
          path: path.relative(root, file),
          sha256: createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex"),
        });
    }
  }
  scan(root);
  return files;
}
module.exports = {
  REPO,
  UUID,
  inside,
  noLinks,
  identity,
  sameIdentity,
  writeExclusive,
  readJSON,
  preflight,
  loadDriver,
  settings,
  makeRun,
  setupCase,
  validateBinding,
  sleep,
  budget,
  inventory,
};
