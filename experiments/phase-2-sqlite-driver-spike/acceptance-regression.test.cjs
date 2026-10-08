const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const {
  summarizeChecks,
  REQUIRED_CHECKS,
  summarizeReceipt,
  knownExitVerdict,
  wholeExitVerdict,
  buildProcessLedger,
} = require("./acceptance-verdicts.cjs");
const required = ["module_loading", "file_open", "persisted_data"];
const checks = (states) =>
  Object.fromEntries(required.map((name, i) => [name, { status: states[i] }]));
test("all required checks PASS", () =>
  assert.equal(
    summarizeChecks(checks(["PASS", "PASS", "PASS"]), required),
    "PASS",
  ));
test("an executed FAIL dominates PASS", () =>
  assert.equal(
    summarizeChecks(checks(["PASS", "FAIL", "PASS"]), required),
    "FAIL",
  ));
test("an executed FAIL dominates later NOT TESTED", () =>
  assert.equal(
    summarizeChecks(checks(["PASS", "FAIL", "NOT TESTED"]), required),
    "FAIL",
  ));
test("unexecuted required checks remain NOT TESTED", () =>
  assert.equal(
    summarizeChecks(checks(["PASS", "NOT TESTED", "PASS"]), required),
    "NOT TESTED",
  ));
test("missing Host receipt produces no fabricated Driver PASS or FAIL", () =>
  assert.equal(
    summarizeReceipt(null, "better-sqlite3", required),
    "NOT TESTED",
  ));
test("missing required check cannot create PASS", () =>
  assert.equal(summarizeChecks({}, required), "NOT TESTED"));
const root = {
  pid: 101,
  createdAt: "2026-10-08T01:00:01.000000Z",
  parentPid: 1,
};
const host = {
  pid: 102,
  createdAt: "2026-10-08T01:00:02.000000Z",
  parentPid: 101,
};
function exitInput() {
  return {
    receiptValid: true,
    baselineReadable: true,
    known: [root, host],
    host,
    current: {
      readable: true,
      processes: [],
      requiredIdentityChecks: [root, host].map((process) => ({
        pid: process.pid,
        expectedCreatedAt: process.createdAt,
        state: "gone",
        queryExecuted: true,
        resultCode: "process_not_found",
        source: "System.Diagnostics.Process",
        observedAt: "2026-10-08T01:02:00Z",
        completedAt: "2026-10-08T01:02:01Z",
      })),
    },
    ambiguous: [],
    informationGaps: [],
  };
}
test("all reliably owned identities gone: known-set exit only", () =>
  assert.equal(knownExitVerdict(exitInput()).status, "PASS"));
test("a known related process alive blocks exit", () => {
  const input = exitInput();
  input.current.processes.push({ ...root, profileMatch: false });
  assert.equal(knownExitVerdict(input).status, "FAIL");
});

function readGateFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apv-read-gate-"));
  for (const file of ["w3-evidence.cjs", "acceptance-verdicts.cjs"])
    fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  const id = crypto.randomUUID(),
    observationId = crypto.randomUUID();
  const runtime = path.join(directory, "_runtime", `w3-cmd-${id}`);
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(path.join(directory, "evidence"));
  fs.mkdirSync(path.join(directory, "artifacts"));
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  const hash = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const vsix = path.join(
    directory,
    "artifacts",
    "apv-sqlite-driver-spike-win32-x64.vsix",
  );
  fs.writeFileSync(vsix, "Regression fixture only, never an actual VSIX");
  write(path.join(directory, "evidence", "packaging-blocker-fix.json"), {
    packageArtifact: { sha256: hash(vsix) },
  });
  write(path.join(runtime, "session.json"), {
    acceptanceId: id,
    createdAt: "2026-10-08T01:00:00Z",
    vsixSha256: hash(vsix),
  });
  const writerFile = path.join(directory, "evidence", `w3-${id}-write.json`);
  const writer = {
    acceptanceId: id,
    runId: `write-${id}`,
    mode: "write",
    source: "vscode_extension_host",
    recordedAt: "2026-10-08T01:00:05Z",
    completedAt: "2026-10-08T01:00:06Z",
    status: "PASS",
    environment: {
      electron: "fixture",
      vscode: "fixture",
      platform: "win32",
      arch: "x64",
      pid: host.pid,
    },
    harness: { status: "PASS" },
    loadedFromInstalledDirectory: true,
    vsixSha256: hash(vsix),
    hostProcessIdentity: host,
    candidates: ["node:sqlite", "better-sqlite3"].map((candidate) => ({
      candidate,
      status: "PASS",
      checks: Object.fromEntries(
        REQUIRED_CHECKS.map((name) => [name, { status: "PASS" }]),
      ),
    })),
  };
  write(writerFile, writer);
  const lifecycleFile = path.join(runtime, "write-lifecycle.json");
  const life = {
    ...lifecycle(),
    acceptanceId: id,
    runId: writer.runId,
    source: "windows_cim_lifecycle_collector",
  };
  write(lifecycleFile, life);
  const snapshotFile = path.join(
    runtime,
    `exit-${observationId}-snapshot.json`,
  );
  const snapshot = {
    acceptanceId: id,
    observationId,
    runId: `exit-${observationId}`,
    source: "windows_cim_and_process_handle_post_writer_observation",
    createdAt: "2026-10-08T01:02:02Z",
    snapshot: {
      readable: true,
      recordedAt: "2026-10-08T01:02:00Z",
      processes: [],
    },
    requiredIdentityChecks: exitInput().current.requiredIdentityChecks,
  };
  write(snapshotFile, snapshot);
  const previousExitFile = path.join(
    directory,
    "evidence",
    `w3-${id}-exit.json`,
  );
  write(previousExitFile, { status: "NOT TESTED", acceptanceId: id });
  const ledger = buildProcessLedger({
    ...life,
    samples: [...life.samples, snapshot.snapshot],
  });
  const knownSet = knownExitVerdict({
    ...ledger,
    receiptValid: true,
    current: {
      ...snapshot.snapshot,
      requiredIdentityChecks: snapshot.requiredIdentityChecks,
    },
  });
  const confirmation = {
    windowsClosed: true,
    confirmedAt: "2026-10-08T01:03:00Z",
    source: "operator_explicit_command_confirmation",
  };
  const exit = {
    ...wholeExitVerdict(knownSet, confirmation),
    acceptanceId: id,
    observationId,
    runId: `exit-${observationId}`,
    createdAt: "2026-10-08T01:03:01Z",
    source: "operator_confirmation_with_cim_observations",
    writerRunId: writer.runId,
    writerIdentity: host,
    knownSet,
    knownProcesses: ledger.known,
    ambiguousProcesses: ledger.ambiguous,
    informationGaps: ledger.informationGaps,
    evidenceReferences: Object.fromEntries(
      Object.entries({
        snapshot: snapshotFile,
        writer: writerFile,
        lifecycle: lifecycleFile,
        previousExit: previousExitFile,
      }).map(([name, file]) => [name, { path: file, sha256: hash(file) }]),
    ),
  };
  const exitFile = path.join(
    directory,
    "evidence",
    `w3-${id}-exit-${observationId}.json`,
  );
  write(exitFile, exit);
  return {
    id,
    observationId,
    exit,
    exitFile,
    snapshotFile,
    writerFile,
    previousExitFile,
    write,
    invoke: (...args) =>
      spawnSync(
        process.execPath,
        [path.join(directory, "w3-evidence.cjs"), ...args],
        { encoding: "utf8", timeout: 15000 },
      ),
    directory,
    close: () => {
      assert.equal(
        path.dirname(path.resolve(directory)),
        path.resolve(os.tmpdir()),
      );
      assert.ok(path.basename(directory).startsWith("apv-read-gate-"));
      fs.rmSync(directory, { recursive: true });
    },
  };
}

test("read paths and read-only gate explicitly select a valid limited observation", () => {
  const fixture = readGateFixture();
  try {
    const before = fs.readFileSync(fixture.previousExitFile, "utf8");
    const configured = fixture.invoke(
      "paths",
      fixture.id,
      "read",
      fixture.observationId,
    );
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(JSON.parse(configured.stdout).exitReceipt, fixture.exitFile);
    const checked = fixture.invoke(
      "check-exit",
      fixture.id,
      fixture.observationId,
    );
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(
      JSON.parse(checked.stdout).observationId,
      fixture.observationId,
    );
    assert.equal(fs.readFileSync(fixture.previousExitFile, "utf8"), before);
    assert.equal(
      fixture.invoke("paths", fixture.id, "read").status,
      1,
      "No automatic legacy/latest selection",
    );
  } finally {
    fixture.close();
  }
});

for (const [name, corrupt] of [
  [
    "old NOT TESTED",
    (f) => {
      f.exit.status = "NOT TESTED";
    },
  ],
  [
    "Acceptance ID mismatch",
    (f) => {
      f.exit.acceptanceId = crypto.randomUUID();
    },
  ],
  [
    "Observation ID mismatch",
    (f) => {
      f.exit.observationId = crypto.randomUUID();
    },
  ],
  [
    "Writer Run ID mismatch",
    (f) => {
      f.exit.writerRunId = "write-other";
    },
  ],
  [
    "Writer identity mismatch",
    (f) => {
      f.exit.writerIdentity = { ...host, pid: 999 };
    },
  ],
  [
    "reference hash mismatch",
    (f) => {
      f.exit.evidenceReferences.snapshot.sha256 = "0".repeat(64);
    },
  ],
  [
    "reference path mismatch",
    (f) => {
      f.exit.evidenceReferences.writer.path = f.snapshotFile;
    },
  ],
  [
    "missing snapshot",
    (f) => {
      fs.unlinkSync(f.snapshotFile);
    },
  ],
  [
    "unqualified automatic PASS",
    (f) => {
      f.exit.automaticStatus = "PASS";
    },
  ],
  [
    "known-set NOT TESTED",
    (f) => {
      f.exit.knownSet.status = "NOT TESTED";
    },
  ],
  [
    "snapshot without an executed query despite a matching reference hash",
    (f) => {
      const snapshot = JSON.parse(fs.readFileSync(f.snapshotFile, "utf8"));
      snapshot.requiredIdentityChecks[0].queryExecuted = false;
      f.write(f.snapshotFile, snapshot);
      f.exit.evidenceReferences.snapshot.sha256 = crypto
        .createHash("sha256")
        .update(fs.readFileSync(f.snapshotFile))
        .digest("hex");
    },
  ],
])
  test(`read gate rejects ${name}`, () => {
    const fixture = readGateFixture();
    try {
      corrupt(fixture);
      fixture.write(fixture.exitFile, fixture.exit);
      assert.equal(
        fixture.invoke("check-exit", fixture.id, fixture.observationId).status,
        1,
      );
    } finally {
      fixture.close();
    }
  });

test("read gate rejects a missing or malformed selected receipt", () => {
  const fixture = readGateFixture();
  try {
    fs.unlinkSync(fixture.exitFile);
    assert.equal(
      fixture.invoke("check-exit", fixture.id, fixture.observationId).status,
      1,
    );
    fs.writeFileSync(fixture.exitFile, "{invalid JSON");
    assert.equal(
      fixture.invoke("check-exit", fixture.id, fixture.observationId).status,
      1,
    );
  } finally {
    fixture.close();
  }
});

function controllerAt(directory) {
  const filename = path.join(directory, "w3-evidence.cjs");
  const module = { exports: {} };
  vm.runInThisContext(
    "(function(exports,require,module,__filename,__dirname){" +
      fs.readFileSync(filename, "utf8") +
      "\n})",
  )(module.exports, createRequire(filename), module, filename, directory);
  return module.exports;
}

function finalAuditFixture() {
  const f = readGateFixture(),
    p = path.join(f.directory, "_runtime", `w3-cmd-${f.id}`);
  const hash = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const file = (stage) =>
    path.join(f.directory, "evidence", `w3-${f.id}-${stage}.json`);
  const runtimeHashes = {};
  const extensionDirectory =
    "apv-disposable-spike.apv-sqlite-driver-spike-0.0.0";
  const installed = path.join(p, "extensions", extensionDirectory);
  fs.mkdirSync(path.join(installed, "node_modules/better-sqlite3/prebuilds"), {
    recursive: true,
  });
  for (const name of [
    "extension.cjs",
    "probe.cjs",
    "node_modules/better-sqlite3/prebuilds/win32-x64.node",
  ]) {
    fs.writeFileSync(
      path.join(installed, name),
      name.endsWith(".cjs")
        ? fs.readFileSync(path.join(__dirname, name))
        : `fixture runtime only ${name}`,
    );
    runtimeHashes[name] = hash(path.join(installed, name));
  }
  f.write(path.join(installed, "package.json"), {
    name: "apv-sqlite-driver-spike",
    publisher: "apv-disposable-spike",
    version: "0.0.0",
  });
  f.write(path.join(installed, "node_modules/better-sqlite3/package.json"), {
    version: "13.0.3",
  });
  const sessionFile = path.join(p, "session.json"),
    session = JSON.parse(fs.readFileSync(sessionFile));
  session.source = "ordinary_node_acceptance_setup";
  f.write(sessionFile, session);
  const packagingFile = path.join(
      f.directory,
      "evidence/packaging-blocker-fix.json",
    ),
    packaging = JSON.parse(fs.readFileSync(packagingFile));
  packaging.status = "PASS";
  packaging.archiveAudit = {
    status: "PASS",
    nativeSha256:
      runtimeHashes["node_modules/better-sqlite3/prebuilds/win32-x64.node"],
  };
  f.write(packagingFile, packaging);
  f.write(file("baseline"), {
    acceptanceId: f.id,
    runId: `baseline-${f.id}`,
    source: "windows_cim_pre_install_baseline",
    createdAt: "2026-10-08T01:00:00.015Z",
    isolatedProfile: path.join(p, "user-data"),
    snapshot: {
      readable: true,
      processes: [],
      recordedAt: "2026-10-08T01:00:00.010Z",
    },
  });
  f.write(file("install"), {
    acceptanceId: f.id,
    runId: `install-${f.id}`,
    source: "ordinary_node_installed_file_audit",
    scope: "installation_integrity_only",
    status: "PASS",
    createdAt: "2026-10-08T01:00:00.020Z",
    vsixSha256: session.vsixSha256,
    runtimeHashes,
  });
  const addHost = (r, prefix, baselineAt) => {
    r.extensionDirectory = extensionDirectory;
    r.nativeSha256 = packaging.archiveAudit.nativeSha256;
    r.runtimeHashes = {
      "extension.cjs": runtimeHashes["extension.cjs"],
      "probe.cjs": runtimeHashes["probe.cjs"],
    };
    r.environment.node = "fixture-node";
    r.environment.modules = "fixture-abi";
    r.environment.napi = "fixture-napi";
    r.hostProbe = {
      scope: "installed_extension_host",
      activation: "PASS",
      environment: r.environment,
    };
    f.write(file(prefix), r);
    const life =
      prefix === "write"
        ? JSON.parse(fs.readFileSync(path.join(p, "write-lifecycle.json")))
        : {
            root: {
              pid: r.hostProcessIdentity.parentPid,
              createdAt: baselineAt,
            },
            host: r.hostProcessIdentity,
            samples: [],
          };
    Object.assign(life, {
      acceptanceId: f.id,
      runId: r.runId,
      source: "windows_cim_lifecycle_collector",
      isolatedProfile: path.join(p, "user-data"),
      createdAt: baselineAt,
      completedAt: r.completedAt,
      baseline: { readable: true, processes: [], recordedAt: baselineAt },
      timedOut: false,
      launchError: null,
    });
    f.write(path.join(p, `${prefix}-lifecycle.json`), life);
    f.write(path.join(p, `${prefix}-host-start.json`), {
      source: "vscode_extension_host",
      acceptanceId: f.id,
      runId: r.runId,
      recordedAt: r.recordedAt,
      pid: r.environment.pid,
      parentPid: r.hostProcessIdentity.parentPid,
    });
    f.write(path.join(p, `${prefix}-host-ack.json`), {
      source: "windows_cim_collector",
      acceptanceId: f.id,
      runId: r.runId,
      recordedAt: r.recordedAt,
      process: r.hostProcessIdentity,
    });
  };
  const writer = JSON.parse(fs.readFileSync(f.writerFile));
  for (const c of writer.candidates)
    Object.assign(c, {
      marker: f.id,
      writerPid: host.pid,
      writerRunId: writer.runId,
      pid: host.pid,
      limitations: ["Fixture two-connection limit"],
    });
  addHost(writer, "write", "2026-10-08T01:00:00.500Z");
  const probe = structuredClone(writer);
  Object.assign(probe, {
    mode: "probe",
    runId: `probe-${f.id}`,
    recordedAt: "2026-10-08T01:00:00.300Z",
    completedAt: "2026-10-08T01:00:00.400Z",
    hostProcessIdentity: {
      pid: 200,
      parentPid: 199,
      createdAt: "2026-10-08T01:00:00.200000Z",
    },
  });
  probe.environment.pid = 200;
  addHost(probe, "probe", "2026-10-08T01:00:00.100Z");
  for (const ref of Object.values(f.exit.evidenceReferences))
    ref.sha256 = hash(ref.path);
  f.write(f.exitFile, f.exit);
  const attemptId = crypto.randomUUID(),
    prefix = `read-${attemptId}`,
    reader = structuredClone(writer);
  Object.assign(reader, {
    mode: "read",
    readAttemptId: attemptId,
    runId: prefix,
    status: "PASS WITH LIMITATION",
    recordedAt: "2026-10-08T01:04:02Z",
    completedAt: "2026-10-08T01:04:03Z",
    hostProcessIdentity: {
      pid: 302,
      parentPid: 301,
      createdAt: "2026-10-08T01:04:01.000000Z",
    },
    writerExitReceipt: {
      acceptanceId: f.id,
      observationId: f.observationId,
      runId: f.exit.runId,
      receiptPath: f.exitFile,
      sha256: hash(f.exitFile),
      status: f.exit.status,
      method: f.exit.method,
      writerRunId: writer.runId,
      writerIdentity: writer.hostProcessIdentity,
      limitations: f.exit.limitations,
    },
  });
  reader.environment.pid = 302;
  for (const c of reader.candidates)
    Object.assign(c, {
      status: "PASS WITH LIMITATION",
      pid: 302,
      limitations: [...c.limitations, ...f.exit.limitations],
    });
  addHost(reader, prefix, "2026-10-08T01:04:00Z");
  f.write(file("read"), {
    acceptanceId: f.id,
    runId: `read-${f.id}`,
    source: "vscode_extension_host",
    status: "FAIL",
    harness: {
      status: "FAIL",
      error: { code: "ERR_ASSERTION", message: "historical path mismatch" },
    },
    candidates: [
      { candidate: "node:sqlite", status: "NOT TESTED" },
      { candidate: "better-sqlite3", status: "NOT TESTED" },
    ],
  });
  return { ...f, attemptId, reader, writer, probe, file, runtime: p, hash };
}

test("final audit explicitly selects A-F, keeps limited success and historical failures", () => {
  const f = finalAuditFixture();
  try {
    const before = f.hash(f.file("read")),
      oldExit = f.hash(f.previousExitFile);
    const r = f.invoke("audit", f.id, f.observationId, f.attemptId);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.status, "PASS WITH LIMITATION");
    assert.equal(summary.selection.exitObservationId, f.observationId);
    assert.equal(summary.selection.readAttemptId, f.attemptId);
    assert.ok(
      summary.history.entries.some(
        (x) =>
          x.file === f.file("read") &&
          x.reportedStatus === "FAIL" &&
          x.selectionRole === "historical_nonselected",
      ),
    );
    assert.ok(
      summary.history.entries.some(
        (x) =>
          x.file === f.previousExitFile && x.reportedStatus === "NOT TESTED",
      ),
    );
    assert.equal(f.hash(f.file("read")), before);
    assert.equal(f.hash(f.previousExitFile), oldExit);
    assert.equal(summary.decisionAccepted, false);
    assert.ok(summary.limitations.length);
    assert.ok(
      summary.drivers.every(
        (d) => d.restartAcceptanceStatus === "PASS WITH LIMITATION",
      ),
    );
    assert.ok(fs.existsSync(summary.reportPath));
    const again = f.invoke("audit", f.id, f.observationId, f.attemptId);
    assert.equal(again.status, 0, again.stderr);
    assert.notEqual(JSON.parse(again.stdout).reportPath, summary.reportPath);
  } finally {
    f.close();
  }
});

for (const [name, breakInput] of [
  ["missing install", (f) => fs.unlinkSync(f.file("install"))],
  [
    "baseline unreadable",
    (f) => {
      const r = JSON.parse(fs.readFileSync(f.file("baseline")));
      r.snapshot.readable = false;
      f.write(f.file("baseline"), r);
    },
  ],
  [
    "reader uses wrong exit",
    (f) => {
      f.reader.writerExitReceipt.observationId = crypto.randomUUID();
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "reader PID is writer PID",
    (f) => {
      f.reader.environment.pid = f.writer.environment.pid;
      f.reader.hostProcessIdentity = f.writer.hostProcessIdentity;
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "marker mismatch",
    (f) => {
      f.reader.candidates[0].marker = "other";
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "native hash mismatch",
    (f) => {
      f.reader.nativeSha256 = "0".repeat(64);
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "reader exit receipt hash mismatch",
    (f) => {
      f.reader.writerExitReceipt.sha256 = "0".repeat(64);
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "reader created before approved exit",
    (f) => {
      f.reader.hostProcessIdentity.createdAt =
        f.writer.hostProcessIdentity.createdAt;
      f.write(f.file(`read-${f.attemptId}`), f.reader);
    },
  ],
  [
    "missing reader ACK",
    (f) =>
      fs.unlinkSync(path.join(f.runtime, `read-${f.attemptId}-host-ack.json`)),
  ],
])
  test(`final audit blocks ${name}`, () => {
    const f = finalAuditFixture();
    try {
      breakInput(f);
      const r = f.invoke("audit", f.id, f.observationId, f.attemptId);
      assert.equal(r.status, 1);
      const summary = JSON.parse(r.stdout);
      assert.equal(summary.status, "NOT TESTED");
    } finally {
      f.close();
    }
  });
test("selected driver FAIL dominates pending audit bindings", () => {
  const f = finalAuditFixture();
  try {
    f.reader.status = "FAIL";
    f.reader.candidates[0].status = "FAIL";
    f.reader.candidates[0].checks.module_loading.status = "FAIL";
    f.write(f.file(`read-${f.attemptId}`), f.reader);
    fs.unlinkSync(f.file("install"));
    const r = f.invoke("audit", f.id, f.observationId, f.attemptId);
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).status, "FAIL");
  } finally {
    f.close();
  }
});
test("final audit requires explicit IDs and rejects damaged history instead of hiding it", () => {
  const f = finalAuditFixture();
  try {
    const controller = controllerAt(f.directory);
    assert.throws(() => controller.prepareFinalAudit(f.id), /explicit/);
    assert.throws(
      () => controller.prepareFinalAudit(f.id, f.observationId),
      /explicit/,
    );
    fs.writeFileSync(f.file("read"), "{broken historical receipt");
    const result = controller.prepareFinalAudit(
      f.id,
      f.observationId,
      f.attemptId,
    );
    assert.equal(result.status, "NOT TESTED");
    assert.equal(result.history.status, "NOT TESTED");
    assert.ok(
      result.history.entries.some(
        (e) => e.file === f.file("read") && e.readError,
      ),
    );
  } finally {
    f.close();
  }
});

test(
  "Host lowercase drive and CLI uppercase drive use the same exit proof",
  { skip: process.platform !== "win32" },
  () => {
    const fixture = readGateFixture();
    try {
      const hostDirectory = fixture.directory.replace(
        /^([A-Z]):/i,
        (_, drive) => drive.toLowerCase() + ":",
      );
      const controller = controllerAt(hostDirectory);
      const proof = controller.reviewExitForRead(
        fixture.id,
        fixture.observationId,
      );
      assert.equal(proof.status, "PASS WITH LIMITATION");
      controller.assertEvidencePath(
        proof.receiptPath,
        fixture.exitFile,
        "Host receipt",
      );
    } finally {
      fixture.close();
    }
  },
);

test("path comparison retains full absolute-file and hash boundaries", () => {
  const fixture = readGateFixture();
  try {
    const controller = controllerAt(fixture.directory);
    controller.assertEvidencePath(
      fixture.snapshotFile.split(path.sep).join("/"),
      fixture.snapshotFile,
      "snapshot",
    );
    assert.throws(() =>
      controller.assertEvidencePath(
        path.basename(fixture.snapshotFile),
        fixture.snapshotFile,
        "snapshot",
      ),
    );
    assert.throws(() =>
      controller.assertEvidencePath(
        fixture.writerFile,
        fixture.snapshotFile,
        "snapshot",
      ),
    );
    const differentCase = fixture.snapshotFile.replace(
      "snapshot.json",
      "Snapshot.json",
    );
    assert.throws(
      () =>
        controller.assertEvidencePath(
          differentCase,
          fixture.snapshotFile,
          "snapshot",
        ),
      "Do not fold directory/file case or accept a different file",
    );
    fixture.exit.evidenceReferences.snapshot.sha256 = "0".repeat(64);
    fixture.write(fixture.exitFile, fixture.exit);
    assert.throws(
      () => controller.reviewExitForRead(fixture.id, fixture.observationId),
      /hash mismatch/,
    );
  } finally {
    fixture.close();
  }
});

test("read retry uses fresh receipt, handshake and lifecycle paths", () => {
  const fixture = readGateFixture();
  try {
    const attemptId = crypto.randomUUID();
    const oldRead = path.join(
      fixture.directory,
      "evidence",
      `w3-${fixture.id}-read.json`,
    );
    fs.writeFileSync(oldRead, "existing FAIL fixture: never overwrite");
    const result = fixture.invoke(
      "paths",
      fixture.id,
      "read",
      fixture.observationId,
      attemptId,
    );
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.runId, `read-${attemptId}`);
    assert.equal(config.readAttemptId, attemptId);
    assert.notEqual(config.receipt, oldRead);
    for (const key of ["receipt", "lifecycle", "hostStart", "hostAck"])
      assert.ok(config[key].includes(attemptId));
    assert.equal(config.writeReceipt, fixture.writerFile);
    assert.equal(config.exitReceipt, fixture.exitFile);
    const reader = JSON.parse(fs.readFileSync(fixture.writerFile, "utf8"));
    reader.mode = "read";
    reader.runId = config.runId;
    reader.readAttemptId = attemptId;
    reader.status = "PASS WITH LIMITATION";
    for (const candidate of reader.candidates)
      candidate.status = "PASS WITH LIMITATION";
    fixture.write(config.receipt, reader);
    const checked = fixture.invoke("check-read", fixture.id, attemptId);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).receipt.runId, config.runId);
    reader.readAttemptId = crypto.randomUUID();
    fixture.write(config.receipt, reader);
    assert.equal(fixture.invoke("check-read", fixture.id, attemptId).status, 1);
    assert.equal(
      fs.readFileSync(oldRead, "utf8"),
      "existing FAIL fixture: never overwrite",
    );
  } finally {
    fixture.close();
  }
});

test(
  "PowerShell read configuration forwards the explicit ObservationId without launching",
  { skip: process.platform !== "win32" },
  (t) => {
    const fixture = readGateFixture();
    try {
      const source = fs.readFileSync(
        path.join(__dirname, "w3-session.ps1"),
        "utf8",
      );
      // Only the actual parameter/configuration prefix; no launch/process IO code.
      const prefix = source.slice(0, source.indexOf("function Write-NewJson"));
      assert.ok(prefix.startsWith("param("));
      assert.ok(!prefix.includes("Start-Process"));
      const script = path.join(fixture.directory, "read-config-only.ps1");
      fs.writeFileSync(
        script,
        prefix + "\n$taskConfig | ConvertTo-Json -Depth 12 -Compress\n",
      );
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          script,
          "-Action",
          "launch",
          "-Mode",
          "read",
          "-AcceptanceId",
          fixture.id,
          "-ObservationId",
          fixture.observationId,
        ],
        { encoding: "utf8", timeout: 15000 },
      );
      if (
        result.status !== 0 &&
        /AuthorizationManager check failed|PSSecurityException/.test(
          result.stderr ?? "",
        )
      ) {
        t.skip(
          "Temporary PowerShell -File execution blocked by environment authorization; no execution-policy bypass",
        );
        return;
      }
      assert.equal(result.status, 0, result.stderr || String(result.error));
      const configured = JSON.parse(result.stdout.trim());
      assert.equal(configured.exitObservationId, fixture.observationId);
      assert.equal(configured.exitReceipt, fixture.exitFile);
      assert.equal(
        configured.exitReceiptSha256,
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(fixture.exitFile))
          .digest("hex"),
      );
    } finally {
      fixture.close();
    }
  },
);
test("PID reuse is not silently treated as the same or missing process", () => {
  const input = exitInput();
  input.current.processes.push({
    ...root,
    createdAt: "2026-10-08T01:01:00.000000Z",
  });
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("missing creation time blocks exit proof", () => {
  const input = exitInput();
  input.current.processes.push({ pid: root.pid, createdAt: null });
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("failed process enumeration blocks exit proof", () => {
  const input = exitInput();
  input.current.readable = false;
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("suspicious process with unreadable command line is not discarded", () => {
  const input = exitInput();
  input.ambiguous.push({
    pid: 103,
    createdAt: root.createdAt,
    commandLineReadable: false,
  });
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("prior failed or missing internal evidence never yields exit PASS", () => {
  const input = exitInput();
  input.receiptValid = false;
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("recorded information gap cannot be overwritten by a clean final snapshot", () => {
  const input = exitInput();
  input.informationGaps.push("Unreadable related identity during launch");
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("sampled known-set exit cannot become automatic whole-instance PASS", () =>
  assert.equal(
    wholeExitVerdict({ status: "PASS", reasons: [] }, null).status,
    "NOT TESTED",
  ));
test("explicit human confirmation is limited, never automatic PASS", () => {
  const result = wholeExitVerdict(
    { status: "PASS", reasons: [] },
    { windowsClosed: true, confirmedAt: "2026-10-08T01:02:00Z" },
  );
  assert.equal(result.status, "PASS WITH LIMITATION");
  assert.equal(
    result.method,
    "manual_confirmation_with_sampled_process_tracking",
  );
});
test("human confirmation cannot override unknown ownership", () =>
  assert.equal(
    wholeExitVerdict(
      { status: "NOT TESTED", reasons: ["ambiguous"] },
      { windowsClosed: true },
    ).status,
    "NOT TESTED",
  ));
test("human confirmation cannot override known live processes", () =>
  assert.equal(
    wholeExitVerdict(
      { status: "FAIL", reasons: ["alive"] },
      { windowsClosed: true },
    ).status,
    "FAIL",
  ));
function lifecycle() {
  return {
    acceptanceId: "fixture-only",
    baseline: { readable: true, processes: [] },
    root,
    host,
    samples: [
      {
        recordedAt: "2026-10-08T01:00:04Z",
        readable: true,
        processes: [
          { ...root, profileMatch: true },
          { ...host, codeCandidate: true, commandLineReadable: false },
        ],
      },
      {
        recordedAt: "2026-10-08T01:00:05Z",
        readable: true,
        processes: [
          { ...root, profileMatch: true },
          { ...host, codeCandidate: true, commandLineReadable: false },
        ],
      },
    ],
  };
}
test("repeated profile observations retain observation history", () => {
  const ledger = buildProcessLedger(lifecycle());
  assert.equal(
    ledger.known.find((p) => p.pid === root.pid).observationCount,
    2,
  );
});
test("empty-command-line child remains tracked through observed parent identity", () => {
  const input = lifecycle();
  input.samples[0].processes.push({
    pid: 103,
    createdAt: "2026-10-08T01:00:03.000000Z",
    parentPid: host.pid,
    codeCandidate: true,
    commandLineReadable: false,
  });
  const ledger = buildProcessLedger(input);
  assert.ok(ledger.known.some((p) => p.pid === 103));
  assert.equal(ledger.ambiguous.length, 0);
});
test("reused parent PID does not establish ownership of a new child", () => {
  const input = lifecycle();
  input.samples[1].processes = [
    { ...root, createdAt: "2026-10-08T01:00:04.000000Z" },
    {
      pid: 104,
      parentPid: root.pid,
      createdAt: "2026-10-08T01:00:04.500000Z",
      codeCandidate: true,
      commandLineReadable: false,
    },
  ];
  const ledger = buildProcessLedger(input);
  assert.ok(!ledger.known.some((p) => p.pid === 104));
  assert.ok(ledger.ambiguous.some((p) => p.pid === 104));
});
test("single snapshot never establishes lifecycle coverage", () => {
  const input = lifecycle();
  input.samples.pop();
  assert.ok(buildProcessLedger(input).informationGaps.length);
});
test("monitor timeout cannot be erased by a later clean snapshot", () => {
  const input = lifecycle();
  input.timedOut = true;
  assert.ok(buildProcessLedger(input).informationGaps.length);
});
test("original check errors and limitations are preserved", () => {
  const input = checks(["FAIL", "NOT TESTED", "NOT TESTED"]);
  input.module_loading.error = {
    code: "NATIVE_LOAD_ERROR",
    message: "fixture failure",
  };
  input.module_loading.details = { limitation: "fixture scope" };
  const before = JSON.stringify(input);
  assert.equal(summarizeChecks(input, required), "FAIL");
  assert.equal(JSON.stringify(input), before);
});
test("CIM absence cannot hide an independently live known PID", () => {
  const input = exitInput();
  input.current.requiredIdentityChecks[0].state = "alive";
  input.current.requiredIdentityChecks[0].resultCode = "process_identity_read";
  input.current.requiredIdentityChecks[0].currentCreatedAt = root.createdAt;
  assert.equal(knownExitVerdict(input).status, "FAIL");
});

test("CIM absence and an unexecuted PID query cannot prove exit", () => {
  const input = exitInput();
  input.current.requiredIdentityChecks[0].queryExecuted = false;
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("gone requires the actual not-found result, not a generic query error", () => {
  const input = exitInput();
  input.current.requiredIdentityChecks[0].resultCode = "query_failed";
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});
test("the historical Windows PowerShell nested-array shape stays untested", () => {
  const input = exitInput();
  input.current.requiredIdentityChecks = [
    {
      pid: [root.pid, host.pid],
      expectedCreatedAt: [root.createdAt, host.createdAt],
      state: "unreadable",
      errorType: "RuntimeException",
    },
  ];
  const result = knownExitVerdict(input);
  assert.equal(result.status, "NOT TESTED");
  assert.ok(result.reasons.some((reason) => reason.includes("Malformed")));
});
test("PID reuse from an independent query remains blocked", () => {
  const input = exitInput();
  Object.assign(input.current.requiredIdentityChecks[0], {
    state: "pid_reused",
    resultCode: "process_identity_read",
    currentCreatedAt: "2026-10-08T02:00:00Z",
  });
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});

function runWindowsPowerShell(script) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
}
test(
  "Windows PowerShell 5 parses 18 identities as 18 scalar query inputs",
  { skip: process.platform !== "win32" },
  () => {
    const source = fs.readFileSync(
      path.join(__dirname, "w3-session.ps1"),
      "utf8",
    );
    const assignment = source.match(/^  \$taskIdentities = .+$/m)?.[0];
    assert.ok(
      assignment,
      "actual collector identity parsing assignment required",
    );
    const identities = Array.from({ length: 18 }, (_, i) => ({
      pid: i + 101,
      createdAt: root.createdAt,
    }));
    const result = runWindowsPowerShell(`
    $ErrorActionPreference='Stop'
    $taskIdentityText='${JSON.stringify(identities)}'
    ${assignment}
    $rows = @(foreach ($identity in $taskIdentities) { @{pid=$identity.pid;createdAt=$identity.createdAt} })
    @{version=$PSVersionTable.PSVersion.ToString();rows=$rows} | ConvertTo-Json -Depth 5 -Compress
  `);
    assert.match(result.version, /^5\./);
    assert.deepEqual(result.rows, identities);
  },
);
test("an unavailable independent identity check blocks exit", () => {
  const input = exitInput();
  input.current.requiredIdentityChecks[0].state = "unreadable";
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});

test("missing independent records never turn CIM absence into exit proof", () => {
  const input = exitInput();
  delete input.current.requiredIdentityChecks;
  assert.equal(knownExitVerdict(input).status, "NOT TESTED");
});

test(
  "actual Windows PID queries distinguish alive, reused and not found",
  { skip: process.platform !== "win32" },
  () => {
    const source = fs.readFileSync(
      path.join(__dirname, "w3-session.ps1"),
      "utf8",
    );
    const helper = source.match(
      /^function Get-IndependentProcessObservation\([\s\S]*?^}/m,
    )?.[0];
    assert.ok(helper);
    const result = runWindowsPowerShell(`
    $ErrorActionPreference='Stop'
    ${helper}
    $self=[System.Diagnostics.Process]::GetProcessById($PID)
    $created=$self.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')
    $self.Dispose()
    $checks=@(
      Get-IndependentProcessObservation @{pid=$PID;createdAt=$created}
      Get-IndependentProcessObservation @{pid=$PID;createdAt='2000-01-01T00:00:00.000000Z'}
      Get-IndependentProcessObservation @{pid=[int]::MaxValue;createdAt=$created}
    )
    $checks | ConvertTo-Json -Depth 5 -Compress
  `);
    assert.deepEqual(
      result.map((check) => check.state),
      ["alive", "pid_reused", "gone"],
    );
    assert.deepEqual(
      result.map((check) => check.resultCode),
      ["process_identity_read", "process_identity_read", "process_not_found"],
    );
    for (const check of result) {
      assert.equal(check.queryExecuted, true);
      assert.equal(check.source, "System.Diagnostics.Process");
      assert.ok(Date.parse(check.completedAt) >= Date.parse(check.observedAt));
    }
  },
);

test(
  "collector rejects nested PID input before executing the query",
  { skip: process.platform !== "win32" },
  () => {
    const source = fs.readFileSync(
      path.join(__dirname, "w3-session.ps1"),
      "utf8",
    );
    const helper = source.match(
      /^function Get-IndependentProcessObservation\([\s\S]*?^}/m,
    )?.[0];
    const result = runWindowsPowerShell(`
    $ErrorActionPreference='Stop'
    ${helper}
    try { Get-IndependentProcessObservation @{pid=@(101,102);createdAt=@('bad','bad')}; throw 'Unexpected query' }
    catch { @{reason=$_.Exception.Message} | ConvertTo-Json -Compress }
  `);
    assert.equal(result.reason, "Known PID must be a scalar integer");
  },
);

test("supplement paths and review collision guard preserve previous evidence", () => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "apv-exit-regression-"),
  );
  try {
    for (const name of ["w3-evidence.cjs", "acceptance-verdicts.cjs"])
      fs.copyFileSync(path.join(__dirname, name), path.join(fixture, name));
    const id = crypto.randomUUID(),
      observationId = crypto.randomUUID();
    const runtime = path.join(fixture, "_runtime", `w3-cmd-${id}`);
    fs.mkdirSync(runtime, { recursive: true });
    fs.mkdirSync(path.join(fixture, "evidence"));
    fs.mkdirSync(path.join(fixture, "artifacts"));
    const bytes = Buffer.from("fixture only: never a real VSIX or Host result");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    fs.writeFileSync(
      path.join(fixture, "artifacts", "apv-sqlite-driver-spike-win32-x64.vsix"),
      bytes,
    );
    fs.writeFileSync(
      path.join(fixture, "evidence", "packaging-blocker-fix.json"),
      JSON.stringify({ packageArtifact: { sha256 } }),
    );
    fs.writeFileSync(
      path.join(runtime, "session.json"),
      JSON.stringify({ acceptanceId: id, vsixSha256: sha256 }),
    );
    const oldReceipt = path.join(fixture, "evidence", `w3-${id}-exit.json`);
    fs.writeFileSync(oldReceipt, "historical NOT TESTED fixture");
    const invoke = (args) =>
      spawnSync(
        process.execPath,
        [path.join(fixture, "w3-evidence.cjs"), ...args],
        { encoding: "utf8", timeout: 15000 },
      );
    const configured = invoke(["paths", id, "exit", observationId]);
    assert.equal(configured.status, 0, configured.stderr);
    const config = JSON.parse(configured.stdout);
    assert.equal(config.runId, `exit-${observationId}`);
    assert.equal(
      config.finalSnapshot,
      path.join(runtime, `exit-${observationId}-snapshot.json`),
    );
    assert.notEqual(config.exitReceipt, oldReceipt);
    const initial = invoke(["paths", id, "exit"]);
    assert.equal(initial.status, 0, initial.stderr);
    assert.equal(JSON.parse(initial.stdout).runId, `exit-${id}`);
    assert.equal(JSON.parse(initial.stdout).exitReceipt, oldReceipt);
    assert.equal(invoke(["paths", id, "exit", ""]).status, 1);
    fs.writeFileSync(config.exitReceipt, "prior supplement fixture");
    const collision = invoke([
      "review-exit",
      id,
      "--confirm-test-windows-closed",
      observationId,
    ]);
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /Exit review already exists/);
    assert.equal(
      fs.readFileSync(config.exitReceipt, "utf8"),
      "prior supplement fixture",
    );
    assert.equal(
      fs.readFileSync(oldReceipt, "utf8"),
      "historical NOT TESTED fixture",
    );
    assert.equal(invoke(["paths", id, "exit", id]).status, 1);
  } finally {
    // Remove only the unique temporary fixture created in this test.
    assert.equal(
      path.dirname(path.resolve(fixture)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(fixture).startsWith("apv-exit-regression-"));
    fs.rmSync(fixture, { recursive: true });
  }
});
