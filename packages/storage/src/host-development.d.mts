import type { CoreState } from "../../core/src/index.js";
import type { SyntheticCapability } from "./host-admission.mjs";
import type {
  SyntheticStore,
  WriterCapability,
  ResourceBinding,
  StorageCut,
  CommitRequest,
} from "./development.mjs";
export type WriterPhase =
  | "ADMITTED"
  | "OWNER_HELD_UNFENCED"
  | "RECOVERED"
  | "FENCED"
  | "ACTIVE"
  | "REVOKING"
  | "DRAINED"
  | "CLOSED";
export interface HostCloseResult {
  status: "closed" | "unavailable";
  pid: number | undefined;
  exitCode: number | null;
  signal: string | null;
  processExited: boolean;
  durability: "not_inferred";
  replay: false;
  publish: false;
  ack: false;
}
export interface HostReady {
  status: "active";
  pid: number;
  writer: WriterCapability;
  head: number;
  paths: ReturnType<SyntheticStore["paths"]>;
  resourceBinding: ResourceBinding;
  productionWriteEnabled: false;
}
export interface SyntheticHost {
  readonly admitted: Promise<{ pid: number; nonce: string }>;
  readonly ready: Promise<HostReady>;
  readonly closed: Promise<HostCloseResult>;
  activate(): void;
  read(): Promise<StorageCut>;
  commit(request: CommitRequest): Promise<ReturnType<SyntheticStore["commit"]>>;
  close(): Promise<HostCloseResult>;
  status(): {
    phase: WriterPhase;
    pid: number | undefined;
    nonce: string;
    intakeEnabled: boolean;
    pendingOperations: number;
    productionWriteEnabled: false;
    history: Array<{ seq: number; phase: WriterPhase }>;
  };
  evidence(): Array<{ seq: number; kind: string; data: unknown }>;
}
export function launchSyntheticHost(
  capability: SyntheticCapability,
  options: {
    driverRoot: string;
    driverBinarySha256: string;
    corePath: string;
    processorFingerprint: string;
    projectId: string;
    generation: string;
    bootstrap?: CoreState;
    holdAtAdmission?: boolean;
  },
): SyntheticHost;
