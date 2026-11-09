import { getTimelineEntries } from "./timeline-engine.js";
import type {
  TimelineEntry,
  TimelineQuery,
  TimelineState,
} from "./timeline-engine.js";

// Serializable continuation of an append-only in-memory Timeline view. This is
// neither an authorization token nor proof of durable snapshot/generation identity.
export interface TimelineCursor {
  readonly version: 1;
  readonly query: TimelineQuery;
  readonly throughSequence: number;
  readonly anchorId: string;
  readonly anchorSequence: number;
  readonly anchorObservedAt: string;
}
export interface TimelinePageQuery extends TimelineQuery {
  readonly limit: number;
  readonly after?: TimelineCursor;
}
export type TimelinePageResult =
  | {
      readonly status: "available";
      readonly entries: readonly TimelineEntry[];
      readonly throughSequence: number;
      readonly nextCursor?: TimelineCursor;
    }
  | {
      readonly status: "rejected";
      readonly reason: "invalid_limit" | "invalid_query" | "invalid_cursor";
    };

const nonempty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;
function validQuery(value: TimelineQuery) {
  return (
    value !== null &&
    typeof value === "object" &&
    nonempty(value.projectId) &&
    (value.sourceId === undefined || nonempty(value.sourceId)) &&
    (value.sessionId === undefined || nonempty(value.sessionId))
  );
}
function sameQuery(a: TimelineQuery, b: TimelineQuery) {
  return (
    a.projectId === b.projectId &&
    a.sourceId === b.sourceId &&
    a.sessionId === b.sessionId
  );
}

export function getTimelinePage(
  state: TimelineState,
  query: TimelinePageQuery,
): TimelinePageResult {
  if (!validQuery(query))
    return { status: "rejected", reason: "invalid_query" };
  if (
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 100
  )
    return { status: "rejected", reason: "invalid_limit" };
  const cursor = query.after;
  if (
    cursor !== undefined &&
    (cursor === null ||
      typeof cursor !== "object" ||
      cursor.version !== 1 ||
      !validQuery(cursor.query) ||
      !sameQuery(cursor.query, query) ||
      !Number.isSafeInteger(cursor.throughSequence) ||
      cursor.throughSequence < 1 ||
      cursor.throughSequence > state.entries.length ||
      !Number.isSafeInteger(cursor.anchorSequence) ||
      cursor.anchorSequence < 1 ||
      cursor.anchorSequence > cursor.throughSequence ||
      !nonempty(cursor.anchorId) ||
      !nonempty(cursor.anchorObservedAt))
  )
    return { status: "rejected", reason: "invalid_cursor" };

  const throughSequence = cursor?.throughSequence ?? state.entries.length;
  const view = getTimelineEntries(
    {
      entries: state.entries.filter(
        (entry) => entry.sequence <= throughSequence,
      ),
    },
    query,
  );
  let start = 0;
  if (cursor !== undefined) {
    const anchor = view.findIndex(
      (entry) =>
        entry.id === cursor.anchorId &&
        entry.sequence === cursor.anchorSequence &&
        entry.observedAt === cursor.anchorObservedAt,
    );
    if (anchor < 0) return { status: "rejected", reason: "invalid_cursor" };
    start = anchor + 1;
  }
  const entries = view.slice(start, start + query.limit);
  const last = entries.at(-1);
  return {
    status: "available",
    entries,
    throughSequence,
    ...(last === undefined || start + entries.length === view.length
      ? {}
      : {
          nextCursor: {
            version: 1 as const,
            query: {
              projectId: query.projectId,
              ...(query.sourceId === undefined
                ? {}
                : { sourceId: query.sourceId }),
              ...(query.sessionId === undefined
                ? {}
                : { sessionId: query.sessionId }),
            },
            throughSequence,
            anchorId: last.id,
            anchorSequence: last.sequence,
            anchorObservedAt: last.observedAt,
          },
        }),
  };
}
