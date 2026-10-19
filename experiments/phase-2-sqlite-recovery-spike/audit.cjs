"use strict";
// Offline raw-evidence audit. Never opens SQLite or launches experiment Workers.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { fileHash, verifyInventory } = require("./evidence.cjs"),
  { physicalDirectory, uuidPattern, errorRecord } = require("./safety.cjs");
const { checkReceipts } = require("./reference-oracle.cjs"),
  { validateCut } = require("./oracle.cjs"),
  { reconcile, ackEligibility } = require("./policy.cjs"),
  { domain, u4Faults, r3Faults } = require("./scenarios.cjs"),
  { fixtureModule } = require("./test-data.cjs");
const {
  assertRecoveryTimeline,
  assertReadAfterSettlement,
  assertAckTimeline,
} = require("./timeline.cjs");
function audit(root, sealCMD = false) {
  const repo = path.resolve(__dirname, "../..");
  root = physicalDirectory(root, repo);
  const runId = path.basename(root);
  assert.ok(uuidPattern.test(runId));
  assert.equal(
    path.dirname(root).toLowerCase(),
    path.join(os.tmpdir(), "apv-sqlite-recovery").toLowerCase(),
  );
  const read = (relative) =>
    JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  const manifest = read("manifest.json"),
    seal = read("seal.json"),
    life = read("lifecycle.json"),
    fixture = read("fixture.json"),
    origin = read("original-execution.json");
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.repo, repo);
  assert.equal(seal.quiescent, true);
  assert.equal(
    fileHash(path.join(root, "inventory.json")),
    seal.inventorySha256,
  );
  const count = verifyInventory(root, read("inventory.json"));
  for (const [relative, digest] of Object.entries(manifest.sourceHashes))
    assert.equal(
      fileHash(path.join(repo, relative)),
      digest,
      "Current source changed; historical code evidence requires separate review",
    );
  assert.deepEqual(fixture, fixtureModule().createFixtures());
  const rawFiles = fs.readdirSync(path.join(root, "raw"));
  const rows = rawFiles
    .filter((f) => /^[a-z]+-\d+-\d+\.json$/.test(f))
    .map((f) => read(`raw/${f}`));
  const observations = rawFiles
    .filter((f) => /^parent-\d+\.json$/.test(f))
    .map((f) => read(`raw/${f}`));
  const byKind = (kind) => rows.filter((r) => r.kind === kind);
  const parentOrder = (row) => {
    const found = observations.filter(
      (o) => o.workerId === row.workerId && o.sequence === row.sequence,
    );
    assert.equal(found.length, 1);
    return found[0].parentOrder;
  };
  for (const actor of life) {
    const own = rows
      .filter((r) => r.workerId === actor.workerId)
      .sort((a, b) => a.sequence - b.sequence);
    checkReceipts(
      own,
      actor,
      actor.role === "reader" &&
        !own.some((r) => r.kind === "error_before_settlement"),
    );
    const spawn = read(`raw/spawn-${actor.workerId}.json`);
    assert.equal(spawn.nonce, actor.nonce);
    assert.equal(spawn.role, actor.role);
    assert.equal(spawn.unit, actor.unit);
    assert.ok(
      actor.childProcessBound && actor.exit && !actor.captureIncomplete,
    );
    for (const row of own) {
      assert.equal(row.unit, actor.unit);
      assert.equal(row.role, actor.role);
      parentOrder(row);
    }
    if (actor.kill) {
      assert.ok(
        actor.kill.throughOwnedChildProcess &&
          (actor.exit.signal || actor.exit.code !== 0),
      );
      const barrier = own.find(
        (r) => r.sequence === actor.kill.receiptSequence,
      );
      assert.equal(barrier.kind, "barrier");
      assert.equal(barrier.data.barrier, actor.kill.barrier);
      assert.ok(
        parentOrder(barrier) < actor.kill.parentOrder &&
          actor.kill.parentOrder < actor.exit.parentOrder,
      );
    } else {
      assert.equal(actor.exit.code, 0);
      assert.equal(actor.exit.signal, null);
    }
  }
  const originalLife = life.find((a) => a.workerId === origin.writer.workerId);
  assert.equal(originalLife.nonce, origin.writer.nonce);
  assert.equal(originalLife.pid, origin.writer.pid);
  const originalFence = byKind("fence_committed").find(
    (r) => r.workerId === originalLife.workerId,
  );
  assert.deepEqual(originalFence.data.capability, origin.execution);
  const readers = byKind("sql_oracle");
  for (const row of readers) {
    if (!row.data.label.startsWith("fault-")) {
      assert.equal(row.data.healthy, true);
      assert.deepEqual(row.data.integrity, [{ integrity_check: "ok" }]);
      assert.deepEqual(row.data.foreignKeys, []);
    }
    assert.deepEqual(row.data.binding, {
      runId,
      unit: row.unit,
      project: fixture.projectId,
      generation: fixture.generation,
      fingerprint: manifest.fingerprint,
    });
    assert.equal(row.data.independentReader, true);
    assert.equal(row.data.sqlite, "3.53.4");
    assert.ok(
      row.data.queries.includes("PRAGMA integrity_check") &&
        row.data.queries.includes(
          "SELECT * FROM operation_receipts ORDER BY rowid",
        ),
    );
  }
  const reader = (label) => {
    const found = readers.filter((r) => r.data.label === label);
    assert.equal(found.length, 1, label);
    return found[0];
  };
  const baseline = reader("baseline");
  validateCut(baseline.data.cut, fixture, baseline.data.binding);
  const caseName = manifest.caseName,
    kills = life.filter((a) => a.kill);
  assert.equal(kills.length, caseName === "R1" || caseName === "R2" ? 1 : 0);
  let settlement;
  if (kills.length) {
    assert.equal(
      originalLife.kill.barrier,
      caseName === "R1" ? "after_assertions" : "after_commit_before_ack",
    );
    settlement = {
      confirmed: true,
      kind: "owned_process_exit",
      exitObserved: true,
      throughOwnedChildProcess: true,
      exit: originalLife.exit,
      pid: originalLife.pid,
      workerNonce: originalLife.nonce,
      evidenceRef: `lifecycle:${originalLife.workerId}`,
    };
  } else {
    const proven = byKind("settled").filter(
      (r) => r.workerId === originalLife.workerId && r.data.closeConfirmed,
    );
    assert.ok(proven.length);
    settlement = proven[0].data;
  }
  const spawnOrder = (row) =>
    read(`raw/spawn-${row.workerId}.json`).parentOrder;
  const originalSettledRow = byKind("settled").find(
    (r) => r.workerId === originalLife.workerId && r.data.closeConfirmed,
  );
  const outcomeSettlementOrder = kills.length
    ? originalLife.exit.parentOrder
    : parentOrder(originalSettledRow);
  if (caseName === "U1" || caseName === "R1") {
    const after = reader(
      caseName === "U1"
        ? "after_explicit_rollback_close"
        : "after_precommit_process_exit",
    );
    assertReadAfterSettlement(
      outcomeSettlementOrder,
      spawnOrder(after),
      parentOrder(after),
    );
    assert.deepEqual(after.data.cut, baseline.data.cut);
    assert.equal(
      reconcile({
        cut: after.data.cut,
        fixture,
        binding: after.data.binding,
        execution: origin.execution,
        settlement,
        suspect: origin.writer,
        allowProvenAbsence: true,
      }).status,
      "not_committed_proven",
    );
    if (caseName === "U1") {
      const error = byKind("error_before_settlement").find(
        (r) => r.workerId === originalLife.workerId,
      );
      assert.equal(error.data.error.code, "SQLITE_CONSTRAINT_PRIMARYKEY");
      assert.equal(error.data.inTransaction, true);
      assert.ok(settlement.beforeInTransaction);
    }
    const fresh = reader(
      caseName === "U1" ? "fresh_recovery_old_cut" : "new_process_old_state",
    );
    assert.deepEqual(domain(fresh.data.cut), domain(baseline.data.cut));
    assert.deepEqual(
      validateCut(fresh.data.cut, fixture, fresh.data.binding).state,
      fixture.before,
    );
    assert.equal(fs.existsSync(path.join(root, "fixture-ack.json")), false);
    assert.equal(fs.existsSync(path.join(root, "publication.json")), false);
  } else {
    const committed = reader("committed_before_recovery");
    assertReadAfterSettlement(
      outcomeSettlementOrder,
      spawnOrder(committed),
      parentOrder(committed),
    );
    validateCut(committed.data.cut, fixture, committed.data.binding);
    if (caseName !== "R2") {
      const loss = byKind("controlled_post_success_response_loss");
      assert.equal(loss.length, 1);
      assert.equal(loss[0].data.realIOUncertainty, false);
    }
    if (caseName === "U2" || caseName === "R2") {
      const current = reader("after_reconciled_stable_replay"),
        eligibleRows = byKind("ack_eligible");
      assert.equal(eligibleRows.length, 1);
      const eligible = eligibleRows[0];
      assert.deepEqual(domain(current.data.cut), domain(committed.data.cut));
      assert.equal(
        ackEligibility({
          cut: current.data.cut,
          fixture,
          binding: current.data.binding,
          execution: origin.execution,
          settlement,
          suspect: origin.writer,
          capability: eligible.data.activeCapability,
          ownerHeld: eligible.data.ownerInTransaction,
          sourceProtocol: eligible.data.sourceProtocol,
        }),
        true,
      );
      const duplicate = byKind("replay_duplicate");
      assert.equal(duplicate.length, 1);
      assert.equal(duplicate[0].data.businessCommitPerformed, false);
      assert.equal(duplicate[0].data.aliasRecorded, false);
      const reconciliation = byKind("reconciliation");
      assert.equal(reconciliation.length, 1);
      assert.equal(reconciliation[0].data.decision.status, "committed");
      assert.ok(
        parentOrder(reconciliation[0]) < parentOrder(eligible) &&
          parentOrder(eligible) < parentOrder(current),
      );
      const ack = read("fixture-ack.json"),
        published = read("publication.json");
      const released = byKind("owner_released").filter(
        (row) => row.workerId === eligible.workerId,
      );
      assert.equal(released.length, 1);
      assertAckTimeline({
        reconciled: parentOrder(reconciliation[0]),
        eligible: parentOrder(eligible),
        reader: parentOrder(current),
        publication: published.parentOrder,
        ack: ack.parentOrder,
        release: parentOrder(released[0]),
      });
      assert.equal(ack.operationId, fixture.operationId);
      assert.deepEqual(ack.checkpoint, fixture.checkpoint);
      assert.equal(ack.ackEligibleWorker.nonce, eligible.nonce);
      assert.ok(
        parentOrder(current) < published.parentOrder &&
          published.parentOrder < ack.parentOrder,
      );
      assert.equal(ack.sqliteAtomic, false);
      assert.equal(published.head, current.data.cut.control[0].head);
      assert.equal(published.digest, current.data.cut.control[0].digest);
    } else {
      assert.equal(byKind("ack_eligible").length, 0);
      assert.equal(fs.existsSync(path.join(root, "fixture-ack.json")), false);
      assert.equal(fs.existsSync(path.join(root, "publication.json")), false);
      const faults = caseName === "U4" ? u4Faults : r3Faults;
      assert.deepEqual(
        byKind("copy_fault_injected")
          .map((r) => r.data.variant)
          .sort(),
        [...faults].sort(),
      );
      for (const variant of faults) {
        const raw = read(`failure-decision-${variant}.json`).SQLResult;
        const unit = `${caseName.toLowerCase()}-${variant}`;
        const readerLife = life.filter(
          (a) => a.unit === unit && a.role === "reader",
        );
        assert.equal(readerLife.length, 1);
        const rawReadResult = byKind("done").filter(
          (row) =>
            row.workerId === readerLife[0].workerId &&
            read(`raw/command-${row.commandId}.json`).command === "read",
        );
        assert.equal(rawReadResult.length, 1);
        assert.deepEqual(
          raw,
          rawReadResult[0].data.ok
            ? rawReadResult[0].data.value
            : rawReadResult[0].data,
        );
        const copied = byKind("copy_created").filter(
          (row) => row.unit === unit,
        );
        assert.equal(copied.length, 1);
        assert.equal(copied[0].data.sourceUnit, originalLife.unit);
        assert.equal(
          reconcile({
            cut: raw.cut || null,
            fixture,
            binding: raw.binding,
            execution: origin.execution,
            settlement,
            suspect: origin.writer,
          }).status,
          "unavailable",
        );
        assert.equal(
          byKind("fence_committed").some((r) => r.unit === unit),
          false,
        );
        const restoreErrors = byKind("error_before_settlement").filter(
          (r) => r.unit === unit && r.role === "recovery",
        );
        assert.equal(restoreErrors.length, 1);
        assert.equal(
          restoreErrors[0].data.error.code,
          variant === "unreadable" ? "SQLITE_NOTADB" : "RECOVERY_UNAVAILABLE",
        );
      }
      const retained = reader("source_original_retained_after_copies");
      assert.deepEqual(retained.data.cut, committed.data.cut);
      if (caseName === "U4") {
        const old = reader("old_cut_while_original_transaction_still_live");
        assert.equal(
          reconcile({
            cut: old.data.cut,
            fixture,
            binding: old.data.binding,
            execution: origin.execution,
            settlement: { confirmed: false },
            suspect: origin.writer,
            allowProvenAbsence: true,
          }).status,
          "unavailable",
        );
      }
    }
  }
  // Each main recovery Actor starts after the suspect original process has exited.
  for (const actor of life.filter(
    (a) => a.role === "recovery" && a.unit === originalLife.unit,
  )) {
    const own = rows.filter((r) => r.workerId === actor.workerId);
    const unique = (kind) => {
      const found = own.filter((r) => r.kind === kind);
      assert.equal(found.length, 1);
      return found[0];
    };
    const owner = own.filter(
      (r) =>
        r.kind === "barrier" &&
        r.data.barrier === "owner_acquired_before_recovery",
    );
    assert.equal(owner.length, 1);
    assert.equal(owner[0].data.ownerInTransaction, true);
    const sqlRead = unique("sql_recovery_read"),
      restored = unique("restored"),
      fenced = unique("fence_committed");
    const fromAuthority = validateCut(
      sqlRead.data.cut,
      fixture,
      sqlRead.data.binding,
    );
    assert.deepEqual(restored.data, fromAuthority);
    assertRecoveryTimeline({
      settled: originalLife.exit.parentOrder,
      spawn: read(`raw/spawn-${actor.workerId}.json`).parentOrder,
      owner: parentOrder(owner[0]),
      read: parentOrder(sqlRead),
      restored: parentOrder(restored),
      fence: parentOrder(fenced),
      before: sqlRead.data.cut.control[0],
      after: fenced.data.capability,
    });
    assert.ok(fenced.data.capability.epoch > origin.execution.epoch);
    assert.notEqual(fenced.data.capability.token, origin.execution.token);
  }
  const cmdFiles = ["cmd-stdout.txt", "cmd-stderr.txt", "cmd-exit.txt"];
  if (!cmdFiles.every((f) => fs.existsSync(path.join(root, f))))
    return {
      status: "NOT TESTED",
      rawAudit: "raw criteria met; CLI exit UNVERIFIED",
      inventoryFiles: count,
      productionAcceptance: "NOT TESTED",
      U3: "NOT TESTED",
    };
  const exitText = fs
    .readFileSync(path.join(root, "cmd-exit.txt"), "utf8")
    .trim();
  assert.equal(exitText, "0", "independent top-level CMD exit");
  const cmdInventory = cmdFiles.map((f) => ({
    path: f,
    size: fs.statSync(path.join(root, f)).size,
    sha256: fileHash(path.join(root, f)),
  }));
  if (sealCMD) {
    fs.writeFileSync(
      path.join(root, "cmd-inventory.json"),
      JSON.stringify(cmdInventory, null, 2),
      { flag: "wx" },
    );
    fs.writeFileSync(
      path.join(root, "cmd-seal.json"),
      JSON.stringify(
        {
          runId,
          inventorySha256: seal.inventorySha256,
          cmdInventorySha256: fileHash(path.join(root, "cmd-inventory.json")),
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  } else {
    assert.deepEqual(read("cmd-inventory.json"), cmdInventory);
    assert.equal(
      read("cmd-seal.json").cmdInventorySha256,
      fileHash(path.join(root, "cmd-inventory.json")),
    );
  }
  return {
    status: "PASS WITH LIMITATION",
    rawAudit:
      "independent raw receipts, SQL cuts, lifecycle, inventory and CMD exit checked",
    runId,
    caseName,
    inventoryFiles: count,
    SQLReaders: readers.length,
    workers: life.length,
    productionAcceptance: "NOT TESTED",
    U3: "NOT TESTED",
  };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (
      !args.length ||
      args.length > 2 ||
      (args[1] && args[1] !== "--seal-cmd")
    )
      throw new Error(
        "Usage: node audit.cjs EVIDENCE_ROOT [--seal-cmd]; offline audit only",
      );
    const result = audit(args[0], args[1] === "--seal-cmd");
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "PASS WITH LIMITATION" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify(errorRecord(error), null, 2));
    process.exitCode = 1;
  }
}
module.exports = { audit };
