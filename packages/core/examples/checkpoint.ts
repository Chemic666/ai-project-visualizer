import * as core from "../src/index.js";
import { describePlanChange, type PlanChangeView } from "./plan-inspection.js";
import {
  summarizeSyntheticEvidence,
  type SyntheticEvidenceSummary,
} from "./timeline-inspection.js";

type DemoProgress =
  | { readonly status: "unavailable"; readonly issueCodes: readonly string[] }
  | {
      readonly status: "available";
      readonly completedWeight: number;
      readonly totalWeight: number;
      readonly percentage: string;
      readonly ratio: number;
    };
type RecordedProgress = Extract<
  core.TimelineEntry,
  { kind: "progress.changed" }
>["detail"];

function describeProgress(result: RecordedProgress["after"]): DemoProgress {
  return result.status === "available"
    ? {
        status: "available",
        completedWeight: result.completedWeight,
        totalWeight: result.totalWeight,
        percentage: core.formatProgressPercentage(result.ratio),
        ratio: result.ratio,
      }
    : {
        status: "unavailable",
        issueCodes: [...new Set(result.issues.map(({ code }) => code))],
      };
}

export interface WalkthroughTask {
  readonly title: string;
  readonly certainty: core.PlanCertainty | "unknown";
  readonly included: boolean;
  readonly planOnly?: true;
  readonly status: core.WorkStatus | "unknown";
  readonly statusProvenance: core.Provenance | "unknown";
  readonly weight?: number;
  readonly weightProvenance: core.Provenance | "unknown";
  readonly completion: core.ProgressTaskBasis["completion"];
  readonly completionReason: core.ProgressTaskBasis["completionReason"];
  readonly planVersionCount: number;
  readonly correctionCount: number;
  readonly statusObservedAt?: string;
  readonly weightObservedAt?: string;
  readonly evidencePositions?: {
    readonly status?: number;
    readonly weight?: number;
    readonly plan?: number;
  };
  readonly plan?: {
    readonly revision: number;
    readonly provenance?: core.Provenance;
    readonly observedAt: string;
  };
  readonly weightHistory: readonly {
    readonly value: number;
    readonly previousWeight?: number;
    readonly provenance: core.Provenance;
    readonly at: string;
    readonly lifecycle: core.CorrectionLifecycle["status"];
  }[];
}
interface WalkthroughTimeline {
  readonly transition?: string;
  readonly planChange?: PlanChangeView;
  readonly progressChange?: {
    readonly before?: DemoProgress;
    readonly after: DemoProgress;
    readonly reasons: RecordedProgress["reasons"];
  };
  readonly evidence: readonly SyntheticEvidenceSummary[];
  readonly kind: core.TimelineKind;
  readonly at: string;
  readonly title: string;
  readonly provenance: core.Provenance | "core_derived";
}
interface WalkthroughPhase {
  readonly title: string;
  readonly provenance: core.Provenance;
  readonly taskPositions: readonly number[];
  readonly current: boolean;
  readonly totals?: {
    readonly completedWeight: number;
    readonly totalWeight: number;
  };
}

type WalkthroughCurrentPhase =
  | Exclude<core.CurrentPhaseResult, { status: "available" }>
  | {
      readonly status: "available";
      readonly title: string;
      readonly taskTitle: string;
      readonly groupProvenance: core.Provenance;
      readonly confirmedAt: string;
      readonly planObservedAt: string;
      readonly planPosition?: number;
      readonly correctionPosition?: number;
    };

type TaskAssociationReport = {
  readonly title: string;
  readonly reportPosition?: number;
  readonly conflictPosition?: number;
};
type WalkthroughCurrentTask =
  | { readonly status: "unknown" }
  | {
      readonly status: "available";
      readonly title: string;
      readonly provenance: "user_confirmed";
      readonly confirmedAt: string;
      readonly correctionPosition?: number;
    }
  | (TaskAssociationReport & {
      readonly status: "likely";
      readonly provenance: "visualizer_inferred";
      readonly taskPosition: number;
      readonly score: number;
      readonly planPosition?: number;
    })
  | {
      readonly status: "ambiguous";
      readonly reason: Extract<
        core.CurrentTaskAssociation,
        { status: "ambiguous" }
      >["reason"];
      readonly candidates: readonly TaskAssociationReport[];
    };

export interface Checkpoint {
  readonly key: string;
  readonly label: string;
  readonly progress: DemoProgress;
  readonly progressReasons: readonly string[];
  readonly tasks: readonly WalkthroughTask[];
  readonly phases: readonly WalkthroughPhase[];
  readonly currentPhase: WalkthroughCurrentPhase;
  readonly timeline: readonly WalkthroughTimeline[];
  readonly sessionState: "started" | "ended";
  readonly currentTask: WalkthroughCurrentTask;
}

function describeTaskChoice(
  state: core.CoreState,
  correctionId: core.CorrectionId,
  taskNames: ReadonlyMap<core.TaskId, string>,
) {
  const correction = state.corrections.find((row) => row.id === correctionId);
  if (!correction) return undefined;
  const choice = state.assertions.find(
    ({ id }) => id === correction.correctedAssertionId,
  );
  if (choice?.target !== "project.currentTask") return undefined;
  const title = taskNames.get(choice.value);
  if (title === undefined) return undefined;
  const prior = state.assertions.find(
    ({ id }) => id === correction.originalAssertionId,
  );
  const previousTitle =
    prior?.target === "project.currentTask"
      ? taskNames.get(prior.value)
      : undefined;
  return {
    title: `当前任务设为 ${title}`,
    ...(previousTitle === undefined || previousTitle === title
      ? {}
      : { transition: `${previousTitle} → ${title}` }),
  };
}

export function describeCheckpoint(
  state: core.ProjectEngineState,
  {
    key,
    label,
    result,
    progressReasons,
  }: {
    readonly key: string;
    readonly label: string;
    readonly result: core.ProgressResult;
    readonly progressReasons: readonly string[];
  },
): Checkpoint {
  const { projectId, sessionId } = state.scope;
  if (sessionId === undefined)
    throw new Error("synthetic_checkpoint_session_missing");
  const scope = state.scope;
  const current = core.getCurrentTaskAssociation(state.plan, scope);
  const checkpointTaskNames = new Map(
    state.plan.core.tasks.map((task) => [task.id, task.title]),
  );
  const timeline = core.getTimelineEntries(state.timeline, {
    projectId,
    sessionId,
  });
  const planChangesBySource = new Map(
    state.plan.changes.map((change) => [change.causedBy, change.id]),
  );
  function confirmationPosition(correctionId: core.CorrectionId) {
    return timeline.findIndex(
      (entry) =>
        entry.kind === "correction.applied" &&
        entry.detail.correctionId === correctionId,
    );
  }
  const derived = core.getCurrentPhaseFromCorrection(state.plan, scope);
  let currentPhase: WalkthroughCurrentPhase;
  if (derived.status === "available") {
    const { correctionId, planRevisionEventId, confirmedAt, planObservedAt } =
      derived.evidence;
    const planChangeId = planChangesBySource.get(planRevisionEventId);
    const planPosition = timeline.findIndex(
      (entry) =>
        entry.kind === "plan.changed" && entry.eventId === planChangeId,
    );
    const correctionPosition = confirmationPosition(correctionId);
    currentPhase = {
      status: "available",
      title: derived.phase.title,
      taskTitle: derived.taskTitle,
      groupProvenance: derived.phase.provenance,
      confirmedAt,
      planObservedAt,
      ...(planPosition < 0 ? {} : { planPosition }),
      ...(correctionPosition < 0 ? {} : { correctionPosition }),
    };
  } else {
    currentPhase = derived;
  }
  const currentPlan = core.getPlanSnapshot(state.plan, scope);
  const snapshot =
    currentPlan.status === "available" ? currentPlan.snapshot : undefined;
  const matchesPlan =
    snapshot !== undefined && result.planRevisionEventId === snapshot.eventId;
  // A partial plan establishes these memberships without allowing a progress total.
  const projected =
    matchesPlan && snapshot.completeness === "partial"
      ? snapshot.entries.map((entry) => ({ entry, basis: undefined }))
      : result.tasks.map((basis) => ({ entry: basis.entry, basis }));
  const phases =
    matchesPlan && projected.length === snapshot.entries.length
      ? snapshot.phases.map((phase): WalkthroughPhase => {
          const totals = result.phases.find(
            ({ phaseId }) => phaseId === phase.phaseId,
          );
          return {
            title: phase.title,
            provenance: phase.provenance,
            taskPositions: projected.flatMap(({ entry }, position) =>
              entry.phaseId === phase.phaseId ? [position] : [],
            ),
            current:
              derived.status === "available" &&
              derived.phase.phaseId === phase.phaseId,
            ...(totals && totals.totalWeight > 0
              ? {
                  totals: {
                    completedWeight: totals.completedWeight,
                    totalWeight: totals.totalWeight,
                  },
                }
              : {}),
          };
        })
      : [];

  function reportPosition(id: core.EventId | undefined) {
    if (id === undefined) return undefined;
    const position = timeline.findIndex(
      (entry) => entry.kind === "task.status_reported" && entry.eventId === id,
    );
    return position < 0 ? undefined : position;
  }
  function projectReport(
    candidate: Pick<
      Extract<core.CurrentTaskAssociation, { status: "likely" }>,
      "taskTitle" | "reportEventId" | "conflictingEventId"
    >,
  ): TaskAssociationReport {
    const report = reportPosition(candidate.reportEventId);
    const conflict = reportPosition(candidate.conflictingEventId);
    return {
      title: candidate.taskTitle,
      ...(report === undefined ? {} : { reportPosition: report }),
      ...(conflict === undefined ? {} : { conflictPosition: conflict }),
    };
  }
  function projectCurrentTask(): WalkthroughCurrentTask {
    if (current.status === "confirmed") {
      const correctionPosition = confirmationPosition(current.correction.id);
      return {
        status: "available",
        title: checkpointTaskNames.get(current.taskId)!,
        provenance: "user_confirmed",
        confirmedAt: current.correction.effectiveAt,
        ...(correctionPosition < 0 ? {} : { correctionPosition }),
      };
    }
    if (current.status === "ambiguous")
      return {
        status: current.status,
        reason: current.reason,
        candidates: current.candidates.map(projectReport),
      };
    if (current.status === "unknown") return { status: "unknown" };
    const planPosition = timeline.findIndex(
      (entry) =>
        entry.kind === "plan.changed" &&
        entry.eventId === planChangesBySource.get(current.planRevisionEventId),
    );
    return {
      ...projectReport(current),
      status: "likely",
      provenance: current.assertion.provenance,
      score: current.assertion.inference.associationConfidence.heuristicScore,
      taskPosition: projected.findIndex(
        ({ entry }) => entry.taskId === current.taskId,
      ),
      ...(planPosition < 0 ? {} : { planPosition }),
    };
  }

  return {
    key,
    label,
    phases,
    currentPhase,
    tasks: projected.map(({ entry: task, basis }) => {
      const status = basis?.statusAssertions.find(
        (claim) => claim.id === basis.selectedStatusAssertionId,
      );
      const weight = basis?.weightAssertions.find(
        (claim) => claim.id === basis.selectedWeightAssertionId,
      );
      const history = core.getTaskHistory(state.plan, scope, task.taskId);
      const member =
        history.status === "available" && history.current.status === "member"
          ? history.current
          : undefined;
      const source =
        member &&
        state.plan.core.acceptedEvents.find(
          (event) => event.id === member.eventId,
        );
      const plan =
        history.status === "available" &&
        source &&
        (source.type === "plan.detected" || source.type === "plan.updated")
          ? {
              revision: history.revisions.length,
              observedAt: source.receivedAt,
              ...(source.payload.provenance === undefined
                ? {}
                : { provenance: source.payload.provenance }),
            }
          : undefined;
      const weightHistory =
        history.status === "available"
          ? history.corrections.flatMap(
              ({ record, assertion, originalAssertion }) =>
                assertion.target === "task.weight"
                  ? [
                      {
                        value: assertion.value,
                        ...(originalAssertion?.target === "task.weight"
                          ? { previousWeight: originalAssertion.value }
                          : {}),
                        provenance: assertion.provenance,
                        at: record.effectiveAt,
                        lifecycle: record.lifecycle.status,
                      },
                    ]
                  : [],
            )
          : [];
      // These positions only identify items in this checkpoint's own timeline.
      // Keep the underlying claim, event and correction identities in Core.
      const statusPosition =
        status?.eventId === undefined
          ? -1
          : timeline.findIndex(
              (entry) =>
                entry.kind === "task.status_reported" &&
                entry.eventId === status.eventId &&
                entry.detail.taskId === task.taskId,
            );
      const activeWeight = basis?.corrections.find(
        (record) =>
          record.lifecycle.status === "active" &&
          record.correctedAssertionId === basis.selectedWeightAssertionId,
      );
      const weightPosition =
        activeWeight === undefined
          ? -1
          : timeline.findIndex(
              (entry) =>
                entry.kind === "correction.applied" &&
                entry.detail.correctionId === activeWeight.id,
            );
      const planChangeId =
        plan && member ? planChangesBySource.get(member.eventId) : undefined;
      const planPosition =
        planChangeId === undefined
          ? -1
          : timeline.findIndex(
              (entry) =>
                entry.kind === "plan.changed" && entry.eventId === planChangeId,
            );
      return {
        title: task.title,
        ...(status === undefined
          ? {}
          : { statusObservedAt: status.observedAt }),
        ...(weight === undefined
          ? {}
          : { weightObservedAt: weight.observedAt }),
        ...(statusPosition < 0 && weightPosition < 0 && planPosition < 0
          ? {}
          : {
              evidencePositions: {
                ...(statusPosition < 0 ? {} : { status: statusPosition }),
                ...(weightPosition < 0 ? {} : { weight: weightPosition }),
                ...(planPosition < 0 ? {} : { plan: planPosition }),
              },
            }),
        ...(plan === undefined ? {} : { plan }),
        weightHistory,
        certainty: task.certainty ?? "unknown",
        included: basis?.included ?? false,
        ...(basis === undefined ? { planOnly: true as const } : {}),
        status: status?.value ?? "unknown",
        statusProvenance: status?.provenance ?? "unknown",
        ...(basis?.effectiveWeight === undefined
          ? {}
          : { weight: basis.effectiveWeight }),
        weightProvenance: weight?.provenance ?? "unknown",
        completion: basis?.completion ?? "unknown",
        completionReason: basis?.completionReason ?? "status_unknown",
        planVersionCount:
          history.status === "available" ? history.revisions.length : 0,
        correctionCount:
          history.status === "available" ? history.corrections.length : 0,
      };
    }),
    sessionState:
      current.status === "unknown" && current.reason === "session_ended"
        ? "ended"
        : "started",
    timeline: timeline.map((entry) => {
      const planChange =
        entry.kind === "plan.changed"
          ? describePlanChange(state, entry.eventId)
          : undefined;
      let title: string;
      if (entry.kind === "task.status_reported") {
        const taskTitle =
          state.plan.core.tasks.find((task) => task.id === entry.detail.taskId)
            ?.title ?? "任务";
        const statusNames = {
          todo: "待处理",
          in_progress: "进行中",
          completed: "明确报告完成",
          verified: "报告已验证（声明）",
          blocked: "受阻",
        };
        title = `${taskTitle} · ${statusNames[entry.detail.reportedStatus]}`;
      } else if (entry.kind === "plan.changed") {
        title = planChange?.title ?? "计划更新";
      } else if (entry.kind === "progress.changed") {
        title =
          entry.detail.after.status === "available"
            ? `进度更新为 ${core.formatProgressPercentage(entry.detail.after.ratio)}`
            : "进度计算依据尚未齐备";
      } else if (
        entry.kind === "session.started" ||
        entry.kind === "session.ended"
      ) {
        title =
          entry.kind === "session.started"
            ? "Session 明确开始"
            : "Session 明确结束";
      } else {
        const target =
          entry.detail.scope.kind === "current_task"
            ? "当前任务纠正"
            : "权重纠正";
        title = `${target}${entry.kind === "correction.applied" ? "已记录" : entry.kind === "correction.superseded" ? "被后续人工输入替代" : "已失效"}`;
      }
      const details = core.getTimelineEntryDetails(state, entry.id);
      if (details.status !== "available")
        throw new Error("synthetic_checkpoint_evidence_missing");
      const taskChoice =
        entry.kind === "correction.applied" &&
        entry.detail.scope.kind === "current_task"
          ? describeTaskChoice(
              state.plan.core,
              entry.detail.correctionId,
              checkpointTaskNames,
            )
          : undefined;
      return {
        kind: entry.kind,
        at: entry.observedAt,
        title,
        provenance: entry.provenance ?? "core_derived",
        ...(entry.kind === "progress.changed"
          ? {
              progressChange: {
                ...(entry.detail.before === undefined
                  ? {}
                  : { before: describeProgress(entry.detail.before) }),
                after: describeProgress(entry.detail.after),
                reasons: entry.detail.reasons,
              },
              transition: `${
                entry.detail.before?.status === "available"
                  ? core.formatProgressPercentage(entry.detail.before.ratio)
                  : entry.detail.before === undefined
                    ? "尚无计算"
                    : "不可用"
              } → ${
                entry.detail.after.status === "available"
                  ? core.formatProgressPercentage(entry.detail.after.ratio)
                  : "不可用"
              }`,
            }
          : {}),
        ...taskChoice,
        ...(planChange === undefined ? {} : { planChange }),
        evidence: details.evidence.map((row) =>
          summarizeSyntheticEvidence(row, checkpointTaskNames),
        ),
      };
    }),
    progress: describeProgress(result),
    progressReasons,
    currentTask: projectCurrentTask(),
  };
}
