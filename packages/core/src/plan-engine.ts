import { applyNormalizedEvent } from "./apply-event.js";
import type { Assertion } from "./domain/assertion.js";
import type { AssertionId, EventId, PhaseId, TaskId } from "./domain/ids.js";
import type { NormalizedEvent } from "./domain/normalized-event.js";
import type {
  PlanApplicationResult,
  PlanChange,
  PlanChangedEvent,
  PlanEngineState,
  PlanEntry,
  PlanHead,
  PlanIssue,
  PlanScope,
  PlanSnapshotResult,
} from "./domain/plan.js";
import type { Phase } from "./domain/phase.js";
import type { Task } from "./domain/task.js";
import type { CoreState } from "./state.js";

type PlanEvent = NormalizedEvent<"plan.detected" | "plan.updated">;

export function createPlanEngineState(core: CoreState): PlanEngineState {
  if (
    core.acceptedEvents.some(
      (e) => e.type === "plan.detected" || e.type === "plan.updated",
    )
  ) {
    throw new Error("plan_history_requires_engine_state");
  }
  return { core, heads: [], revisions: [], changes: [] };
}

function sameScope(a: PlanScope, b: PlanScope): boolean {
  return (
    a.projectId === b.projectId &&
    a.sourceId === b.sourceId &&
    a.sessionId === b.sessionId &&
    a.planId === b.planId
  );
}

function scopeOf(event: PlanEvent): PlanScope {
  return {
    projectId: event.projectId,
    sourceId: event.sourceId,
    ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
    planId: event.payload.planId ?? "",
  };
}

// Consumers use this query, not a bare head, to distinguish a last-known
// projection from a newer observation that could not be reconciled.
export function getPlanSnapshot(
  state: PlanEngineState,
  scope: PlanScope,
): PlanSnapshotResult {
  const head = state.heads.find((h) => sameScope(h.scope, scope));
  const revision = state.revisions.findLast((r) => {
    if (!sameScope(r.scope, scope)) return false;
    const event = state.core.acceptedEvents.find((e) => e.id === r.eventId);
    // Proven older source observations remain history without obscuring a
    // newer accepted head. No clock or opaque revision ordering is inferred.
    return (
      r.outcome === "applied" ||
      event?.sourceSequence === undefined ||
      head?.lastSourceSequence === undefined ||
      event.sourceSequence >= head.lastSourceSequence
    );
  });
  if (revision?.outcome === "applied" && head !== undefined)
    return { status: "available", snapshot: head };
  return {
    status: revision?.outcome === "ambiguous" ? "ambiguous" : "unknown",
    issues: revision?.issues ?? ["plan_not_observed"],
    ...(head === undefined ? {} : { lastKnown: head }),
  };
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Compare normalized claims structurally, independent of object key order.
// A renormalized stable event may have a different internal ID/receipt time.
function equalData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equalData(v, b[i]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  return (
    keys.length ===
      Object.keys(right).filter((k) => right[k] !== undefined).length &&
    keys.every((k) => equalData(left[k], right[k]))
  );
}

function sameClaim(a: NormalizedEvent, b: PlanEvent): boolean {
  return equalData(
    { ...a, id: undefined, receivedAt: undefined },
    { ...b, id: undefined, receivedAt: undefined },
  );
}

function validatePlan(
  event: PlanEvent,
  head: PlanHead | undefined,
  core: CoreState,
): PlanIssue[] {
  const p = event.payload;
  const issues: PlanIssue[] = [];
  if (
    !nonempty(p.planId) ||
    !["observed", "agent_reported", "user_confirmed"].includes(
      p.provenance ?? "",
    )
  ) {
    issues.push("source_contract_missing");
  }
  const refs = [
    p.sourceReference,
    ...p.steps.map((step) => step.sourceReference),
  ];
  if (refs.some((ref) => ref !== undefined && ref.sourceId !== event.sourceId))
    issues.push("source_namespace_mismatch");
  if (event.sessionId !== undefined) {
    const session = core.sessions.find((s) => s.id === event.sessionId);
    if (session === undefined || session.sourceId !== event.sourceId)
      issues.push("session_scope_mismatch");
  }
  if (
    !["complete", "partial"].includes(p.completeness) ||
    p.steps.some(
      (step) =>
        !nonempty(step.title) ||
        (step.sourceItemId !== undefined && !nonempty(step.sourceItemId)) ||
        (step.sourcePhaseId !== undefined && !nonempty(step.sourcePhaseId)) ||
        (step.certainty !== undefined &&
          !["confirmed", "tentative", "idea"].includes(step.certainty)),
    ) ||
    (p.phases ?? []).some(
      (phase) => !nonempty(phase.sourcePhaseId) || !nonempty(phase.title),
    ) ||
    (p.deletedSourceItemIds ?? []).some((id) => !nonempty(id)) ||
    (event.sourceSequence !== undefined &&
      (!Number.isSafeInteger(event.sourceSequence) || event.sourceSequence < 0))
  ) {
    issues.push("invalid_plan");
  }
  const ids = p.steps.flatMap((step) =>
    step.sourceItemId === undefined ? [] : [step.sourceItemId],
  );
  const phaseIds = (p.phases ?? []).map((phase) => phase.sourcePhaseId);
  const deleted = p.deletedSourceItemIds ?? [];
  if (
    new Set(ids).size !== ids.length ||
    new Set(phaseIds).size !== phaseIds.length ||
    new Set(deleted).size !== deleted.length
  )
    issues.push("duplicate_source_item");
  if (deleted.some((id) => ids.includes(id)))
    issues.push("upsert_delete_conflict");
  if (deleted.some((id) => !head?.entries.some((e) => e.sourceItemId === id)))
    issues.push("unknown_deletion");
  if (
    p.steps.some(
      (step) =>
        step.sourcePhaseId !== undefined &&
        !phaseIds.includes(step.sourcePhaseId) &&
        !head?.phases.some(
          (phase) => phase.sourcePhaseId === step.sourcePhaseId,
        ),
    )
  )
    issues.push("unknown_phase");

  const prior = core.acceptedEvents
    .filter(
      (e): e is PlanEvent =>
        e.type === "plan.detected" || e.type === "plan.updated",
    )
    .filter((e) => sameScope(scopeOf(e), scopeOf(event)));
  const priorSequences = prior.flatMap((e) =>
    e.sourceSequence !== undefined &&
    Number.isSafeInteger(e.sourceSequence) &&
    e.sourceSequence >= 0
      ? [e.sourceSequence]
      : [],
  );
  if (
    event.sourceSequence !== undefined &&
    priorSequences.some((seq) => seq >= event.sourceSequence!)
  )
    issues.push("stale_source_sequence");
  const afterHead =
    head === undefined
      ? prior
      : prior.slice(prior.findIndex((e) => e.id === head.eventId) + 1);
  const pending = afterHead.filter(
    (e) =>
      e.sourceSequence === undefined ||
      head?.lastSourceSequence === undefined ||
      e.sourceSequence >= head.lastSourceSequence,
  );
  const ancestors = new Set<EventId>();
  let predecessor = p.previousEventId;
  while (predecessor !== undefined && !ancestors.has(predecessor)) {
    const observation = prior.find((e) => e.id === predecessor);
    if (observation === undefined) break;
    ancestors.add(observation.id);
    predecessor = observation.payload.previousEventId;
  }
  const coversPending =
    pending.length > 0 &&
    p.completeness === "complete" &&
    (head === undefined || ancestors.has(head.eventId)) &&
    pending.every((e) => ancestors.has(e.id));
  const ordersPending =
    p.completeness === "complete" &&
    event.sourceSequence !== undefined &&
    pending.every(
      (e) =>
        e.sourceSequence !== undefined &&
        e.sourceSequence < event.sourceSequence!,
    );
  if (pending.length > 0 && !coversPending && !ordersPending)
    issues.push("revision_order_unknown");

  if (head === undefined) {
    if (p.previousEventId !== undefined && !coversPending)
      issues.push("revision_base_mismatch");
    if (
      prior.length > 0 &&
      !coversPending &&
      (event.sourceSequence === undefined ||
        priorSequences.length !== prior.length)
    )
      issues.push("revision_order_unknown");
  } else {
    if (
      p.previousEventId !== undefined &&
      p.previousEventId !== head.eventId &&
      !coversPending
    )
      issues.push("revision_base_mismatch");
    const sequenceKnown =
      event.sourceSequence !== undefined && head.sourceSequence !== undefined;
    const lastSequence = head.lastSourceSequence ?? head.sourceSequence;
    if (
      event.sourceSequence !== undefined &&
      lastSequence !== undefined &&
      event.sourceSequence <= lastSequence
    )
      issues.push("stale_source_sequence");
    // A sequence proves ordering, not that all intervening plan deltas arrived.
    // Partial updates need the exact predecessor; full snapshots can bridge gaps.
    if (
      p.previousEventId === undefined &&
      (!sequenceKnown || p.completeness === "partial")
    )
      issues.push("revision_order_unknown");
    // No similarity, title, position, time or revision-string matching. A full
    // empty snapshot can still explicitly remove all anonymous memberships.
    if (
      (p.steps.some((step) => step.sourceItemId === undefined) &&
        head.entries.length > 0) ||
      (p.completeness === "complete" &&
        p.steps.length > 0 &&
        head.entries.some((e) => e.sourceItemId === undefined))
    ) {
      issues.push("task_identity_ambiguous");
    }
  }
  return [...new Set(issues)];
}

function appendUnresolved(
  state: PlanEngineState,
  event: PlanEvent,
  head: PlanHead | undefined,
  issues: readonly PlanIssue[],
): PlanApplicationResult {
  const status = issues.includes("task_identity_ambiguous")
    ? "ambiguous"
    : "unknown";
  return {
    status,
    issues,
    state: {
      ...state,
      revisions: [
        ...state.revisions,
        {
          eventId: event.id,
          ...(head === undefined ? {} : { previousHeadEventId: head.eventId }),
          scope: scopeOf(event),
          outcome: status,
          issues,
          taskIds: head?.entries.map((e) => e.taskId) ?? [],
        },
      ],
    },
  };
}

// Pure and explicit: does not replace Phase 1's ledger-only plan application.
// Callers supply trusted typed normalized data, never Codex/private raw payloads.
export function applyPlanEvent(
  state: PlanEngineState,
  event: PlanEvent,
): PlanApplicationResult {
  if (
    event.sourceSequence !== undefined &&
    (!Number.isSafeInteger(event.sourceSequence) || event.sourceSequence < 0)
  ) {
    return { status: "rejected", reason: "invalid_source_sequence", state };
  }
  const internal = state.core.acceptedEvents.find((e) => e.id === event.id);
  const identity = event.sourceIdentity;
  const stable =
    identity?.kind === "source_event"
      ? state.core.acceptedEvents.find(
          (e) =>
            e.sourceId === event.sourceId &&
            e.sourceIdentity?.kind === "source_event" &&
            e.sourceIdentity.sourceEventId === identity.sourceEventId,
        )
      : undefined;
  if (
    (internal !== undefined && !sameClaim(internal, event)) ||
    (stable !== undefined && !sameClaim(stable, event))
  ) {
    return { status: "rejected", reason: "duplicate_claim_conflict", state };
  }
  const accepted = applyNormalizedEvent(state.core, event);
  if (accepted.status === "rejected")
    return { status: "rejected", reason: accepted.reason, state };
  if (accepted.status === "duplicate") return { status: "duplicate", state };

  const scope = scopeOf(event);
  const previous = state.heads.find((head) => sameScope(head.scope, scope));
  const retained = { ...state, core: accepted.state };
  const issues = validatePlan(event, previous, state.core);
  if (issues.length > 0)
    return appendUnresolved(retained, event, previous, issues);
  return reconcile(retained, event, scope, previous);
}

function reconcile(
  state: PlanEngineState,
  event: PlanEvent,
  scope: PlanScope,
  previous: PlanHead | undefined,
): PlanApplicationResult {
  const payload = event.payload;
  const core = state.core;
  const changes: PlanChange[] = [];
  const phases = [...(previous?.phases ?? [])];
  let corePhases = [...core.phases];
  let tasks = [...core.tasks];
  const assertions = [...core.assertions];
  const before = previous?.entries ?? [];
  const deleted = payload.deletedSourceItemIds ?? [];

  function addPhase(sourcePhaseId: string | undefined, title: string): PhaseId {
    const provenance =
      sourcePhaseId === undefined ? "visualizer_inferred" : payload.provenance!;
    const existing = phases.find(
      (phase) => phase.sourcePhaseId === sourcePhaseId,
    );
    if (existing !== undefined) {
      const old = corePhases.find((p) => p.id === existing.phaseId)!;
      if (old.title !== title || existing.provenance !== provenance) {
        corePhases = corePhases.map((p) =>
          p.id === old.id ? { ...p, title } : p,
        );
        changes.push({ kind: "phase.changed", phaseId: old.id });
      }
      phases[phases.indexOf(existing)] = { ...existing, title, provenance };
      return existing.phaseId;
    }
    const phaseId =
      `core:plan:phase:${JSON.stringify([event.id, phases.length])}` as PhaseId;
    if (core.phases.some((p) => p.id === phaseId))
      throw new Error("internal_id_collision");
    phases.push({
      phaseId,
      title,
      ...(sourcePhaseId === undefined ? {} : { sourcePhaseId }),
      provenance,
    });
    corePhases.push({
      id: phaseId,
      projectId: scope.projectId,
      title,
      taskIds: [],
      statusAssertionIds: [],
    });
    changes.push({ kind: "phase.added", phaseId });
    return phaseId;
  }

  let entries: PlanEntry[] =
    payload.completeness === "partial"
      ? before.filter((e) => !deleted.includes(e.sourceItemId ?? ""))
      : [];
  // Work on local copies only; a deterministic-ID collision never partly applies.
  try {
    for (const phase of payload.phases ?? [])
      addPhase(phase.sourcePhaseId, phase.title);
    for (const [index, step] of payload.steps.entries()) {
      const old =
        step.sourceItemId === undefined
          ? undefined
          : before.find((e) => e.sourceItemId === step.sourceItemId);
      const oldTask =
        old === undefined ? undefined : tasks.find((t) => t.id === old.taskId);
      const phaseId =
        step.sourcePhaseId === undefined
          ? payload.completeness === "partial" && old !== undefined
            ? old.phaseId
            : addPhase(undefined, "Plan tasks")
          : phases.find((p) => p.sourcePhaseId === step.sourcePhaseId)!.phaseId;
      const taskId =
        old?.taskId ??
        (`core:plan:task:${JSON.stringify([event.id, index])}` as TaskId);
      if (old === undefined && tasks.some((t) => t.id === taskId))
        throw new Error("internal_id_collision");
      const certainty =
        step.certainty ??
        (payload.completeness === "partial" ? old?.certainty : undefined);
      const entry: PlanEntry = {
        taskId,
        phaseId,
        title: step.title,
        sourceEventId: event.id,
        ...(step.sourceItemId === undefined
          ? {}
          : { sourceItemId: step.sourceItemId }),
        ...(certainty === undefined ? {} : { certainty }),
      };
      const assertionIds = [...(oldTask?.certaintyAssertionIds ?? [])];
      if (step.certainty !== undefined) {
        const id =
          `core:plan:certainty:${JSON.stringify([event.id, index])}` as AssertionId;
        if (assertions.some((a) => a.id === id))
          throw new Error("internal_id_collision");
        const assertion: Assertion<"task.certainty"> = {
          id,
          target: "task.certainty",
          targetId: taskId,
          value: step.certainty,
          provenance: payload.provenance!,
          sourceId: event.sourceId,
          eventId: event.id,
          observedAt: event.receivedAt,
          ...((step.sourceReference ?? payload.sourceReference)
            ? {
                sourceReference:
                  step.sourceReference ?? payload.sourceReference!,
              }
            : {}),
        };
        assertionIds.push(id);
        assertions.push(assertion);
      }
      const task: Task = {
        id: taskId,
        phaseId,
        title: step.title,
        certaintyAssertionIds: assertionIds,
        statusAssertionIds: oldTask?.statusAssertionIds ?? [],
        weightAssertionIds: oldTask?.weightAssertionIds ?? [],
      };
      if (oldTask === undefined) {
        tasks.push(task);
        changes.push({ kind: "task.added", taskId });
      } else {
        tasks = tasks.map((t) => (t.id === taskId ? task : t));
        const fields: ("title" | "certainty" | "phase")[] = [];
        if (oldTask.title !== task.title) fields.push("title");
        if (old?.certainty !== certainty) fields.push("certainty");
        if (oldTask.phaseId !== phaseId) fields.push("phase");
        if (fields.length > 0)
          changes.push({ kind: "task.changed", taskId, fields });
      }
      if (payload.completeness === "partial" && old !== undefined) {
        entries = entries.map((e) => (e.taskId === taskId ? entry : e));
      } else entries.push(entry);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "internal_id_collision")
      return appendUnresolved(state, event, previous, [
        "internal_id_collision",
      ]);
    throw error;
  }
  for (const old of before) {
    if (!entries.some((e) => e.taskId === old.taskId))
      changes.push({ kind: "task.removed", taskId: old.taskId });
  }
  const previousCommon = before
    .filter((e) => entries.some((n) => n.taskId === e.taskId))
    .map((e) => e.taskId);
  const currentCommon = entries
    .filter((e) => before.some((n) => n.taskId === e.taskId))
    .map((e) => e.taskId);
  if (!equalData(previousCommon, currentCommon))
    changes.push({
      kind: "tasks.reordered",
      previousTaskIds: previousCommon,
      taskIds: currentCommon,
    });

  // Replace only this source plan's owned membership. Historical Tasks,
  // Assertions, resolved conclusions and Correction records are never erased.
  corePhases = corePhases.map((phase): Phase =>
    phases.some((p) => p.phaseId === phase.id)
      ? {
          ...phase,
          taskIds: entries
            .filter((e) => e.phaseId === phase.id)
            .map((e) => e.taskId),
        }
      : phase,
  );
  const sequences = core.acceptedEvents
    .filter(
      (e): e is PlanEvent =>
        e.type === "plan.detected" || e.type === "plan.updated",
    )
    .filter((e) => sameScope(scopeOf(e), scope))
    .flatMap((e) =>
      e.sourceSequence !== undefined &&
      Number.isSafeInteger(e.sourceSequence) &&
      e.sourceSequence >= 0
        ? [e.sourceSequence]
        : [],
    );
  const lastSequence = sequences.reduce<number | undefined>(
    (highest, seq) => (highest === undefined || seq > highest ? seq : highest),
    undefined,
  );
  const head: PlanHead = {
    scope,
    eventId: event.id,
    entries,
    phases,
    completeness:
      payload.completeness === "complete" ||
      previous?.completeness === "complete"
        ? "complete"
        : "partial",
    ...(event.sourceSequence === undefined
      ? {}
      : { sourceSequence: event.sourceSequence }),
    ...(lastSequence === undefined ? {} : { lastSourceSequence: lastSequence }),
  };
  const derived: PlanChangedEvent = {
    id: `core:plan.changed:${event.id}` as EventId,
    type: "plan.changed",
    origin: "core_derived",
    projectId: event.projectId,
    sourceId: event.sourceId,
    scope,
    causedBy: event.id,
    ...(previous === undefined ? {} : { previousEventId: previous.eventId }),
    evidenceRefs: [
      { kind: "event", eventId: event.id },
      ...(previous === undefined
        ? []
        : [{ kind: "event" as const, eventId: previous.eventId }]),
      ...(payload.sourceReference === undefined
        ? []
        : [{ kind: "source" as const, reference: payload.sourceReference }]),
    ],
    ruleId: "core.plan.snapshot-diff",
    ruleVersion: "1",
    changes,
  };
  return {
    status: "applied",
    state: {
      ...state,
      core: {
        ...core,
        tasks,
        phases: corePhases,
        assertions,
        projects: core.projects.map((project) =>
          project.id === scope.projectId
            ? {
                ...project,
                phaseIds: [
                  ...new Set([
                    ...project.phaseIds,
                    ...phases.map((p) => p.phaseId),
                  ]),
                ],
              }
            : project,
        ),
      },
      heads:
        previous === undefined
          ? [...state.heads, head]
          : state.heads.map((h) => (h === previous ? head : h)),
      revisions: [
        ...state.revisions,
        {
          eventId: event.id,
          scope,
          snapshot: head,
          ...(previous === undefined
            ? {}
            : { previousHeadEventId: previous.eventId }),
          outcome: "applied",
          issues: [],
          taskIds: entries.map((e) => e.taskId),
        },
      ],
      changes:
        changes.length === 0 ? state.changes : [...state.changes, derived],
    },
  };
}
