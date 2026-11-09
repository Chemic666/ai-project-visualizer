import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  SourceId,
  TaskWeight,
} from "../src/index.js";
import {
  planCore,
  planEvent,
  planProject,
  planSource,
} from "./fixtures/plan.js";
import { progressFixture } from "./fixtures/progress.js";

test("task history preserves immutable titles, phase moves, certainty and order across plan revisions", () => {
  expect(core.getTaskHistory).toBeTypeOf("function");
  const first = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("history-1", {
      phases: [
        { sourcePhaseId: "one", title: "First phase" },
        { sourcePhaseId: "two", title: "Second phase" },
      ],
      steps: [
        {
          sourceItemId: "a",
          title: "Original title",
          certainty: "confirmed",
          sourcePhaseId: "one",
        },
        {
          sourceItemId: "b",
          title: "Other task",
          certainty: "confirmed",
          sourcePhaseId: "one",
        },
      ],
    }),
  ).state;
  const scope = first.heads[0]!.scope;
  const taskId = first.heads[0]!.entries[0]!.taskId;
  const second = core.applyPlanEvent(
    first,
    planEvent("history-2", {
      previousEventId: "history-1" as EventId,
      steps: [
        {
          sourceItemId: "b",
          title: "Other task",
          certainty: "confirmed",
          sourcePhaseId: "one",
        },
        {
          sourceItemId: "a",
          title: "Renamed task",
          certainty: "tentative",
          sourcePhaseId: "two",
        },
      ],
    }),
  ).state;
  const original = JSON.stringify(second);
  const history = core.getTaskHistory(second, scope, taskId);
  expect(history.status).toBe("available");
  if (history.status !== "available") throw new Error("history missing");
  expect(history.current).toMatchObject({
    status: "member",
    entry: { title: "Renamed task", certainty: "tentative" },
  });
  expect(
    history.revisions.map((row) => ({
      eventId: row.eventId,
      title: row.entry?.title,
      position: row.position,
    })),
  ).toEqual([
    { eventId: "history-1", title: "Original title", position: 0 },
    { eventId: "history-2", title: "Renamed task", position: 1 },
  ]);
  expect(history.revisions[0]?.entry?.phaseId).not.toBe(
    history.revisions[1]?.entry?.phaseId,
  );
  expect(
    history.assertions
      .filter((assertion) => assertion.target === "task.certainty")
      .map((assertion) => assertion.value),
  ).toEqual(["confirmed", "tentative"]);
  expect(JSON.stringify(second)).toBe(original);
});

function correctedFixture() {
  const f = progressFixture();
  const applied = core.applyUserCorrection(f.plan, f.scope, {
    id: "history-weight" as CorrectionId,
    scope: { kind: "task_weight", projectId: planProject, taskId: f.remaining },
    effectiveAt: "2026-11-08T11:00:00.000Z",
    originalAssertionId: "weight-remaining" as AssertionId,
    assertion: {
      id: "history-weight-assertion" as AssertionId,
      target: "task.weight",
      targetId: f.remaining,
      value: 17 as TaskWeight,
      provenance: "user_confirmed",
      sourceId: "synthetic-user" as SourceId,
      observedAt: "2026-11-08T11:00:00.000Z",
    },
  });
  expect(applied.status).toBe("applied");
  return { ...f, plan: applied.state };
}

test("removed task history remains readable and source identity re-entry starts a separate task history", () => {
  const f = correctedFixture();
  const initial = core.createProjectEngineState(f.plan, f.scope);
  const remove = planEvent(
    "history-remove",
    {
      previousEventId: "plan-1" as EventId,
      steps: [
        {
          sourceItemId: "done",
          title: "Completed work",
          certainty: "confirmed",
        },
      ],
    },
    { receivedAt: "2026-11-08T11:01:00.000Z" },
  );
  const removed = core.applyProjectUpdate(
    initial,
    { kind: "source", event: remove },
    remove.receivedAt,
  );
  expect(removed.status).toBe("applied");
  const restored: core.ProjectEngineState = JSON.parse(
    JSON.stringify(removed.state),
  );
  const reentry = planEvent(
    "history-reentry",
    {
      previousEventId: remove.id,
      steps: [
        {
          sourceItemId: "done",
          title: "Completed work",
          certainty: "confirmed",
        },
        {
          sourceItemId: "remaining",
          title: "New membership",
          certainty: "confirmed",
        },
      ],
    },
    { receivedAt: "2026-11-08T11:02:00.000Z" },
  );
  const entered = core.applyProjectUpdate(
    restored,
    { kind: "source", event: reentry },
    reentry.receivedAt,
  );
  expect(entered.status).toBe("applied");
  const old = core.getTaskHistory(entered.state.plan, f.scope, f.remaining);
  if (old.status !== "available") throw new Error("old history missing");
  expect(old.current.status).toBe("not_member");
  expect(old.revisions.map((row) => [row.eventId, row.membership])).toEqual([
    ["plan-1", "member"],
    ["history-remove", "not_member"],
  ]);
  expect(
    old.assertions.some(
      (assertion) =>
        assertion.target === "task.status" && assertion.value === "in_progress",
    ),
  ).toBe(true);
  expect(old.corrections).toHaveLength(1);
  expect(old.corrections[0]).toMatchObject({
    record: { lifecycle: { status: "expired" } },
    assertion: { value: 17, provenance: "user_confirmed" },
    originalAssertion: { value: 13, provenance: "agent_reported" },
  });
  const nextId = entered.state.plan.heads[0]!.entries[1]!.taskId;
  expect(nextId).not.toBe(f.remaining);
  const next = core.getTaskHistory(entered.state.plan, f.scope, nextId);
  if (next.status !== "available") throw new Error("new history missing");
  expect(next.current.status).toBe("member");
  expect(next.corrections).toEqual([]);
  expect(next.revisions.map((row) => row.eventId)).toEqual(["history-reentry"]);
});

test("unknown plan does not turn its empty input into a claimed removal", () => {
  const f = correctedFixture();
  const unknown = core.applyPlanEvent(
    f.plan,
    planEvent("history-unknown", {
      previousEventId: "missing-base" as EventId,
      steps: [],
    }),
  ).state;
  const history = core.getTaskHistory(unknown, f.scope, f.remaining);
  if (history.status !== "available") throw new Error("history missing");
  expect(history.current).toMatchObject({
    status: "unknown",
    lastKnownMembership: "member",
  });
  expect(history.revisions.map((row) => row.membership)).toEqual(["member"]);
  expect(history.corrections[0]?.record.lifecycle.status).toBe("active");
  expect(history.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: "history-unknown",
  });
});

test("a TaskId cannot expose history through another project, source or plan scope", () => {
  const f = correctedFixture();
  for (const scope of [
    { ...f.scope, projectId: "foreign-project" as core.ProjectId },
    { ...f.scope, sourceId: "foreign-source" as core.SourceId },
    { ...f.scope, planId: "foreign-plan" },
    { ...f.scope, sessionId: "foreign-session" as core.SessionId },
  ])
    expect(core.getTaskHistory(f.plan, scope, f.remaining)).toEqual({
      status: "not_found",
    });
  expect(
    core.getTaskHistory(f.plan, f.scope, "missing-task" as core.TaskId),
  ).toEqual({ status: "not_found" });
});

test("repeated unchanged plan entries remain inspectable but absent revisions are not invented as task changes", () => {
  const f = correctedFixture();
  let state = core.applyPlanEvent(
    f.plan,
    planEvent("history-same", {
      previousEventId: "plan-1" as EventId,
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
  state = core.applyPlanEvent(
    state,
    planEvent("history-empty", {
      previousEventId: "history-same" as EventId,
      steps: [],
    }),
  ).state;
  state = core.applyPlanEvent(
    state,
    planEvent("history-still-empty", {
      previousEventId: "history-empty" as EventId,
      steps: [],
    }),
  ).state;
  const history = core.getTaskHistory(state, f.scope, f.remaining);
  if (history.status !== "available") throw new Error("history missing");
  expect(history.revisions.map((row) => row.eventId)).toEqual([
    "plan-1",
    "history-same",
    "history-empty",
  ]);
});

test("current-task correction history follows its chosen task while preserving later supersession links", () => {
  const sessionId = "history-session" as core.SessionId;
  const started = core.applyNormalizedEvent(planCore(), {
    id: "history-start" as EventId,
    type: "session.started",
    schemaVersion: 1,
    projectId: planProject,
    sourceId: planSource,
    receivedAt: "2026-11-08T11:00:00.000Z",
    payload: { sessionId },
  }).state;
  let state = core.applyPlanEvent(
    core.createPlanEngineState(started),
    planEvent(
      "scoped-history",
      {},
      { sessionId, receivedAt: "2026-11-08T11:01:00.000Z" },
    ),
  ).state;
  const scope = state.heads[0]!.scope;
  const [first, second] = state.heads[0]!.entries;
  function selection(
    taskId: core.TaskId,
    id: string,
    minute: string,
  ): core.UserCorrectionInput {
    return {
      id: id as CorrectionId,
      scope: { kind: "current_task", projectId: planProject, sessionId },
      effectiveAt: `2026-11-08T11:${minute}:00.000Z`,
      assertion: {
        id: `${id}-assertion` as AssertionId,
        target: "project.currentTask",
        targetId: planProject,
        value: taskId,
        provenance: "user_confirmed",
        sourceId: "synthetic-user" as SourceId,
        observedAt: `2026-11-08T11:${minute}:00.000Z`,
      },
    };
  }
  state = core.applyUserCorrection(
    state,
    scope,
    selection(first!.taskId, "select-first", "02"),
  ).state;
  state = core.applyUserCorrection(
    state,
    scope,
    selection(second!.taskId, "select-second", "03"),
  ).state;
  const firstHistory = core.getTaskHistory(state, scope, first!.taskId);
  const secondHistory = core.getTaskHistory(state, scope, second!.taskId);
  if (
    firstHistory.status !== "available" ||
    secondHistory.status !== "available"
  )
    throw new Error("history missing");
  expect(firstHistory.corrections.map((row) => row.record.id)).toEqual([
    "select-first",
  ]);
  expect(firstHistory.corrections[0]?.record.lifecycle).toMatchObject({
    status: "superseded",
    supersededBy: "select-second",
  });
  expect(secondHistory.corrections.map((row) => row.record.id)).toEqual([
    "select-second",
  ]);
  expect(firstHistory.evidenceRefs).toContainEqual({
    kind: "correction",
    correctionId: "select-second",
  });
  expect(secondHistory.evidenceRefs).toContainEqual({
    kind: "correction",
    correctionId: "select-first",
  });
});

test("proven older plan observation does not make a current task look absent or unknown", () => {
  let state = core.applyPlanEvent(
    core.createPlanEngineState(planCore()),
    planEvent("ordered-first", {}, { sourceSequence: 10 }),
  ).state;
  const taskId = state.heads[0]!.entries[0]!.taskId;
  const scope = state.heads[0]!.scope;
  state = core.applyPlanEvent(
    state,
    planEvent("older-empty", { steps: [] }, { sourceSequence: 9 }),
  ).state;
  const result = core.getTaskHistory(state, scope, taskId);
  if (result.status !== "available") throw new Error("history missing");
  expect(result.current).toMatchObject({
    status: "member",
    eventId: "ordered-first",
  });
  expect(result.revisions.map((row) => row.eventId)).toEqual(["ordered-first"]);
});

test("current plan and previous membership evidence remain referenced after later absent revisions", () => {
  const f = correctedFixture();
  let state = core.applyPlanEvent(
    f.plan,
    planEvent("remove-for-refs", {
      previousEventId: "plan-1" as EventId,
      steps: [],
    }),
  ).state;
  state = core.applyPlanEvent(
    state,
    planEvent("later-empty", {
      previousEventId: "remove-for-refs" as EventId,
      steps: [],
    }),
  ).state;
  const history = core.getTaskHistory(state, f.scope, f.remaining);
  if (history.status !== "available") throw new Error("history missing");
  expect(history.current).toMatchObject({
    status: "not_member",
    eventId: "later-empty",
  });
  expect(history.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: "later-empty",
  });
});
