export interface ProductionUnavailable {
  readonly status: "unavailable";
  readonly reason: "physical_binding_unverified";
}
export function openProductionStore(options?: unknown): ProductionUnavailable;
export class StorageError extends Error {
  readonly code: string;
  constructor(code?: string);
}
