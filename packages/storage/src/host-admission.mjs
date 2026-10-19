import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { StorageError, demand, safeFailure } from "./errors.mjs";

const capabilities = new WeakMap();
export function identity(filename) {
  const l = fs.lstatSync(filename, { bigint: true });
  demand(
    !l.isSymbolicLink() && (l.isDirectory() || (l.isFile() && l.nlink === 1n)),
    "binding_conflict",
  );
  demand(
    fs.realpathSync.native(filename) === path.resolve(filename),
    "binding_conflict",
  );
  return { dev: String(l.dev), ino: String(l.ino), directory: l.isDirectory() };
}
function same(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.directory === b.directory;
}
export function checkFile(filename, expected) {
  try {
    const actual = identity(filename);
    demand(!expected || same(actual, expected), "binding_conflict");
    return actual;
  } catch {
    throw new StorageError("binding_conflict");
  }
}
export function inspectCapability(capability) {
  const record = capabilities.get(capability);
  demand(record, "admission_rejected");
  checkFile(record.root, record.rootIdentity);
  checkFile(record.privateRoot, record.privateIdentity);
  checkFile(record.observedRoot, record.observedIdentity);
  return structuredClone(record);
}
export function admitSyntheticRoot({
  enabled = false,
  root,
  reopen = false,
  expectedNonce,
} = {}) {
  demand(enabled === true, "development_disabled");
  try {
    demand(process.platform === "win32" && process.arch === "x64");
    demand(typeof root === "string" && path.isAbsolute(root));
    root = path.resolve(root);
    demand(
      path.dirname(root) === fs.realpathSync.native(os.tmpdir()) &&
        /^apv-storage-slice-[A-Za-z0-9_-]+$/.test(path.basename(root)),
    );
    const rootIdentity = identity(root);
    const proof = spawnSync(
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
    demand(proof.status === 0);
    const physical = JSON.parse(proof.stdout);
    demand(
      physical.fileSystem === "NTFS" &&
        physical.driveType === "Fixed" &&
        physical.reparseAncestors === false,
    );
    const markerPath = path.join(root, "synthetic-marker.json");
    let marker;
    if (!reopen) {
      demand(fs.readdirSync(root).length === 0);
      fs.mkdirSync(path.join(root, "private"));
      fs.mkdirSync(path.join(root, "observed"));
      marker = {
        kind: "apv-synthetic-development-only",
        nonce: randomUUID(),
        rootIdentity,
        privateIdentity: identity(path.join(root, "private")),
        observedIdentity: identity(path.join(root, "observed")),
      };
      fs.writeFileSync(markerPath, JSON.stringify(marker), { flag: "wx" });
    } else {
      checkFile(markerPath);
      marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
      demand(
        marker.kind === "apv-synthetic-development-only" &&
          expectedNonce === marker.nonce &&
          same(marker.rootIdentity, rootIdentity),
        "binding_conflict",
      );
    }
    const capability = Object.freeze({ mode: "synthetic-development" });
    capabilities.set(capability, {
      root,
      privateRoot: path.join(root, "private"),
      observedRoot: path.join(root, "observed"),
      rootIdentity,
      privateIdentity: marker.privateIdentity,
      observedIdentity: marker.observedIdentity,
      nonce: marker.nonce,
      fileSystem: "NTFS",
      productionWriteEnabled: false,
      bindingAssurance: "synthetic-path-metadata-only",
    });
    inspectCapability(capability);
    return capability;
  } catch (error) {
    throw safeFailure(error);
  }
}
