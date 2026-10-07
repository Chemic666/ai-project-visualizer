# AI Project Visualizer — Roadmap

> **Make AI coding transparent.**

Roadmap 的目标不是尽快堆满功能，而是逐步建立一个可靠的：

> **AI Coding Project Observation Layer**

# Phase 0 — Product & Engineering Foundation

- 已完成规格文档建立及 Phase 0 Review；这不是实现/技术验证完成。
- 本轮 Specification Remediation 对齐 D-034–D-038；结果等待用户审核。
- Codex passive observation：Unverified / Technical Verification Pending；独立方案见 [Spike](docs/spikes/codex-observation-feasibility.md)，未执行。
- 尽早在独立任务中研究正式接口并执行最小观察实验，目标在 Phase 1 实现前取得早期证据；Phase 7 生产集成前为强制门槛。受限/失败须用户决策，不改变 Observer 工作流。
- 旧 app-server 材料不在本仓库；版本与结论待找到后核验。
- toolchain major 可用性/兼容性须在 Phase 1 workspace 初始化前研究确认；SQLite driver/宿主打包须 Phase 2 选型前 Spike。

本轮只改文档，不初始化、不执行实验、不开始 Phase 1。

# Phase 1 — Core Foundation

建立完全独立的 Project Core，只创建 core package 及必要配置/fixture tests，且需用户另行授权。

契约：Project / Phase / Task / Session、source-aware normalized event、结论级 assertion/provenance/confidence、source reference、correction scope/reference、Timeline 引用。实现最小进程内事件应用和状态查询，不提前实现后续 Plan/Progress/Correction/Timeline Engine。

组件验收：不需要 Codex、VS Code、真实数据库、网络、LLM；controlled fixture / trusted initial CoreState 建立 Project → Phase → Task hierarchy，normalized events 在已有 hierarchy 上执行 minimal event application。plan.detected / plan.updated 在 Phase 1 只安全保存，不进行 plan→hierarchy reconciliation；该行为由 Phase 3 Plan Engine 实现（D-040）。保留独立来源、显示未知/歧义而不猜测完成，幂等消费并产生基本状态。具体 engine 计算/纠正生效政策按 Phase 3–9 实现。未来真实 Agent/UI 场景标 Pending，不以 fixture 测试称其通过。

进入前：审核修订契约/发布范围，验证选定工具链实际版本，明确 neutral identity/event fixture；Codex Spike 仍独立跟踪，不能向 Core 泄漏专有协议。

# Phase 2 — Local Storage

目标：

实现 Local-first persistence。

建议：

```
SQLite
```

实现：

- Projects
- Phases
- Tasks
- Sessions
- Events
- Timeline Events
- Plan Snapshots
- User Corrections

验收：

```
关闭程序
重新启动
```

Project State 可以恢复。Driver/runtime/VSIX Spike、最小来源/纠正/快照/cursor 原子恢复和 privacy/retention 政策在本阶段选型前完成；只持久化现有契约，后续增量扩展。当前均 Technical Verification Pending。

# Phase 3 — Plan Engine

目标：

让系统真正理解：

```
Project
→ Phase
→ Task
```

第一阶段先使用可控测试数据。

实现：

- Normalized plan handling；Agent-specific parsing 属 Adapter
- Plan source model
- Confirmed / Tentative / Idea
- Plan snapshots
- Plan diff
- Added task detection
- Removed task detection
- Changed task detection

输出：

```
plan.changed（Core-derived）
```

# Phase 4 — Progress Engine

目标：

回答：

> 项目做到哪里了？

实现：

- Task weight
- Phase weight derived from task weights（无第二次乘数）
- Confirmed project progress
- Progress regression
- Progress change reason
- Explainable progress

例如（沿用 Acceptance Scenario 13：完成权重 32，总权重 45→50）：

```
71.1% → 64%

Reason:
Plan expanded
```

验收：

组件验收仅验证 fixture 的公式、完成依据、非混合、回退原因及 explanation；UI/真实事件全链路后续标 Pending。初始无来源权重政策须本阶段前批准/验证，Core 不要求 LLM；每个进度都能回答：

```
Why?
```

# Phase 5 — User Correction System

目标：

承认 Visualizer 会判断错。

实现：

- Correct current task
- Correct task association
- Modify task weight
- Store correction history
- User Confirmed provenance
- Timeline correction/expiration events；优先级/范围遵守 D-037，文件活动/新 Turn 不覆盖有效纠正

例如：

```
Visualizer:
Task 3.2
Confidence 61%

User:
Task 3.4

Result:
User Confirmed
```

# Phase 6 — Development Timeline

目标：

把整个开发过程变成长期可浏览历史。

实现：

- Timeline Engine
- Task Started
- Task Completed
- Plan Changed
- Progress Changed
- User Correction
- Phase Completed
- Session events

不要把 Timeline 做成：

```
Read
Edit
Read
Edit
```

而应以项目意义事件为主。

# Phase 7 — Codex Adapter v1

目标：

第一次接入真实 Agent。开始前必须取得 D-038 的被动观察实验证据，并明确获准支持的 Surface/version；当前 Unverified。

实现：

```
Codex
↓
CodexAdapter
↓
Normalized Events
```

优先处理：

- Session detection
- Plan detection
- Plan updates
- Agent task status
- Agent completion reports
- Agent messages

这一阶段不追求完整 Activity。

# Phase 8 — Codex Activity Research & Adapter Integration

早期被动观察可行性由 Phase 0 的独立 Spike 解决；本阶段验证活动粒度并实现已选择路径的 normalization/integration，不第一次才研究 Phase 7 依赖的 Session/Plan。

app-server 仅为候选，不能要求同时实现 Plugin 和 app-server。Read/Edit/Command/Test、history/reconnect 按 capability 和实验证据接入；不存在事件时报告 limitation，不编造。活动/命令结果不直接代表任务独立 VERIFIED。

# Phase 9 — Current Task Inference

目标：

自动判断：

> Codex 当前最可能正在做哪个 Task？

实现基础推断：

```
Plan context
Agent messages
Modified files
Recent activity
Task scope
```

输出：

```
Likely Task
Task 3.4

Confidence
65%
```

实现：

- Rule-based inference
- Confidence model
- Ambiguous state
- User correction integration（D-037）；Confidence 为 association score，不是完成比例

# Phase 10 — VS Code Extension Shell

经 host/runtime/package smoke 验证后实现 Overview、Plan、Timeline、Task Detail/Correction、Why Progress 和必要 Settings。Host 负责组合和生命周期，Surface 不计算业务状态。

Baseline UX 必须包含无 Session/无 Plan/未知/歧义/断连、来源与关联 Confidence、进度解释、计划变化、有效/失效纠正和 Task Weight 编辑。Activity 为 advanced/P1，只展示实际支持的观察；未来 Semantic/Export/多 Session 控件不进入初版设置。

本阶段无 Estimated Task Progress 数值功能。真实 E2E 和人工五秒理解在 Phase 11 放行前完成。

# Phase 11 — v0.1 Usable Release

必须打通：自动识别 Project/真实 Codex Session、正式 Plan capture/Phase/Task、Current Phase/Current Task、Current Task Confidence/Provenance、Confirmed Project Progress 和 Why、Plan History、意义 Timeline、User Corrections（含 Weight/Association）、本地恢复。

不实现 Estimated Task Progress 数值；不要求 Semantic Analysis、完整 Verification Engine、多源 conflict UI、多 Session UI、Export/CLI。基础状态 COMPLETED/VERIFIED 的真实性区分必须已成立，不能等 Phase 14。

发布门槛：Acceptance 所有 P0 + Mandatory Trust/Privacy Gates，通过受支持真实 Codex 路径 E2E、恢复测试和人工 Magic Moment。COMPLETED/VERIFIED 各保留完成依据，无依据推断不得进入分子。推断不确定性、来源、纠正历史、默认不污染 Repo、不上传源码、Semantic OFF 均不可降为 P1 缺陷。

真实观察/发布验收当前 Technical Verification Pending，不因本轮规格修订而标 PASS。

# Phase 12 — UX Refinement

在 Phase 10/11 已具 baseline Why/Confidence/Provenance/empty state/first install/人工五秒理解之后优化布局、可访问性、图标、过滤和展示效率。不能以此阶段为由推迟 v0.1 已要求的解释/信任 UX。

# Phase 13 — Estimated Task Progress

D-034：数值功能首次在此阶段实现，不是 v0.1 范围；使用独立 estimate confidence/依据，不复用 association Confidence。

下列数字为独立后续展示示例（非 Acceptance Scenario 13 的计划扩张计算）。

目标：

解决长任务：

```
Project progress 长时间不动
```

增加：

```
Confirmed Project Progress
68%

Estimated Current Task
~42%
```

要求：

- 两种进度视觉明显区分
- Estimated 标记
- Confidence
- Explainability

# Phase 14 — Verification Foundation

目标：

在 v0.1 已区分报告/验证状态的基础上，开始取得独立验证证据：

```
Agent says DONE
```

和：

```
Actually verified
```

实现基础数据源：

- Git state
- Build result
- Test result

状态：

```
COMPLETED
VERIFIED
```

例如：

```
◐ COMPLETED
Reported by Codex

Verification
Unknown
```

未来：

```
✓ VERIFIED
Tests passed
Build passed
```

# Phase 15 — Rolling Summary

目标：

回答：

> 刚才几分钟发生了什么？

采用：

```
Event-driven summary
```

而不是：

```
timer-based summary
```

触发：

- Plan changed
- Task changed
- Test status changed
- Significant edit group
- Important failure
- Recovery

# Phase 16 — Optional Semantic Analysis

默认：

```
OFF
```

用户手动开启。

实现：

- Semantic code change
- Behavior impact
- Why?
- Evidence references
- Privacy warning
- Provider abstraction

优先：

```
Local rules
↓
AI when necessary
```

# Phase 17 — Attention Signals

轻量观察提示。

例如：

```
Agent reports DONE
but
2 tests are failing.
```

支持：

- Plan significantly expanded
- Repeated failures
- Completion without verification
- Current task uncertainty

原则：

> Inform, not interrupt.

# Phase 18 — Portable Project State

默认仍然 Local-first。

加入：

```
Export Project State
```

生成：

```
.ai-project/
```

支持：

- Export
- Import
- Backup
- Restore

不自动写入 Repo。

# Phase 19 — CLI

以下 CLI 数字为独立展示示例（非 Acceptance Scenario 13）。

加入：

```
apv status
```

例如：

```
Project
my-app

Confirmed Progress
68%

Current
Phase 4 · Authentication

Task
JWT Authorization

Estimated
~42%
```

让 Visualizer 不依赖 VS Code。

# Phase 20 — v1.0

v1.0 应满足：

## Core

- Stable Project Model
- Stable Event Model
- Local Storage
- Explainable Progress
- Plan History
- Timeline
- User Corrections

## Codex

- Stable Codex Adapter
- Plan Capture
- Session Detection
- Activity Capture

## UI

- VS Code Extension
- Overview
- Plan
- Timeline
- Activity

## Trust

- Provenance
- Confidence
- User Correction
- Privacy-first

## Optional

- Semantic Analysis
- Rolling Summary

# v1.0 Success Test

一个陌生用户：

```
Install
↓
Open existing project
↓
Run Codex
↓
Wait several minutes
↓
Open Visualizer
```

应该可以在约 5 秒内回答：

```
项目现在做到哪了？

Codex 当前在做什么？

计划发生了什么变化？

进度为什么是这个数字？

哪些状态是事实？

哪些只是插件推断？
```

如果不能：

> v1.0 尚未真正完成。

# Post-v1 — Additional Agents

只有 Codex 体验稳定后才扩展：

```
Claude Code
OpenCode
Gemini CLI
Others
```

通过：

```
AgentAdapter
```

接入。

不能复制整个系统。

# Post-v1 — Multi-session

Core 可以提前支持。

UI 后续正式支持：

```
Session A
Backend

Session B
Frontend
```

但不能影响单 Session 的简洁体验。

# Explicit Non-Roadmap

以下内容目前不是主要 Roadmap：

```
Token tracking
Cost tracking
Agent leaderboard
Jira replacement
Linear replacement
Team project manager
Automatic task assignment
Agent orchestration
Cloud source repository
```

除非未来产品定位发生明确变化。

# Release Philosophy

发布策略：

```
v0.x
Real users
Real feedback
Fast iteration

v1.0
Stable core model
Stable Codex integration
Reliable project state
```

不要等所有高级功能完成才公开。

# Final Roadmap Principle

每个 Phase 开始前都必须问：

> 这个阶段是否让 AI 黑盒开发过程更加透明？

以及：

> 它是否帮助用户更快、更可信地知道项目做到哪里了？

如果答案是否：

> 延后。
