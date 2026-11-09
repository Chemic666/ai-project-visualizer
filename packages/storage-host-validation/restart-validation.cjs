const { observeRecordedExit } = require("./process-exit-proof.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const {
  validateHandoff,
  validateRuntime,
  profileForRoot,
} = require("./restart-contract.cjs");
const driverPin =
  "e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a";

function noPublication(value) {
  for (const key of ["replay", "publish", "ack"])
    assert.equal(value[key], false);
}

exports.run = async function ({
  spec,
  evidence,
  resources,
  save,
  load,
  environment,
}) {
  validateRuntime(environment);
  assert.match(spec.runId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  assert.equal(path.basename(evidence), "apv-b1-host-" + spec.runId);
  const validationRuntime = profileForRoot(spec.rootMode);
  assert.equal(["write", "recover"].includes(spec.phase), true);
  const recover = spec.phase === "recover";
  const bound = { ...resources, driverBinarySha256: driverPin };
  let handoff;
  if (recover) {
    handoff = JSON.parse(
      fs.readFileSync(path.join(evidence, "write-handoff.json"), "utf8"),
    );
    validateHandoff(handoff, spec, bound);
    save("prior-process-exits.json", {
      host: observeRecordedExit(
        handoff.firstHostPid,
        path.join(evidence, "write-host-environment.json"),
      ),
      worker: observeRecordedExit(
        handoff.firstWorkerPid,
        path.join(evidence, "write-ready.json"),
      ),
    });
  }
  const admission = await load("storage/src/host-admission.mjs");
  let root, cap;
  if (spec.rootMode === "local-validation") {
    const roots = await load("storage/src/local-storage-root.mjs");
    const proof = roots.diagnoseLocalValidationRoot({
      runId: spec.runId,
      reopen: recover,
    });
    save("root-admission.json", proof);
    if (!proof.ok) throw Error("restart_local_root_unavailable");
    root = proof.root;
    cap = admission.admitLocalValidationRoot({
      enabled: true,
      root,
      runId: spec.runId,
      projectId: "PA",
      generation: "G1",
      storeKey: spec.storeKey,
      ...(recover ? { reopen: true, expectedNonce: handoff.nonce } : {}),
    });
  } else {
    root = path.join(
      fs.realpathSync.native(os.tmpdir()),
      "apv-storage-slice-" + spec.runId,
    );
    if (!recover) fs.mkdirSync(root);
    cap = admission.admitSyntheticRoot({
      enabled: true,
      root,
      ...(recover ? { reopen: true, expectedNonce: handoff.nonce } : {}),
    });
    save("root-admission.json", {
      ok: true,
      rootMode: "temp",
      root,
      installationRootAdmitted: false,
    });
  }
  const admitted = admission.inspectCapability(cap);
  save("synthetic-root.json", { root, runId: spec.runId });
  const { launchSyntheticHost } = await load(
    "storage/src/host-development.mjs",
  );
  const { seed, input, cursor } = await load("fixtures.mjs");
  const core = await load("core.mjs");
  const expected = core.applyNormalizedEvent(seed(), input());
  assert.equal(expected.status, "applied");
  const options = {
    ...bound,
    projectId: "PA",
    generation: "G1",
    bootstrap: seed(),
    validationRuntime,
  };
  delete options.base;
  let host;
  try {
    host = launchSyntheticHost(cap, options);
    const ready = await host.ready;
    assert.equal(ready.head, recover ? 2 : 1);
    assert.equal(ready.writer.epoch, recover ? 2 : 1);
    assert.equal(ready.productionWriteEnabled, false);
    assert.equal(
      ready.resourceBinding.actualDriverHandleIdentity,
      "main-confirmed-only",
    );
    assert.ok(ready.resourceBinding.nativeAttestation);
    save("ready.json", ready);
    const actualStoreKey = path.basename(path.dirname(ready.paths.owner));
    if (spec.rootMode === "local-validation" || recover)
      assert.equal(actualStoreKey, spec.storeKey);
    const request = {
      operationId: "op:E1",
      operationNonce: "nonce:E1",
      expectedHead: 1,
      writer: ready.writer,
      events: [input()],
      cursor: cursor(["E1"]),
    };
    let cut, committed;
    if (!recover) {
      committed = await host.commit(request);
      assert.equal(committed.status, "committed");
      noPublication(committed);
      cut = committed;
    } else {
      const previous = JSON.parse(
        fs.readFileSync(path.join(evidence, "write-ready.json"), "utf8"),
      );
      assert.deepEqual(ready.paths, previous.paths);
      assert.deepEqual(
        ready.resourceBinding.nativeAttestation.expected,
        previous.resourceBinding.nativeAttestation.expected,
      );
      cut = await host.read();
      assert.equal(cut.head, 2);
      assert.deepEqual(cut.state, expected.state);
      assert.deepEqual(cut.cursor, [cursor(["E1"])]);
      assert.equal(cut.stateDigest, handoff.receipt.stateDigest);
      committed = await host.commit(request);
      assert.equal(committed.status, "already_committed");
      assert.equal(committed.head, 2);
      assert.deepEqual(committed.receipt, handoff.receipt);
      assert.deepEqual(committed.state, cut.state);
      assert.deepEqual(committed.cursor, cut.cursor);
      noPublication(committed);
    }
    assert.equal(cut.head, 2);
    assert.deepEqual(cut.state, expected.state);
    assert.deepEqual(cut.cursor, [cursor(["E1"])]);
    save("cut.json", {
      state: cut.state,
      cursor: cut.cursor,
      head: cut.head,
      stateDigest: cut.stateDigest,
    });
    save("commit.json", committed);
    const settled = await host.close();
    assert.equal(settled.status, "closed");
    assert.equal(settled.exitCode, 0);
    assert.equal(settled.signal, null);
    assert.equal(settled.processExited, true);
    assert.equal(settled.pid, ready.pid);
    save(
      "worker-exit-observation.json",
      observeRecordedExit(
        ready.pid,
        path.join(evidence, spec.phase + "-ready.json"),
      ),
    );
    noPublication(settled);
    save("worker-exit.json", settled);
    if (!recover) {
      handoff = {
        kind: "apv-whole-host-restart-v1",
        rootMode: spec.rootMode,
        validationRuntime,
        runId: spec.runId,
        storeKey: actualStoreKey,
        nonce: admitted.nonce,
        processorFingerprint: bound.processorFingerprint,
        driverBinarySha256: bound.driverBinarySha256,
        nativeBuildId: bound.nativePackage.buildId,
        nativeDllSha256: bound.nativePackage.dllSha256,
        firstHostPid: environment.pid,
        firstWorkerPid: ready.pid,
        receipt: committed.receipt,
      };
      validateHandoff(handoff, { ...spec, storeKey: actualStoreKey }, bound);
      save("handoff.json", handoff);
    }
    const production = (
      await load("storage/src/index.mjs")
    ).openProductionStore({ enabled: true });
    assert.equal(production.status, "unavailable");
    save("result.json", {
      status: recover ? "RECOVERY_COMPLETE" : "WRITE_COMPLETE",
      runId: spec.runId,
      hostPid: environment.pid,
      workerPid: ready.pid,
      head: 2,
      epoch: ready.writer.epoch,
      receipt: committed.receipt,
      productionEnabled: false,
      shmDirectHandle: "unverified",
      replay: false,
      publish: false,
      ack: false,
    });
    return { status: "PASS WITH LIMITATION" };
  } finally {
    if (host) {
      await host.close();
      save("lifecycle.json", {
        status: host.status(),
        evidence: host.evidence(),
      });
    }
  }
};
