import type { AssertionId, EventId, SourceId } from "./ids.js";

// Opaque reference/revision strings belong to this source namespace. They are
// not Core identities. At least one reference or revision must be provided.
export type SourceReference = {
  readonly sourceId: SourceId;
} & (
  | { readonly reference: string; readonly revision?: string }
  | { readonly reference?: never; readonly revision: string }
);

export type EvidenceReference =
  | { readonly kind: "event"; readonly eventId: EventId }
  | { readonly kind: "assertion"; readonly assertionId: AssertionId }
  | { readonly kind: "source"; readonly reference: SourceReference };
