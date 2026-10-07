import { expect, expectTypeOf, test } from "vitest";

import { PLAN_CERTAINTIES, WORK_STATUSES } from "../src/index.js";
import type { PlanCertainty, WorkStatus } from "../src/index.js";

test("exposes the specified work statuses and plan certainties separately", () => {
  expect(WORK_STATUSES).toEqual([
    "todo",
    "in_progress",
    "completed",
    "verified",
    "blocked",
  ]);
  expect(PLAN_CERTAINTIES).toEqual(["confirmed", "tentative", "idea"]);

  expectTypeOf<WorkStatus>().toEqualTypeOf<
    "todo" | "in_progress" | "completed" | "verified" | "blocked"
  >();
  expectTypeOf<PlanCertainty>().toEqualTypeOf<
    "confirmed" | "tentative" | "idea"
  >();
  expectTypeOf<Extract<WorkStatus, PlanCertainty>>().toEqualTypeOf<never>();
});
