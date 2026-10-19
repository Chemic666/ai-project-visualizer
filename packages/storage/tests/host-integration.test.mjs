import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  admitSyntheticRoot,
  inspectCapability,
} from "../src/host-admission.mjs";
import { launchSyntheticHost } from "../src/host-development.mjs";
import { openHost } from "../src/host.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const core = await import(pathToFileURL(spec.corePath).href);
const require = createRequire(path.join(spec.driverRoot, "package.json")),
  Database = require(spec.driverRoot);
const options = {
  driverRoot: spec.driverRoot,
  driverBinarySha256: spec.driverBinarySha256,
  corePath: spec.corePath,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  bootstrap: seed(),
};
const lives = [];
let roots = 0;
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  fs.writeFileSync(
    path.join(spec.evidence, `synthetic-root-${++roots}.json`),
    JSON.stringify({ root, runId: spec.runId }),
    { flag: "wx" },
  );
  return { root, cap: admitSyntheticRoot({ enabled: true, root }) };
}
function start(cap, extra = {}) {
  const host = launchSyntheticHost(cap, { ...options, ...extra });
  lives.push(host);
  return host;
}
async function endAll() {
  for (const host of lives) await host.close();
}
test.after(async () => {
  await endAll();
  fs.writeFileSync(
    path.join(spec.evidence, "host-lifecycles.json"),
    JSON.stringify(
      lives.map((h) => ({ status: h.status(), evidence: h.evidence() })),
      null,
      2,
    ),
    { flag: "wx" },
  );
});
test.after(() => {
  for (const host of lives) {
    const headers = host
      .evidence()
      .filter((e) => e.kind === "worker-envelope")
      .map((e) => e.data);
    assert(headers.length > 0);
    headers.forEach((h, index) => {
      assert.equal(h.workerSeq, index + 1);
      assert.equal(h.workerPid, host.status().pid);
      assert.equal(h.nonce, host.status().nonce);
    });
  }
});
function request(ready, event = input()) {
  return {
    operationId: "op:E1",
    operationNonce: "nonce:E1",
    expectedHead: 1,
    writer: ready.writer,
    events: [event],
    cursor: cursor(["E1"]),
  };
}
function files(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? files(path.join(root, d.name))
        : [path.join(root, d.name)],
    );
}

test("O02/P03: production Host is unavailable and creates no Worker", () => {
  assert.deepEqual(openHost({ enabled: true }), {
    status: "unavailable",
    reason: "physical_binding_unverified",
  });
});
test("O01-a/f/P02: simultaneous first-open processes converge or reject, never create alternate authority", async () => {
  const { root, cap } = fresh();
  const a = start(cap, { holdAtAdmission: true }),
    b = start(cap, { holdAtAdmission: true });
  await Promise.all([a.admitted, b.admitted]);
  a.activate();
  b.activate();
  const outcomes = await Promise.allSettled([a.ready, b.ready]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const winner = outcomes[0].status === "fulfilled" ? a : b,
    loser = winner === a ? b : a;
  const ready = await winner.ready;
  assert.notEqual(a.status().pid, b.status().pid);
  const settled = await loser.closed;
  assert.equal(settled.processExited, true);
  assert.equal((await winner.read()).head, 1);
  await winner.close();
  const all = files(path.join(root, "private"));
  assert.equal(
    all.filter((f) => path.basename(f) === "catalog.sqlite").length,
    1,
  );
  assert.equal(
    all.filter((f) => path.basename(f) === "owner.sqlite").length,
    1,
  );
  assert.equal(
    all.filter((f) => path.basename(f) === "project.sqlite").length,
    1,
  );
  const catalog = new Database(ready.paths.catalog, {
    readonly: true,
    fileMustExist: true,
  });
  const bindings = catalog.prepare("SELECT * FROM bindings").all();
  catalog.close();
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].project_id, "PA");
  assert.equal(bindings[0].generation, "G1");
  assert.equal(bindings[0].lifecycle, "active");
  fs.writeFileSync(
    path.join(spec.evidence, "first-binding-cut.json"),
    JSON.stringify({ bindings, files: all }),
    { flag: "wx" },
  );
});
test("O01-b/h/S01/S05/P01: single Owner, close drain, new-process handoff, old capabilities and independent SQL cut", async () => {
  const { root, cap } = fresh(),
    one = start(cap),
    r1 = await one.ready;
  assert.equal(r1.resourceBinding.actualDriverHandleIdentity, "unavailable");
  assert.equal(
    r1.resourceBinding.reportedConnections.project.sqliteReportedName,
    r1.paths.project,
  );
  const competing = start(cap);
  await assert.rejects(competing.ready, { code: "ownership_busy" });
  await competing.closed;
  await assert.rejects(
    one.commit({ ...request(r1), rawPrompt: "PRIVATE_SENTINEL" }),
    { code: "admission_rejected" },
  );
  assert.equal((await one.read()).head, 1);
  assert(!JSON.stringify(one.evidence()).includes("PRIVATE_SENTINEL"));
  const accepted = one.commit(request(r1)),
    closing = one.close();
  await assert.rejects(one.commit(request(r1)), { code: "unavailable" });
  const committed = await accepted;
  assert.equal(committed.status, "committed");
  assert.equal(committed.ack, false);
  assert.equal(committed.publish, false);
  assert.equal(committed.replay, false);
  const exited = await closing;
  assert.equal(exited.status, "closed");
  assert.equal(exited.processExited, true);
  assert.equal(exited.exitCode, 0);
  const expectedStages = [
    "ADMITTED",
    "OWNER_HELD_UNFENCED",
    "RECOVERED",
    "FENCED",
    "ACTIVE",
    "REVOKING",
    "DRAINED",
    "CLOSED",
  ];
  assert.deepEqual(
    one.status().history.map((r) => r.phase),
    expectedStages,
  );
  const receipts = one
    .evidence()
    .filter((r) => r.kind === "settled")
    .at(-1).data.storeEvidence;
  assert(
    receipts.findIndex((e) => e.phase === "project-close") <
      receipts.findIndex((e) => e.phase === "owner-release"),
  );
  const two = start(cap),
    r2 = await two.ready;
  assert.equal(r2.writer.epoch, 2);
  assert.notEqual(r2.writer.token, r1.writer.token);
  assert.notEqual(r2.pid, r1.pid);
  assert.deepEqual(
    (await two.read()).state,
    core.applyNormalizedEvent(seed(), input()).state,
  );
  await assert.rejects(two.commit(request(r1)), { code: "stale_writer" });
  const retry = await two.commit(request(r2));
  assert.equal(retry.status, "already_committed");
  assert.equal(retry.receipt.epoch, 1);
  assert.equal(retry.head, 2);
  const ended = await two.close();
  assert.equal(ended.exitCode, 0);
  const readerSpec = path.join(spec.evidence, "reader.spec.json");
  fs.writeFileSync(
    readerSpec,
    JSON.stringify({
      ...spec,
      databaseFile: r1.paths.project,
      writerSettlement: { pid: r1.pid, status: exited.exitCode, closed: true },
      recoverySettlement: { pid: r2.pid, status: ended.exitCode, closed: true },
      expectedWriterEpoch: 2,
      expectedState: core.applyNormalizedEvent(seed(), input()).state,
    }),
    { flag: "wx" },
  );
  const args = [
    fileURLToPath(new URL("./sql-reader.mjs", import.meta.url)),
    readerSpec,
  ];
  const reader = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  for (const [name, value] of [
    [
      "reader.command.json",
      JSON.stringify({ pid: reader.pid, args, afterBothHostExits: true }),
    ],
    [
      "reader.exit.json",
      JSON.stringify({
        pid: reader.pid,
        status: reader.status,
        signal: reader.signal,
      }),
    ],
    ["reader.stdout.txt", reader.stdout],
    ["reader.stderr.txt", reader.stderr],
  ])
    fs.writeFileSync(path.join(spec.evidence, name), value, { flag: "wx" });
  assert.equal(reader.status, 0);
  assert.equal(reader.signal, null);
  assert.equal(reader.stderr, "");
  fs.writeFileSync(
    path.join(spec.evidence, "handoff-root.json"),
    JSON.stringify({ root, nonce: inspectCapability(cap).nonce }),
    { flag: "wx" },
  );
});
test("P03/O01-f/S12: visible catalog identity loss revokes, replacement is not authority", async () => {
  const { root, cap } = fresh(),
    host = start(cap),
    ready = await host.ready;
  const original = ready.paths.catalog + ".preserved";
  fs.renameSync(ready.paths.catalog, original);
  fs.writeFileSync(ready.paths.catalog, "", { flag: "wx" });
  await assert.rejects(host.read(), { code: "unavailable" });
  await host.closed;
  assert.equal(host.status().phase, "CLOSED");
  await assert.rejects(host.commit(request(ready)), { code: "unavailable" });
  const retry = start(cap);
  await assert.rejects(retry.ready);
  await retry.closed;
  assert.equal(fs.statSync(ready.paths.catalog).size, 0);
  assert(fs.existsSync(original));
  assert.equal(
    files(root).filter((f) => path.basename(f) === "project.sqlite").length,
    1,
  );
});
test("P03/O01-f/M01: Owner/Project identity mismatch after normal close is unavailable without recreation", async () => {
  for (const kind of ["owner", "project"]) {
    const { root, cap } = fresh(),
      host = start(cap),
      ready = await host.ready;
    await host.close();
    const target = ready.paths[kind];
    fs.renameSync(target, target + ".preserved");
    fs.writeFileSync(target, "", { flag: "wx" });
    const retry = start(cap);
    await assert.rejects(retry.ready, { code: "binding_conflict" });
    await retry.closed;
    assert.equal(fs.statSync(target).size, 0);
    assert(fs.existsSync(target + ".preserved"));
    assert.equal(
      files(root).filter((f) => path.basename(f) === "project.sqlite").length,
      1,
    );
  }
});
test("O01-h/P01: close before activation creates no catalog and rejects new input", async () => {
  const { root, cap } = fresh(),
    host = start(cap, { holdAtAdmission: true });
  await host.admitted;
  const end = await host.close();
  assert.equal(end.processExited, true);
  assert.equal(end.status, "closed");
  assert.equal(fs.readdirSync(path.join(root, "private")).length, 0);
  await assert.rejects(host.commit({ rawPrompt: "PRIVATE_SENTINEL" }), {
    code: "unavailable",
  });
});

test(
  "S01/S10: full acceptedEvents above 8 MiB remains readable and committable with small snapshots",
  { timeout: 45000 },
  async () => {
    const { cap } = fresh(),
      initial = seed();
    initial.acceptedEvents = Array.from({ length: 9 }, (_, index) => ({
      id: "large:" + index,
      schemaVersion: 1,
      projectId: "PA",
      sourceId: "SRC",
      receivedAt: "2026-10-19T00:00:00Z",
      type: "plan.detected",
      payload: {
        completeness: "partial",
        steps: Array.from({ length: 1900 }, () => ({ title: "A".repeat(500) })),
      },
    }));
    assert(
      Buffer.byteLength(JSON.stringify(initial.acceptedEvents)) >
        8 * 1024 * 1024,
    );
    const host = start(cap, { bootstrap: initial }),
      ready = await host.ready;
    assert.equal((await host.read()).state.acceptedEvents.length, 9);
    const result = await host.commit(request(ready));
    assert.equal(result.status, "committed");
    assert.equal(result.state.acceptedEvents.length, 10);
    assert.equal(result.ack, false);
    const end = await host.close();
    assert.equal(end.status, "closed");
    const db = new Database(ready.paths.project, {
      readonly: true,
      fileMustExist: true,
    });
    const snapshotBytes = db
      .prepare(
        "SELECT watermark,length(CAST(body AS BLOB)) AS bytes FROM snapshots ORDER BY watermark",
      )
      .all();
    const eventCount = db
      .prepare("SELECT count(*) AS n FROM normalized_events")
      .get().n;
    db.close();
    assert.equal(eventCount, 10);
    assert(snapshotBytes.every((row) => row.bytes < 8 * 1024 * 1024));
    fs.writeFileSync(
      path.join(spec.evidence, "large-ledger-size-cut.json"),
      JSON.stringify({ eventCount, snapshotBytes, writerExit: end }),
      { flag: "wx" },
    );
  },
);
