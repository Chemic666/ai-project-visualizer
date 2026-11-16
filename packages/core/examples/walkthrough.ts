import { describeCheckpoint, type Checkpoint } from "./checkpoint.js";
import { describePlanChange } from "./plan-inspection.js";
import { summarizeSyntheticEvidence } from "./timeline-inspection.js";
export type { WalkthroughTask } from "./checkpoint.js";
import * as core from "../src/index.js";
import type {
  AssertionId,
  CorrectionId,
  EventId,
  NormalizedEvent,
  PlanStepInput,
  ProjectId,
  ProjectUpdate,
  SessionId,
  SourceId,
  TaskId,
  TaskWeight,
} from "../src/index.js";

export function runCoreWalkthrough(jwtWeight = 17, inspectPosition?: number) {
  return buildWalkthrough(jwtWeight, inspectPosition).report;
}

export function createEditableWalkthrough() {
  return buildWalkthrough(17);
}

// Deliberately synthetic inputs only: no paths, runtime discovery or Agent calls.
function buildWalkthrough(jwtWeight: number, inspectPosition?: number) {
  if (
    inspectPosition !== undefined &&
    (!Number.isSafeInteger(inspectPosition) || inspectPosition < 1)
  )
    throw new Error("synthetic_inspection_position_invalid");
  const projectId = "synthetic-auth-project" as ProjectId;
  const sourceId = "synthetic-auth-source" as SourceId;
  const sessionId = "synthetic-auth-session" as SessionId;
  const userId = "synthetic-user" as SourceId;
  const scope = {
    projectId,
    sourceId,
    sessionId,
    planId: "synthetic-auth-plan",
  };
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 10, 8, 10, minute)).toISOString();
  const eventId = (tag: string) => `synthetic-event-${tag}` as EventId;
  let state = core.createProjectEngineState(
    core.createPlanEngineState(
      core.createCoreState({
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
      }),
    ),
    scope,
  );
  const checkpoints: Checkpoint[] = [];

  function progressFor(updated: core.ProjectEngineState) {
    return core.calculateProgress(
      updated.plan,
      scope,
      updated.verificationSupports,
    );
  }

  function checkpoint(
    updated: core.ProjectEngineState,
    key: string,
    label: string,
    previousChanges: number,
  ) {
    return describeCheckpoint(updated, {
      key,
      label,
      result: progressFor(updated),
      progressReasons:
        updated.progress.changes.length > previousChanges
          ? updated.progress.changes.at(-1)!.reasons
          : [],
    });
  }

  function apply(
    key: string,
    label: string,
    update: ProjectUpdate,
    minute: number,
    capture = true,
  ) {
    const previousChanges = state.progress.changes.length;
    const applied = core.applyProjectUpdate(state, update, at(minute));
    if (applied.status !== "applied")
      throw new Error(`synthetic_update_failed:${applied.status}`);
    state = applied.state;
    if (!capture) return;
    checkpoints.push(checkpoint(state, key, label, previousChanges));
  }
  function task(sourceItemId: string): TaskId {
    const view = core.getPlanSnapshot(state.plan, scope);
    if (view.status !== "available")
      throw new Error("synthetic_plan_unavailable");
    const entry = view.snapshot.entries.find(
      (item) => item.sourceItemId === sourceItemId,
    );
    if (!entry) throw new Error("synthetic_task_missing");
    return entry.taskId;
  }
  function weight(
    id: string,
    target: TaskId,
    value: number,
    minute: number,
    originalAssertionId?: AssertionId,
  ): ProjectUpdate {
    return {
      kind: "correction",
      input: {
        id: id as CorrectionId,
        scope: { kind: "task_weight", projectId, sessionId, taskId: target },
        effectiveAt: at(minute),
        ...(originalAssertionId === undefined ? {} : { originalAssertionId }),
        assertion: {
          id: `${id}-assertion` as AssertionId,
          target: "task.weight",
          targetId: target,
          value: value as TaskWeight,
          provenance: "user_confirmed",
          sourceId: userId,
          observedAt: at(minute),
        },
      },
    };
  }

  function currentTaskChoice(
    id: string,
    target: TaskId,
    minute: number,
    originalAssertionId?: AssertionId,
  ): ProjectUpdate {
    return {
      kind: "correction",
      input: {
        id: id as CorrectionId,
        scope: { kind: "current_task", projectId, sessionId },
        effectiveAt: at(minute),
        ...(originalAssertionId === undefined ? {} : { originalAssertionId }),
        assertion: {
          id: `${id}-assertion` as AssertionId,
          target: "project.currentTask",
          targetId: projectId,
          value: target,
          provenance: "user_confirmed",
          sourceId: userId,
          observedAt: at(minute),
        },
      },
    };
  }
  const steps: readonly PlanStepInput[] = [
    { sourceItemId: "login", title: "Login", certainty: "confirmed" },
    { sourceItemId: "jwt", title: "JWT", certainty: "confirmed" },
  ];
  function plan(
    tag: string,
    entries: readonly PlanStepInput[],
    minute: number,
    previousEventId?: EventId,
  ): NormalizedEvent<"plan.updated"> {
    return {
      id: eventId(tag),
      type: "plan.updated",
      schemaVersion: 1,
      projectId,
      sourceId,
      sessionId,
      receivedAt: at(minute),
      payload: {
        planId: scope.planId,
        provenance: "agent_reported",
        completeness: "complete",
        steps: entries,
        ...(previousEventId === undefined ? {} : { previousEventId }),
      },
    };
  }
  apply(
    "session-started",
    "Session 开始，尚无计划",
    {
      kind: "source",
      event: {
        id: eventId("start"),
        type: "session.started",
        schemaVersion: 1,
        projectId,
        sourceId,
        sessionId,
        receivedAt: at(0),
        payload: { sessionId },
      },
    },
    0,
  );
  const initialPlan = plan("initial-plan", steps, 1);
  apply(
    "plan-detected",
    "发现完整计划，权重仍未知",
    { kind: "source", event: initialPlan },
    1,
  );
  apply(
    "initial-login-weight",
    "设置 Login 合成权重",
    weight("login-weight", task("login"), 32, 2),
    2,
    false,
  );
  apply(
    "initial-jwt-weight",
    "设置 JWT 合成权重",
    weight("jwt-weight", task("jwt"), 13, 3),
    3,
    false,
  );
  const completion: NormalizedEvent<"task.status_reported"> = {
    id: eventId("login-completed"),
    type: "task.status_reported",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(4),
    payload: { taskId: task("login"), status: "completed" },
  };
  apply(
    "completed-report",
    "Agent 明确报告 Login 完成",
    { kind: "source", event: completion },
    4,
  );
  apply(
    "jwt-started",
    "Agent 报告 JWT 进行中",
    {
      kind: "source",
      event: {
        id: eventId("jwt-started"),
        type: "task.status_reported",
        schemaVersion: 1,
        projectId,
        sourceId,
        sessionId,
        receivedAt: at(5),
        payload: { taskId: task("jwt"), status: "in_progress" },
      },
    },
    5,
    false,
  );
  apply(
    "current-task-corrected",
    "用户确认当前任务为 JWT",
    currentTaskChoice("manual-current-task", task("jwt"), 6),
    6,
  );
  const expanded = plan(
    "expanded-plan",
    [
      ...steps,
      {
        sourceItemId: "refresh",
        title: "Refresh Token",
        certainty: "confirmed",
      },
      {
        sourceItemId: "revoke",
        title: "Token Revocation",
        certainty: "confirmed",
      },
    ],
    7,
    initialPlan.id,
  );
  apply(
    "plan-expanded",
    "计划增加两项，缺少权重时暂停显示百分比",
    { kind: "source", event: expanded },
    7,
  );
  apply(
    "refresh-weight",
    "设置新增任务合成权重",
    weight("refresh-weight", task("refresh"), 3, 8),
    8,
    false,
  );
  apply(
    "expansion-weighted",
    "新增任务的 3 和 2 权重已补齐",
    weight("revoke-weight", task("revoke"), 2, 9),
    9,
  );

  // The review uses this checkpoint as its baseline and shares one in-memory
  // history for both editing actions. The built-in replay continues separately.
  let reviewState = state;
  let reviewCheckpoint = checkpoints.at(-1)!;
  let editMinute = 10;
  function applyReview(update: ProjectUpdate) {
    const applied = core.applyProjectUpdate(
      reviewState,
      update,
      at(editMinute),
    );
    if (applied.status !== "applied")
      throw new Error("synthetic_review_rejected");
    const next = checkpoint(
      applied.state,
      "review",
      "本次调整 · 从第六个检查点开始",
      reviewState.progress.changes.length,
    );
    editMinute++;
    reviewState = applied.state;
    reviewCheckpoint = next;
    return next;
  }
  function taskForReview(position: number) {
    const basis = progressFor(reviewState).tasks[position];
    if (!basis?.included) throw new Error("synthetic_task_not_editable");
    return basis;
  }
  function currentChoice() {
    return core.getUserCorrectedCurrentTask(
      reviewState.plan.core,
      projectId,
      sessionId,
    );
  }
  const review = {
    baselineIndex: checkpoints.length - 1,
    get checkpoint() {
      return reviewCheckpoint;
    },
    get currentTaskPosition() {
      const selected = currentChoice();
      if (selected.status !== "available") return -1;
      return progressFor(reviewState).tasks.findIndex(
        ({ entry }) => entry.taskId === selected.taskId,
      );
    },
    setWeight(position: number, value: number) {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("synthetic_weight_invalid");
      const basis = taskForReview(position);
      if (basis.effectiveWeight === value) return reviewCheckpoint;
      return applyReview(
        weight(
          `review-weight-${editMinute}`,
          basis.entry.taskId,
          value,
          editMinute,
          basis.selectedWeightAssertionId,
        ),
      );
    },
    selectCurrentTask(position: number) {
      const target = taskForReview(position).entry.taskId;
      const previous = currentChoice();
      if (previous.status === "available" && previous.taskId === target)
        return reviewCheckpoint;
      return applyReview(
        currentTaskChoice(
          `review-task-${editMinute}`,
          target,
          editMinute,
          previous.status === "available" ? previous.assertion.id : undefined,
        ),
      );
    },
  };
  const originalJwt = task("jwt");
  const originalJwtWeight = progressFor(state).tasks.find(
    ({ entry }) => entry.taskId === originalJwt,
  )?.selectedWeightAssertionId;
  apply(
    "weight-corrected",
    jwtWeight === 13
      ? "用户再次确认 JWT 权重为 13"
      : `用户将 JWT 权重从 13 调整为 ${jwtWeight}`,
    weight(
      "jwt-weight-replacement",
      originalJwt,
      jwtWeight,
      10,
      originalJwtWeight,
    ),
    10,
  );
  // Independent branch before Session end; does not alter the main progress story.
  const oldJwtId = task("jwt");
  const branchSteps = expanded.payload.steps.map((entry) =>
    entry.sourceItemId === "login" ? { ...entry, title: "Login API" } : entry,
  );
  const removal = plan(
    "history-removal",
    branchSteps.filter((entry) => entry.sourceItemId !== "jwt"),
    11,
    expanded.id,
  );
  const removed = core.applyProjectUpdate(
    state,
    { kind: "source", event: removal },
    at(11),
  );
  if (removed.status !== "applied")
    throw new Error("synthetic_history_removal_failed");
  const reentry = plan("history-reentry", branchSteps, 12, removal.id);
  const reentered = core.applyProjectUpdate(
    removed.state,
    { kind: "source", event: reentry },
    at(12),
  );
  if (reentered.status !== "applied")
    throw new Error("synthetic_history_reentry_failed");
  const reentryPlan = core.getPlanSnapshot(reentered.state.plan, scope);
  if (reentryPlan.status !== "available")
    throw new Error("synthetic_history_plan_missing");
  const newJwtId = reentryPlan.snapshot.entries.find(
    (entry) => entry.sourceItemId === "jwt",
  )!.taskId;
  function historySummary(taskId: TaskId) {
    const history = core.getTaskHistory(reentered.state.plan, scope, taskId);
    if (history.status !== "available")
      throw new Error("synthetic_history_missing");
    return {
      membership: history.current.status,
      planVersionCount: history.revisions.length,
      correctionCount: history.corrections.length,
      statusClaimCount: history.assertions.filter(
        (assertion) => assertion.target === "task.status",
      ).length,
    };
  }
  const membershipHistory = {
    identityChanged: oldJwtId !== newJwtId,
    removedTask: historySummary(oldJwtId),
    reenteredTask: historySummary(newJwtId),
    reentryProgress: core.calculateProgress(reentered.state.plan, scope).status,
  };
  const membershipPlanChanges = [removal, reentry].map(({ id }) => {
    const change = reentered.state.plan.changes.find(
      ({ causedBy }) => causedBy === id,
    );
    const view = change && describePlanChange(reentered.state, change.id);
    if (!view) throw new Error("synthetic_plan_history_missing");
    return view;
  });
  if (
    !membershipHistory.identityChanged ||
    membershipHistory.removedTask.membership !== "not_member" ||
    membershipHistory.reenteredTask.membership !== "member" ||
    membershipHistory.reenteredTask.correctionCount !== 0 ||
    membershipHistory.reentryProgress !== "unavailable"
  )
    throw new Error("synthetic_membership_history_invariant_failed");
  const beforeDuplicate = state;
  const duplicate = core.applyProjectUpdate(
    state,
    { kind: "source", event: expanded },
    at(11),
  );
  const beforeReject = state;
  const rejected = core.applyProjectUpdate(
    state,
    weight("invalid-weight", task("jwt"), -1, 11),
    at(11),
  );
  const end: NormalizedEvent<"session.ended"> = {
    id: eventId("end"),
    type: "session.ended",
    schemaVersion: 1,
    projectId,
    sourceId,
    sessionId,
    receivedAt: at(12),
    payload: { sessionId },
  };
  apply(
    "session-ended",
    "Session 明确结束，当前任务纠正失效",
    { kind: "source", event: end },
    12,
  );
  const restored: core.ProjectEngineState = JSON.parse(JSON.stringify(state));
  const replay = core.applyProjectUpdate(
    restored,
    { kind: "source", event: end },
    at(13),
  );
  const checks = {
    duplicatePlanPreservesState:
      duplicate.status === "duplicate" && duplicate.state === beforeDuplicate,
    rejectedWeightPreservesState:
      rejected.status === "rejected" && rejected.state === beforeReject,
    restoredSessionReplayPreservesState:
      replay.status === "duplicate" && replay.state === restored,
    originalCompletionClaimPreserved: state.plan.core.acceptedEvents.some(
      (event) =>
        event.id === completion.id &&
        event.type === "task.status_reported" &&
        event.payload.status === "completed",
    ),
  };
  if (!Object.values(checks).every(Boolean))
    throw new Error("synthetic_replay_invariant_failed");
  const inspections = core
    .getTimelineEntries(state.timeline, { projectId, sessionId })
    .map((entry) => {
      const result = core.getTimelineEntryDetails(state, entry.id);
      if (result.status !== "available")
        throw new Error("synthetic_timeline_details_missing");
      return result;
    });
  const evidence = inspections.flatMap((row) => row.evidence);
  const currentTaskAction = inspections.find(
    (row) =>
      row.entry.kind === "correction.applied" &&
      row.entry.detail.scope.kind === "current_task",
  );
  const currentRecord = currentTaskAction?.evidence.find(
    (row) => row.status === "available" && row.record.kind === "correction",
  );
  if (
    currentTaskAction === undefined ||
    currentRecord?.status !== "available" ||
    currentRecord.record.kind !== "correction"
  )
    throw new Error("synthetic_timeline_correction_missing");
  const inspection =
    inspectPosition === undefined
      ? undefined
      : inspections[inspectPosition - 1];
  if (inspectPosition !== undefined && inspection === undefined)
    throw new Error("synthetic_inspection_position_invalid");
  const taskNames = new Map(
    state.plan.core.tasks.map((task) => [task.id, task.title]),
  );
  const selected =
    inspection === undefined
      ? undefined
      : {
          position: inspectPosition!,
          kind: inspection.entry.kind,
          title: checkpoints.at(-1)!.timeline[inspectPosition! - 1]!.title,
          at: inspection.entry.observedAt,
          provenance: inspection.entry.provenance ?? "core_derived",
          evidence: inspection.evidence.map((row) =>
            summarizeSyntheticEvidence(row, taskNames),
          ),
        };
  const timelineInspection = {
    entryCount: inspections.length,
    ...(selected === undefined ? {} : { selected }),
    localReferenceCount: evidence.filter((row) => row.status === "available")
      .length,
    externalReferenceCount: evidence.filter(
      (row) => row.status === "external_reference",
    ).length,
    unavailableReferenceCount: evidence.filter(
      (row) => row.status === "unavailable",
    ).length,
    currentTaskCorrection: {
      action: currentTaskAction.entry.kind,
      actionAt: currentTaskAction.entry.observedAt,
      recordVersion: currentRecord.record.version,
      lifecycle: currentRecord.record.record.lifecycle.status,
    },
  };
  if (timelineInspection.unavailableReferenceCount !== 0)
    throw new Error("synthetic_timeline_reference_missing");
  const final = progressFor(state);
  const report = {
    mode: "synthetic_core_only" as const,
    realSessionObserved: false,
    storageUsed: false,
    modelCalls: 0,
    checkpoints,
    checks,
    membershipHistory,
    membershipPlanChanges,
    timelineInspection,
    finalTasks: final.tasks.map((basis) => ({
      title: basis.entry.title,
      completion: basis.completion,
      statusProvenance:
        basis.statusAssertions.find(
          (claim) => claim.id === basis.selectedStatusAssertionId,
        )?.provenance ?? "unknown",
      weightProvenance:
        basis.weightAssertions.find(
          (claim) => claim.id === basis.selectedWeightAssertionId,
        )?.provenance ?? "unknown",
      ...(basis.effectiveWeight === undefined
        ? {}
        : { weight: basis.effectiveWeight }),
    })),
    timelineKinds: core
      .getTimelineEntries(state.timeline, { projectId, sessionId })
      .map((entry) => entry.kind),
    timelineEntryCount: state.timeline.entries.length,
  };
  return { report, review };
}
