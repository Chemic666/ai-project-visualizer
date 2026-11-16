import { getUserCorrectedCurrentTask } from "./correction-engine.js";
import type { Assertion } from "./domain/assertion.js";
import type { AssertionId, EventId, TaskId } from "./domain/ids.js";
import type { AssociationHeuristicScore } from "./domain/inference.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type { PlanEngineState, PlanScope } from "./domain/plan.js";
import { getPlanSnapshot } from "./plan-engine.js";
import { findSessionStart } from "./queries.js";

interface Candidate {
  readonly taskId: TaskId;
  readonly taskTitle: string;
  readonly reportEventId: EventId;
  readonly conflictingEventId?: EventId;
}
type InferredTaskAssertion = Extract<
  Assertion<"project.currentTask">,
  { provenance: "visualizer_inferred" }
>;
export type CurrentTaskAssociation =
  | {
      readonly status: "unknown";
      readonly reason:
        | "session_unknown"
        | "session_ended"
        | "plan_unknown"
        | "plan_incomplete"
        | "no_in_progress_report";
    }
  | {
      readonly status: "ambiguous";
      readonly reason:
        | "correction_conflict"
        | "plan_ambiguous"
        | "multiple_in_progress"
        | "conflicting_reports";
      readonly candidates: readonly Candidate[];
    }
  | {
      readonly status: "confirmed";
      readonly taskId: TaskId;
      readonly assertion: Assertion<"project.currentTask">;
    }
  | (Candidate & {
      readonly status: "likely";
      readonly planRevisionEventId: EventId;
      readonly assertion: InferredTaskAssertion;
    });

type StatusReport = NormalizedEvent<"task.status_reported">;

function atOrBeforeSourceBoundary(
  event: StatusReport,
  boundary: NormalizedEvent,
) {
  const reportSequence = event.sourceSequence;
  const boundarySequence = boundary.sourceSequence;
  return (
    event.sourceId === boundary.sourceId &&
    reportSequence !== undefined &&
    boundarySequence !== undefined &&
    Number.isSafeInteger(reportSequence) &&
    Number.isSafeInteger(boundarySequence) &&
    reportSequence >= 0 &&
    boundarySequence >= 0 &&
    reportSequence <= boundarySequence
  );
}

// Synthetic reports can be compared with the active revision using their
// receipt window. A known older source sequence excludes a delayed report.
export function getCurrentTaskAssociation(
  state: PlanEngineState,
  scope: PlanScope,
): CurrentTaskAssociation {
  const { projectId, sessionId, sourceId, planId } = scope;
  const { core } = state;
  const session = findSessionStart(core, projectId, sessionId);
  if (session.status !== "started")
    return { status: "unknown", reason: session.status };

  const correction = getUserCorrectedCurrentTask(core, projectId, session.id);
  if (correction.status === "available")
    return {
      status: "confirmed",
      taskId: correction.taskId,
      assertion: correction.assertion,
    };
  if (correction.status === "conflict")
    return {
      status: "ambiguous",
      reason: "correction_conflict",
      candidates: [],
    };

  const plan = getPlanSnapshot(state, scope);
  if (plan.status === "ambiguous")
    return { status: "ambiguous", reason: "plan_ambiguous", candidates: [] };
  if (plan.status !== "available")
    return { status: "unknown", reason: "plan_unknown" };
  const { snapshot } = plan;
  if (snapshot.completeness !== "complete")
    return { status: "unknown", reason: "plan_incomplete" };
  const planIndex = core.acceptedEvents.findIndex(
    (event) =>
      event.id === snapshot.eventId &&
      (event.type === "plan.detected" || event.type === "plan.updated") &&
      event.projectId === projectId &&
      event.sessionId === sessionId &&
      event.sourceId === sourceId &&
      event.payload.planId === planId,
  );
  if (planIndex < 0) return { status: "unknown", reason: "plan_unknown" };

  const start = Math.max(planIndex, session.index);
  const planEvent = core.acceptedEvents[planIndex]!;
  const sessionEvent = core.acceptedEvents[session.index]!;
  const since = Math.max(
    Date.parse(planEvent.receivedAt),
    Date.parse(sessionEvent.receivedAt),
  );
  const inProgress = new Map<TaskId, StatusReport>();
  const other = new Map<TaskId, StatusReport>();
  for (const event of core.acceptedEvents.slice(start + 1)) {
    if (
      event.type !== "task.status_reported" ||
      event.projectId !== projectId ||
      event.sessionId !== sessionId ||
      event.sourceId !== sourceId ||
      !(Date.parse(event.receivedAt) >= since) ||
      atOrBeforeSourceBoundary(event, planEvent) ||
      atOrBeforeSourceBoundary(event, sessionEvent)
    )
      continue;
    const reports = event.payload.status === "in_progress" ? inProgress : other;
    if (!reports.has(event.payload.taskId))
      reports.set(event.payload.taskId, event);
  }

  const candidates = snapshot.entries.flatMap((entry): Candidate[] => {
    const report = inProgress.get(entry.taskId);
    if (entry.certainty !== "confirmed" || report === undefined) return [];
    const conflict = other.get(entry.taskId);
    return [
      {
        taskId: entry.taskId,
        taskTitle: entry.title,
        reportEventId: report.id,
        ...(conflict === undefined ? {} : { conflictingEventId: conflict.id }),
      },
    ];
  });
  if (candidates.length > 1)
    return { status: "ambiguous", reason: "multiple_in_progress", candidates };
  const candidate = candidates[0];
  if (candidate === undefined)
    return { status: "unknown", reason: "no_in_progress_report" };
  if (candidate.conflictingEventId !== undefined)
    return { status: "ambiguous", reason: "conflicting_reports", candidates };

  const report = inProgress.get(candidate.taskId)!;
  return {
    ...candidate,
    status: "likely",
    planRevisionEventId: snapshot.eventId,
    assertion: {
      id: ("core:assertion:project.currentTask:" +
        JSON.stringify([snapshot.eventId, report.id])) as AssertionId,
      target: "project.currentTask",
      targetId: projectId,
      value: candidate.taskId,
      provenance: "visualizer_inferred",
      sourceId: report.sourceId,
      eventId: report.id,
      observedAt: report.receivedAt,
      inference: {
        kind: "current_task_association",
        ruleId: "core.current-task.reported-in-progress",
        ruleVersion: "1",
        evaluatedAt: report.receivedAt,
        // A fixed heuristic for one scoped report, with no empirical calibration.
        associationConfidence: {
          heuristicScore: 55 as AssociationHeuristicScore,
        },
        evidenceRefs: [
          { kind: "event", eventId: report.id },
          { kind: "event", eventId: snapshot.eventId },
        ],
      },
    },
  };
}
