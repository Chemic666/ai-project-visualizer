import { getUserCorrectedCurrentTask } from "./correction-engine.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  TaskId,
} from "./domain/ids.js";
import type { PlanEngineState, PlanPhase, PlanScope } from "./domain/plan.js";
import { getPlanSnapshot } from "./plan-engine.js";
import { getSession } from "./queries.js";

export type CurrentPhaseResult =
  | {
      readonly status: "unknown";
      readonly reason:
        | "session_unknown"
        | "session_ended"
        | "current_task_unknown"
        | "plan_unavailable"
        | "membership_unavailable";
    }
  | {
      readonly status: "ambiguous";
      readonly reason: "current_task_conflict" | "plan_ambiguous";
    }
  | {
      readonly status: "available";
      readonly phase: PlanPhase;
      readonly taskId: TaskId;
      readonly taskTitle: string;
      readonly origin: "core_derived";
      readonly ruleId: "core.current-phase.from-current-task";
      readonly ruleVersion: "1";
      readonly evidence: {
        readonly planRevisionEventId: EventId;
        readonly planObservedAt: string;
        readonly taskAssertionId: AssertionId;
        readonly correctionId: CorrectionId;
        readonly confirmedAt: string;
      };
    };

/** Derive from the existing user correction only. This query does not select a task or write an assertion. */
export function getCurrentPhaseFromCorrection(
  state: PlanEngineState,
  scope: PlanScope,
): CurrentPhaseResult {
  const { sessionId, projectId } = scope;
  const core = state.core;
  const session =
    sessionId === undefined ? undefined : getSession(core, sessionId);
  if (session === undefined)
    return { status: "unknown", reason: "session_unknown" };

  const observations = core.acceptedEvents.filter(
    (event) =>
      (event.type === "session.started" || event.type === "session.ended") &&
      event.projectId === projectId &&
      event.sourceId === session.sourceId &&
      event.payload.sessionId === session.id,
  );
  if (observations.some((event) => event.type === "session.ended"))
    return { status: "unknown", reason: "session_ended" };
  if (!observations.some((event) => event.type === "session.started"))
    return { status: "unknown", reason: "session_unknown" };

  const current = getUserCorrectedCurrentTask(core, projectId, session.id);
  if (current.status !== "available")
    return current.status === "conflict"
      ? { status: "ambiguous", reason: "current_task_conflict" }
      : { status: "unknown", reason: "current_task_unknown" };

  const plan = getPlanSnapshot(state, scope);
  if (plan.status !== "available")
    return plan.status === "ambiguous"
      ? { status: "ambiguous", reason: "plan_ambiguous" }
      : { status: "unknown", reason: "plan_unavailable" };
  const { snapshot } = plan;
  const entry = snapshot.entries.find(
    ({ taskId }) => taskId === current.taskId,
  );
  const phase = snapshot.phases.find(
    ({ phaseId }) => phaseId === entry?.phaseId,
  );
  if (entry === undefined || phase === undefined)
    return { status: "unknown", reason: "membership_unavailable" };
  const event = core.acceptedEvents.find(
    (event) =>
      event.id === snapshot.eventId &&
      (event.type === "plan.detected" || event.type === "plan.updated") &&
      event.projectId === projectId &&
      event.sessionId === sessionId &&
      event.sourceId === scope.sourceId &&
      event.payload.planId === scope.planId,
  );
  if (event === undefined)
    return { status: "unknown", reason: "plan_unavailable" };
  return {
    status: "available",
    phase,
    taskId: entry.taskId,
    taskTitle: entry.title,
    origin: "core_derived",
    ruleId: "core.current-phase.from-current-task",
    ruleVersion: "1",
    evidence: {
      planRevisionEventId: snapshot.eventId,
      planObservedAt: event.receivedAt,
      taskAssertionId: current.assertion.id,
      correctionId: current.correction.id,
      confirmedAt: current.correction.effectiveAt,
    },
  };
}
