"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  parse,
  preflight,
  physical,
  identity,
  write,
  hash,
} = require("./checks.cjs");
function seal(root, runId) {
  const files = fs
    .readdirSync(root)
    .sort()
    .map((file) => {
      const p = path.join(root, file);
      return { file, bytes: fs.statSync(p).size, sha256: hash(p) };
    });
  write(path.join(root, "inventory.json"), {
    runId,
    exclusions: ["inventory.json", "inventory.sha256"],
    files,
  });
  write(
    path.join(root, "inventory.sha256"),
    hash(path.join(root, "inventory.json")) + "\n",
  );
}
function main(args) {
  const selected = parse(args);
  if (selected.mode === "help" || selected.mode === "list") {
    console.log(
      "G1 no-fault only. Disabled by default. --preflight --build-id UUID; --run-g1 --execute --build-id UUID. G2 has no entry point.",
    );
    return;
  }
  const admitted = preflight(selected.buildId);
  if (selected.mode === "preflight") {
    console.log(JSON.stringify(admitted, null, 2));
    return;
  }
  const parent = path.join(admitted.temp, "apv-u3-vfs-g1");
  if (!fs.existsSync(parent)) fs.mkdirSync(parent);
  physical(parent);
  const runId = crypto.randomUUID(),
    root = path.join(parent, runId);
  fs.mkdirSync(root);
  const rootIdentity = identity(root);
  const pathProof = physical(root);
  console.log(
    JSON.stringify({ runId, root, mode: "G1 NO-FAULT", u3: "NOT TESTED" }),
  );
  try {
    const dll = path.join(root, "apv_vfs.dll");
    fs.copyFileSync(admitted.dll, dll, fs.constants.COPYFILE_EXCL);
    physical(dll);
    const sourceHashes = {};
    for (const name of fs.readdirSync(__dirname)) {
      const file = path.join(__dirname, name);
      if (fs.statSync(file).isFile()) sourceHashes[name] = hash(file);
    }
    sourceHashes["native/apv_vfs.c"] = hash(
      path.join(__dirname, "native/apv_vfs.c"),
    );
    write(path.join(root, "manifest.json"), {
      runId,
      buildId: selected.buildId,
      parentPid: process.pid,
      argv: process.argv,
      started: new Date().toISOString(),
      node: process.version,
      nodeSha256: hash(process.execPath),
      os: {
        platform: os.platform(),
        release: os.release(),
        version: os.version(),
        arch: os.arch(),
      },
      pathProof,
      sourceHashes,
      build: admitted.metadata,
      dllSha256: hash(dll),
      protocol: "G1 no-fault v1; no retries; stop on first failure",
      g2: "NOT AUTHORIZED / NOT TESTED",
    });
    for (const role of [
      "standard",
      "wrapped",
      "reader-standard",
      "reader-wrapped",
    ]) {
      physical(root);
      const spec = {
        runId,
        buildId: selected.buildId,
        role,
        nonce: crypto.randomUUID(),
        parentPid: process.pid,
        root,
        rootIdentity,
        dll,
      };
      const request = path.join(root, role + ".spec.json");
      write(request, spec);
      const command = [
        path.join(__dirname, "worker.cjs"),
        "--g1-worker",
        "--execute",
        request,
        spec.nonce,
      ];
      write(path.join(root, role + ".command.json"), {
        exe: process.execPath,
        args: command,
        runId,
        nonce: spec.nonce,
      });
      const r = spawnSync(process.execPath, command, {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      write(path.join(root, role + ".stdout.txt"), r.stdout || "");
      write(path.join(root, role + ".stderr.txt"), r.stderr || "");
      write(path.join(root, role + ".exit.json"), {
        pid: r.pid,
        status: r.status,
        signal: r.signal,
        error: r.error
          ? { code: r.error.code, message: r.error.message }
          : null,
      });
      if (r.error || r.status !== 0)
        throw new Error("G1_WORKER_FAILED: " + role);
    }
    const result = require("./audit.cjs").audit(root);
    write(path.join(root, "runner-result.json"), result);
    console.log(JSON.stringify(result, null, 2));
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
      console.error("SEAL_FAILED; preserve incomplete evidence", e.stack);
      process.exitCode = 1;
    }
  }
}
try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
}
