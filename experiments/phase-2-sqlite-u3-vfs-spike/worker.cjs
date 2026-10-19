"use strict";
/* This file is not a static check. It only executes behind the internal G1 gate. */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const {
  uuid,
  inside,
  physical,
  identity,
  write,
  hash,
  preflight,
} = require("./checks.cjs");
let fd,
  seq = 0,
  spec;
/* Pure construction keeps unavailable/wrong native fields intact for evidence. */
function targetVfsReceipt(info, databaseFile, connectionRole) {
  return { connectionRole, databaseFile, info };
}
function requireTargetVfs(info, databaseFile, pid) {
  assert(info && typeof info === "object");
  assert.equal(info.vfsQueryStatus, "ok");
  assert.equal(info.fileControlRc, 0);
  assert.equal(typeof info.actualVfsName, "string");
  assert.equal(info.actualVfsName, "apv_g1_nofault_v1");
  assert.equal(info.selectedShim, 1);
  assert.equal(info.pid, pid);
  assert.equal(typeof info.databaseFile, "string");
  assert(path.win32.isAbsolute(info.databaseFile));
  assert.equal(
    path.win32.normalize(info.databaseFile),
    path.win32.normalize(databaseFile),
  );
  return true;
}
function receipt(type, data = {}) {
  fs.writeSync(
    fd,
    JSON.stringify({
      seq: ++seq,
      runId: spec.runId,
      role: spec.role,
      nonce: spec.nonce,
      pid: process.pid,
      ppid: process.ppid,
      type,
      ...data,
    }) + "\n",
  );
}
function main(args) {
  if (args.length !== 4 || args[0] !== "--g1-worker" || args[1] !== "--execute")
    throw new Error("G1_WORKER_DISABLED");
  spec = JSON.parse(fs.readFileSync(args[2], "utf8"));
  uuid(spec.runId);
  uuid(spec.nonce);
  assert.equal(spec.nonce, args[3]);
  assert.equal(spec.parentPid, process.ppid);
  assert(
    ["standard", "wrapped", "reader-standard", "reader-wrapped"].includes(
      spec.role,
    ),
  );
  const admitted = preflight(spec.buildId),
    expected = path.join(admitted.temp, "apv-u3-vfs-g1", spec.runId);
  assert.equal(spec.root, expected);
  physical(spec.root);
  assert.deepEqual(identity(spec.root), spec.rootIdentity);
  assert.equal(spec.dll, path.join(spec.root, "apv_vfs.dll"));
  physical(spec.dll);
  assert.equal(identity(spec.dll).nlink, "1");
  assert.equal(hash(spec.dll), admitted.metadata.binarySha256);
  inside(spec.root, args[2]);
  const dbFile = path.join(
    spec.root,
    spec.role.endsWith("standard") ? "standard.sqlite" : "wrapped.sqlite",
  );
  inside(spec.root, dbFile);
  fd = fs.openSync(path.join(spec.root, spec.role + ".receipts.jsonl"), "wx");
  receipt("worker-start", {
    node: process.version,
    arch: process.arch,
    rootIdentity: identity(spec.root),
  });
  /* Pin the exact inspected native binary; do not resolve a different addon. */
  const Database = require(admitted.driver.base);
  const options = { nativeBinding: admitted.driver.native, timeout: 250 };
  let db;
  if (spec.role.startsWith("reader-")) {
    physical(dbFile);
    assert.equal(identity(dbFile).nlink, "1");
    const before = identity(dbFile);
    db = new Database(dbFile, {
      ...options,
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(db.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
    const { readCut } = require("./oracle.cjs");
    const cut = readCut(db);
    write(path.join(spec.root, spec.role + ".cut.json"), cut);
    db.close();
    assert.equal(db.open, false);
    assert.deepEqual(identity(dbFile), before);
    receipt("independent-reader-cut", {
      databaseIdentity: before,
      extensionLoaded: false,
    });
  } else {
    assert(!fs.existsSync(dbFile), "Fresh target required");
    let anchor, instance;
    const wrapped = spec.role === "wrapped";
    function info(connection) {
      return JSON.parse(
        connection.prepare("SELECT apv_vfs_info() AS x").get().x,
      );
    }
    function mark(id, label, connection = db) {
      receipt("call-boundary", {
        phase: id,
        label,
        transactionActive: connection.inTransaction,
      });
      if (wrapped) connection.prepare("SELECT apv_vfs_phase(?)").get(id);
    }
    if (wrapped) {
      anchor = new Database(":memory:", options);
      anchor.loadExtension(spec.dll, "sqlite3_apvvfs_init");
      instance = info(anchor);
      assert.equal(instance.defaultShim, 1);
      assert.equal(instance.sqlite, "3.53.4");
      receipt("extension-loaded", { info: instance });
    }
    db = new Database(dbFile, options);
    assert.equal(db.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
    if (wrapped) {
      const selected = info(db);
      receipt(
        "target-vfs-selected",
        targetVfsReceipt(selected, dbFile, "target"),
      );
      requireTargetVfs(selected, dbFile, process.pid);
      assert.equal(selected.api, instance.api);
      anchor.close();
      assert.equal(anchor.open, false);
      receipt("bootstrap-closed-before-target-io");
    }
    mark(1, "configure/schema");
    assert.equal(db.pragma("journal_mode = WAL", { simple: true }), "wal");
    db.pragma("synchronous = FULL");
    db.pragma("wal_autocheckpoint = 0");
    db.pragma("foreign_keys = ON");
    assert.equal(db.pragma("synchronous", { simple: true }), 2);
    assert.equal(db.pragma("wal_autocheckpoint", { simple: true }), 0);
    receipt("effective-config", {
      journalMode: "wal",
      synchronous: 2,
      walAutoCheckpoint: 0,
    });
    const tables = [
      "event_ledger",
      "assertions",
      "history",
      "snapshots",
      "cursors",
      "receipts",
    ];
    for (const table of tables)
      db.exec(
        `CREATE TABLE ${table}(id INTEGER PRIMARY KEY CHECK(id IN (1,2)) ${table === "event_ledger" ? "" : "REFERENCES event_ledger(id)"},value TEXT NOT NULL)`,
      );
    function bundle(id) {
      mark(id === 1 ? 2 : 8, "BEGIN IMMEDIATE");
      db.exec("BEGIN IMMEDIATE");
      mark(id === 1 ? 3 : 9, "fixture DML");
      const values = {
        event_ledger: `event-${id}`,
        assertions: `assertion-${id}`,
        history: `history-${id}`,
        snapshots: JSON.stringify({ head: id }),
        cursors: `unit-${id}`,
        receipts: `operation-${id}`,
      };
      for (const table of tables)
        db.prepare(`INSERT INTO ${table}(id,value) VALUES (?,?)`).run(
          id,
          values[table],
        );
      mark(id === 1 ? 4 : 11, "COMMIT call enters");
      try {
        db.exec("COMMIT");
        receipt("commit-return", {
          phase: id === 1 ? 4 : 11,
          transactionActive: db.inTransaction,
        });
      } catch (e) {
        receipt("commit-error-before-cleanup", {
          code: e.code,
          message: e.message,
          stack: e.stack,
          transactionActive: db.inTransaction,
        });
        throw e;
      }
      mark(0, "COMMIT returned");
      assert.equal(db.inTransaction, false);
    }
    bundle(1);
    mark(5, "explicit checkpoint");
    receipt("checkpoint-return", {
      result: db.pragma("wal_checkpoint(TRUNCATE)"),
    });
    mark(6, "first close");
    db.close();
    assert.equal(db.open, false);
    receipt("first-target-closed");
    if (wrapped) {
      const monitor = new Database(":memory:", options);
      mark(7, "reopen", monitor);
      monitor.close();
    }
    const databaseIdentity = identity(dbFile);
    physical(dbFile);
    assert.equal(databaseIdentity.nlink, "1");
    db = new Database(dbFile, { ...options, fileMustExist: true });
    if (wrapped) {
      const reopened = info(db);
      receipt(
        "reopened-vfs-selected",
        targetVfsReceipt(reopened, dbFile, "reopened-target"),
      );
      requireTargetVfs(reopened, dbFile, process.pid);
      assert.equal(reopened.api, instance.api);
    }
    assert.equal(
      db.prepare("SELECT value FROM event_ledger WHERE id=1").get().value,
      "event-1",
    );
    db.pragma("synchronous = FULL");
    db.pragma("wal_autocheckpoint = 0");
    db.pragma("foreign_keys = ON");
    bundle(2);
    mark(12, "final close");
    db.close();
    assert.equal(db.open, false);
    receipt("final-target-closed");
    assert.deepEqual(identity(dbFile), databaseIdentity);
    if (wrapped) {
      const monitor = new Database(":memory:", options),
        state = info(monitor);
      assert.equal(state.overflow, 0);
      const eventQuery = monitor.prepare("SELECT apv_vfs_event(?) AS x"),
        events = [];
      for (let i = 0; i < state.traceCount; i++)
        events.push(JSON.parse(eventQuery.get(i).x));
      write(path.join(spec.root, "native-events.json"), { state, events });
      monitor.close();
      receipt("native-events-extracted", {
        count: events.length,
        overflow: state.overflow,
        api: state.api,
      });
    }
    receipt("database-identity", { identity: identity(dbFile) });
  }
  receipt("worker-complete");
  fs.closeSync(fd);
  fd = undefined;
}
if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    if (fd !== undefined) {
      try {
        receipt("worker-error", {
          code: e.code,
          message: e.message,
          stack: e.stack,
        });
        fs.closeSync(fd);
      } catch {}
    }
    console.error(e.stack);
    process.exitCode = 1;
  }
}
module.exports = { targetVfsReceipt, requireTargetVfs };
