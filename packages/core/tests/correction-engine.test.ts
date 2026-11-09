import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  PlanEngineState,
  SessionId,
  SourceId,
  TaskId,
  TaskWeight,
} from "../src/index.js";
import { progressFixture, addWeight } from "./fixtures/progress.js";
import {
  planCore,
  planEvent,
  planProject,
  planSource,
} from "./fixtures/plan.js";

const session = "correction-session" as SessionId;
const time = "2026-11-08T06:00:00.000Z";
function fixture() {
  const f = progressFixture();
  const started = core.applyNormalizedEvent(f.plan.core, {
    id: "correction-session-start" as EventId,
    type: "session.started",
    schemaVersion: 1,
    projectId: planProject,
    sourceId: planSource,
    receivedAt: "2026-11-08T05:00:00.000Z",
    payload: { sessionId: session },
  });
  return { ...f, plan: { ...f.plan, core: started.state } };
}
function weight(taskId: TaskId, id = "manual-1", value = 17) {
  return {
    id: id as CorrectionId,
    scope: { kind: "task_weight" as const, projectId: planProject, taskId },
    effectiveAt: time,
    assertion: {
      id: `${id}-assertion` as AssertionId,
      target: "task.weight" as const,
      targetId: taskId,
      value: value as TaskWeight,
      provenance: "user_confirmed" as const,
      sourceId: "synthetic-user" as SourceId,
      observedAt: time,
    },
  };
}
function current(taskId: TaskId, id = "current-1") {
  return {
    id: id as CorrectionId,
    scope: {
      kind: "current_task" as const,
      projectId: planProject,
      sessionId: session,
    },
    effectiveAt: time,
    assertion: {
      id: `${id}-assertion` as AssertionId,
      target: "project.currentTask" as const,
      targetId: planProject,
      value: taskId,
      provenance: "user_confirmed" as const,
      sourceId: "synthetic-user" as SourceId,
      observedAt: time,
    },
  };
}
function remove(plan: PlanEngineState) {
  return core.applyPlanEvent(
    plan,
    planEvent(
      "correction-removal",
      {
        previousEventId: "plan-1" as EventId,
        steps: [],
        completeness: "complete",
      },
      { receivedAt: "2026-11-08T06:01:00.000Z" },
    ),
  ).state;
}

test("weight correction integrates with Progress without changing source claims or input", () => {
  expect(core.applyUserCorrection).toBeTypeOf("function");
  const { plan, scope, remaining } = fixture();
  const before = JSON.stringify(plan);
  const applied = core.applyUserCorrection(plan, scope, weight(remaining));
  expect(applied.status).toBe("applied");
  expect(JSON.stringify(plan)).toBe(before);
  expect(applied.state.core.assertions).toEqual(
    expect.arrayContaining([...plan.core.assertions]),
  );
  const result = core.calculateProgress(applied.state, scope);
  expect(result).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 49,
  });
  expect(applied.events).toHaveLength(1);
  expect(applied.events[0]).toMatchObject({
    type: "correction.applied",
    origin: "core_derived",
  });
});

test("new source weight cannot overwrite active human correction", () => {
  const { plan, scope, remaining } = fixture();
  const corrected = core.applyUserCorrection(
    plan,
    scope,
    weight(remaining),
  ).state;
  const newer = addWeight(corrected, remaining, 99, "new-agent-weight");
  expect(core.calculateProgress(newer, scope)).toMatchObject({
    status: "available",
    totalWeight: 49,
  });
});

test("a later human correction supersedes the old one with references and history", () => {
  const { plan, scope, remaining } = fixture();
  const first = core.applyUserCorrection(plan, scope, weight(remaining));
  const next = core.applyUserCorrection(
    first.state,
    scope,
    weight(remaining, "manual-2", 20),
  );
  expect(next.status).toBe("applied");
  expect(next.state.core.corrections).toHaveLength(2);
  expect(next.state.core.corrections[0]?.lifecycle).toMatchObject({
    status: "superseded",
    supersededBy: "manual-2",
  });
  expect(next.state.core.corrections[1]?.supersedes).toBe("manual-1");
  expect(first.state.core.corrections[0]?.lifecycle.status).toBe("active");
  expect(next.events.map((e) => e.type)).toEqual([
    "correction.superseded",
    "correction.applied",
  ]);
});

test("exact command replay is idempotent, including after supersession and JSON restore", () => {
  const { plan, scope, remaining } = fixture();
  const command = weight(remaining);
  const first = core.applyUserCorrection(plan, scope, command);
  const next = core.applyUserCorrection(
    first.state,
    scope,
    weight(remaining, "manual-2", 20),
  );
  const restored: PlanEngineState = JSON.parse(JSON.stringify(next.state));
  const replay = core.applyUserCorrection(restored, scope, command);
  expect(replay.status).toBe("duplicate");
  expect(replay.state).toBe(restored);
  expect(replay.events).toEqual([]);
  expect(replay.state.core.corrections[0]?.lifecycle.status).toBe("superseded");
  expect(
    core.applyUserCorrection(
      restored,
      scope,
      weight(remaining, "manual-1", 999),
    ).status,
  ).toBe("rejected");
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "reject invalid human weight %s without mutation",
  (value) => {
    const { plan, scope, remaining } = fixture();
    const result = core.applyUserCorrection(
      plan,
      scope,
      weight(remaining, "bad-weight", value),
    );
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(plan);
    expect(result.events).toEqual([]);
  },
);

test("reject cross-project targets, invalid provenance, namespace, time and original references", () => {
  const { plan, scope, remaining } = fixture();
  const command = weight(remaining);
  const invalid = [
    {
      ...command,
      scope: { ...command.scope, projectId: "other" as typeof planProject },
    },
    {
      ...command,
      assertion: {
        ...command.assertion,
        provenance: "agent_reported" as const,
      },
    },
    {
      ...command,
      assertion: {
        ...command.assertion,
        sourceReference: { sourceId: planSource, reference: "wrong" },
      },
    },
    { ...command, effectiveAt: "not-a-date" },
    { ...command, originalAssertionId: "missing" as AssertionId },
    {
      ...command,
      assertion: { ...command.assertion, id: "weight-done" as AssertionId },
    },
  ];
  for (const input of invalid) {
    const result = core.applyUserCorrection(plan, scope, input);
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(plan);
  }
});

test("current-task correction is session-scoped and never rewrites task status", () => {
  const { plan, scope, remaining } = fixture();
  const result = core.applyUserCorrection(plan, scope, current(remaining));
  expect(result.status).toBe("applied");
  expect(
    core.getUserCorrectedCurrentTask(result.state.core, planProject, session),
  ).toMatchObject({
    status: "available",
    taskId: remaining,
    provenance: "user_confirmed",
  });
  expect(
    core.getUserCorrectedCurrentTask(
      result.state.core,
      planProject,
      "other-session" as SessionId,
    ).status,
  ).toBe("unknown");
  expect(result.state.core.tasks.map((t) => t.statusAssertionIds)).toEqual(
    plan.core.tasks.map((t) => t.statusAssertionIds),
  );
  expect(result.state.core.acceptedEvents).toBe(plan.core.acceptedEvents);
});

test("explicit accepted session end expires current correction exactly once", () => {
  const { plan, scope, remaining } = fixture();
  let state = core.applyUserCorrection(plan, scope, current(remaining)).state;
  state = {
    ...state,
    core: core.applyNormalizedEvent(state.core, {
      id: "correction-session-end" as EventId,
      type: "session.ended",
      schemaVersion: 1,
      projectId: planProject,
      sourceId: planSource,
      receivedAt: "2026-11-08T06:01:00.000Z",
      payload: { sessionId: session },
    }).state,
  };
  const end = {
    correctionId: "current-1" as CorrectionId,
    eventId: "correction-session-end" as EventId,
    expiredAt: "2026-11-08T06:01:00.000Z",
    reason: "session_ended" as const,
  };
  const result = core.expireUserCorrection(state, end);
  expect(result.status).toBe("applied");
  expect(result.state.core.corrections[0]?.lifecycle).toMatchObject({
    status: "expired",
    triggeringEventId: end.eventId,
    reasonCode: "session_ended",
  });
  expect(
    core.getUserCorrectedCurrentTask(result.state.core, planProject, session)
      .status,
  ).toBe("unknown");
  expect(core.expireUserCorrection(result.state, end).status).toBe("duplicate");
  expect(
    core.applyUserCorrection(state, scope, current(remaining, "too-late"))
      .status,
  ).toBe("rejected");
});

test("missing or unrelated evidence never expires an active correction", () => {
  const { plan, scope, remaining } = fixture();
  const state = core.applyUserCorrection(plan, scope, weight(remaining)).state;
  const result = core.expireUserCorrection(state, {
    correctionId: "manual-1" as CorrectionId,
    eventId: "correction-session-start" as EventId,
    expiredAt: time,
    reason: "session_ended",
  });
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(state);
});

test("complete current plan removal expires a weight; removed tasks cannot receive new correction", () => {
  const { plan, scope, remaining } = fixture();
  const first = core.applyUserCorrection(plan, scope, weight(remaining)).state;
  const removed = remove(first);
  const result = core.expireUserCorrection(removed, {
    correctionId: "manual-1" as CorrectionId,
    eventId: "correction-removal" as EventId,
    expiredAt: "2026-11-08T06:01:00.000Z",
    reason: "task_removed",
  });
  expect(result.status).toBe("applied");
  expect(result.state.core.corrections[0]?.lifecycle.status).toBe("expired");
  expect(
    core.applyUserCorrection(removed, scope, weight(remaining, "removed-task"))
      .status,
  ).toBe("rejected");
});

test("partial plan deletion cannot expire a current-task correction", () => {
  const { plan, scope, remaining } = fixture();
  const first = core.applyUserCorrection(plan, scope, current(remaining)).state;
  const partial = core.applyPlanEvent(
    first,
    planEvent(
      "partial-removal",
      {
        previousEventId: "plan-1" as EventId,
        steps: [],
        completeness: "partial",
        deletedSourceItemIds: ["remaining"],
      },
      { receivedAt: "2026-11-08T06:01:00.000Z" },
    ),
  ).state;
  expect(
    core.expireUserCorrection(partial, {
      correctionId: "current-1" as CorrectionId,
      eventId: "partial-removal" as EventId,
      expiredAt: "2026-11-08T06:01:00.000Z",
      reason: "task_removed",
    }).status,
  ).toBe("rejected");
});

test("a session-specific weight cannot silently supersede a broader correction", () => {
  const { plan, scope, remaining } = fixture();
  const first = core.applyUserCorrection(plan, scope, weight(remaining)).state;
  const command = weight(remaining, "narrower", 25);
  const result = core.applyUserCorrection(first, scope, {
    ...command,
    scope: { ...command.scope, sessionId: session },
  });
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(first);
  expect(first.core.corrections[0]?.lifecycle.status).toBe("active");
});

test("unknown plan revisions cannot expire a valid correction", () => {
  const { plan, scope, remaining } = fixture();
  const corrected = core.applyUserCorrection(
    plan,
    scope,
    weight(remaining),
  ).state;
  const changed = core.applyPlanEvent(
    corrected,
    planEvent(
      "unknown-removal",
      { steps: [] },
      { receivedAt: "2026-11-08T06:01:00.000Z" },
    ),
  ).state;
  expect(core.getPlanSnapshot(changed, scope).status).not.toBe("available");
  expect(
    core.expireUserCorrection(changed, {
      correctionId: "manual-1" as CorrectionId,
      eventId: "unknown-removal" as EventId,
      expiredAt: "2026-11-08T06:01:00.000Z",
      reason: "task_removed",
    }).status,
  ).toBe("rejected");
});

test("reentry keeps expired history closed and old removal cannot expire a new correction", () => {
  const { plan, scope, remaining } = fixture();
  const first = core.applyUserCorrection(plan, scope, weight(remaining)).state;
  const ended = core.expireUserCorrection(remove(first), {
    correctionId: "manual-1" as CorrectionId,
    eventId: "correction-removal" as EventId,
    expiredAt: "2026-11-08T06:01:00.000Z",
    reason: "task_removed",
  }).state;
  const reentered = core.applyPlanEvent(
    ended,
    planEvent(
      "reentry",
      {
        previousEventId: "correction-removal" as EventId,
        steps: [
          {
            sourceItemId: "remaining",
            title: "Reentered",
            certainty: "confirmed",
          },
        ],
      },
      { receivedAt: "2026-11-08T06:02:00.000Z" },
    ),
  ).state;
  expect(reentered.core.corrections[0]?.lifecycle.status).toBe("expired");
  const taskId = reentered.heads[0]!.entries[0]!.taskId;
  const command = weight(taskId, "fresh", 10);
  const fresh = core.applyUserCorrection(reentered, scope, {
    ...command,
    effectiveAt: "2026-11-08T06:03:00.000Z",
    assertion: { ...command.assertion, observedAt: "2026-11-08T06:03:00.000Z" },
  }).state;
  expect(fresh.core.corrections.at(-1)?.lifecycle.status).toBe("active");
  expect(
    core.expireUserCorrection(fresh, {
      correctionId: "fresh" as CorrectionId,
      eventId: "correction-removal" as EventId,
      expiredAt: "2026-11-08T06:04:00.000Z",
      reason: "task_removed",
    }).status,
  ).toBe("rejected");
});

test("a project-scoped weight expires when its owning session plan removes the task", () => {
  const started = core.applyNormalizedEvent(planCore(), {
    id: "scoped-start" as EventId,
    type: "session.started",
    schemaVersion: 1,
    projectId: planProject,
    sourceId: planSource,
    receivedAt: "2026-10-20T03:00:00.000Z",
    payload: { sessionId: session },
  }).state;
  const plan = core.applyPlanEvent(
    core.createPlanEngineState(started),
    planEvent("scoped-plan", {}, { sessionId: session }),
  ).state;
  const scope = plan.heads[0]!.scope;
  const taskId = plan.heads[0]!.entries[0]!.taskId;
  const corrected = core.applyUserCorrection(plan, scope, weight(taskId)).state;
  expect(corrected.core.corrections).toHaveLength(1);
  const removed = core.applyPlanEvent(
    corrected,
    planEvent(
      "scoped-removal",
      {
        previousEventId: "scoped-plan" as EventId,
        steps: [],
      },
      { sessionId: session, receivedAt: "2026-11-08T06:01:00.000Z" },
    ),
  ).state;
  expect(
    core.expireUserCorrection(removed, {
      correctionId: "manual-1" as CorrectionId,
      eventId: "scoped-removal" as EventId,
      expiredAt: "2026-11-08T06:01:00.000Z",
      reason: "task_removed",
    }).status,
  ).toBe("applied");
});

test.each(["session", "trigger", "assertion"] as const)(
  "future %s receipt cannot support a backdated correction",
  (kind) => {
    const { plan, scope, remaining } = fixture();
    if (kind === "session") {
      const future = {
        ...plan,
        core: {
          ...plan.core,
          acceptedEvents: plan.core.acceptedEvents.map((e) =>
            e.type === "session.started"
              ? { ...e, receivedAt: "2026-11-08T07:00:00.000Z" }
              : e,
          ),
        },
      };
      expect(
        core.applyUserCorrection(future, scope, current(remaining)).status,
      ).toBe("rejected");
    } else {
      const future = {
        ...plan,
        core: core.applyNormalizedEvent(plan.core, {
          id: "future-receipt" as EventId,
          type: "task.status_reported",
          schemaVersion: 1,
          projectId: planProject,
          sourceId: "synthetic-user" as SourceId,
          receivedAt: "2026-11-08T07:00:00.000Z",
          payload: { taskId: remaining, status: "in_progress" },
        }).state,
      };
      const command = weight(remaining);
      const result = core.applyUserCorrection(
        future,
        scope,
        kind === "trigger"
          ? { ...command, triggeringEventId: "future-receipt" as EventId }
          : {
              ...command,
              assertion: {
                ...command.assertion,
                eventId: "future-receipt" as EventId,
              },
            },
      );
      expect(result.status).toBe("rejected");
    }
  },
);

test.each([
  { reference: "", revision: "v1" },
  { reference: "valid", revision: "" },
])("invalid optional source reference part is rejected", (reference) => {
  const { plan, scope, remaining } = fixture();
  const command = weight(remaining);
  expect(
    core.applyUserCorrection(plan, scope, {
      ...command,
      assertion: {
        ...command.assertion,
        sourceReference: { sourceId: command.assertion.sourceId, ...reference },
      },
    }).status,
  ).toBe("rejected");
});

test("explicit partial deletion ends the matching task-weight correction with evidence", () => {
  const { plan, scope, remaining } = fixture();
  const corrected = core.applyUserCorrection(
    plan,
    scope,
    weight(remaining),
  ).state;
  const changed = core.applyPlanEvent(
    corrected,
    planEvent(
      "explicit-weight-removal",
      {
        previousEventId: "plan-1" as EventId,
        completeness: "partial",
        steps: [],
        deletedSourceItemIds: ["remaining"],
      },
      { receivedAt: "2026-11-08T06:01:00.000Z" },
    ),
  );
  expect(changed.status).toBe("applied");
  const result = core.expireUserCorrection(changed.state, {
    correctionId: "manual-1" as CorrectionId,
    eventId: "explicit-weight-removal" as EventId,
    expiredAt: "2026-11-08T06:01:00.000Z",
    reason: "task_removed",
  });
  expect(result.status).toBe("applied");
  expect(result.state.core.corrections[0]?.lifecycle).toMatchObject({
    status: "expired",
    triggeringEventId: "explicit-weight-removal",
  });
  expect(result.events[0]?.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: "explicit-weight-removal",
  });
});

test.each([{ deletedSourceItemIds: [] }, { deletedSourceItemIds: ["done"] }])(
  "partial omission or deletion of another task cannot expire weight",
  ({ deletedSourceItemIds }) => {
    const { plan, scope, remaining } = fixture();
    const corrected = core.applyUserCorrection(
      plan,
      scope,
      weight(remaining),
    ).state;
    const changed = core.applyPlanEvent(
      corrected,
      planEvent(
        "unrelated-partial",
        {
          previousEventId: "plan-1" as EventId,
          completeness: "partial",
          steps: [],
          deletedSourceItemIds,
        },
        { receivedAt: "2026-11-08T06:01:00.000Z" },
      ),
    );
    expect(changed.status).toBe("applied");
    const result = core.expireUserCorrection(changed.state, {
      correctionId: "manual-1" as CorrectionId,
      eventId: "unrelated-partial" as EventId,
      expiredAt: "2026-11-08T06:01:00.000Z",
      reason: "task_removed",
    });
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(changed.state);
  },
);
