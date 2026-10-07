export const PROVENANCES = [
  "observed",
  "agent_reported",
  "visualizer_inferred",
  "user_confirmed",
] as const;

// This describes the conclusion's origin, not merely receipt of its input.
// Observing an Agent's completion statement leaves its claim agent_reported.
export type Provenance = (typeof PROVENANCES)[number];
