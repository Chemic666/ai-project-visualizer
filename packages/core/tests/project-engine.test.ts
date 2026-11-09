import { expect, test } from "vitest";
import * as core from "../src/index.js";
import { selectAssertion } from "./fixtures/progress.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  NormalizedEvent,
  PlanStepInput,
  ProjectEngineState,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
  TaskWeight,
} from "../src/index.js";

const projectId = "composed-project" as ProjectId;
const sourceId = "composed-source" as SourceId;
const sessionId = "composed-session" as SessionId;
const scope = { projectId, sourceId, sessionId, planId: "composed-plan" };
const at = (minute: number) =>
  `2026-11-08T09:${String(minute).padStart(2, "0")}:00.000Z`;
const steps: readonly PlanStepInput[] = [
  { sourceItemId: "done", title: "Completed work", certainty: "confirmed" },
  {
    sourceItemId: "remaining",
    title: "Remaining work",
    certainty: "confirmed",
  },
];
function plan(
  id = "plan-1",
  minute = 1,
  previousEventId?: EventId,
  entries = steps,
): NormalizedEvent<"plan.updated"> {
  return {
    id: id as EventId,
    type: "plan.updated",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(minute),
    payload: {
      planId: scope.planId,
      provenance: "agent_reported",
      completeness: "complete",
      steps: entries,
      ...(previousEventId === undefined ? {} : { previousEventId }),
    },
  };
}
function session(
  type: "session.started" | "session.ended",
  minute: number,
): NormalizedEvent<"session.started" | "session.ended"> {
  return {
    id: type as EventId,
    type,
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(minute),
    payload: { sessionId },
  };
}
function send(
  state: ProjectEngineState,
  event: NormalizedEvent,
): ProjectEngineState {
  const result = core.applyProjectUpdate(
    state,
    { kind: "source", event },
    event.receivedAt,
  );
  expect(result.status).toBe("applied");
  return result.state;
}
function correct(
  state: ProjectEngineState,
  taskId: TaskId,
  value: number,
  id: string,
  minute: number,
) {
  const result = core.applyProjectUpdate(
    state,
    {
      kind: "correction",
      input: {
        id: id as CorrectionId,
        scope: { kind: "task_weight", projectId, sessionId, taskId },
        effectiveAt: at(minute),
        assertion: {
          id: `${id}-assertion` as AssertionId,
          target: "task.weight",
          targetId: taskId,
          value: value as TaskWeight,
          provenance: "user_confirmed",
          sourceId: "synthetic-user" as SourceId,
          observedAt: at(minute),
        },
      },
    },
    at(minute),
  );
  expect(result.status).toBe("applied");
  return result.state;
}
function fixture() {
  let state = core.createProjectEngineState(
    core.createPlanEngineState(
      core.createCoreState({
        projects: [
          {
            id: projectId,
            name: "Composed synthetic project",
            locations: [],
            phaseIds: [],
            currentTaskAssertionIds: [],
            currentPhaseAssertionIds: [],
          },
        ],
      }),
    ),
    scope,
  );
  state = send(state, session("session.started", 0));
  state = send(state, plan());
  const [done, remaining] = state.plan.heads[0]!.entries.map(
    (entry) => entry.taskId,
  ) as [TaskId, TaskId];
  state = correct(state, done, 32, "weight-done", 2);
  state = correct(state, remaining, 13, "weight-remaining", 3);
  state = send(state, {
    id: "done-report" as EventId,
    type: "task.status_reported",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(4),
    payload: { taskId: done, status: "completed" },
  });
  const selected = core.applyProjectUpdate(
    state,
    {
      kind: "correction",
      input: {
        id: "current-task" as CorrectionId,
        scope: { kind: "current_task", projectId, sessionId },
        effectiveAt: at(5),
        assertion: {
          id: "current-assertion" as AssertionId,
          target: "project.currentTask",
          targetId: projectId,
          value: remaining,
          provenance: "user_confirmed",
          sourceId: "synthetic-user" as SourceId,
          observedAt: at(5),
        },
      },
    },
    at(5),
  );
  expect(selected.status).toBe("applied");
  return { state: selected.state, done, remaining };
}

test("one Core update keeps plan, corrections, progress and timeline together", () => {
  expect(core.applyProjectUpdate).toBeTypeOf("function");
  const { state } = fixture();
  expect(state.progress.snapshots.at(-1)?.result).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 45,
  });
  expect(
    core.getUserCorrectedCurrentTask(state.plan.core, projectId, sessionId)
      .status,
  ).toBe("available");
  const changes = state.timeline.entries.filter(
    (e) => e.kind === "progress.changed",
  );
  expect(changes[0]?.detail.after).toEqual({
    status: "unavailable",
    issues: [{ code: "plan_unknown" }],
  });
  expect(changes.at(-1)?.detail.after).toMatchObject({
    completedWeight: 32,
    totalWeight: 45,
  });
  expect(
    state.timeline.entries.filter((e) => e.kind === "correction.applied"),
  ).toHaveLength(3);
});

test("plan expansion is unavailable until weights exist, then records 32/50 with history", () => {
  let { state } = fixture();
  const original = JSON.stringify(state);
  const expanded = [
    ...steps,
    {
      sourceItemId: "new-a",
      title: "Additional work A",
      certainty: "confirmed" as const,
    },
    {
      sourceItemId: "new-b",
      title: "Additional work B",
      certainty: "confirmed" as const,
    },
  ];
  const changed = send(state, plan("plan-2", 6, "plan-1" as EventId, expanded));
  expect(changed.progress.snapshots.at(-1)?.result).toMatchObject({
    status: "unavailable",
    issues: expect.arrayContaining([
      { code: "weight_unknown", taskId: expect.any(String) },
    ]),
  });
  expect(changed.progress.snapshots.at(-1)?.result).not.toHaveProperty("ratio");
  expect(JSON.stringify(state)).toBe(original);
  const added = changed.plan.heads[0]!.entries.slice(2);
  state = correct(changed, added[0]!.taskId, 3, "new-weight-a", 7);
  state = correct(state, added[1]!.taskId, 2, "new-weight-b", 8);
  expect(state.progress.snapshots.at(-1)?.result).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 50,
    ratio: 0.64,
  });
  expect(
    state.timeline.entries.some(
      (e) =>
        e.kind === "progress.changed" &&
        e.detail.reasons.includes("plan_expanded"),
    ),
  ).toBe(true);
});

test("session end expires current-task correction and replay after JSON restore adds nothing", () => {
  const { state } = fixture();
  const event = session("session.ended", 9);
  const ended = send(state, event);
  expect(
    core.getUserCorrectedCurrentTask(ended.plan.core, projectId, sessionId)
      .status,
  ).toBe("unknown");
  expect(
    ended.timeline.entries.filter((e) => e.kind === "correction.expired"),
  ).toHaveLength(1);
  expect(
    ended.plan.core.corrections.find((c) => c.id === "weight-remaining")
      ?.lifecycle.status,
  ).toBe("active");
  const restored: ProjectEngineState = JSON.parse(JSON.stringify(ended));
  const replay = core.applyProjectUpdate(
    restored,
    { kind: "source", event },
    at(10),
  );
  expect(replay.status).toBe("duplicate");
  expect(replay.state).toBe(restored);
});

test("plan removal expires applicable corrections before recalculation and re-entry cannot revive them", () => {
  const { state } = fixture();
  const removed = send(
    state,
    plan("remove", 6, "plan-1" as EventId, [steps[0]!]),
  );
  expect(removed.progress.snapshots.at(-1)?.result).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 32,
  });
  expect(
    removed.plan.core.corrections.filter(
      (c) => c.lifecycle.status === "expired",
    ),
  ).toHaveLength(2);
  expect(
    removed.timeline.entries.filter((e) => e.kind === "correction.expired"),
  ).toHaveLength(2);
  const reentered = send(removed, plan("reenter", 7, "remove" as EventId));
  expect(reentered.progress.snapshots.at(-1)?.result.status).toBe(
    "unavailable",
  );
  expect(
    core.getUserCorrectedCurrentTask(reentered.plan.core, projectId, sessionId)
      .status,
  ).toBe("unknown");
});

test("timeline conflict rejects the entire update rather than publishing partial state", () => {
  const { state, remaining } = fixture();
  const event: NormalizedEvent<"task.status_reported"> = {
    id: "next-status" as EventId,
    type: "task.status_reported",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(6),
    payload: { taskId: remaining, status: "completed" },
  };
  const conflict = core.appendTimelineEvents(state.timeline, [
    {
      kind: "source",
      event: { ...event, payload: { ...event.payload, status: "todo" } },
    },
  ]);
  expect(conflict.status).toBe("applied");
  const before = { ...state, timeline: conflict.state };
  const original = JSON.stringify(before);
  const result = core.applyProjectUpdate(
    before,
    { kind: "source", event },
    at(6),
  );
  expect(result).toMatchObject({
    status: "rejected",
    reason: "identity_conflict",
  });
  expect(result.state).toBe(before);
  expect(JSON.stringify(before)).toBe(original);
  expect(core.hasProcessedEvent(result.state.plan.core, event.id)).toBe(false);
});

test.each([
  { projectId: "foreign-project" as ProjectId },
  { sourceId: "foreign-source" as SourceId },
  { sessionId: "foreign-session" as SessionId },
  { sessionId: undefined },
])(
  "foreign or missing scope %j cannot enter this project composition",
  (overrides) => {
    const { state } = fixture();
    const event = {
      ...plan("foreign", 6, "plan-1" as EventId),
      ...overrides,
    } as NormalizedEvent;
    const result = core.applyProjectUpdate(
      state,
      { kind: "source", event },
      at(6),
    );
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(state);
  },
);

test("a future receipt or mismatched plan cannot partially advance the engines", () => {
  const { state } = fixture();
  expect(
    core.applyProjectUpdate(
      state,
      { kind: "source", event: plan("future", 8) },
      at(7),
    ),
  ).toMatchObject({ status: "rejected", state });
  const event = plan("other-plan", 6);
  const wrong = {
    ...event,
    payload: { ...event.payload, planId: "foreign-plan" },
  };
  expect(
    core.applyProjectUpdate(state, { kind: "source", event: wrong }, at(6)),
  ).toMatchObject({ status: "rejected", state });
});

test("historical status replay stays duplicate after its task leaves the current plan", () => {
  const { state: initial, remaining } = fixture();
  let state = initial;
  const event: NormalizedEvent<"task.status_reported"> = {
    id: "replayed-status" as EventId,
    type: "task.status_reported",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(6),
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "synthetic-remote-status",
    },
    payload: { taskId: remaining, status: "todo" },
  };
  state = send(state, event);
  state = send(
    state,
    plan("remove-replay", 7, "plan-1" as EventId, [steps[0]!]),
  );
  for (const replayed of [
    event,
    { ...event, id: "renormalized-status" as EventId },
  ]) {
    const replay = core.applyProjectUpdate(
      state,
      { kind: "source", event: replayed },
      at(8),
    );
    expect(
      replay.status,
      replay.status === "rejected" ? replay.reason : "",
    ).toBe("duplicate");
    expect(replay.state).toBe(state);
  }
});

test("trusted verification support survives composed updates rather than losing completed weight", () => {
  const { state, done, remaining } = fixture();
  const assertion: core.Assertion<"task.status"> = {
    id: "independent-observation" as AssertionId,
    target: "task.status",
    targetId: done,
    value: "verified",
    provenance: "observed",
    sourceId: "synthetic-verifier" as SourceId,
    observedAt: at(5),
    sourceReference: {
      sourceId: "synthetic-verifier" as SourceId,
      reference: "synthetic-proof",
    },
  };
  const seeded = selectAssertion(
    {
      ...state.plan,
      core: {
        ...state.plan.core,
        assertions: [...state.plan.core.assertions, assertion],
        tasks: state.plan.core.tasks.map((task) =>
          task.id === done
            ? {
                ...task,
                statusAssertionIds: [...task.statusAssertionIds, assertion.id],
              }
            : task,
        ),
      },
    },
    "task.status",
    done,
    assertion.id,
  );
  const support: core.IndependentVerificationSupport = {
    assertionId: assertion.id,
    ruleId: "synthetic.independent-check",
    ruleVersion: "1",
    evidenceRefs: [{ kind: "source", reference: assertion.sourceReference! }],
  };
  let composed = core.createProjectEngineState(seeded, scope, [support]);
  composed = send(
    composed,
    plan("verification-refresh", 6, "plan-1" as EventId),
  );
  expect(composed.progress.snapshots.at(-1)?.result).toMatchObject({
    completedWeight: 32,
    totalWeight: 45,
  });
  expect(
    composed.progress.snapshots
      .at(-1)
      ?.result.tasks.find((entry) => entry.entry.taskId === done),
  ).toMatchObject({
    completion: "verified",
    completionReason: "independent_verification",
  });
  const restored: ProjectEngineState = JSON.parse(JSON.stringify(composed));
  composed = correct(restored, remaining, 17, "reweight-with-evidence", 7);
  expect(composed.progress.snapshots.at(-1)?.result).toMatchObject({
    completedWeight: 32,
    totalWeight: 49,
  });
});

test("progress evidence rejection rolls back source admission and all other projections", () => {
  const { state } = fixture();
  const before: ProjectEngineState = {
    ...state,
    plan: {
      ...state.plan,
      core: {
        ...state.plan.core,
        assertions: state.plan.core.assertions.map((assertion) =>
          assertion.id === "weight-done-assertion"
            ? { ...assertion, observedAt: at(3) }
            : assertion,
        ),
      },
    },
  };
  const event = plan("conflicting-evidence", 6, "plan-1" as EventId);
  const result = core.applyProjectUpdate(
    before,
    { kind: "source", event },
    at(6),
  );
  expect(result).toMatchObject({
    status: "rejected",
    reason: "evidence_identity_conflict",
  });
  expect(result.state).toBe(before);
  expect(core.hasProcessedEvent(result.state.plan.core, event.id)).toBe(false);
});

test("a reused status identity with changed claim is rejected rather than hidden as a duplicate", () => {
  const { state: initial, remaining } = fixture();
  let state = initial;
  const event: NormalizedEvent<"task.status_reported"> = {
    id: "stable-status" as EventId,
    type: "task.status_reported",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(6),
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "stable-remote-status",
    },
    payload: { taskId: remaining, status: "todo" },
  };
  state = send(state, event);
  for (const id of [event.id, "another-normalization" as EventId]) {
    const conflict = {
      ...event,
      id,
      payload: { ...event.payload, status: "completed" as const },
    };
    const result = core.applyProjectUpdate(
      state,
      { kind: "source", event: conflict },
      at(7),
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "duplicate_claim_conflict",
    });
    expect(result.state).toBe(state);
  }
});

test("an uninterpretable plan retains its source event and active correction without inventing progress", () => {
  const { state } = fixture();
  const event = plan("unknown-base", 6, "not-observed" as EventId, []);
  const result = core.applyProjectUpdate(
    state,
    { kind: "source", event },
    at(6),
  );
  expect(result.status).toBe("applied");
  expect(core.hasProcessedEvent(result.state.plan.core, event.id)).toBe(true);
  expect(core.getPlanSnapshot(result.state.plan, scope).status).toBe("unknown");
  expect(result.state.progress.snapshots.at(-1)?.result.status).toBe(
    "unavailable",
  );
  expect(result.state.progress.snapshots.at(-1)?.result).not.toHaveProperty(
    "ratio",
  );
  expect(
    result.state.plan.core.corrections.every(
      (record) => record.lifecycle.status === "active",
    ),
  ).toBe(true);
  expect(
    result.state.timeline.entries.filter(
      (entry) => entry.kind === "correction.expired",
    ),
  ).toHaveLength(0);
  const replay = core.applyProjectUpdate(
    result.state,
    { kind: "source", event },
    at(7),
  );
  expect(replay.status).toBe("duplicate");
  expect(replay.state).toBe(result.state);
});

test("lost correction history rejects the entire project update without accepting its source event", () => {
  const { state } = fixture();
  const before: ProjectEngineState = {
    ...state,
    plan: {
      ...state.plan,
      core: {
        ...state.plan.core,
        corrections: state.plan.core.corrections.filter(
          (record) => record.id !== "weight-done",
        ),
      },
    },
  };
  const event = plan("after-correction-loss", 6, "plan-1" as EventId);
  const result = core.applyProjectUpdate(
    before,
    { kind: "source", event },
    at(6),
  );
  expect(result).toMatchObject({
    status: "rejected",
    reason: "evidence_history_missing",
  });
  expect(result.state).toBe(before);
  expect(core.hasProcessedEvent(result.state.plan.core, event.id)).toBe(false);
});
