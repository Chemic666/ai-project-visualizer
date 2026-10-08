// DISPOSABLE SPIKE ONLY. Synthetic tables, no APV Core imports or storage schema.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TESTS = [
  "module_loading",
  "file_open",
  "sqlite_version",
  "schema",
  "prepared_statements",
  "foreign_keys",
  "commit",
  "rollback",
  "wal",
  "busy_timeout",
  "lock_handling",
  "close",
  "reopen",
  "persisted_data",
];

function environment() {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    modules: process.versions.modules ?? null,
    napi: process.versions.napi ?? null,
    electron: process.versions.electron ?? null,
    pid: process.pid,
  };
}

function errorData(error) {
  let message = String(error.message).split("\n")[0];
  for (const root of [
    __dirname,
    process.env.USERPROFILE,
    process.env.LOCALAPPDATA,
    process.env.TEMP,
  ].filter(Boolean)) {
    message = message.split(root).join("<LOCAL_PATH>");
  }
  return {
    code: error.code ?? error.name,
    message,
    sqliteCode: error.errcode ?? null,
  };
}

function loadCandidate(candidate) {
  if (candidate === "node:sqlite") {
    const sqlite = require("node:sqlite");
    const Database = sqlite.DatabaseSync ?? sqlite.Database;
    assert.equal(typeof Database, "function");
    return {
      open: (file) => new Database(file, { timeout: 100 }),
      driverVersion: process.version,
      driverRoot: null,
    };
  }
  assert.equal(candidate, "better-sqlite3");
  // Explicit local path prevents accidental use of an ancestor/global installation.
  const driverRoot = path.join(__dirname, "node_modules", "better-sqlite3");
  const metadata = require(path.join(driverRoot, "package.json"));
  assert.equal(metadata.version, "13.0.3", "Unexpected candidate version");
  const Database = require(driverRoot);
  return {
    open: (file) => new Database(file, { timeout: 100 }),
    driverVersion: metadata.version,
    driverRoot,
  };
}

function probeCandidate(candidate, stateRoot) {
  const tests = Object.fromEntries(
    TESTS.map((name) => [
      name,
      { status: "NOT TESTED", reason: "Earlier prerequisite not established" },
    ]),
  );
  const result = {
    candidate,
    expectedDriverVersion: candidate === "better-sqlite3" ? "13.0.3" : null,
    observedDriverVersion: null,
    environment: environment(),
    sqliteVersion: null,
    nativeLoads: [],
    tests,
  };
  let db;
  let contender;
  let loaded;
  let failed = false;
  const originalDlopen = process.dlopen;
  // Temporary trace, restored in finally; records actual native path/hash only.
  process.dlopen = function (module, filename, ...rest) {
    const returned = originalDlopen.call(process, module, filename, ...rest);
    result.nativeLoads.push({
      filename: loaded?.driverRoot
        ? path.relative(loaded.driverRoot, filename).replaceAll("\\", "/")
        : path.basename(filename),
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(filename))
        .digest("hex"),
    });
    return returned;
  };
  const step = (name, action) => {
    if (failed) return;
    try {
      const details = action();
      tests[name] = {
        status: "PASS",
        ...(details === undefined ? {} : { details }),
      };
    } catch (error) {
      tests[name] = { status: "FAIL", error: errorData(error) };
      failed = true;
    }
  };
  try {
    try {
      loaded = loadCandidate(candidate);
      result.observedDriverVersion = loaded.driverVersion;
      tests.module_loading = { status: "PASS" };
    } catch (error) {
      tests.module_loading = {
        status: error.code === "MODULE_NOT_FOUND" ? "NOT TESTED" : "FAIL",
        error: errorData(error),
        reason:
          "Candidate prerequisite unavailable; not a driver compatibility verdict",
      };
      return result;
    }
    fs.mkdirSync(stateRoot, { recursive: true });
    const directory = fs.mkdtempSync(path.join(stateRoot, "sqlite-probe-"));
    const databaseFile = path.join(directory, "synthetic.sqlite");
    step("file_open", () => {
      db = loaded.open(databaseFile);
      assert.equal(fs.existsSync(databaseFile), true);
    });
    step("sqlite_version", () => {
      result.sqliteVersion = db
        .prepare("SELECT sqlite_version() AS version")
        .get().version;
      return { version: result.sqliteVersion };
    });
    step("schema", () => {
      db.exec(
        "PRAGMA foreign_keys = ON; CREATE TABLE probe_parent(id INTEGER PRIMARY KEY, note TEXT NOT NULL); CREATE TABLE probe_child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id));",
      );
      assert.equal(
        db
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'probe_%'",
          )
          .get().count,
        2,
      );
    });
    step("prepared_statements", () => {
      db.prepare("INSERT INTO probe_parent(id, note) VALUES (?, ?)").run(
        1,
        "synthetic-persisted-row",
      );
      assert.equal(
        db.prepare("SELECT note FROM probe_parent WHERE id = ?").get(1).note,
        "synthetic-persisted-row",
      );
    });
    step("foreign_keys", () => {
      assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      let violation;
      try {
        db.prepare("INSERT INTO probe_child(id, parent_id) VALUES (?, ?)").run(
          1,
          999,
        );
      } catch (error) {
        violation = error;
      }
      assert.ok(violation && /FOREIGN KEY/i.test(violation.message));
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM probe_child").get().count,
        0,
      );
      db.prepare("INSERT INTO probe_child(id, parent_id) VALUES (?, ?)").run(
        1,
        1,
      );
      return { rejectedInvalidParent: true, acceptedValidParent: true };
    });
    step("commit", () => {
      db.exec(
        "BEGIN; INSERT INTO probe_parent(id, note) VALUES(2, 'committed'); COMMIT;",
      );
      assert.equal(
        db.prepare("SELECT note FROM probe_parent WHERE id = 2").get().note,
        "committed",
      );
    });
    step("rollback", () => {
      db.exec(
        "BEGIN; INSERT INTO probe_parent(id, note) VALUES(3, 'rolled-back'); ROLLBACK;",
      );
      assert.equal(
        db
          .prepare("SELECT count(*) AS count FROM probe_parent WHERE id = 3")
          .get().count,
        0,
      );
    });
    step("wal", () => {
      assert.equal(
        db.prepare("PRAGMA journal_mode = WAL").get().journal_mode,
        "wal",
      );
    });
    step("busy_timeout", () => {
      const constructorTimeout = db
        .prepare("PRAGMA busy_timeout")
        .get().timeout;
      assert.equal(constructorTimeout, 100);
      db.exec("PRAGMA busy_timeout = 150;");
      assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 150);
      return { constructorTimeout, configuredTimeout: 150 };
    });
    step("lock_handling", () => {
      contender = loaded.open(databaseFile);
      contender.exec("PRAGMA busy_timeout = 100;");
      db.exec("BEGIN IMMEDIATE;");
      const start = performance.now();
      let lockError;
      try {
        contender.exec(
          "INSERT INTO probe_parent(id, note) VALUES(4, 'locked-write');",
        );
      } catch (error) {
        lockError = error;
      }
      const elapsedMs = Math.round(performance.now() - start);
      db.exec("ROLLBACK;");
      assert.ok(
        lockError &&
          (lockError.code === "SQLITE_BUSY" ||
            lockError.errcode === 5 ||
            /locked|busy/i.test(lockError.message)),
      );
      contender.exec(
        "INSERT INTO probe_parent(id, note) VALUES(4, 'after-unlock');",
      );
      contender.close();
      contender = undefined;
      return {
        lockError: errorData(lockError),
        elapsedMs,
        writeAfterUnlock: true,
        limitation:
          "Two connections in one process, not crash/multi-process recovery or a performance benchmark",
      };
    });
    step("close", () => {
      db.close();
      db = undefined;
    });
    step("reopen", () => {
      db = loaded.open(databaseFile);
    });
    step("persisted_data", () => {
      assert.equal(
        db.prepare("SELECT note FROM probe_parent WHERE id = 1").get().note,
        "synthetic-persisted-row",
      );
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM probe_parent").get().count,
        3,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM probe_child").get().count,
        1,
      );
    });
    return result;
  } finally {
    if (contender) {
      try {
        contender.close();
      } catch {}
    }
    if (db) {
      try {
        db.close();
      } catch {}
    }
    process.dlopen = originalDlopen;
  }
}

function restartProbe(candidate, stateRoot, mode) {
  const marker = "apv-disposable-vsix-restart-marker-v1";
  const file = path.join(
    stateRoot,
    candidate.replaceAll(":", "-"),
    "restart.sqlite",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (mode === "read")
    assert.ok(
      fs.existsSync(file),
      "No prior write database; cannot claim restart persistence",
    );
  const loaded = loadCandidate(candidate);
  const db = loaded.open(file);
  try {
    if (mode === "write") {
      db.exec(
        "CREATE TABLE IF NOT EXISTS spike_restart_marker(id INTEGER PRIMARY KEY, marker TEXT NOT NULL, writer_pid INTEGER NOT NULL)",
      );
      db.prepare(
        "INSERT OR REPLACE INTO spike_restart_marker VALUES(?, ?, ?)",
      ).run(1, marker, process.pid);
    } else assert.equal(mode, "read");
    const persisted = db
      .prepare(
        "SELECT marker, writer_pid FROM spike_restart_marker WHERE id = 1",
      )
      .get();
    assert.equal(persisted.marker, marker);
    if (mode === "read")
      assert.notEqual(
        persisted.writer_pid,
        process.pid,
        "Read must occur in a different host process",
      );
    return {
      status: "PASS",
      mode,
      marker,
      writerPid: persisted.writer_pid,
      pid: process.pid,
    };
  } finally {
    db.close();
  }
}

module.exports = { environment, errorData, probeCandidate, restartProbe };
