import type { EvidenceReference } from "./source-reference.js";

declare const heuristicScoreBrand: unique symbol;

// Branded numbers represent finite 0–100 scores validated at an input boundary.
// These contracts do not implement validation, scoring or probability models.
type HeuristicScore<Kind extends string> = number & {
  readonly [heuristicScoreBrand]: Kind;
};

export type InferenceHeuristicScore = HeuristicScore<"assertion_inference">;
export type AssociationHeuristicScore =
  HeuristicScore<"current_task_association">;

interface InferenceBasis {
  readonly ruleId: string;
  readonly ruleVersion: string;
  // ISO 8601 timestamp; time parsing/validation belongs to the input boundary.
  readonly evaluatedAt: string;
  readonly evidenceRefs: readonly [EvidenceReference, ...EvidenceReference[]];
}

export interface AssertionInferenceMetadata extends InferenceBasis {
  readonly kind: "assertion_inference";
  readonly inferenceConfidence: {
    readonly heuristicScore: InferenceHeuristicScore;
  };
}

export interface CurrentTaskAssociationInferenceMetadata extends InferenceBasis {
  readonly kind: "current_task_association";
  readonly associationConfidence: {
    readonly heuristicScore: AssociationHeuristicScore;
  };
}

// Each score is scoped to this specific inference. There is no global
// confidence or Estimated Task Progress confidence contract in this stage.
export type InferenceMetadata =
  AssertionInferenceMetadata | CurrentTaskAssociationInferenceMetadata;
