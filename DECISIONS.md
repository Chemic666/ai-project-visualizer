# 第三步：建立重大决策记录

## 1. 这一阶段的目标

这一阶段不开发功能。

目标是把已经确定的重大产品和架构决策整理成一套明确记录，回答：

> **哪些事情已经讨论过、已经拍板，不应该被后续 Agent 随意推翻？**

这类决策包括：

- 产品到底是 Observer 还是 Orchestrator；
- 数据默认存哪里；
- 是否依赖云端；
- Codex 是唯一 Agent 还是首个 Agent；
- VS Code Extension 是产品本体还是 UI Surface；
- 进度如何计算；
- 推断和事实如何区分；
- Semantic Analysis 是否默认开启。

这些内容应该形成：

```
DECISIONS.md
```

# 2. 为什么需要 DECISIONS.md

假设半年以后 Codex 在开发中发现：

> “如果我们让 Visualizer 给 Agent 自动分配任务，会更方便。”

听起来可能很合理。

但我们已经明确：

> Visualizer 是 Observer，不是 Orchestrator。

如果没有决策记录，Agent 很可能直接开始实现。

再比如它可能建议：

```
把项目状态同步到云端
```

但我们的产品原则是：

```
Local-first
Privacy-first
```

这些不是普通实现细节，而是产品方向。

因此必须记录。

# 3. DECISIONS 和其他文档有什么区别

现有文档：

```
PRODUCT.md
ARCHITECTURE.md
ROADMAP.md
AGENTS.md
```

分别负责：

| 文档            | 主要回答                             |
| --------------- | ------------------------------------ |
| PRODUCT.md      | 为什么做、产品是什么                 |
| ARCHITECTURE.md | 系统应该怎么设计                     |
| ROADMAP.md      | 按什么顺序开发                       |
| AGENTS.md       | AI 开发时必须遵守什么                |
| DECISIONS.md    | **哪些重大问题已经拍板，以及为什么** |

DECISIONS.md 更像项目的“决策历史”。

# 4. 一条 Decision 应该包含什么

推荐使用简单格式：

```
## D-001 — Decision Title

Status: Accepted

### Context

为什么这个问题需要做决定。

### Decision

最终决定是什么。

### Why

为什么这么决定。

### Consequences

这个决定会带来哪些影响。

### Revisit When

什么情况下未来允许重新讨论。
```

最后这个：

```
Revisit When
```

很重要。

我们不是说所有决定永远不能改变。

而是：

> **必须有明确理由才能重新讨论，而不是 Agent 一时兴起就改。**

# 5. Decision 状态

第一版可以使用：

```
Proposed
Accepted
Superseded
Rejected
```

## Proposed

正在讨论。

## Accepted

已经正式采用。

## Superseded

后来被新的决策替代。

例如：

```
D-006 Superseded by D-021
```

## Rejected

讨论过，但决定不采用。

# 6. 第一批重大决策

下面这些就是我们目前已经明确拍板的内容。

# D-001 — Observer, Not Orchestrator

**Status:** Accepted

## Context

AI Project Visualizer 可以有两种发展方向：

```
Observer
```

或者：

```
Orchestrator
```

Orchestrator 会：

- 创建任务；
- 分配 Agent；
- 控制开发流程；
- 告诉 Agent 下一步做什么。

Observer 则：

- 观察 Agent；
- 理解 Agent；
- 重建项目状态；
- 展示项目进展。

## Decision

AI Project Visualizer 定位为：

> **Observer, not Orchestrator.**

Visualizer 不成为 AI Agent 的任务调度中心。

## Why

产品核心价值是：

> **让 AI 黑盒开发过程变透明。**

而不是：

> 控制 AI 如何开发。

如果发展成 Orchestrator，会直接进入另一个已经非常拥挤的 AI Agent 管理赛道。

## Consequences

Visualizer 可以：

- 捕获 Plan；
- 整理 Plan；
- 推断当前 Task；
- 计算 Progress；
- 记录 Timeline；
- 检查 Evidence。

但不应该默认：

- 自动分配 Agent 任务；
- 强迫 Agent 使用 Visualizer 的 Task System；
- 控制 Agent 开发流程。

## Revisit When

只有当大量真实用户明确要求 Visualizer 承担任务编排职责时，才重新讨论。

# D-002 — North Star: Where Is the Project Now?

**Status:** Accepted

## Decision

产品所有核心能力必须优先帮助回答：

> **这个项目现在到底做到哪里了？**

## Why

这是用户使用 Visualizer 最核心的需求。

其他功能，例如：

```
Agent metrics
Token usage
排行榜
成本分析
```

虽然有价值，但不会直接回答这个问题。

## Consequences

产品首页优先展示：

```
Confirmed Progress
Current Phase
Current Task
Estimated Task Progress
Recent Plan Changes
Timeline
```

而不是：

```
Token
Model
Tool call count
Agent ranking
```

# D-003 — Local-first by Default

**Status:** Accepted

## Decision

Visualizer 默认采用：

> **Local-first**

项目状态优先保存在用户本机。

## Why

Visualizer 会观察：

- 项目结构；
- AI Agent 活动；
- Plan；
- Task；
- 文件引用；
- 开发历史。

这些数据可能涉及私有项目。

默认云端存储会大幅增加：

- 隐私风险；
- 信任成本；
- 产品复杂度；
- 服务成本。

## Consequences

核心功能不得要求：

```
注册账号
登录云服务
上传 Repository
```

才能使用。

# D-004 — Portable by Choice

**Status:** Accepted

## Decision

默认本地保存，但未来允许用户主动导出：

```
.ai-project/
```

等 Portable Project State。

## Why

用户可能需要：

- 多设备迁移；
- Git 保存状态；
- 项目备份；
- 团队共享。

但这不应该影响默认的 Local-first 体验。

## Consequences

默认：

```
Local App Storage
```

用户主动操作后：

```
Export
→ .ai-project/
```

# D-005 — Privacy-first

**Status:** Accepted

## Decision

隐私属于核心产品需求，而不是后期优化。

## Why

Visualizer 观察 AI 开发过程时可能接触源代码和项目上下文。

对于企业和私有项目用户而言，隐私可能直接决定是否安装。

## Consequences

默认：

- 不上传完整 Repository；
- 不建立 Visualizer 自己的源码云端；
- 不静默发送代码给第三方模型；
- AI Semantic 功能必须明确；
- 可以本地处理的信息优先本地处理。

# D-006 — Codex-first, Not Codex-only

**Status:** Accepted

## Decision

第一版主要支持：

```
Codex
```

但 Core 架构不能绑定 Codex。

## Why

第一版必须控制复杂度。

同时产品价值：

> AI Project Visibility

并不是 Codex 独占需求。

未来可能支持：

```
Claude Code
OpenCode
Gemini CLI
Other Agents
```

## Consequences

必须存在：

```
Agent Adapter
```

结构。

Core 不允许直接依赖 Codex protocol type。

# D-007 — VS Code Is a Surface, Not the Product Core

**Status:** Accepted

## Decision

VS Code Extension 是当前最佳 UI Surface。

但：

> VS Code Extension ≠ AI Project Visualizer Core。

## Why

未来可能存在：

```
CLI
JetBrains
Web Dashboard
Other IDEs
```

如果业务逻辑全部写进 VS Code Extension，以后无法复用。

## Consequences

VS Code 只负责：

- 展示；
- 交互；
- 设置；
- 用户纠正。

Project 状态逻辑属于 Core。

# D-008 — Core + Adapter + Surface Architecture

**Status:** Accepted

## Decision

顶层架构固定为：

```
Agent
  ↓
Adapter
  ↓
Normalized Events
  ↓
Project Core
  ↓
Surface
```

## Why

这样可以同时做到：

- Agent 解耦；
- IDE 解耦；
- Core 可测试；
- 未来可扩展。

# D-009 — Project Hierarchy Stays Simple

**Status:** Accepted

## Decision

v1 项目层级保持：

```
Project
  ↓
Phase
  ↓
Task
```

不主动加入：

```
Epic
Story
Sprint
Checkpoint
Microtask
Subtask
```

## Why

过度拆分会使 Visualizer 变成 Project Manager。

同时容易制造虚假精度。

# D-010 — Weighted Progress

**Status:** Accepted

## Decision

Confirmed Project Progress 采用任务权重。

例如：

```
README
Weight 1

Authentication
Weight 8
```

## Why

任务数量不能代表实际工作量。

否则：

```
5 / 10 tasks
```

不一定真的代表：

```
50%
```

## Consequences

任务权重：

```
AI Initial Estimate
```

但用户可以调整。

# D-011 — Confirmed Progress and Estimated Progress Are Different

**Status:** Accepted

## Decision

系统必须明确区分：

```
Confirmed Project Progress
```

与：

```
Estimated Current Task Progress
```

例如：

```
Confirmed
68%

Estimated Current Task
~42%
```

## Why

长任务执行数小时期间，Confirmed Progress 可能不动。

但直接把 AI 推测混入正式进度会制造伪精确。

所以两者都需要，但必须分开。

# D-012 — Progress May Go Backward

**Status:** Accepted

## Decision

项目进度允许：

```
72%
↓
58%
```

## Why

真实软件项目中可能：

- 新增需求；
- 发现漏项；
- Plan 扩大；
- Task Scope 增加。

如果强制进度只增长，会失去真实性。

## Consequences

进度下降时必须记录：

```
Previous
Current
Reason
Plan Change
```

例如：

```
72% → 58%

Reason:
Plan expanded
```

# D-013 — Progress Must Be Explainable

**Status:** Accepted

## Decision

重要进度必须支持：

> **Why X%?**

## Why

AI 直接给：

```
67%
```

本身没有可信度。

用户应该能够看到：

```
Task weights
Completed work
Remaining work
Plan changes
```

## Consequences

Progress Engine 不应只返回：

```
number
```

还应该能够产生：

```
ProgressExplanation
```

# D-014 — Provenance Is First-class

**Status:** Accepted

## Decision

关键状态至少区分：

```
Observed
Agent Reported
Visualizer Inferred
User Confirmed
```

## Why

用户必须知道：

> 这是事实，还是 AI 的判断？

例如：

```
Agent says DONE
```

和：

```
Tests actually passed
```

不是一回事。

# D-015 — User Can Correct Visualizer

**Status:** Accepted

## Decision

Visualizer 的判断允许被用户纠正。

例如：

```
Likely Task 3.2
Confidence 65%
```

用户可以：

```
Correct → Task 3.4
```

## Why

Visualizer 本身也可能判断错误。

产品不能假装自己的 AI 推断永远正确。

## Consequences

User Correction：

- 更新当前状态；
- 写 Timeline；
- 使用 User Confirmed provenance；
- 可以影响后续推断。

# D-016 — Agent-reported Completion Is Not Verification

**Status:** Accepted

## Decision

Agent 说：

```
DONE
```

只代表：

```
COMPLETED
```

不代表：

```
VERIFIED
```

## Why

Agent 可能：

- 忘记运行测试；
- 测试失败；
- 漏实现边界条件；
- 错误理解任务。

## Consequences

状态至少区分：

```
COMPLETED
VERIFIED
```

# D-017 — Timeline Stores Meaning, Not Noise

**Status:** Accepted

## Decision

长期 Timeline 主要保存：

```
Task Started
Plan Changed
Progress Changed
Task Completed
User Correction
Phase Completed
Important Failure
```

而不是：

```
Read A
Read B
Edit C
Read D
```

## Why

用户需要的是：

> 项目发生了什么。

不是：

> Agent 调用了多少次工具。

# D-018 — Raw Events Are Infrastructure

**Status:** Accepted

## Decision

Visualizer 仍然采集：

```
Read
Edit
Search
Command
Test
```

但它们属于底层 Infrastructure。

## Why

这些数据对于：

- Current Task inference；
- Semantic Analysis；
- Debug；
- Evidence；

很重要。

但不应该成为主界面的核心内容。

# D-019 — Semantic Analysis Is Optional and Off by Default

**Status:** Accepted

## Decision

Semantic Analysis：

```
OFF by default
```

## Why

原因包括：

- 并非所有用户都需要；
- 存在模型成本；
- 存在误判；
- 可能涉及源代码隐私；
- Core 不应该依赖 AI 才能运行。

## Consequences

不开启 Semantic Analysis 时：

> Visualizer 核心功能必须完整可用。

# D-020 — Semantic Claims Require Evidence

**Status:** Accepted

## Decision

当 Semantic Analysis 开启后，重要语义判断必须尽量支持：

```
Why?
```

并提供 Evidence。

## Example

不是：

```
This improves transaction safety.
```

而是：

```
createOrder() now runs within a transaction.

Evidence:
- @Transactional added
- Order insert occurs inside the method
- OrderItem inserts occur before method exit
```

# D-021 — Semantic Summary Is Rolling, Not Just Final

**Status:** Accepted

## Decision

Semantic Summary 重点不是重复 Agent 最终总结。

而是：

> **动态解释最近一段时间发生了什么。**

## Example

```
过去几分钟：

- JWT 校验已迁入统一拦截层
- 新增 3 个鉴权测试
- 过期 Token 测试仍失败
- Codex 正在调整 expiration validation
```

# D-022 — Semantic Updates Are Event-driven

**Status:** Accepted

## Decision

Rolling Summary 采用：

```
Event-driven
```

而不是固定：

```
Every 30 seconds
```

## Trigger Examples

```
Plan changed
Task changed
Test status changed
Significant edit group completed
Build failed
Agent recovered
```

# D-023 — Open-source Developer Tool

**Status:** Accepted

## Decision

AI Project Visualizer 定位为：

> **Open-source developer tool**

## Why

产品涉及：

- AI Agent 活动；
- 项目状态；
- 可能接触源代码上下文；
- 隐私承诺。

开源能够提升：

- 信任；
- 社区贡献；
- Adapter 扩展；
- GitHub 传播；
- 开发者认可。

# D-024 — Zero-config First

**Status:** Accepted

## Decision

理想首次体验：

```
Install
↓
Open Project
↓
Use Codex
↓
Visualizer works
```

而不是：

```
Install
↓
Create config
↓
Run init
↓
Generate files
↓
Configure agent
↓
Finally works
```

## Consequences

高级配置可以存在。

但默认流程必须尽量轻。

# D-025 — Do Not Pollute the Repository by Default

**Status:** Accepted

## Decision

Visualizer 默认不创建：

```
.ai-project/
```

等文件进入用户 Repo。

## Why

Visualizer 是观察工具。

用户不应该一安装就发现：

```
git status
```

突然多出一堆 Visualizer 文件。

# D-026 — Source-aware Unified Project View

**Status:** Accepted

## Decision

多个计划来源同时存在时：

```
Codex Active Plan
PLAN.md
TODO.md
User Correction
```

Visualizer 不偷偷覆盖。

应：

```
保留来源
+
构建 Unified Project View
```

## Why

不同来源可能发生冲突。

冲突本身就是重要信息。

# D-027 — Confidence Must Be Visible for Inference

**Status:** Accepted

## Decision

对于推断结果，例如：

```
Likely Task
Task 3.2
```

应能够显示：

```
Confidence 65%
```

## Why

推断不应该伪装成确定事实。

# D-028 — Friendly Observer

**Status:** Accepted

## Decision

Visualizer 可以与 Agent 的结论不同。

例如：

```
Agent:
DONE

Visualizer:
COMPLETED
Verification Unknown
```

或者：

```
Agent:
DONE

Visualizer:
Not Verified
2 tests failing
```

但产品语气应：

> 信息化，而不是攻击性。

# D-029 — Attention Signals Inform, Not Interrupt

**Status:** Accepted

## Decision

未来允许：

```
Plan expanded significantly
Tests failing after Agent completion
Low confidence current task
Repeated build failure
```

等轻量提示。

但不要变成满屏告警。

# D-030 — Raw Activity Is Not the Homepage

**Status:** Accepted

## Decision

首页不以：

```
Read
Edit
Run
Search
```

事件流为核心。

首页优先回答：

```
项目做到哪里
当前 Phase
当前 Task
项目进度
Plan 是否变化
```

# D-031 — The Magic Moment Is Five-second Understanding

**Status:** Accepted

## Decision

最重要的产品体验是：

用户离开一段时间后回来，打开 Visualizer，约 5 秒理解：

```
项目现在做到哪
当前 Agent 在处理什么
Plan 有没有变化
进度为什么变化
```

## Why

这是 AI Project Visualizer 最有区别度的价值。

# D-032 — Technology Stack

**Status:** Accepted

## Decision

当前核心技术栈：

```
Language
TypeScript 7.x

Runtime
Node.js 24 LTS

Package Manager
pnpm

Repository
Monorepo

Testing
Vitest

Persistence
SQLite

UI
VS Code Extension

Build
tsc + esbuild

First Agent
Codex
```

SQLite Driver 暂不锁定。

Webview Framework 暂不锁定。

# D-033 — No Premature Technology

**Status:** Accepted

## Decision

在没有明确需求前，不提前引入：

```
React
Next.js
Electron
Docker
Redis
PostgreSQL
Message Queue
Microservices
Cloud Backend
Complex ORM
```

## Why

“以后也许会用”不是增加技术复杂度的充分理由。

# 7. 哪些事情暂时不要写成 Accepted

有些事情我们还没有真正验证，不应该假装已经拍板。

例如：

```
具体 SQLite Driver
```

应该暂时保持：

```
Pending
```

还有：

```
是否使用 React
CLI 使用什么 Framework
具体 License 选择 MIT 还是 Apache-2.0
具体 Codex Plugin 接入协议
```

都可以以后再决定。

# 8. 决策之间发生冲突怎么办

如果未来真的需要修改重大方向，不要直接改旧内容。

比如原来：

```
D-019
Semantic Analysis OFF by default
```

未来经过大量用户反馈决定改成默认开启。

应该新增：

```
D-045 — Enable Semantic Analysis by Default
```

然后：

```
Supersedes: D-019
```

旧 Decision 改：

```
Status: Superseded
```

这样我们能知道产品方向是怎么演变的。

# 9. Agent 使用 DECISIONS 的规则

以后 Work / Codex 开始工作前，应该至少读取：

```
PRODUCT.md
ARCHITECTURE.md
ROADMAP.md
AGENTS.md
DECISIONS.md
```

当 Agent 提出：

> “我建议直接把 Progress 算成一个 AI 百分比。”

应该先发现：

```
D-011
Confirmed Progress != Estimated Progress
```

于是它不能随便修改。

# 10. 哪些情况必须新增 Decision

如果一个决定满足以下任意条件，就应该考虑写入 DECISIONS：

### 改变产品定位

例如：

```
Observer → Orchestrator
```

### 改变核心架构

例如：

```
Core + Adapter
→ Codex-specific Core
```

### 改变隐私模型

例如：

```
Local-first
→ Cloud-first
```

### 改变持久化策略

例如：

```
SQLite
→ Remote Database
```

### 改变进度语义

例如：

```
Confirmed / Estimated
→ Unified AI Progress
```

### 改变核心用户体验

例如：

```
Zero-config
→ Mandatory project initialization
```

# 11. 哪些事情不需要写 Decision

普通实现细节不用全部写。

例如：

```
函数叫什么名字
某个 class 放在哪个文件
CSS margin 是多少
变量叫什么
测试文件叫什么
```

否则 DECISIONS.md 会变成垃圾场。

# 12. 第三步完成标准

这一阶段完成时，应达到：

```
✓ 核心产品方向已经形成 Decision

✓ 重大架构原则已经形成 Decision

✓ 隐私原则已经形成 Decision

✓ Progress 语义已经形成 Decision

✓ Provenance / Confidence 原则已经形成 Decision

✓ User Correction 已明确

✓ Semantic Analysis 边界已明确

✓ 技术栈已经记录

✓ 尚未验证的技术没有假装 Accepted
```

# 13. 第三步的真正意义

以后开发中经常会出现这种情况：

```
Agent：
“这样做可能更方便。”

开发者：
“听起来不错。”

然后：
项目方向一点一点发生漂移。
```

DECISIONS.md 的作用就是：

> **把“已经讨论清楚的事情”从聊天记录中抽出来，变成项目长期记忆。**

它不是为了增加文档数量。

而是防止：

> 六个月后我们重新争论今天已经解决的问题。

# 14. 下一步

第三步结束以后进入：

> **第四步：UX 低保真原型设计**

第四步开始不再只是写原则。

我们会真正设计用户看到的：

```
Overview
Plan
Timeline
Why X%?
Activity
Correction
Settings
```

并确定：

> 用户安装以后第一眼看到什么、点击哪里、不同状态如何表现。

这是第一次开始把 AI Project Visualizer 从“概念”变成真正的“产品界面”。