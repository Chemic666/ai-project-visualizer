import { createFixtures } from "./reference-fixtures.js";
import { applyNormalizedEvent } from "../../packages/core/src/index.js";
import type {
  CoreState,
  EventId,
  NormalizedEvent,
} from "../../packages/core/src/index.js";

export { createFixtures };
export function replayRestored(state: CoreState, event: NormalizedEvent) {
  return applyNormalizedEvent(state, event);
}

// Typed examples for separate later identity/cursor persistence validation.
// These examples do not invent a source ID or exercise SQLite recovery.
export function identityExamples() {
  const stable = createFixtures().event;
  const withoutIdentity = { ...stable };
  delete withoutIdentity.sourceIdentity;
  const missing: NormalizedEvent = {
    ...withoutIdentity,
    id: "E-MISSING" as EventId,
  };
  const cursor: NormalizedEvent = {
    ...withoutIdentity,
    id: "E-CURSOR-1" as EventId,
    sourceIdentity: {
      kind: "cursor",
      sourceId: stable.sourceId,
      revision: "BATCH-1",
    },
  };
  return {
    stable,
    alias: {
      ...stable,
      id: "E-ALIAS" as EventId,
      receivedAt: "2026-10-11T00:00:00.000Z",
    },
    conflicting: {
      ...stable,
      id: "E-CONFLICT" as EventId,
      payload: { ...stable.payload, status: "blocked" as const },
    },
    missing,
    missingAgain: { ...missing, id: "E-MISSING-AGAIN" as EventId },
    cursor,
    cursorAgain: { ...cursor, id: "E-CURSOR-2" as EventId },
  };
}
