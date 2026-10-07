# AI Project Visualizer

> **Make AI coding transparent.**
> **让 AI 黑盒开发过程变透明。**

AI Project Visualizer 是一个面向 AI Coding Agent 的开源项目观察工具。

它不负责指挥 Agent 如何编程，而是持续观察 Agent 的开发过程，自动理解项目计划、阶段、任务与计划变化，并通过实时、可解释的可视化界面回答一个最核心的问题：

> **这个项目现在到底做到哪里了？**

首个 Agent 目标是 OpenAI Codex（Phase 7 集成，当前能力 Unverified），但核心架构不得与 Codex 强绑定，应允许未来扩展至 Claude Code、OpenCode、Gemini CLI 等其他 AI Coding Agent。

# 1. Product Vision

传统 IDE、Git 工具和 AI Coding Agent 能告诉用户：

- 哪些文件被修改；
- 哪些代码发生 Diff；
- Agent 当前执行了什么命令；
- Agent 最终声称自己完成了什么。

但当 AI Agent 持续工作几十分钟甚至数小时后，用户仍然很难快速回答：

- 整个项目做到什么阶段了？
- 当前正在完成哪个任务？
- 当前任务大概做到多少？
- 原计划是否发生了变化？
- 为什么项目进度突然下降？
- Agent 刚才真正完成了什么？
- 哪些结论是确定事实，哪些只是 AI 推断？
- Agent 说完成了，究竟只是“声称完成”，还是已经验证完成？
- 如果我离开电脑十分钟，回来后到底发生了什么？

AI Project Visualizer 的目标，就是补上这一层。

它不是：

- 第二个 AI 编程助手；
- 第二个 Kanban；
- 第二个 Git Diff Viewer；
- 第二个 Codex Chat UI；
- Agent Orchestrator。

它是：

> **AI Agent 与开发者之间的项目状态观察层。**

# 2. North Star Question

所有产品设计必须围绕一个核心问题：

> ## 这个项目现在到底做到哪里了？

任何功能如果不能帮助用户更快、更可信地回答这个问题，都不应轻易进入核心产品。

# 3. Product Positioning

## 3.1 核心定位

AI Project Visualizer 是：

> **Real-time, explainable project visibility for AI coding agents.**

它将 AI Coding Agent 原本分散在：

- Chat；
- Plan；
- Tool Calls；
- 文件修改；
- Git；
- Build；
- Test；
- Session；
- Terminal；

中的信息重建成一个统一的：

```
Project
  ├─ Phase
  │   ├─ Task
  │   └─ Task
  ├─ Phase
  └─ Phase
```

并持续维护这个模型。

# 4. Product Philosophy

## 4.1 Observer, not Orchestrator

Visualizer 的角色是：

```
Agent
  ↓
正常开发
  ↓
Visualizer 观察
  ↓
理解 / 整理 / 展示
```

而不是：

```
Visualizer 分配任务
  ↓
Agent 被迫按照 Visualizer 执行
```

插件不得要求用户为了使用它而彻底改变原有 AI Coding 工作流。

## 4.2 Transparent, not authoritative

Visualizer 必须承认：

> AI 会判断错误，Visualizer 自己也会判断错误。

因此系统不得把推断伪装成事实。

所有重要状态都应尽可能拥有明确的数据来源。

## 4.3 Local-first

默认：

- 不建立 Visualizer 自己的源代码云端仓库；
- 不默认上传整个项目源代码；
- 不默认向项目目录写入 Visualizer 私有状态文件；
- 项目观察数据优先保存在本地。

目标：

> **Local-first by default, portable by choice.**

## 4.4 Privacy-first

隐私是核心产品原则，而不是后期补充功能。

Visualizer 应尽可能：

1. 使用本地规则处理可以确定的信息；
2. 使用已有 Agent 上下文处理 AI 语义任务；
3. 只有必要时才使用模型进行语义推断；
4. 避免把完整项目源代码发送到 Visualizer 自己控制的第三方云端；
5. 明确告诉用户哪些能力需要 AI 语义分析。

## 4.5 Explainable

重要结论应该能够回答：

> **Why?**

与 Acceptance Scenario 13 相同的计划扩张示例：完成权重保持 32，总正式权重由 45 增至 50。

```
Project Progress
64%
```

用户应能够查看：

```
Why 64%?

Completed Weight: 32
Previous Total Confirmed Weight: 45
Current Total Confirmed Weight: 50

Plan expanded:
+ Refresh Token (weight 3)
+ Token Revocation (weight 2)

Previous progress:
32 / 45 = 71.1%

Current:
32 / 50 = 64%
71.1% → 64%
```

# 5. Target Users

第一阶段主要目标用户：

- 使用 Codex 进行中大型项目开发的个人开发者；
- 经常让 Agent 连续工作较长时间的开发者；
- 使用 Plan Mode / TODO / 分阶段开发的用户；
- 希望知道 AI “现在到底做到哪”的用户；
- 不希望持续盯着 Agent 输出的用户；
- 希望保留 AI 项目开发历史的用户。

第一阶段不重点服务：

- 传统纯手工编码；
- 项目经理型团队管理；
- 企业 Jira 替代；
- Agent Benchmark；
- Token 成本分析。

# 6. Core User Experience

目标体验（接入可行性仍待 D-038 Spike 验证，不是当前已实现行为）：

```
Install
  ↓
打开项目
  ↓
Visualizer 自动识别项目
  ↓
检测 Codex Session
  ↓
捕获 Codex Plan
  ↓
生成 Project / Phase / Task 模型
  ↓
Codex 正常开发
  ↓
Visualizer 持续更新项目状态
```

用户无需首先执行复杂初始化。

## 6.1 Zero-config first

默认应尽可能做到：

```
Install
→ Open Project
→ Work with Codex
→ Visualizer starts observing
```

高级用户之后可以配置。

# 7. Primary UI

v0.1 Overview 应在约 5 秒内让用户理解当前状态（人工验收目标，尚未验证）：

```text
Project: my-app
Confirmed Project Progress: 64%   [Why 64%?]
Current Phase: Authentication
Likely Current Task: JWT Authorization
Current Task Confidence: 65% (association rule score)
Source: Visualizer Inferred
Recent Plan Change: + Refresh Token (3), + Token Revocation (2)
Progress: 71.1% → 64%   Reason: Plan expanded
```

此例 completed weight=32，扩张前 total=45，扩张后 total=50。Current Task Confidence 不是完成比例。v0.1 不显示 Estimated Task Progress 数字或占位；无依据则显示未知/暂无计划。Plan 中 ◐ 表示 Agent 报告完成，✓ 只表示有独立验证依据。

# 8. Core Model

Visualizer 的内部核心模型应围绕：

```
Project
├─ Phase[]
├─ Task[]
├─ PlanSource[]
├─ Activity[]
├─ Timeline[]
├─ Evidence[]
└─ UserCorrection[]
```

Agent 只是数据源之一。

Core 不得设计成：

```
CodexEvent → UI
```

应设计成：

```
Agent Adapter
      ↓
Normalized Events
      ↓
Project State Engine
      ↓
Project State
      ↓
UI / CLI / Other Surfaces
```

# 9. Project Hierarchy

第一阶段保持：

```
Project
  ↓
Phase
  ↓
Task
```

不强制继续细分成大量：

```
Subtask
Checkpoint
Microtask
```

原因：

过度拆解可能产生：

- 虚假的进度精度；
- 过重的计划管理；
- UI 噪声；
- Visualizer 从 Observer 演变为 Project Manager。

# 10. Plan Capture

Visualizer 应自动捕获 Agent 的正式开发计划。

计划条目分为三种语义状态：

```
Confirmed
Tentative
Idea
```

## Confirmed

Agent 已明确纳入执行计划。

## Tentative

可能执行，但尚未确定。

## Idea

讨论中出现的想法，但不能直接算正式项目任务。

# 11. Multiple Plan Sources

未来项目可能同时存在：

```
Codex active plan
PLAN.md
TODO.md
PROJECT.md
AGENTS.md
User corrections
```

Visualizer 不应偷偷选择其中一个然后把其他来源覆盖掉。

应维护：

```
Unified Project View
```

同时保留来源。

例如：

```
Task
Authentication

Status:
In Progress

Source:
Codex Active Plan

PLAN.md:
Planned

TODO.md:
Marked Done

Conflict:
Detected
```

# 12. Plan Evolution

开发计划不是静态文件。

Visualizer 必须记录：

```
Original Plan
      ↓
Plan Change
      ↓
Current Plan
```

例如：

```
Phase 4 · Authentication

Original
- Login
- JWT

Changed
+ Refresh Token
+ Token Revocation

Reason
Agent Reported: session renewal was not covered.
（来源未提供原因时保留缺失，不编造）

Time
18:42
```

不得仅保留最终结果。

# 13. Progress Model

Confirmed Project Progress = 当前 Confirmed Tasks 中有可靠完成依据的 COMPLETED / VERIFIED weight 总和 ÷ 当前 Confirmed Tasks 的有效 weight 总和。二者各保留完成声明/独立验证依据；普通自动推断没有可靠完成依据不能计入分子。Confirmed 表示正式计划上的完成记录，不保证所有工作已独立验证（D-035）。

Phase weight 仅汇总任务权重，不作第二次乘数。无正式计划、零分母或正式任务权重缺失/无效时显示 unavailable 和原因，不能丢弃未知任务制造数字。进度变化保留前后值、公式、task/status/weight 来源及 plan revision。

权重可来自明确来源估计并由用户调整；Core 不要求 LLM。无来源权重的确定性默认政策在 Phase 4 前另行批准/验证，不预设永久全 1。v0.1 必须允许编辑 Task Weight，并解释对进度的影响。

数值估算与正式进度永远分离；数值估算不属于 v0.1。

# 14. Estimated Task Progress

**Phase 13 后续功能；v0.1 不实现。** D-011 保留分离原则，D-034 明确发布时机。

后续可以展示 Estimated Current Task ~42%（Phase 13 独立任务估算示例，非 Scenario 13 的计划扩张进度），但必须与 Confirmed Project Progress、association confidence 分开，单独记录 estimate confidence、来源和解释。不得混入正式进度。v0.1 长任务期间进度可暂时不变，当前任务、关联 Confidence 和最近意义事件仍可更新。

# 15. Explainable Progress

v0.1 支持 Why X%：展示 Completed Weight / Total Confirmed Weight、完成和剩余任务、各任务状态/权重依据、近期变化及原因、plan revision。

例如 32/50=64%，其中每条完成任务注明 Agent Reported COMPLETED 或独立证据支持的 VERIFIED。正在进行任务不按部分完成量进入分子；Agent 提及“3/5 parts”可作为来源声明，但不能偷偷算作整体部分完成百分比。

# 16. Progress Regression

项目进度允许倒退。

独立示例（非 Scenario 13）：完成权重为 18，总权重 25→31，新增三项任务各 weight 2。

```
72%
↓
58.1%
```

原因：

```
Plan expanded
```

UI 应展示：

```
72% → 58.1%

Plan expanded:
+ Refresh Token (weight 2)
+ Token Revocation (weight 2)
+ Security tests (weight 2)
```

18/25=72%，18/31 显示为 58.1%；不能静默把进度改成 58.1%。

# 17. Task Status

建议支持：

```
TODO
IN_PROGRESS
COMPLETED
VERIFIED
BLOCKED
```

其中：

## COMPLETED

Agent 声称任务已经完成。

例如：

```
◐ COMPLETED

Reported by:
Codex

Verification:
Unknown
```

## VERIFIED

未来 Verification Engine 确认：

```
✓ VERIFIED
```

例如：

```
Build passed
Tests passed
Expected files changed
```

# 18. Provenance Model

重要结论必须分别记录 Observed / Agent Reported / Visualizer Inferred / User Confirmed 来源。Status、certainty、weight、Current Task association、Current Phase derivation 和进度解释拥有独立依据，不能用一个 Task.provenance 覆盖所有字段。

保留来源身份、event/revision、时间、依据引用；当前解释不覆盖原断言。推断附 association Confidence 和规则依据；人工纠正附 correction 引用，不冒充算法 100%。“观察到 Agent 声明完成”不是“实现已独立验证”。契约见 ARCHITECTURE §5–10。

# 19. User Corrections

v0.1 允许 Correct Current Task / Task Association / Task Weight。普通推断服从有效人工纠正；普通文件活动、新 Turn、重启和时间流逝不直接覆盖它。

有效范围及失效规则按 D-037 / ARCHITECTURE §19：Current Task 在指定 Session 当前工作上下文生效，只能由后续人工选择、可可靠识别的较新显式源任务选择、明确 Session 结束或目标被完整计划明确移除结束。历史关联限定具体 event 集合；权重限定同一稳定 task 当前计划成员。

失效须追加原因、规则、依据事件和时间记录；断连仅标最后确认/当前未知。保留原观察和判断，Timeline 展示带纠正说明的解释，不能删除历史。关联纠正不修改任务完成声明/verification 来源；重启保留有效纠正。

# 20. Development Timeline

Timeline 是 v1 核心能力。

它不应该只是：

```
Read file
Edit file
Read file
Edit file
```

而应记录具有项目意义的事件：

```
Task started
Task changed
Task completed
Phase completed
Plan changed
Progress changed
User correction
Build failed
Important verification result
```

示例：

```
October 6

17:31
Authentication task started

17:42
Plan changed

+ Refresh Token
+ Token Revocation

17:43
Progress
71.1% → 64%

Reason
Plan expanded

18:02
Codex reports task complete

Verification
Unknown
```

# 21. Raw Event Retention

底层观察为 inference/evidence 提供元数据，默认不持久化完整源码、raw command/edit 输出或私有 prompt/messages。归一化不自动意味着可安全保存；按字段 allowlist 保留最小来源/完成依据及长期意义事件。

原始传输内容只作必要瞬时解析。具体 bounded retention/删除期限在 Phase 2/采集前决定并验证；当前不承诺全保留或默认 7 天，不提前建立通用 retention 框架。历史结论及纠正的最小依据不得因 raw 清理丢失。

# 22. Live Activity

原始 Codex Activity 不是 v1 的核心 UI，但底层必须支持。

例如：

```
Read
Edit
Run
Test
Search
```

未来可以作为：

```
Advanced / Activity Details
```

展开查看。

# 23. Rolling Summary

未来的重要增强能力。

不是任务结束后的传统总结，而是：

> **任务执行过程中的实时语义摘要。**

更新应采用：

```
Event-driven
```

而不是固定：

```
Every 30 seconds
```

可触发事件：

```
Task changed
Plan changed
Group of edits completed
Test status changed
Build failed
Agent encountered error
Agent recovered from error
```

# 24. Semantic Analysis

Semantic Analysis：

```
OFF by default
```

用户可以主动开启。

原因：

- 并非所有人需要；
- 可能产生额外 AI 调用；
- 存在误判；
- 涉及隐私；
- 核心 Visualizer 不应依赖它才能运行。

# 25. Semantic Code Changes

开启后，不能只告诉用户：

```
OrderService.java changed
```

而应说明：

```
createOrder() 增加了事务边界。

订单和订单项写入现在处于同一事务中。

如果中途抛出运行时异常，
数据库修改将一起回滚。
```

避免泛化成：

```
修改了订单创建逻辑。
```

# 26. Semantic Evidence

Semantic Analysis 必须支持：

```
Why?
```

例如：

```
Claim

createOrder() now runs inside a transaction.

Based on:

OrderService.java
@Transactional added to createOrder()

OrderMapper.insert(...)
OrderItemMapper.insert(...)
```

避免无法追溯的 AI 结论。

# 27. Attention Signals

未来可以支持轻量提示，例如：

```
Agent reports DONE
but
2 tests are still failing
```

或者：

```
Plan changed significantly
```

或者：

```
Repeated build failures
```

但原则是：

> Inform, not interrupt.

不能变成告警中心。

# 28. Codex Integration

第一版：

```
Primary Agent
Codex
```

但 Core 不得使用大量 Codex-specific 数据结构。

应建立：

```
AgentAdapter
```

例如：

```
AgentAdapter
├─ CodexAdapter
├─ ClaudeCodeAdapter     future
├─ OpenCodeAdapter       future
└─ GeminiAdapter         future
```

# 29. Codex Plugin

Plugin 是接入候选，lifecycle/Session/plan/status/message 读取能力与订阅权限均 **Unverified**，不视为已经可用的推荐协议。依照 D-038 的独立 Spike 选择支持路径；不能强迫 Agent 更新 Visualizer 私有 Task System。

# 30. Codex App-Server

app-server 也是接入候选，被动观察已有 CLI/IDE/app Session 的能力为 **Unverified / Technical Verification Pending**。旧文档提及 initialize/initialized/thread/start 实验，但本仓库没有附可复现材料；找到后保留版本和限制，不当作当前通过证据。

创建自有 Thread 不证明能观察原工作流。具体计划、Activity 粒度和恢复能力按 [独立 Spike](docs/spikes/codex-observation-feasibility.md) 验证；本轮仅制定方案，未执行。

# 31. VS Code Extension

VS Code Extension 是：

> **最佳图形界面。**

但不是整个产品本体。

整体关系：

```
Codex integration source (Unverified)
      ↓
Agent Adapter
      ↓
Project Core
      ↓
VS Code Extension
```

即：

```
Codex integration source (candidate) = integration
Project Core = brain
VS Code Extension = visual surface
```

# 32. Other Surfaces

未来 Core 可以同时服务：

```
VS Code
CLI
Web Dashboard
JetBrains
Other IDEs
```

但 v1 不需要一次全部完成。

# 33. Storage

默认 repo 外 Local App Storage。Host 提供位置，Storage 负责持久化/事务/迁移并依赖 Core 契约，Core 不依赖数据库/插件 API。恢复必须保留来源、计划历史和纠正；不能只有最后一个状态数字。SQLite driver 和打包仍待验证。

不得默认创建 .ai-project/；Export 在 Phase 18，经用户主动操作。

# 34. Portable Project State

高级用户未来可以主动：

```
Export Project State
```

生成：

```
.ai-project/
```

从而实现：

- 多设备迁移；
- Git 管理；
- 项目共享；
- 状态备份。

原则：

> Local-first by default. Portable by choice.

# 35. Multi-session

Core 架构应允许：

```
Session A
Backend

Session B
Frontend
```

同时存在。

但 v1 UI：

> 优先保证单 active session 极好用。

不能为了早期支持复杂多 Agent / 多 Session 导致整个模型失控。

# 36. Open Source

AI Project Visualizer 定位为：

> **Open-source developer tool**

建议核心部分公开：

```
Core
Codex Adapter
VS Code Extension
```

原因：

- 开发者需要信任代码；
- 项目涉及源代码观察；
- 项目强调 Privacy-first；
- 开源更有利于生态扩展 Agent Adapter；
- 更容易获得开发者社区认可。

License 后续单独决定。

# 37. v1 Core Features

以下是 v1 目标；其中数值任务估算在 Phase 13，不能当作 v0.1 必须项：

## A. Automatic Codex Plan Capture

自动识别并建立：

```
Project
Phase
Task
```

## B. Real-time Project / Phase / Task Progress

展示：

```
Current Phase
Current Task
Confirmed Progress
Estimated Task Progress
```

## H. Plan Change History

记录：

```
计划新增
删除
调整
状态变化
```

以及：

```
Reason
Timestamp
Source
```

## I. Development Timeline

建立：

```
整个项目开发过程的可浏览时间线。
```

## J. User Corrections

允许用户修正：

```
Current Task
Task association
Task weight
Visualizer inference
```

# 38. v1 Infrastructure

虽然不是一级产品 Feature，但 v1 底层应具备：

```
Codex event collection
Event normalization
Local project state
Plan source tracking
Basic confidence model
Minimal normalized observation/evidence storage（不默认保存 raw transport payload）
Timeline generation
```

# 39. Explicitly Not v1

以下功能不得因为“看起来很酷”而拖慢 v1：

```
Token cost tracking

Agent performance leaderboard

Team collaboration

Cloud synchronization

Jira integration

Linear integration

GitHub Issues synchronization

Multi-agent orchestration

Complex automatic project management

Automatic agent task assignment

Enterprise project management

Advanced test verification center

Full semantic analysis by default
```

# 40. Product Decision Filter

任何未来功能进入 Roadmap 前，必须回答：

> **它是否让 AI 黑盒开发过程更加透明？**

以及：

> **它是否帮助用户更快、更可信地知道项目做到哪里了？**

如果两个答案都是否：

> 不应进入核心产品。

# 41. The Magic Moment

v0.1：用户离开十分钟，Codex 按正常流程工作；回来后约 5 秒理解 Project 状态、Current Phase/Task、关联 Confidence/Provenance、最近完成声明、计划扩张及进度原因，不必翻 Chat/Terminal/Diff。

独立示例（非 Scenario 13），对应 Acceptance Scenario 30：28/40=70%；JWT weight 4 获可靠 Agent 完成声明后 32/40=80%；新增 Confirmed weight 10 后 32/50=64%。分别记录 70% → 80% → 64% 及原因，不能把全部变化归为单一扩张。

不依赖数值任务估算、LLM summary 或高级 Since Last Viewed。真实观察与人工 UX 验收尚未执行。

# 42. Brand Direction

产品名暂定：

# AI Project Visualizer

第一版强调：

> Real-time project visibility for Codex.

而不是直接把 Codex 写入产品品牌。

原因：

核心理念可以自然扩展到其他 Agent。

# 43. README Hero

建议首页第一屏：

# AI Project Visualizer

**Make AI coding transparent.**

See where your project is, what your coding agent is working on, and how the plan evolves — in real time.

中文：

> **让 AI 黑盒开发过程变透明。**
>
> 实时了解项目做到哪里、AI Agent 正在处理什么，以及开发计划如何演变。

# 44. Long-term Direction

长期目标不是成为另一个 AI Coding Agent。

而是成为：

> **AI Coding 时代的项目状态观察层。**

理想状态：

```
Codex
Claude Code
OpenCode
Gemini CLI
Other Agents
       ↓
AI Project Visualizer
       ↓
Unified Project State
       ↓
Developer
```

Agent 可以不断变化。

IDE 可以不断变化。

模型可以不断变化。

Visualizer 始终负责一个问题：

> **让开发者知道 AI 到底把项目做到了哪里。**
