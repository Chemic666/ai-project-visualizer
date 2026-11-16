import { createEditableWalkthrough } from "../../packages/core/examples/walkthrough.js";
import type { Checkpoint } from "../../packages/core/examples/checkpoint.js";
import type { PlanChangeView } from "../../packages/core/examples/plan-inspection.js";
import { presentTask } from "../../packages/core/examples/preview-presentation.js";

declare const APV_RECOVERED_CHECKPOINT: Checkpoint | undefined;
type Tab = "overview" | "plan" | "timeline";
type ProgressChange = NonNullable<
  Checkpoint["timeline"][number]["progressChange"]
>;
const reasons: Record<string, string> = {
  plan_unknown: "没有可用的正式计划",
  plan_ambiguous: "正式计划的来源存在歧义",
  plan_incomplete: "正式计划尚不完整",
  plan_inconsistent: "正式计划的记录不一致",
  certainty_unknown: "部分任务的确定性未知",
  invalid_reference: "缺少可用的依据引用",
  invalid_weight: "正式任务的权重无效",
  weight_conflict: "任务权重存在冲突",
  status_conflict: "任务状态存在冲突",
  correction_conflict: "人工纠正存在冲突",
  invalid_correction: "无法使用这条人工纠正",
  evidence_history_missing: "历史依据缺失",
  evidence_identity_conflict: "历史依据存在冲突",
  weight_unknown: "正式任务的权重尚未补齐",
  zero_denominator: "尚无有效总权重",
  initial_calculation: "首次计算",
  plan_revision_changed: "计划版本更新",
  status_changed: "状态声明变化",
  progress_unavailable: "计算依据暂不完整",
  plan_expanded: "正式计划新增任务",
  progress_available: "计算依据已补齐",
  weight_corrected: "用户确认或调整权重",
  weight_changed: "任务权重变化",
  task_reopened: "已完成任务重新打开",
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
const savedTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: time.resolvedOptions().timeZone,
  dateStyle: "short",
  timeStyle: "short",
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

function progressFormula(progress: Checkpoint["progress"] | undefined) {
  if (progress === undefined) return "尚无计算";
  return progress.status === "available"
    ? `${progress.completedWeight} / ${progress.totalWeight} = ${progress.percentage}`
    : "不可用";
}

function progressComparison({ before, after }: ProgressChange) {
  return `${progressFormula(before)} → ${progressFormula(after)}`;
}

function progressReasons({ after, reasons }: ProgressChange) {
  return describe([
    ...reasons,
    ...(after.status === "unavailable" ? after.issueCodes : []),
  ]);
}

function recentProgress(checkpoint: Checkpoint) {
  return checkpoint.timeline
    .flatMap(({ progressChange, transition, at }, position) => {
      if (progressChange === undefined || transition === undefined) return [];
      const { before, after } = progressChange;
      // Skip evidence-only entries here. They are still available in Timeline.
      const changed =
        after.status === "available"
          ? before?.status !== "available" ||
            before.completedWeight !== after.completedWeight ||
            before.totalWeight !== after.totalWeight
          : before?.status === "available";
      return changed ? [{ at, position, progressChange, transition }] : [];
    })
    .reverse();
}

function start(recovered?: Checkpoint) {
  let walkthrough = recovered ? undefined : createEditableWalkthrough();
  let checkpoints: readonly Checkpoint[] = recovered
    ? [recovered]
    : walkthrough!.report.checkpoints;
  const checkpointCount = checkpoints.length;
  let index = walkthrough?.review.baselineIndex ?? 0;
  type EditableReview = NonNullable<typeof walkthrough>["review"];
  let editedReview: EditableReview | undefined;
  function editableReview(checkpoint: Checkpoint) {
    if (!walkthrough) return undefined;
    return [walkthrough.review, walkthrough.suggestionReview].find(
      (review) => review.checkpoint === checkpoint,
    );
  }
  function reviewToOpen() {
    if (!walkthrough) return undefined;
    const baseline = [walkthrough.review, walkthrough.suggestionReview].find(
      (review) => review.baselineIndex === index,
    );
    if (baseline === undefined) return editedReview;
    return baseline.checkpoint.key === "review" ? baseline : undefined;
  }

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
        ? recovered
          ? "恢复的项目状态"
          : "项目现在到哪了？"
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
        index === checkpointCount ? editedReview!.baselineIndex : index - 1;
      render();
    }
  });
  element("next-step").addEventListener("click", () => {
    if (index < checkpointCount - 1) {
      index++;
      render();
    }
  });
  const whyDialog = element<HTMLDialogElement>("why-dialog");
  element("why-button").addEventListener("click", () => {
    renderWhy(checkpoints[index]!);
    whyDialog.showModal();
    whyDialog.scrollTop = 0;
  });
  element("close-why").addEventListener("click", () => whyDialog.close());

  function timelineLink(
    position: number,
    label: string,
    accessibleName = label,
  ) {
    const button = node("button", "text-button evidence-link", label);
    button.type = "button";
    button.setAttribute("aria-label", accessibleName);
    button.addEventListener("click", () => {
      const details = document
        .getElementById(`timeline-event-${position}`)
        ?.querySelector<HTMLDetailsElement>("details");
      if (!details) return;
      if (whyDialog.open) whyDialog.close();
      selectTab("timeline");
      details.open = true;
      details.querySelector("summary")?.focus();
    });
    return button;
  }
  if (walkthrough) {
    const { removedTask, reenteredTask } = walkthrough.report.membershipHistory;
    element("old-history").textContent =
      `${removedTask.planVersionCount} 个版本 · ${removedTask.correctionCount} 条纠正`;
    element("new-history").textContent =
      `${reenteredTask.planVersionCount} 个版本 · ${reenteredTask.correctionCount} 条旧纠正`;
    for (const change of walkthrough.report.membershipPlanChanges) {
      const details = node("details", "event-evidence");
      details.append(
        node("summary", "", change.title),
        renderPlanChange(change),
      );
      element("membership-plan-history").append(details);
    }
    element("open-review").addEventListener("click", () => {
      const review = reviewToOpen();
      if (!review) return;
      showReviewCheckpoint(review);
      element("checkpoint-label").focus();
    });
    element("reset-review").addEventListener("click", () => {
      walkthrough = createEditableWalkthrough();
      editedReview = undefined;
      checkpoints = walkthrough.report.checkpoints;
      index = walkthrough.review.baselineIndex;
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

  const taskPicker = element<HTMLDialogElement>("current-task-picker");
  const pickerTrigger = element<HTMLButtonElement>("correct-current-task");
  const pickerForm = element<HTMLFormElement>("current-task-form");
  const pickerError = element("current-task-error");
  element("close-current-task-picker").addEventListener("click", () =>
    taskPicker.close(),
  );
  pickerTrigger.addEventListener("click", () => {
    const checkpoint = checkpoints[index]!;
    const review = editableReview(checkpoint);
    if (!review || pickerTrigger.hidden) return;
    const selected = review.currentTaskPosition;
    const options = checkpoint.tasks.flatMap((task, position) => {
      if (!task.included) return [];
      const row = node("label", "current-task-option");
      const option = node("input");
      option.type = "radio";
      option.name = "current-task-choice";
      option.value = String(position);
      option.checked = position === selected;
      option.required = true;
      row.append(option, node("span", "", task.title));
      return [row];
    });
    element("current-task-options").replaceChildren(...options);
    pickerError.hidden = true;
    taskPicker.showModal();
    const selectedOption =
      pickerForm.querySelector<HTMLInputElement>("input:checked");
    (
      selectedOption ??
      pickerForm.querySelector<HTMLInputElement>("input[type=radio]")
    )?.focus();
  });

  pickerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const previous = checkpoints[index]!;
    const review = editableReview(previous);
    if (!review || pickerTrigger.hidden || !taskPicker.open) return;
    const selected =
      pickerForm.querySelector<HTMLInputElement>("input:checked");
    if (!selected) return;
    let next: Checkpoint;
    try {
      next = review.selectCurrentTask(Number(selected.value));
    } catch {
      pickerError.textContent = "无法设置这个任务，已保留原选择。";
      pickerError.hidden = false;
      return;
    }
    if (next !== previous) showReviewCheckpoint(review);
    taskPicker.close();
    pickerTrigger.focus();
  });

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
    opener
      .querySelector<HTMLButtonElement>(
        `.task-link[data-position="${position}"]`,
      )
      ?.focus();
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
      [
        recovered ? "保存时权重" : "当前权重",
        `${view.weightLabel} · ${view.weightSource}`,
      ],
    ] as [string, string][];
    const association = checkpoint.currentTask;
    if (
      association.status === "likely" &&
      association.taskPosition === position
    )
      facts.push([
        recovered ? "保存时的任务判断" : "当前任务关联",
        "Visualizer Inferred · 关联评分 " + association.score + " / 100",
      ]);
    element("task-detail-facts").replaceChildren(
      ...facts.flatMap(([label, value]) => [
        node("dt", "", label),
        node("dd", "", value),
      ]),
    );

    const editable = editableReview(checkpoint) !== undefined && task.included;
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
    if (!selectedTask || weightForm.hidden) return;
    const previous = checkpoints[index]!;
    const review = editableReview(previous);
    if (!review) return;
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
      next = review.setWeight(selectedTask.position, value);
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
    showReviewCheckpoint(review);
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

  function partialPlan(checkpoint: Checkpoint) {
    return (
      checkpoint.progress.status === "unavailable" &&
      checkpoint.progress.issueCodes.includes("plan_incomplete")
    );
  }

  function emptyPlan(checkpoint: Checkpoint) {
    const empty = node("div", "empty-state");
    const reason =
      checkpoint.progress.status === "unavailable"
        ? checkpoint.progress.issueCodes.find((code) =>
            code.startsWith("plan_"),
          )
        : undefined;
    empty.append(
      node("strong", "", reason ? describe([reason]) : "没有可展示的任务"),
      node("span", "", "任务及依据会随计划记录更新。"),
    );
    return empty;
  }

  function taskList(
    checkpoint: Checkpoint,
    opener: HTMLElement,
    positions: readonly number[],
    compact: boolean,
  ) {
    const list = node("ul", "task-list");
    list.setAttribute("aria-label", compact ? "计划摘要" : "任务及依据");
    for (const position of positions) {
      const task = checkpoint.tasks[position]!;
      const view = presentTask(task);
      const row = node("li", "task-row");
      const symbol = node("span", `task-symbol ${view.tone}`, view.symbol);
      symbol.setAttribute("aria-hidden", "true");
      const body = node("div");
      const title = node("button", "task-title task-link", task.title);
      title.type = "button";
      title.dataset.position = String(position);
      title.setAttribute("aria-haspopup", "dialog");
      title.addEventListener("click", () => {
        selectedTask = { position, opener };
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
    return list;
  }

  function renderTasks(checkpoint: Checkpoint) {
    const overview = element("overview-tasks");
    const plan = element("plan-tasks");
    const positions = checkpoint.tasks.map((_, position) => position);
    overview.replaceChildren(
      positions.length
        ? taskList(checkpoint, overview, positions, true)
        : emptyPlan(checkpoint),
    );
    plan.replaceChildren();
    if (partialPlan(checkpoint) && positions.length) {
      const notice = "计划尚不完整。这里显示已记录的分组和任务。";
      overview.prepend(node("p", "plan-phase-facts", notice));
      plan.append(node("p", "plan-phase-facts", notice));
    }
    if (!checkpoint.phases.length) {
      plan.append(
        positions.length
          ? taskList(checkpoint, plan, positions, false)
          : emptyPlan(checkpoint),
      );
      return;
    }
    for (const [index, phase] of checkpoint.phases.entries()) {
      const heading = node("div", "plan-phase-heading");
      const title = node("h3", "", phase.title);
      title.id = `plan-phase-${index}`;
      heading.append(title);
      if (phase.current) {
        heading.append(
          recovered
            ? node("span", "tag", "最后记录")
            : node("span", "tag user", "当前阶段"),
        );
      }
      const group = node(
        "section",
        `plan-phase${phase.current && !recovered ? " current" : ""}`,
      );
      group.setAttribute("aria-labelledby", title.id);
      const source =
        phase.provenance === "visualizer_inferred"
          ? "自动分组 · Visualizer Inferred"
          : `计划分组 · ${originText[phase.provenance] ?? "未知来源"}`;
      const weights = phase.totals
        ? `已完成权重 ${phase.totals.completedWeight} / 正式总权重 ${phase.totals.totalWeight}`
        : phase.taskPositions.some(
              (position) =>
                checkpoint.tasks[position]?.certainty === "confirmed",
            )
          ? "阶段权重合计暂不可用"
          : "没有正式任务";
      group.append(
        heading,
        node("p", "plan-phase-facts", `${source} · ${weights}`),
      );
      group.append(
        phase.taskPositions.length
          ? taskList(checkpoint, plan, phase.taskPositions, false)
          : node("p", "plan-phase-empty", "当前计划没有这个阶段的任务。"),
      );
      plan.append(group);
    }
  }

  function renderPlanChange(change: PlanChangeView) {
    const root = node("div", "plan-change");
    const snapshots = node("div", "plan-snapshots");
    for (const [heading, snapshot] of [
      ["变更前", change.before],
      ["变更后", change.after],
    ] as const) {
      const section = node("section", "plan-snapshot");
      section.append(node("h4", "", heading));
      if (!snapshot) {
        section.append(node("p", "small-note", "此前没有已保存的计划。"));
      } else {
        const list = node("ol", "plan-snapshot-tasks");
        for (const task of snapshot.tasks) {
          const item = node("li");
          item.append(
            node("span", "", task.title),
            node("span", "small-note", `${task.certainty} · ${task.phase}`),
          );
          list.append(item);
        }
        const scope =
          snapshot.completeness === "complete"
            ? "完整计划输入"
            : "部分计划输入";
        section.append(node("p", "small-note", scope));
        section.append(
          list.childElementCount
            ? list
            : node("p", "small-note", "此版本没有任务。"),
        );
      }
      snapshots.append(section);
    }
    root.append(snapshots);

    const labels: Record<PlanChangeView["changes"][number]["kind"], string> = {
      "task.added": "新增任务",
      "task.removed": "移出任务",
      "task.changed": "调整任务",
      "tasks.reordered": "调整顺序",
      "phase.added": "新增分组",
      "phase.changed": "调整分组",
    };
    const diff = node("ul", "plan-diff");
    for (const changeRow of change.changes) {
      const item = node("li");
      item.append(
        node("strong", "", labels[changeRow.kind]),
        node("span", "", changeRow.description),
      );
      diff.append(item);
    }
    root.append(diff);
    if (change.progress) {
      const { before, after, reasons, issueCodes } = change.progress;
      const impact = node("div", "plan-progress-effect");
      impact.append(
        node(
          "h4",
          "",
          recovered ? "包含此次计划更新的提交进度" : "变更发生时的进度",
        ),
        node("p", "evidence-transition", `${before} → ${after}`),
        node("p", "small-note", describe([...reasons, ...issueCodes])),
      );
      root.append(impact);
    }
    const source = change.source;
    root.append(
      node(
        "p",
        "small-note",
        source
          ? `计划来源 · ${originText[source.provenance] ?? "未知来源"} · ${time.format(new Date(source.at))}`
          : "计划来源暂不可用。",
      ),
      node("p", "small-note", "来源未提供调整原因。"),
    );
    return root;
  }

  function events(
    target: HTMLElement,
    entries: Checkpoint["timeline"],
    mode?: "recent" | "timeline",
  ) {
    const values = [...entries.entries()].reverse();
    target.replaceChildren();
    for (const [position, event] of mode === "recent"
      ? values.slice(0, 5)
      : values) {
      const item = node("li", "event");
      if (mode === "timeline") item.id = `timeline-event-${position}`;
      const stamp = node("time", "", time.format(new Date(event.at)));
      stamp.dateTime = event.at;
      stamp.title = "合成时间（北京时间）";
      item.append(
        stamp,
        node("p", "event-title", event.title),
        badge(originText[event.provenance] ?? "未知来源", event.provenance),
      );
      if (mode !== "recent") {
        const details = node("details", "event-evidence");
        const summary = node(
          "summary",
          "",
          event.planChange
            ? "查看计划变更"
            : `查看依据 · ${event.evidence.length} 项`,
        );
        summary.setAttribute(
          "aria-label",
          `${time.format(new Date(event.at))} ${event.title} · ${event.planChange ? "查看计划变更" : "查看依据"}`,
        );
        details.append(summary);
        if (event.planChange)
          details.append(renderPlanChange(event.planChange));
        const comparison = event.progressChange
          ? progressComparison(event.progressChange)
          : event.transition;
        if (comparison !== undefined)
          details.append(
            node("p", "evidence-transition", `当时保存的变化：${comparison}`),
          );
        if (event.progressChange)
          details.append(
            node(
              "p",
              "small-note progress-evidence-reasons",
              progressReasons(event.progressChange),
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
          if (evidence.associationScore !== undefined)
            row.append(
              node(
                "p",
                "evidence-note",
                "当时的关联评分 " + evidence.associationScore + " / 100",
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

  function renderRecentChanges(checkpoint: Checkpoint) {
    const progress = element("latest-progress");
    progress.replaceChildren(node("span", "context-label", "最近进度变化"));
    const last = recentProgress(checkpoint)[0];
    if (last) {
      const { before, after } = last.progressChange;
      const label =
        before?.status === "available" &&
        after.status === "available" &&
        before.percentage === after.percentage
          ? `仍显示 ${after.percentage} · 权重合计变化`
          : last.transition;
      progress.append(
        timelineLink(
          last.position,
          label,
          `${label}。查看计算依据：${progressComparison(last.progressChange)}`,
        ),
        node("p", "", progressReasons(last.progressChange)),
      );
    } else {
      progress.append(node("p", "", "暂无可比较的进度变化"));
    }

    const plan = element("latest-plan");
    const position = checkpoint.timeline.findLastIndex(
      ({ planChange }) => planChange !== undefined,
    );
    const change = checkpoint.timeline[position]?.planChange;
    plan.hidden = change === undefined;
    plan.replaceChildren();
    if (!change) return;
    const descriptions = [
      ["task.added", "新增"],
      ["task.removed", "移出"],
      ["task.changed", "调整"],
    ].flatMap(([kind, label]) => {
      const names = change.changes
        .filter((item) => item.kind === kind)
        .map((item) => item.description);
      return names.length ? [`${label} ${names.join("、")}`] : [];
    });
    plan.append(
      node("span", "context-label", "最近计划变更"),
      node("p", "", descriptions.join("；") || change.title),
      timelineLink(position, "查看计划变更依据"),
    );
  }

  function whyTask(task: Checkpoint["tasks"][number]) {
    const view = presentTask(task);
    const row = node("div", "why-task");
    row.append(
      node("h4", "", `${task.title} · 权重 ${view.weightLabel}`),
      node("p", "", view.detail),
    );
    const stamp = (at: string | undefined) =>
      at === undefined ? "" : ` · ${time.format(new Date(at))}`;
    const fields = [
      [
        "状态",
        `${view.statusLabel} · ${view.statusSource}${stamp(task.statusObservedAt)}`,
        task.evidencePositions?.status,
      ],
      [
        "权重",
        `${view.weightSource}${stamp(task.weightObservedAt)}`,
        task.evidencePositions?.weight,
      ],
      [
        "计划",
        task.plan
          ? `${view.certaintyLabel} · ${originText[task.plan.provenance ?? ""] ?? "未知来源"} · 第 ${task.plan.revision} 个关联版本${stamp(task.plan.observedAt)}`
          : view.certaintyLabel,
        task.evidencePositions?.plan,
      ],
    ] as const;
    for (const [label, value, position] of fields) {
      const fact = node("p", "why-fact", `${label}：${value}`);
      if (position !== undefined)
        fact.append(
          timelineLink(position, "看依据", `查看 ${task.title} 的${label}依据`),
        );
      row.append(fact);
    }
    return row;
  }

  function renderWhy(checkpoint: Checkpoint) {
    const summary = element("why-summary");
    summary.replaceChildren();
    if (checkpoint.progress.status === "available") {
      summary.append(
        node("div", "why-number", progressFormula(checkpoint.progress)),
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
    const history = element("why-history");
    const changes = recentProgress(checkpoint).slice(0, 3);
    history.hidden = changes.length === 0;
    history.replaceChildren(node("h3", "", "最近的进度变化"));
    const list = node("ol", "why-change-list");
    for (const {
      at,
      position,
      progressChange: change,
      transition,
    } of changes) {
      const row = node("li", "why-change");
      const stamp = node("time", "", time.format(new Date(at)));
      stamp.dateTime = at;
      row.append(
        stamp,
        timelineLink(
          position,
          transition,
          `${transition}。查看 ${stamp.textContent} 的计算依据：${progressComparison(change)}`,
        ),
        node("p", "why-transition", progressComparison(change)),
        node("p", "", progressReasons(change)),
      );
      list.append(row);
    }
    history.append(list);

    const tasks = element("why-tasks");
    tasks.replaceChildren();
    if (partialPlan(checkpoint)) {
      tasks.append(
        node("p", "why-description", "已记录的分组和任务可在计划页查看。"),
      );
      return;
    }
    const complete = checkpoint.tasks.filter(
      (task) =>
        task.included &&
        (task.completion === "completed" || task.completion === "verified"),
    );
    const available = checkpoint.progress.status === "available";
    const groups = [
      [available ? "计入已完成权重" : "有明确完成依据的正式任务", complete],
      [
        available ? "只计入总权重" : "其余正式任务",
        checkpoint.tasks.filter(
          (task) => task.included && !complete.includes(task),
        ),
      ],
      ["未纳入正式进度", checkpoint.tasks.filter((task) => !task.included)],
    ] as const;
    for (const [label, members] of groups) {
      if (!members.length) continue;
      const group = node("section", "why-group");
      group.append(node("h3", "", label), ...members.map(whyTask));
      tasks.append(group);
    }
  }

  function savedStamp(at: string) {
    const stamp = node(
      "time",
      "phase-source",
      " · " + savedTime.format(new Date(at)),
    );
    stamp.dateTime = at;
    return stamp;
  }

  function renderCurrentPhase(
    phase: Checkpoint["currentPhase"],
    disconnected: boolean,
  ) {
    const title = element("current-phase");
    const source = element("current-phase-source");
    const links = element("current-phase-links");
    links.replaceChildren();
    if (phase.status !== "available") {
      const explanations = {
        session_unknown: "尚无可用的会话记录",
        session_ended: "会话已明确结束",
        current_task_unknown: "尚未确认当前任务",
        current_task_conflict: "当前任务的依据存在冲突",
        plan_unavailable: "当前计划暂不可用",
        plan_ambiguous: "当前计划存在歧义",
        membership_unavailable: "当前任务没有可用的阶段归属",
      } as const;
      title.textContent = phase.status === "ambiguous" ? "无法确定" : "未知";
      source.textContent = explanations[phase.reason];
      return;
    }
    title.textContent = disconnected ? "未知" : phase.title;
    const groupSource =
      phase.groupProvenance === "visualizer_inferred"
        ? "自动分组 · Visualizer Inferred"
        : (originText[phase.groupProvenance] ?? "未知来源");
    if (disconnected) {
      source.replaceChildren(
        "最后记录 · " + phase.title + " · " + groupSource,
        savedStamp(phase.planObservedAt),
      );
    } else {
      source.textContent =
        "依据 " + phase.taskTitle + " 的计划归属 · " + groupSource;
    }
    if (!disconnected && phase.correctionPosition !== undefined) {
      const confirmed = time.format(new Date(phase.confirmedAt));
      links.append(
        timelineLink(
          phase.correctionPosition,
          "查看任务确认",
          `查看 ${confirmed} 的任务确认：${phase.taskTitle}`,
        ),
      );
    }
    if (phase.planPosition !== undefined) {
      const observed = time.format(new Date(phase.planObservedAt));
      links.append(
        timelineLink(
          phase.planPosition,
          "查看计划归属",
          `查看 ${observed} 的计划：${phase.taskTitle} 所属阶段`,
        ),
      );
    }
  }

  function renderCurrentTask(checkpoint: Checkpoint, disconnected: boolean) {
    const task = checkpoint.currentTask;
    const title = element("current-task");
    const source = element("current-task-source");
    const links = element("current-task-links");
    source.replaceChildren();
    links.replaceChildren();
    if (disconnected) {
      title.textContent = "未知";
      if (task.status === "available") {
        source.append(
          node("p", "recorded-task", "最后确认 · " + task.title),
          badge("User Confirmed", "user_confirmed"),
          savedStamp(task.confirmedAt),
        );
        if (task.correctionPosition !== undefined)
          links.append(timelineLink(task.correctionPosition, "查看任务确认"));
      } else {
        source.append(node("p", "small-note", "暂无保存的任务确认"));
      }
      return;
    }
    if (task.status === "available") {
      title.textContent = task.title;
      source.append(badge("User Confirmed", "user_confirmed"));
      return;
    }
    if (task.status === "likely") {
      title.textContent = "可能是 " + task.title;
      source.append(
        badge("Visualizer Inferred", "visualizer_inferred"),
        node(
          "p",
          "small-note",
          "关联评分 " +
            task.score +
            " / 100 · 计划内唯一被报告为进行中的正式任务",
        ),
      );
      if (task.reportPosition !== undefined)
        links.append(timelineLink(task.reportPosition, "查看任务报告"));
      if (task.planPosition !== undefined)
        links.append(timelineLink(task.planPosition, "查看对应计划"));
      return;
    }
    if (task.status === "ambiguous") {
      title.textContent = "无法确定";
      const notes = {
        correction_conflict: "当前任务的人工选择存在冲突",
        plan_ambiguous: "当前计划存在歧义",
        multiple_in_progress: "多项任务都被报告为进行中",
        conflicting_reports: "同一任务的状态报告存在冲突",
      };
      source.append(node("p", "small-note", notes[task.reason]));
      for (const candidate of task.candidates) {
        links.append(
          candidate.reportPosition === undefined
            ? node("span", "small-note", candidate.title)
            : timelineLink(
                candidate.reportPosition,
                candidate.title,
                "查看 " + candidate.title + " 的进行中报告",
              ),
        );
        if (candidate.conflictPosition !== undefined)
          links.append(
            timelineLink(candidate.conflictPosition, "查看另一条报告"),
          );
      }
      return;
    }
    title.textContent = "未知";
    source.append(
      node(
        "p",
        "small-note",
        checkpoint.sessionState === "ended"
          ? "会话已明确结束"
          : "尚无可判断的任务报告或人工选择",
      ),
    );
  }

  function showReviewCheckpoint(review: EditableReview) {
    editedReview = review;
    checkpoints = [...walkthrough!.report.checkpoints, review.checkpoint];
    index = checkpointCount;
    render();
  }

  function render() {
    const checkpoint = checkpoints[index]!;
    const reviewing = index === checkpointCount;
    if (walkthrough) {
      element("review-hint").hidden = editableReview(checkpoint) === undefined;
      element("open-review").hidden = reviewToOpen() === undefined || reviewing;
      element("reset-review").hidden = editedReview === undefined;
    }
    [...nav.children].forEach((button, rowIndex) => {
      button.setAttribute(
        "aria-label",
        `检查点 ${rowIndex + 1}：${checkpoints[rowIndex]!.label}`,
      );
      (button as HTMLButtonElement).title = checkpoints[rowIndex]!.label;
    });
    element("checkpoint-label").textContent = checkpoint.label;
    element("step-counter").textContent = reviewing
      ? "本次调整"
      : `${index + 1} / ${checkpointCount}`;
    const previousStep = element<HTMLButtonElement>("previous-step");
    previousStep.disabled = index === 0;
    previousStep.setAttribute(
      "aria-label",
      reviewing ? "返回调整前的检查点" : "上一个检查点",
    );
    element<HTMLButtonElement>("next-step").disabled =
      index >= checkpointCount - 1;
    [...nav.children].forEach((button, rowIndex) =>
      button.setAttribute("aria-pressed", String(rowIndex === index)),
    );
    const disconnected =
      recovered !== undefined && checkpoint.sessionState !== "ended";
    element("session-state").textContent = disconnected
      ? "合成会话 · 来源未连接"
      : checkpoint.sessionState === "ended"
        ? "合成 Session · 已明确结束"
        : "合成 Session · 已开始";
    const progressTitle = recovered ? "最后保存的正式进度" : "正式项目进度";
    element("progress-title").textContent = progressTitle;
    element("progress-bar").setAttribute("aria-label", progressTitle);
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
    renderRecentChanges(checkpoint);
    pickerTrigger.hidden =
      editableReview(checkpoint) === undefined ||
      checkpoint.sessionState !== "started" ||
      !checkpoint.tasks.some((task) => task.included);
    renderCurrentTask(checkpoint, disconnected);
    renderCurrentPhase(checkpoint.currentPhase, disconnected);
    renderTasks(checkpoint);
    events(element("recent-events"), checkpoint.timeline, "recent");
    events(element("all-events"), checkpoint.timeline, "timeline");
    const planChanges = checkpoint.timeline.filter(
      (event) => event.kind === "plan.changed",
    );
    events(element("plan-history-events"), planChanges);
    element("plan-history-empty").hidden = planChanges.length > 0;
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
