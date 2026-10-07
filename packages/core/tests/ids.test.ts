import { expectTypeOf, test } from "vitest";

import type {
  AssertionId,
  CorrectionId,
  EventId,
  PhaseId,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
} from "../src/index.js";

type Ids = {
  project: ProjectId;
  phase: PhaseId;
  task: TaskId;
  session: SessionId;
  assertion: AssertionId;
  correction: CorrectionId;
  source: SourceId;
  event: EventId;
};

// All 56 directed pairs must reject assignment, not just differ in name.
type CrossIdAssignments = {
  [From in keyof Ids]: {
    [To in Exclude<keyof Ids, From>]: Ids[From] extends Ids[To] ? true : false;
  }[Exclude<keyof Ids, From>];
}[keyof Ids];

type PlainStringAssignments = {
  [Kind in keyof Ids]: string extends Ids[Kind] ? true : false;
}[keyof Ids];

test("rejects cross-kind IDs and unbranded strings at compile time", () => {
  // These checks are enforced by pnpm run typecheck, not runtime assertions.
  expectTypeOf<CrossIdAssignments>().toEqualTypeOf<false>();
  expectTypeOf<PlainStringAssignments>().toEqualTypeOf<false>();
  expectTypeOf<Ids[keyof Ids]>().toExtend<string>();
});
