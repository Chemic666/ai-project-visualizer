import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { StorageError, demand, safeFailure } from "./errors.mjs";

import { inspectLocalValidationRoot } from "./local-storage-root.mjs";
import { plain, closed, id, encode } from "./codec.mjs";
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
  try {
    checkFile(record.root, record.rootIdentity);
    checkFile(record.privateRoot, record.privateIdentity);
    checkFile(record.observedRoot, record.observedIdentity);
    if (record.local) {
      const proof = inspectLocalValidationRoot(record.root, record.local.runId);
      demand(
        proof.ok === true &&
          proof.proof?.ancestorAclTrust === "reviewed-write-principals-only" &&
          proof.privateDirectory === record.privateRoot &&
          proof.observedDirectory === record.observedRoot,
        "binding_conflict",
      );
      checkFile(record.markerPath, record.markerIdentity);
      demand(fs.statSync(record.markerPath).size <= 65536, "binding_conflict");
      demand(
        encode(JSON.parse(fs.readFileSync(record.markerPath, "utf8"))) ===
          record.markerText,
        "binding_conflict",
      );
    }
    return structuredClone(record);
  } catch (error) {
    // A revoked local capability can never be revived by restoring a path/token.
    if (record.local) capabilities.delete(capability);
    throw safeFailure(error);
  }
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
      demand(fs.statSync(markerPath).size <= 65536, "binding_conflict");
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

const localUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function admitLocalValidationRoot(options = {}) {
  demand(options?.enabled === true, "development_disabled");
  try {
    plain(options);
    closed(
      options,
      ["enabled", "root", "runId", "projectId", "generation", "storeKey"],
      ["reopen", "expectedNonce"],
    );
    const {
      root,
      runId,
      projectId,
      generation,
      storeKey,
      reopen = false,
      expectedNonce,
    } = options;
    demand(process.platform === "win32" && process.arch === "x64");
    demand(
      typeof root === "string" &&
        path.isAbsolute(root) &&
        path.resolve(root) === root &&
        typeof runId === "string" &&
        localUuid.test(runId) &&
        typeof storeKey === "string" &&
        localUuid.test(storeKey) &&
        typeof reopen === "boolean",
    );
    id(projectId);
    demand(
      typeof generation === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(generation),
    );
    demand(
      reopen
        ? typeof expectedNonce === "string" && localUuid.test(expectedNonce)
        : expectedNonce === undefined,
    );
    // The official helper checks KnownFolder, native final paths, NTFS/volume,
    // protected owner/DACL and every existing descendant. Never substitute TEMP.
    const proof = inspectLocalValidationRoot(root, runId);
    demand(
      proof.ok === true &&
        proof.proof?.ancestorAclTrust === "reviewed-write-principals-only" &&
        proof.root === root,
      "unavailable",
    );
    const rootIdentity = identity(root),
      privateRoot = proof.privateDirectory,
      observedRoot = proof.observedDirectory;
    const local = { runId, projectId, generation, storeKey };
    const markerPath = path.join(root, "synthetic-marker.json");
    let marker;
    if (!reopen) {
      demand(
        encode(fs.readdirSync(root).sort()) ===
          encode(["observed", "private"]) &&
          fs.readdirSync(privateRoot).length === 0 &&
          fs.readdirSync(observedRoot).length === 0,
        "binding_conflict",
      );
      marker = {
        kind: "apv-local-validation-only",
        version: 1,
        nonce: randomUUID(),
        local,
        rootIdentity,
        privateIdentity: identity(privateRoot),
        observedIdentity: identity(observedRoot),
      };
      fs.writeFileSync(markerPath, encode(marker), { flag: "wx" });
    } else {
      checkFile(markerPath);
      marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
      demand(
        marker.kind === "apv-local-validation-only" &&
          marker.version === 1 &&
          marker.nonce === expectedNonce &&
          encode(marker.local) === encode(local) &&
          same(marker.rootIdentity, rootIdentity),
        "binding_conflict",
      );
    }
    const capability = Object.freeze({ mode: "local-validation-development" });
    capabilities.set(capability, {
      root,
      privateRoot,
      observedRoot,
      rootIdentity,
      privateIdentity: marker.privateIdentity,
      observedIdentity: marker.observedIdentity,
      nonce: marker.nonce,
      local,
      markerPath,
      markerIdentity: identity(markerPath),
      markerText: encode(marker),
      fileSystem: "NTFS",
      productionWriteEnabled: false,
      bindingAssurance: "local-validation-admission-and-metadata",
    });
    inspectCapability(capability);
    return capability;
  } catch (error) {
    throw safeFailure(error);
  }
}
