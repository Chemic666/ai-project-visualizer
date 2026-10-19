"use strict";
// File-only audit. Never opens SQLite, loads a DLL, or spawns a process.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { hash, uuid } = require("./checks.cjs");
const { makeCuts } = require("./fixture.cjs");
const { reconcile } = require("./oracle.cjs");
const { validateFaultEvidence } = require("./policy.cjs");
function audit(root) {
  const load = (n) => JSON.parse(fs.readFileSync(path.join(root, n), "utf8"));
  const m = load("manifest.json");
  assert.equal(path.basename(root), m.runId);
  // Compare captured package evidence, never substitute today's Worker hashes
  // for an older run's recorded identity. Original v1 evidence stays unchanged.
  assert(m.executionPackage, "REVISED_EXECUTION_PACKAGE_REQUIRED");
  const capturedPackage = load("execution-package.json");
  assert.deepEqual(m.executionPackage, {
    ...capturedPackage,
    manifestSha256: hash(path.join(root, "execution-package.json")),
  });
  assert.equal(capturedPackage.scope, "G2-js-arm-boundary-v2");
  uuid(capturedPackage.revision);
  assert.deepEqual(
    Object.keys(capturedPackage.sourceHashes).sort(),
    [
      "worker.cjs",
      "checks.cjs",
      "runner.cjs",
      "audit.cjs",
      "policy.cjs",
      "oracle.cjs",
      "fixture.cjs",
      "physical-path.ps1",
    ].sort(),
  );
  assert.match(capturedPackage.workerSha256, /^[a-f0-9]{64}$/);
  assert.equal(capturedPackage.nativeBuildId, m.buildId);
  assert.equal(capturedPackage.nativeDllSha256, m.build.binarySha256);
  assert.equal(
    capturedPackage.workerSha256,
    capturedPackage.sourceHashes["worker.cjs"],
  );
  for (const [name, digest] of Object.entries(capturedPackage.sourceHashes))
    assert.equal(m.sourceHashes[name], digest);
  const rows = {};
  for (const role of ["writer", "reader"]) {
    const spec = load(role + ".spec.json"),
      exit = load(role + ".exit.json");
    assert.equal(exit.status, 0);
    assert.equal(exit.signal, null);
    assert.equal(exit.error, null);
    assert.equal(spec.runId, m.runId);
    assert.equal(spec.buildId, m.buildId);
    assert.deepEqual(spec.executionPackage, m.executionPackage);
    assert.equal(spec.case, m.case);
    assert.equal(spec.parentPid, m.parentPid);
    assert.equal(spec.root, root);
    assert.equal(spec.role, role);
    assert.deepEqual(spec.fixture, m.fixture);
    assert.equal(spec.dll, path.join(root, "apv_g2_vfs.dll"));
    const cmd = load(role + ".command.json");
    assert.equal(cmd.runId, m.runId);
    assert.equal(cmd.nonce, spec.nonce);
    assert.equal(cmd.exe, m.argv[0]);
    assert.deepEqual(cmd.args, [
      path.join(__dirname, "worker.cjs"),
      "--g2-worker",
      "--execute",
      path.join(root, role + ".spec.json"),
      spec.nonce,
    ]);
    const r = fs
      .readFileSync(path.join(root, role + ".receipts.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/)
      .map(JSON.parse);
    rows[role] = r;
    for (const [i, e] of r.entries()) {
      assert.equal(e.seq, i + 1);
      assert.equal(e.pid, exit.pid);
      assert.equal(e.ppid, m.parentPid);
      assert.equal(e.nonce, spec.nonce);
      assert.equal(e.runId, m.runId);
      assert.equal(e.role, role);
    }
    assert.equal(r[0].type, "worker-start");
    assert.deepEqual(r[0].executionPackage, m.executionPackage);
    assert.equal(r.at(-1).type, "worker-complete");
  }
  const writer = load("writer.spec.json"),
    exit = load("writer.exit.json");
  assert.equal(hash(path.join(root, "apv_g2_vfs.dll")), m.dllSha256);
  assert.equal(m.dllSha256, m.build.binarySha256);
  const settled = load("writer-settlement.json");
  assert.equal(settled.status, exit.status);
  assert.equal(settled.pid, exit.pid);
  assert.equal(settled.nonce, writer.nonce);
  assert.deepEqual(load("reader.spec.json").writerSettlement, settled);
  const config = rows.writer.find((r) => r.type === "effective-config");
  assert(config);
  assert.equal(config.journalMode, "wal");
  assert.equal(config.synchronous, 2);
  assert.equal(config.walAutoCheckpoint, 0);
  const selected = rows.writer.find((r) => r.type === "target-vfs-selected");
  assert(selected);
  assert.equal(selected.info.actualVfsName, "apv_g2_fault_v1");
  assert.equal(selected.info.vfsQueryStatus, "ok");
  assert.equal(selected.info.fileControlRc, 0);
  assert.equal(selected.info.databaseFile, path.join(root, "target.sqlite"));
  assert.equal(selected.info.pid, exit.pid);
  assert.equal(
    rows.writer.find((r) => r.type === "pre-injection-transaction")
      .transactionActive,
    true,
  );
  const errorTime = rows.writer.find(
    (r) => r.type === "native-target-state-before-cleanup",
  );
  assert(errorTime);
  assert.equal(
    rows.writer.find((r) => r.type === "native-armed").state.mainFileId,
    errorTime.state.mainFileId,
  );
  const native = load("native-events.json"),
    { before, after, candidate } = makeCuts(m.fixture);
  const expected = {
    runId: m.runId,
    nonce: writer.nonce,
    operationNonce: candidate.nonce,
    operationId: candidate.operationId,
    intentDigest: candidate.intentDigest,
    project: candidate.project,
    generation: candidate.generation,
    epoch: candidate.epoch,
    pid: exit.pid,
    thread: selected.info.thread,
    databaseFile: path.join(root, "target.sqlite"),
    mainFileId: errorTime.state.mainFileId,
    case: m.case,
  };
  assert.deepEqual(
    load("native-before-cleanup.json").events,
    native.events.slice(0, errorTime.state.traceCount),
  );
  assert.equal(native.overflow, 0);
  assert.equal(native.traceCount, native.events.length);
  for (const [i, e] of native.events.entries()) {
    assert.equal(e.seq, i + 1);
    assert.equal(e.pid, exit.pid);
    assert.equal(e.thread, selected.info.thread);
    if (e.path) assert.equal(path.dirname(e.path), root);
  }
  const fault = validateFaultEvidence(native, expected);
  if (fault.status === "HIT") {
    const hit = native.events.find((e) => e.injected === 1);
    const main = native.events.find(
      (e) =>
        e.method === "xOpen" &&
        e.kind === 1 &&
        e.fileId === expected.mainFileId &&
        e.path === expected.databaseFile &&
        e.rc === 0,
    );
    const wal = native.events.find(
      (e) =>
        e.method === "xOpen" &&
        e.kind === 2 &&
        e.fileId === hit.fileId &&
        e.path === expected.databaseFile + "-wal" &&
        e.rc === 0,
    );
    assert(main && wal && main.seq < wal.seq && wal.seq < hit.seq);
    assert(
      !native.events.some(
        (e) =>
          e.method === "xClose" &&
          [main.fileId, wal.fileId].includes(e.fileId) &&
          e.seq < hit.seq,
      ),
    );
  }
  const outcome = rows.writer.find(
    (r) => r.type === "commit-outcome-before-cleanup",
  );
  assert(outcome);
  if (fault.status === "HIT") {
    assert.equal(outcome.returned, "error");
    assert.equal(
      outcome.error.code,
      m.case === "G2-W" ? "SQLITE_IOERR_WRITE" : "SQLITE_IOERR_FSYNC",
    );
  }
  // This is a real target extended_errcode read via a different connection.
  // A mismatch is preserved/fails review; it is never replaced by our constant.
  if (fault.status === "HIT")
    assert.equal(errorTime.state.targetExtendedError, fault.nativeRc);
  for (const f of load("preserved-files.json").files) {
    assert.equal(hash(path.join(root, f.copy)), f.sha256);
  }
  const readerCut = fs.existsSync(path.join(root, "reader.cut.json"))
    ? load("reader.cut.json")
    : null;
  const readerIdentity = rows.reader.find(
    (r) => r.type === "independent-reader-cut",
  );
  if (readerIdentity)
    assert.deepEqual(
      readerIdentity.databaseIdentity,
      rows.writer.find((r) => r.type === "database-identity").identity,
    );
  const decision = reconcile({
    cut: readerCut,
    before,
    after,
    settlement: settled,
    writer: { pid: exit.pid, nonce: writer.nonce },
  });
  return {
    runId: m.runId,
    case: m.case,
    preparationOnly: false,
    fault,
    decision,
    status:
      fault.status === "NOT TESTED"
        ? "NOT TESTED"
        : decision.outcome === "unavailable"
          ? "UNAVAILABLE"
          : "CONTROLLED VFS OBSERVATION — INDEPENDENT REVIEW REQUIRED",
    physicalFaults: "NOT TESTED",
    u3Production: "NOT TESTED",
    publish: false,
    ack: false,
    replay: false,
  };
}
function verifyInventory(root) {
  const inventory = JSON.parse(
    fs.readFileSync(path.join(root, "inventory.json"), "utf8"),
  );
  assert.equal(inventory.runId, path.basename(root));
  assert.deepEqual(inventory.exclusions, [
    "inventory.json",
    "inventory.sha256",
  ]);
  const list = (dir, prefix = "") =>
    fs
      .readdirSync(dir)
      .sort()
      .flatMap((n) => {
        const p = path.join(dir, n);
        assert(!fs.lstatSync(p).isSymbolicLink());
        return fs.statSync(p).isDirectory()
          ? list(p, prefix + n + "/")
          : [prefix + n];
      });
  const names = inventory.files.map((f) => f.file);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    [...names].sort(),
    list(root).filter((f) => !inventory.exclusions.includes(f)),
  );
  for (const f of inventory.files) {
    assert(
      !path.win32.isAbsolute(f.file) &&
        !f.file.includes("..") &&
        !f.file.includes("\\"),
    );
    assert.equal(hash(path.join(root, f.file)), f.sha256);
    assert.equal(fs.statSync(path.join(root, f.file)).size, f.bytes);
  }
  assert.equal(
    hash(path.join(root, "inventory.json")),
    fs.readFileSync(path.join(root, "inventory.sha256"), "utf8").trim(),
  );
  return names.length;
}
if (require.main === module)
  try {
    const args = process.argv.slice(2);
    if (!args.length) {
      console.log("File-only audit: --audit RunId");
    } else {
      assert.equal(args.length, 2);
      assert.equal(args[0], "--audit");
      require("./checks.cjs").uuid(args[1]);
      const root = path.join(
        process.env.USERPROFILE,
        "AppData/Local/Temp/apv-u3-vfs-g2",
        args[1],
      );
      const count = verifyInventory(root),
        result = audit(root);
      console.log(JSON.stringify({ inventory: count, ...result }, null, 2));
      if (
        result.fault.status !== "HIT" ||
        result.decision.outcome === "unavailable"
      )
        process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 1;
  }
module.exports = { audit, verifyInventory };
