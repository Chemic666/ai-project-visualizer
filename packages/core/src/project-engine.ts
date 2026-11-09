import { applyNormalizedEvent } from "./apply-event.js";
import {
  applyUserCorrection,
  expireUserCorrection,
} from "./correction-engine.js";
import type {
  CorrectionEngineEvent,
  UserCorrectionInput,
} from "./correction-engine.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type { PlanEngineState, PlanScope } from "./domain/plan.js";
import type {
  IndependentVerificationSupport,
  ProgressEngineState,
} from "./domain/progress.js";
import { applyPlanEvent, getPlanSnapshot } from "./plan-engine.js";
import {
  createProgressEngineState,
  updateProgress,
} from "./progress-engine.js";
import {
  appendTimelineEvents,
  createTimelineState,
} from "./timeline-engine.js";
import type { TimelineInput, TimelineState } from "./timeline-engine.js";

// Explicit synthetic in-memory composition, not a Storage codec/Host runtime.
// Initial state is trusted, and callers retain the returned immutable snapshot.
export interface ProjectEngineState {
  readonly scope: PlanScope;
  readonly plan: PlanEngineState;
  readonly progress: ProgressEngineState;
  readonly timeline: TimelineState;
  readonly verificationSupports: readonly IndependentVerificationSupport[];
}
export type ProjectUpdate =
  | { readonly kind: "source"; readonly event: NormalizedEvent }
  | { readonly kind: "correction"; readonly input: UserCorrectionInput };
export type ProjectUpdateResult = { readonly state: ProjectEngineState } & (
  | { readonly status: "applied" | "duplicate" }
  | { readonly status: "rejected"; readonly reason: string }
);

export function createProjectEngineState(
  plan: PlanEngineState,
  scope: PlanScope,
  verificationSupports: readonly IndependentVerificationSupport[] = [],
): ProjectEngineState {
  return {
    scope,
    plan,
    progress: createProgressEngineState(),
    timeline: createTimelineState(),
    verificationSupports,
  };
}
const instant = (value: string) =>
  typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value)
    : Number.NaN;
function reject(
  state: ProjectEngineState,
  reason: string,
): ProjectUpdateResult {
  return { status: "rejected", state, reason };
}

function dataKey(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(dataKey).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${dataKey(entry)}`)
    .join(",")}}`;
}
function sourceClaim(event: NormalizedEvent) {
  // A new normalization may assign a new internal ID/receipt to one source fact.
  return dataKey(
    Object.fromEntries(
      Object.entries(event).filter(
        ([key]) => key !== "id" && key !== "receivedAt",
      ),
    ),
  );
}

export function applyProjectUpdate(
  state: ProjectEngineState,
  update: ProjectUpdate,
  observedAt: string,
): ProjectUpdateResult {
  const at = instant(observedAt);
  const inputAt = instant(
    update.kind === "source"
      ? update.event.receivedAt
      : update.input.effectiveAt,
  );
  if (!Number.isFinite(at) || !Number.isFinite(inputAt) || inputAt > at)
    return reject(state, "invalid_observation_time");
  const { scope } = state;
  let plan = state.plan;
  const corrections: CorrectionEngineEvent[] = [];
  const inputs: TimelineInput[] = [];
  if (update.kind === "correction") {
    if (
      update.input.scope.projectId !== scope.projectId ||
      update.input.scope.sessionId !== scope.sessionId
    )
      return reject(state, "scope_mismatch");
    const applied = applyUserCorrection(plan, scope, update.input);
    if (applied.status === "rejected") return reject(state, applied.reason);
    if (applied.status === "duplicate") return { status: "duplicate", state };
    plan = applied.state;
    corrections.push(...applied.events);
  } else {
    const event = update.event;
    const eventSession =
      event.type === "session.started" || event.type === "session.ended"
        ? event.payload.sessionId
        : event.sessionId;
    if (
      event.projectId !== scope.projectId ||
      event.sourceId !== scope.sourceId ||
      eventSession !== scope.sessionId
    )
      return reject(state, "scope_mismatch");
    if (event.type === "plan.detected" || event.type === "plan.updated") {
      if (event.payload.planId !== scope.planId)
        return reject(state, "plan_scope_mismatch");
      const applied = applyPlanEvent(plan, event);
      if (applied.status === "rejected") return reject(state, applied.reason);
      if (applied.status === "duplicate") return { status: "duplicate", state };
      // Unknown/ambiguous interpretation retains the accepted source ledger.
      plan = applied.state;
    } else {
      const identity = event.sourceIdentity;
      const prior = plan.core.acceptedEvents.filter(
        (accepted) =>
          accepted.id === event.id ||
          (identity?.kind === "source_event" &&
            accepted.sourceId === event.sourceId &&
            accepted.sourceIdentity?.kind === "source_event" &&
            accepted.sourceIdentity.sourceEventId === identity.sourceEventId),
      );
      if (prior.length > 0) {
        if (
          prior.some((accepted) => sourceClaim(accepted) !== sourceClaim(event))
        )
          return reject(state, "duplicate_claim_conflict");
        return { status: "duplicate", state };
      }
      const applied = applyNormalizedEvent(plan.core, event);
      if (applied.status === "rejected") return reject(state, applied.reason);
      if (applied.status === "duplicate") return { status: "duplicate", state };
      if (event.type === "task.status_reported") {
        const current = getPlanSnapshot(plan, scope);
        if (
          current.status !== "available" ||
          !current.snapshot.entries.some(
            (entry) => entry.taskId === event.payload.taskId,
          )
        )
          return reject(state, "task_not_current_plan_member");
      }
      plan = { ...plan, core: applied.state };
    }
    inputs.push({ kind: "source", event });
    const expiryReason =
      event.type === "session.ended"
        ? "session_ended"
        : event.type === "plan.detected" || event.type === "plan.updated"
          ? "task_removed"
          : undefined;
    if (expiryReason !== undefined) {
      for (const record of plan.core.corrections) {
        if (
          record.lifecycle.status !== "active" ||
          record.scope.projectId !== scope.projectId
        )
          continue;
        const expired = expireUserCorrection(plan, {
          correctionId: record.id,
          eventId: event.id,
          expiredAt: observedAt,
          reason: expiryReason,
        });
        // Nonmatching or insufficient evidence must preserve that correction.
        if (expired.status === "rejected") {
          if (expired.reason !== "invalid_expiry_evidence")
            return reject(state, expired.reason);
          continue;
        }
        plan = expired.state;
        corrections.push(...expired.events);
      }
    }
  }
  const progress = updateProgress(
    state.progress,
    plan,
    scope,
    state.verificationSupports,
  );
  if (progress.status === "rejected")
    return reject(
      state,
      progress.result.issues[0]?.code ?? "progress_rejected",
    );
  inputs.push(
    ...plan.changes
      .slice(state.plan.changes.length)
      .map((event): TimelineInput => ({ kind: "plan", event, observedAt })),
    ...corrections.map((event): TimelineInput => ({
      kind: "correction",
      event,
    })),
    ...progress.state.changes
      .slice(state.progress.changes.length)
      .map((event): TimelineInput => ({ kind: "progress", event, observedAt })),
  );
  const timeline = appendTimelineEvents(state.timeline, inputs);
  if (timeline.status === "rejected") return reject(state, timeline.reason);
  return {
    status: "applied",
    state: {
      scope,
      plan,
      progress: progress.state,
      timeline: timeline.state,
      verificationSupports: state.verificationSupports,
    },
  };
}
