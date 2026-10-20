import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  CorrectionId,
  EventId,
  SourceId,
  TaskWeight,
  PlanInput,
  SessionId,
  ProjectId,
  PhaseId,
  TaskId,
} from "../src/index.js";
import {
  planCore,
  planEvent,
  planProject,
  planSource,
} from "./fixtures/plan.js";

test("explicit plan engine builds a hierarchy without fabricating work status or weights", () => {
  expect(core.applyPlanEvent).toBeTypeOf("function");
  const initial = core.createPlanEngineState(planCore());
  const result = core.applyPlanEvent(initial, planEvent("r1"));
  expect(result.status).toBe("applied");
  expect(initial.core.tasks).toEqual([]);
  expect(result.state.core.tasks.map((t) => t.title)).toEqual([
    "First",
    "Second",
    "Third",
  ]);
  expect(result.state.core.phases).toHaveLength(1);
  expect(result.state.heads[0]?.phases[0]).toMatchObject({
    provenance: "visualizer_inferred",
  });
  expect(result.state.core.assertions.map((a) => a.value)).toEqual([
    "confirmed",
    "tentative",
    "idea",
  ]);
  expect(
    result.state.core.tasks.every(
      (t) =>
        t.statusAssertionIds.length === 0 && t.weightAssertionIds.length === 0,
    ),
  ).toBe(true);
  expect(result.state.changes[0]).toMatchObject({
    type: "plan.changed",
    origin: "core_derived",
    causedBy: "r1",
    sourceId: planSource,
  });
  expect(result.state.changes[0]?.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: "r1",
  });
  expect(
    result.state.heads[0]?.entries.every((e) => e.taskId !== e.sourceItemId),
  ).toBe(true);
});

test("stable IDs preserve rename, certainty change and reorder while retaining source history", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const ids = first.heads[0]!.entries.map((e) => e.taskId);
  const second = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      steps: [
        { sourceItemId: "c", title: "Third", certainty: "idea" },
        { sourceItemId: "a", title: "Renamed", certainty: "tentative" },
        { sourceItemId: "b", title: "Second", certainty: "tentative" },
      ],
    }),
  );
  expect(second.status).toBe("applied");
  expect(second.state.heads[0]?.entries.map((e) => e.taskId)).toEqual([
    ids[2],
    ids[0],
    ids[1],
  ]);
  expect(second.state.core.tasks.find((t) => t.id === ids[0])?.title).toBe(
    "Renamed",
  );
  expect(second.state.core.assertions).toHaveLength(6);
  expect(second.state.core.acceptedEvents[0]).toBe(
    first.core.acceptedEvents[0],
  );
  expect(second.state.revisions[1]).toMatchObject({
    previousHeadEventId: "r1",
    outcome: "applied",
  });
  const changes = second.state.changes.at(-1)!.changes;
  expect(changes).toContainEqual(
    expect.objectContaining({
      kind: "task.changed",
      taskId: ids[0],
      fields: ["title", "certainty"],
    }),
  );
  expect(changes).toContainEqual(
    expect.objectContaining({ kind: "tasks.reordered" }),
  );
  expect(
    changes.filter((c) => c.kind === "task.added" || c.kind === "task.removed"),
  ).toEqual([]);
});

test("partial upserts preserve omitted tasks and order; explicit deletion removes membership only", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const second = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      completeness: "partial",
      steps: [{ sourceItemId: "b", title: "Updated" }],
      deletedSourceItemIds: ["a"],
    }),
  ).state;
  expect(second.heads[0]?.entries.map((e) => e.sourceItemId)).toEqual([
    "b",
    "c",
  ]);
  expect(second.core.tasks).toHaveLength(3);
  expect(second.core.phases[0]?.taskIds).toHaveLength(2);
  const b = second.heads[0]!.entries[0]!;
  expect(b.certainty).toBe("tentative");
  expect(
    second.core.tasks.find((t) => t.id === b.taskId)?.certaintyAssertionIds,
  ).toHaveLength(1);
  expect(second.core.acceptedEvents).toHaveLength(2);
});

test("complete omission removes a task but never deletes assertions or revives its correction on re-entry", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const removed = first.heads[0]!.entries[0]!.taskId;
  const correction = {
    id: "weight-correction" as CorrectionId,
    scope: {
      kind: "task_weight" as const,
      projectId: planProject,
      taskId: removed,
    },
    correctedAssertionId: "manual-weight" as AssertionId,
    effectiveAt: "2026-10-20T03:00:00.000Z",
    lifecycle: { status: "active" as const },
  };
  const manual: Assertion<"task.weight"> = {
    id: correction.correctedAssertionId,
    target: "task.weight",
    targetId: removed,
    value: 3 as TaskWeight,
    provenance: "user_confirmed",
    sourceId: "user" as SourceId,
    observedAt: correction.effectiveAt,
  };
  const withCorrection = {
    ...first,
    core: {
      ...first.core,
      corrections: [correction],
      assertions: [...first.core.assertions, manual],
      tasks: first.core.tasks.map((t) =>
        t.id === removed ? { ...t, weightAssertionIds: [manual.id] } : t,
      ),
    },
  };
  const renamed = core.applyPlanEvent(
    withCorrection,
    planEvent("rename", {
      previousEventId: "r1" as EventId,
      completeness: "partial",
      steps: [{ sourceItemId: "a", title: "Renamed" }],
    }),
  ).state;
  expect(renamed.core.corrections).toBe(withCorrection.core.corrections);
  expect(
    renamed.core.tasks.find((t) => t.id === removed)?.weightAssertionIds,
  ).toEqual([manual.id]);
  const empty = core.applyPlanEvent(
    renamed,
    planEvent("empty", { previousEventId: "rename" as EventId, steps: [] }),
  ).state;
  expect(empty.heads[0]?.entries).toEqual([]);
  expect(empty.core.tasks).toHaveLength(3);
  expect(empty.core.corrections).toBe(withCorrection.core.corrections);
  expect(empty.core.assertions).toContain(manual);
  const reentry = core.applyPlanEvent(
    empty,
    planEvent("reentry", { previousEventId: "empty" as EventId }),
  ).state;
  expect(reentry.heads[0]?.entries[0]?.taskId).not.toBe(removed);
  expect(
    reentry.core.tasks.find(
      (t) => t.id === reentry.heads[0]?.entries[0]?.taskId,
    )?.weightAssertionIds,
  ).toEqual([]);
});

test("same title never supplies cross-revision identity and ambiguous updates do not replace the head", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", { steps: [{ title: "Same" }, { title: "Same" }] }),
  ).state;
  const result = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      steps: [{ title: "Same" }],
    }),
  );
  expect(result.status).toBe("ambiguous");
  expect(result.state.core.tasks).toBe(first.core.tasks);
  expect(result.state.heads).toBe(first.heads);
  expect(result.state.revisions[1]?.issues).toContain(
    "task_identity_ambiguous",
  );
  expect(result.state.core.acceptedEvents).toHaveLength(2);
  expect(result.state.changes).toBe(first.changes);
});

test("a legacy snapshot with no explicit plan source contract is retained as unknown, not guessed confirmed", () => {
  const event = planEvent("legacy");
  const legacy = {
    completeness: event.payload.completeness,
    steps: event.payload.steps,
  };
  const result = core.applyPlanEvent(core.createPlanEngineState(planCore()), {
    ...event,
    payload: legacy,
  });
  expect(result.status).toBe("unknown");
  expect(result.state.core.acceptedEvents).toHaveLength(1);
  expect(result.state.core.tasks).toEqual([]);
});

test("initial partial snapshot never claims a complete plan and a later full snapshot establishes completeness", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", { completeness: "partial" }),
  ).state;
  expect(first.heads[0]?.completeness).toBe("partial");
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", { previousEventId: "r1" as EventId }),
  ).state;
  expect(next.heads[0]?.completeness).toBe("complete");
  const patch = core.applyPlanEvent(
    next,
    planEvent("r3", {
      previousEventId: "r2" as EventId,
      completeness: "partial",
      steps: [],
    }),
  ).state;
  expect(patch.heads[0]?.completeness).toBe("complete");
});

test("an unsequenced but causally linked revision cannot erase the known sequence high-water mark", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", { previousEventId: "r1" as EventId }),
  ).state;
  const stale = core.applyPlanEvent(
    next,
    planEvent(
      "r3",
      { previousEventId: "r2" as EventId },
      { sourceSequence: 9 },
    ),
  );
  expect(stale.status).toBe("unknown");
  expect(stale.state.heads).toBe(next.heads);
  const unsupportedOrder = core.applyPlanEvent(
    next,
    planEvent("r4", {}, { sourceSequence: 11 }),
  );
  expect(unsupportedOrder.status).toBe("unknown");
});

test("a partial update cannot cross an unobserved source sequence gap", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const result = core.applyPlanEvent(
    first,
    planEvent(
      "gap",
      { completeness: "partial", steps: [] },
      { sourceSequence: 12 },
    ),
  );
  expect(result.status).toBe("unknown");
  expect(result.state.heads).toBe(first.heads);
});

test("engine initialization does not pretend already consumed plan history is an empty plan", () => {
  const ledger = core.applyNormalizedEvent(planCore(), planEvent("old")).state;
  expect(() => core.createPlanEngineState(ledger)).toThrow(
    "plan_history_requires_engine_state",
  );
});

test("partial additions append without moving existing tasks or turning same titles into identity", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      completeness: "partial",
      steps: [
        { sourceItemId: "c", title: "Third" },
        { sourceItemId: "d", title: "First" },
      ],
    }),
  ).state;
  expect(next.heads[0]?.entries.map((e) => e.sourceItemId)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
  expect(
    next.changes.at(-1)?.changes.filter((c) => c.kind === "tasks.reordered"),
  ).toEqual([]);
});

test("independent project, session and plan namespaces never reuse Task IDs", () => {
  const session = "session-a" as SessionId;
  const otherSession = "session-b" as SessionId;
  const otherProject = "project-b" as ProjectId;
  const initial = planCore();
  let state = core.createPlanEngineState({
    ...initial,
    projects: [
      ...initial.projects,
      { ...initial.projects[0]!, id: otherProject },
    ],
    sessions: [session, otherSession].map((id) => ({
      id,
      sourceId: planSource,
      sourceSessionId: null,
      projectAssociationAssertionIds: [],
    })),
  });
  const events = [
    planEvent("p1"),
    planEvent("p2", {}, { projectId: otherProject }),
    planEvent("session1", {}, { sessionId: session }),
    planEvent("session2", {}, { sessionId: otherSession }),
    planEvent("other-plan", { planId: "other-plan" }),
  ];
  for (const event of events) state = core.applyPlanEvent(state, event).state;
  expect(state.heads).toHaveLength(5);
  expect(
    new Set(state.heads.flatMap((h) => h.entries.map((e) => e.taskId))).size,
  ).toBe(15);
});

test("Core attribution rejection leaves even the plan input ledger unchanged", () => {
  const state = core.createPlanEngineState(planCore());
  const result = core.applyPlanEvent(
    state,
    planEvent("wrong-project", {}, { projectId: "unknown" as ProjectId }),
  );
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(state);
});

test("an unknown session cannot authorize a new plan stream", () => {
  const state = core.createPlanEngineState(planCore());
  const result = core.applyPlanEvent(
    state,
    planEvent("wrong-session", {}, { sessionId: "unknown" as SessionId }),
  );
  expect(result.status).toBe("unknown");
  expect(result.state.heads).toEqual([]);
});

test.each([
  { steps: [{ title: "Task", certainty: "invalid" }] },
  { steps: [{ sourceItemId: "", title: "Task" }] },
  { steps: [{ title: "  " }] },
])("invalid plan fields cannot partially create a hierarchy: %j", (payload) => {
  const result = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("invalid", payload as Partial<PlanInput>),
  );
  expect(result.status).toBe("unknown");
  expect(result.state.core.tasks).toEqual([]);
  expect(result.state.core.phases).toEqual([]);
});

test("deterministic ID collisions leave the entire previous projection unchanged", () => {
  const initial = planCore();
  const taskId = 'core:plan:task:["r1",0]' as TaskId;
  const phaseId = "preloaded-phase" as PhaseId;
  const state = core.createPlanEngineState({
    ...initial,
    tasks: [
      {
        id: taskId,
        phaseId,
        title: "Preloaded",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: [],
      },
    ],
  });
  const result = core.applyPlanEvent(state, planEvent("r1"));
  expect(result.status).toBe("unknown");
  expect(result.state.core.tasks).toBe(state.core.tasks);
  expect(result.state.core.assertions).toBe(state.core.assertions);
  expect(result.state.core.phases).toBe(state.core.phases);
});

test("received timestamps are not a causal order and input objects remain untouched", () => {
  const event = planEvent("r1");
  const initial = core.createPlanEngineState(planCore());
  const before = JSON.stringify({ initial, event });
  const first = core.applyPlanEvent(initial, event).state;
  const late = core.applyPlanEvent(
    first,
    planEvent(
      "r2",
      { previousEventId: "r1" as EventId },
      { receivedAt: "2020-01-01T00:00:00.000Z" },
    ),
  );
  expect(late.status).toBe("applied");
  expect(JSON.stringify({ initial, event })).toBe(before);
});

test("a newer unresolved observation prevents an older complete snapshot from becoming current", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const unresolved = core.applyPlanEvent(
    first,
    planEvent(
      "r2",
      { steps: [{ title: "Unknown identity" }] },
      { sourceSequence: 12 },
    ),
  ).state;
  const older = core.applyPlanEvent(
    unresolved,
    planEvent("late", {}, { sourceSequence: 11 }),
  );
  expect(older.status).toBe("unknown");
  expect(older.state.heads).toBe(first.heads);
});

test("snapshot query exposes unresolved newer input instead of presenting the last known plan as current", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const scope = first.heads[0]!.scope;
  expect(core.getPlanSnapshot(first, scope).status).toBe("available");
  const unresolved = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      steps: [{ title: "First" }],
    }),
  ).state;
  const view = core.getPlanSnapshot(unresolved, scope);
  expect(view.status).toBe("ambiguous");
  if (view.status === "ambiguous") expect(view.lastKnown?.eventId).toBe("r1");
  expect(
    core.getPlanSnapshot(unresolved, { ...scope, planId: "unseen" }).status,
  ).toBe("unknown");
});

test("revision snapshots retain old titles and phase labels after rename without replaying raw data", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {
      phases: [{ sourcePhaseId: "p", title: "Original phase" }],
      steps: [
        { sourceItemId: "a", sourcePhaseId: "p", title: "Original task" },
      ],
    }),
  ).state;
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      phases: [{ sourcePhaseId: "p", title: "New phase" }],
      steps: [{ sourceItemId: "a", sourcePhaseId: "p", title: "New task" }],
    }),
  ).state;
  expect(next.revisions[0]?.snapshot?.entries[0]?.title).toBe("Original task");
  expect(next.revisions[0]?.snapshot?.phases[0]?.title).toBe("Original phase");
  expect(next.revisions[1]?.snapshot?.entries[0]?.title).toBe("New task");
  expect(next.revisions[1]?.snapshot?.phases[0]?.title).toBe("New phase");
  expect(next.revisions[1]?.snapshot?.entries[0]?.sourceEventId).toBe("r2");
});

test("a newer full snapshot must causally cover an unresolved unsequenced observation", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const pending = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      steps: [{ title: "Unmatched" }],
    }),
  ).state;
  const unordered = core.applyPlanEvent(
    pending,
    planEvent("r3", {}, { sourceSequence: 11 }),
  );
  expect(unordered.status).toBe("unknown");
  const covered = core.applyPlanEvent(
    pending,
    planEvent("cover", { previousEventId: "r2" as EventId }),
  );
  expect(covered.status).toBe("applied");
  expect(
    core.getPlanSnapshot(covered.state, first.heads[0]!.scope).status,
  ).toBe("available");
});

test("a partial delta cannot silently bypass a newer unresolved observation", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const pending = core.applyPlanEvent(
    first,
    planEvent(
      "r2",
      { steps: [{ title: "Unmatched" }] },
      { sourceSequence: 11 },
    ),
  ).state;
  const delta = core.applyPlanEvent(
    pending,
    planEvent(
      "r3",
      { previousEventId: "r1" as EventId, completeness: "partial", steps: [] },
      { sourceSequence: 12 },
    ),
  );
  expect(delta.status).toBe("unknown");
  const full = core.applyPlanEvent(
    pending,
    planEvent("full", {}, { sourceSequence: 12 }),
  );
  expect(full.status).toBe("applied");
});

test.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
  "invalid source sequence %s is rejected before entering the replay ledger",
  (sourceSequence) => {
    const state = core.createPlanEngineState(planCore());
    const result = core.applyPlanEvent(
      state,
      planEvent("invalid-sequence", {}, { sourceSequence }),
    );
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(state);
    expect(result.state.core.acceptedEvents).toEqual([]);
  },
);

test("arrival order cannot resolve two unsequenced branches with only one predecessor reference", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const branchA = core.applyPlanEvent(
    first,
    planEvent("branch-a", {
      previousEventId: "r1" as EventId,
      steps: [{ title: "Unmatched A" }],
    }),
  ).state;
  const branchB = core.applyPlanEvent(
    branchA,
    planEvent("branch-b", {
      previousEventId: "r1" as EventId,
      steps: [{ title: "Unmatched B" }],
    }),
  ).state;
  const guessed = core.applyPlanEvent(
    branchB,
    planEvent("guess", { previousEventId: "branch-b" as EventId }),
  );
  expect(guessed.status).toBe("unknown");
  expect(guessed.state.heads).toBe(first.heads);
});

test("missing certainty remains unknown and does not imply confirmed or completion", () => {
  const result = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", { steps: [{ sourceItemId: "a", title: "Done" }] }),
  );
  expect(result.status).toBe("applied");
  expect(result.state.heads[0]?.entries[0]?.certainty).toBeUndefined();
  expect(result.state.core.assertions).toEqual([]);
  expect(result.state.core.resolvedConclusions).toEqual([]);
});

test("duplicate internal and stable source events do not create additional revisions or changes", () => {
  const event = planEvent(
    "r1",
    {},
    {
      sourceIdentity: {
        kind: "source_event",
        sourceId: planSource,
        sourceEventId: "stable",
      },
    },
  );
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    event,
  ).state;
  for (const replay of [event, { ...event, id: "alias" as EventId }]) {
    const result = core.applyPlanEvent(first, replay);
    expect(result.status).toBe("duplicate");
    expect(result.state).toBe(first);
  }
  const conflict = core.applyPlanEvent(first, {
    ...event,
    payload: { ...event.payload, steps: [] },
  });
  expect(conflict.status).toBe("rejected");
  expect(conflict.state).toBe(first);
});

test("cursor identity is not an event key and source/project/session/plan scopes do not merge", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent(
      "r1",
      {},
      {
        sourceIdentity: {
          kind: "cursor",
          sourceId: planSource,
          reference: "batch",
        },
      },
    ),
  ).state;
  const second = core.applyPlanEvent(
    first,
    planEvent(
      "r2",
      { previousEventId: "r1" as EventId },
      {
        sourceIdentity: {
          kind: "cursor",
          sourceId: planSource,
          reference: "batch",
        },
      },
    ),
  ).state;
  expect(second.revisions).toHaveLength(2);
  const other = core.applyPlanEvent(
    second,
    planEvent("other", {}, { sourceId: "other-source" as SourceId }),
  ).state;
  expect(other.heads).toHaveLength(2);
  expect(other.core.tasks).toHaveLength(6);
  expect(other.heads[0]?.entries[0]?.taskId).not.toBe(
    other.heads[1]?.entries[0]?.taskId,
  );
});

test("opaque revisions and arrival times do not order updates; stale or branching bases preserve current state", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {
      sourceReference: { sourceId: planSource, revision: "z" },
    }),
  ).state;
  const unknown = core.applyPlanEvent(
    first,
    planEvent("unordered", {
      steps: [],
      sourceReference: { sourceId: planSource, revision: "zz" },
    }),
  );
  expect(unknown.status).toBe("unknown");
  expect(unknown.state.heads).toBe(first.heads);
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", { previousEventId: "r1" as EventId }),
  ).state;
  const branch = core.applyPlanEvent(
    next,
    planEvent("r3", { previousEventId: "r1" as EventId, steps: [] }),
  );
  expect(branch.status).toBe("unknown");
  expect(branch.state.core.tasks).toBe(next.core.tasks);
});

test("source-local monotonic sequence orders a stream and rejects stale sequences even with a matching base", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", {}, { sourceSequence: 11 }),
  );
  expect(next.status).toBe("applied");
  const stale = core.applyPlanEvent(
    next.state,
    planEvent(
      "late",
      { previousEventId: "r2" as EventId, steps: [] },
      { sourceSequence: 9 },
    ),
  );
  expect(stale.status).toBe("unknown");
  expect(stale.state.heads).toBe(next.state.heads);
});

test("named phases retain identity and capture moves and phase title changes with provenance", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {
      phases: [{ sourcePhaseId: "p", title: "Phase" }],
      steps: [{ sourceItemId: "a", sourcePhaseId: "p", title: "Task" }],
    }),
  ).state;
  const next = core.applyPlanEvent(
    first,
    planEvent("r2", {
      previousEventId: "r1" as EventId,
      phases: [
        { sourcePhaseId: "p", title: "Renamed phase" },
        { sourcePhaseId: "q", title: "Other" },
      ],
      steps: [{ sourceItemId: "a", sourcePhaseId: "q", title: "Task" }],
    }),
  ).state;
  expect(next.heads[0]?.entries[0]?.taskId).toBe(
    first.heads[0]?.entries[0]?.taskId,
  );
  expect(next.core.phases[0]?.id).toBe(first.core.phases[0]?.id);
  expect(next.core.phases[0]?.taskIds).toEqual([]);
  expect(next.core.phases[1]?.taskIds).toEqual([
    first.heads[0]!.entries[0]!.taskId,
  ]);
  expect(next.changes.at(-1)?.changes).toContainEqual(
    expect.objectContaining({
      kind: "phase.changed",
      phaseId: first.core.phases[0]!.id,
    }),
  );
  expect(next.changes.at(-1)?.changes).toContainEqual(
    expect.objectContaining({ kind: "task.changed", fields: ["phase"] }),
  );
});

test.each([
  {
    steps: [
      { sourceItemId: "a", title: "One" },
      { sourceItemId: "a", title: "Two" },
    ],
  },
  { deletedSourceItemIds: ["missing"] },
  {
    deletedSourceItemIds: ["a"],
    steps: [{ sourceItemId: "a", title: "Both" }],
  },
  {
    steps: [
      { sourceItemId: "a", sourcePhaseId: "missing", title: "Wrong phase" },
    ],
  },
  { sourceReference: { sourceId: "foreign" as SourceId, revision: "1" } },
])("inconsistent normalized plan is refused atomically: %j", (payload) => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const result = core.applyPlanEvent(
    first,
    planEvent("bad", { ...payload, previousEventId: "r1" as EventId }),
  );
  expect(["unknown", "ambiguous"]).toContain(result.status);
  expect(result.state.heads).toBe(first.heads);
  expect(result.state.core.tasks).toBe(first.core.tasks);
  expect(result.state.core.assertions).toBe(first.core.assertions);
});

test("serialized engine state preserves revision links and replay behavior without Storage", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const restored = JSON.parse(JSON.stringify(first)) as typeof first;
  expect(core.applyPlanEvent(restored, planEvent("r1")).status).toBe(
    "duplicate",
  );
  const next = core.applyPlanEvent(
    restored,
    planEvent("r2", { previousEventId: "r1" as EventId }),
  );
  expect(next.status).toBe("applied");
  expect(next.state.core.tasks.map((t) => t.id)).toEqual(
    first.core.tasks.map((t) => t.id),
  );
});

test("same-sequence conflicting observation is not hidden as a proven older snapshot", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1", {}, { sourceSequence: 10 }),
  ).state;
  const conflict = core.applyPlanEvent(
    first,
    planEvent("conflict", { steps: [] }, { sourceSequence: 10 }),
  );
  expect(conflict.status).toBe("unknown");
  expect(conflict.state.heads).toBe(first.heads);
  expect(conflict.state.changes).toBe(first.changes);
  expect(
    core.getPlanSnapshot(conflict.state, first.heads[0]!.scope).status,
  ).toBe("unknown");
  const delta = core.applyPlanEvent(
    conflict.state,
    planEvent(
      "delta",
      {
        previousEventId: "r1" as EventId,
        completeness: "partial",
        steps: [],
      },
      { sourceSequence: 11 },
    ),
  );
  expect(delta.status).toBe("unknown");
  expect(delta.state.heads).toBe(first.heads);
  const full = core.applyPlanEvent(
    conflict.state,
    planEvent("full", {}, { sourceSequence: 11 }),
  );
  expect(full.status).toBe("applied");

  const older = core.applyPlanEvent(
    first,
    planEvent("older", { steps: [] }, { sourceSequence: 9 }),
  );
  expect(older.status).toBe("unknown");
  expect(core.getPlanSnapshot(older.state, first.heads[0]!.scope).status).toBe(
    "available",
  );
});

test("covering an unresolved old branch cannot bypass the current accepted head", () => {
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("r1"),
  ).state;
  const current = core.applyPlanEvent(
    first,
    planEvent("r2", { previousEventId: "r1" as EventId }),
  ).state;
  const branch = core.applyPlanEvent(
    current,
    planEvent("branch-a", { previousEventId: "r1" as EventId, steps: [] }),
  );
  expect(branch.status).toBe("unknown");
  const next = core.applyPlanEvent(
    branch.state,
    planEvent("branch-b", {
      previousEventId: "branch-a" as EventId,
      steps: [],
    }),
  );
  expect(next.status).toBe("unknown");
  expect(next.state.heads).toBe(current.heads);
  expect(next.state.core.tasks).toBe(current.core.tasks);
  expect(next.state.changes).toBe(current.changes);
});

test.each(["Renamed phase", "Original phase"])(
  "phase updates retain the provenance of the current label: %s",
  (title) => {
    const first = core.applyPlanEvent(
      core.createPlanEngineState(planCore()),
      planEvent("r1", {
        phases: [{ sourcePhaseId: "p", title: "Original phase" }],
        steps: [{ sourceItemId: "a", sourcePhaseId: "p", title: "Task" }],
      }),
    ).state;
    const next = core.applyPlanEvent(
      first,
      planEvent("r2", {
        previousEventId: "r1" as EventId,
        provenance: "user_confirmed",
        completeness: "partial",
        phases: [{ sourcePhaseId: "p", title }],
        steps: [],
      }),
    );
    expect(next.status).toBe("applied");
    expect(next.state.heads[0]?.phases[0]).toMatchObject({
      title,
      provenance: "user_confirmed",
    });
    expect(next.state.revisions[0]?.snapshot?.phases[0]).toMatchObject({
      title: "Original phase",
      provenance: "agent_reported",
    });
    expect(next.state.changes.at(-1)?.changes).toContainEqual({
      kind: "phase.changed",
      phaseId: first.heads[0]!.phases[0]!.phaseId,
    });
  },
);
