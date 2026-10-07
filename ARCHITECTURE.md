> Specification remediation: 2026-10-07。D-034–D-038 为本轮批准决策；规格描述不代表已实现/已验证。

# AI Project Visualizer — Architecture

## 1. Architecture Goal

AI Project Visualizer 的架构目标不是构建一个 Codex 专用 Dashboard，而是构建一个：

> **Agent-agnostic Project Observation Platform**

即：

```
Coding Agent
    ↓
Agent Adapter
    ↓
Normalized Events
    ↓
Project State Engine
    ↓
Unified Project State
    ↓
VS Code / CLI / Web / Other UI
```

首个 Agent 集成目标是 Codex；能力当前 Unverified。Core 不得依赖 Codex 专有数据模型。

# 2. Architecture Principles

## 2.1 Core First

业务规则属于 Core；具体持久化属于独立 Storage。D-008、D-036 规定编译依赖向内：

```text
codex-adapter → core
storage → core
host → core / codex-adapter / storage
surface → host 或 core 的公开查询/纠正契约
```

Core 不导入 Codex protocol、vscode、SQLite driver 或 Storage 实现，也不要求网络或 LLM。Core 定义实际需要的领域/持久化数据契约；Storage 实现读写、事务和迁移。Host 提供本地应用存储位置、组合依赖并管理启动/停止；VS Code 的组合入口可以承担 Host 职责，但不得计算项目业务状态。没有单独 Host package 的提前建包要求。

## 2.2 Adapter Isolation

任何 Agent-specific 行为必须进入 Adapter package（首个为 Phase 7 的 `packages/codex-adapter/`），不能进入 Core。

例如：

```
Codex
→ CodexAdapter
→ NormalizedEvent
```

未来：

```
Claude Code
→ ClaudeCodeAdapter
→ NormalizedEvent
```

Project Core 不关心事件来自哪一个 Agent。

## 2.3 Event-driven

Core 消费归一化观察和用户纠正，输出解释后的状态与派生变化。事件命名与所有权以 §9–10 为准。Phase 1 使用同步进程内调用和可控 fixture；不引入外部消息队列、分布式 Event Bus 或通用事件溯源框架。

# 3. High-Level Architecture

```text
Agent → Adapter → Normalized Events → Project Core → Surface
                                         ↕
                              Persistence contract
                                         ↕
                                  Local Storage
```

上图是数据流；编译依赖以 §2.1 为准，Core 不反向依赖 Storage。Host 组合各部分，未来 CLI/其他 IDE 可替换 Surface；Core 不需要知道具体 Agent。来源身份是必要元数据，不是协议耦合。

# 4. Repository Structure

Phase 0 只保留规格文档和 Spike 方案。经另行授权进入 Phase 1 时，pnpm workspace 只建立 `packages/core/`、必要的源码/测试及编译配置。

- Phase 2：按需建立 `packages/storage/`。
- Phase 7：按已验证路径建立 `packages/codex-adapter/`。
- Phase 10：建立 `apps/vscode-extension/`。
- 独立 Spike：经授权后使用 disposable experiments，不能自动成为生产 Adapter。
- CLI、semantic、shared 与 Provider packages 在对应需求实际出现后再决定。

不要预建每个 Engine 文件夹、两条 Codex 接入路径或空包。Monorepo 决策不等于现在初始化所有模块。

# 5. Core Domain Model

以下是规格级数据契约，不是已实现的模型。Phase 1 的必要契约是 Project / Phase / Task / Session、来源断言、事件和纠正引用；后续 Engine 行为仍按 Roadmap 实现。

| 对象 | 必要约束 |
| --- | --- |
| Project | 独立 projectId；位置元数据与身份分开；计划修订引用；currentTask/currentPhase 分别引用结论；progress 可以 unavailable |
| Phase | 稳定 phaseId；Task 归属；聚合状态引用依据；weight 是当前 Confirmed Tasks 的权重汇总，不是独立乘数 |
| Task | 稳定 taskId；phaseId；标题；status、plan certainty、weight 分别引用独立断言；保留来源身份和历史 |
| Session | Agent-neutral sessionId；来源 session 标识及 project 归属依据；未知归属不能猜测绑定 |
| Assertion | assertionId、目标实体/字段、值、provenance、sourceId、event/revision 引用、时间、依据引用；推断附规则及适用的 confidence |
| Resolved conclusion | 当前采用的 assertion 引用、支持/冲突的 assertion 引用、resolution 原因；不覆盖原始来源断言 |
| Correction record | correctionId、目标、范围、原/新结论引用、effectiveAt、supersedes、有效状态及失效依据，见 §19 |

不使用单一 Task.provenance 或 confidence 代表所有字段。Current Task 关联与 Task.status 独立；纠正关联不改变原 Agent-reported status。PlanCertainty 不等于 WorkStatus。

内部身份不依赖 VS Code Workspace 对象、Codex thread ID 或路径字符串。Host/Adapter 提供来源位置和归属证据；路径规范化由边界层处理。具体单根/多根、symlink/worktree、迁移和 Remote 支持范围须在宿主/接入验证时明确，不能声称已支持。移动位置不能仅凭名称静默合并 Project。

Phase 13 前没有 Estimated Task Progress 数值字段/计算/展示的实现要求；不得把未来字段作为 Phase 1 建模前置条件。

# 6. Status Model

WorkStatus：todo / in_progress / completed / verified / blocked；无法确定时结论 unavailable，不能猜测已完成。

- COMPLETED：有可靠的、明确归属任务的完成声明记录；Agent 声明保留 Agent Reported 来源及事件/修订引用。它不是独立验证。
- VERIFIED：有独立、相关的 Verification Evidence 和明确验证规则；不能由普通自动推断或 Agent 的测试总结升级。
- 二者可以计入 Confirmed Project Progress，但各自依据必须保存。无可靠完成依据的自动推断即使 score 很高，也不能计入已完成权重。
- v0.1 识别状态真实性，不实现 Phase 14 的 Verification Engine；受控 fixture 可测试 verified 契约，但不能据此宣称真实验证能力已实现。

符号：○ TODO、▶ IN_PROGRESS、◐ COMPLETED、✓ VERIFIED、⚠ BLOCKED。Phase 的完成表示聚合任务状态；只有所有适用正式任务均具独立验证依据时才可标 VERIFIED。空 Phase 不自动 verified。

当前聚合 Phase 状态保留任务断言引用：非空 Confirmed Tasks 全部具 verified 依据才 verified；全部具完成依据的 completed/verified 才 completed；否则有进行中任务、有效当前任务关联或已开始/完成的部分工作则 in_progress；尚无开始依据且所有剩余任务明确 blocked 才 blocked；其余 todo。无法可靠解析必要断言时聚合状态 unavailable。Phase 汇总/状态规则在 Phase 3/4 的 fixture 验证，不要求 Phase 1 提前实现。

# 7. Provenance Model

每个关键结论分别保留 Observed / Agent Reported / Visualizer Inferred / User Confirmed 来源，按 §5 的 Assertion 契约保存。来源断言与当前解释共存，能够表达来源 A/B 的不同状态及 conflict，而不要求 v0.1 实现完整多来源输入/冲突 UI。

“观察到 Agent 说 DONE”的传输事实，不把完成结论升级为 Observed implementation success。Current Phase 从 Current Task 推导时保留推导引用；Progress 保存其 plan revision、纳入的 task/status/weight assertion 引用和公式。用户修正采用新 assertion，不删除原判断。

# 8. Confidence Model

v0.1 的 Current Task Confidence 是关联判断的规则可信度，不是 Task 完成比例、测试通过率或统计校准概率。保留使用的规则/证据、规则版本及判断时间；普通推断可使用 0–100 的 heuristic score，具体权重/阈值在 Phase 9 fixture 验证后确定，不把示例加分规则当作已校准算法。

没有依据时 unavailable；多个候选无法区分时 ambiguous；断连/旧数据标 stale。人工纠正显示 User Confirmed，不伪造“算法 100%”。所有推断必须暴露不确定性，设置不能完全隐藏它。Phase 13 的 estimate confidence 必须与 association confidence 分开。

# 9. Normalized Event Model

统一事件 envelope 记录 schemaVersion、id、projectId、可选 sessionId、sourceId、sourceEventId（来源不提供时由 Adapter 的稳定 cursor/identity 策略生成）、occurredAt（未知则明确缺失）、receivedAt、可用 sourceSequence、因果引用，以及按 type 校验的 payload。

- Core 输入采用 discriminated payload contract；专有原始 payload 留在 Adapter，不以 unknown 直接交给业务规则。
- 输入前校验类型、引用和时间；无效或项目归属未知的事件隔离/报告，不猜测更新其他项目。
- 同一 sourceId + sourceEventId 重放是幂等的；缺失稳定身份的来源须在 Spike 中报告降级风险，不能声称 exactly-once。
- 来源内顺序优先使用 sequence/revision；缺失时按明确 cursor/接收策略处理。迟到事件可保留历史，但不能仅凭到达时间倒写当前状态或撤销纠正。
- 不假设跨来源全局时钟一致；有因果关系的 plan/status/progress 使用引用关联。
- 断连、Session 结束和新 Turn 是不同概念。恢复不能生成重复派生 Timeline。

Phase 1 测试中验证归一化契约和幂等规则；真实传输能力须独立验证。

# 10. Event Types

| 所有者 | 事件与作用 |
| --- | --- |
| Adapter / source | session.started / session.ended；plan.detected / plan.updated（完整性及 revision）；task.status_reported（明确任务归属及声明依据） |
| Surface 经 Host 提交 | user.correction；用户选择只形成 Visualizer 纠正，不向 Agent 下达任务 |
| Core 派生 | task.started / task.status_changed / task.completed；phase.status_changed；plan.changed；progress.changed；correction.expired；meaningful Timeline entries |
| 后续 capability 可用时的 Adapter 输入 | agent.message 的最小必要信息；activity.read / activity.edit / activity.command / activity.test |

Adapter 不计算项目进度，不直接生成 Core 的聚合状态。派生事件不能无标记重新进入观察输入而循环消费。Phase 1 只消费 fixture 所需的小词汇；Phase 3–9 逐步实现相关行为，以上不是 Phase 1 必须实现全部活动/引擎的清单。所有生产事件可用性仍以 Spike 证据为准。

# 11. Raw Events vs Meaningful Events

分两层。

## Raw Events

```
Read
Edit
Search
Command
Test
```

用于：

- 实时推断；
- Debug；
- Semantic Analysis；
- Current Task 判断。

## Meaningful Events

```
Task started
Task completed
Plan changed
Progress changed
User corrected task
Phase completed
```

用于：

- Timeline；
- 长期存储；
- 用户界面。

# 12. Plan Engine

Adapter 解析 Agent-specific 协议，输出 source-aware normalized plan revisions；Core 处理归一化计划、快照和 diff。未来 PLAN.md/TODO.md 需要自己的来源解析边界，不允许 Core 导入 Codex 类型。

保留来源 itemId/revision；内部 taskId 与其映射。重排/改名优先保持稳定身份；来源没有稳定 ID 时 Phase 3 必须定义保守匹配和歧义 fixture，不能仅凭标题当作永久身份。平面计划可归入标为 Visualizer Inferred 的结构性 Phase；不得伪装成 Agent 明确给出的 Phase。

只有已知完整快照或显式删除才能移除当前计划任务。历史 Task/关联/纠正不能因此被删除。全多源自动 reconciliation 及 UI 后置，§5 保留多来源断言能力。

# 13. Plan State

Plan item 建议支持：

```
type PlanCertainty =
  | "confirmed"
  | "tentative"
  | "idea"
```

只有：

```
confirmed
```

默认进入正式进度计算。

# 14. Plan Change Detection

Plan Engine 必须能比较：

```
PreviousPlan
vs
CurrentPlan
```

生成：

```
TaskAdded
TaskRemoved
TaskChanged
PhaseAdded
PhaseChanged
```

例如：

```
+ Refresh Token
+ Token Revocation
```

写入 Timeline。

# 15. Progress Engine

## Confirmed Project Progress（v0.1）

分母：当前计划中 certainty=confirmed 的全部有效 task weight。分子：其中 COMPLETED / VERIFIED 且具可靠完成依据的 task weight。每个 Task 只计算一次。

COMPLETED 保留完成声明依据，VERIFIED 保留独立验证依据；普通自动推断无可靠完成依据不能进入分子。Confirmed 指正式计划上的完成记录，并不保证独立验证已通过（D-035）。

weight 必须是正的有限数；缺少正式计划、分母为零或任一正式任务缺少有效权重时返回 unavailable 和原因，不丢弃未知任务来制造百分比。计算使用未舍入值，UI 百分比保留一位小数并去掉末尾 .0；Phase weight 只汇总、不再次加权。

当前 Phase 来自有效 Current Task 的所属 Phase，保留引用和关联的不确定性；无有效 Current Task 不凭已完成数量猜测当前 Phase。移除任务从当前分母退出但保留历史；重新打开任务移出分子；权重/计划变化都记录原因。空 Phase/Plan 不自动算 100%。

初始权重支持来源明确给出的估计和用户调整，不要求 Core 调用 LLM。无源权重的确定性默认政策仍须 Phase 4 前批准并验证（S-15）；不将全 1 永久当作可靠复杂度模型。

## Estimated Task Progress（Phase 13）

v0.1 不计算、不存入当前业务视图、不展示数值或占位百分比。Phase 13 再定义独立 estimate、estimate confidence 和解释；始终不得混入 Confirmed Project Progress。

# 16. Progress Regression

与 Acceptance Scenario 13 相同的 Plan 扩张：完成权重保持 32，总正式权重 45→50（新增 weight 3+2）。

```
71.1% → 64%
```

Progress Engine 应产生事件：

```
progress.changed
```

并附带：

```
reason = plan_expanded
```

Timeline 可以展示：

```
71.1% → 64%

Reason:
Plan expanded.
```

# 17. Explainable Progress

沿用 Scenario 13 扩张后的 32/50；Progress Engine 不仅返回：

```
64%
```

还应返回：

```
interface ProgressExplanation {
  totalWeight: number
  completedWeight: number

  completedTasks: string[]
  activeTasks: string[]
  remainingTasks: string[]

  changes?: ProgressChangeReason[]
}
```

# 18. Timeline Engine

Timeline 不是 Raw Log Viewer。

长期保留：

```
Session Started
Task Started
Task Completed
Plan Changed
Progress Changed
Phase Completed
User Correction
Important Failure
```

例如：

```
18:42
Plan changed

+ Refresh Token (weight 3)
+ Token Revocation (weight 2)

18:43
Progress changed

71.1% → 64%
```

# 19. User Correction Engine

政策按 D-037。纠正 record 至少保留 correctionId、project/session 范围、目标字段/实体或明确 event 集合、旧/新 assertion、effectiveAt、supersedes、有效状态、失效时间及原因/规则版本/触发 event 引用。

| 类型 | 有效范围 | 失效/替代依据 |
| --- | --- | --- |
| Current Task | 指定 Project/Session 的当前工作上下文 | 后续人工纠正；同 Session 明确归属且较新的源任务选择；Session 明确结束；目标被完整计划更新明确移除 |
| 历史 Activity association | 指定 eventId 或明确事件集合 | 后续人工纠正替代；未来活动/新 Turn 不影响此历史判断 |
| Task Weight | 同一稳定 taskId 的当前计划成员 | 后续人工调整或明确退出当前计划；Agent 新估计不得覆盖有效人工值 |

人工纠正优先于普通推断；普通文件活动、新 Turn、时间流逝和程序重启均不直接失效。源任务选择须是可识别明确任务的声明/结构化选择，不能由文件活动或 Turn 完成猜出；不能可靠比较新旧时保留纠正并暴露冲突。已移除任务重入计划不静默复活旧纠正；历史仍可查。

断连不等于 Session 结束，保留纠正并显示最后确认/当前未知。失效和替代均追加历史/Timeline，不能静默发生。纠正关联不把任务状态或完成验证升级为 User Confirmed/VERIFIED。不存在所有字段通用的“人工覆盖客观证据”排序。

Timeline 可展示带纠正说明的解释，但原观察/原判断不可删除。Phase 1 保留引用/范围契约；纠正行为在 Phase 5，推断结合在 Phase 9 验证。

# 20. Storage Architecture

SQLite 为已接受本地持久化方向，具体 driver 和 VSIX/runtime packaging 是 Technical Verification Pending。Storage 依赖 Core 的数据契约，负责读写、事务/迁移；Core 不导入 SQLite。

持久恢复需要来源事件/断言、plan revisions、纠正及其失效记录与处理 cursor；当前状态/进度/Timeline 是解释后的投影，不能是唯一来源。不要求框架级全事件溯源；Phase 2 须确定最小 authoritative records + versioned snapshot 恢复方案。

一次状态转移关联的 plan/correction/projection/cursor 更新必须原子提交。Snapshot 标记 schema/规则版本和消费位置；恢复先加载一致快照及必要来源，幂等处理后续事件，不重复产生 Timeline。迁移、崩溃恢复及同项目多窗口写入策略须在 Phase 2 前设计验证；未验证前不声称多 writer 安全。

Host 提供 repo 外本地应用存储位置。Storage 不负责推断、进度计算或 UI；阶段新增契约时增量扩展 schema，不提前建全表。

# 21. Suggested Tables

未来实体映射可包括 projects、phases、tasks、sessions、assertions、events、timeline_events、plan_snapshots、source_references、user_corrections、settings。这是需求映射，不是已锁定数据库 schema；Phase 2 只持久化当时已明确的契约。

# 22. Raw Event Retention

默认不持久化完整源代码、原始 edit/command 输出、私有 prompt 或未筛选 agent messages。仅持久化字段 allowlist 下的归一化元数据、最小计划/完成依据及意义事件；引用不要求保存整个 raw payload。

原始传输数据仅用于必要的瞬时解析，不默认写数据库或日志。需要保留的最小依据与来源身份须在清理后仍能解释历史结论。具体 bounded retention/删除期限及验证在 Phase 2/真实采集前决策；当前没有“全保留”或“默认 7 天”的承诺。高级 retention 配置和通用 compaction interface 后置。

# 23. Portable State

默认：

```
Local App Storage
```

用户主动 Export 后：

```
.ai-project/
├─ project.json
├─ plan.json
└─ history/
```

不得默认把：

```
.ai-project/
```

写进用户 Repo。

# 24. Codex Adapter

Codex-specific protocol → normalized observation。被动观察已有 CLI/IDE/app Session 的能力为 **Unverified / Technical Verification Pending**。接入候选是 Plugin/app-server；不存在已证明的 preferred protocol。独立方案见 [Codex observation Spike](docs/spikes/codex-observation-feasibility.md)。

# 25. Codex Plugin Layer

候选职责：读取 lifecycle、plan revisions、Session、task reports 和必要 messages。API、发现/订阅范围和权限须研究并实验验证。不能要求 Agent 维护 Visualizer Task System。Project Progress/Timeline 属于 Core，具体持久化属于 Storage，UI 属于 Surface。

# 26. App-Server Layer

现有文档提及 initialize/initialized/thread/start 旧实验，但本仓库未附可复现实验。找到旧材料时保留并记录版本；旧结果不能替代本次验证。新建受控 Thread 只证明自身会话的协议能力，不证明能观察用户原有 Session。Read/Edit/Command/Test 粒度、重连/history 和 project mapping 均待验证。

# 27. VS Code Extension

VS Code Extension 主要负责：

```
Presentation
Interaction
User correction
Settings
```

不负责复杂业务状态计算。

建议界面：

```
Activity Bar
└─ AI Project Visualizer

Views
├─ Overview
├─ Plan
├─ Timeline
└─ Activity (advanced/P1, capability-dependent)
```

# 28. Overview View

第一屏只回答：

```
Where is my project now?
```

包含：

```
Confirmed Progress
Current Phase
Current Task
Current Task Confidence / Provenance
Recent Plan Change
Why progress?
```

# 29. Plan View

展示：

```
Project
├─ Phase
│  ├─ Task
│  └─ Task
└─ Phase
```

状态图标：

```
○ TODO
▶ IN PROGRESS
◐ COMPLETED
✓ VERIFIED
⚠ BLOCKED
```

# 30. Timeline View

时间顺序：

```
Plan changes
Task changes
Progress changes
User corrections
Important events
```

# 31. Activity View

高级信息：

```
Read
Edit
Command
Test
```

默认不是首页重点。

# 32. Semantic Module

Phase 16 以后按实际需求独立实现；现在不创建 `packages/semantic/`。

核心产品不得依赖它。

默认：

```
disabled
```

Semantic Engine 优先：

```
Rule-based
↓
AI when necessary
```

# 33. Semantic Outputs

例如：

```
createOrder() now runs within a transaction.
```

必须带：

```
Evidence References
```

# 34. Privacy Boundary

Core / Adapter 不应：

- 自动上传项目；
- 建立 Visualizer Cloud Source Repository；
- 把用户代码静默发送到第三方模型。

所有需要语义模型的功能必须明确配置。

# 35. Extension Points

未来：

```
interface AgentAdapter {}

interface PlanSource {}

interface VerificationProvider {}

interface SemanticProvider {}

interface StorageProvider {}
```

这些是未来候选边界，不是现在创建空 interface/package 的要求；Phase 1 只定义实际使用的契约。

# 36. Non-goals

Architecture 不应该为以下功能提前复杂化：

```
Jira
Linear
Team cloud
Agent leaderboard
Token billing
Multi-agent orchestration
```

# 37. Architecture Success Criteria

架构成功不在于：

> 支持最多功能。

而在于：

1. Codex 被替换时 Core 仍然可用；
2. VS Code UI 被替换时 Core 仍然可用；
3. Plan 来源变化时数据模型不崩；
4. 推断与事实可以明确区分；
5. 用户可以纠正 Visualizer；
6. 所有重要进度可以解释；
7. 默认不牺牲项目隐私。

# 38. Core Architecture Statement

整个项目必须始终保持：

```
Agent
  ↓
Adapter
  ↓
Normalized Events
  ↓
Project State Engine
  ↓
Explainable Project State
  ↓
User
```

而不是：

```
Codex
  ↓
Pretty Dashboard
```
