import { expect, test } from "vitest";
import * as core from "../src/index.js";
import {
  planCore,
  planEvent,
  planProject,
  planSource,
} from "./fixtures/plan.js";

const scope = {
  projectId: planProject,
  sourceId: planSource,
  sessionId: "association-session" as core.SessionId,
  planId: "synthetic-plan",
};
const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 16, 10, minute)).toISOString();
const envelope = (id: string, minute: number) => ({
  projectId: scope.projectId,
  sourceId: scope.sourceId,
  sessionId: scope.sessionId,
  schemaVersion: 1 as const,
  receivedAt: at(minute),
  id: id as core.EventId,
});
const select = (state: core.ProjectEngineState) =>
  core.getCurrentTaskAssociation(state.plan, scope);

function update(state: core.ProjectEngineState, event: core.NormalizedEvent) {
  const result = core.applyProjectUpdate(
    state,
    { kind: "source", event },
    event.receivedAt,
  );
  expect(result).toMatchObject({ status: "applied" });
  return result.state;
}

function status(
  taskId: core.TaskId,
  minute: number,
  value: core.WorkStatus = "in_progress",
): core.NormalizedEvent<"task.status_reported"> {
  return {
    ...envelope("status-" + minute, minute),
    type: "task.status_reported",
    payload: { taskId, status: value },
  };
}
const steps = [
  { sourceItemId: "a", title: "JWT", certainty: "confirmed" },
  { sourceItemId: "b", title: "Refresh Token", certainty: "confirmed" },
  { sourceItemId: "c", title: "Idea", certainty: "idea" },
] as const;
function fixture(
  completeness: "complete" | "partial" = "complete",
  sourceSequence?: number,
) {
  const session = update(
    core.createProjectEngineState(
      core.createPlanEngineState(planCore()),
      scope,
    ),
    {
      ...envelope("start", 0),
      type: "session.started",
      payload: { sessionId: scope.sessionId },
    },
  );
  const head = planEvent(
    "association-plan",
    { steps, completeness },
    {
      ...envelope("association-plan", 1),
      ...(sourceSequence === undefined ? {} : { sourceSequence }),
    },
  );
  const state = update(session, head);
  const [jwt, refresh, idea] = state.plan.heads[0]!.entries.map(
    ({ taskId }) => taskId,
  );
  return { state, head, jwt: jwt!, refresh: refresh!, idea: idea! };
}

test("one formal task reported in progress produces a traceable suggestion without adding completed weight", () => {
  const { state, jwt, head } = fixture();
  expect(select(state)).toEqual({
    status: "unknown",
    reason: "no_in_progress_report",
  });
  const report = status(jwt, 2);
  const next = update(state, report);
  const suggestion = select(next);
  expect(suggestion).toMatchObject({
    status: "likely",
    taskId: jwt,
    taskTitle: "JWT",
    reportEventId: report.id,
    planRevisionEventId: head.id,
    assertion: {
      provenance: "visualizer_inferred",
      target: "project.currentTask",
      value: jwt,
      inference: {
        kind: "current_task_association",
        ruleId: "core.current-task.reported-in-progress",
        ruleVersion: "1",
        evaluatedAt: at(2),
        associationConfidence: { heuristicScore: 55 },
        evidenceRefs: [
          { kind: "event", eventId: report.id },
          { kind: "event", eventId: head.id },
        ],
      },
    },
  });
  if (suggestion.status !== "likely") throw Error("expected suggestion");
  expect(core.getAssertion(next.plan.core, suggestion.assertion.id)).toEqual(
    suggestion.assertion,
  );
  expect(
    core
      .calculateProgress(next.plan, scope)
      .tasks.find(({ entry }) => entry.taskId === jwt)?.completion,
  ).toBe("not_completed");
  const duplicate = core.applyProjectUpdate(
    next,
    { kind: "source", event: report },
    at(3),
  );
  expect(duplicate.status).toBe("duplicate");
  expect(duplicate.state).toBe(next);
});

test("the same evidence can produce ambiguity without restoring the earlier suggestion", () => {
  const { state, jwt, refresh } = fixture();
  const likely = update(state, status(jwt, 2));
  const together = update(likely, status(refresh, 3));
  expect(select(together)).toMatchObject({
    status: "ambiguous",
    reason: "multiple_in_progress",
    candidates: [{ taskId: jwt }, { taskId: refresh }],
  });
  expect(select(likely)).toMatchObject({ status: "likely", taskId: jwt });
  const conflicting = update(likely, status(jwt, 3, "completed"));
  expect(select(conflicting)).toMatchObject({
    status: "ambiguous",
    reason: "conflicting_reports",
    candidates: [{ taskId: jwt }],
  });
});

test("evidence must belong to the active complete plan and its exact source and session", () => {
  const { state, head, jwt, idea } = fixture();
  expect(select(update(state, status(idea, 2)))).toMatchObject({
    status: "unknown",
  });
  const partial = fixture("partial");
  expect(select(update(partial.state, status(partial.jwt, 2)))).toMatchObject({
    status: "unknown",
    reason: "plan_incomplete",
  });
  const prior = update(state, status(jwt, 2));
  const revised = update(
    prior,
    planEvent(
      "new-revision",
      { previousEventId: head.id, steps },
      envelope("new-revision", 3),
    ),
  );
  expect(select(revised)).toEqual({
    status: "unknown",
    reason: "no_in_progress_report",
  });
  const foreign = {
    ...status(jwt, 4),
    sessionId: "another-session" as core.SessionId,
  };
  const outside = core.applyNormalizedEvent(revised.plan.core, foreign);
  expect(outside.status).toBe("applied");
  expect(
    select({ ...revised, plan: { ...revised.plan, core: outside.state } }),
  ).toMatchObject({ status: "unknown" });
  expect(
    select(
      update(prior, {
        ...envelope("end", 5),
        type: "session.ended",
        payload: { sessionId: scope.sessionId },
      }),
    ),
  ).toEqual({ status: "unknown", reason: "session_ended" });
});

test.each(["stored inference", "earlier state"] as const)(
  "%s: correction keeps the original candidate and task status source",
  (kind) => {
    const { state, jwt, refresh } = fixture();
    let prior: core.ProjectEngineState;
    if (kind === "earlier state") {
      // A state produced before this feature has the same accepted report but no
      // persisted association assertion.
      const report = core.applyNormalizedEvent(state.plan.core, status(jwt, 2));
      expect(report.status).toBe("applied");
      prior = { ...state, plan: { ...state.plan, core: report.state } };
    } else {
      prior = update(state, status(jwt, 2));
    }
    const selection = select(prior);
    expect(selection.status).toBe("likely");
    if (selection.status !== "likely") throw Error("expected suggestion");
    const id = "confirmed-claim" as core.AssertionId;
    const corrected = core.applyProjectUpdate(
      prior,
      {
        kind: "correction",
        input: {
          id: "set-current-task" as core.CorrectionId,
          scope: {
            kind: "current_task",
            projectId: scope.projectId,
            sessionId: scope.sessionId,
          },
          originalAssertionId: selection.assertion.id,
          effectiveAt: at(3),
          assertion: {
            id,
            sourceId: "review-user" as core.SourceId,
            observedAt: at(3),
            target: "project.currentTask",
            targetId: scope.projectId,
            value: refresh,
            provenance: "user_confirmed",
          },
        },
      },
      at(3),
    );
    expect(corrected.status).toBe("applied");
    const after = update(corrected.state, status(jwt, 4));
    expect(select(after)).toMatchObject({
      status: "confirmed",
      taskId: refresh,
      assertion: { id },
    });
    const action = after.timeline.entries.find(
      (x) => x.kind === "correction.applied",
    );
    expect(core.getTimelineEntryDetails(after, action!.id)).toMatchObject({
      status: "available",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          record: expect.objectContaining({ assertion: selection.assertion }),
        }),
      ]),
    });
    expect(
      core
        .getAssertionsForTarget(after.plan.core, "task.status", jwt)
        .map((claim) => claim.provenance),
    ).toEqual(["agent_reported", "agent_reported"]);
  },
);

test("a delayed report with an earlier source sequence cannot support the current plan", () => {
  const { state, head, jwt } = fixture("complete", 10);
  const delayed = update(state, { ...status(jwt, 2), sourceSequence: 9 });
  expect(select(delayed)).toEqual({
    status: "unknown",
    reason: "no_in_progress_report",
  });
  const freshReport = { ...status(jwt, 3), sourceSequence: 11 };
  const fresh = update(delayed, freshReport);
  expect(select(fresh)).toMatchObject({
    status: "likely",
    taskId: jwt,
    reportEventId: freshReport.id,
    planRevisionEventId: head.id,
  });
});
