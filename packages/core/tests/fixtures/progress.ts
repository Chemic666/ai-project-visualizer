import * as core from "../../src/index.js";
import type {
  Assertion,
  AssertionId,
  CorrectionId,
  EventId,
  PlanEngineState,
  ResolvedConclusion,
  SourceId,
  TaskId,
  TaskWeight,
  WorkStatus,
} from "../../src/index.js";
import { planCore, planEvent, planProject, planSource } from "./plan.js";

export function progressFixture() {
  let plan = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("plan-1", {
      steps: [
        {
          sourceItemId: "done",
          title: "Completed work",
          certainty: "confirmed",
        },
        {
          sourceItemId: "remaining",
          title: "Remaining work",
          certainty: "confirmed",
        },
      ],
    }),
  ).state;
  const [done, remaining] = plan.heads[0]!.entries.map((e) => e.taskId) as [
    TaskId,
    TaskId,
  ];
  plan = addWeight(plan, done, 32, "weight-done");
  plan = addWeight(plan, remaining, 13, "weight-remaining");
  plan = reportStatus(plan, done, "completed", "done-report");
  plan = reportStatus(plan, remaining, "in_progress", "remaining-report");
  return { plan, scope: plan.heads[0]!.scope, done, remaining };
}

export function addWeight(
  plan: PlanEngineState,
  taskId: TaskId,
  value: number,
  id: string,
  extra: Partial<
    Pick<
      Assertion<"task.weight">,
      "sourceId" | "sourceReference" | "observedAt"
    >
  > & { provenance?: "observed" | "agent_reported" | "user_confirmed" } = {},
): PlanEngineState {
  const assertion: Assertion<"task.weight"> = {
    id: id as AssertionId,
    target: "task.weight",
    targetId: taskId,
    value: value as TaskWeight,
    provenance: "agent_reported",
    sourceId: planSource,
    observedAt: "2026-10-20T05:00:00.000Z",
    sourceReference: { sourceId: planSource, reference: id },
    ...extra,
  };
  return {
    ...plan,
    core: {
      ...plan.core,
      assertions: [...plan.core.assertions, assertion],
      tasks: plan.core.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              weightAssertionIds: [...task.weightAssertionIds, assertion.id],
            }
          : task,
      ),
    },
  };
}

export function reportStatus(
  plan: PlanEngineState,
  taskId: TaskId,
  status: WorkStatus,
  id: string,
): PlanEngineState {
  return {
    ...plan,
    core: core.applyNormalizedEvent(plan.core, {
      id: id as EventId,
      schemaVersion: 1,
      type: "task.status_reported",
      projectId: planProject,
      sourceId: planSource,
      receivedAt: "2026-10-20T05:00:00.000Z",
      payload: { taskId, status },
    }).state,
  };
}

export function selectAssertion(
  plan: PlanEngineState,
  target: "task.status" | "task.weight",
  taskId: TaskId,
  id: string,
): PlanEngineState {
  const ids = plan.core.assertions
    .filter((a) => a.target === target && a.targetId === taskId)
    .map((a) => a.id);
  const chosen = plan.core.assertions.find((a) => a.id === id)!;
  const resolution: ResolvedConclusion<"task.status" | "task.weight"> = {
    target,
    targetId: taskId,
    selectedAssertionId: id as AssertionId,
    supportingAssertionIds: ids.filter(
      (other) =>
        other !== id &&
        plan.core.assertions.find((a) => a.id === other)!.value ===
          chosen.value,
    ),
    conflictingAssertionIds: ids.filter(
      (other) =>
        other !== id &&
        plan.core.assertions.find((a) => a.id === other)!.value !==
          chosen.value,
    ),
    resolution: {
      resolvedAt: "2026-10-20T05:00:01.000Z",
      ruleId: "fixture.explicit-current-claim",
      ruleVersion: "1",
      reason: "Synthetic explicit resolution",
    },
  };
  return {
    ...plan,
    core: {
      ...plan.core,
      resolvedConclusions: [
        ...plan.core.resolvedConclusions.filter(
          (r) => r.target !== target || r.targetId !== taskId,
        ),
        resolution,
      ],
    },
  };
}

export function correctWeight(
  plan: PlanEngineState,
  taskId: TaskId,
  value: number,
  id = "manual-weight",
): PlanEngineState {
  const user = "synthetic-user" as SourceId;
  const updated = addWeight(plan, taskId, value, id, {
    provenance: "user_confirmed",
    sourceId: user,
    sourceReference: { sourceId: user, reference: id },
  });
  return {
    ...updated,
    core: {
      ...updated.core,
      corrections: [
        ...updated.core.corrections,
        {
          id: `${id}-correction` as CorrectionId,
          scope: { kind: "task_weight", projectId: planProject, taskId },
          correctedAssertionId: id as AssertionId,
          effectiveAt: "2026-10-20T05:00:01.000Z",
          lifecycle: { status: "active" },
        },
      ],
    },
  };
}
