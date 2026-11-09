import type { Assertion } from "./assertion.js";
import type { CorrectionRecord } from "./correction.js";
import type { AssertionId, EventId, PhaseId, TaskId } from "./ids.js";
import type { PlanEntry, PlanHead, PlanScope } from "./plan.js";
import type { ResolvedConclusion } from "./resolved-conclusion.js";
import type { EvidenceReference } from "./source-reference.js";
import type { TimelineReference } from "./timeline-reference.js";

// Trusted, already-normalized fixture evidence binding, not a verifier, test
// runner or proof of real-world independence. A source's "verified" claim alone
// cannot create this support. Phase 14's Verification Engine is not implemented.
export interface IndependentVerificationSupport {
  readonly assertionId: AssertionId;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly evidenceRefs: readonly [EvidenceReference, ...EvidenceReference[]];
}

export type ProgressIssueCode =
  | "plan_unknown"
  | "plan_ambiguous"
  | "plan_incomplete"
  | "plan_inconsistent"
  | "certainty_unknown"
  | "invalid_reference"
  | "weight_unknown"
  | "invalid_weight"
  | "weight_conflict"
  | "status_conflict"
  | "correction_conflict"
  | "invalid_correction"
  | "zero_denominator"
  | "numeric_range"
  | "evidence_history_missing"
  | "evidence_identity_conflict";

export interface ProgressIssue {
  readonly code: ProgressIssueCode;
  readonly taskId?: TaskId;
}

export type ProgressEvidenceReference = EvidenceReference | TimelineReference;

export interface ProgressTaskBasis {
  readonly entry: PlanEntry;
  readonly included: boolean;
  readonly certaintyAssertions: readonly Assertion<"task.certainty">[];
  readonly weightAssertions: readonly Assertion<"task.weight">[];
  readonly statusAssertions: readonly Assertion<"task.status">[];
  readonly corrections: readonly CorrectionRecord[];
  readonly weightResolution?: ResolvedConclusion<"task.weight">;
  readonly statusResolution?: ResolvedConclusion<"task.status">;
  readonly selectedWeightAssertionId?: AssertionId;
  readonly selectedStatusAssertionId?: AssertionId;
  readonly effectiveWeight?: number;
  readonly completion: "completed" | "verified" | "not_completed" | "unknown";
  readonly completionReason:
    | "explicit_completion_report"
    | "independent_verification"
    | "verification_evidence_missing"
    | "completion_evidence_missing"
    | "inference_not_eligible"
    | "status_unknown"
    | "not_completed"
    | "excluded";
  readonly verificationSupport?: IndependentVerificationSupport;
}

export interface ProgressPhaseTotal {
  readonly phaseId: PhaseId;
  readonly taskIds: readonly TaskId[];
  readonly completedWeight: number;
  readonly totalWeight: number;
}

interface ProgressBasis {
  readonly scope: PlanScope;
  readonly planRevisionEventId?: EventId;
  readonly planSnapshot?: PlanHead;
  readonly tasks: readonly ProgressTaskBasis[];
  readonly phases: readonly ProgressPhaseTotal[];
  readonly issues: readonly ProgressIssue[];
  readonly evidenceRefs: readonly ProgressEvidenceReference[];
}

export type ProgressResult = ProgressBasis &
  (
    | {
        readonly status: "available";
        readonly completedWeight: number;
        readonly totalWeight: number;
        readonly ratio: number;
      }
    | { readonly status: "unavailable" }
  );

export type ProgressChangeReason =
  | "initial_calculation"
  | "plan_expanded"
  | "plan_reduced"
  | "plan_revision_changed"
  | "task_reopened"
  | "status_changed"
  | "weight_changed"
  | "weight_corrected"
  | "progress_unavailable"
  | "progress_available"
  | "evidence_changed";

export interface ProgressChangedEvent {
  readonly id: EventId;
  readonly type: "progress.changed";
  readonly origin: "core_derived";
  readonly scope: PlanScope;
  readonly reasons: readonly ProgressChangeReason[];
  readonly previous?: ProgressResult;
  readonly current: ProgressResult;
  readonly evidenceRefs: readonly ProgressEvidenceReference[];
  readonly ruleId: "core.progress.confirmed-weight";
  readonly ruleVersion: "1";
}

export interface ProgressEngineState {
  readonly snapshots: readonly {
    readonly result: ProgressResult;
    // Retain lifecycle evidence even after a Task leaves the current denominator.
    readonly correctionHistory: readonly CorrectionRecord[];
  }[];
  readonly changes: readonly ProgressChangedEvent[];
}

export interface ProgressApplicationResult {
  readonly status: "changed" | "unchanged" | "rejected";
  readonly state: ProgressEngineState;
  readonly result: ProgressResult;
}
