import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fork, spawnSync } from "node:child_process";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { launchSyntheticHost } from "../src/host-development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const core = await import(pathToFileURL(spec.corePath).href);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const options = {
  driverRoot: spec.driverRoot,
  driverBinarySha256: spec.driverBinarySha256,
  corePath: spec.corePath,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  bootstrap: seed(),
  nativePackage: spec.nativePackage,
};
let roots = 0;
const hosts = [];
const save = (name, value) =>
  fs.writeFileSync(
    path.join(spec.evidence, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    { flag: "wx" },
  );
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  save(`synthetic-root-${++roots}.json`, { root, runId: spec.runId });
  return { root, cap: admitSyntheticRoot({ enabled: true, root }) };
}
function start(cap) {
  const host = launchSyntheticHost(cap, options);
  hosts.push(host);
  return host;
}
function reader(databaseFile) {
  const transcript = [],
    waiters = new Map();
  let sequence = 0,
    stdout = "",
    stderr = "",
    exit;
  const child = fork(
    fileURLToPath(new URL("./shm-reader-worker.mjs", import.meta.url)),
    [],
    {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      execArgv: [],
      windowsHide: true,
      env: { ...process.env, APV_STORAGE_SHM_DATABASE: databaseFile },
    },
  );
  const closed = new Promise((resolve) => {
    child.on("close", (code, signal) => {
      exit = { pid: child.pid, code, signal };
      for (const w of waiters.values())
        w.reject(new Error("shm_reader_exited_before_response"));
      waiters.clear();
      resolve(exit);
    });
  });
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  function expect(id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error("shm_reader_response_timeout"));
      }, 15000);
      waiters.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }
  const ready = expect(0);
  child.on("message", (message) => {
    transcript.push(message);
    const pending = waiters.get(message.id);
    if (!pending) return;
    waiters.delete(message.id);
    if (message.error)
      pending.reject(
        Object.assign(new Error(message.error.message), message.error),
      );
    else pending.resolve(message);
  });
  child.on("error", (error) => {
    for (const w of waiters.values()) w.reject(error);
    waiters.clear();
  });
  return {
    pid: child.pid,
    ready,
    request: (action) => {
      const id = ++sequence,
        result = expect(id);
      child.send({ id, action });
      return result;
    },
    close: async () => {
      if (!exit && child.connected)
        child.send({ id: ++sequence, action: "close" });
      return closed;
    },
    evidence: () => ({ transcript, stdout, stderr, exit }),
  };
}
test.after(async () => {
  for (const host of hosts) await host.close();
  save(
    "shm-host-lifecycles.json",
    hosts.map((host) => ({ status: host.status(), evidence: host.evidence() })),
  );
});

// Catches losing an active WAL snapshot, broken interprocess visibility,
// allowing a competing Owner, or refusing normal SHM recreation after last close.
test("O01-h/S01/S05/P02: same database WAL snapshot coordinates connections and process, busy lock and normal reopen", async (t) => {
  const { cap } = fresh(),
    writer = start(cap),
    first = await writer.ready;
  const observer = new Database(first.paths.project, { fileMustExist: true });
  observer.pragma("busy_timeout=0");
  const worker = reader(first.paths.project);
  t.after(async () => {
    if (observer.open) {
      if (observer.inTransaction) observer.exec("ROLLBACK");
      observer.close();
    }
    await worker.close();
    save("shm-reader-process.json", worker.evidence());
  });
  assert.equal(observer.pragma("journal_mode", { simple: true }), "wal");
  observer.exec("BEGIN");
  assert.equal(observer.prepare("SELECT head FROM store_meta").get().head, 1);
  const held = await worker.ready;
  assert.notEqual(held.pid, process.pid);
  assert.notEqual(held.pid, first.pid);
  assert.equal(
    held.head,
    1,
    "independent process must establish the pre-commit SQL read snapshot",
  );
  assert.equal(held.inTransaction, true);
  const commit = await writer.commit({
    operationId: "op:E1",
    operationNonce: "nonce:E1",
    expectedHead: 1,
    writer: first.writer,
    events: [input()],
    cursor: cursor(["E1"]),
  });
  assert.equal(commit.status, "committed");
  assert.equal(commit.head, 2);
  assert.equal(observer.prepare("SELECT head FROM store_meta").get().head, 1);
  const stillHeld = await worker.request("read-held");
  assert.equal(stillHeld.head, 1);
  assert.equal(stillHeld.normalizedEvents, 0);
  observer.exec("COMMIT");
  assert.equal(observer.prepare("SELECT head FROM store_meta").get().head, 2);
  const refreshed = await worker.request("refresh");
  assert.equal(refreshed.head, 2);
  assert.equal(refreshed.normalizedEvents, 1);
  assert.equal(refreshed.inTransaction, false);

  // No row is changed: a real reserved write lock must reject a second writer.
  const contender = new Database(first.paths.project, { fileMustExist: true });
  contender.pragma("busy_timeout=0");
  let lockError;
  try {
    observer.exec("BEGIN IMMEDIATE");
    assert.throws(
      () => contender.exec("BEGIN IMMEDIATE"),
      (error) => {
        lockError = { code: error.code, message: error.message };
        return error.code === "SQLITE_BUSY";
      },
    );
    assert.equal(contender.inTransaction, false);
  } finally {
    if (observer.inTransaction) observer.exec("ROLLBACK");
    if (contender.inTransaction) contender.exec("ROLLBACK");
    contender.close();
  }
  const rival = start(cap);
  await assert.rejects(rival.ready, { code: "ownership_busy" });
  assert.equal((await rival.closed).processExited, true);
  assert.equal(
    rival.evidence().some((event) => event.kind === "ready"),
    false,
  );
  const catalog = new Database(first.paths.catalog, {
    readonly: true,
    fileMustExist: true,
  });
  const authorities = {
    bindings: catalog.prepare("SELECT count(*) AS n FROM bindings").get().n,
    nativeBindings: catalog
      .prepare("SELECT count(*) AS n FROM native_bindings")
      .get().n,
  };
  catalog.close();
  assert.deepEqual(authorities, { bindings: 1, nativeBindings: 1 });
  assert.equal((await writer.read()).head, 2);
  observer.close();
  const readerEnd = await worker.close();
  assert.equal(readerEnd.code, 0);
  assert.equal(worker.evidence().stderr, "");
  const firstEnd = await writer.close();
  assert.equal(firstEnd.exitCode, 0);
  const sidecarsAfterLastClose = {
    walExists: fs.existsSync(first.paths.project + "-wal"),
    shmExists: fs.existsSync(first.paths.project + "-shm"),
  };
  // Deletion here is SQLite's normal lifecycle; no persistent SHM path identity is inferred.
  const reopened = start(cap),
    second = await reopened.ready;
  assert.equal(second.writer.epoch, 2);
  assert.equal((await reopened.read()).head, 2);
  assert.equal(
    second.resourceBinding.actualDriverHandleIdentity,
    "main-confirmed-only",
  );
  assert.equal(
    second.resourceBinding.nativeAttestation.reports.project.shm.status,
    "path_metadata_only",
  );
  const secondEnd = await reopened.close();
  assert.equal(secondEnd.exitCode, 0);
  save("reader.spec.json", {
    ...spec,
    databaseFile: first.paths.project,
    writerSettlement: {
      pid: first.pid,
      status: firstEnd.exitCode,
      closed: true,
    },
    recoverySettlement: {
      pid: second.pid,
      status: secondEnd.exitCode,
      closed: true,
    },
    expectedWriterEpoch: 2,
    expectedState: core.applyNormalizedEvent(seed(), input()).state,
  });
  const args = [
    fileURLToPath(new URL("./sql-reader.mjs", import.meta.url)),
    path.join(spec.evidence, "reader.spec.json"),
  ];
  const independent = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  save("shm-final-reader.command.json", {
    args,
    pid: independent.pid,
    afterBothWriterExits: true,
  });
  save("shm-final-reader.exit.json", {
    status: independent.status,
    signal: independent.signal,
    error: independent.error
      ? { code: independent.error.code, message: independent.error.message }
      : null,
  });
  save("shm-final-reader.stdout.txt", independent.stdout ?? "");
  save("shm-final-reader.stderr.txt", independent.stderr ?? "");
  assert.equal(independent.status, 0);
  assert.equal(independent.stderr, "");
  save("shm-coordination.json", {
    first,
    second,
    held,
    stillHeld,
    refreshed,
    lockError,
    authorities,
    sidecarsAfterLastClose,
    firstEnd,
    secondEnd,
    actualShmHandleIdentity: "unverified",
    scope:
      "normal synthetic SQLite WAL/SHM coordination; no fault, crash or power-loss acceptance",
  });
});

// Catches admitting a shared SHM alias as authority or allowing a second fallback store.
test("O01-f/P03/M01: active SHM hard-link alias fails closed without alternate authority", async () => {
  const { root, cap } = fresh(),
    writer = start(cap),
    ready = await writer.ready;
  const alias = path.join(root, "controlled-shm-alias");
  fs.linkSync(ready.paths.project + "-shm", alias);
  // Native expected-path regular() rejects nlink != 1 as unavailable.
  await assert.rejects(writer.read(), { code: "unavailable" });
  const rejected = await writer.closed;
  assert.equal(rejected.processExited, true);
  const catalog = new Database(ready.paths.catalog, {
    readonly: true,
    fileMustExist: true,
  });
  const authorities = {
    bindings: catalog.prepare("SELECT count(*) AS n FROM bindings").get().n,
    nativeBindings: catalog
      .prepare("SELECT count(*) AS n FROM native_bindings")
      .get().n,
  };
  catalog.close();
  assert.deepEqual(authorities, { bindings: 1, nativeBindings: 1 });
  save("shm-alias-refusal.json", {
    pid: ready.pid,
    rejected,
    authorities,
    aliasPreserved: fs.existsSync(alias),
    actualShmHandleIdentity: "unverified",
    evidenceKind: "controlled path alias refusal only",
  });
});
