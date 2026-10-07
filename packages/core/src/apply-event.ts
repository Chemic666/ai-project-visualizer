import type { Assertion } from "./domain/assertion.js";
import type { AssertionId } from "./domain/ids.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import {
  getAssertion,
  getPhase,
  getProject,
  getSession,
  getTask,
  hasProcessedEvent,
} from "./queries.js";
import type { CoreState } from "./state.js";

export type EventRejectionReason =
  | "project_not_found"
  | "source_namespace_mismatch"
  | "session_id_mismatch"
  | "session_source_mismatch"
  | "task_not_found"
  | "task_project_mismatch"
  | "assertion_id_collision";

export type EventApplicationResult = { readonly state: CoreState } & (
  | { readonly status: "applied" }
  | {
      readonly status: "duplicate";
      readonly reason: "internal_event_id" | "stable_source_event";
    }
  | { readonly status: "rejected"; readonly reason: EventRejectionReason }
);

// Typed, normalized input only; not a general validator for untrusted raw data.
// Minimal ownership validation precedes replay checks. Rejections and duplicates
// leave the input snapshot and its accepted-event ledger untouched.
export function applyNormalizedEvent(
  state: CoreState,
  event: NormalizedEvent,
): EventApplicationResult {
  const project = getProject(state, event.projectId);
  if (project === undefined) {
    return { status: "rejected", reason: "project_not_found", state };
  }
  if (
    event.sourceIdentity !== undefined &&
    event.sourceIdentity.sourceId !== event.sourceId
  ) {
    return { status: "rejected", reason: "source_namespace_mismatch", state };
  }

  if (event.type === "session.started" || event.type === "session.ended") {
    if (
      event.sessionId !== undefined &&
      event.sessionId !== event.payload.sessionId
    ) {
      return { status: "rejected", reason: "session_id_mismatch", state };
    }
    const reference = event.payload.sourceSessionReference;
    if (reference !== undefined && reference.sourceId !== event.sourceId) {
      return { status: "rejected", reason: "source_namespace_mismatch", state };
    }
    const session = getSession(state, event.payload.sessionId);
    if (session !== undefined && session.sourceId !== event.sourceId) {
      return { status: "rejected", reason: "session_source_mismatch", state };
    }
  }

  const task =
    event.type === "task.status_reported"
      ? getTask(state, event.payload.taskId)
      : undefined;
  if (event.type === "task.status_reported") {
    if (task === undefined) {
      return { status: "rejected", reason: "task_not_found", state };
    }
    const phase = getPhase(state, task.phaseId);
    if (
      phase === undefined ||
      phase.projectId !== project.id ||
      !project.phaseIds.includes(phase.id) ||
      !phase.taskIds.includes(task.id)
    ) {
      return { status: "rejected", reason: "task_project_mismatch", state };
    }
  }

  if (hasProcessedEvent(state, event.id)) {
    return { status: "duplicate", reason: "internal_event_id", state };
  }
  const identity = event.sourceIdentity;
  if (
    identity?.kind === "source_event" &&
    state.acceptedEvents.some(
      (accepted) =>
        accepted.sourceId === event.sourceId &&
        accepted.sourceIdentity?.kind === "source_event" &&
        accepted.sourceIdentity.sourceEventId === identity.sourceEventId,
    )
  ) {
    return { status: "duplicate", reason: "stable_source_event", state };
  }
  // Cursors may identify batches/positions. With a cursor or no stable source
  // identity, a newly normalized EventId is accepted again: no exactly-once claim.

  let tasks = state.tasks;
  let assertions = state.assertions;
  let sessions = state.sessions;

  if (event.type === "task.status_reported" && task !== undefined) {
    // Deterministic, injective derivation from the internal EventId for this
    // effect. The fixed nonempty prefix guarantees it differs from that EventId;
    // no source event/cursor identity, clock or randomness supplies this ID.
    const assertionId = `core:assertion:task.status:${event.id}` as AssertionId;
    if (getAssertion(state, assertionId) !== undefined) {
      return { status: "rejected", reason: "assertion_id_collision", state };
    }
    const assertion: Assertion<"task.status"> = {
      id: assertionId,
      target: "task.status",
      targetId: task.id,
      value: event.payload.status,
      provenance: "agent_reported",
      sourceId: event.sourceId,
      eventId: event.id,
      observedAt: event.receivedAt,
      // occurredAt is source-claimed without a reliability indicator. Preserve
      // it on the accepted event, but do not invent a reliable assertedAt here.
    };
    assertions = [...assertions, assertion];
    tasks = tasks.map((existing) =>
      existing.id === task.id
        ? {
            ...existing,
            statusAssertionIds: [...existing.statusAssertionIds, assertionId],
          }
        : existing,
    );
  }

  if (
    event.type === "session.started" &&
    getSession(state, event.payload.sessionId) === undefined
  ) {
    sessions = [
      ...sessions,
      {
        id: event.payload.sessionId,
        sourceId: event.sourceId,
        // Revision-only references cannot populate an external session identity.
        // The full namespaced reference/revision remains on the accepted event.
        sourceSessionId:
          event.payload.sourceSessionReference?.reference ?? null,
        projectAssociationAssertionIds: [],
      },
    ];
  }
  // Plan inputs and session.ended are retained, without lifecycle, plan,
  // hierarchy reconciliation or resolution effects. Existing conclusions remain.
  return {
    status: "applied",
    state: {
      ...state,
      tasks,
      assertions,
      sessions,
      acceptedEvents: [...state.acceptedEvents, event],
    },
  };
}
