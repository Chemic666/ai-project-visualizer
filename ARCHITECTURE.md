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

第一版主要支持 Codex，但 Core 不得依赖 Codex 专有数据模型。

# 2. Architecture Principles

## 2.1 Core First

核心逻辑不得直接写进 VS Code Extension。

错误：

```
VS Code Extension
├─ Codex parsing
├─ Plan parsing
├─ Progress calculation
├─ Storage
└─ UI
```

正确：

```
Core
├─ Project Model
├─ State Engine
├─ Progress Engine
├─ Timeline Engine
└─ Storage

Adapters
└─ Codex

Surfaces
└─ VS Code
```

## 2.2 Adapter Isolation

任何 Agent-specific 行为必须进入：

```
adapters/
```

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

系统核心采用事件驱动。

例如：

```
PlanDetected
PlanChanged
TaskStarted
TaskCompleted
AgentReportedDone
CommandStarted
CommandFinished
TestResultChanged
UserCorrection
SessionStarted
SessionEnded
```

Project State Engine 消费事件并更新状态。

# 3. High-Level Architecture

```
┌───────────────────────────────────────────┐
│              Coding Agents                │
│                                           │
│ Codex    Claude Code    OpenCode   ...    │
└───────────────────┬───────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────┐
│               Agent Adapters              │
│                                           │
│ CodexAdapter                              │
│ ClaudeAdapter         future              │
│ OpenCodeAdapter       future              │
└───────────────────┬───────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────┐
│          Normalized Event Bus             │
└───────────────────┬───────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────┐
│             Project Core                  │
│                                           │
│ Project State Engine                      │
│ Plan Engine                               │
│ Progress Engine                           │
│ Timeline Engine                           │
│ Confidence / Provenance Engine             │
│ Correction Engine                         │
│ Storage                                   │
└───────────────────┬───────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     VS Code       CLI        Future Web
```

# 4. Repository Structure

推荐 Monorepo：

```
ai-project-visualizer/
│
├─ packages/
│  │
│  ├─ core/
│  │  ├─ model/
│  │  ├─ events/
│  │  ├─ state/
│  │  ├─ progress/
│  │  ├─ timeline/
│  │  ├─ provenance/
│  │  └─ corrections/
│  │
│  ├─ codex-adapter/
│  │  ├─ app-server/
│  │  ├─ plugin/
│  │  ├─ parser/
│  │  └─ normalizer/
│  │
│  ├─ storage/
│  │
│  ├─ semantic/
│  │
│  └─ shared/
│
├─ apps/
│  │
│  ├─ vscode-extension/
│  └─ cli/
│
├─ experiments/
│  └─ codex-app-server/
│
├─ docs/
│
├─ PRODUCT.md
├─ ARCHITECTURE.md
├─ ROADMAP.md
├─ CONTRIBUTING.md
└─ README.md
```

# 5. Core Domain Model

## Project

```
interface Project {
  id: string
  name: string
  rootPath: string

  phases: Phase[]

  currentPhaseId?: string
  currentTaskId?: string

  confirmedProgress: number

  sessions: AgentSession[]

  createdAt: string
  updatedAt: string
}
```

## Phase

```
interface Phase {
  id: string
  title: string

  status: WorkStatus

  weight: number

  tasks: Task[]

  sourceRefs: SourceReference[]
}
```

## Task

```
interface Task {
  id: string
  phaseId: string

  title: string
  description?: string

  status: WorkStatus

  weight: number

  estimatedProgress?: number
  confidence?: number

  provenance: Provenance

  sourceRefs: SourceReference[]

  createdAt: string
  updatedAt: string
}
```

# 6. Status Model

建议：

```
type WorkStatus =
  | "todo"
  | "in_progress"
  | "completed"
  | "verified"
  | "blocked"
```

## completed

表示：

> Agent 声称任务完成。

## verified

表示：

> Visualizer 获得足够 Evidence 后确认任务完成。

v1 可以先支持状态模型，但 Verification Engine 不要求完整实现。

# 7. Provenance Model

任何重要状态必须知道：

> 这个结论是谁得出的？

```
type ProvenanceType =
  | "observed"
  | "agent_reported"
  | "visualizer_inferred"
  | "user_confirmed"
```

示例：

```
Current Task
Authentication

Source:
Visualizer Inferred

Confidence:
72%
```

用户修改：

```
Source:
User Confirmed
```

# 8. Confidence Model

不是所有推断都有相同可信度。

例如：

```
Current Task
Task 3.4

Confidence
65%
```

第一版不需要复杂机器学习模型。

可以采用 rule-based scoring：

```
Plan explicitly selected       +40
Relevant files modified        +20
Agent message matches task     +20
Recent activity matches scope  +10
User correction history        +10
```

最终标准化：

```
0–100%
```

# 9. Normalized Event Model

所有 Adapter 输出统一事件。

```
interface ProjectEvent {
  id: string

  type: ProjectEventType

  projectId: string
  sessionId?: string

  timestamp: string

  source: EventSource

  payload: unknown
}
```

# 10. Event Types

第一阶段至少支持：

```
session.started
session.ended

plan.detected
plan.updated

phase.detected
phase.status_changed

task.detected
task.started
task.status_changed
task.completed

agent.message

activity.read
activity.edit
activity.command
activity.test

progress.changed

user.correction

timeline.annotation
```

不是所有 event 都必须出现在 UI。

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

Plan Engine 负责把：

```
Codex Plan
PLAN.md
TODO.md
Agent message
```

转换为：

```
Project
→ Phase
→ Task
```

同时保留：

```
SourceReference
```

不能直接丢失原始来源。

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

## Confirmed Progress

公式：

```
completed weighted tasks
────────────────────────
total confirmed task weight
```

## Estimated Task Progress

当前 Task 可以独立拥有：

```
estimatedProgress
confidence
```

例如：

```
~42%
Confidence 71%
```

不得直接冒充 Confirmed Progress。

# 16. Progress Regression

Plan 发生扩张：

```
68% → 61%
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
68% → 61%

Reason:
Plan expanded.
```

# 17. Explainable Progress

Progress Engine 不仅返回：

```
61%
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

+ Refresh Token

18:43
Progress changed

68% → 64%
```

# 19. User Correction Engine

用户必须能够修改：

```
Current Task
Task Association
Task Weight
Incorrect Inference
```

Correction 本身也写 Timeline。

例如：

```
18:52
User corrected task association

Task 3.2
→ Task 3.4
```

# 20. Storage Architecture

第一版采用：

> Local-first storage.

推荐 SQLite。

理由：

- 项目状态关系明确；
- Timeline 数据量会增长；
- 查询方便；
- 无需安装外部数据库；
- 可以支持迁移；
- 比不断维护大型 JSON 更可靠。

# 21. Suggested Tables

```
projects
phases
tasks
sessions
events
timeline_events
plan_snapshots
source_references
user_corrections
settings
```

# 22. Raw Event Retention

Raw events 可采用：

```
Hot storage
→ 最近 N 天

Compact storage
→ 聚合后的 meaningful events
```

v1 可以先全部保留，并提前设计 retention interface。

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

Codex Adapter 负责：

```
Codex-specific protocol
        ↓
Normalized Project Events
```

包括：

```
Codex Plugin
Codex app-server
```

具体接入方式可并存。

# 25. Codex Plugin Layer

Codex Plugin 优先负责：

- Agent lifecycle；
- Plan；
- Session；
- Task state；
- Agent messages。

不应该承担：

- Project Progress；
- Timeline；
- UI；
- Storage business logic。

这些属于 Core。

# 26. App-Server Layer

已有实验继续保留。

用途：

```
Realtime activity
Read / Edit / Run / Test
Thread / Turn
```

以后成为：

```
CodexActivitySource
```

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
└─ Activity
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
Estimated Task Progress
Confidence
Recent Plan Change
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

必须独立：

```
packages/semantic/
```

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

确保社区能够扩展。

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