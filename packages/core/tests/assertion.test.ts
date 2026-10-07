import { expect, test } from "vitest";

import { PROVENANCES } from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  AssociationHeuristicScore,
  EventId,
  InferenceHeuristicScore,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  SourceReference,
  TaskId,
  TaskWeight,
} from "../src/index.js";

const sourceId = "source-alpha" as SourceId;
const observedAt = "2026-10-07T10:00:00.000Z";
const taskId = "task-1" as TaskId;
const projectId = "project-1" as ProjectId;
const phaseId = "phase-1" as PhaseId;
const sourceReference: SourceReference = {
  sourceId,
  reference: "opaque-record-17",
  revision: "opaque-revision-2",
};
const common = {
  id: "assertion-1" as AssertionId,
  sourceId,
  observedAt,
  sourceReference,
  eventId: "event-1" as EventId,
} as const;

test("exposes exactly the four provenance values", () => {
  expect(PROVENANCES).toEqual([
    "observed",
    "agent_reported",
    "visualizer_inferred",
    "user_confirmed",
  ]);
});

test("constructs all target contracts as JSON-compatible plain data", () => {
  const assertions: readonly Assertion[] = [
    {
      ...common,
      target: "task.status",
      targetId: taskId,
      value: "completed",
      provenance: "agent_reported",
    },
    {
      ...common,
      id: "assertion-2" as AssertionId,
      target: "task.certainty",
      targetId: taskId,
      value: "confirmed",
      provenance: "observed",
    },
    {
      ...common,
      id: "assertion-3" as AssertionId,
      target: "task.weight",
      targetId: taskId,
      value: 2 as TaskWeight,
      provenance: "user_confirmed",
    },
    {
      ...common,
      id: "assertion-4" as AssertionId,
      target: "phase.status",
      targetId: phaseId,
      value: "in_progress",
      provenance: "agent_reported",
    },
    {
      ...common,
      id: "assertion-5" as AssertionId,
      target: "project.currentTask",
      targetId: projectId,
      value: taskId,
      provenance: "user_confirmed",
    },
    {
      ...common,
      id: "assertion-6" as AssertionId,
      target: "project.currentPhase",
      targetId: projectId,
      value: phaseId,
      provenance: "user_confirmed",
    },
    {
      ...common,
      id: "assertion-7" as AssertionId,
      target: "session.projectAssociation",
      targetId: "session-1" as SessionId,
      value: projectId,
      provenance: "user_confirmed",
    },
  ];

  expect(JSON.parse(JSON.stringify(assertions))).toEqual(assertions);
  expect(new Set(assertions.map((assertion) => assertion.id)).size).toBe(7);
  for (const assertion of assertions) {
    expect(Object.getPrototypeOf(assertion)).toBe(Object.prototype);
    expect(assertion.sourceReference?.sourceId).toBe(assertion.sourceId);
  }
  const weight = assertions.find(
    (assertion) => assertion.target === "task.weight",
  );
  expect(weight?.value).toBeGreaterThan(0);
  expect(Number.isFinite(weight?.value)).toBe(true);
});

test("records rule, version, evaluation time and evidence for each inference", () => {
  // Metadata fixtures only: these rule names and scores define no algorithm.
  const inferredStatus: Assertion<"task.status"> = {
    ...common,
    target: "task.status",
    targetId: taskId,
    value: "in_progress",
    provenance: "visualizer_inferred",
    inference: {
      kind: "assertion_inference",
      ruleId: "fixture-status-rule",
      ruleVersion: "1",
      evaluatedAt: observedAt,
      evidenceRefs: [{ kind: "event", eventId: common.eventId }],
      inferenceConfidence: { heuristicScore: 60 as InferenceHeuristicScore },
    },
  };
  const inferredAssociation: Assertion<"project.currentTask"> = {
    ...common,
    id: "assertion-association" as AssertionId,
    target: "project.currentTask",
    targetId: projectId,
    value: taskId,
    provenance: "visualizer_inferred",
    inference: {
      kind: "current_task_association",
      ruleId: "fixture-association-rule",
      ruleVersion: "2",
      evaluatedAt: observedAt,
      evidenceRefs: [
        { kind: "assertion", assertionId: inferredStatus.id },
        { kind: "source", reference: sourceReference },
      ],
      associationConfidence: {
        heuristicScore: 80 as AssociationHeuristicScore,
      },
    },
  };

  expect(
    JSON.parse(JSON.stringify([inferredStatus, inferredAssociation])),
  ).toEqual([inferredStatus, inferredAssociation]);
  expect(inferredStatus.inference.ruleVersion).toBe("1");
  expect(inferredStatus.inference.evidenceRefs).toEqual([
    { kind: "event", eventId: common.eventId },
  ]);
  expect(
    inferredAssociation.inference.associationConfidence.heuristicScore,
  ).toBe(80);
});

test("keeps the receipt of an Agent completion statement separate from its claim", () => {
  const reported: Assertion<"task.status"> = {
    ...common,
    target: "task.status",
    targetId: taskId,
    value: "completed",
    provenance: "agent_reported",
    assertedAt: "2026-10-07T09:59:59.000Z",
  };
  // Directly reading a formal plan establishes plan certainty, not completion.
  const observed: Assertion<"task.certainty"> = {
    ...common,
    id: "assertion-plan" as AssertionId,
    target: "task.certainty",
    targetId: taskId,
    value: "confirmed",
    provenance: "observed",
  };

  expect(reported.observedAt).toBe(observedAt);
  expect(reported.provenance).toBe("agent_reported");
  expect(reported.value).toBe("completed");
  expect(reported.value).not.toBe("verified");
  expect(observed.provenance).toBe("observed");
});

test("namespaces opaque source references and preserves revision-only records", () => {
  const revisionOnly: SourceReference = {
    sourceId: "source-beta" as SourceId,
    revision: "opaque-revision-2",
  };

  expect(revisionOnly.sourceId).not.toBe(sourceReference.sourceId);
  expect(JSON.parse(JSON.stringify(revisionOnly))).toEqual(revisionOnly);
  expect(sourceReference.reference).not.toBe(common.eventId);
});
