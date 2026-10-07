import { expectTypeOf, test } from "vitest";

import type {
  EventId,
  NormalizedEvent,
  NormalizedEventType,
  PlanInput,
  SessionEventInput,
  SessionId,
  SourceEventIdentity,
  SourceReference,
  TaskStatusReport,
  WorkStatus,
} from "../src/index.js";

type Fits<From, To> = [From] extends [To] ? true : false;

test("binds exactly five event types to their input payloads", () => {
  expectTypeOf<NormalizedEventType>().toEqualTypeOf<
    | "session.started"
    | "session.ended"
    | "plan.detected"
    | "plan.updated"
    | "task.status_reported"
  >();
  expectTypeOf<
    NormalizedEvent<"session.started">["payload"]
  >().toEqualTypeOf<SessionEventInput>();
  expectTypeOf<
    NormalizedEvent<"session.ended">["payload"]
  >().toEqualTypeOf<SessionEventInput>();
  expectTypeOf<
    NormalizedEvent<"plan.detected">["payload"]
  >().toEqualTypeOf<PlanInput>();
  expectTypeOf<
    NormalizedEvent<"plan.updated">["payload"]
  >().toEqualTypeOf<PlanInput>();
  expectTypeOf<
    NormalizedEvent<"task.status_reported">["payload"]
  >().toEqualTypeOf<TaskStatusReport>();
  expectTypeOf<TaskStatusReport["status"]>().toEqualTypeOf<WorkStatus>();

  type WrongTaskPayload = Omit<
    NormalizedEvent<"task.status_reported">,
    "payload"
  > & { readonly payload: SessionEventInput };
  type WrongSessionPayload = Omit<
    NormalizedEvent<"session.started">,
    "payload"
  > & { readonly payload: TaskStatusReport };
  type WrongPlanPayload = Omit<NormalizedEvent<"plan.updated">, "payload"> & {
    readonly payload: TaskStatusReport;
  };
  type DerivedEvent = Omit<NormalizedEvent<"task.status_reported">, "type"> & {
    readonly type: "task.completed";
  };
  expectTypeOf<
    Fits<WrongTaskPayload, NormalizedEvent>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<WrongSessionPayload, NormalizedEvent>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<WrongPlanPayload, NormalizedEvent>
  >().toEqualTypeOf<false>();
  expectTypeOf<Fits<DerivedEvent, NormalizedEvent>>().toEqualTypeOf<false>();
});

test("separates Core IDs from namespaced opaque source identities", () => {
  type StableEvent = Extract<SourceEventIdentity, { kind: "source_event" }>;
  type Cursor = Extract<SourceEventIdentity, { kind: "cursor" }>;

  expectTypeOf<NormalizedEvent["id"]>().toEqualTypeOf<EventId>();
  expectTypeOf<
    Fits<StableEvent["sourceEventId"], EventId>
  >().toEqualTypeOf<false>();
  expectTypeOf<Fits<EventId, SourceEventIdentity>>().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<Omit<StableEvent, "sourceId">, SourceEventIdentity>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<Omit<Cursor, "sourceId">, SourceEventIdentity>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<{ kind: "cursor"; sourceId: Cursor["sourceId"] }, SourceEventIdentity>
  >().toEqualTypeOf<false>();
  expectTypeOf<Fits<SourceReference, SessionId>>().toEqualTypeOf<false>();
  expectTypeOf<SessionEventInput["sourceSessionReference"]>().toEqualTypeOf<
    SourceReference | undefined
  >();
});

test("requires receipt time without requiring source time, identity or sequence", () => {
  type Report = NormalizedEvent<"task.status_reported">;
  expectTypeOf<
    Fits<Omit<Report, "receivedAt">, NormalizedEvent>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<
      Omit<
        Report,
        "occurredAt" | "sourceIdentity" | "sourceSequence" | "sessionId"
      >,
      NormalizedEvent
    >
  >().toEqualTypeOf<true>();
  expectTypeOf<Report["receivedAt"]>().toEqualTypeOf<string>();
  expectTypeOf<Report["occurredAt"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Report["sourceSequence"]>().toEqualTypeOf<number | undefined>();
  expectTypeOf<Report["causedBy"]>().toEqualTypeOf<EventId | undefined>();
  expectTypeOf<Report["relatedEventIds"]>().toEqualTypeOf<
    readonly EventId[] | undefined
  >();
  expectTypeOf<
    Extract<keyof Report, "globalSequence" | "assertion" | "resolvedConclusion">
  >().toEqualTypeOf<never>();
});
