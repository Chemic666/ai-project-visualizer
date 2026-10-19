import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  admitSyntheticRoot,
  inspectCapability,
} from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const require = createRequire(path.join(spec.driverRoot, "package.json"));
const Database = require(spec.driverRoot);
const core = await import(pathToFileURL(spec.corePath).href);
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
};
let rootSequence = 0;
const newRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  fs.writeFileSync(
    path.join(spec.evidence, `synthetic-root-${++rootSequence}.json`),
    JSON.stringify({ runId: spec.runId, root, pid: process.pid }),
    { flag: "wx" },
  );
  return root;
};
function fresh(extra = {}) {
  const cap = admitSyntheticRoot({ enabled: true, root: newRoot() });
  return {
    cap,
    store: openSyntheticStore(cap, { ...options, bootstrap: seed(), ...extra }),
  };
}
function commit(store, events, checkpoint, extra = {}) {
  return store.commit({
    operationId: "op:" + events.map((e) => e.id).join(":"),
    operationNonce: "nonce:" + events.map((e) => e.id).join(":"),
    expectedHead: store.read().head,
    writer: store.writer(),
    events,
    ...(checkpoint ? { cursor: checkpoint } : {}),
    ...extra,
  });
}

test("S01: closed Writer process precedes independent nine-table SQL Reader", () => {
  const root = newRoot(),
    cap = admitSyntheticRoot({ enabled: true, root }),
    info = inspectCapability(cap);
  const writerSpec = path.join(spec.evidence, "writer.spec.json");
  fs.writeFileSync(
    writerSpec,
    JSON.stringify({ ...spec, root, nonce: info.nonce }),
    { flag: "wx" },
  );
  const workerFile = fileURLToPath(
    new URL("./writer-process.mjs", import.meta.url),
  );
  const writerArgs = [workerFile, writerSpec];
  const writer = spawnSync(process.execPath, writerArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  fs.writeFileSync(
    path.join(spec.evidence, "writer.command.json"),
    JSON.stringify({ args: writerArgs, pid: writer.pid }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "writer.exit.json"),
    JSON.stringify({
      pid: writer.pid,
      status: writer.status,
      signal: writer.signal,
    }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "writer.stdout.txt"),
    writer.stdout,
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "writer.stderr.txt"),
    writer.stderr,
    { flag: "wx" },
  );
  assert.equal(writer.status, 0);
  assert.equal(writer.signal, null);
  assert.equal(writer.stderr, "");
  const receipt = JSON.parse(
    fs.readFileSync(path.join(spec.evidence, "writer.result.json"), "utf8"),
  );
  assert.equal(receipt.pid, writer.pid);
  assert.equal(receipt.closed, true);
  assert.equal(receipt.productionWriteEnabled, false);
  const recoveryEvidence = path.join(spec.evidence, "recovery");
  fs.mkdirSync(recoveryEvidence);
  const recoverySpec = path.join(recoveryEvidence, "spec.json");
  const expectedState = core.applyNormalizedEvent(seed(), input()).state;
  const writerSettlement = {
    pid: writer.pid,
    status: writer.status,
    closed: receipt.closed,
  };
  fs.writeFileSync(
    recoverySpec,
    JSON.stringify({
      ...spec,
      root,
      nonce: info.nonce,
      evidence: recoveryEvidence,
      mode: "recover",
      expectedState,
      writerSettlement,
    }),
    { flag: "wx" },
  );
  const recoveryArgs = [workerFile, recoverySpec];
  const recovery = spawnSync(process.execPath, recoveryArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  for (const [name, value] of [
    [
      "command.json",
      JSON.stringify({
        args: recoveryArgs,
        pid: recovery.pid,
        afterWriterExit: true,
      }),
    ],
    [
      "exit.json",
      JSON.stringify({
        pid: recovery.pid,
        status: recovery.status,
        signal: recovery.signal,
      }),
    ],
    ["stdout.txt", recovery.stdout],
    ["stderr.txt", recovery.stderr],
  ])
    fs.writeFileSync(path.join(recoveryEvidence, name), value, { flag: "wx" });
  assert.equal(recovery.status, 0);
  assert.equal(recovery.signal, null);
  assert.equal(recovery.stderr, "");
  assert.notEqual(recovery.pid, writer.pid);
  const recovered = JSON.parse(
    fs.readFileSync(path.join(recoveryEvidence, "writer.result.json"), "utf8"),
  );
  assert.equal(recovered.pid, recovery.pid);
  assert.equal(recovered.closed, true);
  assert.equal(recovered.nonce, info.nonce);
  assert.equal(recovered.databaseFile, receipt.databaseFile);
  assert.deepEqual(recovered.result.cut.state, expectedState);
  assert.equal(recovered.result.writer.epoch, 2);
  const readerSpec = path.join(spec.evidence, "reader.spec.json");
  fs.writeFileSync(
    readerSpec,
    JSON.stringify({
      ...spec,
      databaseFile: receipt.databaseFile,
      expectedWriterEpoch: 2,
      recoverySettlement: {
        pid: recovery.pid,
        status: recovery.status,
        closed: recovered.closed,
      },
      writerSettlement: {
        pid: writer.pid,
        status: writer.status,
        closed: receipt.closed,
      },
      expectedState: core.applyNormalizedEvent(seed(), input()).state,
    }),
    { flag: "wx" },
  );
  const readerArgs = [
    fileURLToPath(new URL("./sql-reader.mjs", import.meta.url)),
    readerSpec,
  ];
  const reader = spawnSync(process.execPath, readerArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  fs.writeFileSync(
    path.join(spec.evidence, "reader.command.json"),
    JSON.stringify({
      args: readerArgs,
      pid: reader.pid,
      afterWriterExit: true,
    }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "reader.exit.json"),
    JSON.stringify({
      pid: reader.pid,
      status: reader.status,
      signal: reader.signal,
    }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "reader.stdout.txt"),
    reader.stdout,
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "reader.stderr.txt"),
    reader.stderr,
    { flag: "wx" },
  );
  assert.equal(reader.status, 0);
  assert.equal(reader.signal, null);
  assert.equal(reader.stderr, "");
  assert.notEqual(reader.pid, writer.pid);
  const oracle = JSON.parse(
    fs.readFileSync(path.join(spec.evidence, "reader.result.json"), "utf8"),
  );
  assert.equal(oracle.pid, reader.pid);
  assert.equal(oracle.tableCount, 9);
  assert.equal(oracle.fullStateMatch, true);
  fs.writeFileSync(
    path.join(spec.evidence, "S01-root.json"),
    JSON.stringify({ root, nonce: info.nonce }),
    { flag: "wx" },
  );
  assert.equal(recovered.result.cut.head, 2);
});

test("S02: partial records rollback, actual Writer exit, independent complete baseline SQL cut", () => {
  const evidence = path.join(spec.evidence, "S02");
  fs.mkdirSync(evidence);
  const root = newRoot(),
    cap = admitSyntheticRoot({ enabled: true, root }),
    info = inspectCapability(cap);
  const writerSpec = path.join(evidence, "writer.spec.json");
  fs.writeFileSync(
    writerSpec,
    JSON.stringify({
      ...spec,
      evidence,
      root,
      nonce: info.nonce,
      mode: "rollback",
    }),
    { flag: "wx" },
  );
  const writerArgs = [
    fileURLToPath(new URL("./writer-process.mjs", import.meta.url)),
    writerSpec,
  ];
  const writer = spawnSync(process.execPath, writerArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  for (const [name, value] of [
    [
      "writer.command.json",
      JSON.stringify({ pid: writer.pid, args: writerArgs }),
    ],
    ["writer.stdout.txt", writer.stdout],
    ["writer.stderr.txt", writer.stderr],
    [
      "writer.exit.json",
      JSON.stringify({
        pid: writer.pid,
        status: writer.status,
        signal: writer.signal,
      }),
    ],
  ])
    fs.writeFileSync(path.join(evidence, name), value, { flag: "wx" });
  assert.equal(writer.status, 0);
  assert.equal(writer.signal, null);
  assert.equal(writer.stderr, "");
  const result = JSON.parse(
    fs.readFileSync(path.join(evidence, "writer.result.json"), "utf8"),
  );
  assert.equal(result.result.status, "unavailable");
  assert.equal(result.closed, true);
  const receipts = JSON.parse(
    fs.readFileSync(path.join(evidence, "writer.receipts.json"), "utf8"),
  ).receipts;
  assert(
    receipts.some(
      (r) =>
        r.phase === "rollback" &&
        r.status === "returned" &&
        r.transactionActive === false,
    ),
  );
  assert(!receipts.some((r) => r.phase === "commit-enter"));
  const readerSpec = path.join(evidence, "reader.spec.json");
  fs.writeFileSync(
    readerSpec,
    JSON.stringify({
      ...spec,
      evidence,
      databaseFile: result.databaseFile,
      expectedState: seed(),
      expectedHead: 1,
      writerSettlement: {
        pid: writer.pid,
        status: writer.status,
        closed: result.closed,
      },
    }),
    { flag: "wx" },
  );
  const readerArgs = [
    fileURLToPath(new URL("./sql-reader.mjs", import.meta.url)),
    readerSpec,
  ];
  const reader = spawnSync(process.execPath, readerArgs, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  for (const [name, value] of [
    [
      "reader.command.json",
      JSON.stringify({
        pid: reader.pid,
        args: readerArgs,
        afterWriterExit: true,
      }),
    ],
    ["reader.stdout.txt", reader.stdout],
    ["reader.stderr.txt", reader.stderr],
    [
      "reader.exit.json",
      JSON.stringify({
        pid: reader.pid,
        status: reader.status,
        signal: reader.signal,
      }),
    ],
  ])
    fs.writeFileSync(path.join(evidence, name), value, { flag: "wx" });
  assert.equal(reader.status, 0);
  assert.equal(reader.signal, null);
  assert.equal(reader.stderr, "");
  const oracle = JSON.parse(
    fs.readFileSync(path.join(evidence, "reader.result.json"), "utf8"),
  );
  assert.equal(oracle.head, 1);
  assert.equal(oracle.fullStateMatch, true);
});

test("S02/S09/P01/P02/P05: refusals and partial-write failure preserve the complete cut", () => {
  let fail = false;
  const { store } = fresh({
    testHooks: {
      afterRecords() {
        if (fail) throw new Error("PRIVATE_SENTINEL");
      },
    },
  });
  const before = store.read();
  for (const bad of [
    () => commit(store, [{ ...input(), rawPrompt: "PRIVATE_SENTINEL" }]),
    () => commit(store, [{ ...input(), projectId: "PB" }]),
    () => commit(store, [input()], cursor(["MISSING"])),
    () => commit(store, [input()], cursor(["E1"]), { expectedHead: 0 }),
    () =>
      commit(store, [input()], cursor(["E1"]), {
        writer: { ...store.writer(), epoch: 0 },
      }),
    () =>
      commit(store, [input()], cursor(["E1"]), {
        writer: { ...store.writer(), token: "retired" },
      }),
    () =>
      commit(store, [input()], cursor(["E1"]), {
        writer: { ...store.writer(), generation: "G2" },
      }),
  ]) {
    assert.throws(bad);
    assert.deepEqual(store.read(), before);
  }
  fail = true;
  assert.throws(
    () => commit(store, [input()], cursor(["E1"])),
    (e) => e.code === "unavailable" && !e.message.includes("PRIVATE_SENTINEL"),
  );
  assert.deepEqual(store.read(), before);
  assert(
    store
      .evidence()
      .some((r) => r.phase === "rollback" && r.status === "returned"),
  );
  function noSentinel(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, file.name);
      if (file.isDirectory()) noSentinel(p);
      else {
        const bytes = fs.readFileSync(p);
        assert.equal(bytes.includes(Buffer.from("PRIVATE_SENTINEL")), false);
        assert.equal(
          bytes.includes(Buffer.from("PRIVATE_SENTINEL", "utf16le")),
          false,
        );
      }
    }
  }
  noSentinel(
    path.dirname(
      path.dirname(path.dirname(path.dirname(store.paths().project))),
    ),
  );
  fail = false;
  commit(store, [input()], cursor(["E1"]));
  assert.equal(store.read().head, 2);
  store.close();
  assert.throws(() => fresh({ limits: { logicalBytes: 1 } }), {
    code: "quota_exceeded",
  });
});

test("S06/S07/S08/S09: exact claims, stable aliases, missing identity and shared Cursor", () => {
  const { store } = fresh();
  const first = commit(store, [input()], cursor(["E1"]));
  const replay = commit(store, [input()], cursor(["E1"]), {
    operationId: first.receipt.operationId,
    expectedHead: 1,
  });
  assert.equal(replay.status, "already_committed");
  assert.equal(store.read().head, 2);
  const alias = {
    ...input(),
    id: "ALIAS",
    receivedAt: "2026-10-19T00:01:00.000Z",
  };
  commit(store, [alias], cursor(["E1"], "batch:2", "batch:1"));
  assert.deepEqual(
    store.read().state.acceptedEvents.map((e) => e.id),
    ["E1"],
  );
  assert.throws(
    () =>
      commit(store, [
        { ...input(), payload: { taskId: "TA", status: "blocked" } },
      ]),
    { code: "identity_conflict" },
  );
  assert.throws(
    () =>
      commit(store, [
        { ...alias, payload: { taskId: "TA", status: "blocked" } },
      ]),
    { code: "identity_conflict" },
  );
  const e2 = input("E2", false),
    e3 = input("E3", false);
  commit(store, [e2, e3], cursor(["E2", "E3"], "batch:3", "batch:2"));
  assert.deepEqual(
    store.read().state.acceptedEvents.map((e) => e.id),
    ["E1", "E2", "E3"],
  );
  assert.deepEqual(store.read().cursor[0].coveredEventIds, ["E2", "E3"]);
  store.close();
});

test("O01: separate OS process cannot acquire the live Owner", () => {
  const { cap, store } = fresh();
  const info = inspectCapability(cap);
  const file = path.join(spec.evidence, "competitor.spec.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ ...spec, root: info.root, nonce: info.nonce }),
    { flag: "wx" },
  );
  const args = [
    fileURLToPath(new URL("./competitor-process.mjs", import.meta.url)),
    file,
  ];
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  fs.writeFileSync(
    path.join(spec.evidence, "competitor.command.json"),
    JSON.stringify({ args, pid: child.pid }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "competitor.exit.json"),
    JSON.stringify({
      pid: child.pid,
      status: child.status,
      signal: child.signal,
    }),
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "competitor.stdout.txt"),
    child.stdout,
    { flag: "wx" },
  );
  fs.writeFileSync(
    path.join(spec.evidence, "competitor.stderr.txt"),
    child.stderr,
    { flag: "wx" },
  );
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  const result = JSON.parse(
    fs.readFileSync(path.join(spec.evidence, "competitor.result.json"), "utf8"),
  );
  assert.notEqual(result.pid, process.pid);
  assert.equal(result.nonce, info.nonce);
  assert.equal(result.status, "ownership_busy");
  assert.equal(store.read().head, 1);
  store.close();
});

test("P03/S12: observed binding failure permanently retires the original capability", () => {
  const { store } = fresh();
  const paths = store.paths();
  fs.renameSync(paths.catalog, paths.catalog + ".preserved");
  assert.throws(() => store.read(), { code: "unavailable" });
  fs.renameSync(paths.catalog + ".preserved", paths.catalog);
  assert.throws(() => commit(store, [input()], cursor(["E1"])), {
    code: "unavailable",
  });
  store.close();
});

test("P03/O01: final transaction guard binding failure cannot revive after rollback", () => {
  let move = false,
    paths;
  const { store } = fresh({
    testHooks: {
      afterRecords() {
        if (move) fs.renameSync(paths.catalog, paths.catalog + ".preserved");
      },
    },
  });
  paths = store.paths();
  move = true;
  assert.throws(() => commit(store, [input()], cursor(["E1"])), {
    code: "binding_conflict",
  });
  fs.renameSync(paths.catalog + ".preserved", paths.catalog);
  move = false;
  assert.throws(() => store.read(), { code: "unavailable" });
  store.close();
});

test("M01/S12/P01: a digest-consistent unknown receipt field is not admitted on restore", () => {
  const { cap, store } = fresh();
  const paths = store.paths();
  store.close();
  const raw = new Database(paths.project, { fileMustExist: true });
  const intent = JSON.parse(
    raw.prepare("SELECT intent_json FROM commits WHERE seq=1").get()
      .intent_json,
  );
  intent.rawPrompt = "PRIVATE_SENTINEL";
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, canonical(v[k])]),
      );
    return v;
  }
  const json = JSON.stringify(canonical(intent));
  raw
    .prepare("UPDATE commits SET intent_json=?,intent_digest=? WHERE seq=1")
    .run(json, createHash("sha256").update(json).digest("hex"));
  raw.close();
  assert.throws(() => openSyntheticStore(cap, options), {
    code: "unavailable",
  });
});

test("S12/M01/O01: missing authority, missing active file, changed binding and duplicate owner fail closed", () => {
  const { cap, store } = fresh();
  assert.throws(() => openSyntheticStore(cap, options), {
    code: "ownership_busy",
  });
  commit(store, [input()], cursor(["E1"]));
  const paths = store.paths();
  store.close();
  const raw = new Database(paths.project, { fileMustExist: true });
  raw.exec("DELETE FROM assertions WHERE id='WA'");
  raw.close();
  assert.throws(() => openSyntheticStore(cap, options), {
    code: "unavailable",
  });
  assert(fs.existsSync(paths.project));
  const missing = fresh();
  const missingPaths = missing.store.paths();
  missing.store.close();
  fs.renameSync(missingPaths.project, missingPaths.project + ".preserved");
  assert.throws(() => openSyntheticStore(missing.cap, options), {
    code: "binding_conflict",
  });
  assert.equal(fs.existsSync(missingPaths.project), false);
  const identity = fresh();
  const identityPaths = identity.store.paths();
  identity.store.close();
  fs.renameSync(identityPaths.owner, identityPaths.owner + ".preserved");
  fs.writeFileSync(identityPaths.owner, "", { flag: "wx" });
  assert.throws(() => openSyntheticStore(identity.cap, options), {
    code: "binding_conflict",
  });
});
