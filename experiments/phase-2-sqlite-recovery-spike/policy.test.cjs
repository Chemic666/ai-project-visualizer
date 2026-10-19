"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { testData, fixtureModule } = require("./test-data.cjs");
const { validateCut } = require("./oracle.cjs");
const { reconcile, compareClaim, ackEligibility } = require("./policy.cjs");
const data = testData();
const input = () => structuredClone(data);
test("a bound observed owned-process exit permits committed reconciliation", () => {
  const x = input();
  x.settlement = {
    confirmed: true,
    kind: "owned_process_exit",
    pid: 10,
    workerNonce: "writer-nonce",
    evidenceRef: "lifecycle:writer-1",
    exitObserved: true,
    throughOwnedChildProcess: true,
    exit: { code: null, signal: "SIGKILL", parentOrder: 8 },
  };
  assert.equal(reconcile(x).status, "committed");
  x.settlement.exitObserved = false;
  assert.equal(reconcile(x).status, "unavailable");
});
test("receipt absence requires settled exact old authority and explicit reviewed permission", () => {
  const x = input();
  x.cut.control[0].head = 1;
  x.cut.control[0].digest = x.cut.commits[0].result_digest;
  for (const table of [
    "commits",
    "assertions",
    "entity_versions",
    "correction_versions",
    "conclusion_versions",
  ])
    x.cut[table] = x.cut[table].filter((r) => r.seq === 1);
  x.cut.snapshots = x.cut.snapshots.filter((r) => r.watermark === 1);
  for (const table of ["events", "dedup", "checkpoints", "operation_receipts"])
    x.cut[table] = [];
  assert.equal(reconcile(x).status, "unavailable");
  assert.equal(
    reconcile({ ...x, allowProvenAbsence: true }).status,
    "not_committed_proven",
  );
  x.settlement.inTransaction = true;
  assert.equal(
    reconcile({ ...x, allowProvenAbsence: true }).status,
    "unavailable",
  );
});
for (const [name, mutate] of [
  [
    "still-active transaction",
    (x) => {
      x.settlement.inTransaction = true;
    },
  ],
  [
    "unconfirmed connection close",
    (x) => {
      x.settlement.closeConfirmed = false;
    },
  ],
  [
    "different original Writer",
    (x) => {
      x.suspect.pid = 99;
    },
  ],
  [
    "different Writer nonce",
    (x) => {
      x.settlement.workerNonce = "other";
    },
  ],
  [
    "unbound evidence reference",
    (x) => {
      x.settlement.evidenceRef = "other-worker:1";
    },
  ],
  [
    "exit without observed lifecycle",
    (x) => {
      x.settlement = {
        ...x.settlement,
        kind: "owned_process_exit",
        evidenceRef: "lifecycle:writer-1",
        exit: null,
      };
    },
  ],
])
  test(`settlement refuses ${name}`, () => {
    const x = input();
    mutate(x);
    assert.equal(reconcile(x).status, "unavailable");
  });

test("unchanged Core accepts distinct internal IDs for missing identity and shared Cursor", () => {
  const core = fixtureModule(),
    examples = core.identityExamples();
  for (const [first, second] of [
    [examples.missing, examples.missingAgain],
    [examples.cursor, examples.cursorAgain],
  ]) {
    const one = core.replayRestored(data.fixture.before, first);
    const two = core.replayRestored(one.state, second);
    assert.equal(one.status, "applied");
    assert.equal(two.status, "applied");
    assert.deepEqual(
      two.state.acceptedEvents.map((e) => e.id),
      [first.id, second.id],
    );
    assert.equal(
      two.state.assertions.length,
      data.fixture.before.assertions.length + 2,
    );
    assert.deepEqual(two.state.corrections, data.fixture.before.corrections);
  }
});

test("complete SQL authority restores exact state and correction history", () => {
  const recovered = validateCut(data.cut, data.fixture, data.binding);
  assert.deepEqual(recovered.state, data.fixture.after);
  assert.equal(recovered.head, 2);
  assert.equal(
    recovered.state.assertions.find((a) => a.eventId === "E1").provenance,
    "agent_reported",
  );
});
test("settled matching historical receipt reconciles under a newer owner epoch", () => {
  const x = input();
  x.cut.control[0].epoch = 2;
  x.cut.control[0].token = "new-owner-nonce";
  const result = reconcile(x);
  assert.equal(result.status, "committed");
  assert.equal(result.mayReplay, false);
  assert.equal(result.mayAck, false); // source protocol/active ownership gate is separate
});
test("missing receipt never proves absence by itself", () => {
  const x = input();
  x.cut.operation_receipts = [];
  assert.equal(reconcile(x).status, "unavailable");
});
test("unsettled transaction prevents lookup-based success and source confirmation", () => {
  const x = input();
  x.settlement.confirmed = false;
  assert.deepEqual(reconcile(x), {
    status: "unavailable",
    reason: "UNSETTLED",
    mayAck: false,
    mayReplay: false,
    mayPublish: false,
  });
});
for (const [name, mutate] of [
  [
    "nonce mismatch",
    (x) => {
      x.cut.operation_receipts[0].nonce = "wrong";
    },
  ],
  [
    "epoch mismatch",
    (x) => {
      x.cut.operation_receipts[0].epoch = 99;
    },
  ],
  [
    "generation mismatch",
    (x) => {
      x.cut.control[0].generation = "G2";
    },
  ],
  [
    "ledger mismatch",
    (x) => {
      x.cut.commits[1].result_digest = "wrong";
    },
  ],
  [
    "missing authoritative event with intact snapshot",
    (x) => {
      x.cut.events = [];
    },
  ],
  [
    "missing correction history",
    (x) => {
      x.cut.correction_versions.shift();
    },
  ],
  [
    "cursor ahead of coverage",
    (x) => {
      x.cut.checkpoints[0].seq = 3;
    },
  ],
  [
    "snapshot watermark mismatch",
    (x) => {
      x.cut.snapshots[1].watermark = 1;
    },
  ],
  [
    "unsupported fingerprint",
    (x) => {
      x.cut.fixture_meta[0].fingerprint = "foreign";
    },
  ],
  [
    "extra authoritative rows",
    (x) => {
      x.cut.entity_versions.push({
        ...x.cut.entity_versions[0],
        id: "foreign",
      });
    },
  ],
])
  test(`fails closed on ${name}`, () => {
    const x = input();
    mutate(x);
    const result = reconcile(x);
    assert.equal(result.status, "unavailable");
    assert.equal(result.mayAck || result.mayReplay || result.mayPublish, false);
  });
test("unreadable database does not become an empty successful state", () => {
  const x = input();
  x.cut = null;
  assert.equal(reconcile(x).status, "unavailable");
});
test("stable source alias allows only internal ID and receipt-time differences", () => {
  const e = fixtureModule().identityExamples();
  assert.equal(compareClaim(e.stable, e.alias), "stable_duplicate");
  assert.equal(compareClaim(e.stable, e.conflicting), "identity_conflict");
  assert.equal(
    compareClaim(e.stable, { ...e.stable, receivedAt: "changed" }),
    "identity_conflict",
  );
});
test("missing identity and batch cursor cannot deduplicate new internal event IDs", () => {
  const e = fixtureModule().identityExamples();
  assert.equal(compareClaim(e.missing, e.missingAgain), "new_input");
  assert.equal(compareClaim(e.cursor, e.cursorAgain), "new_input");
});
test("ACK requires fresh SQL authority, active capability and declared synthetic protocol", () => {
  const x = input();
  const ack = {
    ...x,
    capability: {
      project: "PA",
      generation: "G1",
      epoch: 1,
      token: x.execution.token,
    },
    ownerHeld: true,
    sourceProtocol: "synthetic-complete-unit-v1",
  };
  assert.equal(ackEligibility(ack), true);
  for (const mutate of [
    (v) => {
      v.ownerHeld = false;
    },
    (v) => {
      v.sourceProtocol = "unverified-source";
    },
    (v) => {
      v.capability.token = "stale";
    },
    (v) => {
      v.settlement.confirmed = false;
    },
    (v) => {
      v.cut.checkpoints[0].body = "{}";
    },
  ]) {
    const changed = structuredClone(ack);
    mutate(changed);
    assert.equal(ackEligibility(changed), false);
  }
});
