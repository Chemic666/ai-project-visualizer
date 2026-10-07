declare const idBrand: unique symbol;

type BrandedId<Kind extends string> = string & {
  readonly [idBrand]: Kind;
};

// Internal IDs are assigned independently of paths and external Agent IDs.
// Branding protects assignments; it does not validate or generate identities.
export type ProjectId = BrandedId<"ProjectId">;
export type PhaseId = BrandedId<"PhaseId">;
export type TaskId = BrandedId<"TaskId">;
export type SessionId = BrandedId<"SessionId">;
export type AssertionId = BrandedId<"AssertionId">;
export type CorrectionId = BrandedId<"CorrectionId">;
export type SourceId = BrandedId<"SourceId">;
export type EventId = BrandedId<"EventId">;
