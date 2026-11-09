import { expect, test } from "vitest";
import {
  runCoreWalkthrough,
  type WalkthroughTask,
} from "../examples/walkthrough.js";
import { presentTask } from "../examples/preview-presentation.js";

function fixture(): WalkthroughTask {
  return runCoreWalkthrough()
    .checkpoints.find((row) => row.key === "completed-report")!
    .tasks.find((task) => task.title === "Login")!;
}

test("Agent Reported COMPLETED stays a completion claim rather than a verification check", () => {
  const view = presentTask(fixture());
  expect(view.symbol).toBe("◐");
  expect(view.statusSource).toBe("Agent Reported");
  expect(view.statusLabel).toBe("已声明完成");
  expect(view.weightSource).toBe("User Confirmed");
});

test("a reported VERIFIED without Core verification evidence never becomes a verified check", () => {
  const view = presentTask({
    ...fixture(),
    status: "verified",
    completion: "unknown",
    completionReason: "verification_evidence_missing",
  });
  expect(view.symbol).toBe("?");
  expect(view.statusLabel).toBe("验证依据不足");
  expect(view.detail).toContain("独立验证");
});

test("a Core verified conclusion uses its independent verification explanation", () => {
  const view = presentTask({
    ...fixture(),
    status: "verified",
    completion: "verified",
    completionReason: "independent_verification",
    statusProvenance: "observed",
  });
  expect(view.symbol).toBe("✓");
  expect(view.statusLabel).toBe("已独立验证");
  expect(view.statusSource).toBe("Observed");
});

test("missing status and weight stay unknown instead of looking like TODO or zero weight", () => {
  const unknown = runCoreWalkthrough()
    .checkpoints.find((row) => row.key === "plan-expanded")!
    .tasks.find((task) => task.title === "Refresh Token")!;
  const view = presentTask(unknown);
  expect(view.symbol).toBe("?");
  expect(view.statusLabel).toBe("未报告");
  expect(view.weightLabel).toBe("未知");
});
