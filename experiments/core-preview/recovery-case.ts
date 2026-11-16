import { describeCheckpoint } from "../../packages/core/examples/checkpoint.js";
import * as core from "../../packages/core/src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  NormalizedEvent,
  ProjectId,
  SessionId,
  SourceId,
  TaskId,
  TaskWeight,
  UserCorrectionInput,
} from "../../packages/core/src/index.js";
import type {
  CommitRequest,
  CorrectionCommitRequest,
  SyntheticTimelineStore,
  TimelineStorageCut,
  WriterCapability,
} from "../../packages/storage/src/development.mjs";

export {
  appendTimelineEvents,
  applyNormalizedEvent,
  applyPlanEvent,
  updateProgress,
} from "../../packages/core/src/index.js";
export { validatePlan } from "../../packages/core/src/plan-engine.js";
export {
  describeCorrectionRecord,
  prepareUserCorrection,
  prepareCorrectionExpiry,
} from "../../packages/core/src/correction-engine.js";

const projectId = "apv-recovery-project" as ProjectId;
const sourceId = "apv-recovery-source" as SourceId;
const sessionId = "apv-recovery-session" as SessionId;
const user = "apv-recovery-user" as SourceId;
const planId = "apv-recovery-plan";
export const scope = { projectId, sourceId, sessionId, planId };

export function createBootstrap() {
  return core.createCoreState({
    projects: [
      {
        id: projectId,
        name: "Synthetic Authentication",
        locations: [],
        phaseIds: [],
        currentTaskAssertionIds: [],
        currentPhaseAssertionIds: [],
      },
    ],
  });
}

const at = (minute: number) =>
  "2026-11-15T10:" + String(minute).padStart(2, "0") + ":00.000Z";

function observation<Type extends NormalizedEvent["type"]>(
  type: Type,
  tag: string,
  minute: number,
  payload: Extract<NormalizedEvent, { type: Type }>["payload"],
) {
  return {
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    id: ("apv-recovery-event-" + tag) as EventId,
    receivedAt: at(minute),
    sourceIdentity: {
      kind: "source_event",
      sourceId,
      sourceEventId: "recovery-" + tag,
    },
    type,
    payload,
  } as Extract<NormalizedEvent, { type: Type }>;
}

function weight(
  taskId: TaskId,
  tag: string,
  minute: number,
  value: number,
): UserCorrectionInput {
  return {
    id: ("apv-recovery-choice-" + tag) as CorrectionId,
    scope: { kind: "task_weight", projectId, sessionId, taskId },
    effectiveAt: at(minute),
    assertion: {
      id: ("apv-recovery-claim-" + tag) as AssertionId,
      target: "task.weight",
      targetId: taskId,
      sourceId: user,
      observedAt: at(minute),
      value: value as TaskWeight,
      provenance: "user_confirmed",
    },
  };
}

type Operation =
  | Omit<
      CommitRequest,
      "operationId" | "operationNonce" | "expectedHead" | "writer"
    >
  | Pick<CorrectionCommitRequest, "correction">;

type CommitResult = ReturnType<SyntheticTimelineStore["commit"]>;
interface ScenarioStore {
  read(): { head: number } | Promise<{ head: number }>;
  writer(): WriterCapability;
  commit(
    request: CommitRequest | CorrectionCommitRequest,
  ): CommitResult | Promise<CommitResult>;
}

function request(
  writer: WriterCapability,
  expectedHead: number,
  work: Operation,
) {
  return {
    operationId: "apv-recovery-op-" + expectedHead,
    operationNonce: "apv-recovery-nonce-" + expectedHead,
    expectedHead,
    writer,
    ...work,
  };
}

function lastOperation(): Operation {
  const end = observation("session.ended", "end", 8, { sessionId });
  return {
    events: [end],
    cursor: {
      sourceId,
      streamId: "apv-recovery-stream",
      codec: "synthetic.v1",
      position: "apv-recovery-final",
      expectedPrevious: null,
      coveredEventIds: [end.id],
    },
  };
}

export function scenarioFinalRequest(
  writer: WriterCapability,
  expectedHead: number,
) {
  return request(writer, expectedHead, lastOperation());
}

// Both the local store and its asynchronous Worker Host run this fixed scenario.
export async function writeScenario(store: ScenarioStore) {
  let head = (await store.read()).head;
  if (head !== 1) throw new Error("synthetic_fixture_not_fresh");
  async function commit(work: Operation) {
    const cut = await store.commit(request(store.writer(), head, work));
    if (cut.status !== "committed")
      throw new Error("synthetic_fixture_commit_failed");
    head = cut.head;
    return cut;
  }

  const start = observation("session.started", "start", 0, { sessionId });
  const plan = observation("plan.detected", "plan", 1, {
    planId,
    completeness: "complete",
    provenance: "agent_reported",
    steps: [
      { sourceItemId: "login", title: "Login", certainty: "confirmed" },
      {
        sourceItemId: "review",
        title: "Session review",
        certainty: "confirmed",
      },
    ],
  });
  const initial = await commit({ events: [start, plan] });
  const login = initial.plan.heads[0]?.entries[0]?.taskId;
  const review = initial.plan.heads[0]?.entries[1]?.taskId;
  if (login === undefined || review === undefined)
    throw new Error("synthetic_fixture_plan_missing");

  await commit({
    correction: {
      id: "apv-recovery-current" as CorrectionId,
      scope: { kind: "current_task", projectId, sessionId },
      effectiveAt: at(2),
      assertion: {
        id: "apv-recovery-current-claim" as AssertionId,
        target: "project.currentTask",
        targetId: projectId,
        value: login,
        provenance: "user_confirmed",
        sourceId: user,
        observedAt: at(2),
      },
    },
  });
  await commit({ correction: weight(login, "login", 3, 3) });
  const firstReviewWeight = weight(review, "review", 4, 2);
  await commit({ correction: firstReviewWeight });
  await commit({
    events: [
      observation("task.status_reported", "login-complete", 5, {
        taskId: login,
        status: "completed",
      }),
      observation("task.status_reported", "review-verified", 6, {
        taskId: review,
        status: "verified",
      }),
    ],
  });
  await commit({
    correction: {
      ...weight(review, "review-updated", 7, 3),
      supersedes: firstReviewWeight.id,
      originalAssertionId: firstReviewWeight.assertion.id,
    },
  });
  return commit(lastOperation());
}

export function projectRecoveredCheckpoint(cut: TimelineStorageCut) {
  const progress = cut.progress.snapshots.at(-1)?.result;
  if (progress === undefined)
    throw new Error("synthetic_fixture_progress_missing");
  return describeCheckpoint(
    {
      scope,
      plan: cut.plan,
      timeline: cut.timeline,
      progress: cut.progress,
      verificationSupports: [],
    },
    {
      key: "restored",
      label: "已恢复的合成历史",
      result: progress,
      progressReasons: cut.progress.changes.at(-1)?.reasons ?? [],
    },
  );
}
