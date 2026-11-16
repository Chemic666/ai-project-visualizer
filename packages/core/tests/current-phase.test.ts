import { expect, test } from "vitest";
import * as core from "../src/index.js";
import { describeCheckpoint } from "../examples/checkpoint.js";
import {
  planCore,
  planEvent,
  planProject,
  planSource,
} from "./fixtures/plan.js";

const sessionId = "phase-session" as core.SessionId;
const scope = {
  projectId: planProject,
  sourceId: planSource,
  sessionId,
  planId: "synthetic-plan",
};
const at = (minute: number) =>
  `2026-11-16T10:${String(minute).padStart(2, "0")}:00.000Z`;

function update(
  state: core.ProjectEngineState,
  update: core.ProjectUpdate,
  minute: number,
) {
  const result = core.applyProjectUpdate(state, update, at(minute));
  expect(result.status).toBe("applied");
  return result.state;
}

function session(type: "session.started" | "session.ended", minute: number) {
  return {
    kind: "source",
    event: {
      type,
      id: `test-${type}` as core.EventId,
      schemaVersion: 1,
      projectId: planProject,
      sourceId: planSource,
      sessionId,
      receivedAt: at(minute),
      payload: { sessionId },
    },
  } as const;
}

const phases = [
  { sourcePhaseId: "foundation", title: "Foundation" },
  { sourcePhaseId: "delivery", title: "Delivery" },
] as const;
const steps = [
  {
    sourceItemId: "a",
    sourcePhaseId: "foundation",
    title: "Setup",
    certainty: "confirmed",
  },
  {
    sourceItemId: "b",
    sourcePhaseId: "delivery",
    title: "Storage",
    certainty: "confirmed",
  },
] as const;

function fixture(
  flat = false,
  completeness: "complete" | "partial" = "complete",
) {
  let state = core.createProjectEngineState(
    core.createPlanEngineState(planCore()),
    scope,
  );
  state = update(state, session("session.started", 0), 0);
  const first = planEvent(
    "phase-r1",
    flat
      ? {
          steps: [
            { sourceItemId: "a", title: "Setup", certainty: "confirmed" },
          ],
        }
      : { phases, steps, completeness },
    { sessionId, receivedAt: at(1) },
  );
  state = update(state, { kind: "source", event: first }, 1);
  const [initial, next] = state.plan.heads[0]!.entries.map(
    ({ taskId }) => taskId,
  );
  return { state, first, initial: initial!, next: next! };
}

function confirm(
  state: core.ProjectEngineState,
  taskId: core.TaskId,
  minute: number,
) {
  return update(
    state,
    {
      kind: "correction",
      input: {
        id: `confirm-${minute}` as core.CorrectionId,
        scope: { kind: "current_task", projectId: planProject, sessionId },
        effectiveAt: at(minute),
        assertion: {
          id: `confirm-claim-${minute}` as core.AssertionId,
          target: "project.currentTask",
          targetId: planProject,
          sourceId: "phase-human" as core.SourceId,
          value: taskId,
          observedAt: at(minute),
          provenance: "user_confirmed",
        },
      },
    },
    minute,
  );
}

test("derives the current phase from the confirmed task even before weights exist", () => {
  const { state, first, initial, next } = fixture();
  expect(core.getCurrentPhaseFromCorrection(state.plan, scope)).toEqual({
    status: "unknown",
    reason: "current_task_unknown",
  });
  const active = confirm(state, initial, 2);
  expect(core.calculateProgress(active.plan, scope).status).toBe("unavailable");
  expect(core.getCurrentPhaseFromCorrection(active.plan, scope)).toMatchObject({
    status: "available",
    taskId: initial,
    origin: "core_derived",
    phase: { title: "Foundation", provenance: "agent_reported" },
    evidence: {
      planRevisionEventId: first.id,
      taskAssertionId: "confirm-claim-2",
      correctionId: "confirm-2",
      confirmedAt: at(2),
    },
  });
  const moved = confirm(active, next, 3);
  expect(core.getCurrentPhaseFromCorrection(moved.plan, scope)).toMatchObject({
    status: "available",
    taskId: next,
    phase: { title: "Delivery" },
  });
  expect(core.getCurrentPhaseFromCorrection(active.plan, scope)).toMatchObject({
    status: "available",
    phase: { title: "Foundation" },
  });
});

test("a plan revision can move the current task without replacing its confirmation", () => {
  const { state, first, initial } = fixture();
  const active = confirm(state, initial, 2);
  const revision = planEvent(
    "phase-r2",
    {
      previousEventId: first.id,
      completeness: "partial",
      steps: [{ ...steps[0], sourcePhaseId: "delivery" }],
    },
    { sessionId, receivedAt: at(3) },
  );
  const moved = update(active, { kind: "source", event: revision }, 3);
  expect(core.getCurrentPhaseFromCorrection(moved.plan, scope)).toMatchObject({
    status: "available",
    taskId: initial,
    phase: { title: "Delivery" },
    evidence: {
      planRevisionEventId: revision.id,
      taskAssertionId: "confirm-claim-2",
    },
  });
  expect(moved.plan.core.corrections).toEqual(active.plan.core.corrections);
});

test("an ambiguous newer plan cannot publish the last known phase as current", () => {
  const { state, first, initial } = fixture();
  const active = confirm(state, initial, 2);
  const uncertain = planEvent(
    "phase-ambiguous",
    {
      previousEventId: first.id,
      steps: [{ title: "Setup" }],
    },
    { sessionId, receivedAt: at(3) },
  );
  const next = update(active, { kind: "source", event: uncertain }, 3);
  expect(core.getPlanSnapshot(next.plan, scope)).toMatchObject({
    status: "ambiguous",
    lastKnown: { eventId: first.id },
  });
  expect(core.getCurrentPhaseFromCorrection(next.plan, scope)).toEqual({
    status: "ambiguous",
    reason: "plan_ambiguous",
  });
  expect(next.plan.core.corrections).toEqual(active.plan.core.corrections);
});

test("an inferred group stays inferred, and a session end clears the current phase", () => {
  const { state, initial } = fixture(true);
  const active = confirm(state, initial, 2);
  expect(core.getCurrentPhaseFromCorrection(active.plan, scope)).toMatchObject({
    status: "available",
    phase: { title: "Plan tasks", provenance: "visualizer_inferred" },
  });
  const ended = update(active, session("session.ended", 3), 3);
  expect(core.getCurrentPhaseFromCorrection(ended.plan, scope)).toEqual({
    status: "unknown",
    reason: "session_ended",
  });
  expect(ended.plan.heads[0]?.entries[0]?.taskId).toBe(initial);
});

test("an initially partial plan exposes known groups without creating totals", () => {
  const { state, initial } = fixture(false, "partial");
  const selected = confirm(state, initial, 2);
  const checkpoint = describeCheckpoint(selected, {
    key: "partial",
    label: "Known subset",
    result: core.calculateProgress(selected.plan, scope),
    progressReasons: [],
  });
  expect(checkpoint.progress).toEqual({
    status: "unavailable",
    issueCodes: ["plan_incomplete"],
  });
  expect(checkpoint.currentPhase).toMatchObject({
    status: "available",
    title: "Foundation",
  });
  expect(checkpoint.phases).toMatchObject([
    { title: "Foundation", current: true, taskPositions: [0] },
    { title: "Delivery", current: false, taskPositions: [1] },
  ]);
  expect(checkpoint.phases.every((phase) => phase.totals === undefined)).toBe(
    true,
  );
  expect(checkpoint.tasks).toMatchObject([
    { title: "Setup", certainty: "confirmed", planOnly: true, included: false },
    {
      title: "Storage",
      certainty: "confirmed",
      planOnly: true,
      included: false,
    },
  ]);
  expect(checkpoint.tasks.every((task) => task.weight === undefined)).toBe(
    true,
  );
});
