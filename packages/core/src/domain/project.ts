import type { AssertionId, PhaseId, ProjectId } from "./ids.js";

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  // Location metadata is supplied by a boundary; Core does not inspect paths.
  readonly locations: readonly string[];
  readonly phaseIds: readonly PhaseId[];
  // References preserve independent evidence; they do not select a conclusion.
  readonly currentTaskAssertionIds: readonly AssertionId[];
  readonly currentPhaseAssertionIds: readonly AssertionId[];
}
