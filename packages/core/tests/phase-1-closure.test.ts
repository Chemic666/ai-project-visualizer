import { expect, test, vi } from "vitest";
import {
  applyNormalizedEvent,
  createCoreState,
  getAssertionsForTarget,
  getPhase,
  getProject,
  getTask,
} from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  EventId,
  InterpretationState,
  NormalizedEvent,
  ProjectId,
  ResolvedConclusion,
  SourceId,
  TaskId,
  TimelineReference,
} from "../src/index.js";
import {
  closureCorrections,
  inactiveCorrections,
} from "./fixtures/closure-contracts.js";
import {
  createHierarchyFixture,
  createStatusEvent,
  otherTaskId,
  phaseId,
  projectId,
  sourceId,
  taskId,
} from "./fixtures/core-state.js";

vi.mock("node:fs", () => {
  throw new Error("Closure Core must not use filesystem APIs");
});
vi.mock("node:fs/promises", () => {
  throw new Error("Closure Core must not use filesystem APIs");
});
vi.mock("node:sqlite", () => {
  throw new Error("Closure Core must not use database APIs");
});
vi.mock("node:net", () => {
  throw new Error("Closure Core must not use network APIs");
});
vi.mock("node:http", () => {
  throw new Error("Closure Core must not use network APIs");
});
vi.mock("node:https", () => {
  throw new Error("Closure Core must not use network APIs");
});
vi.mock("node:child_process", () => {
  throw new Error("Closure Core must not start host processes");
});

test("closure: independent Core import and trusted fixture hierarchy need no Agent, IDE or external service", async () => {
  const fetch = vi.fn(() => {
    throw new Error("Closure must not call network or LLM services");
  });
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  try {
    const core = await import("../src/index.js");
    const state = createHierarchyFixture();
    expect(core.createCoreState()).toEqual(createCoreState());
    expect(getProject(state, projectId)?.phaseIds).toEqual([phaseId]);
    expect(getPhase(state, phaseId)?.taskIds).toEqual([taskId]);
    expect(getTask(state, taskId)?.phaseId).toBe(phaseId);
    expect(state.corrections).toEqual([]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("closure: source reports coexist with original evidence and remain unresolved", () => {
  const original: Assertion<"task.status"> = {
    id: "assertion-preloaded" as AssertionId,
    target: "task.status",
    targetId: taskId,
    value: "in_progress",
    provenance: "agent_reported",
    sourceId: "source-original" as SourceId,
    observedAt: "2026-10-07T09:00:00.000Z",
  };
  const base = createHierarchyFixture();
  const initial = createCoreState({
    ...base,
    assertions: [original],
    tasks: base.tasks.map((task) =>
      task.id === taskId
        ? { ...task, statusAssertionIds: [original.id] }
        : task,
    ),
  });
  const event = createStatusEvent();
  const first = applyNormalizedEvent(initial, event);
  const second = applyNormalizedEvent(
    first.state,
    createStatusEvent({
      id: "event-source-b" as EventId,
      sourceId: "source-b" as SourceId,
      payload: { taskId, status: "blocked" },
    }),
  );
  expect(second.status).toBe("applied");
  const assertions = getAssertionsForTarget(
    second.state,
    "task.status",
    taskId,
  );
  expect(assertions).toHaveLength(3);
  expect(assertions[0]).toBe(original);
  expect(assertions.map((assertion) => assertion.value)).toEqual([
    "in_progress",
    "completed",
    "blocked",
  ]);
  expect(
    assertions.every((assertion) => assertion.provenance === "agent_reported"),
  ).toBe(true);
  expect(new Set(assertions.map((assertion) => assertion.sourceId)).size).toBe(
    3,
  );
  expect(second.state.resolvedConclusions).toEqual([]);
  expect(getTask(second.state, taskId)).not.toHaveProperty("status");
  expect(initial.assertions).toEqual([original]);
});

test("closure: explicit unavailable, ambiguous, available and stale fixtures do not run a resolver or freshness detector", () => {
  const empty = createHierarchyFixture();
  const report = createStatusEvent();
  const first = applyNormalizedEvent(empty, report).state;
  const second = applyNormalizedEvent(
    first,
    createStatusEvent({
      id: "event-conflicting" as EventId,
      sourceId: "source-b" as SourceId,
      payload: { taskId, status: "blocked" },
    }),
  ).state;
  const firstId = first.assertions[0]!.id;
  const secondId = second.assertions[1]!.id;
  const conclusion: ResolvedConclusion<"task.status"> = {
    target: "task.status",
    targetId: taskId,
    selectedAssertionId: firstId,
    supportingAssertionIds: [],
    conflictingAssertionIds: [secondId],
    resolution: {
      resolvedAt: "2026-10-07T10:01:00.000Z",
      ruleId: "fixture.preloaded-explanation",
      ruleVersion: "1",
      reason: "Explicit fixture explanation, not an algorithm",
    },
  };
  const resolved = createCoreState({
    ...second,
    resolvedConclusions: [conclusion],
  });
  // Each interpretation below is explicit fixture input, not helper output.
  const interpretations: readonly InterpretationState<"task.status">[] = [
    {
      target: "task.status",
      targetId: taskId,
      status: "unavailable",
      reasonCode: "no_evidence",
    },
    {
      target: "task.status",
      targetId: taskId,
      status: "unavailable",
      reasonCode: "unresolved",
      supportingReferences: [{ kind: "assertion", assertionId: firstId }],
    },
    {
      target: "task.status",
      targetId: taskId,
      status: "ambiguous",
      candidateAssertionIds: [firstId, secondId],
      reasonCode: "fixture_conflicting_reports",
    },
    {
      target: "task.status",
      targetId: taskId,
      status: "available",
      conclusion,
    },
    {
      target: "task.status",
      targetId: taskId,
      status: "stale",
      staleSince: "2026-10-07T10:02:00.000Z",
      detectedAt: "2026-10-07T10:03:00.000Z",
      reasonCode: "fixture_disconnected",
      lastKnownConclusion: conclusion,
      supportingReferences: [{ kind: "event", eventId: report.id }],
    },
  ];
  expect(empty.assertions).toEqual([]);
  expect(first.assertions).toHaveLength(1);
  expect(second.assertions.map((assertion) => assertion.value)).toEqual([
    "completed",
    "blocked",
  ]);
  expect(second.resolvedConclusions).toEqual([]);
  expect(resolved.resolvedConclusions[0]).toBe(conclusion);
  expect(JSON.parse(JSON.stringify(interpretations))).toEqual(interpretations);
  for (const interpretation of interpretations) {
    expect(interpretation).not.toHaveProperty("value");
    expect(interpretation).not.toHaveProperty("confidence");
  }
  const stale = interpretations.find(
    (interpretation) => interpretation.status === "stale",
  );
  expect(stale?.status).toBe("stale");
  expect(stale?.lastKnownConclusion).toBe(conclusion);
});

test("closure: internal and stable source replays are idempotent while changed IDs without stable identity are not", () => {
  const initial = createHierarchyFixture();
  const stable = createStatusEvent({
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "stable-source-event",
    },
  });
  const applied = applyNormalizedEvent(initial, stable);
  const internalReplay = applyNormalizedEvent(applied.state, stable);
  const sourceReplay = applyNormalizedEvent(applied.state, {
    ...stable,
    id: "event-renormalized" as EventId,
  });
  expect(internalReplay).toEqual({
    status: "duplicate",
    reason: "internal_event_id",
    state: applied.state,
  });
  expect(sourceReplay).toEqual({
    status: "duplicate",
    reason: "stable_source_event",
    state: applied.state,
  });
  expect(sourceReplay.state.assertions).toHaveLength(1);
  expect(sourceReplay.state.acceptedEvents).toHaveLength(1);
  const withoutIdentity = applyNormalizedEvent(initial, createStatusEvent());
  const renormalized = applyNormalizedEvent(
    withoutIdentity.state,
    createStatusEvent({ id: "event-without-stable-identity" as EventId }),
  );
  expect(renormalized.status).toBe("applied");
  expect(renormalized.state.assertions).toHaveLength(2);
  expect(renormalized.state.acceptedEvents).toHaveLength(2);
});

test("closure: invalid project or task attribution is rejected without guessing", () => {
  const initial = createHierarchyFixture();
  const invalidEvents = [
    createStatusEvent({ projectId: "project-missing" as ProjectId }),
    createStatusEvent({
      payload: { taskId: "task-missing" as TaskId, status: "completed" },
    }),
    createStatusEvent({
      payload: { taskId: otherTaskId, status: "completed" },
    }),
  ];
  const reasons = [
    "project_not_found",
    "task_not_found",
    "task_project_mismatch",
  ];
  invalidEvents.forEach((event, index) => {
    const result = applyNormalizedEvent(initial, event);
    expect(result).toEqual({
      status: "rejected",
      reason: reasons[index],
      state: initial,
    });
    expect(result.state).toBe(initial);
  });
});

test("closure: both plan inputs are retained without reconciling the fixture hierarchy", () => {
  const initial = createHierarchyFixture();
  let state = initial;
  for (const type of ["plan.detected", "plan.updated"] as const) {
    const event: NormalizedEvent<"plan.detected" | "plan.updated"> = {
      id: `event-${type}` as EventId,
      schemaVersion: 1,
      projectId,
      sourceId,
      receivedAt: "2026-10-07T10:00:00.000Z",
      type,
      payload: {
        completeness: "complete",
        steps: [{ title: "New source plan step" }],
      },
    };
    const result = applyNormalizedEvent(state, event);
    expect(result.status).toBe("applied");
    state = result.state;
  }
  expect(state.acceptedEvents).toHaveLength(2);
  expect(state.projects).toBe(initial.projects);
  expect(state.phases).toBe(initial.phases);
  expect(state.tasks).toBe(initial.tasks);
  expect(state.assertions).toEqual([]);
});

test("closure: Correction and Timeline references survive serialization without application or generated history", () => {
  const initial = createCoreState({
    ...createHierarchyFixture(),
    corrections: closureCorrections,
  });
  const applied = applyNormalizedEvent(initial, createStatusEvent());
  expect(applied.state.corrections).toBe(initial.corrections);
  expect(
    applied.state.corrections.map((correction) => correction.scope.kind),
  ).toEqual(["current_task", "historical_activity_association", "task_weight"]);
  expect(
    applied.state.corrections.every(
      (correction) => correction.lifecycle.status === "active",
    ),
  ).toBe(true);
  expect(applied.state.resolvedConclusions).toEqual([]);
  const references: readonly TimelineReference[] = [
    { kind: "event", eventId: applied.state.acceptedEvents[0]!.id },
    { kind: "assertion", assertionId: applied.state.assertions[0]!.id },
    { kind: "correction", correctionId: closureCorrections[0].id },
  ];
  const data = {
    state: applied.state,
    references,
    lifecycleFixtures: inactiveCorrections,
  };
  expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  expect(applied.state).not.toHaveProperty("timelineEntries");
  expect(applied.state).not.toHaveProperty("interpretations");
});
