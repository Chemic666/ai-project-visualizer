import { expect, expectTypeOf, test } from "vitest";

import type {
  AssertionId,
  Phase,
  PhaseId,
  Project,
  ProjectId,
  Session,
  SessionId,
  SourceId,
  Task,
  TaskId,
} from "../src/index.js";

// Explicit casts are a controlled fixture boundary, not ID derivation rules.
const projectId = "project-1" as ProjectId;
const phaseId = "phase-1" as PhaseId;
const taskId = "task-1" as TaskId;

test("constructs the hierarchy as JSON-compatible plain data", () => {
  const project: Project = {
    id: projectId,
    name: "Sample project",
    locations: ["/sample/project"],
    phaseIds: [phaseId],
    currentTaskAssertionIds: [],
    currentPhaseAssertionIds: [],
  };
  const phase: Phase = {
    id: phaseId,
    projectId,
    title: "Foundation",
    taskIds: [taskId],
    statusAssertionIds: [],
  };
  const task: Task = {
    id: taskId,
    phaseId,
    title: "Create the Core contract",
    statusAssertionIds: [
      "assertion-status-a",
      "assertion-status-b",
    ] as AssertionId[],
    certaintyAssertionIds: ["assertion-certainty" as AssertionId],
    weightAssertionIds: [],
  };
  const session: Session = {
    id: "session-1" as SessionId,
    sourceId: "source-1" as SourceId,
    sourceSessionId: "opaque-external-session",
    projectAssociationAssertionIds: [],
  };

  const models = { project, phase, task, session };
  expect(JSON.parse(JSON.stringify(models))).toEqual(models);
  for (const model of Object.values(models)) {
    expect(Object.getPrototypeOf(model)).toBe(Object.prototype);
    expect(
      Object.values(model).some((value) => typeof value === "function"),
    ).toBe(false);
  }
  expect(task.phaseId).toBe(phase.id);
  expect(phase.projectId).toBe(project.id);
  expect(session.id).not.toBe(session.sourceSessionId);
});

test("preserves separate assertion references without naked task conclusions", () => {
  expectTypeOf<Task["statusAssertionIds"]>().toEqualTypeOf<
    readonly AssertionId[]
  >();
  expectTypeOf<Task["certaintyAssertionIds"]>().toEqualTypeOf<
    readonly AssertionId[]
  >();
  expectTypeOf<Task["weightAssertionIds"]>().toEqualTypeOf<
    readonly AssertionId[]
  >();
  expectTypeOf<
    Extract<"status" | "certainty" | "weight", keyof Task>
  >().toEqualTypeOf<never>();
});

test("allows an unattributed session without inventing a project", () => {
  const session: Session = {
    id: "session-unattributed" as SessionId,
    sourceId: "source-1" as SourceId,
    sourceSessionId: null,
    projectAssociationAssertionIds: [],
  };

  expect(session.sourceSessionId).toBeNull();
  expect(session.projectAssociationAssertionIds).toEqual([]);
  expectTypeOf<
    Extract<"projectId" | "codexThreadId", keyof Session>
  >().toEqualTypeOf<never>();
});
