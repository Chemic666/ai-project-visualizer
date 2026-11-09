import type { CorrectionEngineEvent } from "./correction-engine.js";
import type { CorrectionScope } from "./domain/correction.js";
import type {
  CorrectionId,
  EventId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "./domain/ids.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type { PlanChange, PlanChangedEvent, PlanScope } from "./domain/plan.js";
import type {
  ProgressChangedEvent,
  ProgressEvidenceReference,
  ProgressResult,
  ProgressChangeReason,
  ProgressIssue,
} from "./domain/progress.js";
import type { Provenance } from "./domain/provenance.js";
import { WORK_STATUSES } from "./domain/status.js";
import type { WorkStatus } from "./domain/status.js";

export type TimelineInput =
  | { readonly kind: "source"; readonly event: NormalizedEvent }
  | {
      readonly kind: "plan";
      readonly event: PlanChangedEvent;
      readonly observedAt: string;
    }
  | {
      readonly kind: "progress";
      readonly event: ProgressChangedEvent;
      readonly observedAt: string;
    }
  | { readonly kind: "correction"; readonly event: CorrectionEngineEvent };
export type TimelineProgress =
  | {
      readonly status: "unavailable";
      readonly issues: readonly ProgressIssue[];
    }
  | {
      readonly status: "available";
      readonly issues: readonly ProgressIssue[];
      readonly ratio: number;
      readonly completedWeight: number;
      readonly totalWeight: number;
    };
interface TimelinePayloads {
  "session.started": { readonly sessionId: SessionId };
  "session.ended": { readonly sessionId: SessionId };
  "task.status_reported": {
    readonly taskId: TaskId;
    readonly reportedStatus: WorkStatus;
  };
  "plan.changed": {
    readonly scope: PlanScope;
    readonly changes: readonly PlanChange[];
    readonly previousEventId?: EventId;
  };
  "progress.changed": {
    readonly scope: PlanScope;
    readonly reasons: readonly ProgressChangeReason[];
    readonly before?: TimelineProgress;
    readonly after: TimelineProgress;
  };
  "correction.applied": {
    readonly correctionId: CorrectionId;
    readonly scope: CorrectionScope;
    readonly reasonCode: string;
  };
  "correction.superseded": TimelinePayloads["correction.applied"];
  "correction.expired": TimelinePayloads["correction.applied"];
}
export type TimelineKind = keyof TimelinePayloads;
interface TimelineMetadata {
  readonly id: string;
  readonly sequence: number;
  readonly eventId: EventId;
  readonly projectId: ProjectId;
  readonly sourceId?: SourceId;
  readonly sessionId?: SessionId;
  readonly observedAt: string;
  readonly sourceOrder: "unknown";
  readonly origin: "source" | "core_derived";
  readonly provenance?: Provenance;
  readonly rule?: { readonly id: string; readonly version: string };
  readonly evidenceRefs: readonly ProgressEvidenceReference[];
}
export type TimelineEntry = {
  [Kind in TimelineKind]: TimelineMetadata & {
    readonly kind: Kind;
    readonly detail: TimelinePayloads[Kind];
  };
}[TimelineKind];
type Projection = {
  [Kind in TimelineKind]: Omit<TimelineMetadata, "sequence"> & {
    readonly kind: Kind;
    readonly detail: TimelinePayloads[Kind];
  };
}[TimelineKind];
export interface TimelineState {
  readonly entries: readonly TimelineEntry[];
}
export interface TimelineQuery {
  readonly projectId: ProjectId;
  readonly sessionId?: SessionId;
  readonly sourceId?: SourceId;
}
export type TimelineApplicationResult = {
  readonly state: TimelineState;
  readonly added: readonly TimelineEntry[];
} & (
  | { readonly status: "applied" | "unchanged" }
  | {
      readonly status: "rejected";
      readonly reason:
        "invalid_input" | "unsupported_event" | "identity_conflict";
      readonly inputIndex: number;
    }
);

class ProjectionError extends Error {
  constructor(readonly reason: "invalid_input" | "unsupported_event") {
    super(reason);
  }
}
function ensure(condition: unknown): asserts condition {
  if (!condition) throw new ProjectionError("invalid_input");
}
const nonempty = (value: string) =>
  typeof value === "string" && value.trim().length > 0;
function time(value: string) {
  ensure(typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value));
  const instant = Date.parse(value);
  ensure(Number.isFinite(instant));
  return new Date(instant).toISOString();
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
    .join(",")}}`;
}
function scope(value: PlanScope): PlanScope {
  ensure(
    nonempty(value.projectId) &&
      nonempty(value.sourceId) &&
      nonempty(value.planId),
  );
  if (value.sessionId !== undefined) ensure(nonempty(value.sessionId));
  return {
    projectId: value.projectId,
    sourceId: value.sourceId,
    planId: value.planId,
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
  };
}
function correctionScope(value: CorrectionScope): CorrectionScope {
  ensure(nonempty(value.projectId));
  const base = {
    projectId: value.projectId,
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
  };
  switch (value.kind) {
    case "current_task":
      ensure(nonempty(value.sessionId));
      return { ...base, kind: value.kind, sessionId: value.sessionId };
    case "task_weight":
      ensure(nonempty(value.taskId));
      return { ...base, kind: value.kind, taskId: value.taskId };
    case "historical_activity_association":
      return { ...base, kind: value.kind, eventIds: [...value.eventIds] };
  }
}
function reference(
  value: ProgressEvidenceReference,
): ProgressEvidenceReference {
  switch (value.kind) {
    case "event":
      ensure(nonempty(value.eventId));
      return { kind: value.kind, eventId: value.eventId };
    case "assertion":
      ensure(nonempty(value.assertionId));
      return { kind: value.kind, assertionId: value.assertionId };
    case "correction":
      ensure(nonempty(value.correctionId));
      return { kind: value.kind, correctionId: value.correctionId };
    case "source": {
      const ref = value.reference;
      ensure(nonempty(ref.sourceId));
      return {
        kind: value.kind,
        reference: {
          sourceId: ref.sourceId,
          ...(ref.reference === undefined ? {} : { reference: ref.reference }),
          ...(ref.revision === undefined ? {} : { revision: ref.revision }),
        } as typeof ref,
      };
    }
  }
}
function change(value: PlanChange): PlanChange {
  switch (value.kind) {
    case "task.added":
    case "task.removed":
      return { kind: value.kind, taskId: value.taskId };
    case "task.changed":
      return {
        kind: value.kind,
        taskId: value.taskId,
        fields: [...value.fields],
      };
    case "tasks.reordered":
      return {
        kind: value.kind,
        previousTaskIds: [...value.previousTaskIds],
        taskIds: [...value.taskIds],
      };
    case "phase.added":
    case "phase.changed":
      return { kind: value.kind, phaseId: value.phaseId };
  }
}
function progress(value: ProgressResult): TimelineProgress {
  const issues = value.issues.map((issue) => ({
    code: issue.code,
    ...(issue.taskId === undefined ? {} : { taskId: issue.taskId }),
  }));
  if (value.status === "unavailable") return { status: "unavailable", issues };
  ensure(
    value.status === "available" &&
      Number.isFinite(value.ratio) &&
      Number.isFinite(value.completedWeight) &&
      Number.isFinite(value.totalWeight) &&
      value.totalWeight > 0 &&
      value.completedWeight >= 0 &&
      value.completedWeight <= value.totalWeight &&
      value.ratio === value.completedWeight / value.totalWeight,
  );
  return {
    status: "available",
    issues,
    ratio: value.ratio,
    completedWeight: value.completedWeight,
    totalWeight: value.totalWeight,
  };
}
function project(input: TimelineInput): Projection | undefined {
  const event = input.event;
  ensure(nonempty(event.id));
  if (
    input.kind === "source" &&
    (input.event.type === "plan.detected" ||
      input.event.type === "plan.updated")
  )
    return undefined;
  const projectId =
    input.kind === "progress"
      ? input.event.scope.projectId
      : input.kind === "source"
        ? input.event.projectId
        : input.event.projectId;
  const sourceId =
    input.kind === "correction"
      ? undefined
      : input.kind === "progress"
        ? input.event.scope.sourceId
        : input.event.sourceId;
  const sessionId =
    input.kind === "correction"
      ? input.event.scope.sessionId
      : input.kind === "plan" || input.kind === "progress"
        ? input.event.scope.sessionId
        : input.event.type === "session.started" ||
            input.event.type === "session.ended"
          ? input.event.payload.sessionId
          : input.event.sessionId;
  ensure(
    nonempty(projectId) &&
      (sourceId === undefined || nonempty(sourceId)) &&
      (sessionId === undefined || nonempty(sessionId)),
  );
  const observedAt = time(
    input.kind === "source"
      ? input.event.receivedAt
      : input.kind === "correction"
        ? input.event.at
        : input.observedAt,
  );
  const base = {
    id: `core:timeline:${JSON.stringify([input.kind, projectId, sourceId, event.id])}`,
    eventId: event.id,
    projectId,
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(sessionId === undefined ? {} : { sessionId }),
    observedAt,
    sourceOrder: "unknown" as const,
    origin:
      input.kind === "source" ? ("source" as const) : ("core_derived" as const),
  };
  switch (input.kind) {
    case "source": {
      const e = input.event;
      const evidenceRefs: ProgressEvidenceReference[] = [
        { kind: "event", eventId: e.id },
      ];
      if (e.type === "session.started" || e.type === "session.ended") {
        ensure(
          e.sessionId === undefined || e.sessionId === e.payload.sessionId,
        );
        return {
          ...base,
          kind: e.type,
          provenance: "observed",
          evidenceRefs,
          detail: { sessionId: e.payload.sessionId },
        };
      }
      if (e.type === "task.status_reported") {
        ensure(
          nonempty(e.payload.taskId) &&
            WORK_STATUSES.includes(e.payload.status),
        );
        return {
          ...base,
          kind: e.type,
          provenance: "agent_reported",
          evidenceRefs,
          detail: {
            taskId: e.payload.taskId,
            reportedStatus: e.payload.status,
          },
        };
      }
      throw new ProjectionError("unsupported_event");
    }
    case "plan": {
      const e = input.event;
      ensure(
        e.origin === "core_derived" &&
          e.type === "plan.changed" &&
          e.projectId === e.scope.projectId &&
          e.sourceId === e.scope.sourceId,
      );
      return {
        ...base,
        kind: e.type,
        rule: { id: e.ruleId, version: e.ruleVersion },
        evidenceRefs: e.evidenceRefs.map(reference),
        detail: {
          scope: scope(e.scope),
          changes: e.changes.map(change),
          ...(e.previousEventId === undefined
            ? {}
            : { previousEventId: e.previousEventId }),
        },
      };
    }
    case "progress": {
      const e = input.event;
      ensure(
        e.origin === "core_derived" &&
          e.type === "progress.changed" &&
          canonical(scope(e.current.scope)) === canonical(scope(e.scope)) &&
          (e.previous === undefined ||
            canonical(scope(e.previous.scope)) === canonical(scope(e.scope))),
      );
      return {
        ...base,
        kind: e.type,
        rule: { id: e.ruleId, version: e.ruleVersion },
        evidenceRefs: e.evidenceRefs.map(reference),
        detail: {
          scope: scope(e.scope),
          reasons: [...e.reasons],
          ...(e.previous === undefined ? {} : { before: progress(e.previous) }),
          after: progress(e.current),
        },
      };
    }
    case "correction": {
      const e = input.event;
      ensure(
        e.origin === "core_derived" &&
          [
            "correction.applied",
            "correction.superseded",
            "correction.expired",
          ].includes(e.type) &&
          e.scope.projectId === e.projectId &&
          nonempty(e.correctionId),
      );
      return {
        ...base,
        kind: e.type,
        ...(e.type === "correction.expired"
          ? {}
          : { provenance: "user_confirmed" as const }),
        rule: { id: e.ruleId, version: e.ruleVersion },
        evidenceRefs: e.evidenceRefs.map(reference),
        detail: {
          correctionId: e.correctionId,
          scope: correctionScope(e.scope),
          reasonCode: e.reasonCode,
        },
      };
    }
  }
}
export function createTimelineState(): TimelineState {
  return { entries: [] };
}
export function appendTimelineEvents(
  state: TimelineState,
  inputs: readonly TimelineInput[],
): TimelineApplicationResult {
  const entries = [...state.entries];
  const added: TimelineEntry[] = [];
  for (let index = 0; index < inputs.length; index++) {
    try {
      const projected = project(inputs[index]!);
      if (projected === undefined) continue;
      const existing = entries.find((e) => e.id === projected.id);
      if (existing !== undefined) {
        if (
          canonical({ ...existing, sequence: 0 }) !==
          canonical({ ...projected, sequence: 0 })
        )
          return {
            status: "rejected",
            state,
            added: [],
            reason: "identity_conflict",
            inputIndex: index,
          };
        continue;
      }
      const entry: TimelineEntry = {
        ...projected,
        sequence: entries.length + 1,
      };
      entries.push(entry);
      added.push(entry);
    } catch (error) {
      if (!(error instanceof ProjectionError)) throw error;
      return {
        status: "rejected",
        state,
        added: [],
        reason: error.reason,
        inputIndex: index,
      };
    }
  }
  return added.length === 0
    ? { status: "unchanged", state, added }
    : { status: "applied", state: { entries }, added };
}
export function getTimelineEntries(
  state: TimelineState,
  query: TimelineQuery,
): readonly TimelineEntry[] {
  return state.entries
    .filter(
      (e) =>
        e.projectId === query.projectId &&
        (query.sessionId === undefined || e.sessionId === query.sessionId) &&
        (query.sourceId === undefined || e.sourceId === query.sourceId),
    )
    .sort(
      (a, b) =>
        Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
        a.sequence - b.sequence,
    );
}
