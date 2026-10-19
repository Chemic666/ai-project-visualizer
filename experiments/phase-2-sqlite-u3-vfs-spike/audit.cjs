"use strict";
/* File-only Oracle. No driver import, process spawn or database opens. */
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { validateCut } = require("./oracle.cjs");
/* Independent of the Writer helper. Expected name is a comparison only;
 * actual name must exist in the raw native info, never reconstructed here. */
function validateVfsIdentity(receipt, expected) {
  assert(receipt && receipt.info && typeof receipt.info === "object");
  const info = receipt.info;
  assert.equal(receipt.role, "wrapped");
  assert.equal(receipt.runId, expected.runId);
  assert.equal(receipt.nonce, expected.nonce);
  assert.equal(receipt.pid, expected.pid);
  assert.equal(receipt.connectionRole, expected.connectionRole);
  assert.equal(
    receipt.type,
    expected.connectionRole === "target"
      ? "target-vfs-selected"
      : "reopened-vfs-selected",
  );
  assert.equal(receipt.databaseFile, expected.databaseFile);
  assert(Object.hasOwn(info, "actualVfsName"));
  assert.equal(typeof info.actualVfsName, "string");
  assert.equal(info.actualVfsName, "apv_g1_nofault_v1");
  assert.equal(info.vfsQueryStatus, "ok");
  assert(Number.isInteger(info.fileControlRc));
  assert.equal(info.fileControlRc, 0);
  assert.equal(info.selectedShim, 1);
  assert.equal(info.pid, expected.pid);
  assert.equal(typeof info.api, "string");
  assert(info.api.length > 0);
  assert(Number.isInteger(info.thread) && info.thread > 0);
  assert.equal(typeof info.databaseFile, "string");
  assert(path.win32.isAbsolute(info.databaseFile));
  assert.equal(
    path.win32.normalize(info.databaseFile),
    path.win32.normalize(expected.databaseFile),
  );
  return true;
}
function audit(root) {
  const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
  const manifest = load("manifest.json");
  assert.equal(path.basename(root), manifest.runId);
  const cuts = [];
  const targetBindings = [];
  for (const role of [
    "standard",
    "wrapped",
    "reader-standard",
    "reader-wrapped",
  ]) {
    const lifecycle = load(role + ".exit.json"),
      spec = load(role + ".spec.json");
    assert.equal(lifecycle.status, 0);
    assert.equal(lifecycle.signal, null);
    assert.equal(lifecycle.error, null);
    assert.equal(spec.runId, manifest.runId);
    assert.equal(spec.root, root);
    assert.equal(spec.parentPid, manifest.parentPid);
    const receipts = fs
      .readFileSync(path.join(root, role + ".receipts.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    for (const [i, r] of receipts.entries()) {
      assert.equal(r.seq, i + 1);
      assert.equal(r.pid, lifecycle.pid);
      assert.equal(r.ppid, manifest.parentPid);
      assert.equal(r.runId, manifest.runId);
      assert.equal(r.nonce, spec.nonce);
      assert.equal(r.role, role);
    }
    assert.equal(receipts[0].type, "worker-start");
    assert.equal(receipts.at(-1).type, "worker-complete");
    if (role.startsWith("reader-")) {
      const cut = load(role + ".cut.json");
      validateCut(cut);
      cuts.push(cut);
    } else {
      const commits = receipts.filter((r) => r.type === "commit-return");
      assert.deepEqual(
        commits.map((r) => r.phase),
        [4, 11],
      );
      assert(commits.every((r) => r.transactionActive === false));
      assert(receipts.some((r) => r.type === "first-target-closed"));
      assert(receipts.some((r) => r.type === "final-target-closed"));
      if (role === "wrapped") {
        const boot = receipts.find((r) => r.type === "extension-loaded"),
          target = receipts.find((r) => r.type === "target-vfs-selected"),
          reopen = receipts.find((r) => r.type === "reopened-vfs-selected");
        const binding = {
          runId: manifest.runId,
          nonce: spec.nonce,
          pid: lifecycle.pid,
          databaseFile: path.join(root, "wrapped.sqlite"),
        };
        validateVfsIdentity(target, { ...binding, connectionRole: "target" });
        validateVfsIdentity(reopen, {
          ...binding,
          connectionRole: "reopened-target",
        });
        targetBindings.push(target, reopen);
        assert.equal(boot.info.api, target.info.api);
        assert.equal(target.info.api, reopen.info.api);
        assert.equal(target.info.selectedShim, 1);
        assert.equal(reopen.info.selectedShim, 1);
        const closed = receipts.find(
          (r) => r.type === "bootstrap-closed-before-target-io",
        );
        assert(closed.seq < commits[0].seq);
      }
    }
  }
  assert.deepEqual(cuts[0], cuts[1]);
  const native = load("native-events.json");
  assert.equal(native.state.overflow, 0);
  assert.equal(native.events.length, native.state.traceCount);
  const wrapped = load("wrapped.exit.json");
  for (const binding of targetBindings) {
    assert.equal(native.state.api, binding.info.api);
    assert.equal(native.state.pid, binding.info.pid);
    assert.equal(native.state.thread, binding.info.thread);
    assert(
      native.events.some(
        (e) =>
          e.kind === 1 &&
          e.method === "xOpen" &&
          e.rc === 0 &&
          e.pid === binding.info.pid &&
          e.thread === binding.info.thread &&
          path.win32.normalize(e.path) ===
            path.win32.normalize(binding.info.databaseFile),
      ),
      "Native target identity has no matching successful xOpen",
    );
  }
  for (const [i, e] of native.events.entries()) {
    assert.equal(e.seq, i + 1);
    assert.equal(e.pid, wrapped.pid);
    assert.equal(e.thread, native.state.thread);
    if (e.path)
      assert(path.dirname(e.path).toLowerCase() === root.toLowerCase());
  }
  for (const phase of [4, 11]) {
    for (const method of ["xWrite", "xSync"])
      assert(
        native.events.some(
          (e) =>
            e.phase === phase &&
            e.method === method &&
            e.kind === 2 &&
            e.rc === 0 &&
            e.path.toLowerCase() ===
              path.join(root, "wrapped.sqlite-wal").toLowerCase(),
        ),
        "Missing COMMIT WAL " + method,
      );
  }
  assert(
    native.events.some(
      (e) => e.kind === 1 && e.method === "xOpen" && e.rc === 0,
    ),
  );
  assert(
    native.events.filter(
      (e) => e.kind === 1 && e.method === "xOpen" && e.rc === 0,
    ).length >= 2,
  );
  assert(
    native.events.some(
      (e) => e.kind === 1 && e.method === "xClose" && e.rc === 0,
    ),
  );
  assert(native.events.some((e) => e.method === "xShmMap" && e.rc === 0));
  return {
    g1: "NO-FAULT PASS WITH LIMITATION",
    runId: manifest.runId,
    workers: 4,
    sqlCuts: 2,
    nativeEvents: native.events.length,
    u3: "NOT TESTED",
    g2: "NOT AUTHORIZED / NOT TESTED",
  };
}
function verifyInventory(root) {
  const inventory = JSON.parse(
    fs.readFileSync(path.join(root, "inventory.json"), "utf8"),
  );
  assert.equal(inventory.runId, path.basename(root));
  for (const row of inventory.files) {
    assert(
      !row.file.includes("/") &&
        !row.file.includes("\\") &&
        !row.file.includes(".."),
    );
    const bytes = fs.readFileSync(path.join(root, row.file));
    assert.equal(bytes.length, row.bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      row.sha256,
    );
  }
  assert.deepEqual(
    fs
      .readdirSync(root)
      .filter((f) => f !== "inventory.json" && f !== "inventory.sha256")
      .sort(),
    inventory.files.map((r) => r.file).sort(),
  );
  assert.equal(
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, "inventory.json")))
      .digest("hex"),
    fs.readFileSync(path.join(root, "inventory.sha256"), "utf8").trim(),
  );
  return inventory.files.length;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.equal(args.length, 2);
    assert.equal(args[0], "--audit");
    assert(/^[0-9a-f-]{36}$/i.test(args[1]));
    const root = path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Temp",
      "apv-u3-vfs-g1",
      args[1],
    );
    console.log(
      JSON.stringify(
        { ...audit(root), inventory: verifyInventory(root) },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 1;
  }
}
module.exports = { audit, verifyInventory, validateVfsIdentity };
