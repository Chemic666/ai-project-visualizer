import type { Assertion, AssertionTarget } from "./domain/assertion.js";
import type {
  AssertionId,
  EventId,
  PhaseId,
  ProjectId,
  SessionId,
  TaskId,
} from "./domain/ids.js";
import type { CoreState } from "./state.js";

export function getProject(state: CoreState, id: ProjectId) {
  return state.projects.find((project) => project.id === id);
}

export function getPhase(state: CoreState, id: PhaseId) {
  return state.phases.find((phase) => phase.id === id);
}

export function getTask(state: CoreState, id: TaskId) {
  return state.tasks.find((task) => task.id === id);
}

export function getSession(state: CoreState, id: SessionId) {
  return state.sessions.find((session) => session.id === id);
}

export function getAssertion(state: CoreState, id: AssertionId) {
  return state.assertions.find((assertion) => assertion.id === id);
}

export function getAssertionsForTarget<Target extends AssertionTarget>(
  state: CoreState,
  target: Target,
  targetId: NoInfer<Assertion<Target>["targetId"]>,
): readonly Assertion<Target>[];
export function getAssertionsForTarget(
  state: CoreState,
  target: AssertionTarget,
  targetId: Assertion["targetId"],
): readonly Assertion[] {
  return state.assertions.filter(
    (assertion) =>
      assertion.target === target && assertion.targetId === targetId,
  );
}

// Only accepted internal IDs are recorded. A rejected or source-deduplicated
// event's new internal ID is not added to this ledger.
export function hasProcessedEvent(state: CoreState, id: EventId): boolean {
  return state.acceptedEvents.some((event) => event.id === id);
}
