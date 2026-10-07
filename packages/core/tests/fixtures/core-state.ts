import { createCoreState } from "../../src/index.js";
import type {
  EventId,
  NormalizedEvent,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "../../src/index.js";

export const projectId = "project-1" as ProjectId;
export const phaseId = "phase-1" as PhaseId;
export const taskId = "task-1" as TaskId;
export const otherProjectId = "project-2" as ProjectId;
export const otherPhaseId = "phase-2" as PhaseId;
export const otherTaskId = "task-2" as TaskId;
export const sourceId = "source-1" as SourceId;
export const sessionId = "session-1" as SessionId;

export function createHierarchyFixture() {
  return createCoreState({
    projects: [
      {
        id: projectId,
        name: "Core fixture",
        locations: [],
        phaseIds: [phaseId],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
      {
        id: otherProjectId,
        name: "Other project",
        locations: [],
        phaseIds: [otherPhaseId],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
    ],
    phases: [
      {
        id: phaseId,
        projectId,
        title: "Foundation",
        taskIds: [taskId],
        statusAssertionIds: [],
      },
      {
        id: otherPhaseId,
        projectId: otherProjectId,
        title: "Other phase",
        taskIds: [otherTaskId],
        statusAssertionIds: [],
      },
    ],
    tasks: [
      {
        id: taskId,
        phaseId,
        title: "Core runtime",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: [],
      },
      {
        id: otherTaskId,
        phaseId: otherPhaseId,
        title: "Other task",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: [],
      },
    ],
  });
}

export function createStatusEvent(
  overrides: Partial<NormalizedEvent<"task.status_reported">> = {},
): NormalizedEvent<"task.status_reported"> {
  return {
    id: "event-1" as EventId,
    schemaVersion: 1,
    projectId,
    sourceId,
    receivedAt: "2026-10-07T10:00:00.000Z",
    type: "task.status_reported",
    payload: { taskId, status: "completed" },
    ...overrides,
  };
}
