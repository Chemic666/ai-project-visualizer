import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  EventId,
  InferenceHeuristicScore,
  SourceId,
  PlanEngineState,
} from "../src/index.js";
import {
  progressFixture,
  addWeight,
  reportStatus,
  selectAssertion,
  correctWeight,
} from "./fixtures/progress.js";
import { planCore, planEvent, planSource } from "./fixtures/plan.js";

test("Scenario 11/13: weighted progress uses 32/45, retaining unrounded ratio and source evidence", () => {
  expect(core.calculateProgress).toBeTypeOf("function");
  const { plan, scope, done } = progressFixture();
  const result = core.calculateProgress(plan, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.completedWeight).toBe(32);
  expect(result.totalWeight).toBe(45);
  expect(result.ratio).toBe(32 / 45);
  expect(core.formatProgressPercentage(result.ratio)).toBe("71.1%");
  expect(result.tasks.find((t) => t.entry.taskId === done)?.completion).toBe(
    "completed",
  );
  expect(
    result.tasks.find((t) => t.entry.taskId === done)?.statusAssertions[0]
      ?.provenance,
  ).toBe("agent_reported");
  expect(result.evidenceRefs).toContainEqual({
    kind: "event",
    eventId: "plan-1",
  });
  expect(result.evidenceRefs).toContainEqual({
    kind: "assertion",
    assertionId: "weight-done",
  });
});

test.each(["complete", "partial"] as const)(
  "Scenario 13: %s expansion by 3+2 yields 32/50 and one sourced plan_expanded change",
  (completeness) => {
    const { plan, scope } = progressFixture();
    const first = core.updateProgress(
      core.createProgressEngineState(),
      plan,
      scope,
    );
    let expanded = core.applyPlanEvent(
      plan,
      planEvent("plan-2", {
        previousEventId: "plan-1" as EventId,
        completeness,
        steps: [
          ...(completeness === "complete"
            ? [
                {
                  sourceItemId: "done",
                  title: "Completed work",
                  certainty: "confirmed" as const,
                },
                {
                  sourceItemId: "remaining",
                  title: "Remaining work",
                  certainty: "confirmed" as const,
                },
              ]
            : []),
          {
            sourceItemId: "refresh",
            title: "Refresh token",
            certainty: "confirmed",
          },
          {
            sourceItemId: "revoke",
            title: "Token revocation",
            certainty: "confirmed",
          },
        ],
      }),
    ).state;
    const entries = expanded.heads[0]!.entries;
    expanded = addWeight(expanded, entries[2]!.taskId, 3, "refresh-weight");
    expanded = addWeight(expanded, entries[3]!.taskId, 2, "revoke-weight");
    const second = core.updateProgress(first.state, expanded, scope);
    expect(second.result.status).toBe("available");
    if (second.result.status !== "available") return;
    expect(second.result.completedWeight).toBe(32);
    expect(second.result.totalWeight).toBe(50);
    expect(core.formatProgressPercentage(second.result.ratio)).toBe("64%");
    expect(second.state.changes.at(-1)).toMatchObject({
      type: "progress.changed",
      origin: "core_derived",
      reasons: ["plan_expanded"],
    });
    expect(second.state.changes.at(-1)?.evidenceRefs).toContainEqual({
      kind: "event",
      eventId: "plan-1",
    });
    expect(second.state.changes.at(-1)?.evidenceRefs).toContainEqual({
      kind: "event",
      eventId: "plan-2",
    });
    const repeated = core.updateProgress(second.state, expanded, scope);
    expect(repeated.status).toBe("unchanged");
    expect(repeated.state).toBe(second.state);
  },
);

test("S-15: missing confirmed weight is unknown; no task is dropped or defaulted to one", () => {
  const { plan, scope, remaining } = progressFixture();
  const missing = {
    ...plan,
    core: {
      ...plan.core,
      tasks: plan.core.tasks.map((t) =>
        t.id === remaining ? { ...t, weightAssertionIds: [] } : t,
      ),
    },
  };
  const result = core.calculateProgress(missing, scope);
  expect(result.status).toBe("unavailable");
  expect(result.issues).toContainEqual({
    code: "weight_unknown",
    taskId: remaining,
  });
  expect(result).not.toHaveProperty("ratio");
  expect(result.tasks).toHaveLength(2);
});

test.each([0, -1, NaN, Infinity])(
  "invalid weight %s cannot produce a percentage",
  (value) => {
    const { plan, scope, remaining } = progressFixture();
    const changed = addWeight(plan, remaining, value, "invalid-weight");
    const selected = selectAssertion(
      changed,
      "task.weight",
      remaining,
      "invalid-weight",
    );
    const result = core.calculateProgress(selected, scope);
    expect(result.status).toBe("unavailable");
    expect(result.issues).toContainEqual({
      code: "invalid_weight",
      taskId: remaining,
    });
  },
);

test("missing plan, partial baseline and zero denominator are unavailable rather than zero or 100 percent", () => {
  const { scope } = progressFixture();
  const empty = core.createPlanEngineState(planCore());
  expect(core.calculateProgress(empty, scope).status).toBe("unavailable");
  const partial = core.applyPlanEvent(
    empty,
    planEvent("partial", { completeness: "partial" }),
  ).state;
  expect(
    core.calculateProgress(partial, partial.heads[0]!.scope).issues,
  ).toContainEqual({ code: "plan_incomplete" });
  const zero = core.applyPlanEvent(
    empty,
    planEvent("empty", { steps: [] }),
  ).state;
  expect(
    core.calculateProgress(zero, zero.heads[0]!.scope).issues,
  ).toContainEqual({ code: "zero_denominator" });
});

test("unresolved Plan input cannot turn the last-known snapshot into a current percentage", () => {
  const { plan, scope } = progressFixture();
  const unknown = core.applyPlanEvent(
    plan,
    planEvent("ambiguous", {
      previousEventId: "plan-1" as EventId,
      steps: [{ title: "Unknown task" }],
    }),
  ).state;
  const result = core.calculateProgress(unknown, scope);
  expect(result.status).toBe("unavailable");
  expect(result.issues).toContainEqual({ code: "plan_ambiguous" });
});

test("Tentative and Idea are excluded, but unknown certainty cannot silently shrink the denominator", () => {
  const { plan, scope } = progressFixture();
  const expanded = core.applyPlanEvent(
    plan,
    planEvent("ideas", {
      previousEventId: "plan-1" as EventId,
      completeness: "partial",
      steps: [
        { sourceItemId: "idea", title: "Idea", certainty: "idea" },
        { sourceItemId: "maybe", title: "Tentative", certainty: "tentative" },
      ],
    }),
  ).state;
  const result = core.calculateProgress(expanded, scope);
  expect(result.status).toBe("available");
  if (result.status === "available") expect(result.totalWeight).toBe(45);
  const unknown = core.applyPlanEvent(
    plan,
    planEvent("unknown", {
      previousEventId: "plan-1" as EventId,
      completeness: "partial",
      steps: [{ sourceItemId: "unknown", title: "Unknown certainty" }],
    }),
  ).state;
  expect(
    core
      .calculateProgress(unknown, scope)
      .issues.some((i) => i.code === "certainty_unknown"),
  ).toBe(true);
});

test("unresolved weight conflict is not resolved by receipt order or a later timestamp", () => {
  const { plan, scope, remaining } = progressFixture();
  const conflict = addWeight(plan, remaining, 18, "later-weight", {
    observedAt: "2099-01-01T00:00:00.000Z",
  });
  expect(core.calculateProgress(conflict, scope).issues).toContainEqual({
    code: "weight_conflict",
    taskId: remaining,
  });
  const resolved = selectAssertion(
    conflict,
    "task.weight",
    remaining,
    "later-weight",
  );
  const result = core.calculateProgress(resolved, scope);
  expect(result.status).toBe("available");
  if (result.status === "available") expect(result.totalWeight).toBe(50);
});

test("active User Confirmed weight correction outranks later source estimates and retains original history", () => {
  const { plan, scope, remaining } = progressFixture();
  const corrected = correctWeight(plan, remaining, 18);
  const later = addWeight(corrected, remaining, 21, "new-source-estimate");
  const before = JSON.stringify(later);
  const result = core.calculateProgress(later, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.totalWeight).toBe(50);
  const basis = result.tasks.find((t) => t.entry.taskId === remaining)!;
  expect(basis.selectedWeightAssertionId).toBe("manual-weight");
  expect(
    basis.weightAssertions.map((a) => a.value).sort((a, b) => a - b),
  ).toEqual([13, 18, 21]);
  expect(basis.corrections[0]?.lifecycle.status).toBe("active");
  expect(JSON.stringify(later)).toBe(before);
});

test("expired correction does not re-enter as an unbound user assertion", () => {
  const { plan, scope, remaining } = progressFixture();
  const corrected = correctWeight(plan, remaining, 18);
  const expired = {
    ...corrected,
    core: {
      ...corrected.core,
      corrections: corrected.core.corrections.map((c) => ({
        ...c,
        lifecycle: {
          status: "expired" as const,
          expiredAt: "2026-10-20T05:00:02.000Z",
          reasonCode: "fixture",
          ruleId: "fixture",
          ruleVersion: "1",
        },
      })),
    },
  };
  const result = core.calculateProgress(expired, scope);
  expect(result.status).toBe("available");
  if (result.status === "available") expect(result.totalWeight).toBe(45);
});

test("multiple active manual corrections are unavailable rather than arbitrarily selected", () => {
  const { plan, scope, remaining } = progressFixture();
  const conflict = correctWeight(
    correctWeight(plan, remaining, 18, "manual-a"),
    remaining,
    20,
    "manual-b",
  );
  expect(core.calculateProgress(conflict, scope).issues).toContainEqual({
    code: "correction_conflict",
    taskId: remaining,
  });
});

test("task reopening removes its weight from the numerator with a sourced reason", () => {
  const { plan, scope, done } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  let reopened = reportStatus(plan, done, "in_progress", "reopen-report");
  reopened = selectAssertion(
    reopened,
    "task.status",
    done,
    "core:assertion:task.status:reopen-report",
  );
  const result = core.updateProgress(first.state, reopened, scope);
  expect(result.result.status).toBe("available");
  if (result.result.status !== "available") return;
  expect(result.result.completedWeight).toBe(0);
  expect(result.result.totalWeight).toBe(45);
  expect(result.state.changes.at(-1)?.reasons).toContain("task_reopened");
});

test("an unresolved completion versus blocked conflict is unavailable", () => {
  const { plan, scope, done } = progressFixture();
  const conflict = reportStatus(plan, done, "blocked", "blocked-report");
  expect(core.calculateProgress(conflict, scope).issues).toContainEqual({
    code: "status_conflict",
    taskId: done,
  });
});

test("Agent-reported VERIFIED without independent support never earns verified completion", () => {
  const { plan, scope, done } = progressFixture();
  const reported = reportStatus(plan, done, "verified", "claimed-verified");
  const selected = selectAssertion(
    reported,
    "task.status",
    done,
    "core:assertion:task.status:claimed-verified",
  );
  const result = core.calculateProgress(selected, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.completedWeight).toBe(0);
  expect(
    result.tasks.find((t) => t.entry.taskId === done)?.completionReason,
  ).toBe("verification_evidence_missing");
});

test("trusted independent verification fixture needs a direct status and explicit rule/evidence binding", () => {
  const { plan, scope, done } = progressFixture();
  const verifier = "synthetic-verifier" as SourceId;
  const assertion: Assertion<"task.status"> = {
    id: "independent-status" as AssertionId,
    target: "task.status",
    targetId: done,
    value: "verified",
    provenance: "observed",
    sourceId: verifier,
    observedAt: "2026-10-20T05:00:03.000Z",
    sourceReference: { sourceId: verifier, reference: "verification-fixture" },
  };
  let verified: PlanEngineState = {
    ...plan,
    core: {
      ...plan.core,
      assertions: [...plan.core.assertions, assertion],
      tasks: plan.core.tasks.map((t) =>
        t.id === done
          ? {
              ...t,
              statusAssertionIds: [...t.statusAssertionIds, assertion.id],
            }
          : t,
      ),
    },
  };
  verified = selectAssertion(verified, "task.status", done, assertion.id);
  const missing = core.calculateProgress(verified, scope);
  expect(missing.status).toBe("available");
  if (missing.status === "available") expect(missing.completedWeight).toBe(0);
  const result = core.calculateProgress(verified, scope, [
    {
      assertionId: assertion.id,
      ruleId: "fixture.independent-relevant-verification",
      ruleVersion: "1",
      evidenceRefs: [{ kind: "source", reference: assertion.sourceReference! }],
    },
  ]);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.completedWeight).toBe(32);
  expect(result.tasks.find((t) => t.entry.taskId === done)?.completion).toBe(
    "verified",
  );
});

test("inferred completion with heuristic confidence 99 cannot enter the numerator", () => {
  const { plan, scope, done } = progressFixture();
  const original = plan.core.assertions.find(
    (a) => a.target === "task.status" && a.targetId === done,
  )!;
  const inferred: Assertion<"task.status"> = {
    id: "inferred-status" as AssertionId,
    target: "task.status",
    targetId: done,
    value: "completed",
    sourceId: planSource,
    provenance: "visualizer_inferred",
    observedAt: original.observedAt,
    inference: {
      kind: "assertion_inference",
      ruleId: "fixture.inference",
      ruleVersion: "1",
      evaluatedAt: original.observedAt,
      evidenceRefs: [{ kind: "event", eventId: "plan-1" as EventId }],
      inferenceConfidence: { heuristicScore: 99 as InferenceHeuristicScore },
    },
  };
  let next: PlanEngineState = {
    ...plan,
    core: {
      ...plan.core,
      assertions: [...plan.core.assertions, inferred],
      tasks: plan.core.tasks.map((t) =>
        t.id === done
          ? { ...t, statusAssertionIds: [...t.statusAssertionIds, inferred.id] }
          : t,
      ),
    },
  };
  next = selectAssertion(next, "task.status", done, inferred.id);
  const result = core.calculateProgress(next, scope);
  expect(result.status).toBe("available");
  if (result.status === "available") expect(result.completedWeight).toBe(0);
});

test("phase totals aggregate each task once without another multiplier", () => {
  const { plan, scope } = progressFixture();
  const result = core.calculateProgress(plan, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.phases.map((p) => [p.completedWeight, p.totalWeight])).toEqual([
    [32, 45],
  ]);
  expect(result.totalWeight).toBe(45);
});

test("removal changes the current denominator but preserves historic Tasks and progress snapshots", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const smaller = core.applyPlanEvent(
    plan,
    planEvent("smaller", {
      previousEventId: "plan-1" as EventId,
      completeness: "partial",
      steps: [],
      deletedSourceItemIds: ["remaining"],
    }),
  ).state;
  const next = core.updateProgress(first.state, smaller, scope);
  expect(next.result.status).toBe("available");
  if (next.result.status !== "available") return;
  expect(next.result.totalWeight).toBe(32);
  expect(next.result.completedWeight).toBe(32);
  expect(next.state.changes.at(-1)?.reasons).toContain("plan_reduced");
  expect(smaller.core.tasks).toHaveLength(2);
  const original = next.state.snapshots[0]!.result;
  if (original.status === "available") expect(original.totalWeight).toBe(45);
});

test("duplicate evaluation remains idempotent after a JSON fixture round trip", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const restored = JSON.parse(
    JSON.stringify(first.state),
  ) as typeof first.state;
  const next = core.updateProgress(restored, plan, scope);
  expect(next.status).toBe("unchanged");
  expect(next.state).toBe(restored);
  expect(next.state.changes).toHaveLength(1);
});

test("overflowing finite task weights produce unavailable rather than NaN or a misleading percentage", () => {
  const { plan, scope, done, remaining } = progressFixture();
  let huge = selectAssertion(
    addWeight(plan, done, Number.MAX_VALUE, "huge-done"),
    "task.weight",
    done,
    "huge-done",
  );
  huge = selectAssertion(
    addWeight(huge, remaining, Number.MAX_VALUE, "huge-remaining"),
    "task.weight",
    remaining,
    "huge-remaining",
  );
  expect(
    core
      .calculateProgress(huge, scope)
      .issues.some((i) => i.code === "numeric_range"),
  ).toBe(true);
});

test("progress becoming unavailable does not fabricate a plan reduction or retain a percentage", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const unknown = core.applyPlanEvent(
    plan,
    planEvent("unreadable-plan", {
      previousEventId: "plan-1" as EventId,
      steps: [{ title: "Ambiguous" }],
    }),
  ).state;
  const next = core.updateProgress(first.state, unknown, scope);
  expect(next.result.status).toBe("unavailable");
  expect(next.result).not.toHaveProperty("ratio");
  expect(next.state.changes.at(-1)?.reasons).toContain("progress_unavailable");
  expect(next.state.changes.at(-1)?.reasons).not.toContain("plan_reduced");
});

test("rejected rollback of evidence history never returns numeric fields under unavailable", () => {
  const { plan, scope, remaining } = progressFixture();
  const newer = correctWeight(plan, remaining, 18);
  const first = core.updateProgress(
    core.createProgressEngineState(),
    newer,
    scope,
  );
  const rollback = core.updateProgress(first.state, plan, scope);
  expect(rollback.status).toBe("rejected");
  expect(rollback.state).toBe(first.state);
  expect(rollback.result.status).toBe("unavailable");
  for (const key of ["ratio", "totalWeight", "completedWeight"])
    expect(rollback.result).not.toHaveProperty(key);
});

test("newer completion evidence changes weighted numerator, not completed task count", () => {
  const { plan, scope, remaining } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const reported = reportStatus(
    plan,
    remaining,
    "completed",
    "remaining-completed",
  );
  const resolved = selectAssertion(
    reported,
    "task.status",
    remaining,
    "core:assertion:task.status:remaining-completed",
  );
  const next = core.updateProgress(first.state, resolved, scope);
  expect(next.result.status).toBe("available");
  if (next.result.status !== "available") return;
  expect(next.result.completedWeight).toBe(45);
  expect(next.result.ratio).toBe(1);
  expect(next.state.changes.at(-1)?.reasons).toContain("status_changed");
});

test("source weight update must invalidate an old resolution that omits the new claim", () => {
  const { plan, scope, remaining } = progressFixture();
  const second = addWeight(plan, remaining, 18, "weight-second");
  const resolved = selectAssertion(
    second,
    "task.weight",
    remaining,
    "weight-second",
  );
  const newer = addWeight(resolved, remaining, 20, "weight-third");
  expect(core.calculateProgress(newer, scope).issues).toContainEqual({
    code: "weight_conflict",
    taskId: remaining,
  });
});

test("weight reference pointing at another task is unavailable, never silently adopted", () => {
  const { plan, scope, done, remaining } = progressFixture();
  const invalid = {
    ...plan,
    core: {
      ...plan.core,
      tasks: plan.core.tasks.map((t) =>
        t.id === remaining
          ? {
              ...t,
              weightAssertionIds: plan.core.tasks.find(
                (other) => other.id === done,
              )!.weightAssertionIds,
            }
          : t,
      ),
    },
  };
  expect(core.calculateProgress(invalid, scope).issues).toContainEqual({
    code: "invalid_reference",
    taskId: remaining,
  });
});

test("a source completion claim without a valid event or source record is not reliable evidence", () => {
  const { plan, scope, done } = progressFixture();
  const missing = {
    ...plan,
    core: {
      ...plan.core,
      acceptedEvents: plan.core.acceptedEvents.filter(
        (e) => e.id !== "done-report",
      ),
    },
  };
  const result = core.calculateProgress(missing, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.completedWeight).toBe(0);
  expect(
    result.tasks.find((t) => t.entry.taskId === done)?.completionReason,
  ).toBe("completion_evidence_missing");
});

test("user-entered equal weights remain explicitly User Confirmed, without creating defaults", () => {
  const { plan, scope, done, remaining } = progressFixture();
  const user = "synthetic-user" as SourceId;
  let equal = addWeight(plan, done, 1, "equal-done", {
    provenance: "user_confirmed",
    sourceId: user,
    sourceReference: { sourceId: user, reference: "explicit-input-done" },
  });
  equal = selectAssertion(equal, "task.weight", done, "equal-done");
  equal = addWeight(equal, remaining, 1, "equal-remaining", {
    provenance: "user_confirmed",
    sourceId: user,
    sourceReference: { sourceId: user, reference: "explicit-input-remaining" },
  });
  equal = selectAssertion(equal, "task.weight", remaining, "equal-remaining");
  const result = core.calculateProgress(equal, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect([result.completedWeight, result.totalWeight, result.ratio]).toEqual([
    1, 2, 0.5,
  ]);
  expect(
    result.tasks.every(
      (t) =>
        t.weightAssertions.find((a) => a.id === t.selectedWeightAssertionId)
          ?.provenance === "user_confirmed",
    ),
  ).toBe(true);
});

test("duplicate status replay does not create another progress change", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const report = plan.core.acceptedEvents.find((e) => e.id === "done-report")!;
  const replay = {
    ...plan,
    core: core.applyNormalizedEvent(plan.core, report).state,
  };
  const next = core.updateProgress(first.state, replay, scope);
  expect(next.status).toBe("unchanged");
  expect(next.state).toBe(first.state);
});

test("different phases contribute task totals with no phase multiplier", () => {
  const { plan, scope } = progressFixture();
  const moved = core.applyPlanEvent(
    plan,
    planEvent("split-phases", {
      previousEventId: "plan-1" as EventId,
      completeness: "partial",
      phases: [
        { sourcePhaseId: "p", title: "Phase A" },
        { sourcePhaseId: "q", title: "Phase B" },
      ],
      steps: [
        { sourceItemId: "done", sourcePhaseId: "p", title: "Completed work" },
        {
          sourceItemId: "remaining",
          sourcePhaseId: "q",
          title: "Remaining work",
        },
      ],
    }),
  ).state;
  const result = core.calculateProgress(moved, scope);
  expect(result.status).toBe("available");
  if (result.status !== "available") return;
  expect(result.phases.map((p) => [p.completedWeight, p.totalWeight])).toEqual([
    [0, 0],
    [32, 32],
    [0, 13],
  ]);
  expect([result.completedWeight, result.totalWeight]).toEqual([32, 45]);
});

test("history identity cannot be changed in place under an existing assertion ID", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const changed = {
    ...plan,
    core: {
      ...plan.core,
      assertions: plan.core.assertions.map((a) =>
        a.id === "weight-remaining"
          ? { ...a, value: 18 as core.TaskWeight }
          : a,
      ),
    },
  } as PlanEngineState;
  const next = core.updateProgress(first.state, changed, scope);
  expect(next.status).toBe("rejected");
  expect(next.result.issues).toContainEqual({
    code: "evidence_identity_conflict",
  });
  expect(next.result).not.toHaveProperty("ratio");
});

test("unknown certainty is not evidence that confirmed scope was reduced", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const nextPlan = core.applyPlanEvent(
    plan,
    planEvent("uncertain-membership", {
      previousEventId: "plan-1" as EventId,
      steps: [
        {
          sourceItemId: "done",
          title: "Completed work",
          certainty: "confirmed",
        },
        { sourceItemId: "remaining", title: "Remaining work" },
      ],
    }),
  ).state;
  const next = core.updateProgress(first.state, nextPlan, scope);
  expect(next.result.issues).toContainEqual({
    code: "certainty_unknown",
    taskId: nextPlan.heads[0]!.entries[1]!.taskId,
  });
  expect(next.result.status).toBe("unavailable");
  expect(next.state.changes.at(-1)?.reasons).not.toContain("plan_reduced");
});

test("manual correction rejects a source record in another source namespace", () => {
  const { plan, scope, remaining } = progressFixture();
  const corrected = correctWeight(plan, remaining, 18);
  const invalid = {
    ...corrected,
    core: {
      ...corrected.core,
      assertions: corrected.core.assertions.map((a) =>
        a.id === "manual-weight"
          ? {
              ...a,
              sourceReference: {
                sourceId: "wrong-source" as SourceId,
                reference: "manual-weight",
              },
            }
          : a,
      ),
    },
  } as PlanEngineState;
  expect(core.calculateProgress(invalid, scope).issues).toContainEqual({
    code: "invalid_correction",
    taskId: remaining,
  });
});

test("an unavailable intermediate plan cannot erase the older evidence identity guard", () => {
  const { plan, scope } = progressFixture();
  const first = core.updateProgress(
    core.createProgressEngineState(),
    plan,
    scope,
  );
  const unknown = core.applyPlanEvent(
    plan,
    planEvent("unknown-between", {
      previousEventId: "plan-1" as EventId,
      steps: [{ title: "Ambiguous task" }],
    }),
  ).state;
  const second = core.updateProgress(first.state, unknown, scope);
  expect(second.result.status).toBe("unavailable");
  const changed = {
    ...unknown,
    core: {
      ...unknown.core,
      assertions: unknown.core.assertions.map((a) =>
        a.id === "weight-remaining"
          ? { ...a, value: 18 as core.TaskWeight }
          : a,
      ),
    },
  } as PlanEngineState;
  const third = core.updateProgress(second.state, changed, scope);
  expect(third.status).toBe("rejected");
  expect(third.state).toBe(second.state);
  expect(third.result.issues).toContainEqual({
    code: "evidence_identity_conflict",
  });
});

test.each(["a", "z"])(
  "same-value verified claims choose a valid witness regardless of ID order (%s)",
  (prefix) => {
    const { plan, scope, done } = progressFixture();
    const reported = reportStatus(plan, done, "verified", "claimed-verified");
    const verifier = "synthetic-verifier" as SourceId;
    const valid: Assertion<"task.status"> = {
      id: `${prefix}-independent` as AssertionId,
      target: "task.status",
      targetId: done,
      value: "verified",
      provenance: "observed",
      sourceId: verifier,
      observedAt: "2026-10-20T05:00:03.000Z",
      sourceReference: { sourceId: verifier, reference: "independent-result" },
    };
    const mixed = {
      ...reported,
      core: {
        ...reported.core,
        assertions: [...reported.core.assertions, valid],
        tasks: reported.core.tasks.map((t) =>
          t.id === done
            ? {
                ...t,
                statusAssertionIds: [
                  "core:assertion:task.status:claimed-verified" as AssertionId,
                  valid.id,
                ],
              }
            : t,
        ),
      },
    };
    const result = core.calculateProgress(mixed, scope, [
      {
        assertionId: valid.id,
        ruleId: "fixture.independent",
        ruleVersion: "1",
        evidenceRefs: [{ kind: "source", reference: valid.sourceReference! }],
      },
    ]);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.completedWeight).toBe(32);
    expect(
      result.tasks.find((t) => t.entry.taskId === done)
        ?.selectedStatusAssertionId,
    ).toBe(valid.id);
  },
);

test("agreeing weights use an eligible source witness instead of an arbitrary ID", () => {
  const { plan, scope, remaining } = progressFixture();
  const mixed = addWeight(plan, remaining, 13, "a-invalid-source", {
    sourceReference: { sourceId: planSource, reference: "" },
  });
  const result = core.calculateProgress(mixed, scope);
  expect(result.status).toBe("available");
  if (result.status === "available") expect(result.totalWeight).toBe(45);
});

test("Scenario 10 component: user correction explains 64% to 59.3% without changing completed weight", () => {
  const { plan, scope, remaining } = progressFixture();
  const base = selectAssertion(
    addWeight(plan, remaining, 18, "weight-18"),
    "task.weight",
    remaining,
    "weight-18",
  );
  const first = core.updateProgress(
    core.createProgressEngineState(),
    base,
    scope,
  );
  const corrected = correctWeight(base, remaining, 22);
  const next = core.updateProgress(first.state, corrected, scope);
  expect(next.result.status).toBe("available");
  if (next.result.status !== "available") return;
  expect([next.result.completedWeight, next.result.totalWeight]).toEqual([
    32, 54,
  ]);
  expect(core.formatProgressPercentage(next.result.ratio)).toBe("59.3%");
  expect(next.state.changes.at(-1)?.reasons).toContain("weight_corrected");
  expect(next.state.changes.at(-1)?.evidenceRefs).toContainEqual({
    kind: "correction",
    correctionId: "manual-weight-correction",
  });
});

test("progress rejects lost correction records even when their assertions survive", () => {
  const f = progressFixture();
  const corrected = correctWeight(f.plan, f.remaining, 17, "history-guard");
  const first = core.updateProgress(
    core.createProgressEngineState(),
    corrected,
    f.scope,
  );
  const missing = {
    ...corrected,
    core: { ...corrected.core, corrections: [] },
  };
  const result = core.updateProgress(first.state, missing, f.scope);
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(first.state);
  expect(result.result).toMatchObject({
    status: "unavailable",
    issues: [{ code: "evidence_history_missing" }],
  });
  expect(result.result).not.toHaveProperty("ratio");
});

test("progress rejects rewritten correction creation metadata under the same CorrectionId", () => {
  const f = progressFixture();
  const corrected = correctWeight(f.plan, f.remaining, 17, "history-guard");
  const first = core.updateProgress(
    core.createProgressEngineState(),
    corrected,
    f.scope,
  );
  const rewritten = {
    ...corrected,
    core: {
      ...corrected.core,
      corrections: corrected.core.corrections.map((record) => ({
        ...record,
        effectiveAt: "2026-10-20T05:00:02.000Z",
      })),
    },
  };
  const result = core.updateProgress(first.state, rewritten, f.scope);
  expect(result.status).toBe("rejected");
  expect(result.state).toBe(first.state);
  expect(result.result).toMatchObject({
    issues: [{ code: "evidence_identity_conflict" }],
  });
  expect(result.result).not.toHaveProperty("completedWeight");
});

test("valid correction supersession remains allowed, but terminal lifecycle rewrite or revival is rejected", () => {
  const f = progressFixture();
  const corrected = correctWeight(f.plan, f.remaining, 17, "history-guard");
  const first = core.updateProgress(
    core.createProgressEngineState(),
    corrected,
    f.scope,
  );
  const replaced = core.applyUserCorrection(corrected, f.scope, {
    id: "replacement-weight" as core.CorrectionId,
    scope: {
      kind: "task_weight",
      projectId: f.scope.projectId,
      taskId: f.remaining,
    },
    effectiveAt: "2026-11-08T12:00:00.000Z",
    assertion: {
      id: "replacement-weight-assertion" as AssertionId,
      target: "task.weight",
      targetId: f.remaining,
      value: 20 as core.TaskWeight,
      provenance: "user_confirmed",
      sourceId: "synthetic-user" as SourceId,
      observedAt: "2026-11-08T12:00:00.000Z",
    },
  });
  expect(replaced.status).toBe("applied");
  const next = core.updateProgress(first.state, replaced.state, f.scope);
  expect(next.status).toBe("changed");
  expect(next.result).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 52,
  });
  for (const revive of [false, true]) {
    const rewritten: PlanEngineState = {
      ...replaced.state,
      core: {
        ...replaced.state.core,
        corrections: replaced.state.core.corrections.map((record) =>
          record.id !== "history-guard-correction"
            ? record
            : {
                ...record,
                lifecycle: revive
                  ? { status: "active" }
                  : record.lifecycle.status === "superseded"
                    ? { ...record.lifecycle, reasonCode: "rewritten-reason" }
                    : record.lifecycle,
              },
        ),
      },
    };
    const result = core.updateProgress(next.state, rewritten, f.scope);
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(next.state);
    expect(result.result).toMatchObject({
      issues: [{ code: "evidence_identity_conflict" }],
    });
  }
});

test.each([false, true])(
  "removed-task correction terminal history survives JSON restore (end after removal=%s)",
  (endAfterRemoval) => {
    const f = progressFixture();
    const corrected = correctWeight(f.plan, f.remaining, 17, "history-guard");
    const first = core.updateProgress(
      core.createProgressEngineState(),
      corrected,
      f.scope,
    );
    const event = planEvent(
      "terminal-removal",
      { previousEventId: "plan-1" as EventId, steps: [] },
      { receivedAt: "2026-11-08T12:01:00.000Z" },
    );
    const removed = core.applyPlanEvent(corrected, event).state;
    let prior = first.state;
    if (endAfterRemoval) {
      const middle = core.updateProgress(prior, removed, f.scope);
      expect(middle.status).toBe("changed");
      prior = middle.state;
    }
    const ended = core.expireUserCorrection(removed, {
      correctionId: "history-guard-correction" as core.CorrectionId,
      eventId: event.id,
      expiredAt: "2026-11-08T12:01:00.000Z",
      reason: "task_removed",
    });
    expect(ended.status).toBe("applied");
    const accepted = core.updateProgress(prior, ended.state, f.scope);
    expect(accepted.status).toBe("changed");
    const restored: core.ProgressEngineState = JSON.parse(
      JSON.stringify(accepted.state),
    );
    const replay = core.updateProgress(restored, ended.state, f.scope);
    expect(replay.status).toBe("unchanged");
    expect(replay.state).toBe(restored);
    for (const revive of [false, true]) {
      const rewritten: PlanEngineState = {
        ...ended.state,
        core: {
          ...ended.state.core,
          corrections: ended.state.core.corrections.map((record) => ({
            ...record,
            lifecycle: revive
              ? { status: "active" }
              : record.lifecycle.status === "expired"
                ? { ...record.lifecycle, reasonCode: "rewritten-after-removal" }
                : record.lifecycle,
          })),
        },
      };
      const result = core.updateProgress(restored, rewritten, f.scope);
      expect(result.status).toBe("rejected");
      expect(result.state).toBe(restored);
      expect(result.result).toMatchObject({
        issues: [{ code: "evidence_identity_conflict" }],
      });
      expect(result.result).not.toHaveProperty("ratio");
    }
  },
);

test.each(["unknown", "removed"] as const)(
  "intermediate %s plan cannot erase prior correction-history requirements",
  (kind) => {
    const f = progressFixture();
    const corrected = correctWeight(f.plan, f.remaining, 17, "history-guard");
    const first = core.updateProgress(
      core.createProgressEngineState(),
      corrected,
      f.scope,
    );
    const middle = core.applyPlanEvent(
      corrected,
      planEvent(`middle-${kind}`, {
        previousEventId: (kind === "unknown"
          ? "not-observed"
          : "plan-1") as EventId,
        steps: [],
      }),
    ).state;
    const accepted = core.updateProgress(first.state, middle, f.scope);
    expect(accepted.status).toBe("changed");
    expect(accepted.result.status).toBe("unavailable");
    const missing = { ...middle, core: { ...middle.core, corrections: [] } };
    const result = core.updateProgress(accepted.state, missing, f.scope);
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(accepted.state);
    expect(result.result).toMatchObject({
      issues: [{ code: "evidence_history_missing" }],
    });
    expect(result.result).not.toHaveProperty("ratio");
  },
);
