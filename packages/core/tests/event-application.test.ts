import { expect, test } from "vitest";

import {
  applyNormalizedEvent,
  getAssertion,
  getSession,
  getTask,
  hasProcessedEvent,
} from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  CoreState,
  EventId,
  NormalizedEvent,
  ProjectId,
  SessionId,
  SourceId,
} from "../src/index.js";
import {
  createHierarchyFixture,
  createStatusEvent,
  otherTaskId,
  projectId,
  sessionId,
  sourceId,
  taskId,
} from "./fixtures/core-state.js";

function freezeData<T>(data: T): T {
  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data)) freezeData(value);
    Object.freeze(data);
  }
  return data;
}

test("applies a report as a separate Agent Reported Assertion and preserves previous state", () => {
  const previous = freezeData(createHierarchyFixture());
  const event = freezeData(
    createStatusEvent({ occurredAt: "2026-10-07T09:59:00.000Z" }),
  );
  const before = JSON.stringify(previous);
  const result = applyNormalizedEvent(previous, event);
  expect(result.status).toBe("applied");
  expect(result.state).not.toBe(previous);
  expect(JSON.stringify(previous)).toBe(before);
  expect(previous.assertions).toEqual([]);
  expect(previous.acceptedEvents).toEqual([]);
  expect(getTask(previous, taskId)?.statusAssertionIds).toEqual([]);
  expect(result.state.acceptedEvents).toEqual([event]);
  expect(hasProcessedEvent(result.state, event.id)).toBe(true);

  const assertionId = getTask(result.state, taskId)?.statusAssertionIds[0];
  expect(assertionId).toBeDefined();
  const assertion = getAssertion(result.state, assertionId!);
  expect(assertion).toEqual({
    id: assertionId,
    target: "task.status",
    targetId: taskId,
    value: "completed",
    provenance: "agent_reported",
    sourceId,
    eventId: event.id,
    observedAt: event.receivedAt,
  });
  expect(assertionId).not.toBe(event.id);
  expect(assertion).not.toHaveProperty("assertedAt");
  expect(result.state.resolvedConclusions).toEqual([]);
  expect(getTask(result.state, taskId)).not.toHaveProperty("status");
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  expect(applyNormalizedEvent(previous, event)).toEqual(result);
});

test("treats internal EventId replay as duplicate without additional records", () => {
  const event = createStatusEvent();
  const first = applyNormalizedEvent(createHierarchyFixture(), event);
  const replay = applyNormalizedEvent(freezeData(first.state), event);
  expect(replay).toEqual({
    status: "duplicate",
    reason: "internal_event_id",
    state: first.state,
  });
  expect(replay.state).toBe(first.state);
  expect(replay.state.assertions).toHaveLength(1);
  expect(replay.state.acceptedEvents).toHaveLength(1);
});

test("deduplicates stable source event replay across new internal EventIds", () => {
  const event = createStatusEvent({
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "external-1",
    },
  });
  const first = applyNormalizedEvent(createHierarchyFixture(), event);
  const replayEvent = { ...event, id: "event-replay" as EventId };
  const replay = applyNormalizedEvent(first.state, replayEvent);
  expect(replay).toEqual({
    status: "duplicate",
    reason: "stable_source_event",
    state: first.state,
  });
  expect(replay.state).toBe(first.state);
  expect(hasProcessedEvent(replay.state, replayEvent.id)).toBe(false);
  expect(getTask(replay.state, taskId)?.statusAssertionIds).toHaveLength(1);
});

test("scopes stable event identity by SourceId, not globally by sourceEventId", () => {
  const event = createStatusEvent({
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "external-1",
    },
  });
  const first = applyNormalizedEvent(createHierarchyFixture(), event);
  const otherSourceId = "source-other" as SourceId;
  const second = applyNormalizedEvent(first.state, {
    ...event,
    id: "event-other-source" as EventId,
    sourceId: otherSourceId,
    sourceIdentity: {
      kind: "source_event",
      sourceId: otherSourceId,
      sourceEventId: "external-1",
    },
  });
  expect(second.status).toBe("applied");
  expect(second.state.assertions).toHaveLength(2);
  expect(second.state.acceptedEvents).toHaveLength(2);
});

test.each([
  undefined,
  { kind: "cursor", sourceId, revision: "same-cursor" } as const,
])(
  "does not deduplicate new EventIds using a missing identity or cursor: %j",
  (identity) => {
    const event = createStatusEvent(
      identity === undefined ? {} : { sourceIdentity: identity },
    );
    const first = applyNormalizedEvent(createHierarchyFixture(), event);
    const second = applyNormalizedEvent(first.state, {
      ...event,
      id: "event-new-normalization" as EventId,
    });
    expect(second.status).toBe("applied");
    expect(second.state.acceptedEvents).toHaveLength(2);
    expect(second.state.assertions).toHaveLength(2);
    expect(
      new Set(second.state.assertions.map((assertion) => assertion.id)).size,
    ).toBe(2);
  },
);

test.each(["source_event", "cursor"] as const)(
  "rejects a %s identity from a different source namespace",
  (kind) => {
    const previous = freezeData(createHierarchyFixture());
    const wrongSource = "wrong-source" as SourceId;
    const sourceIdentity =
      kind === "source_event"
        ? { kind, sourceId: wrongSource, sourceEventId: "external" }
        : { kind, sourceId: wrongSource, revision: "cursor" };
    expect(
      applyNormalizedEvent(previous, createStatusEvent({ sourceIdentity })),
    ).toEqual({
      status: "rejected",
      reason: "source_namespace_mismatch",
      state: previous,
    });
  },
);

test("rejects an unknown project", () => {
  const previous = createHierarchyFixture();
  const result = applyNormalizedEvent(
    previous,
    createStatusEvent({ projectId: "missing-project" as ProjectId }),
  );
  expect(result).toEqual({
    status: "rejected",
    reason: "project_not_found",
    state: previous,
  });
  expect(result.state).toBe(previous);
});

test("rejects an unknown task", () => {
  const previous = createHierarchyFixture();
  const event = createStatusEvent();
  const result = applyNormalizedEvent(previous, {
    ...event,
    payload: { ...event.payload, taskId: "missing-task" as typeof taskId },
  });
  expect(result).toEqual({
    status: "rejected",
    reason: "task_not_found",
    state: previous,
  });
});

test("rejects a task from another project without guessing attribution", () => {
  const previous = createHierarchyFixture();
  const result = applyNormalizedEvent(
    previous,
    createStatusEvent({
      payload: { taskId: otherTaskId, status: "completed" },
    }),
  );
  expect(result).toEqual({
    status: "rejected",
    reason: "task_project_mismatch",
    state: previous,
  });
});

test("rejects inconsistent hierarchy membership rather than using only the phase's projectId", () => {
  const state = createHierarchyFixture();
  const previous: CoreState = {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId ? { ...project, phaseIds: [] } : project,
    ),
  };
  expect(applyNormalizedEvent(previous, createStatusEvent())).toEqual({
    status: "rejected",
    reason: "task_project_mismatch",
    state: previous,
  });
});

test("does not consume rejected IDs or source identities", () => {
  const previous = createHierarchyFixture();
  const event = createStatusEvent({
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "external-retry",
    },
  });
  const rejected = applyNormalizedEvent(previous, {
    ...event,
    projectId: "missing-project" as ProjectId,
  });
  expect(rejected.status).toBe("rejected");
  const retry = applyNormalizedEvent(rejected.state, event);
  expect(retry.status).toBe("applied");
});

test("preserves existing Assertions and conclusions instead of choosing the latest report", () => {
  const base = createHierarchyFixture();
  const existing: Assertion<"task.status"> = {
    id: "existing-assertion" as AssertionId,
    target: "task.status",
    targetId: taskId,
    value: "blocked",
    provenance: "user_confirmed",
    sourceId,
    observedAt: "2026-10-07T09:00:00.000Z",
  };
  const previous = freezeData({
    ...base,
    assertions: [existing],
    tasks: base.tasks.map((task) =>
      task.id === taskId
        ? { ...task, statusAssertionIds: [existing.id] }
        : task,
    ),
    resolvedConclusions: [
      {
        target: "task.status" as const,
        targetId: taskId,
        selectedAssertionId: existing.id,
        supportingAssertionIds: [],
        conflictingAssertionIds: [],
        resolution: {
          resolvedAt: "2026-10-07T09:00:00.000Z",
          ruleId: "fixture.rule",
          ruleVersion: "1",
          reason: "Preloaded explanation",
        },
      },
    ],
  });
  const result = applyNormalizedEvent(previous, createStatusEvent());
  expect(result.status).toBe("applied");
  expect(result.state.assertions[0]).toBe(existing);
  expect(result.state.resolvedConclusions).toBe(previous.resolvedConclusions);
  expect(getTask(result.state, taskId)?.statusAssertionIds).toHaveLength(2);
});

test("rejects a derived Assertion ID collision without replacing an existing Assertion", () => {
  const event = createStatusEvent();
  const base = createHierarchyFixture();
  const produced = applyNormalizedEvent(base, event).state.assertions[0]!;
  const collision: Assertion<"task.status"> = {
    id: produced.id,
    target: "task.status",
    targetId: taskId,
    value: "blocked",
    provenance: "user_confirmed",
    sourceId: event.sourceId,
    eventId: event.id,
    observedAt: event.receivedAt,
  };
  const previous: CoreState = {
    ...base,
    assertions: [collision],
  };
  expect(applyNormalizedEvent(previous, event)).toEqual({
    status: "rejected",
    reason: "assertion_id_collision",
    state: previous,
  });
});

function sessionEvent(
  type: "session.started" | "session.ended",
): NormalizedEvent<"session.started" | "session.ended"> {
  const report = createStatusEvent();
  return {
    id: report.id,
    schemaVersion: 1,
    projectId,
    sourceId,
    receivedAt: report.receivedAt,
    type,
    sessionId,
    payload: {
      sessionId,
      sourceSessionReference: {
        sourceId,
        reference: "external-session",
        revision: "session-revision",
      },
    },
  };
}

test("creates a minimal Session without inventing project association or losing the event's revision", () => {
  const event = sessionEvent("session.started");
  const previous = freezeData(createHierarchyFixture());
  const result = applyNormalizedEvent(previous, event);
  expect(result.status).toBe("applied");
  expect(getSession(result.state, sessionId)).toEqual({
    id: sessionId,
    sourceId,
    sourceSessionId: "external-session",
    projectAssociationAssertionIds: [],
  });
  expect(result.state.assertions).toEqual([]);
  expect(result.state.acceptedEvents).toEqual([event]);
  expect(previous.sessions).toEqual([]);
});

test("keeps revision-only Session identity unavailable and retains the full event", () => {
  const event = sessionEvent("session.started");
  const result = applyNormalizedEvent(createHierarchyFixture(), {
    ...event,
    payload: {
      sessionId,
      sourceSessionReference: { sourceId, revision: "revision-only" },
    },
  });
  expect(result.status).toBe("applied");
  expect(getSession(result.state, sessionId)?.sourceSessionId).toBeNull();
  expect(result.state.acceptedEvents[0]?.payload).toEqual({
    sessionId,
    sourceSessionReference: { sourceId, revision: "revision-only" },
  });
});

test.each(["session.started", "session.ended"] as const)(
  "rejects %s envelope/payload Session mismatch",
  (type) => {
    const previous = createHierarchyFixture();
    const event = {
      ...sessionEvent(type),
      sessionId: "wrong-session" as SessionId,
    };
    expect(applyNormalizedEvent(previous, event)).toEqual({
      status: "rejected",
      reason: "session_id_mismatch",
      state: previous,
    });
  },
);

test("rejects source Session reference namespace mismatch", () => {
  const previous = createHierarchyFixture();
  const event = sessionEvent("session.started");
  expect(
    applyNormalizedEvent(previous, {
      ...event,
      payload: {
        sessionId,
        sourceSessionReference: {
          sourceId: "wrong-source" as SourceId,
          reference: "external",
        },
      },
    }),
  ).toEqual({
    status: "rejected",
    reason: "source_namespace_mismatch",
    state: previous,
  });
});

test("preserves an existing Session and rejects reuse of its internal ID by another source", () => {
  const event = sessionEvent("session.started");
  const first = applyNormalizedEvent(createHierarchyFixture(), event);
  const second = applyNormalizedEvent(first.state, {
    ...event,
    id: "event-session-repeat" as EventId,
    payload: { sessionId },
  });
  expect(second.status).toBe("applied");
  expect(second.state.sessions).toBe(first.state.sessions);
  expect(getSession(second.state, sessionId)?.sourceSessionId).toBe(
    "external-session",
  );
  const rejected = applyNormalizedEvent(first.state, {
    ...event,
    id: "event-other-source" as EventId,
    sourceId: "other-source" as SourceId,
    payload: { sessionId },
  });
  expect(rejected).toEqual({
    status: "rejected",
    reason: "session_source_mismatch",
    state: first.state,
  });
});

test("stores session.ended without creating a lifecycle model or fabricating a missing Session", () => {
  const previous = createHierarchyFixture();
  const event = sessionEvent("session.ended");
  const result = applyNormalizedEvent(previous, event);
  expect(result.status).toBe("applied");
  expect(result.state.acceptedEvents).toEqual([event]);
  expect(result.state.sessions).toBe(previous.sessions);
  expect(getSession(result.state, sessionId)).toBeUndefined();
});

test.each(["plan.detected", "plan.updated"] as const)(
  "stores %s without generating hierarchy, Assertions or conclusions",
  (type) => {
    const previous = freezeData(createHierarchyFixture());
    const report = createStatusEvent();
    const event: NormalizedEvent<"plan.detected" | "plan.updated"> = {
      id: report.id,
      schemaVersion: 1,
      projectId,
      sourceId,
      receivedAt: report.receivedAt,
      type,
      payload: {
        completeness: "complete",
        steps: [{ title: "A new source plan step" }],
      },
    };
    const result = applyNormalizedEvent(previous, event);
    expect(result.status).toBe("applied");
    expect(result.state.acceptedEvents).toEqual([event]);
    expect(hasProcessedEvent(result.state, event.id)).toBe(true);
    expect(result.state.projects).toBe(previous.projects);
    expect(result.state.phases).toBe(previous.phases);
    expect(result.state.tasks).toBe(previous.tasks);
    expect(result.state.assertions).toBe(previous.assertions);
    expect(result.state.resolvedConclusions).toBe(previous.resolvedConclusions);
  },
);
