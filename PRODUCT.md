# AI Project Visualizer

> **Make AI coding transparent.**
> **让 AI 黑盒开发过程变透明。**

AI Project Visualizer 是一个面向 AI Coding Agent 的开源项目观察工具。

它不负责指挥 Agent 如何编程，而是持续观察 Agent 的开发过程，自动理解项目计划、阶段、任务与计划变化，并通过实时、可解释的可视化界面回答一个最核心的问题：

> **这个项目现在到底做到哪里了？**

第一阶段主要支持 OpenAI Codex，但核心架构不得与 Codex 强绑定，应允许未来扩展至 Claude Code、OpenCode、Gemini CLI 等其他 AI Coding Agent。

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

例如：

```
Project Progress
57%
```

用户应能够查看：

```
Why 57%?

Phase 1      completed
Phase 2      completed
Phase 3      6 / 10 weighted units completed
Phase 4      not started

Plan expanded:
+ Refresh token
+ Token revocation

Previous progress:
63%

Current:
57%
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

用户安装插件后，理想体验：

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

用户打开 Visualizer 时，应在约 5 秒内理解项目当前状态。

示例：

```
AI PROJECT VISUALIZER

Project
my-app

Confirmed Progress
█████████████░░░░░ 64%

Current Phase
Phase 4 · Authentication

Current Task
▶ JWT Authorization

Estimated Task Progress
~47%

Confidence
91%

Recent
────────────────────────────

18:31  Task started
18:36  Authentication implementation progressed
18:42  Plan changed

       + Refresh Token
       + Token Revocation

18:43  Progress changed
       68% → 64%

       Reason:
       Plan expanded

Plan
────────────────────────────

✓ Phase 1 · Foundation
✓ Phase 2 · Database
✓ Phase 3 · Users
▶ Phase 4 · Authentication
○ Phase 5 · Orders
```

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
Agent discovered session renewal was not covered.

Time
18:42
```

不得仅保留最终结果。

# 13. Progress Model

进度必须分成两层。

## 13.1 Confirmed Project Progress

用于表示可靠、正式的项目整体进度。

根据：

```
Task completion
+
Task weight
```

计算。

例如：

```
Task A weight 1
Task B weight 5
Task C weight 8
```

避免：

```
修改 README
```

和：

```
实现完整认证系统
```

在进度计算中权重相同。

任务权重：

```
AI Initial Estimate
        ↓
User Adjustable
```

# 14. Estimated Task Progress

长时间 Task 不应导致整体 UI 看起来完全停滞。

因此允许：

```
Current Task
Authentication

Estimated Completion
~42%
```

但必须和 Confirmed Progress 明确区分。

例如：

```
Confirmed Project Progress
68%

Estimated Current Task Progress
~42%
```

绝不能把推测结果直接混入确定进度并制造虚假的精确数字。

# 15. Explainable Progress

进度必须可以解释。

例如：

```
Why 68%?

Completed:
✓ Database
✓ User module

Authentication
Weight: 8

Agent-reported completed:
3 / 5 major parts

Remaining:
- Controller integration
- Tests

Estimated current task:
~42%
```

# 16. Progress Regression

项目进度允许倒退。

例如：

```
72%
↓
58%
```

原因：

```
Plan expanded
```

UI 应展示：

```
72% → 58%

Plan expanded:
+ Refresh Token
+ Token Revocation
+ Security tests
```

而不是偷偷把进度改成 58%。

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

Visualizer 的每个关键结论应尽可能记录来源。

建议至少支持：

```
Observed
Agent Reported
Visualizer Inferred
User Confirmed
```

示例：

```
Current Task
Order Authorization

Source:
Visualizer Inferred

Confidence:
65%
```

用户纠正后：

```
Current Task
Order Authorization

Source:
User Confirmed
```

# 19. User Corrections

用户必须能够纠正 Visualizer。

例如：

```
Likely Task
Task 3.2

Confidence
65%
```

用户：

```
Wrong
→ Task 3.4
```

系统：

```
Corrected ✓
```

纠正应：

- 修改当前状态；
- 修正 Timeline；
- 保存此次人工判断；
- 为后续推断提供参考。

Visualizer 不得假设自己的推断永远正确。

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
68% → 64%

Reason
Plan expanded

18:02
Codex reports task complete

Verification
Unknown
```

# 21. Raw Event Retention

底层仍然可以采集：

```
Read
Edit
Search
Command
Test
Turn
Plan
```

但它们属于 Infrastructure。

默认 UI 不应被这些细粒度事件占满。

长期存储策略：

```
Raw events
→ 短期保留 / 压缩

Meaningful project events
→ 长期保留
```

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

第一推荐入口：

```
Codex Plugin
```

负责：

- 监听 Codex 生命周期；
- 获取计划；
- 捕获关键事件；
- 识别当前 Session；
- 向 Project Core 提供事件。

# 30. Codex App-Server

现有 app-server 协议实验不得废弃。

它属于：

```
Research / Spike
```

未来可以成为：

```
codex-adapter/
```

的重要底层能力。

已有：

```
initialize
initialized
thread/start
...
```

等实验应保留。

# 31. VS Code Extension

VS Code Extension 是：

> **最佳图形界面。**

但不是整个产品本体。

整体关系：

```
Codex Plugin
      ↓
Agent Adapter
      ↓
Project Core
      ↓
VS Code Extension
```

即：

```
Codex Plugin = integration
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

默认：

```
Local Plugin Storage
```

不得自动污染用户 repository。

例如不要默认创建：

```
.ai-project/
```

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

v1 必须优先完成以下五项：

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
Raw event storage
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

AI Project Visualizer 最重要的体验不是花哨动画。

而应该是：

用户离开电脑十分钟。

Codex 持续开发。

用户回来。

打开 Visualizer。

看到：

```
Project
████████████░░░░ 64%

Phase 4 · Authentication

Current
JWT Authorization

Estimated
~47%

过去 8 分钟

• Authentication task progressed

• Codex expanded the plan:
  + Refresh Token
  + Token Revocation

• Project progress changed:
  68% → 64%

Reason:
Plan expanded.

• Codex is still working.

Current Task Confidence:
91%
```

用户不需要：

- 翻 Chat；
- 看几十个 Tool Call；
- 检查 Git Diff；
- 阅读全部 Terminal；
- 问 Codex“你刚才做了什么”。

几秒钟就知道：

> **项目现在发生了什么。**

这就是 AI Project Visualizer 的 Magic Moment。

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