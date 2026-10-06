# 第六步：竞争产品研究与差异化定位

> 调研快照：2026-10-06

# 1. 这一阶段的目标

经过前五步，我们已经确定：

```
产品定位
↓
技术架构
↓
重大决策
↓
UX
↓
v0.1 验收标准
```

最后还需要回答：

> **市场为什么还需要这个产品？**

因为现在 AI Coding 工具生态已经非常拥挤。

已经存在大量：

- Agent Dashboard；
- Agent Kanban；
- Multi-Agent Orchestrator；
- Codex / Claude Code Monitor；
- Git Diff Viewer；
- Plan Dashboard；
- Token / Cost Dashboard；
- AI Project Manager。

如果 AI Project Visualizer 最终只是：

```
显示 Agent 正在工作
+
显示任务列表
+
显示进度条
```

那么很难形成真正的产品辨识度。

# 2. 竞争产品应该怎么分类

不要只寻找：

> “和我们一模一样的项目。”

更合理的是把竞争环境分成五类。

```
A. Agent 自带 UI
B. Agent Activity Monitor
C. Plan / Progress Dashboard
D. AI Project / Task Manager
E. Multi-Agent Orchestrator
```

AI Project Visualizer 与它们都会发生局部重叠。

# 3. 第一类：Agent 自带 UI

最直接的竞争对象其实不是第三方项目。

而是：

> **Codex 自己。**

OpenAI 官方 Codex VS Code Extension 已经支持在 IDE 中和 Codex 对话、编辑代码、查看修改，并且可以把较大的任务委托到云端后继续追踪进度和检查结果。

因此下面这些不能成为我们的核心卖点：

```
“可以看到 Codex”

“可以看到 Agent 正在执行”

“可以查看文件修改”

“可以跟踪 Codex Task”

“可以在 VS Code 中使用”
```

Codex 自己已经能完成其中很多事情。

# 4. 第二类：Agent Activity Monitor

这类工具主要回答：

> **Agent 现在正在干什么？**

例如 Claude Hub。

Claude Hub 可以在 VS Code 中监控 Claude Code Session，展示实时状态、Todo、Task、Subagent、Tool Activity、Token、Cost 等信息。

它擅长：

```
Session
Tool Activity
Todo
Agent状态
Token
Context
```

这是非常典型的：

> **Agent-centric View**

核心对象是：

```
Agent Session
```

而不是：

```
Project State
```

# 5. 第三类：Plan / Progress Dashboard

这里出现了一个非常值得认真研究的项目：

## Ralph Dashboard

Ralph Dashboard 已经能够：

- 读取 implementation plan；
- 显示 Phase Progress；
- 显示 Task Board；
- 显示任务完成情况；
- 显示 Git Diff；
- 显示测试状态；
- 显示历史 iteration；
- 显示实时 Agent 输出。

这一点必须认真面对。

因为这意味着：

> **“Phase + Task + Progress + Agent Activity”本身已经不是独特创新。**

Ralph Dashboard 甚至已经拥有：

```
Phase Progress Bars
Task Progress
Iteration Timeline
Git History
Diff Viewer
Tests
```

这说明我们绝对不能把：

> “我们能展示 Phase 和进度条。”

当成产品核心差异。

# 6. 第四类：AI Project / Task Manager

一个非常接近的案例是：

## AI Project Board

它是一个 Local-first 的 MCP Task Board，可以协调 Claude Code 和 Codex Agent。

它具有：

- Task；
- Dependencies；
- Blocker；
- Agent Claim；
- 实时 Dashboard；
- Evidence-backed Completion。

尤其值得关注的是：

> 它已经意识到了“Agent 说 Done 不代表真的 Done”。

AI Project Board 会要求完成 Evidence，例如测试和 Commit 信息。

所以我们的：

```
COMPLETED
≠
VERIFIED
```

思想也不能单独作为独家卖点。

这是一个很好的方向，但别人已经有类似意识。

# 7. 第五类：Multi-Agent Orchestrator

目前这一类非常多。

例如：

## Stoneforge

Stoneforge 面向同时运行多个 AI Coding Agent 的开发者。

它拥有：

```
Director
Workers
Stewards
Task System
Plans
Agent Management
Merge Requests
Workflows
Live Terminal
```

它甚至试图把：

```
Linear
Notion
Slack
Git workflow
```

统一进一套 Agent-first Project Management Platform。

核心思想明显是：

> **Orchestrate Agents**

而不是：

> Observe Agents。

还有：

## agent-tasks

它提供：

```
backlog
spec
plan
implement
test
review
done
```

阶段 Pipeline，同时支持 Dependency、Approval、Artifact 和实时 Kanban。

还有：

## Mission Control

它重点覆盖：

- Agent Management；
- Kanban；
- Real-time Monitoring；
- Cost；
- Tokens；
- Pipelines；
- Logs；
- Background Automation。

这类工具越来越像：

> **AI Agent Control Plane**

# 8. 一个非常值得研究的邻近项目：Pavilio

Pavilio 的理念和我们有部分相似：

> Local-first、Agent-agnostic、Open Source。

它提供：

- 多项目 Dashboard；
- Agent Monitor；
- Project Markdown；
- Git Panel；
- 文件浏览；
- 实时更新。

而且它甚至已经形成：

```
Grill
→ Plan
→ Execute
→ Session End
```

这样的开发工作流。

但是它更像：

> **AI Development Workspace**

而 AI Project Visualizer 不能变成一个巨大的 Workspace。

# 9. 另一个接近方向：Agent Track Dashboard

Agent Track Dashboard 可以：

- 实时跟踪 AI Agent；
- 自动创建 Project Board；
- Task 更新；
- Code Diff；
- File Changes；
- Progress；
- MCP 同步。

也就是说：

```
实时
+
Task
+
Diff
+
Progress
```

这个组合同样已经有人在做。

# 10. 市场已经证明了什么

从这些项目可以确认一个很重要的事实：

> **AI Coding 可视化不是伪需求。**

开发者已经在不断构建：

```
Dashboard
Task Board
Agent Activity
Plan Progress
Timeline
Diff
Verification
```

说明用户确实需要：

> “AI 到底在干什么？”

但是市场现在大量产品的答案主要集中在两个方向。

# 11. 主流方向一：Agent-centric

核心问题：

> Agent 现在在干什么？

典型界面：

```
Agent A
Working

Agent B
Idle

Agent C
Testing
```

或者：

```
Read
Edit
Run
Test
```

核心实体：

```
Agent
Session
Tool Call
```

# 12. 主流方向二：Task-centric

核心问题：

> Agent 应该做什么任务？

典型：

```
TODO
IN PROGRESS
REVIEW
DONE
```

核心实体：

```
Task
Dependency
Assignment
Agent
```

这类产品往往逐渐走向：

> Orchestration。

# 13. AI Project Visualizer 应该占第三个位置

我们不应该主打：

```
Agent-centric
```

也不应该主打：

```
Task-manager-centric
```

而应该占：

# Project-state-centric

核心对象是：

```
Project
```

核心问题：

> **这个项目现在到底做到哪里了？**

# 14. 三种产品哲学对比

```
Agent Monitor

Agent
 ↓
Session
 ↓
Activity
```

回答：

> AI 正在干什么？

```
Agent Project Manager

Task
 ↓
Assign
 ↓
Agent
 ↓
Completion
```

回答：

> AI 应该做什么？

AI Project Visualizer：

```
Plan
  +
Agent Activity
  +
History
  +
Evidence
       ↓
Unified Project State
       ↓
Developer
```

回答：

> **AI 已经把整个项目推进到了哪里？**

# 15. 我们真正值得坚持的差异一：自动重建 Project State

不是简单展示 Agent 原始 Plan。

而是：

```
Codex Plan
+
Plan Changes
+
Task Status
+
User Corrections
+
Agent Activity
+
Future Evidence
       ↓
Unified Project State
```

用户不需要维护第二套 Task Board。

这非常重要。

# 16. 差异二：Observer，不要求 Agent 为我们工作

很多现有 Project Manager / Kanban 工具采用：

```
我们的 Task System
      ↓
MCP
      ↓
Agent 必须更新 Task
```

Visualizer 应该反过来：

```
Agent 正常工作
      ↓
Visualizer 观察
      ↓
自动理解
```

也就是：

> **Low-friction Observation**

这可能成为非常重要的产品体验。

# 17. 差异三：Plan Evolution 是一级概念

普通工具通常展示：

```
Current Plan
```

Visualizer 应该强调：

```
Original Plan
      ↓
Plan Change
      ↓
Current Plan
```

例如：

```
Authentication

Before
├─ Login
└─ JWT

After
├─ Login
├─ JWT
├─ Refresh Token
└─ Token Revocation

Progress
68% → 64%

Reason
Plan expanded
```

重点不只是：

> 现在有哪些任务。

而是：

> **AI 对项目的理解是怎样变化的。**

# 18. 差异四：Explainable Progress

大量 Dashboard 会显示：

```
72%
```

但：

> 为什么是 72%？

往往不知道。

Visualizer 应该把：

```
Why 72%?
```

变成核心交互。

例如：

```
Completed Weight
36

Total Confirmed Weight
50

36 / 50 = 72%

Recent change
+ Token Revocation

Previous Progress
78%
```

# 19. 差异五：确定进度与估算进度分离

这是我们之前讨论出来非常重要的设计。

其他产品很容易显示：

```
Progress
67%
```

但这个 67% 可能同时混合：

- 已完成任务；
- Agent 自己估算；
- AI 猜测。

Visualizer 应该明确：

```
Confirmed Project Progress
64%

Estimated Current Task
~47%

Confidence
73%
```

这实际上是一种：

> **Epistemic UX**

也就是：

> 界面告诉用户，我们到底“知道什么”，又“只是猜什么”。

# 20. 差异六：Provenance

同样的数据应该标记：

```
Observed

Agent Reported

Visualizer Inferred

User Confirmed
```

例如：

```
Task
JWT Authorization

Status
COMPLETED

Source
Agent Reported
```

和：

```
Tests
8 passed

Source
Observed
```

是不同层级的信息。

这可以成为 Visualizer 非常鲜明的可信度设计。

# 21. 差异七：User-correctable AI

很多 AI 产品的逻辑是：

> AI 给出答案。

用户只能接受。

Visualizer 应该允许：

```
Likely Task
JWT

Confidence 55%

[Correct]
```

用户：

```
Actually:
Refresh Token
```

之后：

```
Source
User Confirmed
```

也就是说：

> **Visualizer 允许开发者纠正它对项目的理解。**

# 22. 差异八：项目开发历史，而不是 Agent Log

普通 Monitor：

```
Read A
Edit B
Run test
Read C
```

Visualizer Timeline：

```
Authentication Started

Plan Expanded

Progress
68% → 64%

JWT Completed

Refresh Token Started
```

目标是：

> **从 Agent Operations 还原 Project History。**

# 23. 差异九：Magic Moment

Visualizer 最强 Demo 不应该是：

> “看，我们能看到 Agent 实时调用工具。”

别人已经有。

真正的 Demo 应该是：

```
用户离开 10 分钟
↓
Codex 持续开发
↓
用户回来
↓
打开 Visualizer
```

看到：

```
Project
64%

Phase
Authentication

Current Task
Refresh Token

Since you left

✓ JWT completed

Plan expanded
+ Refresh Token
+ Token Revocation

Progress
68% → 64%

Reason
Plan expanded
```

用户：

> “我根本没看 Codex 输出，但我已经知道刚才发生什么了。”

这个才是产品的 Magic Moment。

# 24. 竞争矩阵

下面是最重要的比较。

| 能力                      | Codex UI  | Claude Hub  | Ralph Dashboard | AI Project Board | Multi-Agent Orchestrator | AI Project Visualizer |
| ------------------------- | --------- | ----------- | --------------- | ---------------- | ------------------------ | --------------------- |
| Agent 实时活动            | ✓         | ✓           | ✓               | ✓                | ✓                        | ✓                     |
| Plan / Task               | ✓         | ✓           | ✓               | ✓                | ✓                        | ✓                     |
| 项目整体进度              | 部分      | 部分        | ✓               | ✓                | ✓                        | **✓**                 |
| 自动观察现有 Agent 工作流 | ✓         | ✓           | 部分            | 较弱             | 较弱                     | **核心**              |
| 不要求自己的任务系统      | ✓         | ✓           | 部分            | ✗                | ✗                        | **✓**                 |
| Plan Evolution History    | 有限      | 有限        | 部分            | 部分             | 部分                     | **核心**              |
| Explainable Progress      | 有限      | 有限        | 有限            | 有限             | 有限                     | **核心**              |
| Confirmed vs Estimated    | 有限      | 有限        | 有限            | 有限             | 有限                     | **核心**              |
| Provenance                | 有限      | 有限        | 有限            | 部分             | 有限                     | **核心**              |
| 用户纠正 AI 项目理解      | 很弱      | 很弱        | 很弱            | 有限             | 有限                     | **核心**              |
| 项目意义 Timeline         | 有限      | Session为主 | Iteration为主   | Task为主         | Agent/Task为主           | **核心**              |
| Agent Orchestration       | Codex自身 | ✗           | 部分            | ✓                | ✓✓                       | **明确不做**          |
| Token / Cost              | 可能      | ✓           | ✓               | 部分             | ✓                        | **明确不做核心**      |

这里很多“有限/部分”意味着能力边界会随着这些项目继续发展，因此不能把矩阵理解成永久结论。

真正重要的是我们选择的**产品哲学组合**。

# 25. 什么不能再当我们的卖点

经过调研，下面这些绝对不能作为 README 第一卖点：

## “实时监控 Agent”

已经太普遍。

## “看 Task”

太普遍。

## “看 Plan”

已经大量出现。

## “看代码 Diff”

GitLens、Agent Dashboard、Ralph 等已经解决。

## “看测试状态”

也已经有很多工具做。

## “Local-first”

是重要原则。

但已经有 Pavilio、AI Project Board 等项目同样强调 Local-first。

所以：

> Local-first 是 Trust Feature，不是唯一差异化。

# 26. 我们不应该进入哪些竞争战场

## 不和 Agent Orchestrator 比谁能管理更多 Agent

否则我们会被带向：

```
Agent Pool
Worker
Director
Scheduler
Queue
Task Assignment
Merge Pipeline
```

这不是产品使命。

## 不和 GitLens 比 Diff

GitLens 类工具在 Git / Diff / Blame 上天然更强。

我们只引用相关 Evidence。

## 不和 Jira / Linear 比 Task Management

我们没有必要：

```
Sprint
Story Point
Assignee
Due Date
Team
Comment
```

全部复制。

## 不和 Token Dashboard 比统计

Token / Cost 已经有大量工具。

而且这不是：

> AI 黑盒开发透明度

的核心。

# 27. 我们真正的竞争定位

最终可以浓缩成：

> **Most AI coding dashboards show what the agent is doing.**
>
> **AI Project Visualizer shows what is happening to the project.**

中文版：

> **大多数 AI 编程 Dashboard 展示 Agent 正在做什么。**
>
> **AI Project Visualizer 展示的是：整个项目正在发生什么。**

这一句非常重要。

# 28. 更完整的定位

```
Agent tools expose activity.

Project managers expose tasks.

AI Project Visualizer reconstructs project state.
```

中文：

> Agent 工具展示活动。
>
> 项目管理工具展示任务。
>
> **AI Project Visualizer 重建项目状态。**

# 29. Product Category

我们甚至不一定要把自己描述成：

```
AI Agent Dashboard
```

因为这个类别容易让用户想到：

```
Logs
Sessions
Tokens
Agents
```

更准确的类别可以是：

> **AI Coding Project Observer**

或者：

> **AI Project State Visualizer**

长期甚至可以形成：

> **Project Intelligence Layer for AI Coding Agents**

但第一阶段不要过度创造术语。

# 30. README 第一屏建议

以后 README Hero 可以逐渐发展成：

```
# AI Project Visualizer

Make AI coding transparent.

Most AI coding tools tell you what the agent is doing.

AI Project Visualizer tells you where your project actually is.

See:

- current phase
- current task
- confirmed progress
- estimated progress
- plan evolution
- development timeline
- why the project is at that progress

without constantly watching your coding agent.
```

# 31. 中文版本

```
# AI Project Visualizer

让 AI 黑盒开发过程变透明。

大多数 AI Coding 工具告诉你：

“Agent 正在做什么？”

AI Project Visualizer 更关心：

“整个项目现在到底做到哪里了？”

实时查看：

- 当前 Phase
- 当前 Task
- Confirmed Progress
- Estimated Progress
- Plan 如何变化
- 项目开发时间线
- 为什么当前进度是这个数字

无需一直盯着 AI Agent 工作。
```

# 32. v0.1 因竞争研究需要特别坚持什么

经过竞争分析，v0.1 不能只是：

```
Plan Tree
+
Progress Bar
+
Agent Activity
```

否则太普通。

至少必须把下面四个体验做到明显：

## 1. Explainable Progress

```
Why 64%?
```

## 2. Plan Evolution

```
Before
→
After
```

## 3. Provenance + Confidence

```
Visualizer Inferred
65%
```

## 4. User Correction

```
Wrong?
Correct it.
```

否则很难真正体现产品哲学。

# 33. 一个竞争风险：别人完全可以复制我们的功能

这一点必须承认。

像：

```
Why progress?
Plan history
Confidence
```

单个 Feature 并没有很高技术壁垒。

真正的壁垒应该逐渐来自：

```
不同 Agent 的事件归一化能力
+
稳定的 Project State Model
+
可靠的 Plan Reconstruction
+
Progress Model
+
Project History
+
Inference / Correction feedback
+
优秀 UX
```

也就是说：

> **护城河不是某一个按钮，而是 Project State Engine。**

# 34. 技术护城河应该是什么

长期最有价值的东西可能不是 VS Code UI。

而是：

```
Agent Events
      ↓
Normalization
      ↓
Plan Understanding
      ↓
Project State Reconstruction
      ↓
Explainable Progress
```

如果这套东西做得足够可靠，那么未来：

```
VS Code
CLI
JetBrains
Web
```

只是不同 Surface。

# 35. Community 护城河

我们又确定了：

> Open Source。

那么另一个长期优势可以来自：

```
Agent Adapter Ecosystem
```

例如社区贡献：

```
Codex Adapter
Claude Code Adapter
OpenCode Adapter
Gemini CLI Adapter
Aider Adapter
```

Core 仍然统一。

这比：

> “我们有很多 Agent 专属 if/else”

健康得多。

# 36. 隐私应该怎么定位

Privacy 不一定是最核心的 Marketing Tagline。

但一定应该是 Trust Layer。

例如：

```
Local-first by default.

Your source code is not uploaded to an
AI Project Visualizer cloud service.

Semantic analysis is optional.
```

这对于开源开发者工具非常重要。

# 37. 对现有竞品应该学习什么

## 从 Claude Hub 学

> 实时状态应该非常容易理解。

不要把用户淹没在细节里。

## 从 Ralph Dashboard 学

> Phase / Task / Plan 可视化确实是有价值的。

同时也提醒我们：

> 单纯 Phase Progress 不够形成差异。

## 从 AI Project Board 学

> Agent Completion 应该有 Evidence。

以后 Verification 值得认真发展。

## 从 Pavilio 学

> Local-first + Agent-agnostic 是很合理的长期方向。

但不要膨胀成完整 AI Workspace。

## 从 Stoneforge 学

> Multi-Agent Orchestration 是另一个巨大产品赛道。

我们应该明确避开，而不是被它的功能数量诱惑。

# 38. COMPETITIVE POSITION

最终竞争定位可以正式写成：

```
Existing AI coding tools primarily answer:

1. What is the agent doing?
2. What task should the agent work on?
3. What code did the agent change?

AI Project Visualizer primarily answers:

Where is the project now?

It reconstructs project state from:

- agent plans
- plan changes
- task status
- agent activity
- user corrections
- evidence

and turns them into:

- current phase
- current task
- confirmed progress
- estimated progress
- explainable progress
- plan evolution
- development timeline
```

# 39. 我们明确不做什么

竞争调研后进一步确认：

```
AI Project Visualizer is NOT:

- a multi-agent orchestrator
- a replacement for Codex
- a Jira replacement
- a Git client
- a token dashboard
- a cost dashboard
- an agent leaderboard
- a cloud coding platform
```

越早说清楚这些，产品越不容易膨胀。

# 40. 最终差异化支柱

最终建议固定为五根支柱：

# Pillar 1 — Project State

不是 Agent State。

# Pillar 2 — Plan Evolution

不只展示当前计划。

# Pillar 3 — Explainability

每个关键进度都能问：

> Why?

# Pillar 4 — Epistemic Transparency

区分：

```
Observed
Agent Reported
Visualizer Inferred
User Confirmed
```

以及：

```
Confirmed
vs
Estimated
```

# Pillar 5 — Low-friction Observation

不要求用户为了 Visualizer 重建一套工作流。

# 41. 最终一句话定位

经过这一轮竞争分析，我认为最准确的一句话是：

> **AI Project Visualizer makes AI black-box development transparent by reconstructing the real-time state and evolution of your project.**

中文：

> **AI Project Visualizer 通过持续重建项目状态与演化过程，让 AI 黑盒开发变得透明。**

而用户真正记住的可以仍然是：

> **让 AI 黑盒开发过程变透明。**

# 42. 最理想的用户评价

如果产品成功，我希望用户不会只是说：

> “这个 Dashboard 很漂亮。”

而是：

> **“我现在让 AI 做大项目的时候会开着它，不然根本不知道项目做到哪了。”**

甚至：

> **“以前我在盯 Agent，现在我在看项目。”**

这一句其实非常能体现产品价值。

# 43. 第六步完成标准

到这里应该能够明确回答：

### 市场有没有类似产品？

有，而且很多。

### 有没有完全一样？

目前调研中，没有看到一个成熟工具把下面这整套产品哲学完整作为核心：

```
Observer
+
Automatic Project State Reconstruction
+
Plan Evolution
+
Confirmed vs Estimated
+
Explainable Progress
+
Provenance
+
User Correction
```

但多个竞争产品分别覆盖了其中部分能力，因此不能认为这些单项 Feature 本身就是独占创新。

### 真正差异是什么？

不是：

```
更漂亮的 Agent Dashboard
```

而是：

> **Project-state-centric AI Coding Observation。**

### 最核心的问题是什么？

仍然是：

> **这个项目现在到底做到哪里了？**

# 44. Phase 0 前置准备完成

至此，六个前置阶段全部完成：

```
① 新项目重新开始
✓

② 技术栈与 Monorepo
✓

③ 重大决策
✓

④ UX 低保真
✓

⑤ v0.1 Acceptance
✓

⑥ Competitive Research
✓
```

我们现在已经不缺“想法”。

下一步应该停止继续扩展产品设想。

正式进入：

# Phase 0 Review

这次 Review 的目标是：

> **把前面所有设计重新从头审查一遍，寻找自相矛盾、过度设计、技术风险、未验证假设和 v0.1 Scope 问题。**

只有 Review 通过之后，才真正开始：

```
Phase 1
Core Foundation
```