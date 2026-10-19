import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
try {
  const require = createRequire(path.join(spec.driverRoot, "package.json")),
    Database = require(spec.driverRoot);
  const core = await import(pathToFileURL(spec.corePath).href);
  const cap = admitSyntheticRoot({
    enabled: true,
    root: spec.root,
    reopen: true,
    expectedNonce: spec.nonce,
  });
  const store = openSyntheticStore(cap, {
    Database,
    applyNormalizedEvent: core.applyNormalizedEvent,
    processorFingerprint: spec.processorFingerprint,
    projectId: "PA",
    generation: "G1",
    bootstrap: seed(),
    ...(spec.mode === "rollback"
      ? {
          testHooks: {
            afterRecords() {
              throw new Error("PRIVATE_SENTINEL");
            },
          },
        }
      : {}),
  });
  let result;
  if (spec.mode === "recover") {
    assert.equal(spec.writerSettlement.status, 0);
    assert.equal(spec.writerSettlement.closed, true);
    assert.notEqual(spec.writerSettlement.pid, process.pid);
    const cut = store.read();
    assert.deepEqual(cut.state, spec.expectedState);
    assert.equal(cut.head, 2);
    assert.equal(store.writer().epoch, 2);
    result = {
      status: "recovered",
      cut,
      writer: store.writer(),
      replay: false,
      publish: false,
      ack: false,
    };
  } else
    try {
      result = store.commit({
        operationId: "op:E1",
        operationNonce: "nonce:E1",
        expectedHead: 1,
        writer: store.writer(),
        events: [input()],
        cursor: cursor(["E1"]),
      });
      if (spec.mode === "rollback") throw new Error("expected_failure_missing");
    } catch (error) {
      if (
        spec.mode !== "rollback" ||
        error?.code !== "unavailable" ||
        !store
          .evidence()
          .some((r) => r.phase === "rollback" && r.status === "returned")
      )
        throw error;
      result = {
        status: "unavailable",
        faultKind: "pre_commit_application_failure",
        replay: false,
        publish: false,
        ack: false,
      };
    }
  const loadedNativeFiles = Object.keys(require.cache).filter((name) =>
    name.endsWith(".node"),
  );
  if (
    loadedNativeFiles.length !== 1 ||
    loadedNativeFiles[0] !== spec.driverBinary ||
    createHash("sha256")
      .update(fs.readFileSync(loadedNativeFiles[0]))
      .digest("hex") !== spec.driverBinarySha256
  )
    throw new Error("native_binding_mismatch");
  const databaseFile = store.paths().project;
  const closed = store.close();
  fs.writeFileSync(
    path.join(spec.evidence, "writer.receipts.json"),
    JSON.stringify(
      {
        pid: process.pid,
        parentPid: process.ppid,
        nonce: spec.nonce,
        receipts: store.evidence(),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "writer.result.json"),
    JSON.stringify(
      {
        pid: process.pid,
        nonce: spec.nonce,
        databaseFile,
        closed: closed.status === "closed",
        productionWriteEnabled: false,
        loadedNativeFiles,
        nativeSha256: spec.driverBinarySha256,
        result,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
} catch (error) {
  console.error(error?.name === "StorageError" ? error.code : "writer_failed");
  process.exitCode = 1;
}
