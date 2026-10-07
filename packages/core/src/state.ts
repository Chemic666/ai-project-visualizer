import type { Assertion } from "./domain/assertion.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type { Phase } from "./domain/phase.js";
import type { Project } from "./domain/project.js";
import type { ResolvedConclusion } from "./domain/resolved-conclusion.js";
import type { Session } from "./domain/session.js";
import type { Task } from "./domain/task.js";

export interface CoreState {
  readonly projects: readonly Project[];
  readonly phases: readonly Phase[];
  readonly tasks: readonly Task[];
  readonly sessions: readonly Session[];
  readonly assertions: readonly Assertion[];
  readonly resolvedConclusions: readonly ResolvedConclusion[];
  // Accepted events also serve as the minimal replay ledger. No redundant
  // index or runtime-only collection is needed at this in-process stage.
  readonly acceptedEvents: readonly NormalizedEvent[];
}

// Initial data is trusted, immutable fixture/state input, not an import boundary.
// This constructor does not resolve Assertions or validate an entire snapshot.
export function createCoreState(initial: Partial<CoreState> = {}): CoreState {
  return {
    projects: initial.projects ?? [],
    phases: initial.phases ?? [],
    tasks: initial.tasks ?? [],
    sessions: initial.sessions ?? [],
    assertions: initial.assertions ?? [],
    resolvedConclusions: initial.resolvedConclusions ?? [],
    acceptedEvents: initial.acceptedEvents ?? [],
  };
}
