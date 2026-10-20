# Phase 3 — Synthetic-only Plan Engine

本轮为已授权的独立 Core 实现。安装级 Storage 合成集成为 PASS WITH LIMITATION；B1 仍 BLOCKED、生产 Storage 仍 unavailable。完整 O01/O02、S/P/M 不升级。D-038 保持 Technical Verification Pending：单次桌面 SessionStart 不证明 Plan 观察能力。本实现不读取 Hook 运行数据。

## 入口与兼容性

- `createPlanEngineState(core)`：从无已消费计划历史的可信 CoreState 建立显式内存组合。已有计划账本但缺少 Engine 状态时拒绝初始化，不能假装为空；历史迁移不在本轮范围。
- `applyPlanEvent(engine, event)`：只接收归一化 `plan.detected` / `plan.updated`，不解析任何 Agent 协议。
- `getPlanSnapshot(engine, scope)`：返回 available / unknown / ambiguous。未决新观察保留 `lastKnown`，不能将它当作已确认的当前快照。已证明迟到的旧序号不遮蔽更新的快照。
- `applyNormalizedEvent` 的 Phase 1 计划保留行为、CoreState 字段和五类输入事件不变。PlanInput 仅增加可选字段；旧输入继续可用，但缺少新来源契约时，新 Engine 返回 unknown。
- `PlanEngineState` 独立保存 CoreState、heads、修订快照和派生变化。JSON fixture 往返不等于 Storage 持久化/恢复验收；现有 Storage codec 尚不支持该组合，禁止只存 `engine.core` 后声称已保存完整计划。

## 归一化来源契约

- 明确的 `sourceId`、`payload.planId` 及 `payload.provenance`；作用域为 Project + Source + 可选 Session + Plan。不同来源不自动合并成一个 authority；指定 Session 必须存在且来源一致，项目归属由归一化边界提供，不在此推断。
- `sourceItemId` / `sourcePhaseId` 仅在来源保证其稳定时提供。`sourceReference` 保留来源引用/revision，但不能自动充当稳定 task ID。
- `certainty` 为 confirmed / tentative / idea；缺失就是未知，不默认 confirmed。Plan Engine 不产生任务 WorkStatus、权重、进度或 VERIFIED。
- 完整快照决定本来源计划的全部任务成员及顺序；部分更新保留遗漏任务与原顺序，新任务追加。`deletedSourceItemIds` 显式删除当前成员，未知删除或同项同时 upsert/delete 返回 unknown。
- `phases` 是具稳定 ID 的 Phase 元数据声明；未声明不删除 Phase。平面任务使用标记为 Visualizer Inferred 的结构性 Phase。Phase 删除/重排尚未实现。
- `previousEventId` 是可比较的内部前置观察引用；opaque revision、Cursor、标题和墙钟都不排序修订。`sourceSequence` 必须为非负安全整数，且只有经边界确认可靠的来源序号才能用于排序。
- 完整快照可通过来源序号跨越已知缺口；部分更新必须明确引用已采用的前置快照，不能越过未决观察。完整快照若要覆盖无序号的未决观察，前置引用链须覆盖全部未决观察；不能凭接收顺序从多个分支中选一个，否则继续 unknown。

## 身份、历史与纠正

- 有稳定来源 ID 的当前成员在改名、改 certainty、移动 Phase、重排后保持内部 TaskId。新增 ID 由内部 EventId 和局部索引分配，不以来源 ID、标题或路径充当内部身份。
- 无稳定 ID 的首次输入可建立 event-local Task；后续无法可靠对齐时整次投影不变并返回 ambiguous。完整空快照可明确移除所有成员。不做相似度匹配或自动 disambiguation。
- 删除只退出计划成员集合；Task、Assertion、归一化来源事件与修订快照不删除。已退出的来源 ID 再入计划使用新内部 TaskId，不静默复活旧纠正。
- 改名/重排保留原有状态、权重断言、人工纠正和已解析结论。现有有效人工权重不会被计划更新覆盖。纠正的失效/替代/冲突解析仍属于 Phase 5；本轮不修改其 lifecycle。退出成员上的纠正仅保留历史，不适用于再入的新 Task。
- 每个已采用修订保留不可变标题、Phase 标签、成员身份、certainty 和输入事件引用。unknown / ambiguous 也追加解释记录与输入账本，且不替换已采用快照。
- 输入重放按内部 EventId 或稳定 SourceId + sourceEventId 幂等；冲突 claim 拒绝。Cursor 不是去重键，无稳定身份的新内部事件不承诺 exactly-once。
- `plan.changed` 是独立的 Core-derived 输出，带因果事件、前后修订引用、规则版本及来源依据；不进入 NormalizedEvent 输入联合。无变化不重复发出变化事件。

## 验证与边界

受控 fixture 覆盖三类 certainty、增删改/重排、Phase 改名/任务移动、部分更新、稳定/缺失身份、作用域隔离、修订分支及缺口、幂等/冲突 claim、不可变历史、人工权重保留、拒绝时投影原子性和 JSON 往返。见 [定向用例](../packages/core/tests/plan-engine.test.ts)。

首次交付结果：新增 Plan Engine 用例 42/42，既有 Core 回归 64/64，合计 106/106。Core/Storage 静态类型检查、Core lint、本轮文件格式检查及 `git diff --check` 通过；没有运行 Storage、Hook、真实 Session 或任何 SQLite Spike。

2026-10-20 Checkpoint 前定向审核发现并修复三项实际缺陷：同序号冲突不能被查询当作已证明更旧的观察，且不能被部分更新绕过；覆盖未决分支的前置引用链还必须经过当前已采用 head，不能从旧分支倒写；Phase 标签更新同步更新 provenance，来源变化也产生 `phase.changed`，旧快照保留原值。新增四个回归先复现失败，再验证修复。最终 Plan Engine 46/46、既有 Core 64/64，合计 110/110；Core/Storage 类型、Core lint 与本轮文件格式检查通过。

对应既有验收中的 Phase 3 normalized revisions / identity-aware diff / partial snapshot 子条件，以及 Scenario 14 的历史保留、Scenario 21 的来源引用组件条件；不将真实 capture、UI、恢复或整项产品 Scenario 判定 PASS。

未覆盖：真实 Codex Plan/Hook 更新、跨源自动 reconciliation、缺失 ID 的交互消歧、历史 CoreState 迁移、生产持久化、Correction Engine 生命周期、Progress/Timeline Engine。只有可信合成内存状态验证，不提供原始不可信 JSON 或损坏状态的通用解析器。

可进入 Phase 4 前置设计，但正式进度需要检查当前快照是否可用且完整、certainty 来源、有效权重及独立完成依据；本轮没有计算百分比，也未将 Agent Reported Completion 升级为 VERIFIED。
