import { createTaskWeightWalkthrough } from "../../packages/core/examples/walkthrough.js";
import type { Checkpoint } from "../../packages/core/examples/checkpoint.js";
import { presentTask } from "../../packages/core/examples/preview-presentation.js";

declare const APV_RECOVERED_CHECKPOINT: Checkpoint | undefined;
type Tab = "overview" | "plan" | "timeline";
const reasons: Record<string, string> = {
  plan_unknown: "没有可用的正式计划",
  weight_unknown: "正式任务的权重尚未补齐",
  zero_denominator: "尚无有效总权重",
  initial_calculation: "首次计算",
  plan_revision_changed: "计划版本更新",
  status_changed: "状态声明变化",
  progress_unavailable: "计算依据暂不完整",
  plan_expanded: "正式计划新增任务",
  progress_available: "计算依据已补齐",
  weight_corrected: "用户确认或调整权重",
  numeric_range: "权重超出当前可安全计算的数值范围",
  evidence_changed: "依据发生变化",
  plan_reduced: "正式计划成员减少",
};
const originText: Record<string, string> = {
  agent_reported: "Agent Reported",
  user_confirmed: "User Confirmed",
  observed: "Observed",
  core_derived: "规则生成",
  visualizer_inferred: "Visualizer Inferred",
};
const originClass: Record<string, string> = {
  agent_reported: "agent",
  user_confirmed: "user",
  observed: "observed",
};
const time = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error("preview_element_missing");
  return found as T;
}
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}
function badge(text: string, origin: string) {
  return node("span", `tag ${originClass[origin] ?? "neutral"}`, text);
}
function describe(codes: readonly string[]) {
  return codes.map((code) => reasons[code] ?? code).join("；");
}

function start(recovered?: Checkpoint) {
  let walkthrough = recovered ? undefined : createTaskWeightWalkthrough();
  let checkpoints: readonly Checkpoint[] = recovered
    ? [recovered]
    : walkthrough!.report.checkpoints;
  const checkpointCount = checkpoints.length;
  let index = walkthrough?.weightReview.baselineIndex ?? 0;
  let selectedTab: Tab = "overview";
  const tabs: readonly Tab[] = ["overview", "plan", "timeline"];
  const nav = element("checkpoint-nav");
  checkpoints.forEach((_, rowIndex) => {
    const button = node("button");
    button.type = "button";
    button.textContent = String(rowIndex + 1);
    button.addEventListener("click", () => {
      index = rowIndex;
      render();
    });
    nav.append(button);
  });

  function selectTab(tab: Tab, focus = false) {
    selectedTab = tab;
    for (const key of tabs) {
      const button = element<HTMLButtonElement>(`tab-${key}`);
      button.setAttribute("aria-selected", String(key === tab));
      button.tabIndex = key === tab ? 0 : -1;
      element(key).hidden = key !== tab;
    }
    element("page-title").textContent =
      tab === "overview"
        ? "项目现在到哪了？"
        : tab === "plan"
          ? "计划与任务依据"
          : "这一路发生了什么？";
    if (focus) element(`tab-${tab}`).focus();
  }
  document
    .querySelector<HTMLAnchorElement>(".brand")!
    .addEventListener("click", (event) => {
      event.preventDefault();
      selectTab("overview", true);
    });
  for (const tab of tabs) {
    const button = element(`tab-${tab}`);
    button.addEventListener("click", () => selectTab(tab));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next =
        (tabs.indexOf(tab) +
          (event.key === "ArrowRight" ? 1 : -1) +
          tabs.length) %
        tabs.length;
      selectTab(tabs[next]!, true);
    });
  }
  element("show-plan").addEventListener("click", () => selectTab("plan", true));
  element("show-timeline").addEventListener("click", () =>
    selectTab("timeline", true),
  );
  element("previous-step").addEventListener("click", () => {
    if (index > 0) {
      index =
        index === checkpointCount
          ? walkthrough!.weightReview.baselineIndex
          : index - 1;
      render();
    }
  });
  element("next-step").addEventListener("click", () => {
    if (index < checkpointCount - 1) {
      index++;
      render();
    }
  });
  element("why-button").addEventListener("click", () => {
    renderWhy(checkpoints[index]!);
    element<HTMLDialogElement>("why-dialog").showModal();
  });
  element("close-why").addEventListener("click", () =>
    element<HTMLDialogElement>("why-dialog").close(),
  );
  if (walkthrough) {
    const { removedTask, reenteredTask } = walkthrough.report.membershipHistory;
    element("old-history").textContent =
      `${removedTask.planVersionCount} 个版本 · ${removedTask.correctionCount} 条纠正`;
    element("new-history").textContent =
      `${reenteredTask.planVersionCount} 个版本 · ${reenteredTask.correctionCount} 条旧纠正`;
    element("open-weight-review").addEventListener("click", () => {
      if (checkpoints.length === checkpointCount) return;
      index = checkpointCount;
      render();
      element("checkpoint-label").focus();
    });
    element("reset-weight-review").addEventListener("click", () => {
      walkthrough = createTaskWeightWalkthrough();
      checkpoints = walkthrough.report.checkpoints;
      index = walkthrough.weightReview.baselineIndex;
      render();
      nav.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    });
  } else {
    document.title = "APV · 已恢复的合成历史";
    element("demo-mode").textContent = "已恢复的合成历史";
    element("replay-panel").hidden = true;
    element("independent-history").hidden = true;
    element("timeline-intro").textContent =
      "来自同一份恢复记录。展开活动可查看原始声明、人工修正和当时的进度变化。";
  }

  const taskDialog = element<HTMLDialogElement>("task-detail");
  const weightForm = element<HTMLFormElement>("task-weight-form");
  const weightInput = element<HTMLInputElement>("task-weight-input");
  const weightError = element("task-weight-error");
  const editResult = element("task-edit-result");
  let selectedTask: { position: number; opener: HTMLElement } | undefined;
  element("close-task-detail").addEventListener("click", () =>
    taskDialog.close(),
  );
  taskDialog.addEventListener("close", () => {
    if (!selectedTask) return;
    const { position, opener } = selectedTask;
    selectedTask = undefined;
    opener.querySelectorAll<HTMLButtonElement>(".task-link")[position]?.focus();
  });

  function renderTaskDetail(checkpoint: Checkpoint, position: number) {
    const task = checkpoint.tasks[position]!;
    const view = presentTask(task);
    element("task-detail-title").textContent = task.title;
    const statusTime = task.statusObservedAt
      ? ` · ${time.format(new Date(task.statusObservedAt))}`
      : "";
    const planText = task.plan
      ? `${view.certaintyLabel} · 第 ${task.plan.revision} 个关联版本 · ${originText[task.plan.provenance ?? ""] ?? "未知来源"} · ${time.format(new Date(task.plan.observedAt))}`
      : view.certaintyLabel;
    const facts = [
      ["状态", `${view.statusLabel} · ${view.statusSource}${statusTime}`],
      ["完成依据", view.detail],
      ["计划", planText],
      ["当前权重", `${view.weightLabel} · ${view.weightSource}`],
    ] as const;
    element("task-detail-facts").replaceChildren(
      ...facts.flatMap(([label, value]) => [
        node("dt", "", label),
        node("dd", "", value),
      ]),
    );

    const editable =
      checkpoint === walkthrough?.weightReview.checkpoint && task.included;
    weightForm.hidden = !editable;
    weightInput.value = task.weight === undefined ? "" : String(task.weight);
    weightError.hidden = true;
    weightInput.removeAttribute("aria-invalid");
    const readOnly = element("task-detail-read-only");
    readOnly.hidden = editable;
    readOnly.textContent = recovered
      ? "恢复记录为只读。"
      : "可在当前合成计划的检查点调整正式任务的权重。";

    const lifecycle = {
      active: "当前有效",
      superseded: "已替代",
      expired: "已失效",
    };
    const history = [...task.weightHistory].reverse().map((entry) => {
      const recordedTime = node("time", "", time.format(new Date(entry.at)));
      recordedTime.dateTime = entry.at;
      const change =
        entry.previousWeight === undefined
          ? `权重 ${entry.value}`
          : `${entry.previousWeight} → ${entry.value}`;
      const row = node("li");
      row.append(
        node("strong", "", change),
        node("span", "", lifecycle[entry.lifecycle]),
        badge(originText[entry.provenance] ?? "未知来源", entry.provenance),
        recordedTime,
      );
      return row;
    });
    element("task-weight-history").replaceChildren(...history);
    element("task-weight-empty").hidden = history.length > 0;
  }

  weightForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedTask || !walkthrough || weightForm.hidden) return;
    const { weightReview } = walkthrough;
    const previous = checkpoints[index]!;
    if (previous !== weightReview.checkpoint) return;
    const value = weightInput.valueAsNumber;
    if (!Number.isFinite(value) || value <= 0) {
      weightError.textContent = "输入一个大于 0 的有限数。";
      weightError.hidden = false;
      weightInput.setAttribute("aria-invalid", "true");
      weightInput.focus();
      return;
    }
    let next: Checkpoint;
    try {
      next = weightReview.edit(selectedTask.position, value);
    } catch {
      weightError.textContent = "这次调整未能应用，原权重已保留。";
      weightError.hidden = false;
      weightInput.setAttribute("aria-invalid", "true");
      weightInput.focus();
      return;
    }
    weightError.hidden = true;
    weightInput.removeAttribute("aria-invalid");
    if (next === previous) {
      editResult.textContent = "输入与当前权重相同。";
      return;
    }
    checkpoints = [...walkthrough.report.checkpoints, next];
    index = checkpointCount;
    render();
    renderTaskDetail(next, selectedTask.position);
    const percentage = (row: Checkpoint) =>
      row.progress.status === "available" ? row.progress.percentage : "不可用";
    const before = percentage(previous);
    const after = percentage(next);
    editResult.textContent =
      before === after
        ? `已调整权重，显示进度仍为 ${after}。`
        : `已调整权重，项目进度 ${before} → ${after}。`;
  });

  function taskList(
    target: HTMLElement,
    checkpoint: Checkpoint,
    compact: boolean,
  ) {
    target.replaceChildren();
    if (checkpoint.tasks.length === 0) {
      const empty = node("div", "empty-state");
      empty.append(
        node("strong", "", "还没有可用的计划"),
        node("span", "", "收到明确计划后，这里会显示任务与依据。"),
      );
      target.append(empty);
      return;
    }
    const list = node("ul", "task-list");
    list.setAttribute("aria-label", compact ? "计划摘要" : "正式任务及依据");
    for (const [position, task] of checkpoint.tasks.entries()) {
      const view = presentTask(task);
      const row = node("li", "task-row");
      const symbol = node("span", `task-symbol ${view.tone}`, view.symbol);
      symbol.setAttribute("aria-hidden", "true");
      const body = node("div");
      const title = node("button", "task-title task-link", task.title);
      title.type = "button";
      title.setAttribute("aria-haspopup", "dialog");
      title.addEventListener("click", () => {
        selectedTask = { position, opener: target };
        editResult.textContent = "";
        renderTaskDetail(checkpoint, position);
        taskDialog.showModal();
      });
      body.append(title);
      const meta = node("div", "task-meta");
      meta.append(node("span", "", view.statusLabel));
      if (task.statusProvenance !== "unknown")
        meta.append(badge(view.statusSource, task.statusProvenance));
      if (!compact) meta.append(node("span", "", view.certaintyLabel));
      body.append(meta);
      if (!compact)
        body.append(
          node(
            "p",
            "small-note",
            `权重来源：${view.weightSource} · ${task.planVersionCount} 个计划版本 · ${task.correctionCount} 条人工纠正`,
          ),
        );
      const weight = node("div", "task-weight");
      weight.append(
        node("strong", "", view.weightLabel),
        node("span", "", "权重"),
      );
      weight.title = `权重来源：${view.weightSource}`;
      row.append(symbol, body, weight);
      list.append(row);
    }
    target.append(list);
  }

  function events(target: HTMLElement, checkpoint: Checkpoint, limit?: number) {
    const values = [...checkpoint.timeline].reverse();
    target.replaceChildren();
    for (const event of limit === undefined ? values : values.slice(0, limit)) {
      const item = node("li", "event");
      const stamp = node("time", "", time.format(new Date(event.at)));
      stamp.dateTime = event.at;
      stamp.title = "合成时间（北京时间）";
      item.append(
        stamp,
        node("p", "event-title", event.title),
        badge(originText[event.provenance] ?? "未知来源", event.provenance),
      );
      if (limit === undefined) {
        const details = node("details", "event-evidence");
        const summary = node(
          "summary",
          "",
          `查看依据 · ${event.evidence.length} 项`,
        );
        summary.setAttribute(
          "aria-label",
          `${time.format(new Date(event.at))} ${event.title}：查看依据`,
        );
        details.append(summary);
        if (event.transition !== undefined)
          details.append(
            node(
              "p",
              "evidence-transition",
              `当时保存的变化：${event.transition}`,
            ),
          );
        const list = node("ul", "evidence-list");
        for (const evidence of event.evidence) {
          const row = node("li");
          const missing: Record<string, string> = {
            not_found: "此检查点未找到对应记录",
            outside_project: "依据属于其他项目",
            project_unknown: "依据的项目归属未知",
            ambiguous_identity: "存在相互冲突的依据身份",
          };
          row.append(
            node("strong", "evidence-label", evidence.label),
            node(
              "p",
              "evidence-value",
              evidence.status === "unavailable"
                ? (missing[String(evidence.value)] ?? "依据尚不可用")
                : String(evidence.value),
            ),
          );
          if (evidence.provenance !== undefined)
            row.append(
              badge(
                originText[evidence.provenance] ?? "未知来源",
                evidence.provenance,
              ),
            );
          if (evidence.at !== undefined)
            row.append(
              node(
                "span",
                "evidence-time",
                `记录时间：${time.format(new Date(evidence.at))}`,
              ),
            );
          if (evidence.recordVersion === "current_state")
            row.append(
              node(
                "p",
                "evidence-note",
                recovered
                  ? "纠正状态以恢复时为准。上方保留原动作时间。"
                  : "纠正状态以当前检查点为准；原动作时间保持不变。",
              ),
            );
          if (evidence.endedAt !== undefined)
            row.append(
              node(
                "span",
                "evidence-time",
                `${evidence.lifecycle === "expired" ? "失效" : "替代"}时间：${time.format(new Date(evidence.endedAt))}`,
              ),
            );
          list.append(row);
        }
        if (!event.evidence.length)
          list.append(
            node("li", "evidence-note", "此检查点没有可用的直接依据。"),
          );
        details.append(list);
        item.append(details);
      }
      target.append(item);
    }
  }

  function renderWhy(checkpoint: Checkpoint) {
    const summary = element("why-summary");
    summary.replaceChildren();
    if (checkpoint.progress.status === "available") {
      summary.append(
        node(
          "div",
          "why-number",
          `${checkpoint.progress.completedWeight} / ${checkpoint.progress.totalWeight} = ${checkpoint.progress.percentage}`,
        ),
      );
      summary.append(
        node(
          "p",
          "why-description",
          "分子只计入具备明确完成依据的正式任务权重；进行中的任务不按部分量增加分子。",
        ),
      );
    } else {
      summary.append(
        node("div", "why-number", "当前不显示百分比"),
        node("p", "why-description", describe(checkpoint.progress.issueCodes)),
      );
    }
    const tasks = element("why-tasks");
    tasks.replaceChildren();
    if (!checkpoint.tasks.length)
      tasks.append(
        node(
          "p",
          "why-description",
          "还没有可用的正式计划，因此不能建立分母。",
        ),
      );
    for (const task of checkpoint.tasks) {
      const view = presentTask(task);
      const row = node("section", "why-task");
      row.append(
        node("h3", "", `${task.title} · 权重 ${view.weightLabel}`),
        badge(view.statusSource, task.statusProvenance),
      );
      row.append(
        node("p", "", `${view.statusLabel}；${view.detail}`),
        node(
          "p",
          "",
          `权重来源：${view.weightSource} · ${view.certaintyLabel}`,
        ),
      );
      tasks.append(row);
    }
  }

  function render() {
    const checkpoint = checkpoints[index]!;
    const reviewingWeights = index === checkpointCount;
    if (walkthrough) {
      const edited = checkpoints.length > checkpointCount;
      element("weight-review-hint").hidden =
        checkpoint !== walkthrough.weightReview.checkpoint;
      element("open-weight-review").hidden = !edited || reviewingWeights;
      element("reset-weight-review").hidden = !edited;
    }
    [...nav.children].forEach((button, rowIndex) => {
      button.setAttribute(
        "aria-label",
        `检查点 ${rowIndex + 1}：${checkpoints[rowIndex]!.label}`,
      );
      (button as HTMLButtonElement).title = checkpoints[rowIndex]!.label;
    });
    element("checkpoint-label").textContent = checkpoint.label;
    element("step-counter").textContent = reviewingWeights
      ? "权重调整"
      : `${index + 1} / ${checkpointCount}`;
    const previousStep = element<HTMLButtonElement>("previous-step");
    previousStep.disabled = index === 0;
    previousStep.setAttribute(
      "aria-label",
      reviewingWeights ? "返回调整前的检查点" : "上一个检查点",
    );
    element<HTMLButtonElement>("next-step").disabled =
      index >= checkpointCount - 1;
    [...nav.children].forEach((button, rowIndex) =>
      button.setAttribute("aria-pressed", String(rowIndex === index)),
    );
    element("session-state").textContent =
      checkpoint.sessionState === "ended"
        ? "合成 Session · 已明确结束"
        : "合成 Session · 已开始";
    const available = checkpoint.progress.status === "available";
    const number = element("progress-number");
    number.classList.toggle("unavailable", !available);
    number.textContent =
      checkpoint.progress.status === "available"
        ? checkpoint.progress.percentage
        : "进度尚不可用";
    element("progress-calculation").textContent =
      checkpoint.progress.status === "available"
        ? `已完成权重 ${checkpoint.progress.completedWeight} / 正式总权重 ${checkpoint.progress.totalWeight}`
        : describe(checkpoint.progress.issueCodes);
    const bar = element<HTMLProgressElement>("progress-bar");
    bar.hidden = !available;
    if (checkpoint.progress.status === "available")
      bar.value = checkpoint.progress.ratio;
    else bar.removeAttribute("value");
    element("unknown-progress").hidden = available;
    element("progress-change").textContent =
      describe(checkpoint.progressReasons) || "保留上一条有依据的计算结果";
    const task = checkpoint.currentTask;
    element("current-task").textContent =
      task.status === "available"
        ? task.title
        : task.status === "conflict"
          ? "关联存在冲突"
          : "未知";
    element("current-task-source").replaceChildren(
      task.status === "available"
        ? badge("User Confirmed", "user_confirmed")
        : node(
            "span",
            "small-note",
            checkpoint.sessionState === "ended"
              ? "当前任务人工确认已失效"
              : "尚无有效的当前任务人工确认",
          ),
    );
    taskList(element("overview-tasks"), checkpoint, true);
    taskList(element("plan-tasks"), checkpoint, false);
    events(element("recent-events"), checkpoint, 5);
    events(element("all-events"), checkpoint);
    element("task-count").textContent = `${checkpoint.tasks.length} 项`;
    element("timeline-count").textContent =
      `${checkpoint.timeline.length} 条意义事件`;
    selectTab(selectedTab);
  }
  render();
}

const recovered =
  typeof APV_RECOVERED_CHECKPOINT === "undefined"
    ? undefined
    : APV_RECOVERED_CHECKPOINT;
const runtimeRecovery = document.body.dataset.apvRuntimeRecovery === "true";
try {
  if (runtimeRecovery) {
    const data = document.getElementById("apv-runtime-checkpoint");
    if (
      document.body.dataset.apvMode !== "recovered" ||
      !(data instanceof HTMLScriptElement) ||
      data.type !== "application/json" ||
      data.nonce !== document.body.dataset.apvGeneration
    )
      throw new Error("runtime_checkpoint_rejected");
    const checkpoint = JSON.parse(data.textContent ?? "") as Checkpoint;
    if (checkpoint?.key !== "restored")
      throw new Error("runtime_checkpoint_rejected");
    start(checkpoint);
  } else {
    start(recovered);
  }
} catch {
  document.body.replaceChildren(
    node(
      "main",
      "content",
      runtimeRecovery || recovered !== undefined
        ? "已恢复的合成历史未能显示。"
        : "合成场景未能计算。请检查本地 Core 演示。",
    ),
  );
}
