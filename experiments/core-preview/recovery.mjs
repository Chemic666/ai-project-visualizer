import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { digest } from "../../packages/storage/src/codec.mjs";
import {
  admitSyntheticRoot,
  openSyntheticTimelineStore,
} from "../../packages/storage/src/development.mjs";
import {
  loadStagedDriver,
  prepareDriver,
  stageDriver,
} from "./recovery-driver.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const moduleFile = (name) => fileURLToPath(new URL(name, import.meta.url));

async function readBundle(runtime, fingerprint) {
  const file = path.join(runtime, "core.mjs");
  if (sha256(fs.readFileSync(file)) !== fingerprint)
    throw new Error("synthetic_preview_core_changed");
  return import(pathToFileURL(file).href);
}

function unexpectedReplay() {
  throw new Error("unexpected_synthetic_preview_source_replay");
}

function openFixture(runtime, spec, core, expectedNonce) {
  const reopen = expectedNonce !== undefined;
  const capability = admitSyntheticRoot({
    enabled: true,
    root: spec.root,
    ...(reopen ? { reopen, expectedNonce } : {}),
  });
  const { Database, isNativeLoaded } = loadStagedDriver(runtime);
  const store = openSyntheticTimelineStore(capability, {
    Database,
    projectId: core.scope.projectId,
    planScope: core.scope,
    generation: "G1",
    processorFingerprint: spec.processorFingerprint,
    applyNormalizedEvent: reopen ? unexpectedReplay : core.applyNormalizedEvent,
    applyPlanEvent: reopen ? unexpectedReplay : core.applyPlanEvent,
    validatePlan: core.validatePlan,
    prepareUserCorrection: core.prepareUserCorrection,
    prepareCorrectionExpiry: core.prepareCorrectionExpiry,
    updateProgress: core.updateProgress,
    appendTimelineEvents: core.appendTimelineEvents,
    describeCorrectionRecord: core.describeCorrectionRecord,
    ...(reopen ? {} : { bootstrap: core.createBootstrap() }),
  });
  if (!isNativeLoaded()) {
    store.close();
    throw new Error("synthetic_preview_driver_unavailable");
  }
  return store;
}

function closeFixture(store) {
  if (store.close().status !== "closed")
    throw new Error("synthetic_preview_close_failed");
}

// Invoked only by the dedicated local fixture process. Storage validates
// that the synthetic root is a fresh, isolated TEMP directory.
export async function writeFixture(runtime) {
  const real = fs.realpathSync.native(runtime);
  if (
    real !== runtime ||
    path.dirname(real) !== fs.realpathSync.native(os.tmpdir()) ||
    !/^apv-preview-runtime-[A-Za-z0-9]+$/.test(path.basename(real))
  )
    throw new Error("synthetic_preview_runtime_unavailable");
  const spec = readJSON(path.join(runtime, "fixture.json"));
  const core = await readBundle(runtime, spec.processorFingerprint);
  const store = openFixture(runtime, spec, core);
  let cut, epoch;
  try {
    cut = core.writeScenario(store);
    epoch = store.writer().epoch;
  } finally {
    closeFixture(store);
  }
  const { nonce } = readJSON(path.join(spec.root, "synthetic-marker.json"));
  return {
    pid: process.pid,
    closed: true,
    head: cut.head,
    stateDigest: cut.stateDigest,
    cursorDigest: digest(cut.cursor),
    epoch,
    nonce,
  };
}

export async function loadRecoveredCheckpoint(driverRoot) {
  const driverFiles = prepareDriver(driverRoot);
  const temp = fs.realpathSync.native(os.tmpdir());
  const runtime = fs.mkdtempSync(path.join(temp, "apv-preview-runtime-"));
  const root = fs.mkdtempSync(path.join(temp, "apv-storage-slice-"));
  const result = await build({
    entryPoints: [moduleFile("./recovery-case.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node24",
    logLevel: "silent",
  });
  const bytes = result.outputFiles[0].contents;
  const processorFingerprint = sha256(bytes);
  const spec = { root, processorFingerprint };
  stageDriver(runtime, driverFiles);
  fs.writeFileSync(path.join(runtime, "core.mjs"), bytes, { flag: "wx" });
  fs.writeFileSync(path.join(runtime, "fixture.json"), JSON.stringify(spec), {
    flag: "wx",
  });

  const writer = spawnSync(
    process.execPath,
    [moduleFile("./recovery-writer.mjs"), runtime],
    { encoding: "utf8", windowsHide: true, timeout: 25000, maxBuffer: 65536 },
  );
  if (writer.error || writer.status !== 0 || writer.signal !== null)
    throw new Error("synthetic_preview_writer_failed");
  const original = JSON.parse(writer.stdout);
  if (
    original.pid !== writer.pid ||
    original.pid === process.pid ||
    original.closed !== true ||
    original.epoch !== 1 ||
    typeof original.nonce !== "string" ||
    typeof original.stateDigest !== "string"
  )
    throw new Error("synthetic_preview_writer_unverified");

  const core = await readBundle(runtime, processorFingerprint);
  const store = openFixture(runtime, spec, core, original.nonce);
  try {
    const cut = store.read();
    if (
      store.writer().epoch !== original.epoch + 1 ||
      cut.head !== original.head ||
      cut.stateDigest !== original.stateDigest ||
      digest(cut.cursor) !== original.cursorDigest
    )
      throw new Error("synthetic_preview_recovery_mismatch");
    return core.projectRecoveredCheckpoint(cut);
  } finally {
    closeFixture(store);
  }
}
