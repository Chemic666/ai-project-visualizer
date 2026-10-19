declare const syntheticCapability: unique symbol;
export interface SyntheticCapability {
  readonly [syntheticCapability]: true;
  readonly mode: "synthetic-development";
}
export interface SyntheticAdmission {
  readonly root: string;
  readonly privateRoot: string;
  readonly observedRoot: string;
  readonly nonce: string;
  readonly fileSystem: "NTFS";
  readonly productionWriteEnabled: false;
  readonly bindingAssurance: "synthetic-path-metadata-only";
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
