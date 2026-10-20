const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
exports.activate = function (context) {
  return {
    async validate(specPath) {
      if (process.env.APV_B1_HOST_SPEC !== specPath)
        throw Error("validation_disabled");
      const evidence = path.dirname(specPath);
      if (
        path.dirname(evidence) !== fs.realpathSync.native(os.tmpdir()) ||
        !/^apv-b1-host-[0-9a-f-]{36}$/.test(path.basename(evidence))
      )
        throw Error("invalid_evidence");
      const spec = JSON.parse(fs.readFileSync(specPath, "utf8")),
        vscode = require("vscode");
      const save = (name, data) =>
        fs.writeFileSync(
          path.join(evidence, name),
          JSON.stringify(data, null, 2),
          { flag: "wx" },
        );
      const environment = {
        vscode: vscode.version,
        node: process.version,
        electron: process.versions.electron,
        modules: process.versions.modules,
        napi: process.versions.napi,
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        remoteName: vscode.env.remoteName ?? null,
        reportedExtensionRoot: context.extensionPath,
        extensionRoot: fs.realpathSync.native(context.extensionPath),
      };
      save("host-environment.json", environment);
      if (
        vscode.version !== "1.140.0" ||
        process.version !== "v24.21.0" ||
        process.versions.electron !== "43.7.3" ||
        process.versions.modules !== "148" ||
        process.platform !== "win32" ||
        process.arch !== "x64" ||
        vscode.env.remoteName
      )
        throw Error("unsupported_host");
      const load = async (p) =>
        import(
          pathToFileURL(
            path.join(
              fs.realpathSync.native(context.extensionPath),
              "runtime",
              p,
            ),
          ).href
        );
      const { inspectInstalledResources } = await load(
          "storage/src/installed-resources.mjs",
        ),
        resources = inspectInstalledResources();
      const { admitSyntheticRoot } = await load(
          "storage/src/host-admission.mjs",
        ),
        { launchSyntheticHost } = await load(
          "storage/src/host-development.mjs",
        );
      const { seed, input, cursor } = await load("fixtures.mjs"),
        core = await load("core.mjs");
      let root, cap, localProof;
      if (spec.rootMode === "local-validation") {
        const api = await load("storage/src/local-storage-root.mjs");
        localProof = api.diagnoseLocalValidationRoot({ runId: spec.runId });
        save("host-root-admission.json", localProof);
        if (!localProof.ok) throw Error("local_root_unavailable");
        root = localProof.root;
        const local = await load("storage/src/host-admission.mjs");
        cap = local.admitLocalValidationRoot({
          enabled: true,
          root,
          runId: spec.runId,
          projectId: "PA",
          generation: "G1",
          storeKey: spec.storeKey,
        });
        save("local-capability.json", local.inspectCapability(cap));
      } else {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
        cap = admitSyntheticRoot({ enabled: true, root });
      }
      save("synthetic-root.json", { root, runId: spec.runId });
      const options = { ...resources };
      delete options.base;
      options.driverBinarySha256 =
        "e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a";
      Object.assign(options, {
        projectId: "PA",
        generation: "G1",
        bootstrap: seed(),
      });
      const lives = [];
      let first, second, result, coordination;
      try {
        first = launchSyntheticHost(cap, options);
        lives.push(first);
        const a = await first.ready;
        if (spec.rootMode === "local-validation") {
          const coordinator = require(
            path.join(resources.base, "local-shm.cjs"),
          );
          coordination = await coordinator.start({
            resources,
            root: localProof,
            spec,
            ready: a,
            save,
            launchSyntheticHost,
            cap,
            options,
          });
        }
        result = await first.commit({
          operationId: "op:E1",
          operationNonce: "nonce:E1",
          expectedHead: 1,
          writer: a.writer,
          events: [input()],
          cursor: cursor(["E1"]),
        });
        if (
          result.status !== "committed" ||
          result.ack ||
          result.publish ||
          result.replay
        )
          throw Error("bad_commit");
        if (coordination) await coordination.afterCommit(result);
        const exit1 = await first.close();
        if (exit1.exitCode !== 0 || !exit1.processExited)
          throw Error("unsettled");
        second = launchSyntheticHost(cap, options);
        lives.push(second);
        const b = await second.ready,
          cut = await second.read();
        if (
          b.writer.epoch !== 2 ||
          cut.head !== 2 ||
          !require("node:util").isDeepStrictEqual(
            cut.state,
            core.applyNormalizedEvent(seed(), input()).state,
          )
        )
          throw Error("bad_recovery");
        const exit2 = await second.close();
        if (exit2.exitCode !== 0 || !exit2.processExited)
          throw Error("unsettled");
        save("native-bindings.json", {
          first: a,
          second: b,
          exits: [exit1, exit2],
        });
        const readerSpec = {
          ...spec,
          driverRoot: resources.driverRoot,
          processorFingerprint: resources.processorFingerprint,
          databaseFile: a.paths.project,
          expectedState: core.applyNormalizedEvent(seed(), input()).state,
          expectedWriterEpoch: 2,
          writerSettlement: { pid: a.pid, status: 0, closed: true },
          recoverySettlement: { pid: b.pid, status: 0, closed: true },
        };
        save("reader.spec.json", readerSpec);
        const args = [
          path.join(
            fs.realpathSync.native(context.extensionPath),
            "runtime/sql-reader.mjs",
          ),
          path.join(evidence, "reader.spec.json"),
        ];
        const r = require("node:child_process").spawnSync(
          process.execPath,
          args,
          {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
            encoding: "utf8",
            windowsHide: true,
            timeout: 20000,
          },
        );
        save("reader.exit.json", {
          pid: r.pid,
          status: r.status,
          signal: r.signal,
          args,
          afterBothWriterExits: true,
        });
        fs.writeFileSync(
          path.join(evidence, "reader.stdout.txt"),
          r.stdout ?? "",
          { flag: "wx" },
        );
        fs.writeFileSync(
          path.join(evidence, "reader.stderr.txt"),
          r.stderr ?? "",
          { flag: "wx" },
        );
        if (r.status !== 0 || r.stderr) throw Error("reader_failed");
        if (spec.rootMode !== "local-validation") {
          const { verifyUnavailable } = await load("negative-tests.mjs");
          await verifyUnavailable(resources, evidence);
        } else {
          const local = await load("storage/src/host-admission.mjs");
          const admitted = local.inspectCapability(cap);
          const reopens = {
            enabled: true,
            root,
            runId: spec.runId,
            projectId: "PA",
            generation: "G1",
            storeKey: spec.storeKey,
            reopen: true,
            expectedNonce: admitted.nonce,
          };
          const refusals = [];
          for (const change of [
            { generation: "G2" },
            { storeKey: crypto.randomUUID() },
            { expectedNonce: crypto.randomUUID() },
          ]) {
            let code;
            try {
              local.admitLocalValidationRoot({ ...reopens, ...change });
              throw Error("scope_bypass");
            } catch (error) {
              if (error.message === "scope_bypass") throw error;
              code = error.code;
            }
            if (code !== "binding_conflict")
              throw Error("scope_refusal_unproven");
            refusals.push({ field: Object.keys(change)[0], code });
          }
          // Controlled corruption of this new synthetic control marker only;
          // business rows and completed SQL receipts are left untouched.
          const markerPath = path.join(root, "synthetic-marker.json");
          const before = fs.readFileSync(markerPath);
          save("capability-marker-before.json", JSON.parse(before));
          const changed = { ...JSON.parse(before), nonce: crypto.randomUUID() };
          fs.writeFileSync(markerPath, JSON.stringify(changed));
          const revoked = [];
          for (let i = 0; i < 2; i++) {
            try {
              local.inspectCapability(cap);
              throw Error("revocation_bypass");
            } catch (error) {
              if (error.message === "revocation_bypass") throw error;
              revoked.push(error.code);
            }
          }
          if (
            revoked[0] !== "binding_conflict" ||
            revoked[1] !== "admission_rejected"
          )
            throw Error("revocation_unproven");
          save("capability-revocation.json", {
            status: "unavailable",
            codes: revoked,
            beforeSha256: crypto
              .createHash("sha256")
              .update(before)
              .digest("hex"),
            afterSha256: crypto
              .createHash("sha256")
              .update(fs.readFileSync(markerPath))
              .digest("hex"),
            businessDataModified: false,
            replay: false,
            publish: false,
            ack: false,
          });
          const unavailable = (
            await load("storage/src/index.mjs")
          ).openProductionStore({ enabled: true });
          if (unavailable.status !== "unavailable")
            throw Error("production_enabled");
          save("local-refusals.json", {
            refusals,
            production: unavailable,
            replay: false,
            publish: false,
            ack: false,
          });
        }
        save("host-result.json", {
          status: "PASS WITH LIMITATION",
          runId: spec.runId,
          installed: true,
          rootMode: spec.rootMode ?? "temp",
          installationRootAdmitted: !!localProof?.ok,
          productionEnabled: false,
          shmDirectHandle: "unverified",
          replay: false,
          publish: false,
          ack: false,
        });
      } finally {
        if (coordination) await coordination.close();
        for (const h of lives) await h.close();
        save(
          "host-lifecycles.json",
          lives.map((h) => ({ status: h.status(), evidence: h.evidence() })),
        );
      }
      return { status: "PASS WITH LIMITATION" };
    },
  };
};
