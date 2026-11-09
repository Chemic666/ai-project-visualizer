import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  ProjectId,
  SourceId,
  TaskWeight,
  TimelineInput,
  TimelineState,
} from "../src/index.js";
import {
  progressFixture,
  reportStatus,
  addWeight,
} from "./fixtures/progress.js";
import { planProject } from "./fixtures/plan.js";

const time = "2026-11-08T08:00:00.000Z";
function inputs(): {
  plan: TimelineInput;
  progress: TimelineInput;
  correction: TimelineInput;
} {
  const f = progressFixture();
  const progress = core.updateProgress(
    core.createProgressEngineState(),
    f.plan,
    f.scope,
  ).state.changes[0]!;
  const correction = core.applyUserCorrection(f.plan, f.scope, {
    id: "timeline-weight" as CorrectionId,
    scope: { kind: "task_weight", projectId: planProject, taskId: f.remaining },
    effectiveAt: time,
    assertion: {
      id: "timeline-weight-assertion" as AssertionId,
      target: "task.weight",
      targetId: f.remaining,
      value: 17 as TaskWeight,
      provenance: "user_confirmed",
      sourceId: "synthetic-user" as SourceId,
      observedAt: time,
    },
  }).events[0]!;
  return {
    plan: {
      kind: "plan",
      event: f.plan.changes[0]!,
      observedAt: "2026-11-08T07:59:00.000Z",
    },
    progress: { kind: "progress", event: progress, observedAt: time },
    correction: { kind: "correction", event: correction },
  };
}

test("timeline composes real Plan, Progress and Correction outputs without mutating them", () => {
  expect(core.createTimelineState).toBeTypeOf("function");
  const input = inputs();
  const original = JSON.stringify(input);
  const first = core.createTimelineState();
  const result = core.appendTimelineEvents(first, [
    input.plan,
    input.progress,
    input.correction,
  ]);
  expect(result.status).toBe("applied");
  expect(result.added.map((e) => e.kind)).toEqual([
    "plan.changed",
    "progress.changed",
    "correction.applied",
  ]);
  expect(first.entries).toEqual([]);
  expect(JSON.stringify(input)).toBe(original);
  expect(result.state.entries[1]?.detail).toMatchObject({
    after: { status: "available", ratio: 32 / 45 },
  });
  expect(result.state.entries[2]?.provenance).toBe("user_confirmed");
});

test("exact replay and JSON restore produce no duplicate history", () => {
  const input = inputs();
  const first = core.appendTimelineEvents(core.createTimelineState(), [
    input.plan,
    input.progress,
  ]);
  const restored: TimelineState = JSON.parse(JSON.stringify(first.state));
  const replay = core.appendTimelineEvents(restored, [
    JSON.parse(JSON.stringify(input.plan)),
    input.progress,
  ]);
  expect(replay.status).toBe("unchanged");
  expect(replay.state).toBe(restored);
  expect(replay.added).toEqual([]);
});

test("conflicting replay rejects the whole batch without partial additions", () => {
  const input = inputs();
  const first = core.appendTimelineEvents(core.createTimelineState(), [
    input.plan,
  ]);
  expect(input.plan.kind).toBe("plan");
  if (input.plan.kind !== "plan") throw new Error("fixture");
  const conflict: TimelineInput = {
    ...input.plan,
    observedAt: "2026-11-08T09:00:00.000Z",
  };
  const result = core.appendTimelineEvents(first.state, [
    input.progress,
    conflict,
  ]);
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(first.state);
  expect(result.added).toEqual([]);
});

test("display order uses instants, ties use stable admission order, never source causality", () => {
  const input = inputs();
  if (input.plan.kind !== "plan" || input.progress.kind !== "progress")
    throw new Error("fixture");
  const state = core.appendTimelineEvents(core.createTimelineState(), [
    { ...input.progress, observedAt: "2026-11-08T16:00:00+08:00" },
    input.plan,
    input.correction,
  ]).state;
  const entries = core.getTimelineEntries(state, { projectId: planProject });
  expect(entries.map((e) => e.kind)).toEqual([
    "plan.changed",
    "progress.changed",
    "correction.applied",
  ]);
  expect(state.entries[0]?.kind).toBe("progress.changed");
  expect(entries[1]?.sourceOrder).toBe("unknown");
});

test("source task verified claim stays agent_reported and is never a verified result", () => {
  const f = progressFixture();
  const plan = reportStatus(
    f.plan,
    f.done,
    "verified",
    "timeline-agent-verified",
  );
  const event = plan.core.acceptedEvents.at(-1)!;
  const result = core.appendTimelineEvents(core.createTimelineState(), [
    { kind: "source", event },
  ]);
  expect(result.added[0]).toMatchObject({
    kind: "task.status_reported",
    provenance: "agent_reported",
    detail: { reportedStatus: "verified" },
  });
  expect(result.added[0]).not.toHaveProperty("verified", true);
});

test("raw plan observations do not duplicate the derived plan change", () => {
  const f = progressFixture();
  const state = core.createTimelineState();
  const result = core.appendTimelineEvents(state, [
    { kind: "source", event: f.plan.core.acceptedEvents[0]! },
  ]);
  expect(result.status).toBe("unchanged");
  expect(result.state).toBe(state);
  expect(result.added).toEqual([]);
});

test("unavailable progress never retains a percentage from malformed or previous values", () => {
  const f = progressFixture();
  const missing = {
    ...f.plan,
    core: {
      ...f.plan.core,
      tasks: f.plan.core.tasks.map((t) => ({ ...t, weightAssertionIds: [] })),
    },
  };
  const event = core.updateProgress(
    core.createProgressEngineState(),
    missing,
    f.scope,
  ).state.changes[0]!;
  const result = core.appendTimelineEvents(core.createTimelineState(), [
    { kind: "progress", event, observedAt: time },
  ]);
  expect(result.added[0]?.detail).toMatchObject({
    after: { status: "unavailable" },
  });
  expect(result.added[0]?.detail).toMatchObject({
    after: {
      issues: expect.arrayContaining([
        { code: "weight_unknown", taskId: f.remaining },
      ]),
    },
  });
  expect(JSON.stringify(result.state)).not.toContain('"ratio"');
});

test("projection retains references but drops unmodeled raw fields", () => {
  const input = inputs().plan;
  if (input.kind !== "plan") throw new Error("fixture");
  const event = {
    ...input.event,
    prompt: "DO_NOT_STORE",
    tool_response: "DO_NOT_STORE",
    changes: input.event.changes.map((change) => ({
      ...change,
      raw: "DO_NOT_STORE",
    })),
    scope: { ...input.event.scope, transcript_path: "DO_NOT_STORE" },
  };
  const result = core.appendTimelineEvents(core.createTimelineState(), [
    { ...input, event },
  ]);
  expect(result.status).toBe("applied");
  expect(result.added[0]?.evidenceRefs.length).toBeGreaterThan(0);
  expect(JSON.stringify(result.state)).not.toContain("DO_NOT_STORE");
});

test.each(["not-a-date", "2026-11-08T08:00:00"])(
  "reject invalid/zoneless derived timestamp %s",
  (observedAt) => {
    const input = inputs().plan;
    if (input.kind !== "plan") throw new Error("fixture");
    const state = core.createTimelineState();
    const result = core.appendTimelineEvents(state, [{ ...input, observedAt }]);
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(state);
  },
);

test("project and source namespaces prevent event-ID collisions or mixed histories", () => {
  const f = progressFixture();
  const event = f.plan.core.acceptedEvents.find(
    (e) => e.type === "task.status_reported",
  )!;
  const other = { ...event, projectId: "another-project" as ProjectId };
  const state = core.appendTimelineEvents(core.createTimelineState(), [
    { kind: "source", event },
    { kind: "source", event: other },
  ]).state;
  expect(state.entries).toHaveLength(2);
  expect(
    core.getTimelineEntries(state, { projectId: planProject }),
  ).toHaveLength(1);
  expect(state.entries[0]?.id).not.toBe(state.entries[1]?.id);
});

test("mismatched derived scope is rejected without a cross-project history entry", () => {
  const input = inputs().plan;
  if (input.kind !== "plan") throw new Error("fixture");
  const result = core.appendTimelineEvents(core.createTimelineState(), [
    {
      ...input,
      event: { ...input.event, projectId: "wrong-project" as ProjectId },
    },
  ]);
  expect(result.status).toBe("rejected");
  expect(result.added).toEqual([]);
});

test("a newer plan revision with an empty semantic diff does not add noise", () => {
  const f = progressFixture();
  const initial = f.plan.core.acceptedEvents.find(
    (e) => e.type === "plan.updated",
  )!;
  if (initial.type !== "plan.updated") throw new Error("fixture");
  const repeated = core.applyPlanEvent(f.plan, {
    ...initial,
    id: "no-semantic-change" as EventId,
    receivedAt: time,
    payload: { ...initial.payload, previousEventId: initial.id },
  });
  expect(repeated.status).toBe("applied");
  expect(repeated.state.changes).toHaveLength(f.plan.changes.length);
  const before = core.appendTimelineEvents(
    core.createTimelineState(),
    f.plan.changes.map((event) => ({
      kind: "plan" as const,
      event,
      observedAt: time,
    })),
  );
  const result = core.appendTimelineEvents(
    before.state,
    repeated.state.changes.map((event) => ({
      kind: "plan" as const,
      event,
      observedAt: time,
    })),
  );
  expect(result.status).toBe("unchanged");
  expect(result.state).toBe(before.state);
});

test("session and correction lifetime compose with exact scope and provenance filters", () => {
  const f = progressFixture();
  const sessionId = "timeline-session" as core.SessionId;
  const start: core.NormalizedEvent<"session.started"> = {
    id: "timeline-start" as EventId,
    type: "session.started",
    schemaVersion: 1,
    projectId: planProject,
    sourceId: f.scope.sourceId,
    receivedAt: "2026-11-08T07:00:00.000Z",
    payload: { sessionId },
  };
  const plan = {
    ...f.plan,
    core: core.applyNormalizedEvent(f.plan.core, start).state,
  };
  const applied = core.applyUserCorrection(plan, f.scope, {
    id: "timeline-current" as CorrectionId,
    scope: { kind: "current_task", projectId: planProject, sessionId },
    effectiveAt: time,
    assertion: {
      id: "timeline-current-assertion" as AssertionId,
      target: "project.currentTask",
      targetId: planProject,
      value: f.remaining,
      sourceId: "synthetic-user" as SourceId,
      provenance: "user_confirmed",
      observedAt: time,
    },
  });
  expect(applied.status).toBe("applied");
  const end: core.NormalizedEvent<"session.ended"> = {
    ...start,
    id: "timeline-end" as EventId,
    type: "session.ended",
    receivedAt: "2026-11-08T09:00:00.000Z",
  };
  const ended = {
    ...applied.state,
    core: core.applyNormalizedEvent(applied.state.core, end).state,
  };
  const expired = core.expireUserCorrection(ended, {
    correctionId: "timeline-current" as CorrectionId,
    eventId: end.id,
    expiredAt: end.receivedAt,
    reason: "session_ended",
  });
  expect(expired.status).toBe("applied");
  const timeline = core.appendTimelineEvents(core.createTimelineState(), [
    { kind: "source", event: start },
    { kind: "correction", event: applied.events[0]! },
    { kind: "source", event: end },
    { kind: "correction", event: expired.events[0]! },
  ]);
  expect(timeline.status).toBe("applied");
  expect(
    core.getTimelineEntries(timeline.state, {
      projectId: planProject,
      sessionId,
    }),
  ).toHaveLength(4);
  expect(
    core.getTimelineEntries(timeline.state, {
      projectId: planProject,
      sourceId: f.scope.sourceId,
    }),
  ).toHaveLength(2);
  expect(timeline.added.at(-1)).toMatchObject({
    kind: "correction.expired",
    origin: "core_derived",
  });
  expect(timeline.added.at(-1)?.provenance).toBeUndefined();
});

test("Scenario 13/18 component: expansion records 71.1 to 64 percent and both plan bases", () => {
  const f = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    f.plan,
    f.scope,
  );
  const initial = f.plan.core.acceptedEvents.find(
    (e) => e.type === "plan.updated",
  )!;
  if (initial.type !== "plan.updated") throw new Error("fixture");
  const expansion = {
    ...initial,
    id: "timeline-expanded-plan" as EventId,
    receivedAt: "2026-11-08T08:01:00.000Z",
    payload: {
      ...initial.payload,
      previousEventId: initial.id,
      steps: [
        ...initial.payload.steps,
        {
          sourceItemId: "refresh",
          title: "Refresh",
          certainty: "confirmed" as const,
        },
        {
          sourceItemId: "revoke",
          title: "Revoke",
          certainty: "confirmed" as const,
        },
      ],
    },
  };
  let expanded = core.applyPlanEvent(f.plan, expansion).state;
  const refresh = expanded.heads[0]!.entries.find(
    (e) => e.sourceItemId === "refresh",
  )!.taskId;
  const revoke = expanded.heads[0]!.entries.find(
    (e) => e.sourceItemId === "revoke",
  )!.taskId;
  expanded = addWeight(expanded, refresh, 3, "timeline-refresh-weight");
  expanded = addWeight(expanded, revoke, 2, "timeline-revoke-weight");
  const next = core.updateProgress(first.state, expanded, f.scope);
  expect(next.status).toBe("changed");
  const result = core.appendTimelineEvents(core.createTimelineState(), [
    {
      kind: "plan",
      event: f.plan.changes[0]!,
      observedAt: "2026-11-08T07:59:00.000Z",
    },
    { kind: "progress", event: first.state.changes[0]!, observedAt: time },
    {
      kind: "plan",
      event: expanded.changes.at(-1)!,
      observedAt: expansion.receivedAt,
    },
    {
      kind: "progress",
      event: next.state.changes.at(-1)!,
      observedAt: "2026-11-08T08:02:00.000Z",
    },
  ]);
  expect(result.status).toBe("applied");
  const entries = core.getTimelineEntries(result.state, {
    projectId: planProject,
  });
  expect(entries.map((e) => e.kind)).toEqual([
    "plan.changed",
    "progress.changed",
    "plan.changed",
    "progress.changed",
  ]);
  const last = entries.at(-1)!;
  expect(last).toMatchObject({
    kind: "progress.changed",
    detail: {
      before: { status: "available", ratio: 32 / 45 },
      after: { status: "available", ratio: 32 / 50 },
      reasons: expect.arrayContaining(["plan_expanded"]),
    },
  });
  expect(last.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: initial.id,
  });
  expect(last.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: expansion.id,
  });
});
