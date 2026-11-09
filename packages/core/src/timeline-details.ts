import type { Assertion } from "./domain/assertion.js";
import type { CorrectionRecord } from "./domain/correction.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type { PlanChangedEvent, PlanScope } from "./domain/plan.js";
import type {
  ProgressChangedEvent,
  ProgressEvidenceReference,
} from "./domain/progress.js";
import type { ProjectEngineState } from "./project-engine.js";
import type { CoreState } from "./state.js";
import type { TimelineEntry } from "./timeline-engine.js";

export type TimelineEvidenceRecord =
  | { readonly kind: "normalized_event"; readonly event: NormalizedEvent }
  | { readonly kind: "plan_change"; readonly event: PlanChangedEvent }
  | { readonly kind: "progress_change"; readonly event: ProgressChangedEvent }
  | { readonly kind: "assertion"; readonly assertion: Assertion }
  | {
      readonly kind: "correction";
      readonly version: "current_state";
      readonly record: CorrectionRecord;
    };

export type TimelineEvidenceResolution = {
  readonly reference: ProgressEvidenceReference;
} & (
  | { readonly status: "available"; readonly record: TimelineEvidenceRecord }
  | { readonly status: "external_reference" }
  | {
      readonly status: "unavailable";
      readonly reason:
        | "not_found"
        | "outside_project"
        | "project_unknown"
        | "ambiguous_identity";
    }
);

export type TimelineEntryDetailsResult =
  | { readonly status: "not_found" }
  | {
      readonly status: "available";
      readonly entry: TimelineEntry;
      readonly evidence: readonly TimelineEvidenceResolution[];
    };

function sameScope(a: PlanScope, b: PlanScope) {
  return (
    a.projectId === b.projectId &&
    a.sourceId === b.sourceId &&
    a.sessionId === b.sessionId &&
    a.planId === b.planId
  );
}

function assertionProject(core: CoreState, assertion: Assertion) {
  switch (assertion.target) {
    case "project.currentTask":
    case "project.currentPhase":
      return assertion.targetId;
    case "session.projectAssociation":
      return assertion.value;
    case "phase.status":
      return core.phases.find((phase) => phase.id === assertion.targetId)
        ?.projectId;
    case "task.status":
    case "task.certainty":
    case "task.weight": {
      const task = core.tasks.find((task) => task.id === assertion.targetId);
      return core.phases.find((phase) => phase.id === task?.phaseId)?.projectId;
    }
  }
}

function recordProject(core: CoreState, record: TimelineEvidenceRecord) {
  switch (record.kind) {
    case "normalized_event":
    case "plan_change":
      return record.event.projectId;
    case "progress_change":
      return record.event.scope.projectId;
    case "correction":
      return record.record.scope.projectId;
    case "assertion":
      return assertionProject(core, record.assertion);
  }
}

function resolve(
  state: ProjectEngineState,
  reference: ProgressEvidenceReference,
): TimelineEvidenceResolution {
  if (reference.kind === "source")
    return { reference, status: "external_reference" };

  const core = state.plan.core;
  const candidates: TimelineEvidenceRecord[] = [];
  if (reference.kind === "event") {
    for (const event of core.acceptedEvents)
      if (event.id === reference.eventId)
        candidates.push({ kind: "normalized_event", event });
    for (const event of state.plan.changes)
      if (event.id === reference.eventId)
        candidates.push({ kind: "plan_change", event });
    for (const event of state.progress.changes)
      if (event.id === reference.eventId)
        candidates.push({ kind: "progress_change", event });
  } else if (reference.kind === "assertion") {
    for (const assertion of core.assertions)
      if (assertion.id === reference.assertionId)
        candidates.push({ kind: "assertion", assertion });
  } else {
    for (const record of core.corrections)
      if (record.id === reference.correctionId)
        candidates.push({
          kind: "correction",
          version: "current_state",
          record,
        });
  }
  if (candidates.length === 0)
    return { reference, status: "unavailable", reason: "not_found" };
  if (candidates.length > 1)
    return { reference, status: "unavailable", reason: "ambiguous_identity" };

  const record = candidates[0]!;
  const projectId = recordProject(core, record);
  if (projectId === undefined)
    return { reference, status: "unavailable", reason: "project_unknown" };
  if (projectId !== state.scope.projectId)
    return { reference, status: "unavailable", reason: "outside_project" };
  return { reference, status: "available", record };
}

// Read-only local explanation of trusted Engine state, not authorization,
// anonymous export or transitive evidence validation. Never follows source refs.
export function getTimelineEntryDetails(
  state: ProjectEngineState,
  entryId: string,
): TimelineEntryDetailsResult {
  const entry = state.timeline.entries.find(
    (row) =>
      row.id === entryId &&
      row.projectId === state.scope.projectId &&
      row.sessionId === state.scope.sessionId &&
      (row.sourceId === undefined || row.sourceId === state.scope.sourceId) &&
      ((row.kind !== "plan.changed" && row.kind !== "progress.changed") ||
        sameScope(row.detail.scope, state.scope)),
  );
  return entry === undefined
    ? { status: "not_found" }
    : {
        status: "available",
        entry,
        evidence: entry.evidenceRefs.map((reference) =>
          resolve(state, reference),
        ),
      };
}
