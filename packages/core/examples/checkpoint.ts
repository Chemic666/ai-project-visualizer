import * as core from "../src/index.js";
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
export interface WalkthroughTask {
  readonly title: string;
  readonly certainty: core.PlanCertainty | "unknown";
  readonly included: boolean;
  readonly status: core.WorkStatus | "unknown";
  readonly statusProvenance: core.Provenance | "unknown";
  readonly weight?: number;
  readonly weightProvenance: core.Provenance | "unknown";
  readonly completion: core.ProgressTaskBasis["completion"];
  readonly completionReason: core.ProgressTaskBasis["completionReason"];
  readonly planVersionCount: number;
  readonly correctionCount: number;
  readonly statusObservedAt?: string;
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
  readonly evidence: readonly SyntheticEvidenceSummary[];
  readonly kind: core.TimelineKind;
  readonly at: string;
  readonly title: string;
  readonly provenance: core.Provenance | "core_derived";
}
export interface Checkpoint {
  readonly key: string;
  readonly label: string;
  readonly progress: DemoProgress;
  readonly progressReasons: readonly string[];
  readonly tasks: readonly WalkthroughTask[];
  readonly timeline: readonly WalkthroughTimeline[];
  readonly sessionState: "started" | "ended";
  readonly currentTask:
    | { readonly status: "unknown" | "conflict" }
    | {
        readonly status: "available";
        readonly title: string;
        readonly provenance: "user_confirmed";
      };
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
    ...(previousTitle === undefined
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
  const current = core.getUserCorrectedCurrentTask(
    state.plan.core,
    projectId,
    sessionId,
  );
  const checkpointTaskNames = new Map(
    state.plan.core.tasks.map((task) => [task.id, task.title]),
  );
  return {
    key,
    label,
    tasks: result.tasks.map((basis) => {
      const status = basis.statusAssertions.find(
        (claim) => claim.id === basis.selectedStatusAssertionId,
      );
      const weight = basis.weightAssertions.find(
        (claim) => claim.id === basis.selectedWeightAssertionId,
      );
      const history = core.getTaskHistory(
        state.plan,
        scope,
        basis.entry.taskId,
      );
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
      return {
        title: basis.entry.title,
        ...(status === undefined
          ? {}
          : { statusObservedAt: status.observedAt }),
        ...(plan === undefined ? {} : { plan }),
        weightHistory,
        certainty: basis.entry.certainty ?? "unknown",
        included: basis.included,
        status: status?.value ?? "unknown",
        statusProvenance: status?.provenance ?? "unknown",
        ...(basis.effectiveWeight === undefined
          ? {}
          : { weight: basis.effectiveWeight }),
        weightProvenance: weight?.provenance ?? "unknown",
        completion: basis.completion,
        completionReason: basis.completionReason,
        planVersionCount:
          history.status === "available" ? history.revisions.length : 0,
        correctionCount:
          history.status === "available" ? history.corrections.length : 0,
      };
    }),
    sessionState: state.plan.core.acceptedEvents.some(
      (event) =>
        event.type === "session.ended" && event.payload.sessionId === sessionId,
    )
      ? "ended"
      : "started",
    timeline: core
      .getTimelineEntries(state.timeline, { projectId, sessionId })
      .map((entry) => {
        let title: string;
        if (entry.kind === "task.status_reported") {
          const taskTitle =
            state.plan.core.tasks.find(
              (task) => task.id === entry.detail.taskId,
            )?.title ?? "任务";
          const statusNames = {
            todo: "待处理",
            in_progress: "进行中",
            completed: "明确报告完成",
            verified: "报告已验证（声明）",
            blocked: "受阻",
          };
          title = `${taskTitle} · ${statusNames[entry.detail.reportedStatus]}`;
        } else if (entry.kind === "plan.changed") {
          title = `计划更新 · 新增 ${entry.detail.changes.filter((change) => change.kind === "task.added").length} 项`;
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
          evidence: details.evidence.map((row) =>
            summarizeSyntheticEvidence(row, checkpointTaskNames),
          ),
        };
      }),
    progress:
      result.status === "available"
        ? {
            status: "available",
            completedWeight: result.completedWeight,
            totalWeight: result.totalWeight,
            percentage: core.formatProgressPercentage(result.ratio),
            ratio: result.ratio,
          }
        : {
            status: "unavailable",
            issueCodes: [...new Set(result.issues.map((issue) => issue.code))],
          },
    progressReasons,
    currentTask:
      current.status === "available"
        ? {
            status: "available",
            title: state.plan.core.tasks.find(
              (task) => task.id === current.taskId,
            )!.title,
            provenance: current.provenance,
          }
        : { status: current.status },
  };
}
