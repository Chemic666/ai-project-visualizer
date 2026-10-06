# 第二步：锁定技术栈与 Monorepo 方案

## 1. 这一阶段的目标

这一阶段**不开始开发正式功能**。

目标是先确定：

- 使用什么主语言；
- 使用什么 Runtime；
- 项目是否采用 Monorepo；
- Core、Codex Adapter、Storage、VS Code Extension 如何拆分；
- 使用什么测试体系；
- 数据如何本地持久化；
- 哪些技术现在明确不引入。

完成这一阶段后，后续 Work / Codex 不应在没有充分理由的情况下擅自更换核心技术栈。

# 2. 最终技术栈

| 层            | 技术选择                                | 作用                                    |
| ------------- | --------------------------------------- | --------------------------------------- |
| 主语言        | **TypeScript 7.x**                      | Core、Adapter、CLI、VS Code Extension   |
| Runtime       | **Node.js 24 LTS**                      | 本地运行环境                            |
| 包管理器      | **pnpm 12.x**                           | Workspace / Monorepo                    |
| 仓库形式      | **pnpm Monorepo**                       | 管理多个独立模块                        |
| 单元测试      | **Vitest**                              | Core、Adapter、Storage 测试             |
| 本地数据库    | **SQLite**                              | 保存项目状态、Timeline、Plan History 等 |
| SQLite Driver | **暂不锁定**                            | 后续通过 Spike 确认                     |
| IDE 界面      | **VS Code Extension API**               | 第一主要 UI                             |
| 复杂 UI       | **Webview 按需使用**                    | Overview、Timeline 等                   |
| 类型检查      | **TypeScript Compiler (**`**tsc**`**)** | 编译期类型检查                          |
| Bundle        | **esbuild**                             | VS Code Extension 等产物打包            |
| Lint          | **ESLint**                              | 静态代码检查                            |
| Format        | **Prettier**                            | 统一格式                                |
| 第一 Agent    | **Codex**                               | 首个正式适配对象                        |
| 核心架构      | **Core + Adapter + Surface**            | 保持 Agent 与 UI 解耦                   |
| 开源方向      | **Open-source developer tool**          | 后续面向开发者社区发布                  |

截至当前，项目采用 Node.js 24 LTS 与 TypeScript 7.x 稳定版本。具体 TypeScript patch 版本由项目的 package.json 与 pnpm-lock.yaml 锁定，不在架构文档中固定。

pnpm 当前已经进入 12.x 主线，适合作为 Monorepo 包管理器。

# 3. 为什么选择 TypeScript

AI Project Visualizer 天然位于下面这个技术生态中：

```
Codex
  ↓
JSON / JSON-RPC / Events
  ↓
Node.js
  ↓
VS Code Extension
  ↓
Webview / CLI
```

这些技术都与 JavaScript / TypeScript 生态高度契合。

因此使用 TypeScript 可以让：

```
Codex Event
    ↓
Codex Adapter
    ↓
Normalized Event
    ↓
Project Core
    ↓
VS Code UI
```

整条链路使用同一种语言。

## 3.1 为什么这里不优先使用 Java

Java 当然可以完成 Core。

但如果使用：

```
VS Code Extension
    ↓
TypeScript

然后

Java Core
```

就需要额外解决：

```
Node Process
    ↓
IPC / HTTP / RPC
    ↓
Java Process
```

由此增加：

- JRE 依赖；
- 多进程管理；
- IPC；
- 打包复杂度；
- 用户安装复杂度；
- Windows / macOS / Linux 发布问题；
- Debug 成本。

所以这里选择 TypeScript，不是因为 Java 不够强，而是：

> **技术栈应该服从产品，而不是为了使用某种语言强行增加系统复杂度。**

# 4. 为什么采用 Monorepo

AI Project Visualizer 最终不会只是一个 VS Code 插件。

至少存在这些独立部分：

```
AI Project Visualizer
│
├─ Project Core
├─ Codex Adapter
├─ Local Storage
├─ VS Code Extension
└─ CLI（未来）
```

如果全部塞入：

```
src/
```

很容易逐渐形成：

```
VS Code API
Codex API
SQLite
Progress Engine
Timeline
UI
```

互相依赖。

所以采用 Monorepo。

# 5. 推荐仓库结构

第一阶段建议：

```
ai-project-visualizer/
│
├─ apps/
│  ├─ vscode-extension/
│  └─ cli/                    # 后续阶段
│
├─ packages/
│  ├─ core/
│  ├─ codex-adapter/
│  └─ storage/
│
├─ experiments/
│  └─ codex-app-server/
│
├─ docs/
│
├─ PRODUCT.md
├─ ARCHITECTURE.md
├─ ROADMAP.md
├─ AGENTS.md
├─ DECISIONS.md
├─ COMPETITIVE.md
│
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

第一阶段只建立真正需要的模块。

暂时不要为了“未来可能需要”提前建立大量空包。

例如：

```
semantic/
verification/
analytics/
cloud/
team/
shared/
```

等真正出现明确需求后再拆。

# 6. Core 是整个项目的中心

目录：

```
packages/core/
```

负责：

```
Project
Phase
Task

Plan
Plan Change

Confirmed Progress
Estimated Progress

Timeline

Provenance
Confidence

User Correction
```

Core 是整个产品最重要的部分。

## 6.1 Core 的硬性要求

Core **不能知道 Codex 是什么**。

Core **不能知道 VS Code 是什么**。

Core **不能直接依赖 SQLite**。

理想结构：

```
Codex
    ↓
Codex Adapter
    ↓
Normalized Event
    ↓
Project Core
```

Core 看到的应该是：

```
session.started
plan.updated
task.started
task.completed
progress.changed
```

而不是：

```
thread/start
turn/completed
item/...
```

## 6.2 Core 应可以独立测试

例如：

```
engine.apply({
  type: "task.completed",
  taskId: "task-auth"
});
```

然后测试：

```
expect(project.confirmedProgress).toBe(...);
```

这个测试过程中：

- 不需要 Codex；
- 不需要 VS Code；
- 不需要真实数据库；
- 不需要联网。

这说明 Core 的边界是健康的。

# 7. Codex Adapter 的职责

目录：

```
packages/codex-adapter/
```

它只负责：

> **把 Codex 世界翻译成 AI Project Visualizer 世界。**

例如：

```
Codex
thread/start
```

转换为：

```
Visualizer
session.started
```

再比如：

```
Codex Plan
```

转换为：

```
plan.detected
plan.updated
```

## 7.1 为什么一定要 Adapter

以后如果支持：

```
Claude Code
OpenCode
Gemini CLI
```

架构可以变成：

```
Codex
    ↓
CodexAdapter
      │
      ▼
Project Core

Claude Code
    ↓
ClaudeCodeAdapter
      │
      ▼
Project Core

OpenCode
    ↓
OpenCodeAdapter
      │
      ▼
Project Core
```

而不是：

```
if Codex ...
else if Claude ...
else if OpenCode ...
```

散落在整个项目里。

# 8. Storage 的职责

目录：

```
packages/storage/
```

用于保存：

```
Project

Phase

Task

Session

Plan Snapshot

Plan Change

Timeline Event

Progress History

User Correction

Source Reference
```

Storage 不负责业务判断。

例如：

> 为什么项目现在是 61%？

这是 Core 的事情。

Storage 只是负责：

> 把 61% 及其状态持久化。

# 9. 为什么选择 SQLite

Visualizer 的数据天然是关系型的：

```
Project
   ├─ Phase
   │    └─ Task
   │
   ├─ Session
   │    └─ Event
   │
   └─ Timeline
```

同时我们要求：

- Local-first；
- 不需要用户部署数据库；
- 不需要 Docker；
- 可以保存大量历史数据；
- 查询 Timeline 方便；
- Windows / macOS / Linux 都能使用。

SQLite 很适合。

# 10. SQLite 不保存完整用户源代码

这是一个重要边界。

数据库可以保存：

```
Task ID

Task Name

File Reference

Timestamp

Progress

Plan Snapshot

Event Type

Evidence Reference
```

但不应该默认保存：

```
整个 Java 文件内容
整个项目源码
用户完整 Repository
```

Visualizer 是：

> **项目状态观察工具。**

不是：

> **代码云备份系统。**

这也符合 Privacy-first 原则。

# 11. 为什么暂时不锁 SQLite Driver

SQLite 已经确定。

但具体 Node Driver 暂时不锁。

候选可能包括：

```
better-sqlite3

node:sqlite

其他成熟实现
```

原因是 VS Code Extension 最终需要面对：

```
Windows
macOS
Linux

x64
ARM64

VSIX Packaging
Extension Host
```

部分 SQLite Driver 使用 native module。

如果现在直接拍板，很可能后面才遇到：

- VSIX 打包失败；
- ARM64 问题；
- Electron / Node ABI 问题；
- GitHub Actions 多平台构建问题。

因此后面专门做一个：

```
SQLite Driver Spike
```

实际验证后再确定。

# 12. pnpm 的作用

我们使用 pnpm 主要不是为了“下载依赖快”。

真正原因是：

> **Workspace / Monorepo 管理。**

未来可能存在：

```
@apv/core
@apv/codex-adapter
@apv/storage
@apv/vscode-extension
```

VS Code Extension 可以依赖：

```
@apv/core
```

Codex Adapter 同样可以依赖：

```
@apv/core
```

内部依赖使用：

```
workspace:*
```

避免误下载 npm 上的其他版本。

# 13. VS Code Extension 的定位

VS Code Extension 是：

> **最佳 Visual Surface。**

不是产品 Core。

结构应该是：

```
Project Core
     ↓
VS Code Extension
```

而不是：

```
VS Code Extension
     ↓
项目所有业务逻辑
```

# 14. VS Code 第一阶段 UI

第一阶段大致：

```
AI Project Visualizer
│
├─ Overview
├─ Plan
├─ Timeline
└─ Activity
```

## 14.1 Overview

回答：

> **现在项目做到哪里？**

显示：

```
Confirmed Project Progress

Current Phase

Current Task

Estimated Task Progress

Confidence

Recent Plan Change
```

## 14.2 Plan

适合使用 VS Code TreeView：

```
✓ Phase 1 · Foundation
│
├─ ✓ Core Model
└─ ✓ Storage

▶ Phase 2 · Authentication
│
├─ ✓ Login
├─ ▶ JWT
└─ ○ Refresh Token

○ Phase 3 · Orders
```

## 14.3 Timeline

用于：

```
Plan Changed

Task Started

Progress Changed

Task Completed

User Correction
```

而不是简单复制 Codex 原始日志。

## 14.4 Activity

作为高级视图显示：

```
Read
Edit
Search
Command
Test
```

但不是首页核心。

# 15. Webview 按需使用

第一版不应该一开始就搭：

```
React
Redux
Tailwind
Router
复杂前端工程
```

优先使用 VS Code 原生能力。

只有：

```
Overview
Timeline
Why X%?
复杂图表
```

真正需要更丰富布局时再使用 Webview。

因此当前：

> **不锁 React。**

未来需要时再正式决策。

# 16. 测试体系

采用：

```
Vitest
```

主要分三层。

## 16.1 Unit Test

重点测试 Core：

```
Plan Diff

Task Weight

Confirmed Progress

Estimated Progress

Progress Regression

Provenance

Confidence

User Correction

Timeline Generation
```

例如：

```
新增 Confirmed Task
        ↓
总权重增加
        ↓
Confirmed Progress 下降
```

必须有测试。

## 16.2 Integration Test

主要测试：

```
Codex Adapter
       ↓
Normalized Event
       ↓
Project Core
```

确保真实 Agent 数据能够正确影响 Project State。

## 16.3 E2E Test

后期测试：

```
Codex
   ↓
Visualizer
   ↓
Project State
   ↓
VS Code UI
```

例如：

```
Codex 修改 Plan
        ↓
Visualizer 捕获
        ↓
Plan View 更新
        ↓
Progress 重新计算
        ↓
Timeline 出现 Plan Changed
```

# 17. Build 方案

TypeScript 本身负责：

```
类型检查
```

使用：

```
tsc
```

VS Code Extension 等需要 Bundle 的部分使用：

```
esbuild
```

形成：

```
TypeScript Source
      ↓
tsc --noEmit
      ↓
类型检查
```

以及：

```
TypeScript Source
      ↓
esbuild
      ↓
Extension Bundle
```

不让 TypeScript Compiler 同时承担所有打包职责。

# 18. 模块体系

项目采用：

> **ESM-first**

也就是新代码优先使用现代 ES Module：

```
import { ... } from "...";
```

而不是围绕：

```
require(...)
```

设计。

但最终具体 VS Code Extension 打包格式由实际 Extension Host 兼容性决定。

这里的原则是：

> 源码架构按现代 ESM 设计，发布产物根据运行环境处理。

# 19. Semantic Analysis 暂时不进入核心技术链

后续 Semantic Analysis 可以提供：

```
动态摘要

语义代码变更

行为影响分析

Why?
```

但它默认关闭。

所以第一阶段不能出现：

```
Project Core
    ↓
必须调用 LLM
    ↓
才能计算项目状态
```

正确的是：

```
Core
可以完全独立运行
```

Semantic Analysis 后面作为：

```
Optional Enhancement
```

加入。

# 20. 当前明确不引入的技术

第一阶段不要加入：

```
React

Next.js

Electron

Docker

Redis

PostgreSQL

Kafka / RabbitMQ

微服务

云端后端

用户账户系统

云同步

复杂 ORM

大型状态管理框架
```

除非后续出现明确需求。

原则：

> **不用“也许以后有用”作为引入技术的理由。**

# 21. 依赖方向

这是以后开发必须遵守的重要关系。

推荐：

```
              ┌─────────────┐
              │    Core     │
              └──────▲──────┘
                     │
          ┌──────────┼──────────┐
          │                     │
   Codex Adapter            Storage
          ▲                     ▲
          │                     │
          └──────────┬──────────┘
                     │
              VS Code Extension
```

更准确地说：

```
core
↑
├─ codex-adapter
├─ storage
└─ vscode-extension
```

Core 位于依赖图最里面。

Core 不允许反向依赖：

```
vscode
codex
sqlite
```

# 22. 第一阶段 package 数量控制

正式启动时优先只有：

```
packages/
├─ core/
├─ codex-adapter/
└─ storage/

apps/
└─ vscode-extension/
```

CLI 可以稍后再建。

这样第一版不会形成：

```
12 个 packages
每个只有 2 个文件
```

这种假模块化。

# 23. 最终架构图

```
                    Codex
                      │
                      ▼
              ┌───────────────┐
              │ Codex Adapter │
              └───────┬───────┘
                      │
                Normalized Events
                      │
                      ▼
        ┌────────────────────────────┐
        │        Project Core        │
        │                            │
        │ Project                    │
        │ Phase                      │
        │ Task                       │
        │ Plan                       │
        │ Progress                   │
        │ Timeline                   │
        │ Provenance                 │
        │ Confidence                 │
        │ User Correction            │
        └──────────────┬─────────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
          Local Storage     VS Code UI
             SQLite
```

未来：

```
Codex ──────────┐
Claude Code ────┤
OpenCode ───────┼→ Adapter → Project Core
Gemini CLI ─────┘
```

# 24. 技术选型最终结论

## 已锁定

```
Language
TypeScript 7.x

Runtime
Node.js 24 LTS

Package Manager
pnpm 12.x

Repository
pnpm Monorepo

Testing
Vitest

Persistence
SQLite

Primary UI
VS Code Extension

Build
tsc + esbuild

Lint
ESLint

Formatting
Prettier

First Agent
Codex

Architecture
Core + Adapter + Surface
```

## 暂不锁定

```
SQLite Driver

React / Webview Framework

Semantic AI Provider

CLI Framework

Verification Provider
```

这些将在真正出现需求或者对应 Spike 后决定。

# 25. 当前最重要的工程原则

后续开发必须坚持：

1. **Core 不依赖 Codex。**
2. **Core 不依赖 VS Code。**
3. **Core 不依赖具体 SQLite Driver。**
4. **Codex 通过 Adapter 接入。**
5. **VS Code 只是 Surface。**
6. **SQLite 不默认保存完整用户源码。**
7. **Semantic Analysis 不是核心运行依赖。**
8. **不为了未来可能的需求提前引入技术。**
9. **Core 业务逻辑必须可以独立测试。**
10. **第一版 Codex-first，但架构不是 Codex-only。**

# 26. 第二步完成后的状态

完成这一阶段后，我们已经明确：

```
产品做什么
    ✓

核心架构
    ✓

开发路线
    ✓

Agent 开发规则
    ✓

核心技术栈
    ✓

Monorepo 结构
    ✓
```

接下来再进入：

> **第三步：建立重大决策记录。**

也就是把之前已经拍板的：

```
Observer, not Orchestrator

Local-first

Codex-first, not Codex-only

Semantic Analysis 默认关闭

Confirmed Progress ≠ Estimated Progress

Progress 可以倒退

Visualizer 可以被用户纠正
```

这些决策正式整理出来，避免后续 Agent 又重新争论、推翻已经确定的方向。