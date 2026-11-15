import { closed, encode, plain, planGeneratedId } from "./codec.mjs";
import { demand } from "./errors.mjs";

export const PROGRESS_TABLE = "progress_versions";
export const PROGRESS_SCHEMA =
  "CREATE TABLE progress_versions(seq INTEGER PRIMARY KEY NOT NULL REFERENCES commits(seq),body TEXT NOT NULL,body_digest TEXT NOT NULL) STRICT;";

const reasons = new Set([
  "initial_calculation",
  "plan_expanded",
  "plan_reduced",
  "plan_revision_changed",
  "task_reopened",
  "status_changed",
  "weight_changed",
  "weight_corrected",
  "progress_unavailable",
  "progress_available",
  "evidence_changed",
]);
const issues = new Set([
  "plan_unknown",
  "plan_ambiguous",
  "plan_incomplete",
  "plan_inconsistent",
  "certainty_unknown",
  "invalid_reference",
  "weight_unknown",
  "invalid_weight",
  "weight_conflict",
  "status_conflict",
  "correction_conflict",
  "invalid_correction",
  "zero_denominator",
  "numeric_range",
]);
const completionReasons = new Set([
  "explicit_completion_report",
  "verification_evidence_missing",
  "completion_evidence_missing",
  "inference_not_eligible",
  "status_unknown",
  "not_completed",
  "excluded",
]);
const same = (a, b) =>
  a === undefined || b === undefined ? a === b : encode(a) === encode(b);
const empty = () => ({ snapshots: [], changes: [] });

function verifyVersion(record, prior, plan, scope) {
  plain(record);
  const { change, correctionHistory } = record;
  const { current } = change;
  const snapshot = plan.heads[0];
  const previous = prior.snapshots.at(-1)?.result;
  closed(
    change,
    [
      "id",
      "type",
      "origin",
      "scope",
      "reasons",
      "current",
      "evidenceRefs",
      "ruleId",
      "ruleVersion",
    ],
    previous === undefined ? [] : ["previous"],
  );
  demand(
    change.id ===
      "core:progress.changed:" +
        JSON.stringify([scope, prior.snapshots.length]) &&
      change.type === "progress.changed" &&
      change.origin === "core_derived" &&
      change.ruleId === "core.progress.confirmed-weight" &&
      change.ruleVersion === "1" &&
      same(change.scope, scope) &&
      same(change.previous, previous),
  );
  demand(
    Array.isArray(change.reasons) &&
      change.reasons.length > 0 &&
      change.reasons.every((reason) => reasons.has(reason)),
  );
  const available = current.status === "available";
  demand(available || current.status === "unavailable");
  closed(current, [
    "status",
    "scope",
    "tasks",
    "phases",
    "issues",
    "evidenceRefs",
    ...(available ? ["completedWeight", "totalWeight", "ratio"] : []),
    ...(snapshot === undefined ? [] : ["planRevisionEventId", "planSnapshot"]),
  ]);
  demand(
    same(current.scope, scope) &&
      current.planRevisionEventId === snapshot?.eventId &&
      same(current.planSnapshot, snapshot),
  );

  const assertions = new Map(plan.core.assertions.map((a) => [a.id, a]));
  const events = new Set(plan.core.acceptedEvents.map((e) => e.id));
  const corrections = new Map(plan.core.corrections.map((c) => [c.id, c]));
  const entries = new Map(
    snapshot?.entries.map((entry) => [entry.taskId, entry]),
  );
  const phases = new Set(snapshot?.phases.map((phase) => phase.phaseId));
  const sources = new Set(
    plan.core.assertions.flatMap((a) =>
      a.sourceReference === undefined ? [] : [encode(a.sourceReference)],
    ),
  );
  const conclusions = new Map(
    plan.core.resolvedConclusions.map((r) => [
      encode([r.target, r.targetId]),
      r,
    ]),
  );
  const checkRefs = (refs) => {
    demand(Array.isArray(refs));
    for (const ref of refs) {
      if (ref.kind === "event") {
        closed(ref, ["kind", "eventId"]);
        demand(events.has(ref.eventId));
      } else if (ref.kind === "assertion") {
        closed(ref, ["kind", "assertionId"]);
        demand(assertions.has(ref.assertionId));
      } else if (ref.kind === "correction") {
        closed(ref, ["kind", "correctionId"]);
        demand(corrections.has(ref.correctionId));
      } else {
        closed(ref, ["kind", "reference"]);
        demand(ref.kind === "source" && sources.has(encode(ref.reference)));
      }
    }
  };
  const checkCorrections = (records) => {
    demand(Array.isArray(records));
    for (const saved of records) demand(same(saved, corrections.get(saved.id)));
  };
  checkRefs(current.evidenceRefs);
  checkRefs(change.evidenceRefs);
  checkCorrections(correctionHistory);
  demand(
    Array.isArray(current.tasks) &&
      Array.isArray(current.issues) &&
      Array.isArray(current.phases),
  );
  for (const issue of current.issues) {
    closed(issue, ["code"], ["taskId"]);
    demand(
      issues.has(issue.code) &&
        (issue.taskId === undefined || entries.has(issue.taskId)),
    );
  }
  for (const task of current.tasks) {
    closed(
      task,
      [
        "entry",
        "included",
        "completion",
        "completionReason",
        "certaintyAssertions",
        "weightAssertions",
        "statusAssertions",
        "corrections",
      ],
      [
        "selectedWeightAssertionId",
        "selectedStatusAssertionId",
        "effectiveWeight",
        "weightResolution",
        "statusResolution",
      ],
    );
    const taskId = task.entry.taskId;
    demand(
      same(task.entry, entries.get(taskId)) &&
        task.included === (task.entry.certainty === "confirmed"),
    );
    demand(
      ["completed", "not_completed", "unknown"].includes(task.completion) &&
        completionReasons.has(task.completionReason),
    );
    for (const [field, target] of [
      ["certaintyAssertions", "task.certainty"],
      ["weightAssertions", "task.weight"],
      ["statusAssertions", "task.status"],
    ]) {
      demand(Array.isArray(task[field]));
      for (const a of task[field])
        demand(
          a.target === target &&
            a.targetId === taskId &&
            same(a, assertions.get(a.id)),
        );
    }
    checkCorrections(task.corrections);
    for (const [kind, field] of [
      ["Weight", "weight"],
      ["Status", "status"],
    ]) {
      const selected = task["selected" + kind + "AssertionId"];
      if (selected !== undefined)
        demand(task[field + "Assertions"].some((a) => a.id === selected));
      const resolution = task[field + "Resolution"];
      if (resolution !== undefined)
        demand(
          same(resolution, conclusions.get(encode(["task." + field, taskId]))),
        );
    }
    if (task.effectiveWeight !== undefined)
      demand(
        Number.isFinite(task.effectiveWeight) &&
          task.effectiveWeight > 0 &&
          assertions.get(task.selectedWeightAssertionId)?.value ===
            task.effectiveWeight,
      );
  }
  const checkTotals = ({ completedWeight, totalWeight }) =>
    demand(
      Number.isFinite(completedWeight) &&
        Number.isFinite(totalWeight) &&
        completedWeight >= 0 &&
        completedWeight <= totalWeight,
    );
  if (available) {
    checkTotals(current);
    demand(
      current.totalWeight > 0 &&
        current.ratio === current.completedWeight / current.totalWeight &&
        snapshot?.completeness === "complete" &&
        current.issues.length === 0,
    );
  } else demand(current.phases.length === 0 && current.issues.length > 0);
  for (const phase of current.phases) {
    closed(phase, ["phaseId", "taskIds", "totalWeight", "completedWeight"]);
    demand(
      phases.has(phase.phaseId) &&
        Array.isArray(phase.taskIds) &&
        phase.taskIds.every((id) => entries.get(id)?.phaseId === phase.phaseId),
    );
    checkTotals(phase);
  }
}

// The supported source contract reports statuses and plan certainty. Weight
// changes need an explicit correction, and no source input resolves claims.
export function verifyProgressSourceBasis(before, after) {
  const introduced = after.assertions.slice(before.assertions.length);
  demand(
    introduced.every(
      (a) =>
        a.target === "task.status" ||
        (a.target === "task.certainty" && planGeneratedId(a.id, "certainty")),
    ),
  );
  demand(same(after.resolvedConclusions, before.resolvedConclusions));

  const statuses = after.acceptedEvents
    .slice(before.acceptedEvents.length)
    .filter((event) => event.type === "task.status_reported")
    .map((event) => ({
      id: "core:assertion:task.status:" + event.id,
      target: "task.status",
      targetId: event.payload.taskId,
      value: event.payload.status,
      sourceId: event.sourceId,
      provenance: "agent_reported",
      eventId: event.id,
      observedAt: event.receivedAt,
    }));
  demand(
    same(
      introduced.filter((a) => a.target === "task.status"),
      statuses,
    ),
  );
  const priorTasks = new Map(before.tasks.map((task) => [task.id, task]));
  const appended = new Map();
  for (const { id, targetId } of statuses) {
    const ids = appended.get(targetId) ?? [];
    ids.push(id);
    appended.set(targetId, ids);
  }
  for (const task of after.tasks) {
    const prior = priorTasks.get(task.id);
    demand(same(task.weightAssertionIds, prior?.weightAssertionIds ?? []));
    demand(
      same(task.statusAssertionIds, [
        ...(prior?.statusAssertionIds ?? []),
        ...(appended.get(task.id) ?? []),
      ]),
    );
  }
}

// The pinned Core evaluates a committed cut. Its record must fit the closed
// format and refer only to that cut's validated authority before any SQL write.
export function evaluateProgress(prior = empty(), plan, scope) {
  const outcome = scope.updateProgress(
    structuredClone(prior),
    structuredClone(plan),
    structuredClone(scope.planScope),
  );
  if (outcome.status === "unchanged") {
    demand(
      prior.snapshots.length > 0 &&
        same(outcome.result, prior.snapshots.at(-1).result),
    );
    return { progress: prior };
  }
  demand(outcome.status === "changed");
  const snapshot = outcome.state.snapshots.at(-1);
  const change = outcome.state.changes.at(-1);
  const record = {
    version: 1,
    change,
    correctionHistory: snapshot.correctionHistory,
  };
  demand(
    same(change.current, snapshot.result) &&
      same(snapshot.result, outcome.result),
  );
  verifyVersion(record, prior, plan, scope.planScope);
  return { progress: appendProgressVersion(prior, record), record };
}

export function appendProgressVersion(prior = empty(), record) {
  if (record === undefined) return prior;
  return {
    snapshots: [
      ...prior.snapshots,
      {
        result: record.change.current,
        correctionHistory: record.correctionHistory,
      },
    ],
    changes: [...prior.changes, record.change],
  };
}
