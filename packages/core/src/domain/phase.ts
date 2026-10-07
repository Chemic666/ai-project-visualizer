import type { AssertionId, PhaseId, ProjectId, TaskId } from "./ids.js";

export interface Phase {
  readonly id: PhaseId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly taskIds: readonly TaskId[];
  readonly statusAssertionIds: readonly AssertionId[];
}
