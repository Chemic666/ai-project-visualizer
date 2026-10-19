"use strict";
const assert = require("node:assert/strict");
const { validateCut } = require("./oracle.cjs"),
  { reconcile, ackEligibility } = require("./policy.cjs"),
  { hash } = require("./checks.cjs");
const u4Faults = [
  "receipt_missing",
  "nonce_mismatch",
  "epoch_mismatch",
  "generation_mismatch",
  "unreadable",
  "ledger_mismatch",
];
const r3Faults = [
  "event_missing",
  "correction_missing",
  "cursor_ahead",
  "foreign_fingerprint",
  "unreadable",
];
function domain(cut) {
  return {
    ...cut,
    control: cut.control.map(
      ({ epoch: _epoch, token: _token, ...rest }) => rest,
    ),
  };
}
async function runCase(caseName, ctx) {
  const { actor, fixture, write, checks } = ctx;
  const unit = caseName.toLowerCase();
  async function setup() {
    const s = await actor(unit, "setup");
    await s.call("setup");
    await s.call("close");
  }
  async function reader(target, label, error = false) {
    const r = await actor(target, "reader"),
      result = await r.call("read", { label }, error);
    await r.call("close");
    return result;
  }
  const pass = (name, detail) =>
    checks.push({ name, status: "PASS WITH LIMITATION", detail });
  await setup();
  const w = await actor(unit, "writer"),
    acquired = await w.call("acquire"),
    execution = acquired.capability;
  write("original-execution.json", {
    writer: w.identity,
    execution,
    operationId: fixture.operationId,
  });
  const suspect = w.identity;
  const baseline = await reader(unit, "baseline");
  validateCut(baseline.cut, fixture, baseline.binding);
  let settlement;
  if (caseName === "U1") {
    const failed = await w.call(
      "stage",
      { inject: "after_assertions" },
      "SQLITE_CONSTRAINT_PRIMARYKEY",
    );
    const error = w.rows.find((r) => r.kind === "error_before_settlement");
    assert.equal(error.data.inTransaction, true);
    assert.equal(failed.settlement.confirmed, true);
    assert.equal(failed.settlement.closeConfirmed, true);
    settlement = failed.settlement;
    const after = await reader(unit, "after_explicit_rollback_close");
    assert.deepEqual(after.cut, baseline.cut);
    const decision = reconcile({
      cut: after.cut,
      fixture,
      binding: after.binding,
      execution,
      settlement,
      suspect,
      allowProvenAbsence: true,
    });
    assert.equal(decision.status, "not_committed_proven");
    write("known-failure-decision.json", decision);
    await w.call("close");
    const recovered = await actor(unit, "recovery");
    const opened = await recovered.call("acquire");
    assert.deepEqual(opened.restored.state, fixture.before);
    const fresh = await reader(unit, "fresh_recovery_old_cut");
    assert.deepEqual(domain(fresh.cut), domain(baseline.cut));
    await recovered.call("close");
    pass(
      "U1",
      "actual statement failure leaves active transaction; explicit rollback AND connection close; exact old cut; no publication/ACK",
    );
    return;
  }
  if (caseName === "R1") {
    await w.call("stage", { stop: "after_assertions" });
    settlement = await w.crash("after_assertions");
    const old = await reader(unit, "after_precommit_process_exit");
    assert.deepEqual(old.cut, baseline.cut);
    const decision = reconcile({
      cut: old.cut,
      fixture,
      binding: old.binding,
      execution,
      settlement,
      suspect,
      allowProvenAbsence: true,
    });
    assert.equal(decision.status, "not_committed_proven");
    write("crash-decision.json", decision);
    const r = await actor(unit, "recovery");
    const opened = await r.call("acquire");
    assert.deepEqual(opened.restored.state, fixture.before);
    const after = await reader(unit, "new_process_old_state");
    assert.deepEqual(domain(after.cut), domain(baseline.cut));
    await r.call("close");
    pass(
      "R1",
      "owned Worker SIGKILL at actual partial-write barrier; exit observed before new process/connection recovery; exact old authority",
    );
    return;
  }
  await w.call("stage");
  if (caseName === "R2") {
    await w.call("commit_park");
    settlement = await w.crash("after_commit_before_ack");
  } else {
    const lost = await w.call("commit_loss");
    settlement = lost.settlement;
    await w.call("close");
  }
  const committed = await reader(unit, "committed_before_recovery");
  const state = validateCut(committed.cut, fixture, committed.binding);
  assert.deepEqual(state.state, fixture.after);
  if (caseName === "U2" || caseName === "R2") {
    const r = await actor(unit, "recovery"),
      reopened = await r.call("acquire");
    assert.ok(reopened.capability.epoch > execution.epoch);
    assert.notEqual(reopened.capability.token, execution.token);
    const resumed = await r.call("resume", { execution, settlement, suspect });
    assert.equal(resumed.decision.status, "committed");
    const observed = await reader(unit, "after_reconciled_stable_replay");
    assert.deepEqual(domain(observed.cut), domain(committed.cut));
    validateCut(observed.cut, fixture, observed.binding);
    const eligible = r.rows.find((row) => row.kind === "ack_eligible");
    assert.ok(eligible && eligible.data.ownerInTransaction);
    assert.equal(
      eligible.data.activeCapability.token,
      observed.cut.control[0].token,
    );
    assert.equal(
      ackEligibility({
        cut: observed.cut,
        fixture,
        binding: observed.binding,
        execution,
        settlement,
        suspect,
        capability: eligible.data.activeCapability,
        ownerHeld: eligible.data.ownerInTransaction,
        sourceProtocol: eligible.data.sourceProtocol,
      }),
      true,
    );
    write("publication.json", {
      head: observed.cut.control[0].head,
      digest: observed.cut.control[0].digest,
      independentReader: true,
      parentOrder: ctx.nextOrder(),
      fixtureOnly: true,
    });
    write("fixture-ack.json", {
      runId: ctx.runId,
      operationId: fixture.operationId,
      generation: fixture.generation,
      checkpoint: fixture.checkpoint,
      ackEligibleWorker: r.identity,
      ackEligibleSequence: eligible.sequence,
      afterIndependentSQLOracle: true,
      parentOrder: ctx.nextOrder(),
      sqliteAtomic: false,
      fixtureOnly: true,
    });
    await r.call("close");
    pass(
      caseName,
      caseName === "U2"
        ? "controlled success-response loss only; fresh owner/connection exact receipt/nonce/SQL; Core stable replay adds no business commit; external fixture ACK afterward"
        : "actual owned post-COMMIT/pre-ACK process kill; new process restores provenance/corrections; canonical stable replay and external fixture ACK after independent SQL",
    );
    return;
  }
  for (const variant of caseName === "U4" ? u4Faults : r3Faults) {
    const copy = `${unit}-${variant}`,
      f = await actor(copy, "fault");
    await f.call("clone", { sourceUnit: unit });
    await f.call("mutate", { variant });
    await f.call("close");
    const raw = await reader(
      copy,
      `fault-${variant}`,
      variant === "unreadable" ? "SQLITE_NOTADB" : false,
    );
    const decision = reconcile({
      cut: raw.cut || null,
      fixture,
      binding: raw.binding,
      execution,
      settlement,
      suspect,
    });
    assert.equal(decision.status, "unavailable");
    write(`failure-decision-${variant}.json`, {
      variant,
      decision,
      SQLResult: raw,
    });
    const r = await actor(copy, "recovery"),
      failed = await r.call(
        "acquire",
        {},
        variant === "unreadable" ? "SQLITE_NOTADB" : "RECOVERY_UNAVAILABLE",
      );
    assert.equal(failed.ok, false);
    assert.equal(
      r.rows.some((row) =>
        ["fence_committed", "ack_eligible"].includes(row.kind),
      ),
      false,
    );
    await r.call("close");
    pass(
      variant,
      "controlled fresh SQLite backup copy; source original retained; restore/reconciliation unavailable with no publication/ACK",
    );
  }
  const retained = await reader(unit, "source_original_retained_after_copies");
  assert.deepEqual(retained.cut, committed.cut);
  if (caseName === "U4") {
    const un = "u4-unsettled",
      s = await actor(un, "setup");
    await s.call("setup");
    await s.call("close");
    const parked = await actor(un, "writer");
    const a = await parked.call("acquire");
    await parked.call("stage", { stop: "after_assertions" });
    const old = await reader(
      un,
      "old_cut_while_original_transaction_still_live",
    );
    const unknown = reconcile({
      cut: old.cut,
      fixture,
      binding: old.binding,
      execution: a.capability,
      settlement: { confirmed: false },
      suspect: parked.identity,
      allowProvenAbsence: true,
    });
    assert.equal(unknown.status, "unavailable");
    write("failure-decision-unsettled.json", {
      decision: unknown,
      oldCutDigest: hash(old.cut),
      originalWorker: parked.identity,
      oldTransactionStillLive: true,
    });
    await parked.call("close");
    pass(
      "unsettled",
      "Reader absence is not rollback evidence while original owned transaction remains parked",
    );
  }
}
module.exports = { runCase, domain, u4Faults, r3Faults };
