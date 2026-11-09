import { expect, test } from "vitest";
import * as core from "../src/index.js";
import type {
  EventId,
  ProjectId,
  SessionId,
  SourceId,
  TimelineInput,
  TimelineState,
} from "../src/index.js";

const projectId = "page-project" as ProjectId;
const sourceId = "page-source" as SourceId;
const sessionId = "page-session" as SessionId;
const query = { projectId, sourceId, sessionId };
function input(id: string, minute: number, overrides = {}): TimelineInput {
  return {
    kind: "source",
    event: {
      id: id as EventId,
      schemaVersion: 1,
      type: "session.started",
      projectId,
      sourceId,
      receivedAt: `2026-11-08T08:0${minute}:00.000Z`,
      payload: { sessionId },
      ...overrides,
    },
  };
}
function fixture() {
  return core.appendTimelineEvents(core.createTimelineState(), [
    input("late", 3),
    input("first", 1),
    input("same-time", 1),
    input("middle", 2),
    input("other-project", 1, { projectId: "other-project" as ProjectId }),
    input("other-source", 1, { sourceId: "other-source" as SourceId }),
    input("other-session", 1, {
      payload: { sessionId: "other-session" as SessionId },
    }),
  ]).state;
}

test("timeline pages keep display order, tie order and scope without changing history", () => {
  expect(core.getTimelinePage).toBeTypeOf("function");
  const state = fixture();
  const original = JSON.stringify(state);
  const first = core.getTimelinePage(state, { ...query, limit: 2 });
  expect(first.status).toBe("available");
  if (first.status !== "available" || first.nextCursor === undefined)
    throw new Error("cursor missing");
  expect(first.entries.map((e) => e.eventId)).toEqual(["first", "same-time"]);
  expect(first.nextCursor).toBeDefined();
  const next = core.getTimelinePage(state, {
    ...query,
    limit: 2,
    after: first.nextCursor,
  });
  expect(next.status).toBe("available");
  if (next.status !== "available") throw new Error("page unavailable");
  expect(next.entries.map((e) => e.eventId)).toEqual(["middle", "late"]);
  expect(next.nextCursor).toBeUndefined();
  expect(JSON.stringify(state)).toBe(original);
});

test("new backdated and later events wait for a fresh page traversal", () => {
  const state = fixture();
  const first = core.getTimelinePage(state, { ...query, limit: 2 });
  if (first.status !== "available" || first.nextCursor === undefined)
    throw new Error("cursor missing");
  const appended = core.appendTimelineEvents(state, [
    input("new-early", 0),
    input("new-late", 4),
  ]).state;
  const second = core.getTimelinePage(appended, {
    ...query,
    limit: 5,
    after: first.nextCursor,
  });
  if (second.status !== "available") throw new Error("page unavailable");
  expect(second.entries.map((e) => e.eventId)).toEqual(["middle", "late"]);
  expect(second.nextCursor).toBeUndefined();
  const fresh = core.getTimelinePage(appended, { ...query, limit: 10 });
  if (fresh.status !== "available") throw new Error("page unavailable");
  expect(fresh.entries.map((e) => e.eventId)).toEqual([
    "new-early",
    "first",
    "same-time",
    "middle",
    "late",
    "new-late",
  ]);
});

test("cursor survives JSON restore and binds the exact filters rather than limit", () => {
  const state = fixture();
  const first = core.getTimelinePage(state, { ...query, limit: 1 });
  if (first.status !== "available" || first.nextCursor === undefined)
    throw new Error("cursor missing");
  const after = JSON.parse(JSON.stringify(first.nextCursor));
  const restored: TimelineState = JSON.parse(JSON.stringify(state));
  const resumed = core.getTimelinePage(restored, {
    sessionId,
    sourceId,
    projectId,
    limit: 3,
    after,
  });
  if (resumed.status !== "available") throw new Error("page unavailable");
  expect(resumed.entries.map((e) => e.eventId)).toEqual([
    "same-time",
    "middle",
    "late",
  ]);
  for (const changed of [
    { ...query, projectId: "other-project" as ProjectId },
    { ...query, sourceId: "other-source" as SourceId },
    { ...query, sessionId: "other-session" as SessionId },
    { projectId },
  ]) {
    expect(
      core.getTimelinePage(state, { ...changed, limit: 2, after }),
    ).toMatchObject({
      status: "rejected",
      reason: "invalid_cursor",
    });
  }
});

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101])(
  "invalid page size %s returns no history",
  (limit) => {
    expect(core.getTimelinePage(fixture(), { ...query, limit })).toEqual({
      status: "rejected",
      reason: "invalid_limit",
    });
  },
);

test("missing anchors and altered cursor boundaries are rejected rather than restarted", () => {
  const state = fixture();
  const first = core.getTimelinePage(state, { ...query, limit: 1 });
  if (first.status !== "available" || !first.nextCursor)
    throw new Error("cursor missing");
  for (const after of [
    { ...first.nextCursor, version: 2 },
    { ...first.nextCursor, throughSequence: 999 },
    { ...first.nextCursor, anchorId: "missing" },
    { ...first.nextCursor, anchorSequence: 999 },
    { ...first.nextCursor, anchorObservedAt: "2026-11-08T08:09:00.000Z" },
  ]) {
    expect(
      core.getTimelinePage(state, { ...query, limit: 2, after } as Parameters<
        typeof core.getTimelinePage
      >[1]),
    ).toEqual({ status: "rejected", reason: "invalid_cursor" });
  }
  const missing = {
    entries: state.entries.filter((e) => e.eventId !== "first"),
  };
  expect(
    core.getTimelinePage(missing, {
      ...query,
      limit: 2,
      after: first.nextCursor,
    }),
  ).toEqual({ status: "rejected", reason: "invalid_cursor" });
});

test("empty timelines and exact-sized final pages do not invent more pages", () => {
  expect(
    core.getTimelinePage(core.createTimelineState(), { projectId, limit: 1 }),
  ).toEqual({
    status: "available",
    entries: [],
    throughSequence: 0,
  });
  const result = core.getTimelinePage(fixture(), { ...query, limit: 4 });
  if (result.status !== "available") throw new Error("page unavailable");
  expect(result.entries).toHaveLength(4);
  expect(result.nextCursor).toBeUndefined();
});

test.each([
  null,
  undefined,
  { projectId: "", limit: 1 },
  { ...query, sourceId: "", limit: 1 },
])(
  "malformed query %j is rejected without throwing or returning history",
  (value) => {
    expect(
      core.getTimelinePage(
        fixture(),
        value as unknown as core.TimelinePageQuery,
      ),
    ).toEqual({
      status: "rejected",
      reason: "invalid_query",
    });
  },
);
