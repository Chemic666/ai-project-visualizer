import type { AssertionId, CorrectionId, EventId } from "./ids.js";

// Basis references for future meaningful history, not Timeline entries or raw logs.
export type TimelineReference =
  | { readonly kind: "event"; readonly eventId: EventId }
  | { readonly kind: "assertion"; readonly assertionId: AssertionId }
  | { readonly kind: "correction"; readonly correctionId: CorrectionId };
