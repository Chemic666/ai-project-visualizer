import type {
  AssertionId,
  EventId,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "./ids.js";
import type {
  AssertionInferenceMetadata,
  CurrentTaskAssociationInferenceMetadata,
} from "./inference.js";
import type { Provenance } from "./provenance.js";
import type { SourceReference } from "./source-reference.js";
import type { PlanCertainty, WorkStatus } from "./status.js";

declare const taskWeightBrand: unique symbol;

// A positive finite number validated at an input boundary. Unbranded numbers
// cannot enter this field implicitly; runtime validation is not implemented here.
export type TaskWeight = number & {
  readonly [taskWeightBrand]: "positive_finite_task_weight";
};

// Closed vocabulary for the fields currently referenced by the domain models.
interface AssertionFields {
  "task.status": { id: TaskId; value: WorkStatus };
  "task.certainty": { id: TaskId; value: PlanCertainty };
  "task.weight": { id: TaskId; value: TaskWeight };
  "phase.status": { id: PhaseId; value: WorkStatus };
  "project.currentTask": { id: ProjectId; value: TaskId };
  "project.currentPhase": { id: ProjectId; value: PhaseId };
  "session.projectAssociation": { id: SessionId; value: ProjectId };
}

export type AssertionTarget = keyof AssertionFields;

interface AssertionMetadata {
  readonly id: AssertionId;
  readonly sourceId: SourceId;
  // ISO 8601 receipt/observation time, irrespective of the claim's provenance.
  readonly observedAt: string;
  // Source assertion time may be unavailable; omission does not invent a time.
  readonly assertedAt?: string;
  readonly eventId?: EventId;
  readonly sourceReference?: SourceReference;
}

type DirectProvenance = Exclude<Provenance, "visualizer_inferred">;

type DirectOrigin = {
  [Origin in DirectProvenance]: {
    readonly provenance: Origin;
    readonly inference?: never;
  };
}[DirectProvenance];

type AssertionOrigin<Target extends AssertionTarget> =
  | DirectOrigin
  | {
      readonly provenance: "visualizer_inferred";
      readonly inference: Target extends "project.currentTask"
        ? CurrentTaskAssociationInferenceMetadata
        : AssertionInferenceMetadata;
    };

// The mapped union preserves target/ID/value correlation even when Target is a
// union. Assertions are source claims, not resolved or independently verified
// conclusions. A status value alone never qualifies completion or verification.
// Missing assertions remain absent; there are no unknown-value placeholders.
export type Assertion<Target extends AssertionTarget = AssertionTarget> = {
  [Field in Target]: AssertionMetadata &
    AssertionOrigin<Field> & {
      readonly target: Field;
      readonly targetId: AssertionFields[Field]["id"];
      readonly value: AssertionFields[Field]["value"];
    };
}[Target];
