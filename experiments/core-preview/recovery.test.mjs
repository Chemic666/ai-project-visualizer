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
    const change = checkpoint.timeline.find(
      (entry) => entry.transition === "60% → 50%",
    );
    assert.equal(change?.kind, "progress.changed");
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
    assert.equal(
      checkpoint.tasks.find((task) => task.title === "Session review")
        .completionReason,
      "verification_evidence_missing",
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
