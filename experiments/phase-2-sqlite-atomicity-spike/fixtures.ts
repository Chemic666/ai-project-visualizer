import {
  applyNormalizedEvent,
  createCoreState,
} from "../../packages/core/src/index.js";
import type {
  Assertion,
  AssertionId,
  AssociationHeuristicScore,
  CoreState,
  CorrectionId,
  EventId,
  NormalizedEvent,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
  TaskWeight,
} from "../../packages/core/src/index.js";

// Closed synthetic typed input. No filesystem/SQLite/Agent imports or rule engine.
export function createFixtures() {
  const p = "PA" as ProjectId,
    ph = "PHA" as PhaseId,
    t = "TA" as TaskId;
  const tb = "TB" as TaskId,
    session = "SA" as SessionId,
    src = "SRC-A" as SourceId;
  const user = "FIXTURE-USER" as SourceId,
    visualizer = "FIXTURE-RULE" as SourceId;
  const time = "2026-10-09T00:00:00.000Z";
  const status = "A-STATUS" as AssertionId,
    certainty = "A-CERTAINTY" as AssertionId;
  const w1 = "A-W1" as AssertionId,
    w2 = "A-W2" as AssertionId,
    w3 = "A-W3" as AssertionId;
  const current = "A-CURRENT" as AssertionId,
    association = "A-ASSOC" as AssertionId;
  const c1 = "C1" as CorrectionId,
    c2 = "C2" as CorrectionId;
  const common = { sourceId: user, observedAt: time };
  const assertions: readonly Assertion[] = [
    {
      id: status,
      target: "task.status",
      targetId: t,
      value: "in_progress",
      provenance: "agent_reported",
      sourceId: src,
      observedAt: time,
    },
    {
      ...common,
      id: certainty,
      target: "task.certainty",
      targetId: t,
      value: "confirmed",
      provenance: "user_confirmed",
    },
    {
      id: w1,
      target: "task.weight",
      targetId: t,
      value: 1 as TaskWeight,
      provenance: "agent_reported",
      sourceId: src,
      observedAt: time,
    },
    {
      ...common,
      id: w2,
      target: "task.weight",
      targetId: t,
      value: 2 as TaskWeight,
      provenance: "user_confirmed",
    },
    {
      ...common,
      id: association,
      target: "session.projectAssociation",
      targetId: session,
      value: p,
      provenance: "user_confirmed",
    },
    {
      id: current,
      target: "project.currentTask",
      targetId: p,
      value: t,
      provenance: "visualizer_inferred",
      sourceId: visualizer,
      observedAt: time,
      inference: {
        kind: "current_task_association",
        ruleId: "fixture-only",
        ruleVersion: "1",
        evaluatedAt: time,
        evidenceRefs: [{ kind: "assertion", assertionId: status }],
        associationConfidence: {
          heuristicScore: 70 as AssociationHeuristicScore,
        },
      },
    },
  ];
  const before = createCoreState({
    projects: [
      {
        id: p,
        name: "Synthetic atomic fixture",
        locations: [],
        phaseIds: [ph],
        currentTaskAssertionIds: [current],
        currentPhaseAssertionIds: [],
      },
    ],
    phases: [
      {
        id: ph,
        projectId: p,
        title: "Fixture",
        taskIds: [t, tb],
        statusAssertionIds: [],
      },
    ],
    tasks: [
      {
        id: t,
        phaseId: ph,
        title: "Target",
        statusAssertionIds: [status],
        certaintyAssertionIds: [certainty],
        weightAssertionIds: [w1, w2],
      },
      {
        id: tb,
        phaseId: ph,
        title: "Other",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: [],
      },
    ],
    sessions: [
      {
        id: session,
        sourceId: src,
        sourceSessionId: "fixture-session",
        projectAssociationAssertionIds: [association],
      },
    ],
    assertions,
    corrections: [
      {
        id: c1,
        scope: {
          kind: "task_weight",
          projectId: p,
          sessionId: session,
          taskId: t,
        },
        originalAssertionId: w1,
        correctedAssertionId: w2,
        effectiveAt: time,
        lifecycle: { status: "active" },
      },
    ],
    resolvedConclusions: [
      {
        target: "task.weight",
        targetId: t,
        selectedAssertionId: w2,
        supportingAssertionIds: [],
        conflictingAssertionIds: [w1],
        resolution: {
          resolvedAt: time,
          ruleId: "trusted-fixture-image",
          ruleVersion: "1",
          reason: "Explicit seed, not resolution execution",
        },
      },
    ],
  });
  const event: NormalizedEvent<"task.status_reported"> = {
    id: "E1" as EventId,
    schemaVersion: 1,
    projectId: p,
    sessionId: session,
    sourceId: src,
    sourceIdentity: {
      kind: "source_event",
      sourceId: src,
      sourceEventId: "K1",
    },
    receivedAt: time,
    type: "task.status_reported",
    payload: { taskId: t, status: "completed" },
  };
  const applied = applyNormalizedEvent(before, event);
  if (applied.status !== "applied") throw new Error("FIXTURE_CORE_REJECTED");
  const manual: Assertion<"task.weight"> = {
    ...common,
    id: w3,
    target: "task.weight",
    targetId: t,
    value: 3 as TaskWeight,
    provenance: "user_confirmed",
  };
  // Trusted manual images deliberately added to the persistence candidate.
  // The event does NOT expire/supersede the correction; no Correction Engine runs.
  const after: CoreState = createCoreState({
    ...applied.state,
    assertions: [...applied.state.assertions, manual],
    tasks: applied.state.tasks.map((task) =>
      task.id === t
        ? { ...task, weightAssertionIds: [...task.weightAssertionIds, w3] }
        : task,
    ),
    corrections: [
      {
        ...before.corrections[0]!,
        lifecycle: {
          status: "superseded",
          supersededBy: c2,
          supersededAt: time,
          reasonCode: "trusted_manual_fixture",
          ruleId: "fixture-image",
          ruleVersion: "1",
        },
      },
      {
        id: c2,
        scope: {
          kind: "task_weight",
          projectId: p,
          sessionId: session,
          taskId: t,
        },
        originalAssertionId: w2,
        correctedAssertionId: w3,
        effectiveAt: time,
        supersedes: c1,
        lifecycle: { status: "active" },
      },
    ],
    resolvedConclusions: [
      {
        ...before.resolvedConclusions[0]!,
        selectedAssertionId: w3,
        supportingAssertionIds: [w2],
        conflictingAssertionIds: [w1],
      },
    ],
  });
  const checkpoint = {
    sourceId: src,
    stream: "fixture",
    codec: "fixture-complete-unit-v1",
    position: "UNIT-1",
    coveredEventIds: [event.id],
    ledgerSequence: 2,
  };
  return {
    projectId: p,
    generation: "G1",
    before,
    after,
    event,
    checkpoint,
    operationId: "OP-E1",
    base: 1,
  };
}
