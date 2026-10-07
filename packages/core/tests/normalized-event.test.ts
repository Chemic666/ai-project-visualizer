import { expect, test } from "vitest";

import type {
  EventId,
  NormalizedEvent,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "../src/index.js";

const sourceId = "source-a" as SourceId;
const sessionId = "session-internal-1" as SessionId;
const envelope = {
  schemaVersion: 1 as const,
  projectId: "project-internal-1" as ProjectId,
  sourceId,
  receivedAt: "2026-10-07T09:00:00.000Z",
};

const events = [
  {
    ...envelope,
    id: "event-internal-1" as EventId,
    type: "session.started",
    sessionId,
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "external-start-1",
    },
    payload: {
      sessionId,
      sourceSessionReference: { sourceId, reference: "external-session-1" },
    },
  },
  {
    ...envelope,
    id: "event-internal-2" as EventId,
    type: "session.ended",
    sessionId,
    occurredAt: "2026-10-07T08:59:59.000Z",
    sourceSequence: 2,
    sourceIdentity: { kind: "cursor", sourceId, revision: "cursor-after-end" },
    payload: { sessionId },
  },
  {
    ...envelope,
    id: "event-internal-3" as EventId,
    type: "plan.detected",
    payload: {
      completeness: "partial",
      steps: [{ title: "Build the Core contracts" }],
    },
  },
  {
    ...envelope,
    id: "event-internal-4" as EventId,
    type: "plan.updated",
    sourceIdentity: {
      kind: "cursor",
      sourceId,
      reference: "plan-feed",
      revision: "cursor-4",
    },
    payload: {
      completeness: "complete",
      sourceReference: {
        sourceId,
        reference: "source-plan",
        revision: "revision-2",
      },
      steps: [
        { title: "Build the Core contracts" },
        {
          title: "Review the fixtures",
          sourceReference: { sourceId, reference: "source-step" },
        },
      ],
    },
  },
  {
    ...envelope,
    id: "event-internal-5" as EventId,
    type: "task.status_reported",
    causedBy: "event-internal-4" as EventId,
    relatedEventIds: ["event-internal-3" as EventId],
    payload: { taskId: "task-internal-1" as TaskId, status: "completed" },
  },
] as const satisfies readonly NormalizedEvent[];

test("constructs all five events as plain JSON-compatible source inputs", () => {
  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "session.ended",
    "plan.detected",
    "plan.updated",
    "task.status_reported",
  ]);
  for (const event of events) {
    expect(Object.getPrototypeOf(event)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(event.payload)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  }
});

test("retains separate internal, source-event, cursor and Session identities", () => {
  const started = events[0];
  expect(started.sourceIdentity.sourceId).toBe(started.sourceId);
  expect(started.id).not.toBe(started.sourceIdentity.sourceEventId);
  expect(started.payload.sessionId).not.toBe(
    started.payload.sourceSessionReference.reference,
  );
  expect(events[1].sourceIdentity).toEqual({
    kind: "cursor",
    sourceId,
    revision: "cursor-after-end",
  });
  expect(events[3].sourceIdentity).toEqual({
    kind: "cursor",
    sourceId,
    reference: "plan-feed",
    revision: "cursor-4",
  });
  expect(events[2]).not.toHaveProperty("sourceIdentity");
  expect(events[2].payload.completeness).toBe("partial");
  expect(events[2].payload.steps[0]).not.toHaveProperty("sourceReference");
});

test("keeps unknown source time absent and source-local sequence separate from causality", () => {
  expect(events[0]).toHaveProperty("receivedAt");
  expect(events[0]).not.toHaveProperty("occurredAt");
  expect(events[1].occurredAt).not.toBe(events[1].receivedAt);

  // Equal numbers from different sources carry no cross-source ordering claim.
  const otherSource: NormalizedEvent<"session.ended"> = {
    ...events[1],
    id: "event-internal-other-source" as EventId,
    sourceId: "source-b" as SourceId,
    sourceIdentity: {
      kind: "cursor",
      sourceId: "source-b" as SourceId,
      revision: "other-cursor",
    },
    payload: { sessionId: "session-internal-2" as SessionId },
    sessionId: "session-internal-2" as SessionId,
  };
  expect(otherSource.sourceSequence).toBe(events[1].sourceSequence);
  expect(otherSource.sourceId).not.toBe(events[1].sourceId);
  expect(otherSource).not.toHaveProperty("globalSequence");
  expect(events[4].causedBy).toBe(events[3].id);
  expect(events[4].relatedEventIds).toEqual([events[2].id]);
});

test("keeps a reported completion as input without producing verification or Assertions", () => {
  const reported = events[4];
  expect(reported.type).toBe("task.status_reported");
  expect(reported.payload.status).toBe("completed");
  expect(Object.keys(reported.payload).sort()).toEqual(["status", "taskId"]);
  expect(reported).not.toHaveProperty("assertion");
  expect(reported).not.toHaveProperty("resolvedConclusion");
  expect(reported).not.toHaveProperty("verificationEvidence");
});
