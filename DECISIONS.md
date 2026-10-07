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

> 2026-10-07 后续澄清：v0.1 首页范围由 D-034 限定；数值估算留到 Phase 13。

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

> 2026-10-07 后续澄清：完成计数和权重边界见 D-035；无来源权重默认算法仍待 Phase 4 前决策。

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

> 2026-10-07 后续澄清：分离原则继续 Accepted；v0.1 数值估算时机由 D-034 明确。

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

> 2026-10-07 后续澄清：结论级来源契约见 D-036。

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

> 2026-10-07 后续澄清：优先级和有效范围由 D-037 补充。

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

> 2026-10-07 后续澄清：COMPLETED/VERIFIED 的进度纳入条件见 D-035。

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

> 2026-10-07 后续澄清：被动观察尚未验证；门槛见 D-038。

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

> 2026-10-07 后续澄清：接受的是选型方向；版本可用性、工具兼容性和实际 Extension Host runtime 尚未验证，见 TECH_STACK §2/§11。

**Status:** Superseded

**Superseded by:** D-039。仅替代主语言版本；其余技术栈选型由 D-039 延续。以下原决策正文保留为历史记录，其中 TypeScript 7.x 不再是当前实现要求。

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

# D-034 — v0.1 Scope: Association Confidence, No Numeric Task Estimate

**Status:** Accepted

**Accepted:** 2026-10-07，用户批准 Phase 0 Specification Remediation

**Clarifies:** D-002、D-011、D-031；不废弃 Confirmed/Estimated 分离原则

## Context

Acceptance 将数值估算列为 v0.1 P0，但 Roadmap 在 Phase 13 才安排该能力（B-01）。

## Decision

v0.1 包含 Current Task、Current Task Confidence、Provenance、Confirmed Project Progress、Why progress、计划变化、Timeline、纠正（含 Task Weight 编辑）和恢复。v0.1 不实现 Estimated Task Progress 数值功能，也不展示占位百分比；数值估算仍在 Phase 13。

## Why

优先打通可信观察循环，避免以未验证估算制造精度。Confidence 指关联判断，不是完成比例。

## Consequences

Scenario 12 拆为 v0.1 非混合约束和 Phase 13 双数字验收；数值估算不能阻塞 Phase 4/v0.1。D-011 的原则始终适用。未来 UI 示例必须标明版本。

## Revisit When

真实用户反馈和 Phase 13 可解释估算验证支持调整时，通过新决策记录。

# D-035 — Completion Eligibility and Mandatory Trust Gates

**Status:** Accepted

**Accepted:** 2026-10-07，用户明确批准

**Clarifies:** D-010、D-013、D-014、D-016、D-019、D-025、D-027

## Context

Confirmed 进度的完成依据不明确，Acceptance P1 列表弱化基础真实性/隐私约束（B-02、S-07）。

## Decision

当前计划中 Confirmed Tasks 的有效权重构成分母。COMPLETED / VERIFIED 均可计入分子，但必须各自保留可靠且明确归属任务的完成依据。COMPLETED 的 Agent Reported 完成声明不是 VERIFIED；没有可靠完成依据的自动推断不得进入分子，不论 confidence 多高。

Confirmed 表示正式计划上的有依据完成记录，不保证独立验证。Why 面板展示完成依据及来源，不能将传输层“观察到声明”包装成独立验证。

隐私、Provenance、状态真实性、推断不确定性、Idea/Tentative 排除、无计划不造进度、默认不污染 Repo、Semantic OFF 下核心可用、持久保留人工纠正均为 v0.1 硬性发布条件。

## Why

发布优先级不能削弱已经接受的信任原则。

## Consequences

Task Weight 编辑保留为 v0.1 必须功能。Phase weight 为任务权重汇总，不作第二次加权。未知正式权重/空分母显示 unavailable；UI 一位小数，去掉 .0，计算不预先舍入。权重来源、人工调整和改变原因可追溯；无来源权重的初始化算法在 Phase 4 前单独批准/验证，不以必开 LLM 或永久全 1 偷偷代替。

## Revisit When

改变完成计数、权重政策或信任门槛时，需要明确的新决策和相应验收。

# D-036 — Inward Dependencies and Conclusion-level Provenance

**Status:** Accepted

**Accepted:** 2026-10-07，用户批准技术修正

**Clarifies:** D-006–D-008、D-014、D-026、D-033

## Context

Core 图中 Storage 与独立 Storage package 混用，单一 Task.provenance 无法表达多种结论（B-03、B-04）。

## Decision

Core 定义领域行为及实际需要的数据/持久化契约，不依赖 Codex、vscode、SQLite driver、Storage 实现或 LLM。Adapter/Storage 依赖 Core。Host 提供 repo 外存储位置，组合依赖和管理生命周期；Surface 展示和提交纠正。

Status、certainty、weight、current-task association、current-phase derivation、progress explanation 分别保留来源断言和当前解释。元数据包含目标字段、来源、时间、event/revision/依据引用；推断包含对应 Confidence。原始断言不被当前解释覆盖。Phase 1 保留多源断言表达能力，不提前实现完整多源解析或 conflict UI。

## Why

保持 Agent/IDE/数据库解耦，同时保留用户能纠正的判断依据。

## Consequences

事件按类型校验、保留身份/顺序/因果引用并幂等消费；专有 raw payload 留在 Adapter。内部 Project/Task/Session 身份不等同于路径、Workspace 或 thread ID。未知归属不得猜测合并。只按当前阶段建包，不引入通用 Provider 框架。

## Revisit When

实际边界出现第二种实现或契约不足时，以证据和新决策调整。

# D-037 — Field-scoped User Correction Precedence and Lifetime

**Status:** Accepted

**Accepted:** 2026-10-07，用户明确批准

**Clarifies:** D-015、D-017、D-026

## Context

原规格定义即时纠正，但缺少优先级、失效和恢复政策（B-05）。

## Decision

人工纠正优先于普通自动推断。普通文件活动、新 Turn、时间流逝或重启不得直接覆盖人工纠正。保留原断言，追加带目标/范围/生效时间/替代引用的纠正。失效须记录时间、依据事件、原因及规则。

Current Task 纠正限定指定 Project/Session 当前工作上下文：后续人工纠正、同 Session 可明确识别任务且较新的源选择、Session 明确结束或目标被完整计划明确移除，才可失效/替代。无法可靠判断新旧时保留纠正并暴露冲突。断连不等于结束；显示最后确认/当前未知。

历史关联纠正限定 event 或明确集合，后续人工纠正才能替代。Weight 纠正限定稳定 taskId 当前计划成员；新 Agent 估计不覆盖人工值，人工再次调整或明确退出计划才结束，重入不静默复活旧值。

## Why

防止推断立即撤销人工判断，同时避免无限期陈旧关联。

## Consequences

有效范围/失效/替代记录须持久恢复；Timeline 展示修正解释但不删除原观察。关联纠正不改写状态来源或升级 verification。政策按字段判断，不设全局“人工覆盖所有客观事实”的排序。

## Revisit When

真实单 Session 使用揭示失效边界问题时，先调整契约/验收再实现。

# D-038 — Passive Codex Observation Is a Separate Unverified Gate

**Status:** Accepted

**Accepted:** 2026-10-07，用户批准验证方案编制

**Clarifies:** D-001、D-006、D-024；接受的是门槛，非接入可行性

## Context

Plugin/app-server 获取已有用户 Session/计划的能力缺少可复现实验证据（B-06、S-02）。

## Decision

被动观察能力保持 **Unverified / Technical Verification Pending**。依照 [独立 Spike 方案](docs/spikes/codex-observation-feasibility.md) 先做正式接口研究，再验证用户正常启动的会话。尽早安排，目标是在 Phase 1 实现前取得早期证据；Phase 7 的生产集成开始前必须通过对应支持范围门槛。

## Why

不能以创建自有 Thread 的实验声称观察原工作流，也不能因技术困难暗中变为 Orchestrator。

## Consequences

独立 Core 可用 neutral fixtures 准备，但本轮不开始 Phase 1。Spike 计划不等于实验授权或通过；限制/失败回到用户决策，不自动引入 wrapper/task board/控制链路。受限通过涉及 Surface/version 支持范围时须审核，不概括为全 Codex 支持。具体协议、driver、toolchain 可用性等必须标为待验证。

## Revisit When

正式接口研究及实验证据足以支持接入选择，或揭示现有产品体验不可达时。

# D-039 — TypeScript 6.0.3 Initial Baseline for Ecosystem Compatibility

**Status:** Accepted

**Accepted:** 2026-10-07，用户明确批准 Phase 1 启动前技术栈文档修订

**Supersedes:** D-032 的主语言版本选择；延续其余选型及后续已批准的架构/阶段约束

## Context

用户提供的启动前版本核对结果：`typescript-eslint 8.71.1` / `@typescript-eslint/parser 8.71.1` 的 TypeScript 支持范围为 `>=4.8.4 <6.1.0`。TypeScript 7.0.2 不在该范围内；TypeScript 6 当前可用版本为 6.0.3。[typescript-eslint 官方支持范围](https://typescript-eslint.io/users/dependency-versions/)亦确认该范围（2026-10-07 查阅）。

## Decision

Phase 1 初始实现使用 `typescript 6.0.3`，TypeScript ESLint 工具链基线为 `typescript-eslint 8.71.1` / `@typescript-eslint/parser 8.71.1`。D-032 的 TypeScript 7.x 选择保留为历史，不再约束当前实现；Node.js 24 LTS、pnpm Monorepo、Vitest、SQLite、VS Code Surface、tsc + esbuild 等其余选型继续有效，仍受各自验证门槛约束。

## Why

6.0.3 位于已核对的正式支持范围内；当前 typescript-eslint 正式工具链尚不支持 TypeScript 7。这是生态兼容性选择，不代表永久拒绝 TypeScript 7。

## Consequences

TECH_STACK §2/§24 以此为当前基线。此决定和发布版本/支持范围核对不代表安装、编译、Lint、测试或 Extension Host 兼容性验证通过；其他工具的确切版本与组合验证仍按原门槛执行。本次只修订文档，不安装依赖、初始化 Monorepo 或开始 Phase 1。

## Revisit When

typescript-eslint 正式版明确支持 TypeScript 7 后，可以重新评估；核对 compiler/package identity、确切版本及编译、Lint、测试、打包兼容性，再通过新 Decision 记录升级。不得仅凭预发布支持或忽略版本告警自动迁移。

# D-040 — Phase 1 Fixture Hierarchy and Phase 3 Plan Reconciliation Boundary

**Status:** Accepted

**Accepted:** 2026-10-07，用户在 Phase 1G 明确批准规格边界修正

**Clarifies:** ROADMAP Phase 1 组件验收、ARCHITECTURE §5、§9–10 与 Phase 3 Plan Engine 的职责边界

## Context

Phase 1 验收原文“受控事件能创建层级”可能被理解为必须由 plan.detected / plan.updated 自动建立 Project / Phase / Task，但 plan reconciliation、stable identity matching 及新增/删除/变化处理属于 Phase 3。

## Decision

Phase 1 由 controlled fixture / trusted initial CoreState 建立 Project → Phase → Task hierarchy，normalized events 在已有 hierarchy 上执行 minimal event application。plan.detected / plan.updated 在 Phase 1 仅安全保存，不进行 plan→hierarchy reconciliation，不新增 bootstrap production event 绕过阶段边界。

Phase 3 正式实现 plan input → Project / Phase / Task reconciliation；不改变其既有职责。

## Why

组件验收必须与架构和实现顺序一致，不能为满足一句验收文字提前实现 Plan Engine。

## Consequences

ROADMAP Phase 1 仅修正 hierarchy acceptance wording。Correction scope/reference、Timeline reference 与 interpretation-state 的受控 fixture 不代表相关 Engine 已实现。Phase 1 是否完成仍须外部 Closure Review；本决定不宣称技术验收通过，也不改变 Codex observation 的 Inconclusive / Technical Verification Pending 状态或 Phase 7 生产集成门槛。

## Revisit When

Phase 3 reconciliation 的正式契约/实验证据揭示初始化或阶段边界不足时，以新决策记录调整。

# 7. 哪些事情暂时不要写成 Accepted

有些事情我们还没有真正验证，不应该假装已经拍板。

例如：

```
具体 SQLite Driver
```

决策状态使用 Proposed（§5）；技术验证状态另记 Technical Verification Pending。Accepted 表示决策被批准，不表示技术实验通过。

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
