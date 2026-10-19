import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closed, plain, encode } from "./codec.mjs";
import { demand, StorageError } from "./errors.mjs";
// Independent reviewed artifact allowlist; a self-authored TEMP manifest is not
// permission to load another DLL. Updating this requires another build review.
const approvedBuild = Object.freeze({
  buildId: "fc7be262-e067-4658-9329-dce0dd36d858",
  dllSha256: "1e1dc8ebe575078928d7a7b84a1c9321dfc867f735135483b7146531e8be46db",
});
const hash = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function regular(p) {
  const s = fs.lstatSync(p);
  demand(
    !s.isSymbolicLink() &&
      s.isFile() &&
      s.nlink === 1 &&
      fs.realpathSync.native(p) === p,
    "unavailable",
  );
}
export function readNativePackage(manifestPath) {
  try {
    demand(
      process.platform === "win32" &&
        process.arch === "x64" &&
        path.isAbsolute(manifestPath),
      "unavailable",
    );
    const root = path.dirname(manifestPath);
    demand(
      path.dirname(root) === fs.realpathSync.native(os.tmpdir()) &&
        /^apv-storage-attestor-build-[0-9a-f-]{36}$/.test(
          path.basename(root),
        ) &&
        path.basename(manifestPath) === "build.json",
      "unavailable",
    );
    regular(manifestPath);
    const physical = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("./windows-admission.ps1", import.meta.url)),
        "-Target",
        root,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    demand(physical.status === 0, "unavailable");
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    demand(
      m.status === "BUILD PASS" &&
        m.buildId === approvedBuild.buildId &&
        m.dllSha256 === approvedBuild.dllSha256 &&
        m.root === root &&
        path.basename(root) === "apv-storage-attestor-build-" + m.buildId &&
        m.dll === path.join(root, "apv_identity.dll"),
      "unavailable",
    );
    regular(m.dll);
    demand(
      m.compilerSha256 ===
        "febeba5265931ff7f83d6e40cd1e5953c62a640e20928fd6eab86b64687e92dd" &&
        hash(m.compiler) === m.compilerSha256 &&
        hash(m.dll) === m.dllSha256,
      "unavailable",
    );
    const source = fileURLToPath(
        new URL("../native/apv_identity.c", import.meta.url),
      ),
      builder = fileURLToPath(new URL("../native/build.mjs", import.meta.url)),
      headers = path.join(m.driverRoot, "deps/sqlite3");
    const inputs = [
      source,
      builder,
      path.join(headers, "sqlite3.h"),
      path.join(headers, "sqlite3ext.h"),
      path.join(m.driverRoot, "package.json"),
      path.join(m.driverRoot, "binding.gyp"),
      path.join(m.driverRoot, "deps/defines.gypi"),
    ];
    demand(
      encode(m.inputs) ===
        encode(inputs.map((file) => ({ file, sha256: hash(file) }))) &&
        hash(path.join(m.driverRoot, "prebuilds/win32-x64.node")) ===
          m.driverNativeSha256,
      "unavailable",
    );
    demand(
      encode(m.command) ===
        encode([
          "-std=c11",
          "-Wall",
          "-Wextra",
          "-Werror",
          "-O2",
          "-shared",
          "-I",
          headers,
          source,
          "-o",
          m.dll,
          "-Wl,--no-undefined",
        ]),
      "unavailable",
    );
    for (const stage of ["compiler", "pe"]) {
      const r = JSON.parse(
        fs.readFileSync(path.join(root, stage + ".exit.json"), "utf8"),
      );
      demand(
        r.status === 0 && r.signal === null && r.error === null,
        "unavailable",
      );
    }
    const pe = fs.readFileSync(path.join(root, "pe.stdout.txt"), "utf8");
    demand(
      pe.includes("IMAGE_FILE_MACHINE_AMD64") &&
        pe.includes("sqlite3_apvidentity_init") &&
        !/Name:.*sqlite.*\.dll/i.test(pe),
      "unavailable",
    );
    return Object.freeze({
      manifestPath,
      buildId: m.buildId,
      dllSha256: m.dllSha256,
    });
  } catch {
    throw new StorageError("unavailable");
  }
}
export function validateNativePackage(value) {
  plain(value);
  closed(value, ["manifestPath", "buildId", "dllSha256"]);
  const actual = readNativePackage(value.manifestPath);
  demand(encode(value) === encode(actual), "unavailable");
  return actual;
}
export function stableIdentity(info) {
  return {
    volumeSerial: info.volumeSerial,
    fileId: info.fileId,
    finalPath: info.finalPath,
    fileSystem: info.fileSystem,
    links: info.links,
  };
}
export function createAttestor(pkg) {
  validateNativePackage(pkg);
  const dll = path.join(path.dirname(pkg.manifestPath), "apv_identity.dll"),
    loaded = new WeakSet();
  function decode(row, origin, target) {
    const value = JSON.parse(row.j);
    plain(value);
    demand(value.status === "ok", "unavailable");
    closed(value, [
      "status",
      "origin",
      "pid",
      "fcntlRc",
      "win32Error",
      "volumeSerial",
      "fileId",
      "links",
      "fileSystem",
      "finalPath",
    ]);
    demand(
      value.origin === origin &&
        value.pid === process.pid &&
        value.fcntlRc === 0 &&
        value.win32Error === 0 &&
        /^[0-9a-f]{16}$/.test(value.volumeSerial) &&
        /^[0-9a-f]{32}$/.test(value.fileId) &&
        value.links === 1 &&
        value.fileSystem === "NTFS" &&
        value.finalPath === "\\\\?\\" + target,
      "binding_conflict",
    );
    return value;
  }
  function attach(db) {
    if (!loaded.has(db)) {
      demand(hash(dll) === pkg.dllSha256, "unavailable");
      db.loadExtension(dll, "sqlite3_apvidentity_init");
      loaded.add(db);
    }
  }
  function expected(db, target) {
    attach(db);
    regular(target);
    return decode(
      db.prepare("SELECT apv_path_identity(?) AS j").get(target),
      "path-open-expected",
      target,
    );
  }
  function inspect(db, target, baseline, walRequired = false) {
    attach(db);
    const main = decode(
        db.prepare("SELECT apv_main_identity() AS j").get(),
        "sqlite-main-borrowed",
        target,
      ),
      pathInfo = expected(db, target);
    demand(
      encode(stableIdentity(main)) === encode(stableIdentity(pathInfo)),
      "binding_conflict",
    );
    if (baseline)
      demand(
        encode(stableIdentity(main)) === encode(baseline),
        "binding_conflict",
      );
    const report = {
      main,
      expectedPath: pathInfo,
      wal: { status: "not_required" },
      shm: { status: "actual_handle_unverified" },
      buildId: pkg.buildId,
      dllSha256: pkg.dllSha256,
    };
    if (walRequired) {
      const wal = decode(
          db.prepare("SELECT apv_journal_identity() AS j").get(),
          "sqlite-journal-borrowed",
          target + "-wal",
        ),
        pathWal = expected(db, target + "-wal");
      demand(
        encode(stableIdentity(wal)) === encode(stableIdentity(pathWal)) &&
          wal.volumeSerial === main.volumeSerial,
        "binding_conflict",
      );
      report.wal = { ...wal, expectedPath: pathWal };
      if (fs.existsSync(target + "-shm")) {
        const shm = expected(db, target + "-shm");
        demand(shm.volumeSerial === main.volumeSerial, "binding_conflict");
        report.shm = { status: "path_metadata_only", expectedPath: shm };
      }
    }
    return report;
  }
  return { expected, inspect };
}
