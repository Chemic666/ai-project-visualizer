const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { test } = require("node:test");
const file = path.join(__dirname, "restart-contract.cjs");
const contract = fs.existsSync(file) ? require(file) : {};
const spec = {
  rootMode: "local-validation",
  runId: "11111111-1111-4111-8111-111111111111",
  storeKey: "22222222-2222-4222-8222-222222222222",
};
const resources = {
  processorFingerprint: "a".repeat(64),
  driverBinarySha256: "b".repeat(64),
  nativePackage: {
    buildId: "33333333-3333-4333-8333-333333333333",
    dllSha256: "c".repeat(64),
  },
};
function handoff() {
  return {
    kind: "apv-whole-host-restart-v1",
    rootMode: "local-validation",
    validationRuntime: "extension-host-restart-1.144.0",
    runId: spec.runId,
    storeKey: spec.storeKey,
    nonce: "44444444-4444-4444-8444-444444444444",
    processorFingerprint: resources.processorFingerprint,
    driverBinarySha256: resources.driverBinarySha256,
    nativeBuildId: resources.nativePackage.buildId,
    nativeDllSha256: resources.nativePackage.dllSha256,
    firstHostPid: 1001,
    firstWorkerPid: 1002,
    receipt: {
      operationId: "op:E1",
      operationNonce: "nonce:E1",
      projectId: "PA",
      generation: "G1",
      epoch: 1,
      head: 2,
      intentDigest: "d".repeat(64),
      resultDigest: "e".repeat(64),
      stateDigest: "f".repeat(64),
    },
  };
}

test("a valid restart handoff binds the exact run, scope, compiled resources and original receipt", () => {
  assert.equal(typeof contract.validateHandoff, "function");
  const h = handoff(),
    before = JSON.stringify(h);
  assert.equal(contract.validateHandoff(h, spec, resources), true);
  assert.equal(JSON.stringify(h), before);
  assert.equal(Object.hasOwn(h, "capability"), false);
});

for (const [name, change] of [
  [
    "other run",
    (h) => {
      h.runId = resources.nativePackage.buildId;
    },
  ],
  [
    "other StoreKey",
    (h) => {
      h.storeKey = resources.nativePackage.buildId;
    },
  ],
  [
    "missing nonce",
    (h) => {
      delete h.nonce;
    },
  ],
  [
    "malformed nonce",
    (h) => {
      h.nonce = "not-a-nonce";
    },
  ],
  [
    "other Core bytes",
    (h) => {
      h.processorFingerprint = "0".repeat(64);
    },
  ],
  [
    "other Driver bytes",
    (h) => {
      h.driverBinarySha256 = "0".repeat(64);
    },
  ],
  [
    "other Native bytes",
    (h) => {
      h.nativeDllSha256 = "0".repeat(64);
    },
  ],
  [
    "other Native build",
    (h) => {
      h.nativeBuildId = spec.runId;
    },
  ],
  [
    "unsafe PID",
    (h) => {
      h.firstHostPid = 0;
    },
  ],
  [
    "same Host and Worker",
    (h) => {
      h.firstWorkerPid = h.firstHostPid;
    },
  ],
  [
    "wrong original head",
    (h) => {
      h.receipt.head = 3;
    },
  ],
  [
    "wrong original epoch",
    (h) => {
      h.receipt.epoch = 2;
    },
  ],
  [
    "wrong Project",
    (h) => {
      h.receipt.projectId = "PB";
    },
  ],
  [
    "wrong generation",
    (h) => {
      h.receipt.generation = "G2";
    },
  ],
  [
    "malformed digest",
    (h) => {
      h.receipt.stateDigest = "not-a-digest";
    },
  ],
  [
    "injected root or authority",
    (h) => {
      h.root = "synthetic-unapproved-root";
      h.capability = {};
    },
  ],
])
  test(`restart handoff rejects ${name} before any capability reopen`, () => {
    const h = handoff();
    change(h);
    assert.throws(() => contract.validateHandoff(h, spec, resources), {
      message: "restart_handoff_rejected",
    });
  });

test("restart Runtime validation is exact and refuses remote or unknown tuples", () => {
  assert.equal(typeof contract.validateRuntime, "function");
  const env = {
    vscode: "1.144.0",
    node: "v24.22.1",
    electron: "43.8.3",
    modules: "148",
    platform: "win32",
    arch: "x64",
    remoteName: null,
  };
  assert.equal(contract.validateRuntime(env), true);
  for (const patch of [
    { node: "v24.21.0" },
    { vscode: "1.140.0" },
    { remoteName: "ssh-remote" },
    { arch: "arm64" },
    { modules: undefined },
  ])
    assert.throws(() => contract.validateRuntime({ ...env, ...patch }), {
      message: "restart_runtime_unsupported",
    });
});

test("handoff root mode and validation profile cannot be substituted", () => {
  const h = handoff();
  h.rootMode = "temp";
  h.validationRuntime = "extension-host-temp-restart-1.144.0";
  assert.throws(() => contract.validateHandoff(h, spec, resources), {
    message: "restart_handoff_rejected",
  });
  assert.equal(
    contract.validateHandoff(h, { ...spec, rootMode: "temp" }, resources),
    true,
  );
  h.validationRuntime = "extension-host-restart-1.144.0";
  assert.throws(
    () => contract.validateHandoff(h, { ...spec, rootMode: "temp" }, resources),
    { message: "restart_handoff_rejected" },
  );
});
