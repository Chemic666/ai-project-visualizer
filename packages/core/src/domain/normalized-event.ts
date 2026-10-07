import type { EventId, ProjectId, SessionId, SourceId, TaskId } from "./ids.js";
import type { SourceReference } from "./source-reference.js";
import type { WorkStatus } from "./status.js";

// Stable identity supplied by the source or its Adapter, never a Core EventId.
// A cursor/revision may identify a position rather than one event. Its replay
// semantics need source-specific validation; this contract promises no exactly-once.
export type SourceEventIdentity =
  | {
      readonly kind: "source_event";
      readonly sourceId: SourceId;
      readonly sourceEventId: string;
    }
  | ({ readonly kind: "cursor" } & SourceReference);

export interface SessionEventInput {
  readonly sessionId: SessionId;
  readonly sourceSessionReference?: SourceReference;
}

export interface PlanStepInput {
  readonly title: string;
  // Steps need not have stable external identities or existing Core Task IDs.
  readonly sourceReference?: SourceReference;
}

export interface PlanInput {
  // Describes the scope of this source input, not resolved plan certainty.
  readonly completeness: "complete" | "partial";
  readonly steps: readonly PlanStepInput[];
  readonly sourceReference?: SourceReference;
}

export interface TaskStatusReport {
  readonly taskId: TaskId;
  // Every status here is a source claim. Even a reported "verified" is not
  // independent Verification Evidence. Future Assertions remain agent_reported.
  readonly status: WorkStatus;
}

interface EventPayloads {
  "session.started": SessionEventInput;
  "session.ended": SessionEventInput;
  "plan.detected": PlanInput;
  "plan.updated": PlanInput;
  "task.status_reported": TaskStatusReport;
}

export type NormalizedEventType = keyof EventPayloads;

interface EventEnvelope {
  readonly id: EventId;
  readonly schemaVersion: 1;
  readonly projectId: ProjectId;
  readonly sessionId?: SessionId;
  readonly sourceId: SourceId;
  // Serializable ISO 8601 representations; runtime validation is deferred.
  readonly receivedAt: string;
  // Source-claimed occurrence time; unknown time stays absent.
  readonly occurredAt?: string;
  // Source-local order only: numbers from different sources are not comparable.
  readonly sourceSequence?: number;
  // Absent when the source/Adapter cannot provide stable identity.
  readonly sourceIdentity?: SourceEventIdentity;
  readonly causedBy?: EventId;
  readonly relatedEventIds?: readonly EventId[];
}

// Only Adapter-to-Core input data, with type/payload correlation preserved.
// Reference existence, project attribution, namespace/session consistency and
// sequence/time validity belong to future runtime input validation.
export type NormalizedEvent<
  Type extends NormalizedEventType = NormalizedEventType,
> = {
  [Kind in Type]: EventEnvelope & {
    readonly type: Kind;
    readonly payload: EventPayloads[Kind];
  };
}[Type];
