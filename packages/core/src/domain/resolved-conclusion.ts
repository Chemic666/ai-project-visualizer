import type { Assertion, AssertionTarget } from "./assertion.js";
import type { AssertionId } from "./ids.js";

// Describes the rule that produced an explanation; it does not define a policy.
export interface ResolutionMetadata {
  // ISO 8601 resolution time, validated at a future input boundary.
  readonly resolvedAt: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly reason: string;
}

// An interpretation of existing Assertions, which remain independent records.
// The current value and its provenance come from the selected original Assertion.
// Actual reference existence and same-target membership need runtime validation.
// Without a valid explanation, no ResolvedConclusion is present.
export type ResolvedConclusion<
  Target extends AssertionTarget = AssertionTarget,
> = {
  [Field in Target]: {
    readonly target: Field;
    readonly targetId: Assertion<Field>["targetId"];
    readonly selectedAssertionId: AssertionId;
    readonly supportingAssertionIds: readonly AssertionId[];
    readonly conflictingAssertionIds: readonly AssertionId[];
    readonly resolution: ResolutionMetadata;
  };
}[Target];
