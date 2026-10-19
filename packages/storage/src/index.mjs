// Real-project admission is deliberately unavailable until B1/Host gates pass.
// Do not export the synthetic capability issuer from the default package entry.
export function openProductionStore() {
  return { status: "unavailable", reason: "physical_binding_unverified" };
}
export { StorageError } from "./errors.mjs";
