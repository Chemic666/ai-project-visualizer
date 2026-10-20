export type LocalRootFailure = { ok: false; reason: "unavailable" };
export interface StorageLocation {
  ok: true;
  localApplicationData: string;
  applicationRoot: string;
  productionRoot: string;
  validationParent: string;
}
export interface LocalValidationRoot extends StorageLocation {
  root: string;
  privateDirectory: string;
  observedDirectory: string;
  runId: string;
  proof: {
    ancestorAclTrust: "reviewed-write-principals-only" | "unverified";
    anchorDaclSddl: string;
    aclScope: "app-root-and-descendants";
    ownerSid: string;
    daclSddl: string;
    fileSystem: "NTFS";
    driveType: "Fixed";
    protectedDacl: true;
    reparseAncestors: false;
    treeItemsChecked: number;
    assurance: "acl-and-path-metadata-only";
  };
}
export function deriveStorageLocation(): StorageLocation | LocalRootFailure;
export function prepareLocalValidationRoot(options?: {
  runId: string;
  reopen?: boolean;
}): LocalValidationRoot | LocalRootFailure;
export function inspectLocalValidationRoot(
  root: string,
  runId: string,
): LocalValidationRoot | LocalRootFailure;

export function diagnoseLocalValidationRoot(options?: {
  runId: string;
  reopen?: boolean;
}):
  | LocalValidationRoot
  | (LocalRootFailure & { diagnostic?: { stage: string; category: string } });
