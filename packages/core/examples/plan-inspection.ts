import {
  formatProgressPercentage,
  type EventId,
  type PhaseId,
  type PlanCertainty,
  type PlanChange,
  type PlanHead,
  type ProgressResult,
  type ProjectEngineState,
} from "../src/index.js";

const certaintyNames: Record<PlanCertainty, string> = {
  confirmed: "正式",
  tentative: "暂定",
  idea: "想法",
};
const certainty = (value: PlanCertainty | undefined) =>
  value === undefined ? "未提供" : certaintyNames[value];

function snapshot(head: PlanHead) {
  return {
    completeness: head.completeness,
    tasks: head.entries.map((entry) => ({
      title: entry.title,
      certainty: certainty(entry.certainty),
    })),
  };
}

function phaseTitle(head: PlanHead | undefined, phaseId: PhaseId | undefined) {
  const phase = head?.phases.find(({ phaseId: id }) => id === phaseId);
  if (!phase) return "未提供";
  return phase.provenance === "visualizer_inferred"
    ? `${phase.title}（推断分组）`
    : phase.title;
}

function describeChange(
  change: PlanChange,
  before: PlanHead | undefined,
  after: PlanHead,
) {
  switch (change.kind) {
    case "task.added":
      return (
        after.entries.find(({ taskId }) => taskId === change.taskId)?.title ??
        "任务名称未提供"
      );
    case "task.removed":
      return (
        before?.entries.find(({ taskId }) => taskId === change.taskId)?.title ??
        "任务名称未提供"
      );
    case "task.changed": {
      const previous = before?.entries.find(
        ({ taskId }) => taskId === change.taskId,
      );
      const current = after.entries.find(
        ({ taskId }) => taskId === change.taskId,
      );
      return change.fields
        .map((field) => {
          switch (field) {
            case "title":
              return `名称 ${previous?.title ?? "未提供"} → ${current?.title ?? "未提供"}`;
            case "certainty":
              return `${current?.title ?? "任务"} · 确定性 ${certainty(previous?.certainty)} → ${certainty(current?.certainty)}`;
            case "phase":
              return `${current?.title ?? "任务"} · 阶段 ${phaseTitle(before, previous?.phaseId)} → ${phaseTitle(after, current?.phaseId)}`;
          }
        })
        .join(" · ");
    }
    case "tasks.reordered":
      return "前后清单按各自版本的记录顺序显示。";
    case "phase.added":
      return phaseTitle(after, change.phaseId);
    case "phase.changed":
      return `${phaseTitle(before, change.phaseId)} → ${phaseTitle(after, change.phaseId)}`;
  }
}

function progressText(result: ProgressResult | undefined) {
  if (result === undefined) return "尚无计算";
  if (result.status !== "available") return "不可用";
  return `${result.completedWeight} / ${result.totalWeight} = ${formatProgressPercentage(result.ratio)}`;
}

// Project the recorded Core snapshots for the built-in case. No raw identifiers
// or source locations enter the view.
export function describePlanChange(
  state: ProjectEngineState,
  eventId: EventId,
) {
  const event = state.plan.changes.find(({ id }) => id === eventId);
  if (!event) return undefined;
  const before = state.plan.revisions.find(
    (revision) =>
      revision.eventId === event.previousEventId &&
      revision.outcome === "applied",
  )?.snapshot;
  const after = state.plan.revisions.find(
    (revision) =>
      revision.eventId === event.causedBy && revision.outcome === "applied",
  )?.snapshot;
  if (!after || (event.previousEventId !== undefined && !before))
    return undefined;

  const source = state.plan.core.acceptedEvents.find(
    ({ id }) => id === event.causedBy,
  );
  // A later weight edit can cite the same revision. Match the two revision
  // identities of the original transition, including an absent initial parent.
  const progress = state.progress.changes.find(
    (change) =>
      change.current.planRevisionEventId === event.causedBy &&
      change.previous?.planRevisionEventId === event.previousEventId,
  );
  const highlights = [
    { kind: "task.added", label: "新增" },
    { kind: "task.removed", label: "移出" },
    { kind: "task.changed", label: "调整" },
  ].flatMap(({ kind, label }) => {
    const count = event.changes.filter((change) => change.kind === kind).length;
    return count ? [`${label} ${count} 项`] : [];
  });
  return {
    title: ["计划更新", ...highlights].join(" · "),
    ...(before === undefined ? {} : { before: snapshot(before) }),
    after: snapshot(after),
    changes: event.changes.map((change) => ({
      kind: change.kind,
      description: describeChange(change, before, after),
    })),
    ...(source?.type === "plan.detected" || source?.type === "plan.updated"
      ? {
          source: {
            provenance: source.payload.provenance ?? ("unknown" as const),
            at: source.receivedAt,
          },
        }
      : {}),
    ...(progress === undefined
      ? {}
      : {
          progress: {
            before: progressText(progress.previous),
            after: progressText(progress.current),
            reasons: progress.reasons,
            issueCodes:
              progress.current.status === "available"
                ? []
                : [...new Set(progress.current.issues.map(({ code }) => code))],
          },
        }),
  };
}

export type PlanChangeView = NonNullable<ReturnType<typeof describePlanChange>>;
