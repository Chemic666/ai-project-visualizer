"use strict";

// Pure tests only: importing these modules must never open DBs or spawn workers.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canCommit,
  canTransition,
  intentDigest,
  safeError,
} = require("./protocol.cjs");
const {
  aggregate,
  classifyCounterexample,
  validateReceipt,
  CASE_IDS,
} = require("./oracle.cjs");
const { Writer, hash } = require("./protocol.cjs");
const { verifySQL, verifyOP04Cut } = require("./oracle.cjs");
const { parseArgs, outcome } = require("./runner.cjs");
const {
  VARIANTS,
  completeOP04,
  verifyBusyCut,
  verifyBlockedCandidate,
  verifyWatchdog,
} = require("./scenarios.cjs");

const capability = { generation: "G1", epoch: 1, token: "token-A" };
const held = {
  open: true,
  inTransaction: true,
  state: "WRITING",
  ...capability,
};

test("owner acquisition and fencing must precede ACTIVE", () => {
  assert.equal(canTransition("ACQUIRING", "ACTIVE"), false);
  assert.equal(canTransition("HELD_UNFENCED", "ACTIVE"), false);
  assert.equal(canTransition("FENCING", "ACTIVE"), true);
  assert.equal(canTransition("LOST", "ACTIVE"), false);
  assert.equal(canTransition("CLOSED", "ACTIVE"), false);
});

test("observable owner loss rejects old transaction even before epoch changes", () => {
  assert.equal(canCommit(held, capability), true);
  assert.equal(canCommit({ ...held, inTransaction: false }, capability), false);
  assert.equal(canCommit({ ...held, open: false }, capability), false);
  assert.equal(canCommit({ ...held, state: "LOST" }, capability), false);
});

test("epoch, token and generation mismatch all reject", () => {
  for (const mutation of [
    { epoch: 2 },
    { token: "token-B" },
    { generation: "G2" },
  ]) {
    assert.equal(canCommit(held, { ...capability, ...mutation }), false);
  }
});

test("retry intent excludes transient owner capability without masking changed input", () => {
  const intent = { operationId: "O1", base: 0, increment: 1 };
  assert.equal(
    intentDigest({ ...intent, epoch: 1, token: "A" }),
    intentDigest({ ...intent, epoch: 2, token: "B" }),
  );
  assert.notEqual(
    intentDigest(intent),
    intentDigest({ ...intent, increment: 2 }),
  );
});

test("FAIL cannot be overwritten by NOT TESTED; absent checks never PASS", () => {
  assert.equal(aggregate(["PASS", "PASS"]), "PASS");
  assert.equal(aggregate(["PASS", "FAIL"]), "FAIL");
  assert.equal(aggregate(["FAIL", "NOT TESTED"]), "FAIL");
  assert.equal(aggregate(["PASS", "NOT TESTED"]), "NOT TESTED");
  assert.equal(aggregate([]), "NOT TESTED");
  assert.throws(() => aggregate(["unexpected"]));
});

test("unsafe baseline reproduction is distinct from guarded success", () => {
  assert.equal(
    classifyCounterexample({
      mode: "unsafe_baseline",
      ownerLost: true,
      committed: true,
      sameEpoch: true,
    }),
    "EXPECTED COUNTEREXAMPLE",
  );
  assert.equal(
    classifyCounterexample({
      mode: "protected",
      ownerLost: true,
      committed: true,
      sameEpoch: true,
    }),
    "FAIL",
  );
  assert.equal(
    classifyCounterexample({
      mode: "unsafe_baseline",
      ownerLost: true,
      committed: false,
      sameEpoch: true,
    }),
    "NOT REPRODUCED",
  );
  assert.equal(
    classifyCounterexample({ mode: "unsafe_baseline" }),
    "NOT TESTED",
  );
});

test("receipt requires run, case, worker, nonce and monotonic sequence binding", () => {
  const expected = {
    runId: "run",
    caseId: "OP01",
    workerId: "A",
    nonce: "nonce",
  };
  const receipt = { ...expected, sequence: 1, kind: "hello", data: {} };
  assert.equal(validateReceipt(receipt, expected, 0), true);
  for (const field of ["runId", "caseId", "workerId", "nonce"]) {
    assert.throws(() =>
      validateReceipt({ ...receipt, [field]: "wrong" }, expected, 0),
    );
  }
  assert.throws(() => validateReceipt(receipt, expected, 1));
  assert.throws(() =>
    validateReceipt({ ...receipt, sequence: 3 }, expected, 0),
  );
  assert.throws(() => validateReceipt(null, expected, 0));
});

test("safe diagnostics never forward raw exception contents", () => {
  const error = new Error("password=private D:\\Users\\private");
  error.code = "SQLITE_BUSY";
  assert.deepEqual(safeError(error), { category: "SQLITE_BUSY" });
  assert.deepEqual(safeError(new Error("secret")), {
    category: "HARNESS_ERROR",
  });
});

test("exactly the ten approved case IDs are exposed", () => {
  assert.deepEqual(
    CASE_IDS,
    Array.from(
      { length: 10 },
      (_, index) => `OP${String(index + 1).padStart(2, "0")}`,
    ),
  );
});

function fakeWriter(mode = "protected", options = {}) {
  // This is a plain in-memory SQL-interface double, not SQLite execution.
  // It proves JS guard/rollback control flow only; native locks stay NOT TESTED.
  const initial = hash({ head: 0, value: 0 });
  const records = {
    meta: {
      project_id: "PA",
      generation: "G1",
      lifecycle: "active",
      epoch: 0,
      token: null,
      head: 0,
      digest: initial,
    },
    state: { value: 0, digest: initial },
    writes: [],
  };
  const events = [];
  const calls = [];
  function connection(kind) {
    let saved;
    return {
      open: true,
      inTransaction: false,
      exec(sql) {
        calls.push(`${kind}:${sql}`);
        if (
          kind === "project" &&
          sql === "BEGIN IMMEDIATE" &&
          options.projectBusy
        )
          throw Object.assign(new Error("fixture contention"), {
            code: "SQLITE_BUSY",
          });
        if (sql.startsWith("INSERT INTO store_meta SELECT"))
          throw Object.assign(new Error("duplicate fixture control row"), {
            code: "SQLITE_CONSTRAINT_PRIMARYKEY",
          });
        if (sql.startsWith("BEGIN")) {
          saved = structuredClone(records);
          this.inTransaction = true;
        }
        if (sql === "COMMIT") {
          this.inTransaction = false;
          saved = undefined;
        }
        if (sql === "ROLLBACK") {
          if (options.ownerRollbackFails && kind === "owner")
            throw Object.assign(new Error("fixture release failure"), {
              code: "SQLITE_IOERR",
            });
          if (options.rollbackFails && kind === "project")
            throw Object.assign(new Error("private"), { code: "SQLITE_IOERR" });
          if (kind === "project") Object.assign(records, saved);
          saved = undefined;
          this.inTransaction = false;
        }
      },
      close() {
        if (options.projectCloseFails && kind === "project")
          throw Object.assign(new Error("fixture close failure"), {
            code: "SQLITE_IOERR",
          });
        if (options.ownerCloseFails && kind === "owner")
          throw Object.assign(new Error("fixture close failure"), {
            code: "SQLITE_IOERR",
          });
        this.open = false;
        calls.push(`${kind}:CLOSE`);
      },
      pragma(sql) {
        return sql === "journal_mode" ? "delete" : undefined;
      },
      prepare(sql) {
        return {
          get(id) {
            if (sql.includes("owner_meta"))
              return {
                magic: "APV_OWNER_SPIKE",
                schema_version: 1,
                store_key: "S1",
              };
            if (sql.includes("store_meta")) return { ...records.meta };
            if (sql.includes("writes"))
              return records.writes.find((row) => row.operation_id === id);
            throw new Error(`Unsupported fake SELECT ${sql}`);
          },
          run(...args) {
            if (sql.startsWith("UPDATE store_meta SET epoch")) {
              records.meta.epoch = args[0];
              records.meta.token = args[1];
            } else if (sql.startsWith("UPDATE fixture_state")) {
              records.state.value = args[0];
              records.state.digest = args[1];
            } else if (sql.startsWith("INSERT INTO writes")) {
              records.writes.push(
                Object.fromEntries(
                  [
                    "operation_id",
                    "intent_digest",
                    "epoch",
                    "token",
                    "base_head",
                    "new_head",
                    "result_digest",
                  ].map((key, i) => [key, args[i]]),
                ),
              );
            } else if (sql.startsWith("UPDATE store_meta SET head")) {
              records.meta.head = args[0];
              records.meta.digest = args[1];
            } else throw new Error(`Unsupported fake write ${sql}`);
            return { changes: 1 };
          },
        };
      },
    };
  }
  const owner = connection("owner");
  const project = connection("project");
  const writer = new Writer({
    mode,
    projectId: "PA",
    storeKey: "S1",
    generation: "G1",
    emit: (kind, data) => events.push({ kind, data }),
    barrier: () => {},
    verify: () => {},
    verifyRecovery: () => {},
    openOwner: () => owner,
    openProject: () => project,
  });
  writer.acquire();
  return { writer, events, calls, records, owner, project };
}

test("actual JS Writer guards roll back a data transaction on observable owner loss", () => {
  const f = fakeWriter();
  f.writer.fence();
  assert.throws(
    () =>
      f.writer.write(
        { operationId: "O1", base: 0, increment: 1 },
        { loseOwner: true },
      ),
    { code: "APV_OWNER_LOST" },
  );
  assert.equal(f.records.meta.head, 0);
  assert.equal(f.records.writes.length, 0);
  assert.equal(f.writer.snapshot().state, "BLOCKED");
  assert.equal(
    f.events.some((r) =>
      ["published", "fixture_ack", "data_committed"].includes(r.kind),
    ),
    false,
  );
});

test("unsafe JS baseline commits at old epoch and remains visibly unsafe", () => {
  const f = fakeWriter("unsafe_baseline");
  f.writer.fence();
  const result = f.writer.write(
    { operationId: "O1", base: 0, increment: 1 },
    { loseOwner: true },
  );
  assert.equal(result.unsafe, true);
  assert.equal(f.records.meta.head, 1);
  assert.equal(
    f.events.find((r) => r.kind === "data_committed").data.ownerLost,
    true,
  );
  assert.equal(
    f.events.some((r) => r.kind === "fixture_ack"),
    false,
  );
});

test("epoch-control loss/failure leaves instance blocked without pretending ACTIVE", () => {
  for (const options of [
    { loseOwner: true },
    { loseOwner: "close" },
    { failEpoch: true },
    { unknownEpoch: true },
  ]) {
    const f = fakeWriter();
    assert.throws(() => f.writer.fence(options));
    assert.equal(f.writer.snapshot().state, "BLOCKED");
    assert.equal(
      f.events.some((r) => r.kind === "transition" && r.data.to === "ACTIVE"),
      false,
    );
    assert.equal(f.records.meta.epoch, options.unknownEpoch ? 1 : 0);
  }
});

test("normal deferred release closes data before Owner and rejects future work", () => {
  const f = fakeWriter();
  f.writer.fence();
  f.writer.write(
    { operationId: "O1", base: 0, increment: 1 },
    { releaseDuringWrite: true },
  );
  assert.equal(f.writer.snapshot().state, "CLOSED");
  assert.ok(f.calls.indexOf("project:CLOSE") < f.calls.indexOf("owner:CLOSE"));
  assert.throws(
    () => f.writer.write({ operationId: "O2", base: 1, increment: 1 }),
    { code: "APV_DISABLED" },
  );
});

test("receipt retry precedes stale base check, without returning a historical head", () => {
  const f = fakeWriter();
  f.writer.fence();
  f.writer.write({ operationId: "O1", base: 0, increment: 1 });
  f.writer.write({ operationId: "O2", base: 1, increment: 1 });
  assert.deepEqual(
    f.writer.write({ operationId: "O1", base: 0, increment: 1 }),
    { duplicate: true, head: 2 },
  );
  assert.equal(f.records.writes.length, 2);
});

test("rollback failure must still disable the Writer", () => {
  const f = fakeWriter("protected", { rollbackFails: true });
  f.writer.fence();
  assert.throws(() =>
    f.writer.write(
      { operationId: "O1", base: 0, increment: 1 },
      { presented: { generation: "G2", epoch: 1, token: "wrong" } },
    ),
  );
  assert.equal(f.writer.snapshot().state, "BLOCKED");
});

test("independent oracle rejects mixed cuts, missing ledger and wrong binding", () => {
  const f = fakeWriter();
  f.writer.fence();
  f.writer.write({ operationId: "O1", base: 0, increment: 1 });
  const cut = () =>
    structuredClone({
      meta: f.records.meta,
      state: f.records.state,
      writes: f.records.writes,
    });
  assert.equal(
    verifySQL(cut(), { projectId: "PA", generation: "G1" }).meta.head,
    1,
  );
  for (const mutate of [
    (value) => {
      value.state.value = 0;
    },
    (value) => {
      value.writes = [];
    },
    (value) => {
      value.meta.generation = "G2";
    },
  ]) {
    const value = cut();
    mutate(value);
    assert.throws(() =>
      verifySQL(value, { projectId: "PA", generation: "G1" }),
    );
  }
});

test("CLI cannot implicitly start a case and covers all approved variants", () => {
  assert.equal(parseArgs([]).kind, "help");
  assert.equal(parseArgs(["--preflight"]).kind, "preflight");
  assert.equal(parseArgs(["--case", "OP06"]).kind, "plan");
  assert.equal(parseArgs(["--case", "OP06", "--execute"]).kind, "execute");
  assert.throws(() => parseArgs(["--case", "OP11", "--execute"]));
  assert.throws(() => parseArgs(["--preflight", "--execute"]));
  assert.deepEqual(Object.keys(VARIANTS), CASE_IDS);
  assert.equal(VARIANTS.OP06.includes("unsafe"), true);
});

test("invariant failure stays FAIL even when cleanup is uncertain", () => {
  const error = Object.assign(new Error("hidden"), {
    code: "APV_INVARIANT",
    cleanup: { unclosed: true },
  });
  assert.equal(outcome(error).status, "FAIL");
  assert.equal(
    outcome(Object.assign(new Error(), { code: "APV_WATCHDOG" })).status,
    "NOT TESTED",
  );
  assert.equal(
    outcome(Object.assign(new Error(), { code: "APV_ORACLE_CUT" })).status,
    "FAIL",
  );
});

test("owned termination rejects missing binding, closed incarnation and PID mismatch without filesystem/process action", async () => {
  const { Actor } = require("./actors.cjs");
  for (const mutation of [
    { bound: undefined },
    { closed: true },
    { bound: { pid: 2 } },
    { child: { pid: 1, exitCode: 0, signalCode: null } },
  ]) {
    const actor = Object.assign(
      Object.create(Actor.prototype),
      {
        bound: { pid: 1 },
        closed: false,
        child: { pid: 1, exitCode: null, signalCode: null },
      },
      mutation,
    );
    await assert.rejects(actor.killOwned("pure rejection"), {
      code: "APV_KILL_BINDING",
    });
  }
});

function op04Fixture(variant) {
  // Exercise the real JS Writer and completion schedule against in-memory SQL
  // only. No Actor constructor, native module, filesystem or termination call.
  const f = fakeWriter();
  const old = { epoch: 1, token: "token-A" };
  f.records.meta.epoch = 1;
  f.records.meta.token = old.token;
  if (variant === "post") {
    const digest =
      "4b08355b7e89175fa564ae74587d49821fc4318599d77133c2d5379958209846";
    f.records.meta.head = 1;
    f.records.meta.digest = digest;
    f.records.state = { value: 1, digest };
    f.records.writes = [
      {
        operation_id: "O1",
        intent_digest:
          "efd88480f1b39d5132e1c8f33922e13f07a854c9ad5e6c2b4150cdb0d9653f46",
        ...old,
        base_head: 0,
        new_head: 1,
        result_digest: digest,
      },
    ];
  }
  f.writer.fence();
  const a = {
    receipts: [
      { sequence: 1, kind: "epoch_committed", data: old },
      ...(variant === "post"
        ? [
            {
              sequence: 2,
              kind: "data_committed",
              data: {
                operationId: "O1",
                head: 1,
                epoch: 1,
                ownerLost: false,
                mode: "protected",
              },
            },
          ]
        : []),
    ],
  };
  const b = {
    get receipts() {
      return f.events.map((r, i) => ({ ...r, sequence: i + 1 }));
    },
  };
  const steps = [];
  const cuts = [];
  const read = async (checkpoint) => {
    steps.push(`read:${checkpoint}`);
    const cut = structuredClone({ ...f.records, sqliteVersion: "fixture" });
    cuts.push(cut);
    return cut;
  };
  const write = async (actor, base = 0) => {
    assert.equal(actor, b);
    const operationId = `O${base + 1}`;
    steps.push(`write:${operationId}`);
    return f.writer.write({ operationId, base, increment: 1 });
  };
  return {
    f,
    a,
    b,
    read,
    write,
    steps,
    cuts,
    binding: { projectId: "PA", generation: "G1" },
  };
}

test("OP04 idle/pre require a recovery read, new B commit and final independent read", async () => {
  for (const variant of ["idle", "pre"]) {
    const f = op04Fixture(variant);
    await completeOP04(f.binding, variant, f.a, f.b, f.read, f.write);
    assert.deepEqual(f.steps, [
      "read:op04.recovery",
      "write:O1",
      "read:op04.after_new_commit",
    ]);
    assert.equal(f.cuts[0].writes.length, 0);
    assert.equal(f.cuts[1].meta.head, 1);
    assert.equal(f.cuts[1].writes.length, 1);
    assert.equal(f.cuts[1].writes[0].epoch, 2);
    assert.equal(f.cuts[1].writes[0].token, f.f.writer.snapshot().token);
  }
});

test("OP04 post independently reads after duplicate and after distinct O2 commit", async () => {
  const f = op04Fixture("post");
  await completeOP04(f.binding, "post", f.a, f.b, f.read, f.write);
  assert.deepEqual(f.steps, [
    "read:op04.recovery",
    "write:O1",
    "read:op04.after_duplicate",
    "write:O2",
    "read:op04.after_new_commit",
  ]);
  assert.deepEqual(f.cuts[1], f.cuts[0]);
  assert.equal(f.cuts[2].meta.head, 2);
  assert.deepEqual(
    f.cuts[2].writes.map((r) => [r.operation_id, r.epoch]),
    [
      ["O1", 1],
      ["O2", 2],
    ],
  );
  assert.deepEqual(
    f.b.receipts
      .filter((r) => r.kind === "fixture_ack")
      .map((r) => [r.data.operationId, r.data.head]),
    [["O2", 2]],
  );
});

test("OP04 Oracle rejects wrong source token, intent, identity and incomplete cuts", () => {
  const f = op04Fixture("post");
  const cut = structuredClone(f.f.records);
  const current = f.f.writer.snapshot();
  const history = [{ epoch: 1, token: "token-A" }];
  assert.equal(verifyOP04Cut(cut, f.binding, current, history), cut);
  for (const mutate of [
    (x) => {
      x.meta.token = "wrong";
    },
    (x) => {
      x.writes[0].token = "wrong";
    },
    (x) => {
      x.writes[0].epoch = 2;
    },
    (x) => {
      x.writes[0].operation_id = "O2";
    },
    (x) => {
      x.writes[0].intent_digest = "wrong";
    },
    (x) => {
      x.writes = [];
    },
    (x) => {
      x.state.value = 0;
    },
    (x) => {
      x.meta.lifecycle = "deleted";
    },
  ]) {
    const changed = structuredClone(cut);
    mutate(changed);
    assert.throws(() => verifyOP04Cut(changed, f.binding, current, history));
  }
});

test("OP04 completion rejects duplicate acknowledgement or missing new-write ACK", async () => {
  for (const mutation of [
    "duplicate_ack",
    "missing_ack",
    "wrong_ack",
    "old_publish",
  ]) {
    const f = op04Fixture("post");
    const write = async (...args) => {
      const result = await f.write(...args);
      if (result.duplicate && mutation === "duplicate_ack")
        f.f.events.push({
          kind: "fixture_ack",
          data: { operationId: "O1", head: 1 },
        });
      if (!result.duplicate && mutation === "missing_ack")
        f.f.events.splice(
          f.f.events.findIndex((r) => r.kind === "fixture_ack"),
          1,
        );
      if (!result.duplicate && mutation === "wrong_ack")
        f.f.events.find((r) => r.kind === "fixture_ack").data.head = 1;
      return result;
    };
    if (mutation === "old_publish")
      f.a.receipts.push({
        sequence: 3,
        kind: "published",
        data: { operationId: "O1", head: 1 },
      });
    await assert.rejects(
      completeOP04(f.binding, "post", f.a, f.b, f.read, write),
      { code: "APV_INVARIANT" },
    );
  }
});

test("OP04 rejects a changed duplicate cut and stale epoch final record", async () => {
  for (const mutation of ["duplicate_cut", "final_token"]) {
    const f = op04Fixture("post");
    const read = async (checkpoint) => {
      const cut = await f.read(checkpoint);
      if (mutation === "duplicate_cut" && checkpoint === "op04.after_duplicate")
        cut.writes[0].token = "replaced";
      if (mutation === "final_token" && checkpoint === "op04.after_new_commit")
        cut.writes[1].token = "token-A";
      return cut;
    };
    await assert.rejects(
      completeOP04(f.binding, "post", f.a, f.b, read, f.write),
      { code: "APV_ORACLE_HISTORY" },
    );
  }
});

test("OP04 idle/pre stop before B writes if recovery contains A's partial operation", async () => {
  for (const variant of ["idle", "pre"]) {
    const f = op04Fixture(variant);
    const partial = op04Fixture("post");
    const read = async (checkpoint) => {
      const cut = await f.read(checkpoint);
      cut.meta.head = 1;
      cut.meta.digest = partial.f.records.meta.digest;
      cut.state = structuredClone(partial.f.records.state);
      cut.writes = structuredClone(partial.f.records.writes);
      return cut;
    };
    await assert.rejects(
      completeOP04(f.binding, variant, f.a, f.b, read, f.write),
      { code: "APV_ORACLE_CUT" },
    );
    assert.deepEqual(f.steps, ["read:op04.recovery"]);
    assert.equal(f.f.records.meta.head, 0);
  }
});

test("OP04 missing Reader evidence remains NOT TESTED, never successful completion", async () => {
  const f = op04Fixture("idle");
  const read = async () => {
    throw Object.assign(new Error("Reader unavailable"), {
      code: "APV_EXECUTION",
    });
  };
  await assert.rejects(
    completeOP04(f.binding, "idle", f.a, f.b, read, f.write),
    (error) => outcome(error).status === "NOT TESTED",
  );
  assert.equal(f.f.records.meta.head, 0);
});

test("OP10 busy cuts reject changed epoch/token, partial writes and missing evidence", () => {
  const f = fakeWriter();
  const binding = { projectId: "PA", generation: "G1" };
  verifyBusyCut(f.records, binding, { epoch: 0, token: null, head: 0 });
  for (const mutate of [
    (x) => {
      x.meta.epoch = 1;
    },
    (x) => {
      x.meta.token = "uncommitted";
    },
    (x) => {
      x.writes.push({ operation_id: "illegal" });
    },
  ]) {
    const cut = structuredClone(f.records);
    mutate(cut);
    assert.throws(() =>
      verifyBusyCut(cut, binding, { epoch: 0, token: null, head: 0 }),
    );
  }
  assert.throws(
    () => verifyBusyCut(undefined, binding, { epoch: 0, token: null, head: 0 }),
    (error) => outcome(error).status === "NOT TESTED",
  );
  f.writer.fence();
  f.writer.write({ operationId: "O1", base: 0, increment: 1 });
  verifyBusyCut(f.records, binding, {
    epoch: 1,
    token: f.writer.snapshot().token,
    head: 1,
  });
  const changed = structuredClone(f.records);
  changed.writes[0].token = "stale";
  assert.throws(() =>
    verifyBusyCut(changed, binding, {
      epoch: 1,
      token: f.writer.snapshot().token,
      head: 1,
    }),
  );
});

test("actual JS Writer fails closed on fencing BUSY without epoch/publication/ACK", () => {
  const f = fakeWriter("protected", { projectBusy: true });
  assert.throws(() => f.writer.fence(), { code: "SQLITE_BUSY" });
  verifyBlockedCandidate(f.writer.snapshot(), f.events);
  assert.equal(f.records.meta.epoch, 0);
  assert.equal(f.records.meta.token, null);
  assert.equal(f.records.meta.head, 0);
  assert.throws(
    () => f.writer.write({ operationId: "O1", base: 0, increment: 1 }),
    { code: "APV_DISABLED" },
  );
  for (const state of ["ACTIVE", "WRITING", "HELD_UNFENCED"])
    assert.throws(() =>
      verifyBlockedCandidate({ ...f.writer.snapshot(), state }, f.events),
    );
  assert.throws(() =>
    verifyBlockedCandidate(f.writer.snapshot(), [
      ...f.events,
      { kind: "fixture_ack", data: {} },
    ]),
  );
});

test("watchdog evidence rejects early timers, wrong binding and infrastructure timeouts", () => {
  const expected = {
    runId: "run",
    workerId: "B2",
    nonce: "candidate",
    commandId: "wait",
    barrierId: "barrier",
  };
  const evidence = {
    ...expected,
    category: "APV_WATCHDOG",
    phaseStarted: 100,
    deadline: 5100,
    observed: 5101,
    budgetMs: 5000,
  };
  verifyWatchdog(evidence, expected);
  assert.throws(
    () => verifyWatchdog(undefined, expected),
    (error) => outcome(error).status === "NOT TESTED",
  );
  for (const changed of [
    { category: "APV_BARRIER_TIMEOUT" },
    { observed: 5099 },
    { deadline: 5100, phaseStarted: 200 },
    { nonce: "other" },
    { commandId: "other" },
    { observed: NaN },
    { budgetMs: 0 },
    { barrierId: "other" },
  ])
    assert.throws(() => verifyWatchdog({ ...evidence, ...changed }, expected));
});

test("P0-only CLI selection cannot silently run old OP10 variants or another case", () => {
  assert.deepEqual(
    parseArgs([
      "--case",
      "OP10",
      "--variant",
      "project_busy_watchdog",
      "--execute",
    ]),
    { kind: "execute", cases: ["OP10"], variant: "project_busy_watchdog" },
  );
  assert.throws(() =>
    parseArgs([
      "--case",
      "OP01",
      "--variant",
      "project_busy_watchdog",
      "--execute",
    ]),
  );
  assert.throws(() =>
    parseArgs(["--case", "OP10", "--variant", "unknown", "--execute"]),
  );
});

test("JS API-level release failures block future writes without claiming the Owner lock is retained", () => {
  for (const options of [
    { projectCloseFails: true },
    { ownerRollbackFails: true },
    { ownerCloseFails: true },
  ]) {
    const f = fakeWriter("protected", options);
    f.writer.fence();
    assert.throws(() => f.writer.release(), { code: "SQLITE_IOERR" });
    assert.equal(f.writer.snapshot().state, "BLOCKED");
    assert.throws(
      () => f.writer.write({ operationId: "O1", base: 0, increment: 1 }),
      { code: "APV_DISABLED" },
    );
    assert.equal(f.records.meta.head, 0);
    assert.equal(
      f.events.some((r) =>
        ["data_committed", "published", "fixture_ack"].includes(r.kind),
      ),
      false,
    );
    if (options.projectCloseFails)
      assert.equal(f.calls.includes("owner:ROLLBACK"), false);
    if (options.ownerRollbackFails)
      assert.equal(f.calls.includes("owner:CLOSE"), false);
    if (options.ownerCloseFails)
      assert.equal(f.writer.snapshot().inTransaction, false);
  }
});

test("real parent deadline timer expires without spawning a Worker or using SQLite", async () => {
  const { Actor } = require("./actors.cjs");
  const actor = Object.create(Actor.prototype);
  actor.deadlineAt = performance.now() + 8;
  await assert.rejects(actor.deadline(new Promise(() => {}), true), {
    code: "APV_WATCHDOG",
  });
  assert.ok(performance.now() >= actor.deadlineAt);
  actor.deadlineAt = performance.now() + 100;
  assert.equal(await actor.deadline(Promise.resolve("completed")), "completed");
});

test("blocked watchdog cannot accept early command completion or a mismatched Barrier", async () => {
  const { Actor } = require("./actors.cjs");
  const actor = Object.create(Actor.prototype);
  actor.binding = {
    runId: "run",
    caseId: "OP10",
    variant: "project_busy_watchdog",
  };
  actor.workerId = "B2";
  actor.nonce = "candidate";
  actor.deadlineAt = performance.now() + 100;
  const entry = {
    runId: "run",
    caseId: "OP10",
    workerId: "B2",
    nonce: "candidate",
    commandId: "wait",
    barrier: "blocked_until_watchdog",
    id: "entry",
  };
  const task = { id: "wait", promise: Promise.resolve({ ok: true }) };
  await assert.rejects(
    actor.observeBlockedWatchdog(task, entry, performance.now()),
    { code: "APV_INVARIANT" },
  );
  await assert.rejects(
    actor.observeBlockedWatchdog(
      task,
      { ...entry, runId: "other" },
      performance.now(),
    ),
    { code: "APV_BARRIER_BINDING" },
  );
});
