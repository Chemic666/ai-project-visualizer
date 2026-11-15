import type {
  CoreState,
  NormalizedEvent,
  PlanEngineState,
  PlanScope,
  ProgressEngineState,
  TimelineState,
  appendTimelineEvents,
  applyNormalizedEvent,
  updateProgress,
  applyPlanEvent,
} from "../../core/src/index.js";
import type { validatePlan } from "../../core/src/plan-engine.js";
import type {
  UserCorrectionInput,
  describeCorrectionRecord,
  prepareUserCorrection,
  prepareCorrectionExpiry,
} from "../../core/src/correction-engine.js";
import type { SyntheticCapability } from "./host-admission.mjs";
export {
  admitSyntheticRoot,
  admitLocalValidationRoot,
} from "./host-admission.mjs";
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
    iterate(...values: unknown[]): Iterable<unknown>;
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
  /** Empty only with a nonempty synthetic Cursor over prior canonical inputs. */
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
export interface SyntheticStoreOptions {
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
    catalogBytes?: number;
    logicalBytes?: number;
    snapshotBytes?: number;
    physicalBytes?: number;
  };
  testHooks?: { afterRecords?: () => void };
}

export function openSyntheticStore(
  capability: SyntheticCapability,
  options: SyntheticStoreOptions,
): SyntheticStore;

export interface PlanStorageCut extends StorageCut {
  plan: PlanEngineState;
}

export interface SyntheticPlanStore extends SyntheticStore {
  read(): PlanStorageCut;
  commit(
    request: CommitRequest,
  ): ReturnType<SyntheticStore["commit"]> & { plan: PlanEngineState };
}

interface SyntheticPlanStoreOptions extends SyntheticStoreOptions {
  planScope: PlanScope;
  applyPlanEvent: typeof applyPlanEvent;
  validatePlan: typeof validatePlan;
}

export function openSyntheticPlanStore(
  capability: SyntheticCapability,
  options: SyntheticPlanStoreOptions,
): SyntheticPlanStore;

export interface CorrectionCommitRequest extends Pick<
  CommitRequest,
  "operationId" | "operationNonce" | "expectedHead" | "writer"
> {
  correction: UserCorrectionInput;
  events?: never;
  cursor?: never;
  createSnapshot?: never;
}

export interface SyntheticCorrectionStore extends SyntheticPlanStore {
  commit(
    request: CommitRequest | CorrectionCommitRequest,
  ): ReturnType<SyntheticPlanStore["commit"]>;
}

interface SyntheticCorrectionStoreOptions extends SyntheticPlanStoreOptions {
  prepareUserCorrection: typeof prepareUserCorrection;
  prepareCorrectionExpiry: typeof prepareCorrectionExpiry;
}

export function openSyntheticCorrectionStore(
  capability: SyntheticCapability,
  options: SyntheticCorrectionStoreOptions,
): SyntheticCorrectionStore;

export interface ProgressStorageCut extends PlanStorageCut {
  progress: ProgressEngineState;
}

export interface SyntheticProgressStore extends SyntheticCorrectionStore {
  read(): ProgressStorageCut;
  commit(request: CommitRequest | CorrectionCommitRequest): ReturnType<
    SyntheticCorrectionStore["commit"]
  > & {
    progress: ProgressEngineState;
  };
}

interface SyntheticProgressStoreOptions extends SyntheticCorrectionStoreOptions {
  updateProgress: typeof updateProgress;
}

export function openSyntheticProgressStore(
  capability: SyntheticCapability,
  options: SyntheticProgressStoreOptions,
): SyntheticProgressStore;

export interface TimelineStorageCut extends ProgressStorageCut {
  timeline: TimelineState;
}

export interface SyntheticTimelineStore extends SyntheticProgressStore {
  read(): TimelineStorageCut;
  commit(request: CommitRequest | CorrectionCommitRequest): ReturnType<
    SyntheticProgressStore["commit"]
  > & {
    timeline: TimelineState;
  };
}

export function openSyntheticTimelineStore(
  capability: SyntheticCapability,
  options: SyntheticProgressStoreOptions & {
    appendTimelineEvents: typeof appendTimelineEvents;
    describeCorrectionRecord: typeof describeCorrectionRecord;
  },
): SyntheticTimelineStore;
