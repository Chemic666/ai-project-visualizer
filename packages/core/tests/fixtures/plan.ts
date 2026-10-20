import { createCoreState } from "../../src/index.js";
import type {
  EventId,
  NormalizedEvent,
  PlanInput,
  ProjectId,
  SourceId,
} from "../../src/index.js";

export const planProject = "synthetic-plan-project" as ProjectId;
export const planSource = "synthetic-plan-source" as SourceId;

export function planCore() {
  return createCoreState({
    projects: [
      {
        id: planProject,
        name: "Synthetic plan",
        locations: [],
        phaseIds: [],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
    ],
  });
}

export function planEvent(
  id: string,
  payload: Partial<PlanInput> = {},
  envelope: Partial<NormalizedEvent<"plan.updated">> = {},
): NormalizedEvent<"plan.updated"> {
  return {
    id: id as EventId,
    type: "plan.updated",
    schemaVersion: 1,
    projectId: planProject,
    sourceId: planSource,
    receivedAt: "2026-10-20T04:00:00.000Z",
    payload: {
      planId: "synthetic-plan",
      provenance: "agent_reported",
      completeness: "complete",
      steps: [
        { sourceItemId: "a", title: "First", certainty: "confirmed" },
        { sourceItemId: "b", title: "Second", certainty: "tentative" },
        { sourceItemId: "c", title: "Third", certainty: "idea" },
      ],
      ...payload,
    },
    ...envelope,
  };
}
