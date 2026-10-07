import type { AssertionId, PhaseId, TaskId } from "./ids.js";

export interface Task {
  readonly id: TaskId;
  readonly phaseId: PhaseId;
  readonly title: string;
  // Per-field references can retain multiple sources and their history.
  // Empty collections mean no evidence; they do not imply todo or confirmed.
  readonly statusAssertionIds: readonly AssertionId[];
  readonly certaintyAssertionIds: readonly AssertionId[];
  readonly weightAssertionIds: readonly AssertionId[];
}
