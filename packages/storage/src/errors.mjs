const codes = new Set([
  "admission_rejected",
  "physical_binding_unverified",
  "development_disabled",
  "binding_conflict",
  "ownership_busy",
  "stale_writer",
  "revision_conflict",
  "identity_conflict",
  "coverage_conflict",
  "quota_exceeded",
  "unavailable",
]);
export class StorageError extends Error {
  constructor(code = "unavailable") {
    const safe = codes.has(code) ? code : "unavailable";
    super(safe);
    this.name = "StorageError";
    this.code = safe;
    this.stack = `StorageError: ${safe}`;
  }
}
export function demand(condition, code = "admission_rejected") {
  if (!condition) throw new StorageError(code);
}
export function safeFailure(error) {
  return error instanceof StorageError ? error : new StorageError();
}
