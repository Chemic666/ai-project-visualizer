import type {
  AssertionId,
  CorrectionId,
  CorrectionRecord,
  EventId,
} from "../../src/index.js";
import { projectId, sessionId, taskId } from "./core-state.js";

// Reference fixtures only. Existence/target compatibility and effective lifetime
// are not validated or computed by these contracts.
export const closureCorrections = [
  {
    id: "correction-current-task" as CorrectionId,
    scope: { kind: "current_task", projectId, sessionId },
    originalAssertionId: "assertion-original-current" as AssertionId,
    correctedAssertionId: "assertion-corrected-current" as AssertionId,
    effectiveAt: "2026-10-07T10:00:00.000Z",
    supersedes: "correction-prior-current" as CorrectionId,
    triggeringEventId: "event-user-choice" as EventId,
    lifecycle: { status: "active" },
  },
  {
    id: "correction-history" as CorrectionId,
    scope: {
      kind: "historical_activity_association",
      projectId,
      eventIds: ["event-history-1" as EventId, "event-history-2" as EventId],
    },
    correctedAssertionId: "assertion-corrected-history" as AssertionId,
    effectiveAt: "2026-10-07T10:01:00.000Z",
    lifecycle: { status: "active" },
  },
  {
    id: "correction-weight" as CorrectionId,
    scope: { kind: "task_weight", projectId, taskId },
    originalAssertionId: "assertion-original-weight" as AssertionId,
    correctedAssertionId: "assertion-corrected-weight" as AssertionId,
    effectiveAt: "2026-10-07T10:02:00.000Z",
    lifecycle: { status: "active" },
  },
] as const satisfies readonly CorrectionRecord[];

export const inactiveCorrections = [
  {
    ...closureCorrections[0],
    lifecycle: {
      status: "superseded",
      supersededBy: "correction-next-current" as CorrectionId,
      supersededAt: "2026-10-07T11:00:00.000Z",
      reasonCode: "fixture_later_user_choice",
      ruleId: "fixture.current-task.supersession",
      ruleVersion: "1",
      triggeringEventId: "event-next-user-choice" as EventId,
    },
  },
  {
    ...closureCorrections[2],
    lifecycle: {
      status: "expired",
      expiredAt: "2026-10-07T11:01:00.000Z",
      reasonCode: "fixture_task_removed",
      ruleId: "fixture.weight.expiry",
      ruleVersion: "1",
      triggeringEventId: "event-expiry-evidence" as EventId,
    },
  },
] as const satisfies readonly CorrectionRecord[];
