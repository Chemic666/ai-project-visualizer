// Existing O01-h/S01/S05/P02 behavior, scoped to the admitted UUID root.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url"),
  { fork } = require("node:child_process");
if (require.main === module) {
  (async () => {
    const cfg = JSON.parse(process.env.APV_LOCAL_SHM_SPEC);
    const api = await import(
      pathToFileURL(
        path.join(cfg.resources.base, "storage/src/local-storage-root.mjs"),
      ).href
    );
    assert.equal(
      api.inspectLocalValidationRoot(cfg.root.root, cfg.spec.runId).ok,
      true,
    );
    assert.equal(
      cfg.databaseFile,
      path.join(
        cfg.root.privateDirectory,
        "projects",
        cfg.spec.storeKey,
        "G1",
        "project.sqlite",
      ),
    );
    const Database = require(cfg.resources.driverRoot),
      db = new Database(cfg.databaseFile, {
        readonly: true,
        fileMustExist: true,
      });
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    db.exec("BEGIN");
    const snapshot = () => ({
      pid: process.pid,
      head: db.prepare("SELECT head FROM store_meta").get().head,
      events: db.prepare("SELECT count(*) AS n FROM normalized_events").get().n,
      inTransaction: db.inTransaction,
    });
    process.send({ id: 0, ...snapshot() });
    process.on("message", (message) => {
      try {
        if (message.action === "close") {
          if (db.inTransaction) db.exec("ROLLBACK");
          db.close();
          process.send({ id: message.id, pid: process.pid, closed: true }, () =>
            process.disconnect(),
          );
        } else {
          if (message.action === "refresh") db.exec("COMMIT");
          else assert.equal(message.action, "held");
          process.send({ id: message.id, ...snapshot() });
        }
      } catch (error) {
        process.send({ id: message.id, error: "unavailable" });
        if (db.open) db.close();
        process.exitCode = 1;
        process.disconnect();
      }
    });
    process.on("disconnect", () => {
      if (db.open) {
        if (db.inTransaction) db.exec("ROLLBACK");
        db.close();
      }
    });
  })().catch(() => {
    if (process.connected)
      process.send({ id: 0, error: "unavailable" }, () => process.disconnect());
    process.exitCode = 1;
  });
} else
  exports.start = async function (config) {
    const {
      resources,
      root,
      spec,
      ready,
      save,
      launchSyntheticHost,
      cap,
      options,
    } = config;
    const Database = require(resources.driverRoot);
    const observer = new Database(ready.paths.project, { fileMustExist: true });
    observer.pragma("busy_timeout=0");
    observer.exec("BEGIN");
    assert.equal(observer.prepare("SELECT head FROM store_meta").get().head, 1);
    const transcript = [],
      waiters = new Map();
    let seq = 0,
      closed = false,
      stderr = "";
    const child = fork(__filename, [], {
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        APV_LOCAL_SHM_SPEC: JSON.stringify({
          resources,
          root,
          spec: { runId: spec.runId, storeKey: spec.storeKey },
          databaseFile: ready.paths.project,
        }),
      },
    });
    child.stderr.on("data", (s) => {
      stderr += s;
    });
    const exit = new Promise((resolve) =>
      child.on("close", (code, signal) => {
        closed = true;
        for (const w of waiters.values()) w.reject(Error("participant_exited"));
        waiters.clear();
        resolve({ pid: child.pid, code, signal });
      }),
    );
    const expect = (id) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(id);
          reject(Error("participant_timeout"));
        }, 20000);
        waiters.set(id, {
          resolve: (x) => {
            clearTimeout(timer);
            resolve(x);
          },
          reject: (x) => {
            clearTimeout(timer);
            reject(x);
          },
        });
      });
    const startup = expect(0);
    child.on("message", (message) => {
      transcript.push(message);
      const w = waiters.get(message.id);
      if (w) {
        waiters.delete(message.id);
        message.error
          ? w.reject(Error("participant_unavailable"))
          : w.resolve(message);
      }
    });
    child.on("error", () => {
      for (const w of waiters.values())
        w.reject(Error("participant_spawn_failed"));
    });
    const request = (action) => {
      const id = ++seq,
        promise = expect(id);
      child.send({ id, action });
      return promise;
    };
    let closePromise;
    const close = () =>
      (closePromise ??= (async () => {
        if (observer.open) {
          if (observer.inTransaction) observer.exec("ROLLBACK");
          observer.close();
        }
        if (!closed && child.connected) {
          await request("close");
        }
        const ended = await exit;
        save("local-shm-lifecycle.json", {
          transcript,
          stderr,
          exit: ended,
          actualInternalShmHandle: "unverified",
        });
        assert.equal(ended.code, 0);
        assert.equal(ended.signal, null);
        assert.equal(stderr, "");
      })());
    try {
      const initial = await startup;
      assert.notEqual(initial.pid, process.pid);
      assert.notEqual(initial.pid, ready.pid);
      assert.equal(initial.head, 1);
      assert.equal(initial.inTransaction, true);
    } catch (error) {
      await close().catch(() => {});
      throw error;
    }
    let finalized = false;
    return {
      afterCommit: async (result) => {
        assert.equal(result.status, "committed");
        assert.equal(result.head, 2);
        assert.equal(
          observer.prepare("SELECT head FROM store_meta").get().head,
          1,
        );
        const held = await request("held");
        assert.equal(held.head, 1);
        assert.equal(held.events, 0);
        observer.exec("COMMIT");
        assert.equal(
          observer.prepare("SELECT head FROM store_meta").get().head,
          2,
        );
        const fresh = await request("refresh");
        assert.equal(fresh.head, 2);
        assert.equal(fresh.events, 1);
        const contender = new Database(ready.paths.project, {
          fileMustExist: true,
        });
        contender.pragma("busy_timeout=0");
        let busy;
        try {
          observer.exec("BEGIN IMMEDIATE");
          assert.throws(
            () => contender.exec("BEGIN IMMEDIATE"),
            (error) => {
              busy = error.code;
              return busy === "SQLITE_BUSY";
            },
          );
        } finally {
          if (observer.inTransaction) observer.exec("ROLLBACK");
          if (contender.inTransaction) contender.exec("ROLLBACK");
          contender.close();
        }
        const rival = launchSyntheticHost(cap, options);
        await assert.rejects(rival.ready, { code: "ownership_busy" });
        const settlement = await rival.closed;
        assert.equal(settlement.processExited, true);
        save("local-shm-behavior.json", {
          initialHead: 1,
          held,
          refreshed: fresh,
          busy,
          ownerContender: { settlement, evidence: rival.evidence() },
          walPresent: fs.existsSync(ready.paths.project + "-wal"),
          shmPresent: fs.existsSync(ready.paths.project + "-shm"),
          actualInternalShmHandle: "unverified",
        });
        await close();
        finalized = true;
      },
      close: async () => {
        if (!finalized) {
          await close();
          finalized = true;
        }
      },
    };
  };
