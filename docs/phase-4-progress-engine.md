# Phase 4 — Synthetic-only Progress Engine

仅为 Core 合成组件实现。S-15 政策已 Accepted；B1 仍 BLOCKED、生产 Storage unavailable、D-038 Technical Verification Pending，O01/O02 与生产 S/P/M 不升级。

## 接口与组合

- `calculateProgress(planEngineState, scope, verificationSupports?)`：对显式 Project/Source/Session/Plan 作用域读取当前 Plan Engine 查询结果，不自行选择或合并多个来源的 authority。
- `createProgressEngineState()` / `updateProgress(...)`：纯内存进度历史和 Core-derived `progress.changed`；相同依据重算不重复派生。输出不属于 NormalizedEvent 输入联合，不自动反馈为观察事件。
- `formatProgressPercentage(ratio)`：仅展示时保留一位小数并去掉 `.0`；计算保留未舍入的 Number 值。不宣称任意精度算术，数值溢出/完全丢失正加数时 unavailable。
- 复用 Assertion、ResolvedConclusion、CorrectionRecord、PlanHead 和既有引用类型。CoreState 与 `applyNormalizedEvent`、Plan Engine 行为不变。当前 Storage codec 不支持完整 Plan/Progress 组合，本轮不扩展持久化或 ACK。

## 公式、unknown 与来源

分母为当前完整、可用计划中全部 certainty=confirmed 的有效正有限 Task weight，分子仅包含其中具明确可靠完成依据的权重。每个 Task 计算一次；Phase weight 是任务汇总，不作第二次乘数。Tentative / Idea 排除；缺少 certainty 不推定为非正式任务。

缺计划、部分快照基线、Plan unknown/ambiguous、缺失/无效/冲突权重、无效引用、未解决状态冲突或零分母都返回 unavailable 和固定原因。unavailable 不附百分比或项目分子/分母。无来源权重不填 1，也不通过删掉未知任务伪造百分比。

源权重通过可信归一化的 `task.weight` Assertion 与 SourceReference 进入 fixture；原生五类 NormalizedEvent 还没有权重事件，本轮不伪造这种输入。当前来源状态可直接复用明确 Task 归属的 `task.status_reported` 账本与断言。

相同值的断言保留为共同依据，并从中寻找符合资格的见证，不凭 ID 排序漏掉有效完成依据；不同值需要已有 ResolvedConclusion 明确覆盖全部当前候选，不能按到达时间选最新。显式解释的选定断言不会被静默替换。新断言未被解释覆盖时，旧解释不能静默继续生效。有效、当前 scope 的人工权重 Correction 优先于后续来源估计；expired/superseded 的修正断言不降格为普通 User Confirmed 输入而复活。本轮只消费已有 lifecycle，不实现 Phase 5 的纠正创建/失效引擎。

User Confirmed 等权只接受显式人工输入，保留其来源。权重/状态/确定性断言、采用的解释、人工记录、任务、Phase 和 Plan Revision 一同进入进度依据。

## 完成资格

明确归属的直接完成声明须有可核对的归一化来源事件或来源记录，才可计为 COMPLETED；仍保持 Agent Reported 来源。没有可靠依据的推断即使 confidence=99 也不计入。

VERIFIED 需要直接、可信的 observed/user_confirmed 状态及显式 `IndependentVerificationSupport`：绑定状态断言、验证规则/版本及相关来源记录。它是**可信合成输入中的独立性/相关性声明**，不是验证器，不会运行测试，也不能证明真实证据的独立性。Agent Reported `verified`、Turn 结束、命令通过或 Agent 总结都不能仅凭字样获得 VERIFIED；本轮没有实现 Phase 14。

未知状态没有确认完成权重，其缺失原因在 task basis 中保留；这不声称任务实际未完成，也不是 Estimated Progress。状态存在未解决冲突时，项目进度 unavailable。

## 变化与历史

记录计划扩张/缩减、任务重开、状态变化、权重变化/人工纠正、依据变化及进度可用性变化。计划无法读取时不能伪装成计划缩减。每个事件保存前后结果、Plan 修订、原断言、来源和纠正引用；本轮不生成 Timeline UI。

`progress.changed` 的内部 ID 仅在所传进度历史状态中分配；保留状态的 JSON fixture 往返可维持幂等，不承诺多实例/持久化 exactly-once。检查全部同 scope 历史快照：回传缺少先前断言/计划历史或原断言身份内容被改写时拒绝更新，不发布新百分比；中间 unavailable 或任务移除不能擦除该保护。

## 验证范围

用例见 [Progress Engine tests](../packages/core/tests/progress-engine.test.ts)。严格复用既有 Scenario 09–15/20 的组件子条件：32/45 显示 71.1%，新增权重 3+2 后 32/50 显示 64%，原因 plan_expanded；unknown、不混合、人工优先、重开、重复输入和来源解释分别验证。

2026-10-20 实测：Progress 定向用例 41/41；既有 Core 回归 110/110，合计 151/151。Core/Storage 类型检查、Core Lint 与本轮新增代码/说明格式检查通过。未运行 Storage 或 SQLite 实验。

实现与只读审核中已复现并修复：unknown 被误解释为计划缩减、拒绝更新时残留数值、中间 unavailable 绕过历史保护、人工修正来源 namespace 校验缺口，以及同值断言按 ID 选错有效见证。相应回归保留在用例中。

尚未覆盖：真实来源权重准入、实际独立验证、Adapter/Hook、Storage 持久化恢复、UI、完整多源 reconciliation、Phase 5 lifecycle、真实事件全链路。没有把组件通过写成整项产品 Scenario 或生产验收 PASS。

## 纠正历史一致性补齐（2026-11-08）

在已有同 scope 断言/计划历史保护上，补查先前进度依据引用的权重纠正记录。记录丢失应 evidence_history_missing；同 CorrectionId 创建内容改写、已结束 lifecycle 改写/复活应 evidence_identity_conflict。正常 active→superseded/expired 合法生命周期更新应继续允许。拒绝返回原进度状态且不附数值，不把历史损坏当普通进度变化；仅校验先前本 scope 进度已引用的记录，不做通用导入器或完整快照校验。

内部计划：

- [x] 以保留断言但丢失 record、创建时间改写、合法替代及终止后改写/复活复现缺口。
- [x] 补齐既有 updateProgress 历史检查，不改变计算公式、纠正优先或生命周期规则。
- [x] 验证历史移除/中间 unavailable 不能绕过保护，以及正常闭环、类型与相关检查。

实现增加 ProgressEngineState.snapshots[].correctionHistory，独立保存本 scope 既往/当前进度依据已引用的纠正记录。因此在 Task 被移除或计划 unavailable 后，也不会只记得更早的 active 版本而遗忘已接受的终态。数值结果不变但接受新的纠正终态时，记录 evidence_changed 及纠正引用；完全相同的重放仍 unchanged，且保留原对象。排序仅作用于新建的候选数组，不改输入。

这是未发布的合成内存组合结构变更；旧的缺 correctionHistory 字段快照不受支持，不能凭当前 Core 补造它以前没有记住的终态。没有修改 Storage codec、持久化格式或生产迁移政策，也不声称支持旧快照导入/数据库恢复。调用方仍须提供可信、不可变的类型化 Engine 状态。

验证：Progress 定向 48/48，Project 组合 16/16，完整 Core 243/243；Core/Storage 类型及标准 lint/format:check 通过。先复现记录丢失、创建元数据改写、终态复活/改写及移除后终态遗忘，再修复。覆盖移除同时结束、先记录移除再结束、JSON 往返、中间 unknown/移除仍不能丢记录，以及 Project 更新整体回退不准入来源事件。独立只读复核已确认修复，静态审查不替代实际测试。
