import type { WalkthroughTask } from "./walkthrough.js";

const origins: Record<string, string> = {
  agent_reported: "Agent Reported",
  observed: "Observed",
  user_confirmed: "User Confirmed",
  visualizer_inferred: "Visualizer Inferred",
  unknown: "未知来源",
};
const explanations: Record<string, string> = {
  explicit_completion_report: "有明确完成声明，尚未建立独立验证依据。",
  independent_verification: "Core 已绑定独立验证规则与依据。",
  verification_evidence_missing: "有验证声明，但缺少独立验证依据。",
  completion_evidence_missing: "完成声明缺少可关联的来源依据。",
  inference_not_eligible: "推断不计入正式完成权重。",
  status_unknown: "尚无可用的任务状态声明。",
  not_completed: "没有完整完成声明，不按部分量增加分子。",
  excluded: "没有纳入当前正式计划的计算范围。",
};

// Presentation for the fixed synthetic fixture, never an authority resolver.
export function presentTask(task: WalkthroughTask) {
  const state =
    task.completion === "verified"
      ? { symbol: "✓", statusLabel: "已独立验证", tone: "verified" }
      : task.completion === "completed"
        ? { symbol: "◐", statusLabel: "已声明完成", tone: "reported" }
        : task.status === "verified"
          ? { symbol: "?", statusLabel: "验证依据不足", tone: "warning" }
          : task.status === "completed"
            ? { symbol: "?", statusLabel: "完成依据不足", tone: "warning" }
            : task.status === "in_progress"
              ? { symbol: "▶", statusLabel: "进行中", tone: "active" }
              : task.status === "blocked"
                ? { symbol: "⚠", statusLabel: "受阻", tone: "warning" }
                : task.status === "todo"
                  ? { symbol: "○", statusLabel: "待处理", tone: "muted" }
                  : { symbol: "?", statusLabel: "未报告", tone: "muted" };
  return {
    ...state,
    statusSource: origins[task.statusProvenance] ?? "未知来源",
    weightSource: origins[task.weightProvenance] ?? "未知来源",
    weightLabel: task.weight === undefined ? "未知" : String(task.weight),
    detail: explanations[task.completionReason] ?? "依据尚不可用。",
    certaintyLabel:
      task.certainty === "confirmed"
        ? "正式任务"
        : task.certainty === "tentative"
          ? "暂定任务"
          : task.certainty === "idea"
            ? "想法"
            : "确定性未知",
  };
}
