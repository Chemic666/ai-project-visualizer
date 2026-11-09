import type { Assertion, AssertionTarget } from "./domain/assertion.js";
import type { AssertionId, EventId, TaskId } from "./domain/ids.js";
import type { PlanEngineState, PlanScope } from "./domain/plan.js";
import type {
  IndependentVerificationSupport,
  ProgressApplicationResult,
  ProgressChangeReason,
  ProgressEngineState,
  ProgressEvidenceReference,
  ProgressIssue,
  ProgressIssueCode,
  ProgressResult,
  ProgressTaskBasis,
} from "./domain/progress.js";
import type { ResolvedConclusion } from "./domain/resolved-conclusion.js";
import type { SourceReference } from "./domain/source-reference.js";
import type { Task } from "./domain/task.js";
import type { CoreState } from "./state.js";
import { getPlanSnapshot } from "./plan-engine.js";

const sameScope = (a: PlanScope, b: PlanScope) =>
  a.projectId === b.projectId &&
  a.sourceId === b.sourceId &&
  a.sessionId === b.sessionId &&
  a.planId === b.planId;
const nonempty = (value: string) => value.trim().length > 0;
const validWeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

// Canonical comparison is local evaluation identity, not a source dedup key.
function dataKey(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value))
    return `number:${String(value)}`;
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(dataKey).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((k) => object[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${dataKey(object[k])}`)
    .join(",")}}`;
}

function uniqueRefs(
  refs: readonly ProgressEvidenceReference[],
): ProgressEvidenceReference[] {
  return [...new Map(refs.map((ref) => [dataKey(ref), ref])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ref]) => ref);
}

function sourceRefValid(reference: SourceReference): boolean {
  return (
    nonempty(reference.sourceId) &&
    (reference.reference !== undefined
      ? nonempty(reference.reference)
      : nonempty(reference.revision))
  );
}

function sourceLinked(
  assertion: Assertion,
  core: CoreState,
  scope: PlanScope,
): boolean {
  if (!nonempty(assertion.sourceId) || !nonempty(assertion.observedAt))
    return false;
  if (assertion.sourceReference !== undefined) {
    if (
      !sourceRefValid(assertion.sourceReference) ||
      assertion.sourceReference.sourceId !== assertion.sourceId
    )
      return false;
    if (assertion.eventId === undefined) return true;
  }
  if (assertion.eventId === undefined) return false;
  const events = core.acceptedEvents.filter((e) => e.id === assertion.eventId);
  if (events.length !== 1) return false;
  const event = events[0]!;
  if (
    event.projectId !== scope.projectId ||
    event.sourceId !== assertion.sourceId
  )
    return false;
  if (assertion.target === "task.status")
    return (
      event.type === "task.status_reported" &&
      event.payload.taskId === assertion.targetId &&
      event.payload.status === assertion.value
    );
  // Current normalized events do not contain weight claims. Those trusted
  // Assertions need a source record; a plan/session event alone is insufficient.
  return assertion.sourceReference !== undefined;
}

function collect<T extends AssertionTarget>(
  core: CoreState,
  ids: readonly AssertionId[],
  target: T,
  taskId: TaskId,
): { values: Assertion<T>[]; invalid: boolean } {
  const values: Assertion<T>[] = [];
  let invalid = false;
  for (const id of [...new Set(ids)].sort()) {
    const found = core.assertions.filter((a) => a.id === id);
    const assertion = found[0];
    if (
      found.length !== 1 ||
      assertion?.target !== target ||
      assertion.targetId !== taskId
    )
      invalid = true;
    else values.push(assertion as Assertion<T>);
  }
  return { values, invalid };
}

function select<T extends "task.status" | "task.weight">(
  core: CoreState,
  target: T,
  taskId: TaskId,
  values: readonly Assertion<T>[],
  eligibleWitness: (assertion: Assertion<T>) => boolean,
): {
  assertion?: Assertion<T>;
  resolution?: ResolvedConclusion<T>;
  issue?: ProgressIssueCode;
} {
  const conclusions = core.resolvedConclusions.filter(
    (r) => r.target === target && r.targetId === taskId,
  ) as ResolvedConclusion<T>[];
  const conflict: ProgressIssueCode =
    target === "task.status" ? "status_conflict" : "weight_conflict";
  if (conclusions.length > 1) return { issue: conflict };
  const resolution = conclusions[0];
  if (resolution !== undefined) {
    const selected = values.find(
      (a) => a.id === resolution.selectedAssertionId,
    );
    const covered = [
      resolution.selectedAssertionId,
      ...resolution.supportingAssertionIds,
      ...resolution.conflictingAssertionIds,
    ];
    if (
      selected === undefined ||
      !nonempty(resolution.resolution.ruleId) ||
      !nonempty(resolution.resolution.ruleVersion) ||
      !nonempty(resolution.resolution.reason) ||
      !nonempty(resolution.resolution.resolvedAt) ||
      new Set(covered).size !== covered.length ||
      covered.length !== values.length ||
      values.some((a) => !covered.includes(a.id)) ||
      resolution.supportingAssertionIds.some(
        (id) => values.find((a) => a.id === id)?.value !== selected.value,
      )
    ) {
      return { issue: conflict };
    }
    return { assertion: selected, resolution };
  }
  if (new Set(values.map((a) => a.value)).size > 1) return { issue: conflict };
  // All remaining values agree. Prefer an eligible witness so an unsupported
  // duplicate cannot hide reliable evidence merely by sorting first. Explicit
  // resolutions above still bind their selected claim and never use fallback.
  const direct = values.find((a) => a.provenance !== "visualizer_inferred");
  const assertion = values.find(eligibleWitness) ?? direct ?? values[0];
  return assertion === undefined ? {} : { assertion };
}

function resolveWeight(
  core: CoreState,
  task: Task,
  scope: PlanScope,
  values: readonly Assertion<"task.weight">[],
) {
  const corrections = core.corrections.filter(
    (c) =>
      c.scope.kind === "task_weight" &&
      c.scope.taskId === task.id &&
      c.scope.projectId === scope.projectId &&
      (c.scope.sessionId === undefined ||
        c.scope.sessionId === scope.sessionId),
  );
  const active = corrections.filter((c) => c.lifecycle.status === "active");
  if (active.length > 1)
    return { corrections, issue: "correction_conflict" as const };
  const correction = active[0];
  if (correction !== undefined) {
    const assertion = values.find(
      (a) => a.id === correction.correctedAssertionId,
    );
    if (
      assertion === undefined ||
      assertion.provenance !== "user_confirmed" ||
      !nonempty(correction.effectiveAt) ||
      !nonempty(assertion.sourceId) ||
      !nonempty(assertion.observedAt) ||
      (assertion.sourceReference !== undefined &&
        (!sourceRefValid(assertion.sourceReference) ||
          assertion.sourceReference.sourceId !== assertion.sourceId)) ||
      (correction.originalAssertionId !== undefined &&
        !values.some((a) => a.id === correction.originalAssertionId))
    ) {
      return { corrections, issue: "invalid_correction" as const };
    }
    return { corrections, assertion };
  }
  const correctionAssertionIds = new Set(
    core.corrections.map((c) => c.correctedAssertionId),
  );
  const candidates = values.filter((a) => !correctionAssertionIds.has(a.id));
  const selected = select(
    core,
    "task.weight",
    task.id,
    candidates,
    (a) =>
      a.provenance !== "visualizer_inferred" && sourceLinked(a, core, scope),
  );
  if (
    selected.assertion !== undefined &&
    (selected.assertion.provenance === "visualizer_inferred" ||
      !sourceLinked(selected.assertion, core, scope))
  ) {
    return { corrections, issue: "invalid_reference" as const };
  }
  return { corrections, ...selected };
}

function completion(
  assertion: Assertion<"task.status"> | undefined,
  core: CoreState,
  scope: PlanScope,
  supports: readonly IndependentVerificationSupport[],
): Pick<
  ProgressTaskBasis,
  "completion" | "completionReason" | "verificationSupport"
> {
  if (assertion === undefined)
    return { completion: "unknown", completionReason: "status_unknown" };
  if (assertion.value !== "completed" && assertion.value !== "verified")
    return { completion: "not_completed", completionReason: "not_completed" };
  if (assertion.provenance === "visualizer_inferred")
    return {
      completion: "unknown",
      completionReason: "inference_not_eligible",
    };
  if (assertion.value === "completed")
    return sourceLinked(assertion, core, scope)
      ? {
          completion: "completed",
          completionReason: "explicit_completion_report",
        }
      : {
          completion: "unknown",
          completionReason: "completion_evidence_missing",
        };
  const proofs = supports.filter((s) => s.assertionId === assertion.id);
  const proof = proofs[0];
  // Independence/relevance is an explicit trusted normalization contract, never
  // inferred from a different SourceId, a command success or an Agent summary.
  if (
    assertion.provenance === "agent_reported" ||
    !sourceLinked(assertion, core, scope) ||
    proofs.length !== 1 ||
    proof === undefined ||
    !nonempty(proof.ruleId) ||
    !nonempty(proof.ruleVersion) ||
    proof.evidenceRefs.length === 0 ||
    !proof.evidenceRefs.every(
      (ref) => ref.kind === "source" && sourceRefValid(ref.reference),
    ) ||
    !proof.evidenceRefs.some(
      (ref) =>
        ref.kind === "source" &&
        assertion.sourceReference !== undefined &&
        dataKey(ref.reference) === dataKey(assertion.sourceReference),
    )
  ) {
    return {
      completion: "unknown",
      completionReason: "verification_evidence_missing",
    };
  }
  return {
    completion: "verified",
    completionReason: "independent_verification",
    verificationSupport: proof,
  };
}

function addWeight(total: number, weight: number): number {
  const sum = total + weight;
  // Refuse overflow or complete loss of a positive summand. This is ordinary
  // unrounded Number arithmetic, not an arbitrary-precision arithmetic claim.
  return !Number.isFinite(sum) ||
    (total > 0 && (sum === total || sum === weight))
    ? NaN
    : sum;
}

export function calculateProgress(
  plan: PlanEngineState,
  scope: PlanScope,
  supports: readonly IndependentVerificationSupport[] = [],
): ProgressResult {
  const view = getPlanSnapshot(plan, scope);
  const core = plan.core;
  const observations = plan.revisions.filter((r) => sameScope(r.scope, scope));
  const refs: ProgressEvidenceReference[] = observations.map((r) => ({
    kind: "event",
    eventId: r.eventId,
  }));
  const head = view.status === "available" ? view.snapshot : view.lastKnown;
  const base = {
    scope,
    ...(head === undefined
      ? {}
      : { planRevisionEventId: head.eventId, planSnapshot: head }),
    tasks: [] as ProgressTaskBasis[],
    phases: [],
    evidenceRefs: uniqueRefs(refs),
  };
  if (view.status !== "available")
    return {
      ...base,
      status: "unavailable",
      issues: [
        {
          code: view.status === "ambiguous" ? "plan_ambiguous" : "plan_unknown",
        },
      ],
    };
  if (head!.completeness !== "complete")
    return {
      ...base,
      status: "unavailable",
      issues: [{ code: "plan_incomplete" }],
    };
  const snapshot = view.snapshot;
  const latestApplied = observations.findLast((r) => r.outcome === "applied");
  if (
    latestApplied?.eventId !== snapshot.eventId ||
    dataKey(latestApplied.snapshot) !== dataKey(snapshot) ||
    new Set(snapshot.entries.map((e) => e.taskId)).size !==
      snapshot.entries.length ||
    !core.projects.some((p) => p.id === scope.projectId)
  ) {
    return {
      ...base,
      status: "unavailable",
      issues: [{ code: "plan_inconsistent" }],
    };
  }
  const issues: ProgressIssue[] = [];
  const tasks: ProgressTaskBasis[] = [];
  let totalWeight = 0;
  let completedWeight = 0;
  for (const entry of snapshot.entries) {
    const matches = core.tasks.filter((t) => t.id === entry.taskId);
    const task = matches[0];
    const phase = core.phases.find((p) => p.id === entry.phaseId);
    if (
      matches.length !== 1 ||
      task === undefined ||
      task.phaseId !== entry.phaseId ||
      phase?.projectId !== scope.projectId ||
      !phase.taskIds.includes(entry.taskId) ||
      !core.projects
        .find((p) => p.id === scope.projectId)!
        .phaseIds.includes(entry.phaseId)
    ) {
      issues.push({ code: "invalid_reference", taskId: entry.taskId });
      continue;
    }
    const certainty = collect(
      core,
      task.certaintyAssertionIds,
      "task.certainty",
      task.id,
    );
    const weights = collect(
      core,
      task.weightAssertionIds,
      "task.weight",
      task.id,
    );
    const statuses = collect(
      core,
      task.statusAssertionIds,
      "task.status",
      task.id,
    );
    const included = entry.certainty === "confirmed";
    const blank: ProgressTaskBasis = {
      entry,
      included,
      certaintyAssertions: certainty.values,
      weightAssertions: weights.values,
      statusAssertions: statuses.values,
      corrections: [],
      completion: "unknown",
      completionReason: included ? "status_unknown" : "excluded",
    };
    if (entry.certainty === undefined)
      issues.push({ code: "certainty_unknown", taskId: task.id });
    const certaintySupported = certainty.values.some(
      (a) =>
        a.value === entry.certainty &&
        a.eventId !== undefined &&
        observations.some(
          (r) =>
            r.outcome === "applied" &&
            r.eventId === a.eventId &&
            r.snapshot?.entries.some(
              (e) => e.taskId === task.id && e.certainty === a.value,
            ),
        ),
    );
    if (
      certainty.invalid ||
      (entry.certainty !== undefined && !certaintySupported)
    )
      issues.push({ code: "invalid_reference", taskId: task.id });
    if (!included) {
      tasks.push(blank);
      continue;
    }
    if (weights.invalid || statuses.invalid)
      issues.push({ code: "invalid_reference", taskId: task.id });
    const weight = resolveWeight(core, task, scope, weights.values);
    const status = select(
      core,
      "task.status",
      task.id,
      statuses.values,
      (a) => {
        const outcome = completion(a, core, scope, supports).completion;
        return outcome === "completed" || outcome === "verified";
      },
    );
    if (weight.issue !== undefined)
      issues.push({ code: weight.issue, taskId: task.id });
    if (status.issue !== undefined)
      issues.push({ code: status.issue, taskId: task.id });
    if (weight.assertion === undefined && weight.issue === undefined)
      issues.push({ code: "weight_unknown", taskId: task.id });
    else if (
      weight.assertion !== undefined &&
      !validWeight(weight.assertion.value)
    )
      issues.push({ code: "invalid_weight", taskId: task.id });
    const done = completion(status.assertion, core, scope, supports);
    const basis: ProgressTaskBasis = {
      ...blank,
      ...done,
      corrections: weight.corrections,
      ...(weight.assertion === undefined
        ? {}
        : {
            selectedWeightAssertionId: weight.assertion.id,
            ...(validWeight(weight.assertion.value)
              ? { effectiveWeight: weight.assertion.value }
              : {}),
          }),
      ...("resolution" in weight && weight.resolution !== undefined
        ? { weightResolution: weight.resolution }
        : {}),
      ...(status.assertion === undefined
        ? {}
        : { selectedStatusAssertionId: status.assertion.id }),
      ...(status.resolution === undefined
        ? {}
        : { statusResolution: status.resolution }),
    };
    tasks.push(basis);
    if (basis.effectiveWeight !== undefined) {
      totalWeight = addWeight(totalWeight, basis.effectiveWeight);
      if (basis.completion === "completed" || basis.completion === "verified")
        completedWeight = addWeight(completedWeight, basis.effectiveWeight);
    }
  }
  for (const basis of tasks) {
    for (const assertion of [
      ...basis.certaintyAssertions,
      ...basis.weightAssertions,
      ...basis.statusAssertions,
    ]) {
      refs.push({ kind: "assertion", assertionId: assertion.id });
      if (assertion.eventId !== undefined)
        refs.push({ kind: "event", eventId: assertion.eventId });
      if (assertion.sourceReference !== undefined)
        refs.push({ kind: "source", reference: assertion.sourceReference });
    }
    for (const correction of basis.corrections)
      refs.push({ kind: "correction", correctionId: correction.id });
    refs.push(...(basis.verificationSupport?.evidenceRefs ?? []));
  }
  if (totalWeight === 0) issues.push({ code: "zero_denominator" });
  if (!Number.isFinite(totalWeight) || !Number.isFinite(completedWeight))
    issues.push({ code: "numeric_range" });
  const resultBase = { ...base, tasks, evidenceRefs: uniqueRefs(refs) };
  if (issues.length > 0)
    return { ...resultBase, status: "unavailable", issues };
  const ratio = completedWeight / totalWeight;
  if (
    !Number.isFinite(ratio) ||
    (completedWeight > 0 && ratio === 0) ||
    ratio > 1
  )
    return {
      ...resultBase,
      status: "unavailable",
      issues: [{ code: "numeric_range" }],
    };
  const phases = snapshot.phases.map((phase) => {
    const members = tasks.filter(
      (t) => t.included && t.entry.phaseId === phase.phaseId,
    );
    return {
      phaseId: phase.phaseId,
      taskIds: members.map((t) => t.entry.taskId),
      totalWeight: members.reduce((total, t) => total + t.effectiveWeight!, 0),
      completedWeight: members.reduce(
        (total, t) =>
          total +
          (t.completion === "completed" || t.completion === "verified"
            ? t.effectiveWeight!
            : 0),
        0,
      ),
    };
  });
  return {
    ...resultBase,
    status: "available",
    phases,
    issues: [],
    totalWeight,
    completedWeight,
    ratio,
  };
}

export function formatProgressPercentage(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    throw new RangeError("invalid_progress_ratio");
  return `${(ratio * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

export function createProgressEngineState(): ProgressEngineState {
  return { snapshots: [], changes: [] };
}

function changeReasons(
  previous: ProgressResult | undefined,
  current: ProgressResult,
): ProgressChangeReason[] {
  if (previous === undefined) return ["initial_calculation"];
  const reasons: ProgressChangeReason[] = [];
  if (current.status === "unavailable" && previous.status !== "unavailable")
    reasons.push("progress_unavailable");
  if (current.status === "available" && previous.status !== "available")
    reasons.push("progress_available");
  const oldTasks = previous.tasks.filter((t) => t.included);
  const newTasks = current.tasks.filter((t) => t.included);
  const usablePlan = (result: ProgressResult) =>
    result.planSnapshot?.completeness === "complete" &&
    !result.issues.some((issue) =>
      [
        "plan_unknown",
        "plan_ambiguous",
        "plan_incomplete",
        "plan_inconsistent",
        "certainty_unknown",
        "invalid_reference",
      ].includes(issue.code),
    );
  if (usablePlan(previous) && usablePlan(current)) {
    const before = previous.planSnapshot!.entries.filter(
      (e) => e.certainty === "confirmed",
    );
    const after = current.planSnapshot!.entries.filter(
      (e) => e.certainty === "confirmed",
    );
    if (after.some((e) => !before.some((old) => old.taskId === e.taskId)))
      reasons.push("plan_expanded");
    if (before.some((e) => !after.some((next) => next.taskId === e.taskId)))
      reasons.push("plan_reduced");
  }
  for (const task of newTasks) {
    const old = oldTasks.find((t) => t.entry.taskId === task.entry.taskId);
    if (old === undefined) continue;
    if (old.effectiveWeight !== task.effectiveWeight)
      reasons.push(
        task.corrections.some(
          (c) =>
            c.lifecycle.status === "active" &&
            c.correctedAssertionId === task.selectedWeightAssertionId,
        )
          ? "weight_corrected"
          : "weight_changed",
      );
    const wasDone =
      old.completion === "completed" || old.completion === "verified";
    const nowDone =
      task.completion === "completed" || task.completion === "verified";
    if (wasDone && !nowDone && task.completion === "not_completed")
      reasons.push("task_reopened");
    else if (
      old.completion !== task.completion ||
      old.selectedStatusAssertionId !== task.selectedStatusAssertionId
    )
      reasons.push("status_changed");
  }
  if (reasons.length === 0)
    reasons.push(
      previous.planRevisionEventId !== current.planRevisionEventId
        ? "plan_revision_changed"
        : "evidence_changed",
    );
  return [...new Set(reasons)];
}

export function updateProgress(
  state: ProgressEngineState,
  plan: PlanEngineState,
  scope: PlanScope,
  supports: readonly IndependentVerificationSupport[] = [],
): ProgressApplicationResult {
  const result = calculateProgress(plan, scope, supports);
  const history = state.snapshots.filter((s) =>
    sameScope(s.result.scope, scope),
  );
  const previousCorrections = history.flatMap(
    (snapshot) => snapshot.correctionHistory,
  );
  const correctionIds = new Set(
    [
      ...previousCorrections,
      ...result.tasks.flatMap((task) => task.corrections),
    ].map((record) => record.id),
  );
  const correctionHistory = plan.core.corrections
    .filter((record) => correctionIds.has(record.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const previous = history.at(-1)?.result;
  if (previous !== undefined) {
    const previousAssertions = history
      .flatMap((s) => s.result.tasks)
      .flatMap((t) => [
        ...t.certaintyAssertions,
        ...t.weightAssertions,
        ...t.statusAssertions,
      ]);

    const historyMissing =
      previousAssertions.some(
        (a) => !plan.core.assertions.some((next) => next.id === a.id),
      ) ||
      previousCorrections.some(
        (record) =>
          !plan.core.corrections.some((next) => next.id === record.id),
      ) ||
      history.some(
        ({ result: prior }) =>
          prior.planRevisionEventId !== undefined &&
          !plan.revisions.some(
            (r) =>
              r.eventId === prior.planRevisionEventId &&
              sameScope(r.scope, scope),
          ),
      );
    const conflict =
      previousAssertions.some((a) =>
        plan.core.assertions.some(
          (next) => next.id === a.id && dataKey(next) !== dataKey(a),
        ),
      ) ||
      previousCorrections.some((record) =>
        plan.core.corrections.some(
          (next) =>
            next.id === record.id &&
            (dataKey({ ...next, lifecycle: undefined }) !==
              dataKey({ ...record, lifecycle: undefined }) ||
              // Active records may legally end, but terminal history cannot be edited
              // or revived. Earlier active snapshots do not override a later terminal one.
              (record.lifecycle.status !== "active" &&
                dataKey(next.lifecycle) !== dataKey(record.lifecycle))),
        ),
      );
    if (historyMissing || conflict)
      return {
        status: "rejected",
        state,
        result: {
          scope: result.scope,
          tasks: result.tasks,
          phases: [],
          evidenceRefs: result.evidenceRefs,
          ...(result.planRevisionEventId === undefined
            ? {}
            : { planRevisionEventId: result.planRevisionEventId }),
          ...(result.planSnapshot === undefined
            ? {}
            : { planSnapshot: result.planSnapshot }),
          status: "unavailable",
          issues: [
            {
              code: conflict
                ? "evidence_identity_conflict"
                : "evidence_history_missing",
            },
          ],
        },
      };
    if (
      dataKey(previous) === dataKey(result) &&
      dataKey(history.at(-1)!.correctionHistory) === dataKey(correctionHistory)
    )
      return { status: "unchanged", state, result: previous };
  }
  const event = {
    id: `core:progress.changed:${JSON.stringify([scope, state.snapshots.length])}` as EventId,
    type: "progress.changed" as const,
    origin: "core_derived" as const,
    scope,
    reasons: changeReasons(previous, result),
    ...(previous === undefined ? {} : { previous }),
    current: result,
    evidenceRefs: uniqueRefs([
      ...(previous?.evidenceRefs ?? []),
      ...result.evidenceRefs,
      ...correctionHistory.map((record) => ({
        kind: "correction" as const,
        correctionId: record.id,
      })),
    ]),
    ruleId: "core.progress.confirmed-weight" as const,
    ruleVersion: "1" as const,
  };
  return {
    status: "changed",
    result,
    state: {
      snapshots: [...state.snapshots, { result, correctionHistory }],
      changes: [...state.changes, event],
    },
  };
}
