import { formatProgressPercentage } from "../src/index.js";
import type {
  Provenance,
  TaskId,
  TimelineEvidenceResolution,
} from "../src/index.js";

export interface SyntheticEvidenceSummary {
  readonly status: TimelineEvidenceResolution["status"];
  readonly kind: string;
  readonly label: string;
  readonly value: string | number;
  readonly provenance?: Provenance | "core_derived";
  readonly at?: string;
  readonly lifecycle?: "active" | "expired" | "superseded";
  readonly recordVersion?: "current_state";
  readonly endedAt?: string;
}

const statusNames = {
  todo: "待处理",
  in_progress: "进行中",
  completed: "明确报告完成",
  verified: "报告已验证（声明）",
  blocked: "受阻",
};
const fields = {
  "task.status": "任务状态声明",
  "task.certainty": "计划确定性声明",
  "task.weight": "任务权重声明",
  "phase.status": "阶段状态声明",
  "project.currentTask": "当前任务选择声明",
  "project.currentPhase": "当前阶段声明",
  "session.projectAssociation": "项目关联声明",
};

// Allowlisted presentation of the built-in synthetic fixture only. This is not
// a sanitizer for arbitrary imported Core state or a general export facility.
export function summarizeSyntheticEvidence(
  resolution: TimelineEvidenceResolution,
  taskNames: ReadonlyMap<TaskId, string>,
): SyntheticEvidenceSummary {
  if (resolution.status === "external_reference")
    return {
      status: resolution.status,
      kind: "source",
      label: "来源引用",
      value: "未访问外部来源",
    };
  if (resolution.status === "unavailable")
    return {
      status: resolution.status,
      kind: resolution.reference.kind,
      label: "依据不可用",
      value: resolution.reason,
    };

  const record = resolution.record;
  const base = { status: resolution.status, kind: record.kind };
  switch (record.kind) {
    case "assertion": {
      const claim = record.assertion;
      let value: string | number;
      switch (claim.target) {
        case "task.status":
        case "phase.status":
          value = statusNames[claim.value];
          break;
        case "task.weight":
          value = claim.value;
          break;
        case "task.certainty":
          value = { confirmed: "正式", tentative: "暂定", idea: "想法" }[
            claim.value
          ];
          break;
        case "project.currentTask":
          value = taskNames.get(claim.value) ?? "任务名称未提供";
          break;
        case "project.currentPhase":
          value = "阶段名称未提供";
          break;
        case "session.projectAssociation":
          value = "项目名称未提供";
          break;
      }
      const taskTitle =
        claim.target === "task.status" ||
        claim.target === "task.certainty" ||
        claim.target === "task.weight"
          ? (taskNames.get(claim.targetId) ?? "任务名称未提供")
          : undefined;
      return {
        ...base,
        label:
          taskTitle === undefined
            ? fields[claim.target]
            : `${taskTitle} · ${fields[claim.target]}`,
        value,
        provenance: claim.provenance,
        at: claim.observedAt,
      };
    }
    case "correction": {
      const correction = record.record;
      const lifecycle = correction.lifecycle;
      return {
        ...base,
        label:
          correction.scope.kind === "current_task"
            ? "当前任务纠正记录"
            : correction.scope.kind === "task_weight"
              ? `${taskNames.get(correction.scope.taskId) ?? "任务名称未提供"} · 任务权重纠正记录`
              : "历史关联纠正记录",
        value: { active: "有效", expired: "已失效", superseded: "已替代" }[
          lifecycle.status
        ],
        lifecycle: lifecycle.status,
        recordVersion: record.version,
        at: correction.effectiveAt,
        ...(lifecycle.status === "active"
          ? {}
          : {
              endedAt:
                lifecycle.status === "expired"
                  ? lifecycle.expiredAt
                  : lifecycle.supersededAt,
            }),
      };
    }
    case "normalized_event": {
      const event = record.event;
      if (event.type === "task.status_reported")
        return {
          ...base,
          label: `${taskNames.get(event.payload.taskId) ?? "任务名称未提供"} · 原任务状态报告`,
          value: statusNames[event.payload.status],
          provenance: "agent_reported",
          at: event.receivedAt,
        };
      if (event.type === "session.started" || event.type === "session.ended")
        return {
          ...base,
          label: "原 Session 观察",
          value: event.type === "session.started" ? "明确开始" : "明确结束",
          provenance: "observed",
          at: event.receivedAt,
        };
      return {
        ...base,
        label: "原计划输入",
        value: `${event.payload.steps.length} 项步骤（${event.payload.completeness === "complete" ? "完整" : "部分"}输入）`,
        ...(event.payload.provenance === undefined
          ? {}
          : { provenance: event.payload.provenance }),
        at: event.receivedAt,
      };
    }
    case "plan_change":
      return {
        ...base,
        label: "已保存的计划变化",
        value: `${record.event.changes.length} 项有据变化`,
        provenance: "core_derived",
      };
    case "progress_change": {
      const before = record.event.previous;
      const after = record.event.current;
      return {
        ...base,
        label: "已保存的进度变化",
        value: `${before?.status === "available" ? formatProgressPercentage(before.ratio) : "不可用"} → ${after.status === "available" ? formatProgressPercentage(after.ratio) : "不可用"}`,
        provenance: "core_derived",
      };
    }
  }
}
