import { expect, expectTypeOf, test } from "vitest";

import {
  createCoreState,
  getAssertion,
  getAssertionsForTarget,
  getPhase,
  getProject,
  getSession,
  getTask,
  hasProcessedEvent,
} from "../src/index.js";
import type {
  Assertion,
  AssertionId,
  CoreState,
  EventId,
  ProjectId,
  SessionId,
  TaskId,
} from "../src/index.js";
import {
  createHierarchyFixture,
  phaseId,
  projectId,
  sourceId,
  taskId,
} from "./fixtures/core-state.js";

test("stores a fixture hierarchy in a serializable plain CoreState", () => {
  const state = createHierarchyFixture();
  expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  expect(getProject(state, projectId)?.phaseIds).toEqual([phaseId]);
  expect(getPhase(state, phaseId)?.taskIds).toEqual([taskId]);
  expect(getTask(state, taskId)?.phaseId).toBe(phaseId);
  expect(state.acceptedEvents).toEqual([]);
  expect(state.resolvedConclusions).toEqual([]);
  expectTypeOf<CoreState["assertions"]>().toEqualTypeOf<readonly Assertion[]>();
});

test("queries absent data without inventing defaults", () => {
  const state = createCoreState();
  expect(getProject(state, projectId)).toBeUndefined();
  expect(getPhase(state, phaseId)).toBeUndefined();
  expect(getTask(state, taskId)).toBeUndefined();
  expect(getSession(state, "missing-session" as SessionId)).toBeUndefined();
  expect(
    getAssertion(state, "missing-assertion" as AssertionId),
  ).toBeUndefined();
  expect(getAssertionsForTarget(state, "task.status", taskId)).toEqual([]);
  expect(hasProcessedEvent(state, "missing-event" as EventId)).toBe(false);
});

test("queries source Assertions by both typed target and entity ID without resolving", () => {
  const assertions: readonly Assertion[] = [
    {
      id: "assertion-a" as AssertionId,
      target: "task.status",
      targetId: taskId,
      value: "completed",
      provenance: "agent_reported",
      sourceId,
      observedAt: "2026-10-07T10:00:00.000Z",
    },
    {
      id: "assertion-b" as AssertionId,
      target: "task.status",
      targetId: taskId,
      value: "blocked",
      provenance: "user_confirmed",
      sourceId,
      observedAt: "2026-10-07T10:00:00.000Z",
    },
    {
      id: "assertion-c" as AssertionId,
      target: "task.certainty",
      targetId: taskId,
      value: "confirmed",
      provenance: "observed",
      sourceId,
      observedAt: "2026-10-07T10:00:00.000Z",
    },
    {
      id: "assertion-d" as AssertionId,
      target: "task.status",
      targetId: "another-task" as TaskId,
      value: "todo",
      provenance: "agent_reported",
      sourceId,
      observedAt: "2026-10-07T10:00:00.000Z",
    },
  ];
  const state = createCoreState({ assertions });
  const matches = getAssertionsForTarget(state, "task.status", taskId);
  expect(matches).toEqual(assertions.slice(0, 2));
  expect(getAssertion(state, assertions[0]!.id)).toBe(assertions[0]);
  expect(state.resolvedConclusions).toEqual([]);
  expectTypeOf(matches).toEqualTypeOf<readonly Assertion<"task.status">[]>();

  // This function is never called; its body is checked by TypeScript.
  const typeChecks = () => {
    // @ts-expect-error A ProjectId cannot identify a task.status target.
    getAssertionsForTarget(state, "task.status", projectId);
  };
  expectTypeOf(typeChecks).toEqualTypeOf<() => void>();
  expectTypeOf(getProject(state, projectId)).toEqualTypeOf<
    CoreState["projects"][number] | undefined
  >();
  expectTypeOf<ProjectId>().not.toEqualTypeOf<TaskId>();
});
