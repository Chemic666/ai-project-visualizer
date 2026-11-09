# Phase 5 — Synthetic-only User Correction first slice

本轮按已有路线图与 D-037 推进，不关闭 Phase 2/B1/D-038，不接入真实 Codex、Storage、UI 或 SQLite 实验。Phase 4 未提交变更保留，不自动 Commit/Push。

## 设计与内部计划

沿用 PlanEngineState/CoreState、Assertion 和 CorrectionRecord。`applyUserCorrection(state, planScope, input)` 追加 user_confirmed 断言与人工纠正，对同范围旧纠正记录 superseded 元数据；不改写状态断言或 acceptedEvents。`expireUserCorrection(state, input)` 只接受已准入 Session 结束或当前完整计划移除证据；Task Weight 还支持紧邻已应用计划中的稳定 sourceItemId 明确部分删除。`getUserCorrectedCurrentTask(core, projectId, sessionId)` 只查询有效人工纠正，不实现 Phase 9 推断或全局 current-task authority。

- [x] 以 Progress 真实合成 fixture 验证人工权重、后续来源估计不覆盖、再次人工调整、幂等和 JSON 往返。
- [x] 实现当前任务/权重纠正的范围、成员、来源、时间和 ID 验证；拒绝时原状态不变。
- [x] 实现有证据的 Session end / complete current plan removal 失效，并输出带原因/规则/引用的 Core-derived 事件供后续 Timeline 消费。
- [x] 验证人工 Current Task 不修改 Task.status、不同 Session 隔离、缺失/部分/陈旧证据不失效，重放不复活。
- [x] 执行相关测试、完整 Core 回归、类型检查、Lint 与新增文件格式检查，保留合成/生产边界。

## 首片边界

只实现 current_task 与 task_weight；历史 Activity association 尚无当前可用的归一化 Activity 输入/断言字段，继续保留契约，不伪造。较新显式源任务选择的自动失效需要明确可比较的来源顺序，当前五类 NormalizedEvent 不表达该选择，本片不从文件活动或时间猜测它。Current Task 不以部分计划代替完整移除；Task Weight 仅在紧邻已应用计划的同一 Task/sourceItemId 被明确列入 deletedSourceItemIds，且当前可用 head 正是该删除事件、目标确已移除时结束。普通遗漏或删除其他任务不作为证据。

CoreState 是可信初始状态，API 验证本次命令和引用，不重新校验整个历史。时间由调用方显式提供，Core 不读取时钟；source occurredAt 不用于决定人工纠正新旧。派生事件是独立输出，不反馈为 NormalizedEvent。未来 Host 持久化/Timeline 组合尚未实现，不声称生产恢复或 exactly-once。

## 本轮验证与使用

- 创建前基线：151/151 Core 测试通过；本轮纠正定向 23/23，最终完整 Core 174/174 通过。
- Core 和 Storage 类型检查通过；本轮相关 ESLint、Prettier 与 Git 差异空白检查通过。没有运行 Storage 运行测试、SQLite 故障实验、真实 Codex 或 UI 验收。
- 独立只读审查指出的四类问题均已用失败回归复现并修复：范围外替代、Session 计划移除与全局权重范围不一致、未来 receipt 因果引用、空的可选来源引用部分。重新核对没有必修残留发现；静态审查与测试证据分别记录。
- 应用返回 state/events；调用方用返回的 PlanEngineState 继续 calculateProgress，并按未来 Host/Timeline 契约保存派生事件。拒绝时原 state 不变、events 为空；相同命令重放不重复派生，已结束记录不会复活。Query 不做自动推断或改变全局 authority。
- 不同但重叠的 Session 范围不能整条覆盖：保守拒绝范围变化，避免限定 Session 的新值撤销范围外的旧人工值。新来源估计不覆盖人工权重；引用的 SessionStart/源事件接收时间不得晚于纠正或断言生效时间。
- Session 断连、普通活动和时间流逝没有归一化失效输入；不将其当结束。当前完整计划和明确 Session end 只有在调用 expireUserCorrection 后形成记录转移；不会偷偷改变 applyNormalizedEvent/Plan Engine 行为。
- 未修改已有 Phase 4 业务实现、Storage/实验文件、全局配置或真实用户数据；未暂存、Commit 或 Push。

## 后续组件补齐（2026-11-08）

派生纠正事件增加既有 record scope，供 Timeline 保留真实 Project/Session/Task 范围，不改变人工优先政策。Task Weight 的明确部分删除边界已补齐；Current Task 的完整计划门槛不变。纠正定向现为 26/26，含 Timeline 的完整 Core 为 192/192；上面的 23/174 为首片历史结果。没有新增真实来源采集、历史 Activity 关联或较新源选择准入声明。

2026-11-08：已有明确 Session end / plan removal 失效规则已接入相邻 Core 原子组合入口，在重算进度和追加 Timeline 前执行，失败保留原组合状态。见 [Phase 6 组合说明](phase-6-timeline.md)。这不改变本文件先前记录的独立函数行为，不增加历史 Activity 或较新显式源选择契约。
