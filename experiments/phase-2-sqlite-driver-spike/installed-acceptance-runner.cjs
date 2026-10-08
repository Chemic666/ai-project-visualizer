// Disposable --extensionTestsPath runner. Execute only inside VS Code's Host.
// Uses the already-audited VSIX; no production or installed-extension edits.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vscode = require("vscode");
const {
  REQUIRED_CHECKS,
  summarizeChecks,
  summarizeStates,
  validIdentity,
} = require("./acceptance-verdicts.cjs");
const { reviewExitForRead, assertEvidencePath } = require("./w3-evidence.cjs");

const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function errorData(error) {
  let message = String(error.message).split("\n")[0];
  for (const root of [__dirname, process.env.USERPROFILE].filter(Boolean))
    message = message.split(root).join("<LOCAL_PATH>");
  return { code: error.code ?? error.name, message };
}

exports.run = async function () {
  const mode = process.env.APV_SPIKE_MODE;
  const destination = process.env.APV_SPIKE_EVIDENCE;
  assert.ok(destination, "Explicit evidence path required");
  assert.ok(!fs.existsSync(destination), "Do not overwrite an earlier receipt");
  const report = {
    scope: "installed_vsix_acceptance",
    mode,
    runId: process.env.APV_SPIKE_RUN_ID,
    recordedAt: new Date().toISOString(),
    status: "NOT TESTED",
    environment: {
      vscode: vscode.version,
      node: process.version,
      electron: process.versions.electron ?? null,
      modules: process.versions.modules,
      napi: process.versions.napi,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      remoteName: vscode.env.remoteName ?? null,
    },
    source: "vscode_extension_host",
    acceptanceId: process.env.APV_SPIKE_MARKER,
    readAttemptId:
      mode === "read" ? (process.env.APV_SPIKE_READ_ATTEMPT_ID ?? null) : null,
    harness: { status: "NOT TESTED" },
    candidates: ["node:sqlite", "better-sqlite3"].map((candidate) => ({
      candidate,
      status: "NOT TESTED",
    })),
  };
  try {
    assert.ok(["probe", "write", "read"].includes(mode));
    assert.ok(report.environment.electron, "Actual Electron Host required");
    assert.equal(report.environment.platform, "win32");
    assert.ok(report.runId, "Run ID required");
    assert.match(
      report.acceptanceId,
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    );
    if (report.readAttemptId) {
      assert.match(
        report.readAttemptId,
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      );
      assert.equal(report.runId, `read-${report.readAttemptId}`);
    } else assert.equal(report.runId, `${mode}-${report.acceptanceId}`);
    // Keep this Host alive until the external collector reads its CIM identity.
    fs.writeFileSync(
      process.env.APV_SPIKE_HOST_START,
      JSON.stringify({
        source: "vscode_extension_host",
        runId: report.runId,
        acceptanceId: report.acceptanceId,
        recordedAt: new Date().toISOString(),
        pid: process.pid,
        parentPid: process.ppid,
      }),
      { flag: "wx" },
    );
    const deadline = performance.now() + 30000;
    while (
      !fs.existsSync(process.env.APV_SPIKE_HOST_ACK) &&
      performance.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    const ack = readJson(process.env.APV_SPIKE_HOST_ACK);
    assert.equal(ack.source, "windows_cim_collector");
    assert.equal(ack.runId, report.runId);
    assert.equal(ack.acceptanceId, report.acceptanceId);
    assert.ok(validIdentity(ack.process));
    assert.equal(ack.process.pid, process.pid);
    report.hostProcessIdentity = ack.process;
    const extension = vscode.extensions.getExtension(
      "apv-disposable-spike.apv-sqlite-driver-spike",
    );
    assert.ok(extension, "Disposable installed extension not found");
    const installedRoot = fs.realpathSync(process.env.APV_SPIKE_INSTALLED_ROOT);
    const extensionRoot = fs.realpathSync(extension.extensionPath);
    const relative = path.relative(installedRoot, extensionRoot);
    assert.ok(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative),
      "Extension must load from the isolated installed directory",
    );
    report.loadedFromInstalledDirectory = true;
    report.extensionDirectory = relative;
    const manifest = readJson(path.join(extensionRoot, "package.json"));
    assert.equal(manifest.version, "0.0.0");
    report.vsixSha256 = hash(process.env.APV_SPIKE_VSIX);
    const packaging = readJson(
      path.join(__dirname, "evidence", "packaging-blocker-fix.json"),
    );
    assert.equal(report.vsixSha256, packaging.packageArtifact.sha256);
    report.nativeSha256 = hash(
      path.join(
        extensionRoot,
        packaging.archiveAudit.nativeFile.replace(/^extension\//, ""),
      ),
    );
    assert.equal(report.nativeSha256, packaging.archiveAudit.nativeSha256);
    // These must be the bytes audited in the VSIX, not a development copy.
    report.runtimeHashes = {};
    const auditedRuntimeHashes = {
      "extension.cjs":
        "bd27c40141151adea54bf6ced7134942df0f332897e32b1c4522f0912d554610",
      "probe.cjs":
        "c2f55c715312cde972d59bf05509f8041246f4fc4d2334acc0cf78f7c09c85ba",
    };
    for (const file of ["extension.cjs", "probe.cjs"])
      assert.equal(
        (report.runtimeHashes[file] = hash(path.join(extensionRoot, file))),
        auditedRuntimeHashes[file],
        "Installed runtime differs from the audited VSIX",
      );
    const api = await extension.activate();
    report.hostProbe = await api.run("probe");
    assert.equal(report.hostProbe.activation, "PASS");
    assert.equal(report.hostProbe.environment.pid, process.pid);
    assert.notEqual(report.hostProbe.scope, "development_extension_host");
    report.harness.status = "PASS";
    let priorWrite;
    let exit;
    if (mode === "read") {
      priorWrite = readJson(process.env.APV_SPIKE_WRITE_EVIDENCE);
      const selected = reviewExitForRead(
        report.acceptanceId,
        process.env.APV_SPIKE_EXIT_OBSERVATION_ID,
      );
      assertEvidencePath(
        selected.receiptPath,
        process.env.APV_SPIKE_EXIT_EVIDENCE,
        "Selected exit receipt",
      );
      assert.equal(
        selected.sha256,
        process.env.APV_SPIKE_EXIT_SHA256,
        "Selected exit proof changed after pre-launch validation",
      );
      exit = selected.receipt;
      assert.equal(priorWrite.status, "PASS");
      assert.equal(priorWrite.source, "vscode_extension_host");
      assert.equal(priorWrite.mode, "write");
      assert.equal(priorWrite.acceptanceId, report.acceptanceId);
      assert.equal(priorWrite.runId, `write-${report.acceptanceId}`);
      assert.equal(priorWrite.loadedFromInstalledDirectory, true);
      assert.equal(priorWrite.vsixSha256, report.vsixSha256);
      assert.equal(exit.acceptanceId, report.acceptanceId);
      assert.equal(exit.writerRunId, priorWrite.runId);
      assert.deepEqual(exit.writerIdentity, priorWrite.hostProcessIdentity);
      assert.equal(exit.status, "PASS WITH LIMITATION");
      assert.equal(
        exit.method,
        "manual_confirmation_with_sampled_process_tracking",
      );
      assert.equal(exit.automaticStatus, "NOT TESTED");
      assert.equal(exit.knownSet.status, "PASS");
      assert.equal(exit.confirmation.windowsClosed, true);
      assert.ok(
        Date.parse(exit.confirmation.confirmedAt) >=
          Date.parse(priorWrite.completedAt),
      );
      assert.notEqual(priorWrite.environment.pid, process.pid);
      report.writerExitReceipt = {
        acceptanceId: report.acceptanceId,
        observationId: selected.observationId,
        runId: selected.runId,
        receiptPath: selected.receiptPath,
        sha256: selected.sha256,
        status: exit.status,
        method: exit.method,
        writerRunId: exit.writerRunId,
        writerIdentity: exit.writerIdentity,
        limitations: exit.limitations,
      };
    }
    for (const result of report.candidates) {
      const { candidate } = result;
      try {
        const probe = report.hostProbe.candidates.find(
          (item) => item.candidate === candidate,
        );
        assert.ok(probe);
        result.checks = probe.tests;
        result.failedChecks = Object.keys(probe.tests).filter(
          (name) => probe.tests[name].status === "FAIL",
        );
        result.limitations = Object.values(probe.tests)
          .map((test) => test.details?.limitation)
          .filter(Boolean);
        result.status = summarizeChecks(probe.tests, REQUIRED_CHECKS);
        if (result.status !== "PASS") continue;
        if (candidate === "better-sqlite3") {
          assert.equal(probe.observedDriverVersion, "13.0.3");
          assert.ok(
            probe.nativeLoads.some(
              (load) => load.sha256 === report.nativeSha256,
            ),
          );
        }
        if (mode !== "probe") {
          const marker = process.env.APV_SPIKE_MARKER;
          assert.match(marker, /^[0-9a-f-]{36}$/i);
          const databaseFile = path.join(
            process.env.APV_SPIKE_DATA,
            candidate.replace(":", "-"),
            "unique-restart.sqlite",
          );
          if (mode === "read") {
            assert.ok(
              fs.existsSync(databaseFile),
              "Prior write database missing",
            );
          } else fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
          const Database =
            candidate === "node:sqlite"
              ? require("node:sqlite").DatabaseSync
              : require(
                  path.join(extensionRoot, "node_modules", "better-sqlite3"),
                );
          const db = new Database(databaseFile);
          try {
            if (mode === "write") {
              db.exec(
                "CREATE TABLE IF NOT EXISTS spike_acceptance(marker TEXT PRIMARY KEY, writer_pid INTEGER NOT NULL, writer_run_id TEXT NOT NULL, vsix_hash TEXT NOT NULL)",
              );
              db.prepare(
                "INSERT INTO spike_acceptance VALUES (?, ?, ?, ?)",
              ).run(marker, process.pid, report.runId, report.vsixSha256);
            }
            const row = db
              .prepare("SELECT * FROM spike_acceptance WHERE marker = ?")
              .get(marker);
            assert.ok(row, "Unique marker not found");
            assert.equal(row.marker, marker);
            assert.equal(row.vsix_hash, report.vsixSha256);
            if (priorWrite) {
              const written = priorWrite.candidates.find(
                (item) => item.candidate === candidate,
              );
              assert.equal(written.status, "PASS");
              assert.equal(written.marker, marker);
              assert.equal(row.writer_pid, priorWrite.environment.pid);
              assert.equal(row.writer_run_id, priorWrite.runId);
            }
            Object.assign(result, {
              marker,
              writerPid: row.writer_pid,
              writerRunId: row.writer_run_id,
              pid: process.pid,
            });
          } finally {
            db.close();
          }
        }
        result.status = mode === "read" ? "PASS WITH LIMITATION" : "PASS";
        if (mode === "read") result.limitations.push(...exit.limitations);
      } catch (error) {
        result.status =
          error.code === "MODULE_NOT_FOUND" ? "NOT TESTED" : "FAIL";
        result.error = errorData(error);
      }
    }
    report.status = summarizeStates(
      report.candidates.map((item) => item.status),
    );
  } catch (error) {
    report.status = "FAIL";
    report.harness = { status: "FAIL", error: errorData(error) };
  }
  report.completedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    `APV installed ${mode}: ${report.status}; receipt: ${path.basename(destination)}`,
  );
  if (!["PASS", "PASS WITH LIMITATION"].includes(report.status))
    throw new Error(
      "Inspect installed acceptance receipt; no compatibility pass established",
    );
};
