import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  ProjectEngineState,
  ProjectId,
  SourceId,
  TaskWeight,
  TimelineEntry,
} from "../src/index.js";
import { progressFixture } from "./fixtures/progress.js";

const at = (minute: number) =>
  `2026-11-09T10:${String(minute).padStart(2, "0")}:00.000Z`;

function correction(
  engine: ProjectEngineState,
  taskId: core.TaskId,
  id: string,
  value: number,
  minute: number,
) {
  const result = core.applyProjectUpdate(
    engine,
    {
      kind: "correction",
      input: {
        id: id as CorrectionId,
        scope: {
          kind: "task_weight",
          projectId: engine.scope.projectId,
          taskId,
        },
        effectiveAt: at(minute),
        originalAssertionId: "weight-remaining" as AssertionId,
        assertion: {
          id: `${id}-assertion` as AssertionId,
          target: "task.weight",
          targetId: taskId,
          value: value as TaskWeight,
          provenance: "user_confirmed",
          sourceId: "synthetic-person" as SourceId,
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
  const f = progressFixture();
  let engine = core.createProjectEngineState(f.plan, f.scope);
  engine = correction(engine, f.remaining, "details-correction", 17, 0);
  const correctionEntry = engine.timeline.entries.find(
    (entry) => entry.kind === "correction.applied",
  )!;
  return { ...f, engine, correctionEntry };
}

function details(engine: ProjectEngineState, id: string) {
  const result = core.getTimelineEntryDetails(engine, id);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error("details missing");
  return result;
}

function withReferences(
  engine: ProjectEngineState,
  entry: TimelineEntry,
  evidenceRefs: TimelineEntry["evidenceRefs"],
): ProjectEngineState {
  return {
    ...engine,
    timeline: {
      entries: engine.timeline.entries.map((row) =>
        row.id === entry.id ? { ...row, evidenceRefs } : row,
      ),
    },
  };
}

test("timeline details resolve the actual source claim without upgrading completion", () => {
  expect(core.getTimelineEntryDetails).toBeTypeOf("function");
  const f = fixture();
  const event: core.NormalizedEvent<"task.status_reported"> = {
    id: "details-status" as EventId,
    type: "task.status_reported",
    schemaVersion: 1,
    projectId: f.scope.projectId,
    sourceId: f.scope.sourceId,
    receivedAt: at(1),
    payload: { taskId: f.remaining, status: "completed" },
  };
  const applied = core.applyProjectUpdate(
    f.engine,
    { kind: "source", event },
    event.receivedAt,
  );
  expect(applied.status).toBe("applied");
  const before = JSON.stringify(applied.state);
  const entry = applied.state.timeline.entries.find(
    (row) => row.eventId === event.id,
  )!;
  const result = details(applied.state, entry.id);
  expect(result.entry).toBe(entry);
  expect(result.entry).toMatchObject({
    provenance: "agent_reported",
    detail: { reportedStatus: "completed" },
  });
  expect(result.evidence).toEqual([
    {
      reference: { kind: "event", eventId: event.id },
      status: "available",
      record: { kind: "normalized_event", event },
    },
  ]);
  expect(JSON.stringify(applied.state)).toBe(before);
});

test("a correction action stays historical while its record explicitly reflects the current lifecycle", () => {
  const f = fixture();
  const result = details(f.engine, f.correctionEntry.id);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: "available",
        record: {
          kind: "correction",
          version: "current_state",
          record: expect.objectContaining({
            id: "details-correction",
            lifecycle: { status: "active" },
          }),
        },
      }),
      expect.objectContaining({
        status: "available",
        record: {
          kind: "assertion",
          assertion: expect.objectContaining({
            id: "weight-remaining",
            value: 13,
            provenance: "agent_reported",
          }),
        },
      }),
    ]),
  );
  const next = correction(f.engine, f.remaining, "details-replacement", 5, 2);
  const later = details(next, f.correctionEntry.id);
  expect(later.entry.kind).toBe("correction.applied");
  expect(later.entry.observedAt).toBe(at(0));
  expect(later.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        record: {
          kind: "correction",
          version: "current_state",
          record: expect.objectContaining({
            lifecycle: expect.objectContaining({
              status: "superseded",
              supersededBy: "details-replacement",
            }),
          }),
        },
      }),
    ]),
  );
});

test("direct derived event references resolve saved changes and retain their historical progress basis", () => {
  const f = fixture();
  const progress = f.engine.progress.changes[0]!;
  const plan = f.engine.plan.changes[0]!;
  const engine = withReferences(f.engine, f.correctionEntry, [
    { kind: "event", eventId: plan.id },
    { kind: "event", eventId: progress.id },
  ]);
  const later = correction(engine, f.remaining, "details-later", 5, 2);
  const result = details(later, f.correctionEntry.id);
  expect(result.evidence).toEqual([
    {
      reference: { kind: "event", eventId: plan.id },
      status: "available",
      record: { kind: "plan_change", event: plan },
    },
    {
      reference: { kind: "event", eventId: progress.id },
      status: "available",
      record: { kind: "progress_change", event: progress },
    },
  ]);
  expect(progress.current).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 49,
  });
});

test("opaque source references stay references and missing local records are reported individually", () => {
  const f = fixture();
  const reference = {
    kind: "source" as const,
    reference: {
      sourceId: f.scope.sourceId,
      reference: "synthetic://no-follow",
    },
  };
  const refs: TimelineEntry["evidenceRefs"] = [
    reference,
    { kind: "event", eventId: "missing-event" as EventId },
    { kind: "assertion", assertionId: "missing-assertion" as AssertionId },
    { kind: "correction", correctionId: "missing-correction" as CorrectionId },
    { kind: "correction", correctionId: "details-correction" as CorrectionId },
  ];
  const result = details(
    withReferences(f.engine, f.correctionEntry, refs),
    f.correctionEntry.id,
  );
  expect(result.evidence.slice(0, 4)).toEqual([
    { reference, status: "external_reference" },
    ...refs.slice(1, 4).map((reference) => ({
      reference,
      status: "unavailable",
      reason: "not_found",
    })),
  ]);
  expect(result.evidence[4]?.status).toBe("available");
});

test("an entry outside the exact composed scope is not returned", () => {
  const f = fixture();
  expect(core.getTimelineEntryDetails(f.engine, "missing-entry")).toEqual({
    status: "not_found",
  });
  for (const patch of [
    { projectId: "other-project" as ProjectId },
    { sourceId: "other-source" as SourceId },
    { sessionId: "other-session" as core.SessionId },
  ]) {
    const engine = {
      ...f.engine,
      timeline: { entries: [{ ...f.correctionEntry, ...patch }] },
    };
    expect(core.getTimelineEntryDetails(engine, f.correctionEntry.id)).toEqual({
      status: "not_found",
    });
  }
});

test("foreign project event, assertion and correction bodies are not exposed through accidental references", () => {
  const f = fixture();
  const otherProject = "other-project" as ProjectId;
  const sourceEvent: core.NormalizedEvent<"task.status_reported"> = {
    id: "foreign-event" as EventId,
    schemaVersion: 1,
    type: "task.status_reported",
    projectId: otherProject,
    sourceId: f.scope.sourceId,
    receivedAt: at(0),
    payload: { taskId: f.done, status: "completed" },
  };
  const foreignAssertion: core.Assertion<"project.currentTask"> = {
    id: "foreign-assertion" as AssertionId,
    sourceId: f.scope.sourceId,
    observedAt: at(0),
    target: "project.currentTask",
    targetId: otherProject,
    value: f.done,
    provenance: "agent_reported",
  };
  const foreignCorrection: core.CorrectionRecord = {
    ...f.engine.plan.core.corrections[0]!,
    id: "foreign-correction" as CorrectionId,
    scope: {
      kind: "current_task",
      projectId: otherProject,
      sessionId: "s" as core.SessionId,
    },
  };
  const engine = withReferences(
    {
      ...f.engine,
      plan: {
        ...f.engine.plan,
        core: {
          ...f.engine.plan.core,
          acceptedEvents: [...f.engine.plan.core.acceptedEvents, sourceEvent],
          assertions: [...f.engine.plan.core.assertions, foreignAssertion],
          corrections: [...f.engine.plan.core.corrections, foreignCorrection],
        },
      },
    },
    f.correctionEntry,
    [
      { kind: "event", eventId: sourceEvent.id },
      { kind: "assertion", assertionId: foreignAssertion.id },
      { kind: "correction", correctionId: foreignCorrection.id },
    ],
  );
  const result = details(engine, f.correctionEntry.id);
  expect(result.evidence).toEqual(
    result.entry.evidenceRefs.map((reference) => ({
      reference,
      status: "unavailable",
      reason: "outside_project",
    })),
  );
});

test("an event ID collision across stored source and derived namespaces is explicit instead of choosing a body", () => {
  const f = fixture();
  const change = f.engine.progress.changes[0]!;
  const event: core.NormalizedEvent<"task.status_reported"> = {
    id: change.id,
    schemaVersion: 1,
    type: "task.status_reported",
    projectId: f.scope.projectId,
    sourceId: f.scope.sourceId,
    receivedAt: at(0),
    payload: { taskId: f.done, status: "verified" },
  };
  const engine = withReferences(
    {
      ...f.engine,
      plan: {
        ...f.engine.plan,
        core: {
          ...f.engine.plan.core,
          acceptedEvents: [...f.engine.plan.core.acceptedEvents, event],
        },
      },
    },
    f.correctionEntry,
    [{ kind: "event", eventId: change.id }],
  );
  expect(details(engine, f.correctionEntry.id).evidence).toEqual([
    {
      reference: { kind: "event", eventId: change.id },
      status: "unavailable",
      reason: "ambiguous_identity",
    },
  ]);
});

test("direct reference order, duplicates and pure lookup survive an in-memory JSON round trip", () => {
  const f = fixture();
  const refs = [
    ...f.correctionEntry.evidenceRefs,
    f.correctionEntry.evidenceRefs[0]!,
  ];
  const engine: ProjectEngineState = JSON.parse(
    JSON.stringify(withReferences(f.engine, f.correctionEntry, refs)),
  );
  const before = JSON.stringify(engine);
  const result = details(engine, f.correctionEntry.id);
  expect(result.evidence.map((row) => row.reference)).toEqual(refs);
  expect(details(engine, f.correctionEntry.id)).toEqual(result);
  expect(JSON.stringify(engine)).toBe(before);
});
