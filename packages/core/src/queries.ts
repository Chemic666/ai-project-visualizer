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

export function findSessionStart(
  state: CoreState,
  projectId: ProjectId,
  sessionId: SessionId | undefined,
):
  | { readonly status: "session_unknown" | "session_ended" }
  | {
      readonly status: "started";
      readonly id: SessionId;
      readonly index: number;
    } {
  const session =
    sessionId === undefined ? undefined : getSession(state, sessionId);
  if (session === undefined) return { status: "session_unknown" };

  let index = -1;
  for (const [position, event] of state.acceptedEvents.entries()) {
    if (
      (event.type !== "session.started" && event.type !== "session.ended") ||
      event.projectId !== projectId ||
      event.sourceId !== session.sourceId ||
      event.payload.sessionId !== session.id
    )
      continue;
    if (event.type === "session.ended") return { status: "session_ended" };
    if (index < 0) index = position;
  }
  return index < 0
    ? { status: "session_unknown" }
    : { status: "started", id: session.id, index };
}
