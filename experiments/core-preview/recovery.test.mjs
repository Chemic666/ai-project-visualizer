import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const driverRoot = process.env.APV_PREVIEW_TEST_DRIVER_ROOT;

test(
  "the restored view preserves percentages, old activity evidence, and current correction state",
  {
    skip:
      driverRoot === undefined
        ? "Set APV_PREVIEW_TEST_DRIVER_ROOT to the existing Driver."
        : false,
  },
  async () => {
    const { loadRecoveredCheckpoint } = await import("./recovery.mjs");
    const checkpoint = await loadRecoveredCheckpoint(driverRoot);
    assert.equal(checkpoint.key, "restored");
    assert.deepEqual(checkpoint.progress, {
      status: "available",
      completedWeight: 3,
      totalWeight: 6,
      percentage: "50%",
      ratio: 0.5,
    });
    assert.equal(checkpoint.sessionState, "ended");
    assert.deepEqual(checkpoint.currentTask, { status: "unknown" });
    assert.deepEqual(checkpoint.currentPhase, {
      status: "unknown",
      reason: "session_ended",
    });
    assert.deepEqual(checkpoint.phases, [
      {
        title: "Plan tasks",
        provenance: "visualizer_inferred",
        taskPositions: [0, 1],
        current: false,
        totals: { completedWeight: 3, totalWeight: 6 },
      },
    ]);
    const change = checkpoint.timeline.find(
      (entry) => entry.transition === "60% → 50%",
    );
    assert.equal(change?.kind, "progress.changed");
    assert.equal(change.progressChange.before.completedWeight, 3);
    assert.equal(change.progressChange.before.totalWeight, 5);
    assert.equal(change.progressChange.after.completedWeight, 3);
    assert.equal(change.progressChange.after.totalWeight, 6);
    assert.ok(change.progressChange.reasons.includes("weight_corrected"));
    assert.ok(
      change.evidence.some(
        (entry) =>
          entry.label === "Session review · 任务权重声明" &&
          entry.value === 3 &&
          entry.provenance === "user_confirmed",
      ),
    );
    const report = checkpoint.timeline.find(
      (entry) =>
        entry.kind === "task.status_reported" &&
        entry.title.includes("报告已验证"),
    );
    assert.equal(report?.provenance, "agent_reported");
    const review = checkpoint.tasks.find(
      (task) => task.title === "Session review",
    );
    assert.equal(review.completionReason, "verification_evidence_missing");
    assert.equal(checkpoint.timeline[review.evidencePositions.status], report);
    assert.ok(
      checkpoint.timeline[review.evidencePositions.weight].evidence.some(
        ({ label, value, provenance }) =>
          label === "Session review · 任务权重声明" &&
          value === 3 &&
          provenance === "user_confirmed",
      ),
    );
    const expired = checkpoint.timeline.find(
      (entry) => entry.kind === "correction.expired",
    );
    assert.ok(
      expired?.evidence.some(
        (entry) =>
          entry.lifecycle === "expired" &&
          entry.recordVersion === "current_state",
      ),
    );
    assert.ok(
      checkpoint.timeline.some(
        (entry) =>
          entry.kind === "progress.changed" &&
          entry.transition.endsWith("→ 不可用"),
      ),
    );
    const view = JSON.stringify(checkpoint);
    assert.doesNotMatch(
      view,
      /synthetic-marker|processorFingerprint|stateDigest|operationNonce|observedRoot|acceptedEvents|:apv-recovery|[A-Z]:[\\/]/i,
    );
  },
);

test("a failed recovery start exits without serving an in-memory fallback", () => {
  const script = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const invalidDriver = path.resolve("experiments/core-preview/index.html");
  const { status, signal, stdout, stderr } = spawnSync(
    process.execPath,
    [script, "--recover-demo", "--driver-root", invalidDriver],
    { encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  assert.equal(status, 1, stderr);
  assert.equal(signal, null);
  assert.equal(stdout, "");
  assert.match(stderr, /合成历史恢复失败/);
  assert.ok(!stderr.includes(invalidDriver));
});

test(
  "a Driver with changed JavaScript bytes is refused even with the original native binary",
  {
    skip:
      driverRoot === undefined
        ? "Set APV_PREVIEW_TEST_DRIVER_ROOT to the existing Driver."
        : false,
  },
  async () => {
    const { loadRecoveredCheckpoint } = await import("./recovery.mjs");
    const source = fs.realpathSync.native(driverRoot);
    const target = fs.mkdtempSync(
      path.join(os.tmpdir(), "apv-preview-driver-case-"),
    );
    fs.mkdirSync(path.join(target, "prebuilds"));
    fs.copyFileSync(
      path.join(source, "package.json"),
      path.join(target, "package.json"),
    );
    fs.copyFileSync(
      path.join(source, "prebuilds/win32-x64.node"),
      path.join(target, "prebuilds/win32-x64.node"),
    );
    fs.cpSync(path.join(source, "lib"), path.join(target, "lib"), {
      recursive: true,
    });
    fs.appendFileSync(
      path.join(target, "lib/index.js"),
      "\n// Synthetic hash mismatch fixture.\n",
    );

    await assert.rejects(loadRecoveredCheckpoint(target), {
      message: "synthetic_preview_driver_unavailable",
    });
  },
);

test(
  "a checkpoint-only restart preserves the saved confirmation without adding a Session end",
  { skip: driverRoot === undefined },
  async () => {
    const { loadRecoveredCheckpoint } = await import("./recovery.mjs");
    const checkpoint = await loadRecoveredCheckpoint(driverRoot, {
      endSession: false,
    });
    assert.equal(checkpoint.sessionState, "started");
    assert.equal(checkpoint.progress.percentage, "50%");
    assert.equal(checkpoint.currentTask.status, "available");
    assert.equal(checkpoint.currentTask.title, "Login");
    assert.equal(checkpoint.currentTask.provenance, "user_confirmed");
    assert.equal(
      checkpoint.currentTask.confirmedAt,
      "2026-11-15T10:02:00.000Z",
    );
    const proof =
      checkpoint.timeline[checkpoint.currentTask.correctionPosition];
    assert.equal(proof.kind, "correction.applied");
    assert.ok(
      proof.evidence.some(
        ({ value, provenance }) =>
          value === "Login" && provenance === "user_confirmed",
      ),
    );
    assert.ok(
      proof.evidence.some(
        ({ kind, lifecycle }) =>
          kind === "correction" && lifecycle === "active",
      ),
    );
    assert.equal(checkpoint.currentPhase.status, "available");
    assert.equal(checkpoint.currentPhase.title, "Plan tasks");
    assert.ok(
      !checkpoint.timeline.some(
        ({ kind }) => kind === "session.ended" || kind === "correction.expired",
      ),
    );
  },
);
