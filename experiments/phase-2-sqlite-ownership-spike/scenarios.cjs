"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Actor } = require("./actors.cjs");
const { failure, hash } = require("./protocol.cjs");
const {
  verifySQL,
  verifyOP04Cut,
  classifyCounterexample,
} = require("./oracle.cjs");
const { writeExclusive, validateBinding } = require("./support.cjs");

const VARIANTS = Object.freeze({
  OP01: ["single"],
  OP02: ["competition"],
  OP03: ["release"],
  OP04: ["idle", "pre", "post"],
  OP05: ["lost", "closed"],
  OP06: ["protected", "protected_close", "unsafe", "deferred"],
  OP07: ["ordered", "interleaved"],
  OP08: [
    "acquired",
    "pre",
    "post",
    "sqlerror",
    "control_loss",
    "control_close",
    "unknown",
  ],
  OP09: ["alias", "copy", "missing", "rename", "delete", "generation"],
  OP10: ["timeout", "release_anomaly", "project_busy_watchdog"],
});
function invariant(value, label) {
  if (!value) throw Object.assign(failure("APV_INVARIANT"), { label });
}
function success(result) {
  if (!result?.ok)
    throw Object.assign(failure("APV_EXECUTION"), {
      observed: result?.category ?? "missing",
    });
  return result.result;
}
function rejected(result, categories) {
  if (result?.ok) invariant(false, "required rejection accepted");
  if (!categories.includes(result?.category))
    throw Object.assign(failure("APV_EXECUTION"), {
      observed: result?.category ?? "missing",
    });
  return result;
}
function intent(base = 0, operationId = `O${base + 1}`) {
  return { operationId, base, increment: 1 };
}

function verifyBusyCut(cut, binding, expected) {
  if (!cut) throw failure("APV_EXECUTION");
  verifySQL(cut, binding);
  invariant(
    cut.meta.lifecycle === "active" &&
      cut.meta.epoch === expected.epoch &&
      cut.meta.token === expected.token &&
      cut.meta.head === expected.head,
    "OP10 exact SQL cut",
  );
  if (expected.head === 1) {
    const row = cut.writes[0];
    invariant(
      row.operation_id === "O1" &&
        row.epoch === expected.epoch &&
        row.token === expected.token &&
        row.intent_digest ===
          hash({ operationId: "O1", base: 0, increment: 1 }),
      "OP10 exact business row",
    );
  }
  return cut;
}
function verifyBlockedCandidate(state, receipts) {
  invariant(
    state.state === "BLOCKED" && state.open && state.inTransaction,
    "OP10 candidate fail-closed with Owner retained",
  );
  invariant(
    !receipts.some(
      (r) =>
        [
          "epoch_committed",
          "data_committed",
          "published",
          "fixture_ack",
        ].includes(r.kind) ||
        (r.kind === "transition" && ["ACTIVE", "WRITING"].includes(r.data.to)),
    ),
    "OP10 blocked candidate has no effects",
  );
}
function verifyWatchdog(evidence, expected) {
  if (!evidence) throw failure("APV_EXECUTION");
  invariant(
    Object.entries(expected).every(([key, value]) => evidence?.[key] === value),
    "OP10 watchdog identity",
  );
  invariant(
    evidence.category === "APV_WATCHDOG" &&
      evidence.budgetMs === 5000 &&
      [evidence.phaseStarted, evidence.deadline, evidence.observed].every(
        Number.isFinite,
      ) &&
      Math.abs(evidence.deadline - evidence.phaseStarted - 5000) < 0.001 &&
      evidence.observed >= evidence.deadline,
    "OP10 actual parent watchdog boundary",
  );
}

// Only the post-takeover portion of OP04. read() is the existing independent
// Reader path; the injected I/O also permits pure tests without starting Actors.
async function completeOP04(binding, variant, a, b, read, write) {
  invariant(["idle", "pre", "post"].includes(variant), "OP04 variant");
  const old = a.receipts.find((r) => r.kind === "epoch_committed")?.data;
  const current = b.receipts.find((r) => r.kind === "epoch_committed")?.data;
  invariant(
    old?.epoch === 1 &&
      current?.epoch === 2 &&
      old.token &&
      current.token &&
      old.token !== current.token,
    "fresh takeover epoch/token",
  );
  const post = variant === "post";
  const history = post ? [old] : [];
  const recovery = verifyOP04Cut(
    await read("op04.recovery"),
    binding,
    current,
    history,
  );
  if (post) {
    const duplicate = await write(b);
    invariant(
      duplicate.duplicate === true && duplicate.head === 1,
      "retry existing receipt",
    );
    const retried = verifyOP04Cut(
      await read("op04.after_duplicate"),
      binding,
      current,
      history,
    );
    const body = (cut) => ({
      meta: cut.meta,
      state: cut.state,
      writes: cut.writes,
    });
    invariant(
      hash(body(recovery)) === hash(body(retried)),
      "duplicate cut unchanged",
    );
    const receipts = b.receipts.filter((r) => r.kind === "duplicate");
    invariant(
      receipts.length === 1 &&
        receipts[0].data.operationId === "O1" &&
        receipts[0].data.committedHead === 1 &&
        receipts[0].data.currentHead === 1,
      "duplicate receipt agrees with SQL",
    );
  }
  await write(b, history.length);
  const finalHistory = [...history, current];
  verifyOP04Cut(
    await read("op04.after_new_commit"),
    binding,
    current,
    finalHistory,
  );
  const oldCommits = a.receipts.filter((r) => r.kind === "data_committed");
  invariant(
    oldCommits.length === (post ? 1 : 0) &&
      !a.receipts.some((r) => ["published", "fixture_ack"].includes(r.kind)),
    "crashed A has only the expected commit and no publication/ACK",
  );
  if (post)
    invariant(
      oldCommits[0].data.operationId === "O1" &&
        oldCommits[0].data.head === 1 &&
        oldCommits[0].data.epoch === old.epoch &&
        oldCommits[0].data.ownerLost === false &&
        oldCommits[0].data.mode === "protected",
      "A commit agrees with retained O1",
    );
  const kinds = ["data_committed", "published", "fixture_ack"];
  const effects = kinds.map((kind) =>
    b.receipts.filter((r) => r.kind === kind),
  );
  invariant(
    effects.every((items) => items.length === 1),
    "one new B commit/publication/ACK",
  );
  const [commit, published, ack] = effects.map((items) => items[0]);
  invariant(
    effects.every(
      ([r]) =>
        r.data.operationId === `O${finalHistory.length}` &&
        r.data.head === finalHistory.length,
    ) &&
      commit.data.epoch === current.epoch &&
      commit.data.ownerLost === false &&
      commit.data.mode === "protected" &&
      commit.sequence < published.sequence &&
      published.sequence < ack.sequence,
    "B receipts agree with final SQL and publication order",
  );
}

async function runScenario(binding, variant) {
  const actors = [];
  let caseDeadline = performance.now() + 5000;
  let count = 0;
  let writers = 0;
  const actor = async (options = {}) => {
    if (performance.now() >= caseDeadline) throw failure("APV_WATCHDOG");
    const instance = new Actor(
      binding,
      `${options.role === "reader" ? "C" : ++writers === 1 ? "A" : "B"}${++count}`,
      { ...options, deadlineAt: caseDeadline },
    );
    actors.push(instance);
    await instance.ready();
    return instance;
  };
  const acquire = async (a, options) =>
    success(await a.command("acquire", options));
  const fence = async (a, options) =>
    success(await a.command("fence", options));
  const own = async (options) => {
    const a = await actor(options);
    await acquire(a);
    await fence(a);
    return a;
  };
  const write = async (a, base = 0, options = {}, operationId) =>
    success(await a.command("write", options, intent(base, operationId)));
  const read = async (checkpoint) => {
    const c = await actor({ role: "reader" });
    const cut = verifySQL(
      success(await c.command("read", checkpoint ? { checkpoint } : {})),
      binding,
    );
    await c.close();
    return cut;
  };
  let counterexample = null;
  let primaryError;
  try {
    switch (binding.caseId) {
      case "OP01": {
        const a = await actor();
        const held = await acquire(a);
        invariant(
          held.state === "HELD_UNFENCED" && held.epoch === 0,
          "lock is not ACTIVE",
        );
        const cap = await fence(a);
        invariant(
          cap.state === "ACTIVE" && cap.epoch === 1,
          "fence precedes ACTIVE",
        );
        await write(a);
        const cut = await read();
        invariant(
          cut.meta.head === 1 && cut.meta.epoch === 1,
          "single committed cut",
        );
        const epochIndex = a.receipts.findIndex(
          (r) => r.kind === "epoch_committed",
        );
        const activeIndex = a.receipts.findIndex(
          (r) => r.kind === "transition" && r.data.to === "ACTIVE",
        );
        invariant(
          epochIndex >= 0 && activeIndex > epochIndex,
          "epoch/ACTIVE receipt order",
        );
        break;
      }
      case "OP02": {
        const a = await own();
        const b = await actor();
        rejected(await b.command("acquire"), ["SQLITE_BUSY"]);
        invariant(
          b.receipts.some((r) => r.kind === "owner_begin_attempt") &&
            !b.receipts.some((r) => r.kind === "epoch_committed"),
          "real owner attempt rejected",
        );
        const cut = await read();
        invariant(
          cut.meta.epoch === 1 && cut.meta.head === 0,
          "loser did not write",
        );
        await write(a);
        break;
      }
      case "OP03": {
        const a = await own();
        await write(a);
        const old = success(await a.command("snapshot"));
        await a.close();
        const b = await own();
        rejected(await b.command("write", { presented: old }, intent(1)), [
          "APV_FENCE",
        ]);
        await write(b, 1);
        const cut = await read();
        invariant(
          cut.meta.epoch === 2 && cut.meta.head === 2,
          "normal takeover",
        );
        break;
      }
      case "OP04": {
        const a = await own();
        if (variant !== "idle") {
          const name =
            variant === "pre"
              ? "after_fixture_write"
              : "after_project_commit_before_ack";
          const task = a.start("write", { barrier: name }, intent());
          await a.waitBarrier(task, name);
        }
        await a.killOwned(`OP04-${variant}`);
        const b = await own();
        await completeOP04(binding, variant, a, b, read, write);
        break;
      }
      case "OP05": {
        const a = await own();
        const old = success(await a.command("snapshot"));
        if (variant === "lost") success(await a.command("lose_owner"));
        else success(await a.command("release"));
        rejected(await a.command("write", {}, intent()), ["APV_DISABLED"]);
        invariant(
          (await read()).meta.epoch === 1,
          "local rejection before new epoch",
        );
        const b = await own();
        for (const presented of [
          old,
          { ...old, epoch: 2, token: "wrong" },
          { ...success(await b.command("snapshot")), generation: "G2" },
        ])
          rejected(await b.command("write", { presented }, intent()), [
            "APV_FENCE",
          ]);
        await write(b);
        invariant(
          (await read()).meta.head === 1,
          "only current capability commits",
        );
        break;
      }
      case "OP06": {
        const mode = variant === "unsafe" ? "unsafe_baseline" : "protected";
        const a = await own({ mode });
        if (variant === "deferred") {
          await write(a, 0, { releaseDuringWrite: true });
          invariant(
            a.receipts.some((r) => r.kind === "release_deferred"),
            "release deferred inside write",
          );
          success(await a.command("release"));
          const b = await own();
          invariant(
            (await read()).meta.head === 1,
            "deferred release preserves committed cut",
          );
          await write(b, 1);
          break;
        }
        const task = a.start(
          "write",
          {
            loseOwner: variant === "protected_close" ? "close" : true,
            barrier: "before_final_guard",
          },
          intent(),
        );
        const entered = await a.waitBarrier(task, "before_final_guard");
        const b = await actor();
        await acquire(b);
        rejected(await b.command("fence"), ["SQLITE_BUSY"]);
        invariant(
          !b.receipts.some(
            (r) => r.kind === "transition" && r.data.to === "ACTIVE",
          ),
          "new owner not ACTIVE while project lock held",
        );
        a.resume(entered);
        const result = await a.deadline(task.promise);
        if (variant === "unsafe") {
          success(result);
          const commit = a.receipts.find((r) => r.kind === "data_committed");
          counterexample = classifyCounterexample({
            mode,
            ownerLost: commit?.data.ownerLost,
            committed: !!commit,
            sameEpoch: commit?.data.epoch === 1,
          });
          invariant(
            counterexample === "EXPECTED COUNTEREXAMPLE",
            "unsafe baseline actually reproduced",
          );
        } else {
          rejected(result, ["APV_OWNER_LOST"]);
          invariant(
            !a.receipts.some((r) => r.kind === "data_committed"),
            "guarded post-loss commit absent",
          );
        }
        await b.close();
        const b2 = await own();
        const cut = await read();
        invariant(
          cut.meta.head === (variant === "unsafe" ? 1 : 0) &&
            cut.meta.epoch === 2,
          "independent post-loss oracle",
        );
        await write(b2, cut.meta.head);
        break;
      }
      case "OP07": {
        const a = await own();
        await write(a);
        success(await a.command("release"));
        const b = await actor();
        await acquire(b);
        if (variant === "interleaved") {
          const task = b.start("fence", { barrier: "before_epoch_commit" });
          const entry = await b.waitBarrier(task, "before_epoch_commit");
          rejected(await a.command("write", {}, intent(1)), ["APV_DISABLED"]);
          b.resume(entry);
          success(await b.deadline(task.promise));
        } else await fence(b);
        await write(b, 1);
        const duplicate = await write(b, 0, {}, "O1");
        invariant(
          duplicate.duplicate &&
            duplicate.head === 2 &&
            (await read()).meta.head === 2,
          "retry does not rewind newer head",
        );
        break;
      }
      case "OP08": {
        const a = await actor();
        let expectedEpoch;
        if (variant === "acquired") {
          const task = a.start("acquire", { barrier: "owner_begin_ok" });
          await a.waitBarrier(task, "owner_begin_ok");
          await a.killOwned("OP08-owner-acquired");
          expectedEpoch = 0;
        } else {
          await acquire(a);
          if (["pre", "post"].includes(variant)) {
            const barrier =
              variant === "pre"
                ? "before_epoch_commit"
                : "after_epoch_commit_before_active";
            const task = a.start("fence", { barrier });
            await a.waitBarrier(task, barrier);
            await a.killOwned(`OP08-${variant}`);
            expectedEpoch = variant === "pre" ? 0 : 1;
          } else {
            const options =
              variant === "sqlerror"
                ? { failEpoch: true }
                : ["control_loss", "control_close"].includes(variant)
                  ? { loseOwner: variant === "control_close" ? "close" : true }
                  : { unknownEpoch: true };
            rejected(await a.command("fence", options), [
              "SQLITE_CONSTRAINT_PRIMARYKEY",
              "APV_OWNER_LOST",
              "APV_EPOCH_UNKNOWN",
            ]);
            invariant(
              !a.receipts.some(
                (r) => r.kind === "transition" && r.data.to === "ACTIVE",
              ),
              "failed epoch never active",
            );
            await a.close();
            expectedEpoch = variant === "unknown" ? 1 : 0;
          }
        }
        const b = await own();
        const cut = await read();
        invariant(
          cut.meta.epoch === expectedEpoch + 1 && cut.meta.head === 0,
          "epoch recovery not guessed",
        );
        await write(b);
        break;
      }
      case "OP09": {
        const a = await actor({
          generation: variant === "generation" ? "G2" : "G1",
        });
        if (["alias", "copy"].includes(variant))
          rejected(await a.command("acquire", { ownerAlias: variant }), [
            "APV_PATH_ALIAS",
          ]);
        else if (variant === "generation")
          rejected(await a.command("acquire"), ["APV_GENERATION"]);
        else if (variant === "missing") {
          validateBinding(binding);
          fs.renameSync(
            binding.ownerPath,
            `${binding.ownerPath}.missing-fixture`,
          );
          rejected(await a.command("acquire"), ["ENOENT"]);
        } else {
          await acquire(a);
          await fence(a);
          validateBinding(binding);
          let denied;
          try {
            if (variant === "rename")
              fs.renameSync(
                binding.ownerPath,
                `${binding.ownerPath}.renamed-fixture`,
              );
            else fs.unlinkSync(binding.ownerPath);
          } catch (error) {
            denied = error.code;
          }
          writeExclusive(path.join(binding.root, "evidence", "mutation.json"), {
            runId: binding.runId,
            caseId: binding.caseId,
            variant,
            denied: denied ?? null,
            path: "ownership/S1/owner.sqlite",
            observedAt: new Date().toISOString(),
          });
          invariant(
            ["EPERM", "EACCES", "EBUSY"].includes(denied),
            "live lock mutation denied; otherwise support blocker",
          );
          const b = await actor();
          rejected(await b.command("acquire"), ["SQLITE_BUSY"]);
        }
        invariant(
          (await read()).meta.head === 0,
          "path/generation attempt produced no data",
        );
        break;
      }
      case "OP10": {
        if (variant === "project_busy_watchdog") {
          const candidate = await actor();
          const held = await acquire(candidate);
          invariant(
            held.state === "HELD_UNFENCED" && held.open && held.inTransaction,
            "candidate really owns Owner before fence",
          );
          const initial = { epoch: 0, token: null, head: 0 };
          const before = verifyBusyCut(
            await read("op10.before_project_block"),
            binding,
            initial,
          );
          const blocker = await actor({ role: "project_blocker" });
          const hold = blocker.start("hold_project", {
            barrier: "project_lock_held",
          });
          const heldEntry = await blocker.waitBarrier(
            hold,
            "project_lock_held",
          );
          // A distinct, declared failure phase. Never extend a failing acquisition timer.
          const phaseStarted = performance.now();
          caseDeadline = phaseStarted + 5000;
          for (const instance of actors) instance.deadlineAt = caseDeadline;
          const busy = rejected(await candidate.command("fence"), [
            "SQLITE_BUSY",
          ]);
          verifyBlockedCandidate(busy.state, candidate.receipts);
          verifyBusyCut(await read("op10.fencing_busy"), binding, initial);
          const waiting = candidate.start("blocked_wait", {
            barrier: "blocked_until_watchdog",
          });
          const waitEntry = await candidate.waitBarrier(
            waiting,
            "blocked_until_watchdog",
          );
          const proof = await candidate.observeBlockedWatchdog(
            waiting,
            waitEntry,
            phaseStarted,
          );
          verifyWatchdog(proof, {
            runId: binding.runId,
            workerId: candidate.workerId,
            nonce: candidate.nonce,
            commandId: waiting.id,
            barrierId: waitEntry.id,
          });
          invariant(
            !blocker.closed &&
              blocker.pending.has(hold.id) &&
              blocker.receipts.some(
                (r) =>
                  r.kind === "project_lock_held" &&
                  r.data.inTransaction &&
                  r.data.dml === false,
              ) &&
              !blocker.receipts.some((r) => r.kind === "project_lock_released"),
            "independent Project lock retained through watchdog",
          );
          // Cleanup/recovery is a new bounded phase; the expired candidate never resumes fencing.
          caseDeadline = performance.now() + 5000;
          for (const instance of actors) instance.deadlineAt = caseDeadline;
          candidate.resume(waitEntry);
          verifyBlockedCandidate(
            success(await candidate.deadline(waiting.promise)),
            candidate.receipts,
          );
          await candidate.close();
          blocker.resume(heldEntry);
          invariant(
            success(await blocker.deadline(hold.promise)).released === true,
            "blocker rollback confirmed",
          );
          await blocker.close();
          const after = verifyBusyCut(
            await read("op10.after_blocker_release"),
            binding,
            initial,
          );
          invariant(
            hash(before) === hash(after),
            "watchdog leaves complete SQL cut unchanged",
          );
          const fresh = await own();
          const capability = fresh.receipts.find(
            (r) => r.kind === "epoch_committed",
          ).data;
          invariant(
            capability.epoch === 1 && capability.token,
            "fresh instance fences from persisted epoch zero",
          );
          await write(fresh);
          verifyBusyCut(await read("op10.after_recovery_commit"), binding, {
            epoch: 1,
            token: capability.token,
            head: 1,
          });
          const effects = ["data_committed", "published", "fixture_ack"].map(
            (kind) => fresh.receipts.filter((r) => r.kind === kind),
          );
          invariant(
            effects.every(
              (items) =>
                items.length === 1 &&
                items[0].data.operationId === "O1" &&
                items[0].data.head === 1,
            ) &&
              effects[0][0].sequence < effects[1][0].sequence &&
              effects[1][0].sequence < effects[2][0].sequence &&
              effects[0][0].data.epoch === 1 &&
              effects[0][0].data.ownerLost === false,
            "one legal commit/publication/fixture ACK",
          );
          break;
        }
        const a = await own();
        const b = await actor();
        rejected(
          await b.command("acquire", {
            diagnostics: { pid: 0, heartbeat: "1970-01-01" },
          }),
          ["SQLITE_BUSY"],
        );
        if (variant === "release_anomaly") {
          const task = a.start("release", { barrier: "before_owner_release" });
          const entry = await a.waitBarrier(task, "before_owner_release");
          const c = await actor();
          rejected(await c.command("acquire"), ["SQLITE_BUSY"]);
          a.resume(entry);
          success(await a.deadline(task.promise));
        } else success(await a.command("release"));
        await b.close();
        const b2 = await own();
        await write(b2);
        invariant(
          (await read()).meta.epoch === 2,
          "later explicit acquisition succeeds",
        );
        break;
      }
      default:
        throw failure("APV_CASE");
    }
    return {
      status: "PASS",
      counterexample,
      scope: "disposable cooperative fixture",
      hiddenLockLossGuarantee: "NOT GUARANTEED",
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError;
    for (const a of actors) {
      a.deadlineAt = performance.now() + 5000; // Separate bounded cleanup grace.
      try {
        await a.close();
      } catch (error) {
        cleanupError ??= error;
        if (a.bound && !a.closed) {
          try {
            await a.killOwned("harness-cleanup-after-error");
          } catch {
            /* Preserve blocked handle evidence; never kill by PID fallback. */
          }
        }
      }
    }
    if (cleanupError) {
      const details = {
        observed: cleanupError.code,
        unclosed: actors.some((a) => !a.closed),
      };
      if (primaryError) primaryError.cleanup = details;
      else throw Object.assign(failure("APV_CLEANUP"), details);
    }
  }
}
module.exports = {
  VARIANTS,
  runScenario,
  invariant,
  success,
  rejected,
  completeOP04,
  verifyBusyCut,
  verifyBlockedCandidate,
  verifyWatchdog,
};
