import type {
  CoreState,
  NormalizedEvent,
  applyNormalizedEvent,
} from "../../core/src/index.js";
import type { SyntheticCapability } from "./host-admission.mjs";
export { admitSyntheticRoot } from "./host-admission.mjs";
export interface SqliteConnection {
  readonly open: boolean;
  readonly inTransaction: boolean;
  exec(sql: string): unknown;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  prepare(sql: string): {
    run(...values: unknown[]): { changes: number };
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
  };
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
  paths(): { catalog: string; owner: string; project: string };
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
    limits?: {
      logicalBytes?: number;
      snapshotBytes?: number;
      physicalBytes?: number;
    };
    testHooks?: { afterRecords?: () => void };
  },
): SyntheticStore;
