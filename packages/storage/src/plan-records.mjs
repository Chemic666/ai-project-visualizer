import { closed, encode, id, plain, planGeneratedId } from "./codec.mjs";
import { demand } from "./errors.mjs";

export const PLAN_TABLE = "plan_versions";
export const PLAN_SCHEMA =
  "CREATE TABLE plan_versions(event_id TEXT PRIMARY KEY REFERENCES normalized_events(event_id),seq INTEGER NOT NULL REFERENCES commits(seq),ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_digest TEXT NOT NULL,UNIQUE(seq,ordinal)) STRICT;";

const outcomes = ["applied", "unknown", "ambiguous"];
const equal = (a, b) =>
  a === undefined || b === undefined ? a === b : encode(a) === encode(b);
const unique = (keys) => demand(new Set(keys).size === keys.length);
const key = (kind, eventId, index) =>
  "core:plan:" + kind + ":" + JSON.stringify([eventId, index]);

export function isPlanEvent(event) {
  return event.type === "plan.detected" || event.type === "plan.updated";
}

export function validatePlanScope(scope, projectId) {
  plain(scope);
  closed(scope, ["projectId", "sourceId", "planId"], ["sessionId"]);
  demand(scope.projectId === projectId);
  id(scope.sourceId);
  id(scope.planId);
  if (scope.sessionId !== undefined) id(scope.sessionId);
  return structuredClone(scope);
}

// Plan admission uses the Session metadata visible in the accepted prefix.
export function observePlanSession(visible, event) {
  if (event.type !== "session.started" && event.type !== "session.ended")
    return;
  const { sessionId, sourceSessionReference } = event.payload;
  const prior = visible.get(sessionId);
  if (prior) {
    demand(prior.sourceId === event.sourceId);
  } else if (event.type === "session.started") {
    visible.set(sessionId, {
      id: sessionId,
      sourceId: event.sourceId,
      sourceSessionId: sourceSessionReference?.reference ?? null,
      projectAssociationAssertionIds: [],
    });
  }
}

export function verifyPlanSessions(visible, sessions) {
  demand(equal([...visible.values()], sessions));
}

export function emptyPlan(core) {
  demand(!core.acceptedEvents.some(isPlanEvent));
  return { core, heads: [], revisions: [], changes: [] };
}

function recordedSequence(core, event) {
  const highest = core.acceptedEvents.reduce(
    (max, input) =>
      isPlanEvent(input) ? Math.max(max, input.sourceSequence ?? -1) : max,
    event.sourceSequence ?? -1,
  );
  return highest < 0 ? undefined : highest;
}

function validateSnapshot(
  snapshot,
  event,
  scope,
  previous,
  lastSourceSequence,
) {
  closed(
    snapshot,
    ["scope", "eventId", "completeness", "entries", "phases"],
    ["sourceSequence", "lastSourceSequence"],
  );
  demand(equal(snapshot.scope, scope) && snapshot.eventId === event.id);
  demand(
    snapshot.sourceSequence === event.sourceSequence &&
      snapshot.lastSourceSequence === lastSourceSequence,
  );
  const payload = event.payload;
  const partial = payload.completeness === "partial";
  const completeness =
    partial && previous?.completeness !== "complete" ? "partial" : "complete";
  demand(snapshot.completeness === completeness);

  const earlier = previous?.entries ?? [];
  const byItem = new Map(
    earlier.flatMap((entry) =>
      entry.sourceItemId === undefined ? [] : [[entry.sourceItemId, entry]],
    ),
  );
  const steps = payload.steps;
  const observedIds = steps.flatMap((step) =>
    step.sourceItemId === undefined ? [] : [step.sourceItemId],
  );
  unique(observedIds);
  if (earlier.length > 0) {
    demand(observedIds.length === steps.length);
    if (!partial && steps.length > 0) demand(byItem.size === earlier.length);
  }
  const deleted = payload.deletedSourceItemIds ?? [];
  unique(deleted);
  const observed = new Set(observedIds);
  demand(deleted.every((id) => byItem.has(id) && !observed.has(id)));

  const phases = new Map(
    (previous?.phases ?? []).map((phase) => [phase.sourcePhaseId, phase]),
  );
  const declarations = payload.phases ?? [];
  unique(declarations.map((phase) => phase.sourcePhaseId));
  for (const { sourcePhaseId, title } of declarations) {
    phases.set(sourcePhaseId, {
      phaseId:
        phases.get(sourcePhaseId)?.phaseId ??
        key("phase", event.id, phases.size),
      title,
      sourcePhaseId,
      provenance: payload.provenance,
    });
  }
  const updates = steps.map((step, index) => {
    const old = byItem.get(step.sourceItemId);
    if (
      step.sourcePhaseId === undefined &&
      (!partial || !old) &&
      !phases.has(undefined)
    ) {
      phases.set(undefined, {
        phaseId: key("phase", event.id, phases.size),
        title: "Plan tasks",
        provenance: "visualizer_inferred",
      });
    }
    const phaseId =
      partial && old && step.sourcePhaseId === undefined
        ? old.phaseId
        : phases.get(step.sourcePhaseId)?.phaseId;
    demand(phaseId);
    const certainty = step.certainty ?? (partial ? old?.certainty : undefined);
    return {
      old,
      entry: {
        taskId: old?.taskId ?? key("task", event.id, index),
        phaseId,
        title: step.title,
        sourceEventId: event.id,
        ...(step.sourceItemId === undefined
          ? {}
          : { sourceItemId: step.sourceItemId }),
        ...(certainty === undefined ? {} : { certainty }),
      },
    };
  });
  const updatesById = new Map(
    updates.map(({ entry }) => [entry.taskId, entry]),
  );
  const removed = new Set(deleted);
  const entries = partial
    ? [
        ...earlier
          .filter((entry) => !removed.has(entry.sourceItemId))
          .map((entry) => updatesById.get(entry.taskId) ?? entry),
        ...updates.filter(({ old }) => !old).map(({ entry }) => entry),
      ]
    : updates.map(({ entry }) => entry);
  unique(entries.map((entry) => entry.taskId));
  demand(
    equal(snapshot.phases, [...phases.values()]) &&
      equal(snapshot.entries, entries),
  );
}

function changesBetween(previous, snapshot) {
  const changes = [];
  const before = new Map(
    (previous?.entries ?? []).map((entry) => [entry.taskId, entry]),
  );
  const after = new Map(snapshot.entries.map((entry) => [entry.taskId, entry]));
  const oldPhases = new Map(
    (previous?.phases ?? []).map((phase) => [phase.phaseId, phase]),
  );
  for (const phase of snapshot.phases) {
    const old = oldPhases.get(phase.phaseId);
    if (!old) changes.push({ kind: "phase.added", phaseId: phase.phaseId });
    else if (old.title !== phase.title || old.provenance !== phase.provenance)
      changes.push({ kind: "phase.changed", phaseId: phase.phaseId });
  }
  for (const [taskId, entry] of after) {
    const old = before.get(taskId);
    if (!old) {
      changes.push({ kind: "task.added", taskId });
      continue;
    }
    const fields = [];
    if (old.title !== entry.title) fields.push("title");
    if (old.certainty !== entry.certainty) fields.push("certainty");
    if (old.phaseId !== entry.phaseId) fields.push("phase");
    if (fields.length) changes.push({ kind: "task.changed", taskId, fields });
  }
  for (const taskId of before.keys())
    if (!after.has(taskId)) changes.push({ kind: "task.removed", taskId });
  const previousTaskIds = [...before.keys()].filter((id) => after.has(id));
  const taskIds = [...after.keys()].filter((id) => before.has(id));
  if (!equal(previousTaskIds, taskIds))
    changes.push({ kind: "tasks.reordered", previousTaskIds, taskIds });
  return changes;
}

function validateChange(change, event, scope, previous, expected) {
  closed(
    change,
    [
      "id",
      "type",
      "origin",
      "projectId",
      "sourceId",
      "scope",
      "causedBy",
      "evidenceRefs",
      "ruleId",
      "ruleVersion",
      "changes",
    ],
    ["previousEventId"],
  );
  const evidence = [{ kind: "event", eventId: event.id }];
  if (previous) evidence.push({ kind: "event", eventId: previous.eventId });
  if (event.payload.sourceReference)
    evidence.push({ kind: "source", reference: event.payload.sourceReference });
  demand(
    change.id === "core:plan.changed:" + event.id &&
      change.type === "plan.changed" &&
      change.origin === "core_derived" &&
      change.projectId === scope.projectId &&
      change.sourceId === scope.sourceId &&
      equal(change.scope, scope) &&
      change.causedBy === event.id &&
      change.previousEventId === previous?.eventId &&
      equal(change.evidenceRefs, evidence) &&
      change.ruleId === "core.plan.snapshot-diff" &&
      change.ruleVersion === "1" &&
      Array.isArray(change.changes) &&
      equal(change.changes.map(encode).sort(), expected.map(encode).sort()),
  );
}

export function appendPlanVersion(
  plan,
  event,
  record,
  { planScope: scope, validatePlan },
) {
  plain(record);
  closed(record, ["version", "revision"], ["change"]);
  demand(record.version === 1);
  const { revision, change } = record;
  const previous = plan.heads[0];
  const expectedIssues = validatePlan(event, previous, plan.core);
  const expectedOutcome =
    expectedIssues.length === 0
      ? "applied"
      : expectedIssues.includes("task_identity_ambiguous")
        ? "ambiguous"
        : "unknown";
  closed(
    revision,
    ["eventId", "scope", "outcome", "issues", "taskIds"],
    ["previousHeadEventId", "snapshot"],
  );
  demand(
    revision.eventId === event.id &&
      equal(revision.scope, scope) &&
      revision.previousHeadEventId === previous?.eventId &&
      revision.outcome === expectedOutcome &&
      equal(revision.issues, expectedIssues),
  );
  const snapshot = revision.snapshot;
  if (revision.outcome === "applied") {
    demand(snapshot);
    const lastSourceSequence = recordedSequence(plan.core, event);
    validateSnapshot(snapshot, event, scope, previous, lastSourceSequence);
    const expected = changesBetween(previous, snapshot);
    demand((change !== undefined) === expected.length > 0);
    if (change !== undefined)
      validateChange(change, event, scope, previous, expected);
  } else {
    demand(snapshot === undefined && change === undefined);
  }
  const head = snapshot ?? previous;
  demand(
    equal(revision.taskIds, head?.entries.map((entry) => entry.taskId) ?? []),
  );
  return {
    core: plan.core,
    heads: head ? [head] : [],
    revisions: [...plan.revisions, revision],
    changes: change ? [...plan.changes, change] : plan.changes,
  };
}

export function planVersionFromResult(before, result, event, scope) {
  demand(outcomes.includes(result.status));
  const { state } = result;
  const revision = state.revisions.at(-1);
  demand(revision?.outcome === result.status);
  const change =
    state.changes.length > before.changes.length
      ? state.changes.at(-1)
      : undefined;
  const record = { version: 1, revision, ...(change ? { change } : {}) };
  const plan = {
    ...appendPlanVersion(before, event, record, scope),
    core: state.core,
  };
  demand(equal(plan, state));
  return { plan, record };
}

// A removed task remains a valid historical entity. Only recorded plan
// membership may explain its absence from the current Phase membership.
export function planCoreOptions(plan) {
  const { core } = plan;
  const tasks = new Map(core.tasks.map((task) => [task.id, task]));
  const phases = new Map(core.phases.map((phase) => [phase.id, phase]));
  const events = new Map(core.acceptedEvents.map((event) => [event.id, event]));
  const assertions = new Map(
    core.assertions.map((assertion) => [assertion.id, assertion]),
  );
  const knownTasks = new Set();
  const knownPhases = new Set();
  const knownAssertions = new Set();
  for (const { snapshot, eventId } of plan.revisions) {
    if (!snapshot) continue;
    const event = events.get(eventId);
    demand(event && isPlanEvent(event));
    for (const phase of snapshot.phases) knownPhases.add(phase.phaseId);
    const entries = new Map();
    for (const entry of snapshot.entries) {
      knownTasks.add(entry.taskId);
      if (entry.sourceItemId !== undefined)
        entries.set(entry.sourceItemId, entry.taskId);
    }
    for (const [index, step] of event.payload.steps.entries()) {
      if (step.certainty === undefined) continue;
      const assertionId = key("certainty", eventId, index);
      const taskId =
        step.sourceItemId === undefined
          ? key("task", eventId, index)
          : entries.get(step.sourceItemId);
      const assertion = assertions.get(assertionId);
      demand(
        assertion?.eventId === eventId &&
          assertion.sourceId === event.sourceId &&
          assertion.observedAt === event.receivedAt &&
          assertion.target === "task.certainty" &&
          assertion.targetId === taskId &&
          assertion.value === step.certainty &&
          assertion.provenance === event.payload.provenance &&
          equal(
            assertion.sourceReference,
            step.sourceReference ?? event.payload.sourceReference,
          ) &&
          tasks.get(taskId)?.certaintyAssertionIds.includes(assertionId),
      );
      knownAssertions.add(assertionId);
    }
  }
  for (const taskId of knownTasks) demand(tasks.has(taskId));
  for (const phaseId of knownPhases) demand(phases.has(phaseId));
  for (const taskId of tasks.keys())
    if (planGeneratedId(taskId, "task")) demand(knownTasks.has(taskId));
  for (const phaseId of phases.keys())
    if (planGeneratedId(phaseId, "phase")) demand(knownPhases.has(phaseId));
  for (const assertionId of assertions.keys())
    if (planGeneratedId(assertionId, "certainty"))
      demand(knownAssertions.has(assertionId));

  const head = plan.heads[0];
  const detachedTaskIds = new Set(knownTasks);
  const memberships = new Map();
  for (const entry of head?.entries ?? []) {
    const task = tasks.get(entry.taskId);
    demand(task.phaseId === entry.phaseId && task.title === entry.title);
    detachedTaskIds.delete(entry.taskId);
    const members = memberships.get(entry.phaseId) ?? [];
    members.push(entry.taskId);
    memberships.set(entry.phaseId, members);
  }
  for (const phase of head?.phases ?? []) {
    const current = phases.get(phase.phaseId);
    demand(
      current.title === phase.title &&
        equal(current.taskIds, memberships.get(phase.phaseId) ?? []),
    );
  }
  return { detachedTaskIds };
}
