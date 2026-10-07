import type { AssertionId, SessionId, SourceId } from "./ids.js";

export interface Session {
  readonly id: SessionId;
  readonly sourceId: SourceId;
  // Opaque source metadata, never the internal SessionId. Null means unknown.
  readonly sourceSessionId: string | null;
  // An empty collection leaves project attribution unknown.
  readonly projectAssociationAssertionIds: readonly AssertionId[];
}
