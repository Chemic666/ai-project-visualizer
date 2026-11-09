import type { Assertion } from "./domain/assertion.js";
import type { CorrectionRecord, CorrectionScope } from "./domain/correction.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  ProjectId,
  SessionId,
  TaskId,
} from "./domain/ids.js";
import type { PlanEngineState, PlanScope } from "./domain/plan.js";
import type { TimelineReference } from "./domain/timeline-reference.js";
import type { CoreState } from "./state.js";
import { getPlanSnapshot } from "./plan-engine.js";

type SupportedScope = Exclude<
  CorrectionScope,
  { kind: "historical_activity_association" }
>;
export interface UserCorrectionInput {
  readonly id: CorrectionId;
  readonly scope: SupportedScope;
  readonly assertion: Assertion<"task.weight" | "project.currentTask">;
  readonly effectiveAt: string;
  readonly originalAssertionId?: AssertionId;
  readonly supersedes?: CorrectionId;
  readonly triggeringEventId?: EventId;
}
export interface CorrectionExpiryInput {
  readonly correctionId: CorrectionId;
  readonly eventId: EventId;
  readonly expiredAt: string;
  readonly reason: "session_ended" | "task_removed";
}
export interface CorrectionEngineEvent {
  readonly id: EventId;
  readonly type:
    "correction.applied" | "correction.superseded" | "correction.expired";
  readonly origin: "core_derived";
  readonly projectId: ProjectId;
  readonly scope: CorrectionScope;
  readonly correctionId: CorrectionId;
  readonly at: string;
  readonly reasonCode: string;
  readonly ruleId: "core.correction.lifecycle";
  readonly ruleVersion: "1";
  readonly evidenceRefs: readonly TimelineReference[];
}
export type CorrectionApplicationResult = {
  readonly state: PlanEngineState;
  readonly events: readonly CorrectionEngineEvent[];
} & (
  | { readonly status: "applied" | "duplicate" }
  | { readonly status: "rejected"; readonly reason: string }
);
export type UserCorrectedCurrentTask =
  | { readonly status: "unknown" | "conflict" }
  | {
      readonly status: "available";
      readonly taskId: TaskId;
      readonly provenance: "user_confirmed";
      readonly assertion: Assertion<"project.currentTask">;
      readonly correction: CorrectionRecord;
    };

const rule = { ruleId: "core.correction.lifecycle", ruleVersion: "1" } as const;
const nonempty = (value: string) =>
  typeof value === "string" && value.trim().length > 0;
const instant = (value: string) =>
  typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value)
    : Number.NaN;
const receivedBy = (event: { readonly receivedAt: string }, at: number) =>
  Number.isFinite(instant(event.receivedAt)) && instant(event.receivedAt) <= at;
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
function reject(
  state: PlanEngineState,
  reason: string,
): CorrectionApplicationResult {
  return { status: "rejected", state, events: [], reason };
}
function sameScope(a: PlanScope, b: PlanScope) {
  return (
    a.projectId === b.projectId &&
    a.sourceId === b.sourceId &&
    a.sessionId === b.sessionId &&
    a.planId === b.planId
  );
}
function overlaps(a: CorrectionScope, b: SupportedScope) {
  if (a.projectId !== b.projectId || a.kind !== b.kind) return false;
  if (a.kind === "current_task" && b.kind === "current_task")
    return a.sessionId === b.sessionId;
  return (
    a.kind === "task_weight" &&
    b.kind === "task_weight" &&
    a.taskId === b.taskId &&
    (a.sessionId === undefined ||
      b.sessionId === undefined ||
      a.sessionId === b.sessionId)
  );
}
function taskInProject(core: CoreState, taskId: TaskId, projectId: ProjectId) {
  const task = core.tasks.find((t) => t.id === taskId);
  return (
    task !== undefined &&
    core.phases.some((p) => p.id === task.phaseId && p.projectId === projectId)
  );
}
function derived(
  record: CorrectionRecord,
  type: CorrectionEngineEvent["type"],
  at: string,
  reasonCode: string,
  trigger?: EventId,
  replacement?: CorrectionId,
): CorrectionEngineEvent {
  return {
    id: `core:correction:${JSON.stringify([record.id, type, trigger, replacement])}` as EventId,
    type,
    origin: "core_derived",
    projectId: record.scope.projectId,
    scope: record.scope,
    correctionId: record.id,
    at,
    reasonCode,
    ...rule,
    evidenceRefs: [
      { kind: "correction", correctionId: record.id },
      { kind: "assertion", assertionId: record.correctedAssertionId },
      ...(record.originalAssertionId === undefined
        ? []
        : [
            {
              kind: "assertion" as const,
              assertionId: record.originalAssertionId,
            },
          ]),
      ...(trigger === undefined
        ? []
        : [{ kind: "event" as const, eventId: trigger }]),
      ...(replacement === undefined
        ? []
        : [{ kind: "correction" as const, correctionId: replacement }]),
    ],
  };
}

export function applyUserCorrection(
  state: PlanEngineState,
  scope: PlanScope,
  input: UserCorrectionInput,
): CorrectionApplicationResult {
  const { assertion, effectiveAt } = input;
  const at = instant(effectiveAt);
  if (
    !nonempty(input.id) ||
    !nonempty(assertion.id) ||
    !nonempty(assertion.sourceId) ||
    assertion.provenance !== "user_confirmed" ||
    !Number.isFinite(at) ||
    !Number.isFinite(instant(assertion.observedAt)) ||
    instant(assertion.observedAt) > at ||
    (input.scope.kind !== "task_weight" && input.scope.kind !== "current_task")
  )
    return reject(state, "invalid_input");
  const prior = state.core.corrections.find((c) => c.id === input.id);
  if (prior !== undefined) {
    const original = state.core.assertions.find(
      (a) => a.id === prior.correctedAssertionId,
    );
    const same =
      canonical(prior.scope) === canonical(input.scope) &&
      prior.effectiveAt === effectiveAt &&
      prior.correctedAssertionId === assertion.id &&
      prior.originalAssertionId === input.originalAssertionId &&
      prior.triggeringEventId === input.triggeringEventId &&
      (input.supersedes === undefined ||
        prior.supersedes === input.supersedes) &&
      canonical(original) === canonical(assertion);
    return same
      ? { status: "duplicate", state, events: [] }
      : reject(state, "correction_id_conflict");
  }
  if (state.core.assertions.some((a) => a.id === assertion.id))
    return reject(state, "assertion_id_conflict");
  if (
    scope.projectId !== input.scope.projectId ||
    !state.core.projects.some((p) => p.id === scope.projectId)
  )
    return reject(state, "project_scope_mismatch");
  if (
    input.scope.sessionId !== undefined &&
    scope.sessionId !== undefined &&
    input.scope.sessionId !== scope.sessionId
  )
    return reject(state, "session_scope_mismatch");
  if (input.scope.kind === "task_weight") {
    if (
      assertion.target !== "task.weight" ||
      assertion.targetId !== input.scope.taskId ||
      typeof assertion.value !== "number" ||
      !Number.isFinite(assertion.value) ||
      assertion.value <= 0
    )
      return reject(state, "invalid_weight");
  } else if (
    assertion.target !== "project.currentTask" ||
    assertion.targetId !== input.scope.projectId
  )
    return reject(state, "invalid_current_task");
  const taskId =
    assertion.target === "task.weight" ? assertion.targetId : assertion.value;
  const plan = getPlanSnapshot(state, scope);
  if (
    !taskInProject(state.core, taskId, scope.projectId) ||
    plan.status !== "available" ||
    !plan.snapshot.entries.some((e) => e.taskId === taskId)
  )
    return reject(state, "task_not_current_plan_member");
  const headEvent = state.core.acceptedEvents.find(
    (e) => e.id === plan.snapshot.eventId,
  );
  if (
    headEvent === undefined ||
    !Number.isFinite(instant(headEvent.receivedAt)) ||
    instant(headEvent.receivedAt) > at
  )
    return reject(state, "correction_time_precedes_plan");
  const reference = assertion.sourceReference;
  if (
    reference !== undefined &&
    (reference.sourceId !== assertion.sourceId ||
      (reference.reference === undefined && reference.revision === undefined) ||
      (reference.reference !== undefined && !nonempty(reference.reference)) ||
      (reference.revision !== undefined && !nonempty(reference.revision)))
  )
    return reject(state, "invalid_source_reference");
  if (
    assertion.eventId !== undefined &&
    !state.core.acceptedEvents.some(
      (e) =>
        e.id === assertion.eventId &&
        e.projectId === scope.projectId &&
        e.sourceId === assertion.sourceId &&
        receivedBy(e, instant(assertion.observedAt)),
    )
  )
    return reject(state, "invalid_assertion_event");
  if (
    input.triggeringEventId !== undefined &&
    !state.core.acceptedEvents.some(
      (e) =>
        e.id === input.triggeringEventId &&
        e.projectId === scope.projectId &&
        receivedBy(e, at),
    )
  )
    return reject(state, "invalid_trigger");
  if (
    input.originalAssertionId !== undefined &&
    !state.core.assertions.some(
      (a) =>
        a.id === input.originalAssertionId &&
        a.target === assertion.target &&
        a.targetId === assertion.targetId &&
        Number.isFinite(instant(a.observedAt)) &&
        instant(a.observedAt) <= at,
    )
  )
    return reject(state, "invalid_original_assertion");
  if (input.scope.sessionId !== undefined) {
    const sessionId = input.scope.sessionId;
    const session = state.core.sessions.find((s) => s.id === sessionId);
    if (
      session === undefined ||
      !state.core.acceptedEvents.some(
        (e) =>
          e.type === "session.started" &&
          e.projectId === scope.projectId &&
          e.sourceId === session.sourceId &&
          e.payload.sessionId === sessionId &&
          receivedBy(e, at),
      )
    )
      return reject(state, "session_association_unknown");
    if (
      input.scope.kind === "current_task" &&
      state.core.acceptedEvents.some(
        (e) =>
          e.type === "session.ended" &&
          e.projectId === scope.projectId &&
          e.sourceId === session.sourceId &&
          e.payload.sessionId === sessionId,
      )
    )
      return reject(state, "session_ended");
  }
  const active = state.core.corrections.filter(
    (c) => c.lifecycle.status === "active" && overlaps(c.scope, input.scope),
  );
  if (active.length > 1) return reject(state, "correction_conflict");
  const previous = active[0];
  if (
    previous !== undefined &&
    canonical(previous.scope) !== canonical(input.scope)
  )
    return reject(state, "correction_scope_conflict");
  if (input.supersedes !== undefined && previous?.id !== input.supersedes)
    return reject(state, "invalid_supersession");
  if (
    previous !== undefined &&
    (!Number.isFinite(instant(previous.effectiveAt)) ||
      instant(previous.effectiveAt) > at)
  )
    return reject(state, "stale_correction");
  const record: CorrectionRecord = {
    id: input.id,
    scope: input.scope,
    correctedAssertionId: assertion.id,
    effectiveAt,
    ...(input.originalAssertionId === undefined
      ? {}
      : { originalAssertionId: input.originalAssertionId }),
    ...(previous === undefined ? {} : { supersedes: previous.id }),
    ...(input.triggeringEventId === undefined
      ? {}
      : { triggeringEventId: input.triggeringEventId }),
    lifecycle: { status: "active" },
  };
  const corrections = state.core.corrections.map((c) =>
    c.id !== previous?.id
      ? c
      : {
          ...c,
          lifecycle: {
            status: "superseded" as const,
            supersededBy: input.id,
            supersededAt: effectiveAt,
            reasonCode: "user_replaced",
            ...rule,
            ...(input.triggeringEventId === undefined
              ? {}
              : { triggeringEventId: input.triggeringEventId }),
          },
        },
  );
  const core: CoreState = {
    ...state.core,
    assertions: [...state.core.assertions, assertion],
    corrections: [...corrections, record],
    tasks:
      assertion.target === "task.weight"
        ? state.core.tasks.map((t) =>
            t.id === assertion.targetId
              ? {
                  ...t,
                  weightAssertionIds: [...t.weightAssertionIds, assertion.id],
                }
              : t,
          )
        : state.core.tasks,
    projects:
      assertion.target === "project.currentTask"
        ? state.core.projects.map((p) =>
            p.id === assertion.targetId
              ? {
                  ...p,
                  currentTaskAssertionIds: [
                    ...p.currentTaskAssertionIds,
                    assertion.id,
                  ],
                }
              : p,
          )
        : state.core.projects,
  };
  return {
    status: "applied",
    state: { ...state, core },
    events: [
      ...(previous === undefined
        ? []
        : [
            derived(
              previous,
              "correction.superseded",
              effectiveAt,
              "user_replaced",
              input.triggeringEventId,
              input.id,
            ),
          ]),
      derived(
        record,
        "correction.applied",
        effectiveAt,
        "user_input",
        input.triggeringEventId,
      ),
    ],
  };
}

export function expireUserCorrection(
  state: PlanEngineState,
  input: CorrectionExpiryInput,
): CorrectionApplicationResult {
  const record = state.core.corrections.find(
    (c) => c.id === input.correctionId,
  );
  if (record === undefined) return reject(state, "correction_not_found");
  if (record.lifecycle.status === "expired") {
    return record.lifecycle.expiredAt === input.expiredAt &&
      record.lifecycle.triggeringEventId === input.eventId &&
      record.lifecycle.reasonCode === input.reason
      ? { status: "duplicate", state, events: [] }
      : reject(state, "correction_closed");
  }
  if (record.lifecycle.status !== "active")
    return reject(state, "correction_closed");
  const event = state.core.acceptedEvents.find((e) => e.id === input.eventId);
  const at = instant(input.expiredAt);
  if (
    event === undefined ||
    event.projectId !== record.scope.projectId ||
    !Number.isFinite(at) ||
    !Number.isFinite(instant(event.receivedAt)) ||
    !Number.isFinite(instant(record.effectiveAt)) ||
    instant(event.receivedAt) < instant(record.effectiveAt) ||
    at < instant(event.receivedAt)
  )
    return reject(state, "invalid_expiry_evidence");
  let valid = false;
  if (
    input.reason === "session_ended" &&
    record.scope.kind === "current_task" &&
    event.type === "session.ended"
  ) {
    const sessionId = record.scope.sessionId;
    valid =
      event.payload.sessionId === sessionId &&
      state.core.sessions.some(
        (s) => s.id === sessionId && s.sourceId === event.sourceId,
      );
  } else if (
    input.reason === "task_removed" &&
    record.scope.kind !== "historical_activity_association" &&
    (event.type === "plan.detected" || event.type === "plan.updated")
  ) {
    const assertion = state.core.assertions.find(
      (a) => a.id === record.correctedAssertionId,
    );
    const taskId =
      record.scope.kind === "task_weight"
        ? record.scope.taskId
        : assertion?.target === "project.currentTask"
          ? assertion.value
          : undefined;
    const revisionIndex = state.revisions.findIndex(
      (r) => r.eventId === event.id && r.outcome === "applied",
    );
    const revision = state.revisions[revisionIndex];
    if (
      revision !== undefined &&
      taskId !== undefined &&
      (record.scope.sessionId === undefined ||
        revision.scope.sessionId === undefined ||
        revision.scope.sessionId === record.scope.sessionId)
    ) {
      const current = getPlanSnapshot(state, revision.scope);
      const previous = state.revisions.find(
        (r) =>
          r.eventId === revision.previousHeadEventId &&
          r.outcome === "applied" &&
          sameScope(r.scope, revision.scope),
      );
      const explicitlyDeleted =
        record.scope.kind === "task_weight" &&
        event.payload.completeness === "partial" &&
        previous?.snapshot?.entries.some(
          (entry) =>
            entry.taskId === taskId &&
            entry.sourceItemId !== undefined &&
            event.payload.deletedSourceItemIds?.includes(entry.sourceItemId),
        );
      valid =
        (event.payload.completeness === "complete" ||
          explicitlyDeleted === true) &&
        current.status === "available" &&
        current.snapshot.eventId === event.id &&
        !current.snapshot.entries.some((e) => e.taskId === taskId) &&
        state.revisions
          .slice(0, revisionIndex)
          .some(
            (r) =>
              r.outcome === "applied" &&
              sameScope(r.scope, revision.scope) &&
              r.snapshot?.entries.some((e) => e.taskId === taskId),
          );
    }
  }
  if (!valid) return reject(state, "invalid_expiry_evidence");
  const expired: CorrectionRecord = {
    ...record,
    lifecycle: {
      status: "expired",
      expiredAt: input.expiredAt,
      reasonCode: input.reason,
      ...rule,
      triggeringEventId: input.eventId,
    },
  };
  return {
    status: "applied",
    state: {
      ...state,
      core: {
        ...state.core,
        corrections: state.core.corrections.map((c) =>
          c.id === record.id ? expired : c,
        ),
      },
    },
    events: [
      derived(
        expired,
        "correction.expired",
        input.expiredAt,
        input.reason,
        input.eventId,
      ),
    ],
  };
}

export function getUserCorrectedCurrentTask(
  core: CoreState,
  projectId: ProjectId,
  sessionId: SessionId,
): UserCorrectedCurrentTask {
  const active = core.corrections.filter(
    (c) =>
      c.scope.kind === "current_task" &&
      c.scope.projectId === projectId &&
      c.scope.sessionId === sessionId &&
      c.lifecycle.status === "active",
  );
  if (active.length === 0) return { status: "unknown" };
  if (active.length !== 1) return { status: "conflict" };
  const correction = active[0]!;
  const assertion = core.assertions.find(
    (a) => a.id === correction.correctedAssertionId,
  );
  if (
    assertion?.target !== "project.currentTask" ||
    assertion.targetId !== projectId ||
    assertion.provenance !== "user_confirmed" ||
    !taskInProject(core, assertion.value, projectId)
  )
    return { status: "conflict" };
  return {
    status: "available",
    taskId: assertion.value,
    provenance: "user_confirmed",
    assertion,
    correction,
  };
}
