import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const reasonText = {
  plan_unknown: "没有可用计划",
  weight_unknown: "正式任务的权重尚未补齐",
  zero_denominator: "尚无有效的总权重",
  initial_calculation: "首次计算",
  plan_revision_changed: "计划版本更新",
  status_changed: "完成声明或状态依据变化",
  progress_unavailable: "计算依据暂不完整",
  plan_expanded: "正式计划新增任务",
  progress_available: "计算依据已补齐",
  weight_corrected: "用户确认或调整了权重",
};
const describe = (codes) =>
  codes.map((code) => reasonText[code] ?? code).join("；");

const args = process.argv.slice(2);
const inspect =
  args.length === 2 &&
  args[0] === "--inspect" &&
  /^[1-9]\d*$/.test(args[1]) &&
  Number.isSafeInteger(Number(args[1]));
const simple =
  args.length === 0 ||
  (args.length === 1 && ["--json", "--help", "--timeline"].includes(args[0]));
if (!simple && !inspect) {
  console.error(
    "用法：pnpm demo:core [--json | --help | --timeline | --inspect N]",
  );
  process.exitCode = 2;
} else if (args[0] === "--help") {
  console.log(
    "pnpm demo:core：运行合成 Core 演示；--json 输出计算报告，--timeline 列出事件序号，--inspect N 查看单条依据。不会连接真实会话或运行模型。",
  );
} else {
  try {
    const result = await build({
      entryPoints: [
        fileURLToPath(
          new URL(
            "../../packages/core/examples/walkthrough.ts",
            import.meta.url,
          ),
        ),
      ],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      target: "node24",
      logLevel: "silent",
    });
    const source = Buffer.from(result.outputFiles[0].contents).toString(
      "base64",
    );
    const { runCoreWalkthrough } = await import(
      `data:text/javascript;base64,${source}`
    );
    const report = runCoreWalkthrough(
      17,
      inspect ? Number(args[1]) : undefined,
    );
    if (args[0] === "--json") {
      console.log(JSON.stringify(report, null, 2));
    } else if (args[0] === "--timeline") {
      console.log("APV 固定合成案例时间线（序号仅适用于本案例）");
      report.checkpoints.at(-1).timeline.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry.at}  ${entry.title}`);
      });
      console.log("使用 --inspect N 查看对应依据；序号不是持久事件身份。");
    } else if (inspect) {
      const selected = report.timelineInspection.selected;
      if (!selected) throw new Error("synthetic_inspection_missing");
      const origins = {
        observed: "Observed",
        agent_reported: "Agent Reported",
        user_confirmed: "User Confirmed",
        visualizer_inferred: "Visualizer Inferred",
        core_derived: "Core 规则计算",
      };
      console.log(
        `APV 合成案例 · 事件 ${selected.position}: ${selected.title}`,
      );
      console.log(
        `发生时的记录：${selected.at} · ${origins[selected.provenance]}`,
      );
      for (const row of selected.evidence) {
        console.log(
          `  ${row.label}：${row.value}${row.provenance ? ` · ${origins[row.provenance]}` : ""}`,
        );
        if (row.at) console.log(`    原记录时间：${row.at}`);
        if (row.recordVersion === "current_state")
          console.log(
            `    当前传入状态中的生命周期${row.endedAt ? `，结束于 ${row.endedAt}` : ""}；不替代该动作发生时的记录。`,
          );
      }
      console.log(
        "只展开内置合成案例的直接依据；不跟随来源引用，不代表独立验证或真实接入。",
      );
    } else {
      console.log("APV 合成 Core 演示（不代表真实接入或产品验收）\n");
      for (const row of report.checkpoints) {
        const progress =
          row.progress.status === "available"
            ? `${row.progress.completedWeight}/${row.progress.totalWeight} (${row.progress.percentage})`
            : `进度不可用：${describe(row.progress.issueCodes)}`;
        console.log(`${row.label}\n  ${progress}`);
        if (row.progressReasons.length)
          console.log(`  变化依据：${describe(row.progressReasons)}`);
        if (row.currentTask.status === "available")
          console.log(`  当前任务：${row.currentTask.title}（User Confirmed）`);
      }
      console.log(
        `\n时间线：${report.timelineEntryCount} 条意义事件；重放、拒绝及 JSON 往返检查通过。`,
      );
      console.log(
        "Login 完成为 Agent Reported；未声称独立 VERIFIED。所有权重均为合成 User Confirmed 输入。",
      );
      console.log("\n独立历史分支（不改变上面的进度故事）：");
      console.log(
        `  旧 JWT：${report.membershipHistory.removedTask.planVersionCount} 个计划版本，${report.membershipHistory.removedTask.correctionCount} 条纠正仍可追溯。`,
      );
      console.log(
        `  重新纳入的 JWT：${report.membershipHistory.reenteredTask.planVersionCount} 个计划版本，${report.membershipHistory.reenteredTask.correctionCount} 条旧纠正；权重未知，进度不可用。`,
      );
      console.log(
        `\n依据展开：${report.timelineInspection.entryCount} 条时间线事件，${report.timelineInspection.localReferenceCount} 项本地引用可读，${report.timelineInspection.externalReferenceCount} 项来源引用未跟随。`,
      );
      const lifecycle = {
        active: "有效",
        expired: "已失效",
        superseded: "已替代",
      };
      console.log(
        `  原人工选择动作仍保留；当前纠正记录${lifecycle[report.timelineInspection.currentTaskCorrection.lifecycle]}。历史动作与当前生命周期分别呈现。`,
      );
      console.log("无真实会话观察、Storage 接入或模型调用。");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "synthetic_inspection_position_invalid"
    ) {
      console.error(
        "事件序号超出此合成案例范围；使用 --timeline 查看合法序号。",
      );
      process.exitCode = 2;
    } else {
      console.error("合成 Core 演示失败。请运行 pnpm test 查看对应回归结果。");
      // Only fixed codes created by this fixture are emitted, never build paths/source.
      if (
        error instanceof Error &&
        /^synthetic_[a-z_]+(?::[a-z_]+)?$/.test(error.message)
      )
        console.error(error.message);
      process.exitCode = 1;
    }
  }
}
