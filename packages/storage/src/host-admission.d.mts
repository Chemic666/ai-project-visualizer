declare const syntheticCapability: unique symbol;
export interface SyntheticCapability {
  readonly [syntheticCapability]: true;
  readonly mode: "synthetic-development" | "local-validation-development";
}
export interface SyntheticAdmission {
  readonly root: string;
  readonly privateRoot: string;
  readonly observedRoot: string;
  readonly nonce: string;
  readonly fileSystem: "NTFS";
  readonly productionWriteEnabled: false;
  readonly bindingAssurance:
    "synthetic-path-metadata-only" | "local-validation-admission-and-metadata";
  readonly local?: {
    runId: string;
    projectId: string;
    generation: string;
    storeKey: string;
  };
}
export function admitSyntheticRoot(options: {
  enabled: true;
  root: string;
  reopen?: boolean;
  expectedNonce?: string;
}): SyntheticCapability;
export function inspectCapability(
  capability: SyntheticCapability,
): SyntheticAdmission;

export function admitLocalValidationRoot(options: {
  enabled: true;
  root: string;
  runId: string;
  projectId: string;
  generation: string;
  storeKey: string;
  reopen?: boolean;
  expectedNonce?: string;
}): SyntheticCapability;
