import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { launchSyntheticHost } from "../src/host-development.mjs";
import { readNativePackage, stableIdentity } from "../src/native-attestor.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { openHost } from "../src/host.mjs";
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
const lives = [];
function save(name, value) {
  fs.writeFileSync(
    path.join(spec.evidence, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    { flag: "wx" },
  );
}
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  save(`synthetic-root-${++roots}.json`, { root, runId: spec.runId });
  return { root, cap: admitSyntheticRoot({ enabled: true, root }) };
}
function start(cap, extra = {}) {
  const h = launchSyntheticHost(cap, { ...options, ...extra });
  lives.push(h);
  return h;
}
function request(r) {
  return {
    operationId: "op:E1",
    operationNonce: "nonce:E1",
    expectedHead: 1,
    writer: r.writer,
    events: [input()],
    cursor: cursor(["E1"]),
  };
}
test.after(async () => {
  for (const h of lives) await h.close();
  save(
    "host-lifecycles.json",
    lives.map((h) => ({ status: h.status(), evidence: h.evidence() })),
  );
});

test("O01-a/b/h/S01/S05: actual Catalog/Owner/Project handles, live WAL, competing Owner and independent restored cut", async () => {
  const { cap } = fresh(),
    one = start(cap),
    r1 = await one.ready;
  assert.equal(
    r1.resourceBinding.actualDriverHandleIdentity,
    "main-confirmed-only",
  );
  const native = r1.resourceBinding.nativeAttestation;
  for (const kind of ["catalog", "owner", "project"]) {
    const r = native.reports[kind];
    assert.equal(r.main.origin, "sqlite-main-borrowed");
    assert.equal(r.main.pid, r1.pid);
    assert.equal(r.main.fcntlRc, 0);
    assert.equal(r.main.win32Error, 0);
    assert.deepEqual(stableIdentity(r.main), native.expected[kind]);
    assert.deepEqual(stableIdentity(r.main), stableIdentity(r.expectedPath));
  }
  assert.equal(native.reports.project.wal.origin, "sqlite-journal-borrowed");
  assert.equal(native.reports.project.wal.pid, r1.pid);
  assert.notEqual(
    native.reports.project.wal.fileId,
    native.reports.project.main.fileId,
  );
  assert.equal(native.reports.project.shm.status, "path_metadata_only");
  const rival = start(cap);
  await assert.rejects(rival.ready, { code: "ownership_busy" });
  assert.equal((await rival.closed).processExited, true);
  const result = await one.commit(request(r1));
  assert.equal(result.status, "committed");
  for (const k of ["ack", "publish", "replay"]) assert.equal(result[k], false);
  const end1 = await one.close();
  assert.equal(end1.exitCode, 0);
  const two = start(cap),
    r2 = await two.ready;
  assert.notEqual(r1.pid, r2.pid);
  assert.equal(r2.writer.epoch, 2);
  assert.deepEqual(
    r2.resourceBinding.nativeAttestation.expected,
    native.expected,
  );
  for (const kind of ["catalog", "owner", "project"])
    assert.deepEqual(
      stableIdentity(r2.resourceBinding.nativeAttestation.reports[kind].main),
      native.expected[kind],
    );
  assert.deepEqual(
    (await two.read()).state,
    core.applyNormalizedEvent(seed(), input()).state,
  );
  await assert.rejects(two.commit(request(r1)), { code: "stale_writer" });
  assert.equal((await two.commit(request(r2))).status, "already_committed");
  const end2 = await two.close();
  assert.equal(end2.exitCode, 0);
  const readerSpec = path.join(spec.evidence, "reader.spec.json");
  save("reader.spec.json", {
    ...spec,
    databaseFile: r1.paths.project,
    writerSettlement: { pid: r1.pid, status: 0, closed: true },
    recoverySettlement: { pid: r2.pid, status: 0, closed: true },
    expectedWriterEpoch: 2,
    expectedState: core.applyNormalizedEvent(seed(), input()).state,
  });
  const args = [
    fileURLToPath(new URL("./sql-reader.mjs", import.meta.url)),
    readerSpec,
  ];
  const reader = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  save("reader.command.json", {
    args,
    pid: reader.pid,
    afterBothHostExits: true,
  });
  save("reader.exit.json", {
    pid: reader.pid,
    status: reader.status,
    signal: reader.signal,
  });
  save("reader.stdout.txt", reader.stdout);
  save("reader.stderr.txt", reader.stderr);
  assert.equal(reader.status, 0);
  assert.equal(reader.stderr, "");
  save("native-bindings.json", { first: r1, second: r2 });
});
test("O01-f/P03: invalid package, absent deployment and project-directory DLL cannot become authority", () => {
  const { root, cap } = fresh();
  assert.throws(
    () => readNativePackage(path.join(root, "missing", "build.json")),
    { code: "unavailable" },
  );
  assert.throws(
    () =>
      start(cap, {
        nativePackage: { ...spec.nativePackage, dllSha256: "0".repeat(64) },
      }),
    { code: "unavailable" },
  );
  assert.throws(
    () =>
      start(cap, {
        nativePackage: {
          ...spec.nativePackage,
          manifestPath: path.join(root, "observed", "build.json"),
        },
      }),
    { code: "unavailable" },
  );
  assert.deepEqual(fs.readdirSync(path.join(root, "private")), []);
  assert.equal(openHost({ enabled: true }).status, "unavailable");
});
test("O01-f/S12: unsupported memory connection returns unavailable, borrowed handle inspection does not close the real database", () => {
  const db = new Database(":memory:");
  const m = JSON.parse(
    fs.readFileSync(spec.nativePackage.manifestPath, "utf8"),
  );
  db.loadExtension(m.dll, "sqlite3_apvidentity_init");
  const row = JSON.parse(db.prepare("SELECT apv_main_identity() AS j").get().j);
  assert.equal(row.status, "unavailable");
  assert.notEqual(row.fcntlRc, 0);
  assert.equal(db.prepare("SELECT 1 AS n").get().n, 1);
  db.close();
  save("unsupported-connection.json", row);
});
test("O01-f/M01: Catalog expected native identity mismatch rejects without alternative authority", async () => {
  const { cap } = fresh(),
    one = start(cap),
    r = await one.ready;
  await one.close();
  const db = new Database(r.paths.catalog, { fileMustExist: true });
  const row = db.prepare("SELECT * FROM native_bindings").get(),
    bad = JSON.parse(row.owner_id);
  bad.fileId = "0".repeat(32);
  db.prepare("UPDATE native_bindings SET owner_id=? WHERE store_key=?").run(
    JSON.stringify(bad),
    row.store_key,
  );
  db.close();
  const rejected = start(cap);
  await assert.rejects(rejected.ready, { code: "binding_conflict" });
  assert.equal((await rejected.closed).processExited, true);
  const check = new Database(r.paths.catalog, {
    readonly: true,
    fileMustExist: true,
  });
  assert.equal(check.prepare("SELECT count(*) AS n FROM bindings").get().n, 1);
  assert.equal(
    check.prepare("SELECT owner_id FROM native_bindings").get().owner_id,
    JSON.stringify(bad),
  );
  check.close();
  save("rejected-native-identity.json", {
    expectedBefore: JSON.parse(row.owner_id),
    controlledMismatch: bad,
  });
});
test("O01-f/P03: hard-link alias rejects before resource replacement or fallback", async () => {
  const { root, cap } = fresh(),
    one = start(cap),
    r = await one.ready;
  await one.close();
  fs.linkSync(r.paths.owner, path.join(root, "owner-alias"));
  const rejected = start(cap);
  await assert.rejects(rejected.ready, { code: "binding_conflict" });
  await rejected.closed;
  assert.equal(fs.statSync(r.paths.owner).nlink, 2);
});

test("O01-a/f/P02: simultaneous native first binding has one authority and rejects metadata-only downgrade", async () => {
  const { cap } = fresh(),
    a = start(cap, { holdAtAdmission: true }),
    b = start(cap, { holdAtAdmission: true });
  await Promise.all([a.admitted, b.admitted]);
  a.activate();
  b.activate();
  const outcomes = await Promise.allSettled([a.ready, b.ready]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const winner = outcomes[0].status === "fulfilled" ? a : b,
    loser = winner === a ? b : a,
    r = await winner.ready;
  await loser.closed;
  assert.equal(
    r.resourceBinding.actualDriverHandleIdentity,
    "main-confirmed-only",
  );
  await winner.close();
  const legacyOptions = { ...options };
  delete legacyOptions.nativePackage;
  const legacy = launchSyntheticHost(cap, legacyOptions);
  lives.push(legacy);
  await assert.rejects(legacy.ready, { code: "unavailable" });
  await legacy.closed;
  const catalog = new Database(r.paths.catalog, {
    readonly: true,
    fileMustExist: true,
  });
  assert.equal(catalog.pragma("user_version", { simple: true }), 2);
  assert.equal(
    catalog.prepare("SELECT count(*) AS n FROM native_bindings").get().n,
    1,
  );
  catalog.close();
});
test("O01-f/P03: extension load exception is fail-closed, sanitized and leaves no alternate authority", () => {
  const { root, cap } = fresh();
  let opened,
    closed = false;
  function RejectExtension(file, opts) {
    opened = new Database(file, opts);
    opened.loadExtension = () => {
      throw Error("PRIVATE_SENTINEL_DLL_LOAD");
    };
    const close = opened.close.bind(opened);
    opened.close = () => {
      close();
      closed = true;
    };
    return opened;
  }
  let error;
  try {
    openSyntheticStore(cap, {
      Database: RejectExtension,
      applyNormalizedEvent: core.applyNormalizedEvent,
      processorFingerprint: spec.processorFingerprint,
      projectId: "PA",
      generation: "G1",
      bootstrap: seed(),
      nativePackage: spec.nativePackage,
    });
  } catch (e) {
    error = e;
  }
  assert.equal(error?.code, "unavailable");
  assert(!String(error).includes("PRIVATE_SENTINEL"));
  assert.equal(closed, true);
  assert.equal(opened.open, false);
  assert.deepEqual(fs.readdirSync(path.join(root, "private")), [
    "catalog.sqlite",
  ]);
  save("load-failure.json", {
    controlledApiException: true,
    errorCode: error.code,
    catalogConnectionClosed: closed,
    ownerCreated: false,
    projectCreated: false,
    replay: false,
    publish: false,
    ack: false,
  });
});

test("O01-f/P03: unreviewed self-authored TEMP build manifest is not a DLL trust anchor", () => {
  const buildId = randomUUID(),
    root = path.join(
      fs.realpathSync.native(os.tmpdir()),
      "apv-storage-attestor-build-" + buildId,
    );
  fs.mkdirSync(root);
  const original = JSON.parse(
    fs.readFileSync(spec.nativePackage.manifestPath, "utf8"),
  );
  const manifestPath = path.join(root, "build.json"),
    dll = path.join(root, "apv_identity.dll");
  // Controlled adversarial fixture, NOT a compiled/approved Native build.
  // It satisfies the old self-reported checks; never load these fake bytes.
  fs.writeFileSync(dll, "controlled untrusted non-DLL bytes", { flag: "wx" });
  const dllSha256 = createHash("sha256")
    .update(fs.readFileSync(dll))
    .digest("hex");
  const rejectedManifest = {
    ...original,
    buildId,
    root,
    dll,
    dllSha256,
    command: original.command.map((v) => (v === original.dll ? dll : v)),
  };
  const originalRoot = path.dirname(spec.nativePackage.manifestPath);
  for (const name of ["compiler.exit.json", "pe.exit.json", "pe.stdout.txt"])
    fs.copyFileSync(
      path.join(originalRoot, name),
      path.join(root, name),
      fs.constants.COPYFILE_EXCL,
    );
  fs.writeFileSync(manifestPath, JSON.stringify(rejectedManifest), {
    flag: "wx",
  });
  assert.equal(fs.statSync(dll).nlink, 1);
  assert.equal(fs.realpathSync.native(dll), dll);
  for (const input of rejectedManifest.inputs)
    assert.equal(
      createHash("sha256").update(fs.readFileSync(input.file)).digest("hex"),
      input.sha256,
    );
  assert.equal(rejectedManifest.command.at(-2), dll);
  assert.throws(() => readNativePackage(manifestPath), { code: "unavailable" });
  save("unreviewed-build-refusal.json", {
    controlledAdversarialFixture: true,
    NOT_A_REAL_BUILD: true,
    rejectedManifest,
    copiedSelfReportedChecks: [
      "compiler.exit.json",
      "pe.exit.json",
      "pe.stdout.txt",
    ],
    actualFakeDllSha256: dllSha256,
    status: "unavailable",
    dllLoaded: false,
  });
});
