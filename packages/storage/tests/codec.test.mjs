import assert from "node:assert/strict";
import test from "node:test";
import { validateEvent, validateState, validateCursor } from "../src/codec.mjs";

const event = {
  id: "E1",
  schemaVersion: 1,
  projectId: "PA",
  sourceId: "SRC",
  receivedAt: "2026-10-19T00:00:00.000Z",
  type: "task.status_reported",
  payload: { taskId: "TA", status: "completed" },
};
test("P01/P02: closed event fields, no implicit identity and safe diagnostics", () => {
  assert.deepEqual(validateEvent(event, "PA"), event);
  for (const bad of [
    { ...event, rawPrompt: "PRIVATE_SENTINEL" },
    { ...event, payload: { ...event.payload, env: "PRIVATE_SENTINEL" } },
    {
      ...event,
      sourceIdentity: {
        kind: "source_event",
        sourceId: "OTHER",
        sourceEventId: "1",
      },
    },
    {
      ...event,
      sourceIdentity: {
        kind: "cursor",
        sourceId: "SRC",
        reference: "https://user:secret@example.test",
      },
    },
    { ...event, receivedAt: "not-a-time" },
    { ...event, sourceSequence: 1.2 },
    { ...event, id: "x".repeat(257) },
    { ...event, payload: { taskId: "TA", status: "invented" } },
  ]) {
    assert.throws(
      () => validateEvent(bad, "PA"),
      (e) =>
        e.code === "admission_rejected" && e.message === "admission_rejected",
    );
  }
});
test("P01/P02/S12: strict state graph, optional fields and no fabricated project", () => {
  const state = {
    projects: [
      {
        id: "PA",
        name: "Synthetic",
        locations: [],
        phaseIds: ["PH"],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
    ],
    phases: [
      {
        id: "PH",
        projectId: "PA",
        title: "Phase",
        taskIds: ["TA"],
        statusAssertionIds: [],
      },
    ],
    tasks: [
      {
        id: "TA",
        phaseId: "PH",
        title: "Task",
        statusAssertionIds: [],
        certaintyAssertionIds: [],
        weightAssertionIds: [],
      },
    ],
    sessions: [],
    assertions: [],
    corrections: [],
    resolvedConclusions: [],
    acceptedEvents: [],
  };
  assert.deepEqual(validateState(state, "PA"), state);
  assert.throws(() => validateState({ ...state, projects: [] }, "PA"));
  assert.throws(() =>
    validateState(
      { ...state, tasks: [{ ...state.tasks[0], phaseId: "FOREIGN" }] },
      "PA",
    ),
  );
  assert.throws(() =>
    validateState({ ...state, metadata: "PRIVATE_SENTINEL" }, "PA"),
  );
  assert.throws(() =>
    validateState(
      {
        ...state,
        projects: [{ ...state.projects[0], name: "Bearer SECRET_SENTINEL" }],
      },
      "PA",
    ),
  );
});
test("S09: complete-unit cursor representation is not an event identity", () => {
  const cursor = {
    sourceId: "SRC",
    streamId: "stream",
    codec: "synthetic.v1",
    position: "batch:1",
    expectedPrevious: null,
    coveredEventIds: ["E1", "E2"],
  };
  assert.deepEqual(validateCursor(cursor), cursor);
  assert.throws(() =>
    validateCursor({ ...cursor, coveredEventIds: ["E1", "E1"] }),
  );
  assert.throws(() =>
    validateCursor({ ...cursor, position: "token=SECRET_SENTINEL" }),
  );
});
