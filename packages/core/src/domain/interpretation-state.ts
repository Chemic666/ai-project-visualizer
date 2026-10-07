import type { Assertion, AssertionTarget } from "./assertion.js";
import type { AssertionId } from "./ids.js";
import type { ResolvedConclusion } from "./resolved-conclusion.js";
import type { TimelineReference } from "./timeline-reference.js";

// Explicit interpretation/query data only. No resolver selects a candidate,
// creates a conclusion or detects staleness. Timestamps are serialized strings;
// reference consistency and time validity belong to future input validation.
export type InterpretationState<
  Target extends AssertionTarget = AssertionTarget,
> = {
  [Field in Target]: {
    readonly target: Field;
    readonly targetId: Assertion<Field>["targetId"];
  } & (
    | {
        readonly status: "available";
        // The adopted value remains on the selected original Assertion.
        readonly conclusion: ResolvedConclusion<Field>;
      }
    | {
        readonly status: "unavailable";
        readonly reasonCode: string;
        readonly supportingReferences?: readonly TimelineReference[];
      }
    | {
        readonly status: "ambiguous";
        readonly candidateAssertionIds: readonly [
          AssertionId,
          AssertionId,
          ...AssertionId[],
        ];
        readonly reasonCode: string;
        readonly supportingReferences?: readonly TimelineReference[];
      }
    | {
        readonly status: "stale";
        // Detection time is required; the start of staleness can be unknown.
        readonly detectedAt: string;
        readonly staleSince?: string;
        readonly reasonCode: string;
        readonly lastKnownConclusion?: ResolvedConclusion<Field>;
        readonly supportingReferences?: readonly TimelineReference[];
      }
  );
}[Target];
