import { expect, expectTypeOf, test } from "vitest";
import type {
  AssertionId,
  CorrectionLifecycle,
  CorrectionRecord,
  CorrectionScope,
  EventId,
  InterpretationState,
  ProjectId,
  ResolvedConclusion,
  TimelineReference,
} from "../src/index.js";
import {
  closureCorrections,
  inactiveCorrections,
} from "./fixtures/closure-contracts.js";

type Fits<From, To> = [From] extends [To] ? true : false;

test("requires specific Project/Session, historical event and stable Task scopes", () => {
  type Current = Extract<CorrectionScope, { kind: "current_task" }>;
  type History = Extract<
    CorrectionScope,
    { kind: "historical_activity_association" }
  >;
  type Weight = Extract<CorrectionScope, { kind: "task_weight" }>;
  expectTypeOf<CorrectionScope["kind"]>().toEqualTypeOf<
    "current_task" | "historical_activity_association" | "task_weight"
  >();
  expectTypeOf<
    Fits<Omit<Current, "sessionId">, CorrectionScope>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<Omit<History, "eventIds"> & { eventIds: [] }, CorrectionScope>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<Omit<Weight, "taskId"> & { taskId: ProjectId }, CorrectionScope>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    CorrectionRecord["correctedAssertionId"]
  >().toEqualTypeOf<AssertionId>();
  expectTypeOf<CorrectionRecord["originalAssertionId"]>().toEqualTypeOf<
    AssertionId | undefined
  >();
});

test("requires traceable supersession and expiry metadata without defining policies", () => {
  type Superseded = Extract<CorrectionLifecycle, { status: "superseded" }>;
  type Expired = Extract<CorrectionLifecycle, { status: "expired" }>;
  expectTypeOf<CorrectionLifecycle["status"]>().toEqualTypeOf<
    "active" | "superseded" | "expired"
  >();
  expectTypeOf<
    Fits<Omit<Superseded, "supersededBy">, CorrectionLifecycle>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<Omit<Expired, "ruleVersion" | "reasonCode">, CorrectionLifecycle>
  >().toEqualTypeOf<false>();
  expect(
    JSON.parse(JSON.stringify([...closureCorrections, ...inactiveCorrections])),
  ).toEqual([...closureCorrections, ...inactiveCorrections]);
  expect(inactiveCorrections[0].lifecycle.supersededBy).toBe(
    "correction-next-current",
  );
  expect(inactiveCorrections[1].lifecycle.triggeringEventId).toBe(
    "event-expiry-evidence",
  );
});

test("Timeline references use branded evidence IDs with no raw payload or entry identity", () => {
  type EventReference = Extract<TimelineReference, { kind: "event" }>;
  expectTypeOf<TimelineReference["kind"]>().toEqualTypeOf<
    "event" | "assertion" | "correction"
  >();
  expectTypeOf<EventReference["eventId"]>().toEqualTypeOf<EventId>();
  expectTypeOf<
    Fits<
      Omit<EventReference, "eventId"> & { eventId: AssertionId },
      TimelineReference
    >
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Extract<keyof TimelineReference, "payload" | "sourceCode" | "entryId">
  >().toEqualTypeOf<never>();
});

test("interpretations retain typed targets and conclusion references without naked values", () => {
  type Available = Extract<
    InterpretationState<"task.status">,
    { status: "available" }
  >;
  type Ambiguous = Extract<
    InterpretationState<"task.status">,
    { status: "ambiguous" }
  >;
  type Stale = Extract<InterpretationState<"task.status">, { status: "stale" }>;
  expectTypeOf<InterpretationState["status"]>().toEqualTypeOf<
    "available" | "unavailable" | "ambiguous" | "stale"
  >();
  expectTypeOf<Available["conclusion"]>().toEqualTypeOf<
    ResolvedConclusion<"task.status">
  >();
  expectTypeOf<
    Fits<
      Omit<Available, "targetId"> & { targetId: ProjectId },
      InterpretationState
    >
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Fits<[AssertionId], Ambiguous["candidateAssertionIds"]>
  >().toEqualTypeOf<false>();
  expectTypeOf<Stale["lastKnownConclusion"]>().toEqualTypeOf<
    ResolvedConclusion<"task.status"> | undefined
  >();
  expectTypeOf<
    Extract<keyof InterpretationState, "value" | "confidence">
  >().toEqualTypeOf<never>();
});
