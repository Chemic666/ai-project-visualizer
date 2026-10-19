"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { parse } = require("./policy.cjs");
const { preflight, physical, identity, hash, write } = require("./checks.cjs");
function files(dir, prefix = "") {
  return fs
    .readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = path.join(dir, n),
        r = prefix + n;
      assert(!fs.lstatSync(p).isSymbolicLink());
      return fs.statSync(p).isDirectory() ? files(p, r + "/") : [r];
    });
}
function seal(root, runId) {
  write(path.join(root, "inventory.json"), {
    runId,
    exclusions: ["inventory.json", "inventory.sha256"],
    files: files(root).map((file) => ({
      file,
      bytes: fs.statSync(path.join(root, file)).size,
      sha256: hash(path.join(root, file)),
    })),
  });
  write(
    path.join(root, "inventory.sha256"),
    hash(path.join(root, "inventory.json")) + "\n",
  );
}
function main(args) {
  const mode = parse(args);
  if (mode.mode === "help") {
    console.log(
      "Disabled by default. --preflight --build-id UUID; future authorized --run-g2 --execute --case G2-W|G2-S --build-id UUID. No retries.",
    );
    return;
  }
  const admitted = preflight(mode.buildId);
  if (mode.mode === "preflight") {
    console.log(JSON.stringify(admitted, null, 2));
    return;
  }
  const parent = path.join(admitted.temp, "apv-u3-vfs-g2");
  if (!fs.existsSync(parent)) fs.mkdirSync(parent);
  physical(parent);
  const runId = crypto.randomUUID(),
    root = path.join(parent, runId);
  fs.mkdirSync(root);
  const rootIdentity = identity(root),
    pathProof = physical(root);
  console.log(
    JSON.stringify({
      runId,
      evidenceRoot: root,
      case: mode.case,
      mode: "G2 controlled VFS; physical faults NOT TESTED",
    }),
  );
  try {
    const dll = path.join(root, "apv_g2_vfs.dll");
    fs.copyFileSync(
      path.join(__dirname, "execution-package.json"),
      path.join(root, "execution-package.json"),
      fs.constants.COPYFILE_EXCL,
    );
    assert.equal(
      hash(path.join(root, "execution-package.json")),
      admitted.executionPackage.manifestSha256,
    );
    fs.copyFileSync(admitted.dll, dll, fs.constants.COPYFILE_EXCL);
    physical(dll);
    assert.equal(identity(dll).nlink, "1");
    const fixture = {
      runId,
      project: "PA",
      generation: "GEN-1",
      epoch: 1,
      baselineNonce: crypto.randomUUID(),
      operationNonce: crypto.randomUUID(),
    };
    const sourceHashes = Object.fromEntries(
      files(__dirname)
        .filter((n) => !n.startsWith("build/"))
        .map((n) => [n, hash(path.join(__dirname, n))]),
    );
    write(path.join(root, "manifest.json"), {
      runId,
      case: mode.case,
      buildId: mode.buildId,
      executionPackage: admitted.executionPackage,
      parentPid: process.pid,
      argv: process.argv,
      started: new Date().toISOString(),
      node: process.version,
      nodeSha256: hash(process.execPath),
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        version: os.version(),
      },
      pathProof,
      build: admitted.metadata,
      dllSha256: hash(dll),
      fixture,
      sourceHashes,
      protocol:
        "one case, one native denial; writer exit before preservation/reader; no retry or ACK",
    });
    let settlement, writerNonce;
    for (const role of ["writer", "reader"]) {
      if (role === "reader") {
        assert(
          settlement && settlement.observedExit && settlement.workerComplete,
          "unsettled Writer blocks Reader",
        );
        const preserved = path.join(root, "preserved-before-reader");
        fs.mkdirSync(preserved);
        const saved = [];
        for (const suffix of ["", "-wal", "-shm", "-journal"]) {
          const source = path.join(root, "target.sqlite" + suffix);
          if (!fs.existsSync(source)) continue;
          physical(source);
          assert.equal(identity(source).nlink, "1");
          const copy = "preserved-before-reader/target.sqlite" + suffix;
          const sha256 = hash(source);
          fs.copyFileSync(
            source,
            path.join(root, copy),
            fs.constants.COPYFILE_EXCL,
          );
          assert.equal(hash(path.join(root, copy)), sha256);
          saved.push({
            file: "target.sqlite" + suffix,
            copy,
            sha256,
            bytes: fs.statSync(source).size,
            identity: identity(source),
          });
        }
        assert(saved.some((f) => f.file === "target.sqlite"));
        write(path.join(root, "preserved-files.json"), {
          settlement,
          files: saved,
        });
      }
      const nonce = crypto.randomUUID();
      if (role === "writer") writerNonce = nonce;
      const spec = {
        runId,
        case: mode.case,
        buildId: mode.buildId,
        executionPackage: admitted.executionPackage,
        role,
        nonce,
        parentPid: process.pid,
        root,
        rootIdentity,
        dll,
        fixture,
        ...(role === "reader"
          ? { writerNonce, writerSettlement: settlement }
          : {}),
      };
      const request = path.join(root, role + ".spec.json");
      write(request, spec);
      const argv = [
        path.join(__dirname, "worker.cjs"),
        "--g2-worker",
        "--execute",
        request,
        nonce,
      ];
      write(path.join(root, role + ".command.json"), {
        exe: process.execPath,
        args: argv,
        runId,
        nonce,
      });
      const r = spawnSync(process.execPath, argv, {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      write(path.join(root, role + ".stdout.txt"), r.stdout || "");
      write(path.join(root, role + ".stderr.txt"), r.stderr || "");
      const exit = {
        pid: r.pid,
        status: r.status,
        signal: r.signal,
        error: r.error
          ? { code: r.error.code, message: r.error.message }
          : null,
      };
      write(path.join(root, role + ".exit.json"), exit);
      if (r.error || r.status !== 0)
        throw new Error("G2_WORKER_FAILED: " + role);
      if (role === "writer") {
        const receipts = fs
            .readFileSync(path.join(root, "writer.receipts.jsonl"), "utf8")
            .trim()
            .split(/\r?\n/)
            .map(JSON.parse),
          last = receipts.at(-1);
        assert.equal(last.type, "worker-complete");
        assert.equal(last.pid, r.pid);
        assert.equal(last.nonce, nonce);
        assert.equal(last.runId, runId);
        settlement = {
          ...exit,
          nonce,
          observedExit: true,
          workerComplete: true,
        };
        write(path.join(root, "writer-settlement.json"), settlement);
      }
    }
    const result = require("./audit.cjs").audit(root);
    write(path.join(root, "runner-result.json"), result);
    console.log(JSON.stringify(result, null, 2));
    if (
      result.fault.status !== "HIT" ||
      result.decision.outcome === "unavailable"
    )
      process.exitCode = 1;
  } catch (e) {
    write(path.join(root, "failure.json"), {
      message: e.message,
      stack: e.stack,
    });
    throw e;
  } finally {
    try {
      seal(root, runId);
    } catch (e) {
      console.error("SEAL_FAILED — preserve originals", e.stack);
      process.exitCode = 1;
    }
  }
}
if (require.main === module)
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 1;
  }
module.exports = { main };
