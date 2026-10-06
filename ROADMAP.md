# AI Project Visualizer — Roadmap

> **Make AI coding transparent.**

Roadmap 的目标不是尽快堆满功能，而是逐步建立一个可靠的：

> **AI Coding Project Observation Layer**

Phase 0 — Product & Engineering Foundation

✓ 固化产品定义
✓ 固化架构
✓ 固化 Roadmap
✓ 固化 Agent Rules

□ 创建全新仓库
□ 锁定技术栈
□ 创建 DECISIONS.md
□ 创建 UX 低保真方案
□ 创建 v0.1 Acceptance Scenarios
□ 完成 Competitive Research
□ 记录旧 Codex app-server 研究结论
□ 列出所有必须重新验证的 Codex 假设

# Phase 1 — Core Foundation

目标：

建立完全独立于 UI 和 Codex 的 Project Core。

实现：

```
Project
Phase
Task
Session
Event
TimelineEvent
Provenance
SourceReference
```

完成：

- Core package
- Domain model
- Status model
- Provenance model
- Event model
- Basic event bus
- Unit tests

验收：

```
没有 VS Code
没有 Codex
```

也能：

```
创建 Project
添加 Phase
添加 Task
处理事件
生成 Project State
```

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

Project State 可以恢复。

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

- Plan parser abstraction
- Plan source model
- Confirmed / Tentative / Idea
- Plan snapshots
- Plan diff
- Added task detection
- Removed task detection
- Changed task detection

输出：

```
PlanChanged Event
```

# Phase 4 — Progress Engine

目标：

回答：

> 项目做到哪里了？

实现：

- Task weight
- Phase weight calculation
- Confirmed project progress
- Progress regression
- Progress change reason
- Explainable progress

例如：

```
68% → 61%

Reason:
Plan expanded
```

验收：

每个进度都能回答：

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
- Timeline correction events

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

第一次接入真实 Agent。

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

# Phase 8 — Codex App-Server Research & Adapter Integration

重新建立最小实验
↓
确认当前 Codex app-server 协议
↓
记录事件格式
↓
建立 Normalizer
↓
接入 CodexAdapter

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
- User correction integration

# Phase 10 — VS Code Extension Shell

目标：

第一次真正出现可安装 UI。

实现：

```
Activity Bar
└─ AI Project Visualizer
```

Views：

- Overview
- Plan
- Timeline
- Activity

第一版不要求视觉华丽。

优先保证：

```
信息层级正确
状态准确
响应实时
```

# Phase 11 — v0.1 Usable Release

这是第一个可以真正给别人安装的版本。

必须具备：

## Automatic Plan Capture

```
Codex Plan
→ Phase / Task
```

## Project Progress

```
Confirmed Progress
Current Phase
Current Task
```

## Plan Change History

```
Original
→ Changed
```

## Timeline

```
Meaningful development events
```

## User Corrections

```
Task
Weight
Association
```

v0.1 不需要 Semantic Analysis。

# Phase 12 — UX Refinement

目标：

实现真正的：

> 5-second understanding.

优化：

- Information hierarchy
- Progress visualization
- Status icons
- Confidence display
- Provenance display
- Why X%?
- Plan change presentation
- Timeline filtering
- Empty state
- First install experience

# Phase 13 — Estimated Task Progress

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

开始区分：

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