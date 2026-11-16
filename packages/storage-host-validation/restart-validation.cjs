const { observeRecordedExit } = require("./process-exit-proof.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const {
  validateHandoff,
  validateRuntime,
  profileForRoot,
  restartFixture,
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
  const fixture = restartFixture(spec);
  const timeline = spec.storeModel === "timeline-v5";
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
  const expected = timeline
    ? undefined
    : core.applyNormalizedEvent(seed(), input());
  if (timeline) assert.equal(core.scope.projectId, fixture.projectId);
  else assert.equal(expected.status, "applied");
  const options = {
    ...bound,
    projectId: fixture.projectId,
    generation: "G1",
    ...(timeline
      ? {
          planScope: core.scope,
          ...(!recover ? { bootstrap: core.createBootstrap() } : {}),
        }
      : { bootstrap: seed() }),
    validationRuntime,
  };
  delete options.base;
  let host;
  try {
    host = launchSyntheticHost(cap, options);
    const ready = await host.ready;
    assert.equal(ready.head, recover ? fixture.head : 1);
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
    const request = timeline
      ? core.scenarioFinalRequest(ready.writer, fixture.head - 1)
      : {
          operationId: fixture.operationId,
          operationNonce: fixture.operationNonce,
          expectedHead: fixture.head - 1,
          writer: ready.writer,
          events: [input()],
          cursor: cursor(["E1"]),
        };
    let cut, committed;
    if (!recover) {
      committed = timeline
        ? await core.writeScenario({
            read: host.read,
            commit: host.commit,
            writer: () => ready.writer,
          })
        : await host.commit(request);
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
      assert.equal(cut.head, fixture.head);
      assert.equal(cut.stateDigest, handoff.receipt.stateDigest);
      committed = await host.commit(request);
      assert.equal(committed.status, "already_committed");
      assert.equal(committed.head, fixture.head);
      assert.deepEqual(committed.receipt, handoff.receipt);
      assert.deepEqual(committed.state, cut.state);
      assert.deepEqual(committed.cursor, cut.cursor);
      if (timeline)
        for (const key of ["plan", "progress", "timeline"])
          assert.deepEqual(committed[key], cut[key]);
      noPublication(committed);
    }
    assert.equal(cut.head, fixture.head);
    assert.deepEqual(cut.cursor, [request.cursor]);
    if (timeline) {
      const view = core.projectRecoveredCheckpoint(cut);
      assert.equal(view.progress.status, "available");
      assert.equal(view.progress.ratio, 0.5);
      assert.deepEqual(
        [view.progress.completedWeight, view.progress.totalWeight],
        [3, 6],
      );
      assert.ok(
        view.timeline.some(({ transition }) => transition === "60% → 50%"),
      );
      assert.ok(
        view.timeline.some(
          ({ kind, evidence }) =>
            kind === "correction.expired" &&
            evidence.some(({ lifecycle }) => lifecycle === "expired"),
        ),
      );
      assert.ok(
        view.timeline.some(
          ({ kind, title, provenance }) =>
            kind === "task.status_reported" &&
            title.includes("报告已验证") &&
            provenance === "agent_reported",
        ),
      );
      save("checkpoint-view.json", view);
    } else assert.deepEqual(cut.state, expected.state);
    save("cut.json", {
      state: cut.state,
      ...(timeline
        ? { plan: cut.plan, progress: cut.progress, timeline: cut.timeline }
        : {}),
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
        kind: fixture.kind,
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
      head: fixture.head,
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
