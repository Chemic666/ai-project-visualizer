"use strict";
const assert = require("node:assert/strict");
async function runCase(name, c) {
  const {
    actor,
    setup,
    reader,
    fixture,
    checks,
    barriers,
    verifyCut,
    checkComplete,
  } = c;
  const passed = (checkpoint) => checks.push({ status: "PASS", checkpoint });
  if (name === "A") {
    await setup("a");
    const a = await actor("a", "writer-a");
    const capA = (await a.call("acquire")).capability;
    assert.equal(capA.epoch, 1);
    const old = await reader("a", "pre_transaction");
    const pinned = await actor("a", "reader-pinned");
    verifyCut(
      await pinned.call("read", { checkpoint: "pin_old", pin: true }),
      old,
    );
    await a.call("stage");
    verifyCut(await reader("a", "uncommitted_full_bundle"), old);
    await a.call("observable_owner_loss");
    const b1 = await actor("a", "writer-b1");
    await b1.call("acquire", {}, "SQLITE_BUSY");
    assert.ok(b1.rows.some((r) => r.kind === "owner_held_unfenced"));
    assert.ok(b1.rows.some((r) => r.kind === "fence_attempt"));
    assert.equal(b1.rows.filter((r) => r.kind === "fence_committed").length, 0);
    verifyCut(await reader("a", "fence_busy"), old);
    await a.call("commit", {}, "OWNER_REVOKED");
    verifyCut(await reader("a", "old_rollback"), old);
    await a.call("close");
    await b1.call("close");
    const b2 = await actor("a", "writer-b2");
    const capB = (await b2.call("acquire")).capability;
    assert.equal(capB.epoch, 2);
    const fenced = await reader("a", "new_fence_before_business");
    assert.deepEqual(fenced.control, [
      { ...old.control[0], epoch: capB.epoch, token: capB.token },
    ]);
    verifyCut({ ...fenced, control: old.control }, old);
    await b2.call("stage");
    await b2.call("commit");
    verifyCut(
      await pinned.call("read", { checkpoint: "pinned_after_new_commit" }),
      old,
    );
    checkComplete(await reader("a", "fresh_after_new_commit"), fixture, capB);
    await pinned.call("close");
    await b2.call("close");
    passed(
      "A/D/E: old write blocks new fence; observable revocation rolls back; pinned old/fresh complete new cut",
    );
  } else if (name === "B") {
    await setup("b");
    const old = await actor("b", "writer-old");
    const stale = (await old.call("acquire")).capability;
    await old.call("release");
    const next = await actor("b", "writer-new");
    const fresh = (await next.call("acquire")).capability;
    assert.equal(fresh.epoch, 2);
    const before = await reader("b", "post_fence_pre_stale_probe");
    await old.call("stale_probe", { capability: stale }, "GUARD_MISMATCH");
    verifyCut(await reader("b", "after_stale_rejection"), before);
    await next.call("stage");
    await next.call("commit");
    const after = await reader("b", "new_complete_bundle");
    checkComplete(after, fixture, fresh);
    await old.call("stale_probe", { capability: stale }, "GUARD_MISMATCH");
    verifyCut(await reader("b", "after_second_stale_rejection"), after);
    // Same expected head=1 after head=2 must fail even with a fresh capability.
    await next.call("stage", {}, "BASE_CONFLICT");
    verifyCut(await reader("b", "after_base_conflict"), after);
    await old.call("close");
    await next.call("close");
    passed(
      "B/D/E: stale capability rejected inside write transaction; current capability cannot bypass base conflict",
    );
  } else {
    assert.equal(name, "C");
    for (const [index, barrier] of barriers.entries()) {
      const unit = `c-${index}`;
      await setup(unit);
      const w = await actor(unit, "writer");
      await w.call("acquire");
      const before = await reader(unit, `${barrier}:pre`);
      const result = await w.call(
        "stage",
        { inject: barrier },
        "SQLITE_CONSTRAINT_PRIMARYKEY",
      );
      assert.equal(result.error.inTransaction, true);
      assert.equal(result.settlement.rollbackConfirmed, true);
      verifyCut(
        await reader(unit, `${barrier}:after_explicit_rollback`),
        before,
      );
      await w.call("close");
      passed(
        `C/E: ${barrier}, actual constraint error, active transaction, explicit rollback, all-table old cut`,
      );
    }
    await setup("c-success");
    const w = await actor("c-success", "writer-control");
    const capability = (await w.call("acquire")).capability;
    const old = await reader("c-success", "success_control_pre");
    await w.call("stage");
    verifyCut(await reader("c-success", "success_control_uncommitted"), old);
    await w.call("commit");
    checkComplete(
      await reader("c-success", "success_control_post"),
      fixture,
      capability,
    );
    await w.call("close");
    passed(
      "C/D/E: full success control, acceptedEvents/history/snapshot/checkpoint match Core golden image",
    );
  }
}
module.exports = { runCase };
