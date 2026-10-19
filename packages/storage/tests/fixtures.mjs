export const time = "2026-10-19T00:00:00.000Z";
export function seed() {
  return {
    projects: [
      {
        id: "PA",
        name: "Synthetic",
        locations: [],
        phaseIds: ["PH"],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
    ],
    phases: [
      {
        id: "PH",
        projectId: "PA",
        title: "Phase",
        taskIds: ["TA"],
        statusAssertionIds: [],
      },
    ],
    tasks: [
      {
        id: "TA",
        phaseId: "PH",
        title: "Task",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: ["WA", "WB"],
      },
    ],
    sessions: [],
    assertions: [1, 2].map((weight, i) => ({
      id: i ? "WB" : "WA",
      sourceId: "USER",
      observedAt: time,
      target: "task.weight",
      targetId: "TA",
      value: weight,
      provenance: "user_confirmed",
    })),
    corrections: [
      {
        id: "C1",
        scope: { kind: "task_weight", projectId: "PA", taskId: "TA" },
        originalAssertionId: "WA",
        correctedAssertionId: "WB",
        effectiveAt: time,
        lifecycle: { status: "active" },
      },
    ],
    resolvedConclusions: [
      {
        target: "task.weight",
        targetId: "TA",
        selectedAssertionId: "WB",
        supportingAssertionIds: ["WB"],
        conflictingAssertionIds: ["WA"],
        resolution: {
          ruleId: "trusted.fixture",
          ruleVersion: "1",
          reason: "Trusted initial correction",
          resolvedAt: time,
        },
      },
    ],
    acceptedEvents: [],
  };
}
export function input(id = "E1", identity = true) {
  return {
    id,
    schemaVersion: 1,
    projectId: "PA",
    sourceId: "SRC",
    receivedAt: time,
    ...(identity
      ? {
          sourceIdentity: {
            kind: "source_event",
            sourceId: "SRC",
            sourceEventId: "source:" + id,
          },
        }
      : {}),
    type: "task.status_reported",
    payload: { taskId: "TA", status: "completed" },
  };
}
export function cursor(ids, position = "batch:1", previous = null) {
  return {
    sourceId: "SRC",
    streamId: "stream",
    codec: "synthetic.v1",
    position,
    expectedPrevious: previous,
    coveredEventIds: ids,
  };
}
