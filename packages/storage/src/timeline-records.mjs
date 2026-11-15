import { encode } from "./codec.mjs";
import { demand } from "./errors.mjs";
import { isPlanEvent } from "./plan-records.mjs";

export const TIMELINE_TABLE = "timeline_versions";
export const TIMELINE_SCHEMA =
  "CREATE TABLE timeline_versions(seq INTEGER PRIMARY KEY REFERENCES commits(seq),body TEXT NOT NULL,body_digest TEXT NOT NULL) STRICT;";

const same = (a, b) => encode(a) === encode(b);

function correctionInput(record, applied, scope) {
  const ended = applied ? undefined : record.lifecycle;
  const expired = ended?.status === "expired";
  const replacement = ended?.supersededBy;
  const trigger = ended ? ended.triggeringEventId : record.triggeringEventId;
  const type = applied
    ? "correction.applied"
    : expired
      ? "correction.expired"
      : "correction.superseded";
  const event = scope.describeCorrectionRecord(
    structuredClone(record),
    applied ? "applied" : "closed",
  );
  // The accepted record fixes every field, including the references on a
  // lifecycle change. Only this exact Core event can enter the projection.
  demand(
    same(event, {
      id:
        "core:correction:" +
        JSON.stringify([record.id, type, trigger, replacement]),
      type,
      origin: "core_derived",
      projectId: record.scope.projectId,
      scope: record.scope,
      correctionId: record.id,
      at: ended
        ? expired
          ? ended.expiredAt
          : ended.supersededAt
        : record.effectiveAt,
      reasonCode: ended?.reasonCode ?? "user_input",
      ruleId: "core.correction.lifecycle",
      ruleVersion: "1",
      evidenceRefs: [
        { kind: "correction", correctionId: record.id },
        { kind: "assertion", assertionId: record.correctedAssertionId },
        ...(record.originalAssertionId === undefined
          ? []
          : [{ kind: "assertion", assertionId: record.originalAssertionId }]),
        ...(trigger === undefined ? [] : [{ kind: "event", eventId: trigger }]),
        ...(replacement === undefined
          ? []
          : [{ kind: "correction", correctionId: replacement }]),
      ],
    }),
  );
  return { kind: "correction", event };
}

// A commit can admit a delayed observation. Its own timestamp stays intact,
// while the derived result describes everything already known at this cut.
function progressAsOf(state) {
  let latest = -Infinity;
  for (const event of state.acceptedEvents)
    latest = Math.max(latest, Date.parse(event.receivedAt));
  for (const assertion of state.assertions)
    latest = Math.max(latest, Date.parse(assertion.observedAt));
  for (const correction of state.corrections)
    latest = Math.max(latest, Date.parse(correction.effectiveAt));
  for (const conclusion of state.resolvedConclusions)
    latest = Math.max(latest, Date.parse(conclusion.resolution.resolvedAt));
  demand(Number.isFinite(latest));
  return new Date(latest).toISOString();
}

function timelineInputs(prior, plan, progressChange, correction, scope) {
  const admitted = plan.core.acceptedEvents.slice(
    prior?.state.acceptedEvents.length ?? 0,
  );
  const planChanges = new Map(
    plan.changes
      .slice(prior?.plan.changes.length ?? 0)
      .map((change) => [change.causedBy, change]),
  );
  const previous = new Map(
    (prior?.state.corrections ?? []).map((record) => [record.id, record]),
  );
  const expirations = new Map();
  const manualInputs = [];
  for (const record of plan.core.corrections) {
    const old = previous.get(record.id);
    if (old?.lifecycle.status === record.lifecycle.status) continue;
    const input = correctionInput(record, old === undefined, scope);
    if (input.event.type === "correction.expired") {
      const trigger = record.lifecycle.triggeringEventId;
      const batch = expirations.get(trigger) ?? [];
      batch.push(input);
      expirations.set(trigger, batch);
    } else {
      demand(correction !== undefined);
      manualInputs.push(input);
    }
  }
  const inputs = [];
  for (const event of admitted) {
    if (!isPlanEvent(event)) inputs.push({ kind: "source", event });
    if (planChanges.has(event.id)) {
      inputs.push({
        kind: "plan",
        event: planChanges.get(event.id),
        observedAt: event.receivedAt,
      });
      planChanges.delete(event.id);
    }
    if (expirations.has(event.id)) {
      inputs.push(...expirations.get(event.id));
      expirations.delete(event.id);
    }
  }
  demand(planChanges.size === 0 && expirations.size === 0);
  inputs.push(...manualInputs);
  if (progressChange) {
    demand(admitted.length > 0 || manualInputs.length > 0);
    inputs.push({
      kind: "progress",
      event: progressChange,
      observedAt: progressAsOf(plan.core),
    });
  }
  return inputs;
}

// Pick the allowed progress summary from the already-validated full result.
function progressView({ status, issues, ratio, completedWeight, totalWeight }) {
  return status === "unavailable"
    ? { status, issues }
    : { status, issues, ratio, completedWeight, totalWeight };
}

function verifyEntry(entry, input, sequence) {
  const { kind, event } = input;
  const { type } = event;
  const base = {
    kind: type,
    eventId: event.id,
    sequence,
    sourceOrder: "unknown",
  };
  let projectId, sourceId, sessionId, observedAt, detail, evidenceRefs;
  if (kind === "source") {
    const status = type === "task.status_reported";
    ({ projectId, sourceId } = event);
    sessionId = status ? event.sessionId : event.payload.sessionId;
    observedAt = event.receivedAt;
    evidenceRefs = [{ kind: "event", eventId: event.id }];
    base.origin = "source";
    base.provenance = status ? "agent_reported" : "observed";
    detail = status
      ? { taskId: event.payload.taskId, reportedStatus: event.payload.status }
      : { sessionId };
  } else {
    const { scope } = event;
    ({ projectId, sessionId } = scope);
    sourceId = kind === "correction" ? undefined : scope.sourceId;
    observedAt = kind === "correction" ? event.at : input.observedAt;
    evidenceRefs = event.evidenceRefs;
    base.origin = "core_derived";
    base.rule = { id: event.ruleId, version: event.ruleVersion };
    if (kind === "plan") {
      detail = {
        scope,
        changes: event.changes,
        ...(event.previousEventId === undefined
          ? {}
          : { previousEventId: event.previousEventId }),
      };
    } else if (kind === "progress") {
      detail = {
        scope,
        reasons: event.reasons,
        ...(event.previous === undefined
          ? {}
          : { before: progressView(event.previous) }),
        after: progressView(event.current),
      };
    } else {
      if (type !== "correction.expired") base.provenance = "user_confirmed";
      detail = {
        correctionId: event.correctionId,
        scope,
        reasonCode: event.reasonCode,
      };
    }
  }
  // Compare the entire record with a closed projection of admitted facts.
  // Added properties, altered timestamps and rewritten evidence all fail here.
  demand(
    same(entry, {
      ...base,
      id:
        "core:timeline:" +
        JSON.stringify([kind, projectId, sourceId, event.id]),
      projectId,
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(sessionId === undefined ? {} : { sessionId }),
      observedAt: new Date(observedAt).toISOString(),
      evidenceRefs,
      detail,
    }),
  );
}

export function appendTimelineRecord(prior = { entries: [] }, record) {
  return record === undefined
    ? prior
    : { entries: [...prior.entries, ...record.entries] };
}

export function evaluateTimeline(prior, update, scope) {
  const { plan, progressChange, correction } = update;
  const timeline = prior?.timeline ?? { entries: [] };
  const inputs = timelineInputs(prior, plan, progressChange, correction, scope);
  if (inputs.length === 0) return { timeline };
  const result = scope.appendTimelineEvents(
    structuredClone(timeline),
    structuredClone(inputs),
  );
  demand(
    result.status === "applied" &&
      Array.isArray(result.added) &&
      result.added.length === inputs.length,
  );
  const record = { version: 1, entries: result.added };
  for (const [index, input] of inputs.entries())
    verifyEntry(
      record.entries[index],
      input,
      timeline.entries.length + index + 1,
    );
  return { timeline: appendTimelineRecord(timeline, record), record };
}
