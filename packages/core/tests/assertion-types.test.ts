import { expectTypeOf, test } from "vitest";

import type {
  Assertion,
  AssertionInferenceMetadata,
  CurrentTaskAssociationInferenceMetadata,
  EventId,
  PhaseId,
  PlanCertainty,
  ProjectId,
  Provenance,
  SessionId,
  SourceReference,
  TaskId,
  TaskWeight,
  WorkStatus,
} from "../src/index.js";

type Fits<From, To> = [From] extends [To] ? true : false;

test("binds all seven targets to their entity IDs and value types", () => {
  expectTypeOf<Assertion<"task.status">["targetId"]>().toEqualTypeOf<TaskId>();
  expectTypeOf<Assertion<"task.status">["value"]>().toEqualTypeOf<WorkStatus>();
  expectTypeOf<
    Assertion<"task.certainty">["value"]
  >().toEqualTypeOf<PlanCertainty>();
  expectTypeOf<Assertion<"task.weight">["value"]>().toEqualTypeOf<TaskWeight>();
  expectTypeOf<
    Assertion<"phase.status">["targetId"]
  >().toEqualTypeOf<PhaseId>();
  expectTypeOf<
    Assertion<"phase.status">["value"]
  >().toEqualTypeOf<WorkStatus>();
  expectTypeOf<
    Assertion<"project.currentTask">["targetId"]
  >().toEqualTypeOf<ProjectId>();
  expectTypeOf<
    Assertion<"project.currentTask">["value"]
  >().toEqualTypeOf<TaskId>();
  expectTypeOf<
    Assertion<"project.currentPhase">["value"]
  >().toEqualTypeOf<PhaseId>();
  expectTypeOf<
    Assertion<"session.projectAssociation">["targetId"]
  >().toEqualTypeOf<SessionId>();
  expectTypeOf<
    Assertion<"session.projectAssociation">["value"]
  >().toEqualTypeOf<ProjectId>();
});

test("rejects mismatched values and IDs even through the full Assertion union", () => {
  type StatusWithWrongValue = Omit<Assertion<"task.status">, "value"> & {
    readonly value: ProjectId | PhaseId;
  };
  type AssociationWithStatus = Omit<
    Assertion<"project.currentTask">,
    "value"
  > & {
    readonly value: WorkStatus;
  };
  type StatusWithPhaseId = Omit<Assertion<"task.status">, "targetId"> & {
    readonly targetId: PhaseId;
  };
  type PhaseWeight = Omit<Assertion<"phase.status">, "target" | "value"> & {
    readonly target: "phase.weight";
    readonly value: TaskWeight;
  };

  expectTypeOf<Fits<StatusWithWrongValue, Assertion>>().toEqualTypeOf<false>();
  expectTypeOf<Fits<AssociationWithStatus, Assertion>>().toEqualTypeOf<false>();
  expectTypeOf<Fits<StatusWithPhaseId, Assertion>>().toEqualTypeOf<false>();
  expectTypeOf<Fits<PhaseWeight, Assertion>>().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<null, Assertion<"project.currentTask">["value"]>
  >().toEqualTypeOf<false>();
  expectTypeOf<Fits<0 | -1 | number, TaskWeight>>().toEqualTypeOf<false>();
  expectTypeOf<TaskWeight>().toExtend<number>();
});

test("requires inference metadata and separates confidence semantics", () => {
  type InferredStatus = Extract<
    Assertion<"task.status">,
    { provenance: "visualizer_inferred" }
  >;
  type InferredAssociation = Extract<
    Assertion<"project.currentTask">,
    { provenance: "visualizer_inferred" }
  >;

  expectTypeOf<
    InferredStatus["inference"]
  >().toEqualTypeOf<AssertionInferenceMetadata>();
  expectTypeOf<
    InferredAssociation["inference"]
  >().toEqualTypeOf<CurrentTaskAssociationInferenceMetadata>();
  expectTypeOf<
    Fits<Omit<InferredStatus, "inference">, Assertion>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<AssertionInferenceMetadata, CurrentTaskAssociationInferenceMetadata>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<CurrentTaskAssociationInferenceMetadata, AssertionInferenceMetadata>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<[], AssertionInferenceMetadata["evidenceRefs"]>
  >().toEqualTypeOf<false>();
});

test("keeps provenance and external references distinct", () => {
  expectTypeOf<Provenance>().toEqualTypeOf<
    "observed" | "agent_reported" | "visualizer_inferred" | "user_confirmed"
  >();
  type Reported = Extract<
    Assertion<"task.status">,
    { provenance: "agent_reported" }
  >;
  type Observed = Extract<Assertion<"task.status">, { provenance: "observed" }>;

  expectTypeOf<Fits<Reported, Observed>>().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<
      Omit<Reported, "inference"> & {
        readonly inference: AssertionInferenceMetadata;
      },
      Assertion
    >
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<{ reference: string }, SourceReference>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<SourceReference, EventId | TaskId>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<{ sourceId: SourceReference["sourceId"] }, SourceReference>
  >().toEqualTypeOf<false>();
});
