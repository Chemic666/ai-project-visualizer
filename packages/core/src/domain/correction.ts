import type {
  AssertionId,
  CorrectionId,
  EventId,
  ProjectId,
  SessionId,
  TaskId,
} from "./ids.js";

export type CorrectionScope =
  | {
      // Project/Session work context only; this is not a Task.status correction.
      readonly kind: "current_task";
      readonly projectId: ProjectId;
      readonly sessionId: SessionId;
    }
  | {
      readonly kind: "historical_activity_association";
      readonly projectId: ProjectId;
      readonly sessionId?: SessionId;
      // Explicit historical inputs, never an open-ended scope for future activity.
      readonly eventIds: readonly [EventId, ...EventId[]];
    }
  | {
      readonly kind: "task_weight";
      readonly projectId: ProjectId;
      readonly sessionId?: SessionId;
      // Applies to this stable Task's current plan membership. Membership and
      // expiry rules are future behavior; re-entry does not revive a record here.
      readonly taskId: TaskId;
    };

interface CorrectionEndMetadata {
  readonly reasonCode: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly triggeringEventId?: EventId;
}

export type CorrectionLifecycle =
  | { readonly status: "active" }
  | (CorrectionEndMetadata & {
      readonly status: "superseded";
      readonly supersededBy: CorrectionId;
      readonly supersededAt: string;
    })
  | (CorrectionEndMetadata & {
      readonly status: "expired";
      readonly expiredAt: string;
    });

// Reference/scope data only: no precedence, application or lifecycle algorithm.
// Original Assertions stay separate. Reference existence and assertion-target
// compatibility require future runtime validation, including activity association.
export interface CorrectionRecord {
  readonly id: CorrectionId;
  readonly scope: CorrectionScope;
  readonly originalAssertionId?: AssertionId;
  readonly correctedAssertionId: AssertionId;
  readonly effectiveAt: string;
  readonly supersedes?: CorrectionId;
  // Creation trigger; a lifecycle termination may record a different trigger.
  readonly triggeringEventId?: EventId;
  readonly lifecycle: CorrectionLifecycle;
}
