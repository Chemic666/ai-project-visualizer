import type {
  CoreState,
  NormalizedEvent,
  applyNormalizedEvent,
} from "../../core/src/index.js";
import type { SyntheticCapability } from "./host-admission.mjs";
export { admitSyntheticRoot } from "./host-admission.mjs";
export interface NativePackage {
  manifestPath: string;
  buildId: string;
  dllSha256: string;
}
export interface SqliteConnection {
  readonly name: string;
  readonly open: boolean;
  readonly inTransaction: boolean;
  exec(sql: string): unknown;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  prepare(sql: string): {
    run(...values: unknown[]): { changes: number };
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
  };
  loadExtension(filename: string, entryPoint: string): unknown;
  close(): unknown;
}
export interface WriterCapability {
  generation: string;
  epoch: number;
  token: string;
}
export interface SourceCheckpoint {
  sourceId: string;
  streamId: string;
  codec: "synthetic.v1";
  position: string;
  expectedPrevious: string | null;
  coveredEventIds: string[];
}
export interface Receipt {
  operationId: string;
  operationNonce: string;
  projectId: string;
  generation: string;
  epoch: number;
  head: number;
  intentDigest: string;
  resultDigest: string;
  stateDigest: string;
}
export interface StorageCut {
  state: CoreState;
  cursor: SourceCheckpoint[];
  head: number;
  stateDigest: string;
}
export interface CommitRequest {
  operationId: string;
  operationNonce: string;
  expectedHead: number;
  writer: WriterCapability;
  events: NormalizedEvent[];
  cursor?: SourceCheckpoint;
  createSnapshot?: boolean;
}
export interface ResourceBinding {
  reportedConnections: Record<
    string,
    {
      sqliteReportedName: string;
      driverName: string;
      nativeHandleIdentity: "unavailable";
      assurance: "connection-reported-path-only";
    }
  >;
  metadataIdentities: Record<string, unknown>;
  sidecars: Array<{ file: string; metadata: unknown }>;
  actualDriverHandleIdentity: "unavailable" | "main-confirmed-only";
  nativeAttestation: {
    expected: Record<string, unknown>;
    reports: Record<string, unknown>;
  } | null;
  productionWriteEnabled: false;
}
export interface SyntheticStore {
  read(): StorageCut;
  commit(request: CommitRequest): StorageCut & {
    status: "committed" | "already_committed";
    receipt: Receipt;
    replay: false;
    publish: false;
    ack: false;
  };
  writer(): WriterCapability;
  paths(): {
    catalog: string;
    catalogAdmission: string;
    owner: string;
    project: string;
  };
  resourceBinding(): ResourceBinding;
  evidence(): Array<{ seq: number; phase: string; [key: string]: unknown }>;
  close(): { status: "closed"; processSettlementRequired: true };
  admission(): { productionWriteEnabled: false; bindingAssurance: string };
}
export function openSyntheticStore(
  capability: SyntheticCapability,
  options: {
    Database: new (
      filename: string,
      options?: { readonly?: boolean; fileMustExist?: boolean },
    ) => SqliteConnection;
    applyNormalizedEvent: typeof applyNormalizedEvent;
    processorFingerprint: string;
    projectId: string;
    generation: string;
    bootstrap?: CoreState;
    nativePackage?: NativePackage;
    limits?: {
      logicalBytes?: number;
      snapshotBytes?: number;
      physicalBytes?: number;
    };
    testHooks?: { afterRecords?: () => void };
  },
): SyntheticStore;
