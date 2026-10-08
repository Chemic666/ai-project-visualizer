// Disposable evidence controller. This process never opens a database or Host.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {
  REQUIRED_CHECKS,
  summarizeChecks,
  summarizeStates,
  validIdentity,
  buildProcessLedger,
  knownExitVerdict,
  wholeExitVerdict,
} = require("./acceptance-verdicts.cjs");
const ROOT = __dirname;
const read = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeNew = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
};
function assertEvidencePath(actual, expected, label) {
  const normalize = (value) => {
    assert.equal(typeof value, "string", `${label} reference path missing`);
    assert.ok(
      path.isAbsolute(value),
      `${label} reference path must be absolute`,
    );
    if (process.platform === "win32")
      assert.ok(
        /^[a-z]:[\\/]|^[\\/]{2}[^\\/]+[\\/][^\\/]+/i.test(value),
        `${label} reference requires a full volume/share path`,
      );
    const resolved = path.resolve(value);
    // Windows drive letters have no case distinction. Keep all directory/file
    // characters exact: do not fold case-sensitive Windows directory names.
    return process.platform === "win32"
      ? resolved.replace(/^[a-z]:/i, (drive) => drive.toUpperCase())
      : resolved;
  };
  assert.equal(
    normalize(actual),
    normalize(expected),
    `${label} reference path mismatch`,
  );
}
function readRun(mode, attemptId) {
  if (attemptId !== undefined) {
    assert.equal(mode, "read", "Attempt identity is only for read retries");
    assert.match(attemptId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  }
  return attemptId === undefined ? mode : `read-${attemptId}`;
}
function paths(id) {
  assert.match(id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  const runtime = path.join(ROOT, "_runtime", `w3-cmd-${id}`);
  return {
    acceptanceId: id,
    runtime,
    profile: path.join(runtime, "user-data"),
    extensions: path.join(runtime, "extensions"),
    data: path.join(runtime, "restart-data"),
    session: path.join(runtime, "session.json"),
    vsix: path.join(
      ROOT,
      "artifacts",
      "apv-sqlite-driver-spike-win32-x64.vsix",
    ),
    receipt: (mode) => path.join(ROOT, "evidence", `w3-${id}-${mode}.json`),
    lifecycle: (mode) => path.join(runtime, `${mode}-lifecycle.json`),
  };
}
function exitPaths(p, observationId) {
  if (observationId !== undefined) {
    assert.match(
      observationId,
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    );
    assert.notEqual(
      observationId,
      p.acceptanceId,
      "Supplement needs its own execution identity",
    );
  }
  return {
    observationId: observationId ?? null,
    runId: `exit-${observationId ?? p.acceptanceId}`,
    snapshot: path.join(
      p.runtime,
      observationId
        ? `exit-${observationId}-snapshot.json`
        : "exit-snapshot.json",
    ),
    receipt: observationId
      ? p.receipt(`exit-${observationId}`)
      : p.receipt("exit"),
  };
}
function session(id) {
  const p = paths(id),
    s = read(p.session);
  assert.equal(s.acceptanceId, id);
  const packaging = read(
    path.join(ROOT, "evidence", "packaging-blocker-fix.json"),
  );
  assert.equal(hash(p.vsix), packaging.packageArtifact.sha256);
  assert.equal(s.vsixSha256, packaging.packageArtifact.sha256);
  return { p, s, packaging };
}
function reviewReceipt(id, mode, readAttemptId) {
  const { p, s } = session(id);
  const prefix = readRun(mode, readAttemptId);
  if (!fs.existsSync(p.receipt(prefix)))
    return {
      status: "NOT TESTED",
      reason: "Missing internal Host receipt",
      drivers: ["node:sqlite", "better-sqlite3"].map((candidate) => ({
        candidate,
        status: "NOT TESTED",
      })),
    };
  const r = read(p.receipt(prefix));
  assert.equal(r.source, "vscode_extension_host");
  assert.equal(r.acceptanceId, id);
  assert.equal(r.mode, mode);
  assert.equal(
    r.runId,
    readAttemptId === undefined ? `${mode}-${id}` : `read-${readAttemptId}`,
  );
  if (readAttemptId !== undefined) assert.equal(r.readAttemptId, readAttemptId);
  assert.ok(Date.parse(r.recordedAt) >= Date.parse(s.createdAt));
  assert.ok(Date.parse(r.completedAt) >= Date.parse(r.recordedAt));
  assert.ok(r.environment.electron && r.environment.vscode);
  assert.equal(r.environment.platform, "win32");
  assert.equal(r.environment.arch, "x64");
  // A real Host can report harness/setup failure before installed-path checks.
  // Keep that failure scoped to the harness; the drivers remain untested.
  if (r.harness.status !== "PASS")
    return {
      status: r.harness.status === "FAIL" ? "FAIL" : "NOT TESTED",
      harness: r.harness,
      drivers: ["node:sqlite", "better-sqlite3"].map((candidate) => ({
        candidate,
        status: "NOT TESTED",
      })),
      receipt: r,
    };
  assert.equal(r.loadedFromInstalledDirectory, true);
  assert.equal(r.vsixSha256, s.vsixSha256);
  assert.ok(validIdentity(r.hostProcessIdentity));
  assert.equal(r.hostProcessIdentity.pid, r.environment.pid);
  const drivers = ["node:sqlite", "better-sqlite3"].map((candidate) => {
    const result = r.candidates.find((item) => item.candidate === candidate);
    const basic = summarizeChecks(result?.checks, REQUIRED_CHECKS);
    return {
      candidate,
      status: summarizeStates([basic, result?.status ?? "NOT TESTED"]),
      checks: result?.checks,
      limitations: result?.limitations ?? [],
    };
  });
  assert.equal(
    r.status,
    summarizeStates(drivers.map((driver) => driver.status)),
  );
  return { status: r.status, drivers, receipt: r };
}
// Read-only gate shared by the launcher and the external Installed Host runner.
// Explicit selection is mandatory; never scan for a newer receipt.
function reviewExitForRead(id, observationId) {
  assert.ok(observationId, "Read requires an explicit exit ObservationId");
  const { p } = session(id);
  const selected = exitPaths(p, observationId);
  const receiptBytes = fs.readFileSync(selected.receipt);
  const receipt = JSON.parse(
    receiptBytes.toString("utf8").replace(/^\uFEFF/, ""),
  );
  assert.equal(receipt.acceptanceId, id);
  assert.equal(receipt.observationId, observationId);
  assert.equal(receipt.runId, selected.runId);
  assert.equal(receipt.source, "operator_confirmation_with_cim_observations");
  assert.equal(receipt.status, "PASS WITH LIMITATION");
  assert.equal(receipt.automaticStatus, "NOT TESTED");
  assert.equal(receipt.knownSet?.status, "PASS");
  assert.equal(
    receipt.method,
    "manual_confirmation_with_sampled_process_tracking",
  );
  const expected = {
    snapshot: selected.snapshot,
    writer: p.receipt("write"),
    lifecycle: p.lifecycle("write"),
  };
  if (fs.existsSync(p.receipt("exit")))
    expected.previousExit = p.receipt("exit");
  for (const [name, file] of Object.entries(expected)) {
    const reference = receipt.evidenceReferences?.[name];
    assertEvidencePath(reference?.path, file, name);
    assert.equal(
      reference.sha256,
      hash(file),
      `${name} reference hash mismatch`,
    );
  }
  // Validate an optional recorded reference too, even if its file was removed.
  if (receipt.evidenceReferences?.previousExit && !expected.previousExit)
    throw new Error("Referenced previous exit evidence missing");
  const writer = reviewReceipt(id, "write");
  assert.equal(writer.status, "PASS");
  assert.equal(receipt.writerRunId, writer.receipt.runId);
  assert.deepEqual(receipt.writerIdentity, writer.receipt.hostProcessIdentity);
  const lifecycle = read(expected.lifecycle),
    final = read(expected.snapshot);
  assert.equal(lifecycle.acceptanceId, id);
  assert.equal(lifecycle.runId, receipt.writerRunId);
  assert.equal(lifecycle.source, "windows_cim_lifecycle_collector");
  assert.equal(final.acceptanceId, id);
  assert.equal(final.observationId, observationId);
  assert.equal(final.runId, selected.runId);
  assert.equal(
    final.source,
    "windows_cim_and_process_handle_post_writer_observation",
  );
  assert.ok(
    Date.parse(final.snapshot.recordedAt) >=
      Date.parse(writer.receipt.completedAt),
  );
  assert.ok(
    Date.parse(final.createdAt) >= Date.parse(final.snapshot.recordedAt),
  );
  assert.ok(Array.isArray(final.requiredIdentityChecks));
  for (const check of final.requiredIdentityChecks) {
    assert.ok(
      Date.parse(check.observedAt) >= Date.parse(final.snapshot.recordedAt),
    );
    assert.ok(Date.parse(check.completedAt) <= Date.parse(final.createdAt));
  }
  assert.equal(
    receipt.confirmation?.source,
    "operator_explicit_command_confirmation",
  );
  assert.ok(
    Date.parse(receipt.confirmation.confirmedAt) >= Date.parse(final.createdAt),
  );
  assert.ok(
    Date.parse(receipt.createdAt) >=
      Date.parse(receipt.confirmation.confirmedAt),
  );
  const ledger = buildProcessLedger({
    ...lifecycle,
    samples: [...lifecycle.samples, final.snapshot],
  });
  const knownSet = knownExitVerdict({
    ...ledger,
    receiptValid:
      writer.receipt.hostProcessIdentity.pid === lifecycle.host?.pid &&
      writer.receipt.hostProcessIdentity.createdAt ===
        lifecycle.host?.createdAt &&
      writer.receipt.hostProcessIdentity.parentPid ===
        lifecycle.host?.parentPid,
    current: {
      ...final.snapshot,
      requiredIdentityChecks: final.requiredIdentityChecks,
    },
  });
  assert.deepEqual(receipt.knownSet, knownSet);
  assert.deepEqual(receipt.knownProcesses, ledger.known);
  assert.deepEqual(receipt.ambiguousProcesses, ledger.ambiguous);
  assert.deepEqual(receipt.informationGaps, ledger.informationGaps);
  const verdict = wholeExitVerdict(knownSet, receipt.confirmation);
  assert.equal(verdict.status, "PASS WITH LIMITATION");
  assert.deepEqual(receipt.limitations, verdict.limitations);
  return {
    status: receipt.status,
    acceptanceId: id,
    observationId,
    runId: selected.runId,
    receiptPath: selected.receipt,
    sha256: crypto.createHash("sha256").update(receiptBytes).digest("hex"),
    writerRunId: receipt.writerRunId,
    receipt,
  };
}
// Preparation/receipt audit only: no Host, driver load, database or process IO.
function prepareFinalAudit(id, exitObservationId, readAttemptId) {
  assert.ok(
    exitObservationId && readAttemptId,
    "Audit requires explicit Exit Observation ID and ReadAttempt ID",
  );
  const { p, s, packaging } = session(id);
  const selectedExit = exitPaths(p, exitObservationId),
    readPrefix = readRun("read", readAttemptId);
  const selectedFiles = new Set([
    p.session,
    p.vsix,
    path.join(ROOT, "evidence/packaging-blocker-fix.json"),
    p.receipt("baseline"),
    p.receipt("install"),
    selectedExit.receipt,
    selectedExit.snapshot,
  ]);
  for (const prefix of ["probe", "write", readPrefix]) {
    selectedFiles.add(p.receipt(prefix));
    for (const suffix of ["lifecycle", "host-start", "host-ack"])
      selectedFiles.add(path.join(p.runtime, `${prefix}-${suffix}.json`));
  }
  const stages = {};
  const check = (name, run) => {
    try {
      stages[name] = run();
    } catch (error) {
      stages[name] = { status: "NOT TESTED", reason: error.message };
    }
    return stages[name];
  };
  const ref = (file) => ({ file, sha256: hash(file) });
  check("A_baseline", () => {
    const r = read(p.receipt("baseline"));
    assert.equal(s.source, "ordinary_node_acceptance_setup");
    assert.equal(r.acceptanceId, id);
    assert.equal(r.runId, `baseline-${id}`);
    assert.equal(r.source, "windows_cim_pre_install_baseline");
    assertEvidencePath(r.isolatedProfile, p.profile, "baseline profile");
    assert.equal(r.snapshot?.readable, true);
    assert.ok(Array.isArray(r.snapshot.processes));
    assert.ok(Date.parse(r.snapshot.recordedAt) >= Date.parse(s.createdAt));
    assert.ok(Date.parse(r.createdAt) >= Date.parse(r.snapshot.recordedAt));
    return { status: "PASS", evidence: ref(p.receipt("baseline")) };
  });
  const installation = check("A_install", () => {
    const r = read(p.receipt("install"));
    assert.equal(r.status, "PASS");
    assert.equal(r.acceptanceId, id);
    assert.equal(r.runId, `install-${id}`);
    assert.equal(r.source, "ordinary_node_installed_file_audit");
    assert.equal(r.scope, "installation_integrity_only");
    assert.equal(r.vsixSha256, s.vsixSha256);
    assert.equal(packaging.status, "PASS");
    assert.equal(packaging.archiveAudit.status, "PASS");
    assert.ok(
      Date.parse(r.createdAt) >=
        Date.parse(read(p.receipt("baseline")).createdAt),
    );
    const directories = fs
      .readdirSync(p.extensions)
      .filter((name) =>
        name.startsWith("apv-disposable-spike.apv-sqlite-driver-spike-"),
      );
    assert.equal(directories.length, 1);
    const installed = path.join(p.extensions, directories[0]),
      manifest = read(path.join(installed, "package.json"));
    assert.equal(manifest.name, "apv-sqlite-driver-spike");
    assert.equal(manifest.publisher, "apv-disposable-spike");
    assert.equal(manifest.version, "0.0.0");
    assert.equal(
      read(path.join(installed, "node_modules/better-sqlite3/package.json"))
        .version,
      "13.0.3",
    );
    const expected = {
      "extension.cjs":
        "bd27c40141151adea54bf6ced7134942df0f332897e32b1c4522f0912d554610",
      "probe.cjs":
        "c2f55c715312cde972d59bf05509f8041246f4fc4d2334acc0cf78f7c09c85ba",
      "node_modules/better-sqlite3/prebuilds/win32-x64.node":
        packaging.archiveAudit.nativeSha256,
    };
    assert.deepEqual(r.runtimeHashes, expected);
    for (const [file, sha256] of Object.entries(expected))
      assert.equal(
        hash(path.join(installed, file)),
        sha256,
        `Installed ${file} hash mismatch`,
      );
    return {
      status: "PASS",
      evidence: ref(p.receipt("install")),
      extensionDirectory: directories[0],
      runtimeHashes: expected,
      vsixSha256: s.vsixSha256,
    };
  });
  function hostStage(mode, prefix, attempt) {
    const result = reviewReceipt(id, mode, attempt);
    // Retain executed Host/driver failures; missing bindings cannot erase FAIL.
    if (!["PASS", "PASS WITH LIMITATION"].includes(result.status))
      return result;
    const r = result.receipt;
    assert.equal(
      installation.status,
      "PASS",
      "Installation evidence not validated",
    );
    assert.equal(r.extensionDirectory, installation.extensionDirectory);
    assert.deepEqual(r.runtimeHashes, {
      "extension.cjs": installation.runtimeHashes["extension.cjs"],
      "probe.cjs": installation.runtimeHashes["probe.cjs"],
    });
    assert.equal(r.nativeSha256, packaging.archiveAudit.nativeSha256);
    assert.equal(r.hostProbe?.activation, "PASS");
    assert.equal(r.hostProbe.scope, "installed_extension_host");
    assert.equal(r.hostProbe.environment.pid, r.environment.pid);
    const lifecycleFile = path.join(p.runtime, `${prefix}-lifecycle.json`),
      life = read(lifecycleFile);
    const startFile = path.join(p.runtime, `${prefix}-host-start.json`),
      start = read(startFile);
    const ackFile = path.join(p.runtime, `${prefix}-host-ack.json`),
      ack = read(ackFile);
    assert.equal(life.acceptanceId, id);
    assert.equal(life.runId, r.runId);
    assert.equal(life.source, "windows_cim_lifecycle_collector");
    assertEvidencePath(life.isolatedProfile, p.profile, "Host profile");
    assert.equal(life.baseline?.readable, true);
    assert.ok(validIdentity(life.root));
    assert.deepEqual(life.host, r.hostProcessIdentity);
    assert.ok(
      !life.timedOut && !life.launchError && !life.handshakeError,
      "Host lifecycle observation interrupted",
    );
    assert.ok(Date.parse(life.baseline.recordedAt) >= Date.parse(s.createdAt));
    assert.ok(Date.parse(life.completedAt) >= Date.parse(r.completedAt));
    assert.equal(start.source, "vscode_extension_host");
    assert.equal(ack.source, "windows_cim_collector");
    for (const item of [start, ack]) {
      assert.equal(item.acceptanceId, id);
      assert.equal(item.runId, r.runId);
    }
    assert.equal(start.pid, r.environment.pid);
    assert.equal(start.parentPid, r.hostProcessIdentity.parentPid);
    assert.deepEqual(ack.process, r.hostProcessIdentity);
    assert.ok(Date.parse(ack.recordedAt) >= Date.parse(start.recordedAt));
    assert.ok(Date.parse(ack.recordedAt) <= Date.parse(r.completedAt));
    return {
      ...result,
      evidence: ref(p.receipt(prefix)),
      collection: [ref(lifecycleFile), ref(startFile), ref(ackFile)],
    };
  }
  const probe = check("BC_installedHost", () => hostStage("probe", "probe"));
  const writer = check("D_writer", () => hostStage("write", "write"));
  const exit = check("E_exit", () => reviewExitForRead(id, exitObservationId));
  const reader = check("F_reader", () =>
    hostStage("read", readPrefix, readAttemptId),
  );
  check("F_persistenceBindings", () => {
    assert.equal(probe.status, "PASS");
    assert.equal(writer.status, "PASS");
    assert.equal(exit.status, "PASS WITH LIMITATION");
    assert.equal(reader.status, "PASS WITH LIMITATION");
    const w = writer.receipt,
      r = reader.receipt,
      bound = r.writerExitReceipt;
    assert.equal(bound.acceptanceId, id);
    assert.equal(bound.observationId, exitObservationId);
    assert.equal(bound.runId, exit.runId);
    assertEvidencePath(
      bound.receiptPath,
      exit.receiptPath,
      "Reader selected exit",
    );
    assert.equal(bound.sha256, exit.sha256);
    assert.equal(bound.status, exit.status);
    assert.equal(bound.method, exit.receipt.method);
    assert.equal(bound.writerRunId, w.runId);
    assert.deepEqual(bound.writerIdentity, w.hostProcessIdentity);
    assert.deepEqual(bound.limitations, exit.receipt.limitations);
    assert.notEqual(
      r.environment.pid,
      w.environment.pid,
      "Reader must be a different Host PID",
    );
    assert.notEqual(
      r.hostProcessIdentity.createdAt,
      w.hostProcessIdentity.createdAt,
    );
    assert.ok(
      Date.parse(r.hostProcessIdentity.createdAt) >=
        Date.parse(exit.receipt.createdAt),
    );
    assert.ok(Date.parse(r.recordedAt) >= Date.parse(exit.receipt.createdAt));
    assert.ok(
      Date.parse(
        read(path.join(p.runtime, `${readPrefix}-lifecycle.json`)).baseline
          .recordedAt,
      ) >= Date.parse(exit.receipt.createdAt),
    );
    assert.equal(r.vsixSha256, w.vsixSha256);
    assert.equal(r.nativeSha256, w.nativeSha256);
    for (const name of ["node:sqlite", "better-sqlite3"]) {
      const written = w.candidates.find((c) => c.candidate === name),
        restored = r.candidates.find((c) => c.candidate === name);
      assert.equal(written.status, "PASS");
      assert.equal(restored.status, "PASS WITH LIMITATION");
      for (const c of [written, restored]) {
        assert.equal(c.marker, id);
        assert.equal(c.writerPid, w.environment.pid);
        assert.equal(c.writerRunId, w.runId);
      }
      assert.equal(written.pid, w.environment.pid);
      assert.equal(restored.pid, r.environment.pid);
      for (const limit of exit.receipt.limitations)
        assert.ok(
          restored.limitations.includes(limit),
          "Reader lost exit limitation",
        );
    }
    return {
      status: "PASS WITH LIMITATION",
      writerIdentity: w.hostProcessIdentity,
      readerIdentity: r.hostProcessIdentity,
      writerRunId: w.runId,
      readerRunId: r.runId,
    };
  });
  const history = { status: "PASS", entries: [] };
  for (const directory of [path.join(ROOT, "evidence"), p.runtime]) {
    for (const name of fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort()) {
      const file = path.join(directory, name),
        entry = {
          ...ref(file),
          selectionRole: selectedFiles.has(file)
            ? "selected_evidence"
            : "historical_nonselected",
        };
      try {
        const r = read(file);
        Object.assign(entry, {
          reportedStatus: r.status ?? null,
          acceptanceId: r.acceptanceId ?? null,
          runId: r.runId ?? null,
          source: r.source ?? null,
          harness: r.harness ?? null,
          reason: r.reason ?? null,
          limitations: r.limitations ?? [],
          drivers:
            r.candidates?.map((c) => ({
              candidate: c.candidate,
              status: c.status,
              error: c.error ?? null,
              limitations: c.limitations ?? [],
            })) ?? [],
        });
      } catch (error) {
        history.status = "NOT TESTED";
        entry.readError = error.message;
      }
      history.entries.push(entry);
    }
  }
  const limitations = [
    ...new Set([
      "Whole-instance exit remains manually confirmed with sampled tracking; automatic exit status is NOT TESTED",
      "Two connections in one process do not verify multi-process contention or crash recovery",
      ...(exit.receipt?.limitations ?? []),
      ...(reader.drivers ?? []).flatMap((d) => d.limitations ?? []),
    ]),
  ];
  const status = summarizeStates([
    ...Object.values(stages).map((s) => s.status),
    history.status,
  ]);
  const drivers = ["node:sqlite", "better-sqlite3"].map((candidate) => {
    const reports = [probe, writer, reader].map((stage) =>
      stage.drivers?.find((d) => d.candidate === candidate),
    );
    const operationsStatus = summarizeStates(
      reports.map((r) => r?.status ?? "NOT TESTED"),
    );
    return {
      candidate,
      reportedReadStatus: reports[2]?.status ?? "NOT TESTED",
      operationsStatus,
      restartAcceptanceStatus:
        operationsStatus === "FAIL"
          ? "FAIL"
          : status === "PASS WITH LIMITATION"
            ? "PASS WITH LIMITATION"
            : "NOT TESTED",
      limitations: [...new Set(reports.flatMap((r) => r?.limitations ?? []))],
    };
  });
  return {
    acceptanceId: id,
    selection: {
      exitObservationId,
      readAttemptId,
      exitReceipt: selectedExit.receipt,
      readReceipt: p.receipt(readPrefix),
    },
    status: status === "PASS" ? "PASS WITH LIMITATION" : status,
    stages,
    history,
    limitations,
    drivers,
    artifact: {
      ...ref(p.vsix),
      nativeSha256: packaging.archiveAudit.nativeSha256,
    },
    verifiedScope: {
      platform: "win32",
      arch: "x64",
      readerEnvironment: reader.receipt?.environment ?? null,
      storage:
        "Disposable GUID record across distinct Installed Extension Hosts",
      databasePath: path.join(p.data, "<candidate>", "unique-restart.sqlite"),
      automaticWholeInstanceExit: "NOT TESTED",
    },
    notVerified: [
      "Multi-process contention, process crash/power-loss recovery",
      "Production schema, migrations, snapshot/cursor atomic recovery",
      "Other Node/VS Code versions, Windows ARM64, Linux/macOS",
      "Remote SSH/WSL/container/web Extension Hosts",
    ],
    decisionAccepted: false,
  };
}
function main() {
  const [action, id, mode, observationId, readAttemptId, ...extra] =
    process.argv.slice(2);
  assert.equal(extra.length, 0, "Unexpected arguments");
  if (readAttemptId !== undefined)
    assert.ok(
      action === "paths" && mode === "read",
      "Read attempt identity is only for read launch configuration",
    );
  if (observationId)
    assert.ok(
      action === "audit" ||
        action === "review-exit" ||
        (action === "paths" && ["exit", "read"].includes(mode)),
      "Supplemental identity is only for exit evidence",
    );
  if (action === "init") {
    const guid = crypto.randomUUID(),
      p = paths(guid);
    const packaging = read(
      path.join(ROOT, "evidence", "packaging-blocker-fix.json"),
    );
    assert.equal(hash(p.vsix), packaging.packageArtifact.sha256);
    fs.mkdirSync(path.dirname(p.runtime), { recursive: true });
    fs.mkdirSync(p.runtime); // A new namespace must not pre-exist.
    writeNew(p.session, {
      acceptanceId: guid,
      createdAt: new Date().toISOString(),
      source: "ordinary_node_acceptance_setup",
      vsixSha256: hash(p.vsix),
    });
    console.log(guid);
    return;
  }
  const { p, s, packaging } = session(id);
  if (action === "check-exit") {
    console.log(JSON.stringify(reviewExitForRead(id, mode), null, 2));
    return;
  }
  if (action === "check-read") {
    assert.ok(mode, "Explicit ReadAttemptId required");
    const result = reviewReceipt(id, "read", mode);
    console.log(
      JSON.stringify(
        { acceptanceId: id, readAttemptId: mode, ...result },
        null,
        2,
      ),
    );
    if (!["PASS", "PASS WITH LIMITATION"].includes(result.status))
      process.exitCode = 1;
    return;
  }
  if (action === "paths") {
    assert.ok(["probe", "write", "read", "baseline", "exit"].includes(mode));
    const exit = exitPaths(p, observationId);
    const readProof =
      mode === "read" ? reviewExitForRead(id, observationId) : null;
    const prefix = readRun(mode, readAttemptId);
    console.log(
      JSON.stringify({
        ...p,
        createdAt: s.createdAt,
        runId:
          mode === "exit"
            ? exit.runId
            : readAttemptId === undefined
              ? `${mode}-${id}`
              : `read-${readAttemptId}`,
        readAttemptId: readAttemptId ?? null,
        logPrefix: prefix,
        receipt: p.receipt(prefix),
        lifecycle: p.lifecycle(prefix),
        hostStart: path.join(p.runtime, `${prefix}-host-start.json`),
        hostAck: path.join(p.runtime, `${prefix}-host-ack.json`),
        writeReceipt: p.receipt("write"),
        exitReceipt: exit.receipt,
        exitObservationId: readProof?.observationId ?? null,
        exitReceiptSha256: readProof?.sha256 ?? null,
        finalSnapshot: exit.snapshot,
      }),
    );
    return;
  }
  if (action === "check-install") {
    const directories = fs
      .readdirSync(p.extensions)
      .filter((name) =>
        name.startsWith("apv-disposable-spike.apv-sqlite-driver-spike-"),
      );
    assert.equal(directories.length, 1);
    const installed = path.join(p.extensions, directories[0]);
    const manifest = read(path.join(installed, "package.json"));
    assert.equal(manifest.name, "apv-sqlite-driver-spike");
    assert.equal(manifest.publisher, "apv-disposable-spike");
    assert.equal(manifest.version, "0.0.0");
    const expected = {
      "extension.cjs":
        "bd27c40141151adea54bf6ced7134942df0f332897e32b1c4522f0912d554610",
      "probe.cjs":
        "c2f55c715312cde972d59bf05509f8041246f4fc4d2334acc0cf78f7c09c85ba",
      "node_modules/better-sqlite3/prebuilds/win32-x64.node":
        packaging.archiveAudit.nativeSha256,
    };
    for (const [file, expectedHash] of Object.entries(expected))
      assert.equal(hash(path.join(installed, file)), expectedHash);
    writeNew(p.receipt("install"), {
      acceptanceId: id,
      runId: `install-${id}`,
      createdAt: new Date().toISOString(),
      source: "ordinary_node_installed_file_audit",
      scope: "installation_integrity_only",
      status: "PASS",
      vsixSha256: s.vsixSha256,
      runtimeHashes: expected,
      hostStatus: "NOT TESTED",
    });
    console.log("Installation integrity PASS; Host not tested");
    return;
  }
  if (action === "check") {
    assert.ok(["probe", "write", "read"].includes(mode));
    const result = reviewReceipt(id, mode);
    console.log(JSON.stringify({ mode, acceptanceId: id, ...result }, null, 2));
    if (!["PASS", "PASS WITH LIMITATION"].includes(result.status))
      process.exitCode = 1;
    return;
  }
  if (action === "review-exit") {
    assert.ok(
      mode === undefined || mode === "--confirm-test-windows-closed",
      "Unknown exit confirmation flag",
    );
    const exit = exitPaths(p, observationId);
    assert.ok(
      !fs.existsSync(exit.receipt),
      "Exit review already exists; use a new ObservationId, never overwrite evidence",
    );
    const lifecycle = read(p.lifecycle("write"));
    assert.equal(lifecycle.acceptanceId, id);
    assert.equal(lifecycle.runId, `write-${id}`);
    assert.equal(lifecycle.source, "windows_cim_lifecycle_collector");
    const final = read(exit.snapshot);
    assert.equal(final.acceptanceId, id);
    assert.equal(final.observationId ?? null, exit.observationId);
    assert.equal(final.runId, exit.runId);
    assert.equal(
      final.source,
      "windows_cim_and_process_handle_post_writer_observation",
    );
    const writer = reviewReceipt(id, "write");
    assert.ok(
      Date.parse(final.snapshot.recordedAt) >=
        Date.parse(writer.receipt.completedAt),
      "Exit observation must follow the actual writer completion",
    );
    assert.ok(
      Date.parse(final.createdAt) >= Date.parse(final.snapshot.recordedAt),
    );
    assert.ok(
      Array.isArray(final.requiredIdentityChecks),
      "Independent query results missing",
    );
    for (const check of final.requiredIdentityChecks) {
      assert.ok(
        Date.parse(check.observedAt) >= Date.parse(final.snapshot.recordedAt),
        "Independent query predates this observation",
      );
      assert.ok(
        Date.parse(check.completedAt) <= Date.parse(final.createdAt),
        "Independent query completion outside this observation",
      );
    }
    const ledger = buildProcessLedger({
      ...lifecycle,
      samples: [...lifecycle.samples, final.snapshot],
    });
    const receiptValid =
      writer.status === "PASS" &&
      validIdentity(writer.receipt?.hostProcessIdentity) &&
      writer.receipt.hostProcessIdentity.pid === lifecycle.host?.pid &&
      writer.receipt.hostProcessIdentity.createdAt ===
        lifecycle.host?.createdAt &&
      writer.receipt.hostProcessIdentity.parentPid ===
        lifecycle.host?.parentPid;
    const knownSet = knownExitVerdict({
      ...ledger,
      receiptValid,
      current: {
        ...final.snapshot,
        requiredIdentityChecks: final.requiredIdentityChecks,
      },
    });
    const confirmation =
      mode === "--confirm-test-windows-closed"
        ? {
            windowsClosed: true,
            confirmedAt: new Date().toISOString(),
            source: "operator_explicit_command_confirmation",
          }
        : null;
    const verdict = wholeExitVerdict(knownSet, confirmation);
    const result = {
      ...verdict,
      acceptanceId: id,
      runId: exit.runId,
      observationId: exit.observationId,
      createdAt: new Date().toISOString(),
      source: "operator_confirmation_with_cim_observations",
      writerRunId: `write-${id}`,
      writerIdentity: writer.receipt?.hostProcessIdentity ?? null,
      knownSet,
      knownProcesses: ledger.known,
      ambiguousProcesses: ledger.ambiguous,
      informationGaps: ledger.informationGaps,
      observedSnapshotCount: lifecycle.samples.length + 1,
      evidenceReferences: {
        snapshot: { path: exit.snapshot, sha256: hash(exit.snapshot) },
        writer: { path: p.receipt("write"), sha256: hash(p.receipt("write")) },
        lifecycle: {
          path: p.lifecycle("write"),
          sha256: hash(p.lifecycle("write")),
        },
        previousExit:
          observationId && fs.existsSync(p.receipt("exit"))
            ? { path: p.receipt("exit"), sha256: hash(p.receipt("exit")) }
            : null,
      },
    };
    writeNew(exit.receipt, result);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "PASS WITH LIMITATION") process.exitCode = 1;
    return;
  }
  if (action === "exit-identities") {
    const lifecycle = read(p.lifecycle("write"));
    assert.equal(lifecycle.acceptanceId, id);
    assert.equal(lifecycle.runId, `write-${id}`);
    console.log(JSON.stringify(buildProcessLedger(lifecycle).known));
    return;
  }
  if (action === "audit") {
    const prepared = prepareFinalAudit(id, mode, observationId),
      auditId = crypto.randomUUID();
    const reportPath = p.receipt(`summary-${auditId}`);
    const result = {
      ...prepared,
      runId: `audit-${auditId}`,
      createdAt: new Date().toISOString(),
      source: "ordinary_node_receipt_audit_not_host_execution",
      reportPath,
    };
    writeNew(reportPath, result);
    console.log(JSON.stringify(result, null, 2));
    if (!["PASS", "PASS WITH LIMITATION"].includes(result.status))
      process.exitCode = 1;
    return;
  }
  throw new Error("Unknown disposable evidence action");
}
module.exports = { reviewExitForRead, assertEvidencePath, prepareFinalAudit };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "ordinary_node_evidence_controller",
        status: "NOT TESTED",
        reason: error.message,
        driverConclusion: "No conclusion fabricated",
      }),
    );
    process.exitCode = 1;
  }
}
