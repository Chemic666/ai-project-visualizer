import { runCoreWalkthrough } from "../../packages/core/examples/walkthrough.js";
import { presentTask } from "../../packages/core/examples/preview-presentation.js";

type Report = ReturnType<typeof runCoreWalkthrough>;
type Checkpoint = Report["checkpoints"][number];
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

function start() {
  let report = runCoreWalkthrough();
  let trialWeight = 17;
  let index = report.checkpoints.findIndex(
    (row) => row.key === "expansion-weighted",
  );
  let selectedTab: Tab = "overview";
  const tabs: readonly Tab[] = ["overview", "plan", "timeline"];
  const nav = element("checkpoint-nav");
  report.checkpoints.forEach((row, rowIndex) => {
    const button = node("button");
    button.type = "button";
    button.textContent = String(rowIndex + 1);
    button.setAttribute("aria-label", `检查点 ${rowIndex + 1}：${row.label}`);
    button.title = row.label;
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
      index--;
      render();
    }
  });
  element("next-step").addEventListener("click", () => {
    if (index < report.checkpoints.length - 1) {
      index++;
      render();
    }
  });
  element("why-button").addEventListener("click", () => {
    renderWhy(report.checkpoints[index]!);
    element<HTMLDialogElement>("why-dialog").showModal();
  });
  element("close-why").addEventListener("click", () =>
    element<HTMLDialogElement>("why-dialog").close(),
  );
  element("old-history").textContent =
    `${report.membershipHistory.removedTask.planVersionCount} 个版本 · ${report.membershipHistory.removedTask.correctionCount} 条纠正`;
  element("new-history").textContent =
    `${report.membershipHistory.reenteredTask.planVersionCount} 个版本 · ${report.membershipHistory.reenteredTask.correctionCount} 条旧纠正`;

  element("open-trial").addEventListener("click", () => {
    element<HTMLInputElement>("trial-weight").value = String(trialWeight);
    element("trial-error").hidden = true;
    element<HTMLDialogElement>("trial-dialog").showModal();
  });
  element("close-trial").addEventListener("click", () =>
    element<HTMLDialogElement>("trial-dialog").close(),
  );
  element("trial-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = element<HTMLInputElement>("trial-weight");
    const value = input.valueAsNumber;
    const error = element("trial-error");
    if (!Number.isFinite(value) || value <= 0) {
      error.textContent = "权重需要是大于 0 的有限数；原案例没有改变。";
      error.hidden = false;
      input.focus();
      return;
    }
    let next: Report;
    try {
      next = runCoreWalkthrough(value);
    } catch {
      error.textContent = "Core 未接受本次试算；原案例没有改变。";
      error.hidden = false;
      return;
    }
    report = next;
    trialWeight = value;
    index = report.checkpoints.findIndex(
      (row) => row.key === "weight-corrected",
    );
    selectedTab = "overview";
    render();
    element("reset-trial").hidden = false;
    element("trial-notice").hidden = false;
    element<HTMLDialogElement>("trial-dialog").close();
  });
  element("reset-trial").addEventListener("click", () => {
    report = runCoreWalkthrough();
    trialWeight = 17;
    index = report.checkpoints.findIndex(
      (row) => row.key === "expansion-weighted",
    );
    selectedTab = "overview";
    element("reset-trial").hidden = true;
    element("trial-notice").hidden = true;
    render();
    element("open-trial").focus();
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
    for (const task of checkpoint.tasks) {
      const view = presentTask(task);
      const row = node("li", "task-row");
      const symbol = node("span", `task-symbol ${view.tone}`, view.symbol);
      symbol.setAttribute("aria-hidden", "true");
      const body = node("div");
      body.append(node("div", "task-title", task.title));
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
                "纠正状态以当前检查点为准；原动作时间保持不变。",
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
    const checkpoint = report.checkpoints[index]!;
    [...nav.children].forEach((button, rowIndex) => {
      button.setAttribute(
        "aria-label",
        `检查点 ${rowIndex + 1}：${report.checkpoints[rowIndex]!.label}`,
      );
      (button as HTMLButtonElement).title = report.checkpoints[rowIndex]!.label;
    });
    element("checkpoint-label").textContent = checkpoint.label;
    element("step-counter").textContent =
      `${index + 1} / ${report.checkpoints.length}`;
    element<HTMLButtonElement>("previous-step").disabled = index === 0;
    element<HTMLButtonElement>("next-step").disabled =
      index === report.checkpoints.length - 1;
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

try {
  start();
} catch {
  document.body.replaceChildren(
    node(
      "main",
      "content",
      "合成场景未能计算；未显示占位结果。请检查本地 Core 演示。",
    ),
  );
}
