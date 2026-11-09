const runtimeTuple = Object.freeze({
  vscode: "1.144.0",
  node: "v24.22.1",
  electron: "43.8.3",
  modules: "148",
  platform: "win32",
  arch: "x64",
});
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const pid = (value) => Number.isSafeInteger(value) && value > 0;
const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) =>
  plain(value) &&
  JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort());

function validateRuntime(environment) {
  if (
    !plain(environment) ||
    environment.remoteName !== null ||
    !Object.entries(runtimeTuple).every(
      ([key, value]) => environment[key] === value,
    )
  )
    throw Error("restart_runtime_unsupported");
  return true;
}

function profileForRoot(mode) {
  if (mode === "local-validation") return "extension-host-restart-1.144.0";
  if (mode === "temp") return "extension-host-temp-restart-1.144.0";
  throw Error("restart_root_mode_rejected");
}
function validateHandoff(handoff, spec, resources) {
  const h = handoff;
  const ok =
    exactKeys(h, [
      "kind",
      "rootMode",
      "validationRuntime",
      "runId",
      "storeKey",
      "nonce",
      "processorFingerprint",
      "driverBinarySha256",
      "nativeBuildId",
      "nativeDllSha256",
      "firstHostPid",
      "firstWorkerPid",
      "receipt",
    ]) &&
    h.kind === "apv-whole-host-restart-v1" &&
    h.rootMode === spec.rootMode &&
    h.validationRuntime === profileForRoot(spec.rootMode) &&
    uuid.test(h.runId) &&
    h.runId === spec.runId &&
    uuid.test(h.storeKey) &&
    h.storeKey === spec.storeKey &&
    typeof h.nonce === "string" &&
    uuid.test(h.nonce) &&
    hash.test(h.processorFingerprint) &&
    h.processorFingerprint === resources.processorFingerprint &&
    hash.test(h.driverBinarySha256) &&
    h.driverBinarySha256 === resources.driverBinarySha256 &&
    uuid.test(h.nativeBuildId) &&
    h.nativeBuildId === resources.nativePackage.buildId &&
    hash.test(h.nativeDllSha256) &&
    h.nativeDllSha256 === resources.nativePackage.dllSha256 &&
    pid(h.firstHostPid) &&
    pid(h.firstWorkerPid) &&
    h.firstHostPid !== h.firstWorkerPid &&
    exactKeys(h.receipt, [
      "operationId",
      "operationNonce",
      "projectId",
      "generation",
      "epoch",
      "head",
      "intentDigest",
      "resultDigest",
      "stateDigest",
    ]) &&
    h.receipt.operationId === "op:E1" &&
    h.receipt.operationNonce === "nonce:E1" &&
    h.receipt.projectId === "PA" &&
    h.receipt.generation === "G1" &&
    h.receipt.epoch === 1 &&
    h.receipt.head === 2 &&
    [
      h.receipt.intentDigest,
      h.receipt.resultDigest,
      h.receipt.stateDigest,
    ].every((value) => typeof value === "string" && hash.test(value));
  if (!ok) throw Error("restart_handoff_rejected");
  return true;
}

module.exports = {
  runtimeTuple,
  validateRuntime,
  validateHandoff,
  profileForRoot,
};
