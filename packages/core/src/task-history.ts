import type { Assertion } from "./domain/assertion.js";
import type { CorrectionRecord } from "./domain/correction.js";
import type { EventId, TaskId } from "./domain/ids.js";
import type {
  PlanEngineState,
  PlanEntry,
  PlanIssue,
  PlanScope,
} from "./domain/plan.js";
import type { TimelineReference } from "./domain/timeline-reference.js";
import { getPlanSnapshot } from "./plan-engine.js";

export interface TaskPlanHistoryEntry {
  readonly eventId: EventId;
  readonly previousEventId?: EventId;
  readonly observedAt?: string;
  readonly membership: "member" | "not_member";
  readonly entry?: PlanEntry;
  readonly previousEntry?: PlanEntry;
  readonly position?: number;
}
export interface TaskCorrectionHistory {
  readonly record: CorrectionRecord;
  readonly assertion: Assertion;
  readonly originalAssertion?: Assertion;
}
export type TaskHistoryResult =
  | { readonly status: "not_found" }
  | {
      readonly status: "available";
      readonly scope: PlanScope;
      readonly taskId: TaskId;
      readonly current:
        | {
            readonly status: "member";
            readonly eventId: EventId;
            readonly entry: PlanEntry;
          }
        | { readonly status: "not_member"; readonly eventId: EventId }
        | {
            readonly status: "unknown" | "ambiguous";
            readonly issues: readonly PlanIssue[];
            readonly lastKnownMembership?: "member" | "not_member";
          };
      readonly revisions: readonly TaskPlanHistoryEntry[];
      readonly assertions: readonly Assertion<
        "task.status" | "task.certainty" | "task.weight"
      >[];
      readonly corrections: readonly TaskCorrectionHistory[];
      readonly evidenceRefs: readonly TimelineReference[];
    };

function sameScope(a: PlanScope, b: PlanScope) {
  return (
    a.projectId === b.projectId &&
    a.sourceId === b.sourceId &&
    a.sessionId === b.sessionId &&
    a.planId === b.planId
  );
}

// Trusted Core/Engine history only, not a raw importer or an anonymized export.
// Returns claims and lifecycle records; does not invent source order or status.
export function getTaskHistory(
  state: PlanEngineState,
  scope: PlanScope,
  taskId: TaskId,
): TaskHistoryResult {
  const task = state.core.tasks.find((item) => item.id === taskId);
  if (
    !task ||
    !state.core.projects.some((project) => project.id === scope.projectId) ||
    !state.core.phases.some(
      (phase) =>
        phase.id === task.phaseId && phase.projectId === scope.projectId,
    )
  )
    return { status: "not_found" };
  const applied = state.revisions.filter(
    (revision) =>
      sameScope(revision.scope, scope) &&
      revision.outcome === "applied" &&
      revision.snapshot !== undefined,
  );
  if (
    !applied.some((revision) =>
      revision.snapshot!.entries.some((entry) => entry.taskId === taskId),
    )
  )
    return { status: "not_found" };
  const revisions: TaskPlanHistoryEntry[] = [];
  for (const revision of applied) {
    const snapshot = revision.snapshot!;
    const position = snapshot.entries.findIndex(
      (entry) => entry.taskId === taskId,
    );
    const entry = snapshot.entries[position];
    const previous = applied.find(
      (row) => row.eventId === revision.previousHeadEventId,
    )?.snapshot;
    const previousEntry = previous?.entries.find(
      (row) => row.taskId === taskId,
    );
    if (!entry && !previousEntry) continue;
    const source = state.core.acceptedEvents.find(
      (event) => event.id === revision.eventId,
    );
    revisions.push({
      eventId: revision.eventId,
      membership: entry ? "member" : "not_member",
      ...(revision.previousHeadEventId === undefined
        ? {}
        : { previousEventId: revision.previousHeadEventId }),
      ...(source === undefined ? {} : { observedAt: source.receivedAt }),
      ...(entry === undefined ? {} : { entry, position }),
      ...(previousEntry === undefined ? {} : { previousEntry }),
    });
  }
  const linked = new Set([
    ...task.statusAssertionIds,
    ...task.certaintyAssertionIds,
    ...task.weightAssertionIds,
  ]);
  const assertions = state.core.assertions.filter(
    (
      assertion,
    ): assertion is Assertion<
      "task.status" | "task.certainty" | "task.weight"
    > =>
      (assertion.target === "task.status" ||
        assertion.target === "task.certainty" ||
        assertion.target === "task.weight") &&
      assertion.targetId === taskId &&
      linked.has(assertion.id),
  );
  const corrections: TaskCorrectionHistory[] = [];
  for (const record of state.core.corrections) {
    if (
      record.scope.projectId !== scope.projectId ||
      (record.scope.sessionId !== undefined &&
        record.scope.sessionId !== scope.sessionId)
    )
      continue;
    const assertion = state.core.assertions.find(
      (claim) => claim.id === record.correctedAssertionId,
    );
    const matches =
      record.scope.kind === "task_weight"
        ? record.scope.taskId === taskId &&
          assertion?.target === "task.weight" &&
          assertion.targetId === taskId
        : record.scope.kind === "current_task" &&
          assertion?.target === "project.currentTask" &&
          assertion.targetId === scope.projectId &&
          assertion.value === taskId;
    if (!matches || assertion === undefined) continue;
    const original = state.core.assertions.find(
      (claim) => claim.id === record.originalAssertionId,
    );
    corrections.push({
      record,
      assertion,
      ...(original === undefined ? {} : { originalAssertion: original }),
    });
  }
  const view = getPlanSnapshot(state, scope);
  const currentEntry =
    view.status === "available"
      ? view.snapshot.entries.find((entry) => entry.taskId === taskId)
      : undefined;
  const current: Extract<
    TaskHistoryResult,
    { status: "available" }
  >["current"] =
    view.status === "available"
      ? currentEntry === undefined
        ? { status: "not_member", eventId: view.snapshot.eventId }
        : {
            status: "member",
            eventId: view.snapshot.eventId,
            entry: currentEntry,
          }
      : {
          status: view.status,
          issues: view.issues,
          ...(view.lastKnown === undefined
            ? {}
            : {
                lastKnownMembership: view.lastKnown.entries.some(
                  (entry) => entry.taskId === taskId,
                )
                  ? ("member" as const)
                  : ("not_member" as const),
              }),
        };
  const evidenceRefs: TimelineReference[] = [];
  const keys = new Set<string>();
  function reference(value: TimelineReference) {
    const key = JSON.stringify(value);
    if (!keys.has(key)) {
      keys.add(key);
      evidenceRefs.push(value);
    }
  }
  // Scope-wide plan observations explain current membership/uncertainty.
  // A reference here does not turn an unadopted input into a Task snapshot.
  for (const revision of state.revisions)
    if (sameScope(revision.scope, scope))
      reference({ kind: "event", eventId: revision.eventId });
  for (const assertion of [
    ...assertions,
    ...corrections.flatMap((row) =>
      row.originalAssertion === undefined
        ? [row.assertion]
        : [row.assertion, row.originalAssertion],
    ),
  ]) {
    reference({ kind: "assertion", assertionId: assertion.id });
    if (assertion.eventId !== undefined)
      reference({ kind: "event", eventId: assertion.eventId });
  }
  for (const { record } of corrections) {
    reference({ kind: "correction", correctionId: record.id });
    if (record.supersedes !== undefined)
      reference({ kind: "correction", correctionId: record.supersedes });
    if (record.lifecycle.status === "superseded")
      reference({
        kind: "correction",
        correctionId: record.lifecycle.supersededBy,
      });
    if (record.triggeringEventId !== undefined)
      reference({ kind: "event", eventId: record.triggeringEventId });
    if (
      record.lifecycle.status !== "active" &&
      record.lifecycle.triggeringEventId !== undefined
    )
      reference({ kind: "event", eventId: record.lifecycle.triggeringEventId });
  }
  return {
    status: "available",
    scope,
    taskId,
    current,
    revisions,
    assertions,
    corrections,
    evidenceRefs,
  };
}
