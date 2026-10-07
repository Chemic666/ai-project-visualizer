import { expect, expectTypeOf, test } from "vitest";

import type {
  Assertion,
  AssertionId,
  AssertionTarget,
  PhaseId,
  ProjectId,
  ResolvedConclusion,
  ResolutionMetadata,
  SessionId,
  SourceId,
  TaskId,
} from "../src/index.js";

type Fits<From, To> = [From] extends [To] ? true : false;

const resolution = {
  resolvedAt: "2026-10-07T08:00:00.000Z",
  ruleId: "fixture.task-status.explanation",
  ruleVersion: "1",
  reason:
    "Fixture records an existing completion report with a conflicting claim.",
} satisfies ResolutionMetadata;

test("preserves all Assertion target ID associations in the conclusion union", () => {
  expectTypeOf<ResolvedConclusion["target"]>().toEqualTypeOf<AssertionTarget>();
  expectTypeOf<
    ResolvedConclusion<"task.status">["targetId"]
  >().toEqualTypeOf<TaskId>();
  expectTypeOf<
    ResolvedConclusion<"task.certainty">["targetId"]
  >().toEqualTypeOf<TaskId>();
  expectTypeOf<
    ResolvedConclusion<"task.weight">["targetId"]
  >().toEqualTypeOf<TaskId>();
  expectTypeOf<
    ResolvedConclusion<"phase.status">["targetId"]
  >().toEqualTypeOf<PhaseId>();
  expectTypeOf<
    ResolvedConclusion<"project.currentTask">["targetId"]
  >().toEqualTypeOf<ProjectId>();
  expectTypeOf<
    ResolvedConclusion<"project.currentPhase">["targetId"]
  >().toEqualTypeOf<ProjectId>();
  expectTypeOf<
    ResolvedConclusion<"session.projectAssociation">["targetId"]
  >().toEqualTypeOf<SessionId>();

  type TaskStatusWithPhaseId = Omit<
    ResolvedConclusion<"task.status">,
    "targetId"
  > & { readonly targetId: PhaseId };
  type CurrentTaskWithTaskId = Omit<
    ResolvedConclusion<"project.currentTask">,
    "targetId"
  > & { readonly targetId: TaskId };
  expectTypeOf<
    Fits<TaskStatusWithPhaseId, ResolvedConclusion>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<CurrentTaskWithTaskId, ResolvedConclusion>
  >().toEqualTypeOf<false>();
});

test("uses readonly Assertion ID references without copying a conclusion value", () => {
  expectTypeOf<
    ResolvedConclusion["selectedAssertionId"]
  >().toEqualTypeOf<AssertionId>();
  expectTypeOf<ResolvedConclusion["supportingAssertionIds"]>().toEqualTypeOf<
    readonly AssertionId[]
  >();
  expectTypeOf<ResolvedConclusion["conflictingAssertionIds"]>().toEqualTypeOf<
    readonly AssertionId[]
  >();
  expectTypeOf<
    Extract<
      keyof ResolvedConclusion,
      "value" | "status" | "currentTask" | "weight" | "provenance"
    >
  >().toEqualTypeOf<never>();

  type WithTaskReference = Omit<
    ResolvedConclusion<"task.status">,
    "selectedAssertionId"
  > & { readonly selectedAssertionId: TaskId };
  type WithSupportingTasks = Omit<
    ResolvedConclusion<"task.status">,
    "supportingAssertionIds"
  > & { readonly supportingAssertionIds: readonly TaskId[] };
  type WithConflictingSources = Omit<
    ResolvedConclusion<"task.status">,
    "conflictingAssertionIds"
  > & { readonly conflictingAssertionIds: readonly SourceId[] };
  expectTypeOf<
    Fits<WithTaskReference, ResolvedConclusion>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<WithSupportingTasks, ResolvedConclusion>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<WithConflictingSources, ResolvedConclusion>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<ResolvedConclusion["supportingAssertionIds"], AssertionId[]>
  >().toEqualTypeOf<false>();
  expectTypeOf<Fits<null, ResolvedConclusion>>().toEqualTypeOf<false>();

  // No resolved conclusion is represented by absence, without a fake value.
  const absent: ResolvedConclusion | undefined = undefined;
  expect(absent).toBeUndefined();
});

test("stores a plain JSON explanation while preserving independent source Assertions", () => {
  const taskId = "task-1" as TaskId;
  const assertions: readonly [
    Assertion<"task.status">,
    Assertion<"task.status">,
    Assertion<"task.status">,
  ] = [
    {
      id: "assertion-completion" as AssertionId,
      target: "task.status",
      targetId: taskId,
      value: "completed",
      provenance: "agent_reported",
      sourceId: "source-agent" as SourceId,
      observedAt: "2026-10-07T07:59:00.000Z",
    },
    {
      id: "assertion-support" as AssertionId,
      target: "task.status",
      targetId: taskId,
      value: "completed",
      provenance: "agent_reported",
      sourceId: "source-agent" as SourceId,
      observedAt: "2026-10-07T07:59:10.000Z",
    },
    {
      id: "assertion-conflict" as AssertionId,
      target: "task.status",
      targetId: taskId,
      value: "blocked",
      provenance: "agent_reported",
      sourceId: "source-other-agent" as SourceId,
      observedAt: "2026-10-07T07:58:00.000Z",
    },
  ];
  const before = JSON.stringify(assertions);
  // Prebuilt fixture only: no selection or precedence policy runs here.
  const conclusion: ResolvedConclusion<"task.status"> = {
    target: "task.status",
    targetId: taskId,
    selectedAssertionId: assertions[0].id,
    supportingAssertionIds: [assertions[1].id],
    conflictingAssertionIds: [assertions[2].id],
    resolution,
  };

  expect(Object.getPrototypeOf(conclusion)).toBe(Object.prototype);
  expect(JSON.parse(JSON.stringify(conclusion))).toEqual(conclusion);
  expect(Object.keys(conclusion).sort()).toEqual([
    "conflictingAssertionIds",
    "resolution",
    "selectedAssertionId",
    "supportingAssertionIds",
    "target",
    "targetId",
  ]);
  expect(JSON.stringify(assertions)).toBe(before);
  const selected = assertions.find(
    (assertion) => assertion.id === conclusion.selectedAssertionId,
  );
  expect(selected).toBe(assertions[0]);
  expect(selected?.value).toBe("completed");
  expect(selected?.provenance).toBe("agent_reported");
  expect(conclusion).not.toHaveProperty("value");
  expect(conclusion).not.toHaveProperty("provenance");
});

test("retains Agent-neutral resolution rule, version, reason and time", () => {
  expectTypeOf<
    ResolvedConclusion["resolution"]
  >().toEqualTypeOf<ResolutionMetadata>();
  expect(Object.getPrototypeOf(resolution)).toBe(Object.prototype);
  expect(JSON.parse(JSON.stringify(resolution))).toEqual({
    resolvedAt: "2026-10-07T08:00:00.000Z",
    ruleId: "fixture.task-status.explanation",
    ruleVersion: "1",
    reason:
      "Fixture records an existing completion report with a conflicting claim.",
  });
});
