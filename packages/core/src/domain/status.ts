export const WORK_STATUSES = [
  "todo",
  "in_progress",
  "completed",
  "verified",
  "blocked",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export const PLAN_CERTAINTIES = ["confirmed", "tentative", "idea"] as const;

export type PlanCertainty = (typeof PLAN_CERTAINTIES)[number];
