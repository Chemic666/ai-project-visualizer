"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
function parse(args) {
  if (!args.length || (args.length === 1 && args[0] === "--list"))
    return { mode: "help" };
  const uuid = (s) =>
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s || "");
  if (
    args.length === 3 &&
    args[0] === "--preflight" &&
    args[1] === "--build-id" &&
    uuid(args[2])
  )
    return { mode: "preflight", buildId: args[2] };
  if (
    args.length === 6 &&
    args[0] === "--run-g2" &&
    args[1] === "--execute" &&
    args[2] === "--case" &&
    ["G2-W", "G2-S"].includes(args[3]) &&
    args[4] === "--build-id" &&
    uuid(args[5])
  )
    return { mode: "run", case: args[3], buildId: args[5] };
  throw new Error("EXECUTION_DISABLED_OR_INVALID_ARGUMENTS");
}
function validateFaultEvidence(native, expected) {
  for (const key of [
    "runId",
    "nonce",
    "operationNonce",
    "operationId",
    "intentDigest",
    "project",
    "generation",
    "epoch",
    "pid",
    "thread",
    "databaseFile",
    "mainFileId",
    "case",
  ])
    assert.deepEqual(native[key], expected[key], "FAULT_IDENTITY_" + key);
  assert.equal(native.actualVfsName, "apv_g2_fault_v1");
  assert.equal(native.queryStatus, "ok");
  const hits = native.events.filter((e) => e.injected === 1);
  if (native.hitCount === 0 && hits.length === 0)
    return { status: "NOT TESTED", reason: "native target was not hit" };
  assert.equal(native.hitCount, 1);
  assert.equal(hits.length, 1);
  for (const [i, e] of native.events.entries()) {
    assert.equal(e.seq, i + 1);
    assert.equal(e.pid, expected.pid);
    assert.equal(e.thread, expected.thread);
  }
  const hit = hits[0];
  assert.equal(hit.phase, 40);
  assert.equal(hit.kind, 2);
  assert.equal(hit.commitSerial, 1);
  assert.equal(hit.txnState, 2);
  assert.equal(hit.connection, native.connection);
  assert.equal(hit.mainFileId, expected.mainFileId);
  assert.equal(hit.delegated, 0);
  assert.equal(
    path.win32.normalize(hit.path),
    path.win32.normalize(expected.databaseFile + "-wal"),
  );
  assert.equal(hit.method, expected.case === "G2-W" ? "xWrite" : "xSync");
  assert.equal(hit.rc, expected.case === "G2-W" ? 778 : 1034);
  const enters = native.events.filter(
    (e) => e.method === "commit-enter" && e.commitSerial === 1,
  );
  const finishes = native.events.filter(
    (e) => e.method === "commit-profile" && e.commitSerial === 1,
  );
  assert.equal(enters.length, 1);
  assert.equal(finishes.length, 1);
  assert.equal(enters[0].sql.trim().replace(/;$/, ""), "COMMIT");
  assert.equal(enters[0].statement, hit.statement);
  assert.equal(hit.statement, finishes[0].statement);
  assert.equal(enters[0].connection, native.connection);
  assert.equal(finishes[0].connection, native.connection);
  assert(enters[0].seq < hit.seq && hit.seq < finishes[0].seq);
  return { status: "HIT", seq: hit.seq, nativeRc: hit.rc, method: hit.method };
}
module.exports = { parse, validateFaultEvidence };
