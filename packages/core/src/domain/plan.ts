import type {
  EventId,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "./ids.js";
import type { EvidenceReference } from "./source-reference.js";
import type { Provenance } from "./provenance.js";
import type { PlanCertainty } from "./status.js";
import type { CoreState } from "../state.js";

export interface PlanScope {
  readonly projectId: ProjectId;
  readonly sourceId: SourceId;
  readonly sessionId?: SessionId;
  readonly planId: string;
}

export interface PlanEntry {
  readonly taskId: TaskId;
  readonly phaseId: PhaseId;
  readonly title: string;
  readonly sourceEventId: EventId;
  readonly sourceItemId?: string;
  readonly certainty?: PlanCertainty;
}

export interface PlanPhase {
  readonly phaseId: PhaseId;
  readonly title: string;
  readonly sourcePhaseId?: string;
  // Flat-plan grouping is explicitly inferred, never source-reported structure.
  readonly provenance: Provenance;
}

export interface PlanHead {
  readonly scope: PlanScope;
  readonly eventId: EventId;
  readonly sourceSequence?: number;
  readonly lastSourceSequence?: number;
  readonly completeness: "complete" | "partial";
  readonly entries: readonly PlanEntry[];
  readonly phases: readonly PlanPhase[];
}

export type PlanIssue =
  | "plan_not_observed"
  | "source_contract_missing"
  | "invalid_plan"
  | "source_namespace_mismatch"
  | "session_scope_mismatch"
  | "revision_order_unknown"
  | "revision_base_mismatch"
  | "stale_source_sequence"
  | "task_identity_ambiguous"
  | "duplicate_source_item"
  | "unknown_deletion"
  | "upsert_delete_conflict"
  | "unknown_phase"
  | "internal_id_collision";

export interface PlanRevision {
  readonly eventId: EventId;
  readonly scope: PlanScope;
  readonly previousHeadEventId?: EventId;
  readonly outcome: "applied" | "unknown" | "ambiguous";
  readonly issues: readonly PlanIssue[];
  // Full normalized input, source revision and declared base remain in the
  // accepted-event ledger. This record links interpretation to that authority.
  readonly taskIds: readonly TaskId[];
  readonly snapshot?: PlanHead;
}

export type PlanSnapshotResult =
  | { readonly status: "available"; readonly snapshot: PlanHead }
  | {
      readonly status: "unknown" | "ambiguous";
      readonly issues: readonly PlanIssue[];
      readonly lastKnown?: PlanHead;
    };

export type PlanChange =
  | { readonly kind: "task.added" | "task.removed"; readonly taskId: TaskId }
  | {
      readonly kind: "task.changed";
      readonly taskId: TaskId;
      readonly fields: readonly ("title" | "certainty" | "phase")[];
    }
  | {
      readonly kind: "tasks.reordered";
      readonly previousTaskIds: readonly TaskId[];
      readonly taskIds: readonly TaskId[];
    }
  | {
      readonly kind: "phase.added" | "phase.changed";
      readonly phaseId: PhaseId;
    };

// Separate from NormalizedEvent: this output cannot loop back as source input.
export interface PlanChangedEvent {
  readonly id: EventId;
  readonly type: "plan.changed";
  readonly origin: "core_derived";
  readonly projectId: ProjectId;
  readonly sourceId: SourceId;
  readonly scope: PlanScope;
  readonly causedBy: EventId;
  readonly previousEventId?: EventId;
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly ruleId: "core.plan.snapshot-diff";
  readonly ruleVersion: "1";
  readonly changes: readonly PlanChange[];
}

// Explicit, serializable in-memory composition. CoreState and the current
// Storage codec are unchanged; this is not a supported persistence bundle.
export interface PlanEngineState {
  readonly core: CoreState;
  readonly heads: readonly PlanHead[];
  readonly revisions: readonly PlanRevision[];
  readonly changes: readonly PlanChangedEvent[];
}

export type PlanApplicationResult = { readonly state: PlanEngineState } & (
  | { readonly status: "applied" }
  | { readonly status: "duplicate" }
  | {
      readonly status: "unknown" | "ambiguous";
      readonly issues: readonly PlanIssue[];
    }
  | { readonly status: "rejected"; readonly reason: string }
);
