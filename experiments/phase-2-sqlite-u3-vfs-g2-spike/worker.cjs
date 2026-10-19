"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const {
  preflight,
  physical,
  identity,
  inside,
  hash,
  write,
  uuid,
} = require("./checks.cjs");
const { names, makeCuts } = require("./fixture.cjs");
let spec,
  fd,
  seq = 0;
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
const error = (e) => ({
  code: e.code || null,
  message: e.message,
  stack: e.stack,
});
function toArmEpoch(value) {
  // This disposable fixture and the unchanged Native guard admit epoch 1 only.
  // Keep JSON/business identities as Number; convert only the SQL argument.
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new RangeError("EPOCH_UNSAFE_NUMBER");
    value = BigInt(value);
  }
  if (typeof value !== "bigint") throw new TypeError("EPOCH_TYPE_REJECTED");
  if (value !== 1n) throw new RangeError("EPOCH_OUT_OF_FIXTURE_RANGE");
  return value;
}
function settleArmFailure(
  original,
  { db, monitor, info, status, extract, receipt },
) {
  const receiptErrors = [];
  const record = (type, data) => {
    try {
      receipt(type, data);
    } catch (e) {
      receiptErrors.push({ type, error: error(e) });
    }
  };
  const probe = (type, operation) => {
    try {
      const value = operation();
      record(type + "-return", { value });
      return value;
    } catch (e) {
      record(type + "-error", { error: error(e), observation: "unavailable" });
      return undefined;
    }
  };
  const transaction = () => {
    const open = db.open;
    const active = open === false ? null : db.inTransaction;
    return {
      open,
      transactionActive: active,
      autocommit: typeof active === "boolean" ? Number(!active) : null,
      autocommitSource: "better-sqlite3.inTransaction accessor",
      // inTransaction does not distinguish NONE/READ/WRITE. The Native status
      // below is separate and can be unconfigured when ARM was rejected.
      sqliteTxnState: null,
      sqliteTxnStateStatus: "unavailable from Driver accessor",
    };
  };
  // Preserve the original Driver error before any diagnostic SQL or cleanup.
  record("arm-error-before-cleanup", { error: error(original) });
  const before = probe("arm-transaction-state-after-error", transaction);
  probe("arm-native-state-after-error", status);
  probe("arm-target-info-after-error", () => info(db));
  probe("arm-native-trace-before-cleanup", () =>
    extract("native-arm-failure-before-cleanup.json", status()),
  );
  let rolledBack;
  if (!before || (before.open !== false && before.transactionActive !== false))
    rolledBack = probe("arm-rollback", () => {
      db.exec("ROLLBACK");
      return transaction();
    });
  else
    record("arm-rollback-skipped", {
      reason: before.open === false ? "already closed" : "transaction inactive",
    });
  probe("arm-state-after-rollback", transaction);
  const closed = probe("arm-close", () => {
    if (db.open !== false) db.close();
    return { open: db.open };
  });
  probe("arm-native-trace-after-cleanup", () =>
    extract("native-arm-failure-after-cleanup.json", status()),
  );
  probe("arm-monitor-close", () => {
    if (monitor.open !== false) monitor.close();
    return { open: monitor.open };
  });
  record("arm-failure-unavailable", {
    outcome: "unavailable",
    rollbackObserved: rolledBack?.transactionActive === false,
    connectionClosed: closed?.open === false,
    // Even successful rollback/close observations do not constitute a durable
    // seven-table reconciliation. The throwing Worker blocks Runner's Reader.
    persistence: "unavailable",
    publish: false,
    ack: false,
    replay: false,
    receiptErrors,
  });
}
function armCandidate(db, parameters, cleanup) {
  try {
    const bound = [...parameters];
    bound[7] = toArmEpoch(bound[7]);
    const result = db
      .prepare("SELECT apv_g2_arm(?,?,?,?,?,?,?,?,?,?) AS x")
      .get(...bound).x;
    assert.equal(result, 1);
    return result;
  } catch (original) {
    try {
      settleArmFailure(original, { ...cleanup, db });
    } catch {
      /* Never replace the original ARM error with a cleanup error. */
    }
    throw original;
  }
}
function main(args) {
  assert.equal(args.length, 4);
  assert.equal(args[0], "--g2-worker");
  assert.equal(args[1], "--execute");
  spec = JSON.parse(fs.readFileSync(args[2], "utf8"));
  uuid(spec.runId);
  uuid(spec.nonce);
  uuid(spec.fixture.operationNonce);
  uuid(spec.fixture.baselineNonce);
  assert.equal(spec.fixture.runId, spec.runId);
  assert.equal(spec.fixture.project, "PA");
  assert.equal(spec.fixture.generation, "GEN-1");
  assert.equal(spec.fixture.epoch, 1);
  assert(["writer", "reader"].includes(spec.role));
  assert(["G2-W", "G2-S"].includes(spec.case));
  assert.equal(spec.nonce, args[3]);
  assert.equal(spec.parentPid, process.ppid);
  const admitted = preflight(spec.buildId),
    root = path.join(admitted.temp, "apv-u3-vfs-g2", spec.runId);
  assert.deepEqual(spec.executionPackage, admitted.executionPackage);
  assert.equal(spec.root, root);
  physical(root);
  assert.deepEqual(identity(root), spec.rootIdentity);
  assert.equal(spec.dll, path.join(root, "apv_g2_vfs.dll"));
  physical(spec.dll);
  assert.equal(identity(spec.dll).nlink, "1");
  assert.equal(hash(spec.dll), admitted.metadata.binarySha256);
  assert.equal(
    hash(path.join(root, "execution-package.json")),
    admitted.executionPackage.manifestSha256,
  );
  const target = path.join(root, "target.sqlite");
  inside(root, args[2]);
  inside(root, target);
  fd = fs.openSync(path.join(root, spec.role + ".receipts.jsonl"), "wx");
  receipt("worker-start", {
    node: process.version,
    arch: process.arch,
    rootIdentity: identity(root),
    executionPackage: admitted.executionPackage,
  });
  const Database = require(admitted.driver.base),
    options = { nativeBinding: admitted.driver.native, timeout: 250 };
  if (spec.role === "reader") {
    assert(spec.writerSettlement.observedExit);
    assert.equal(spec.writerSettlement.nonce, spec.writerNonce);
    physical(target);
    const before = identity(target);
    assert.equal(before.nlink, "1");
    let db;
    try {
      db = new Database(target, {
        ...options,
        readonly: true,
        fileMustExist: true,
      });
      assert.equal(
        db.prepare("SELECT sqlite_version() AS v").get().v,
        "3.53.4",
      );
      db.exec("BEGIN");
      const cut = {
        integrity: db.pragma("integrity_check").map((r) => Object.values(r)[0]),
        foreignKeys: db.pragma("foreign_key_check"),
        tables: {},
      };
      for (const n of names)
        cut.tables[n] = db
          .prepare(`SELECT id,value FROM ${n} ORDER BY id`)
          .all();
      db.exec("COMMIT");
      db.close();
      assert.equal(db.open, false);
      assert.deepEqual(identity(target), before);
      write(path.join(root, "reader.cut.json"), cut);
      receipt("independent-reader-cut", {
        databaseIdentity: before,
        extensionLoaded: false,
      });
    } catch (e) {
      receipt("reader-unavailable", { error: error(e) });
      if (db && db.open) {
        try {
          db.close();
        } catch (closeError) {
          receipt("reader-close-error", { error: error(closeError) });
        }
      }
    }
  } else {
    assert(!fs.existsSync(target), "fresh disposable target required");
    const anchor = new Database(":memory:", options);
    anchor.loadExtension(spec.dll, "sqlite3_apvvfs_init");
    const info = (db) =>
      JSON.parse(db.prepare("SELECT apv_vfs_info() AS x").get().x);
    const bootstrapInfo = info(anchor);
    receipt("extension-loaded", { info: bootstrapInfo });
    const db = new Database(target, options),
      selected = info(db);
    receipt("target-vfs-selected", { databaseFile: target, info: selected });
    assert.equal(selected.actualVfsName, "apv_g2_fault_v1");
    assert.equal(selected.vfsQueryStatus, "ok");
    assert.equal(selected.fileControlRc, 0);
    assert.equal(selected.databaseFile, target);
    assert.equal(selected.pid, process.pid);
    assert.equal(selected.api, bootstrapInfo.api);
    anchor.close();
    receipt("bootstrap-closed-after-target-open");
    const monitor = new Database(":memory:", options);
    const monitorInfo = info(monitor);
    assert.equal(monitorInfo.api, selected.api);
    receipt("diagnostic-monitor-selected", { info: monitorInfo });
    const status = () =>
      JSON.parse(monitor.prepare("SELECT apv_g2_status() AS x").get().x);
    function extract(name, state) {
      assert.equal(state.overflow, 0);
      const q = monitor.prepare("SELECT apv_vfs_event(?) AS x");
      const events = Array.from({ length: state.traceCount }, (_, i) =>
        JSON.parse(q.get(i).x),
      );
      write(path.join(root, name), { ...state, events });
      return events.length;
    }
    assert.equal(db.pragma("journal_mode=WAL", { simple: true }), "wal");
    db.pragma("synchronous=FULL");
    db.pragma("wal_autocheckpoint=0");
    db.pragma("foreign_keys=ON");
    const config = {
      journalMode: db.pragma("journal_mode", { simple: true }),
      synchronous: db.pragma("synchronous", { simple: true }),
      walAutoCheckpoint: db.pragma("wal_autocheckpoint", { simple: true }),
    };
    assert.deepEqual(config, {
      journalMode: "wal",
      synchronous: 2,
      walAutoCheckpoint: 0,
    });
    receipt("effective-config", config);
    for (const n of names)
      db.exec(
        `CREATE TABLE ${n}(id INTEGER PRIMARY KEY ${["assertions", "history", "snapshots", "receipts"].includes(n) ? "REFERENCES event_ledger(id)" : ""},value TEXT NOT NULL)`,
      );
    const { before, after, candidate } = makeCuts(spec.fixture);
    db.exec("BEGIN IMMEDIATE");
    for (const n of names)
      for (const row of before.tables[n])
        db.prepare(`INSERT INTO ${n}(id,value) VALUES (?,?)`).run(
          row.id,
          row.value,
        );
    db.exec("COMMIT");
    receipt("baseline-commit-return", { transactionActive: db.inTransaction });
    db.exec("BEGIN IMMEDIATE");
    for (const n of names)
      for (const row of after.tables[n]) {
        const old = before.tables[n].find((r) => r.id === row.id);
        if (!old)
          db.prepare(`INSERT INTO ${n}(id,value) VALUES (?,?)`).run(
            row.id,
            row.value,
          );
        else if (old.value !== row.value)
          db.prepare(`UPDATE ${n} SET value=? WHERE id=?`).run(
            row.value,
            row.id,
          );
      }
    receipt("pre-injection-transaction", {
      transactionActive: db.inTransaction,
      candidate,
    });
    assert.equal(db.inTransaction, true);
    armCandidate(
      db,
      [
        spec.case,
        spec.runId,
        spec.nonce,
        candidate.nonce,
        target,
        candidate.project,
        candidate.generation,
        candidate.epoch,
        candidate.operationId,
        candidate.intentDigest,
      ],
      { monitor, info, status, extract, receipt },
    );
    receipt("native-armed", { state: status() });
    receipt("commit-call-enter", { transactionActive: db.inTransaction });
    let outcome;
    try {
      db.exec("COMMIT");
      outcome = { returned: "success", transactionActive: db.inTransaction };
    } catch (e) {
      outcome = {
        returned: "error",
        error: error(e),
        transactionActive: db.inTransaction,
      };
    }
    // No new target SQL is prepared before preserving the original error.
    receipt("commit-outcome-before-cleanup", outcome);
    const errorState = status();
    receipt("native-target-state-before-cleanup", { state: errorState });
    extract("native-before-cleanup.json", errorState);
    if (db.inTransaction) {
      receipt("rollback-enter", { transactionActive: db.inTransaction });
      try {
        db.exec("ROLLBACK");
        receipt("rollback-return", { transactionActive: db.inTransaction });
      } catch (e) {
        receipt("rollback-error", {
          error: error(e),
          transactionActive: db.inTransaction,
        });
      }
    }
    receipt("state-after-rollback-or-auto-settlement", {
      transactionActive: db.inTransaction,
      state: status(),
    });
    try {
      db.close();
      receipt("close-return", { open: db.open });
    } catch (e) {
      receipt("close-error-quarantined", { error: error(e), open: db.open });
    }
    const finalState = status();
    // Use the live error-time connection binding, with final full trace. Final
    // status separately records CLOSE; it never dereferences a cleared pointer.
    const traceCount = finalState.traceCount;
    const q = monitor.prepare("SELECT apv_vfs_event(?) AS x");
    assert.equal(finalState.overflow, 0);
    const events = Array.from({ length: traceCount }, (_, i) =>
      JSON.parse(q.get(i).x),
    );
    write(path.join(root, "native-events.json"), {
      ...errorState,
      traceCount,
      overflow: finalState.overflow,
      events,
      finalState,
    });
    monitor.close();
    receipt("database-identity", { identity: identity(target) });
    receipt("process-exit-required-for-settlement", {
      noFurtherWrites: true,
      publish: false,
      ack: false,
      replay: false,
    });
  }
  receipt("worker-complete");
  fs.closeSync(fd);
  fd = undefined;
}
if (require.main === module)
  try {
    main(process.argv.slice(2));
  } catch (e) {
    if (fd !== undefined) {
      try {
        receipt("worker-error", { error: error(e) });
        fs.closeSync(fd);
      } catch {}
    }
    console.error(e.stack);
    process.exitCode = 1;
  }
module.exports = { main, toArmEpoch, armCandidate };
