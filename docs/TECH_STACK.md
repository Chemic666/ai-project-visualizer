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
| 主语言        | **TypeScript 6.0.3**                    | Core、Adapter、CLI、VS Code Extension   |
| Runtime       | **Node.js 24 LTS**                      | 本地运行环境                            |
| 包管理器      | **pnpm 12.x**                           | Workspace / Monorepo                    |
| 仓库形式      | **pnpm Monorepo**                       | 管理多个独立模块                        |
| 单元测试      | **Vitest**                              | Core、Adapter、Storage 测试             |
| 本地数据库    | **SQLite**                              | 保存项目状态、Timeline、Plan History 等 |
| SQLite Driver | **暂不锁定**                            | 后续通过 Spike 确认                     |
| IDE 界面      | **VS Code Extension API**               | 第一主要 UI                             |
| 复杂 UI       | **Webview 按需使用**                    | Overview、Timeline 等                   |
| 类型检查      | **TypeScript Compiler (`tsc`)** | 编译期类型检查                          |
| Bundle        | **esbuild**                             | VS Code Extension 等产物打包            |
| Lint          | **ESLint + typescript-eslint 8.71.1**    | 静态代码检查；parser 版本见 §2.1         |
| Format        | **Prettier**                            | 统一格式                                |
| 第一 Agent    | **Codex**                               | 首个正式适配对象                        |
| 核心架构      | **Core + Adapter + Surface**            | 保持 Agent 与 UI 解耦                   |
| 开源方向      | **Open-source developer tool**          | 后续面向开发者社区发布                  |

D-039 将当前初始实现基线明确为 TypeScript 6.0.3；D-032 的 TypeScript 7.x 选择仅作为历史保留，其余已批准选型继续有效。本仓库尚无 manifests/lockfile；已核对的发布版本与支持范围见 §2.1，不能据此宣称完整工具链运行验证通过。Phase 1 初始化前仍须确认其余工具的 compiler/package identity、确切版本及 Vitest/esbuild/ESLint 组合兼容性，记录证据后再锁版本；选型需要改变时新增明确决策。

Node.js 24 是开发运行环境目标，不保证 VS Code Extension Host 使用相同 Node/ABI；目标宿主须单独验证。本次不安装依赖或执行运行验证。

## 2.1 Phase 1 启动前版本核对记录

2026-10-07：记录用户提供的已验证发布版本/支持范围结果。本次修订另查阅了 [typescript-eslint 官方依赖支持范围](https://typescript-eslint.io/users/dependency-versions/)，未安装或运行这些依赖。

| 工具 | 已核对版本 | 核对结论 |
| --- | --- | --- |
| `typescript` | **6.0.3** | TypeScript 6 当前可用版本；位于 `>=4.8.4 <6.1.0`，采用为初始实现基线 |
| `typescript-eslint` | **8.71.1** | 当前正式工具链的 TypeScript 支持范围为 `>=4.8.4 <6.1.0` |
| `@typescript-eslint/parser` | **8.71.1** | 同一 TypeScript 支持范围，与上项保持版本一致 |

启动前核对中的 TypeScript 7.0.2 不在该范围内，因此当前不采用。版本/声明范围核对已完成；安装后的 typecheck、Lint、Vitest、esbuild 与宿主运行验证仍 **Technical Verification Pending**。本记录不宣称 ESLint、pnpm、Vitest、esbuild 或 Prettier 的确切版本及完整组合已验证。

未来 typescript-eslint 正式版明确支持 TS7 后可以重新评估，并按 D-039 的 Revisit When 验证迁移组合、记录新决策。这是生态兼容性选择，不是永久拒绝 TypeScript 7。

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

Phase 0 维持文档仓库，竞争文档实际路径为 `docs/COMPETITIVE.md`。经授权开始 Phase 1 时只建立 workspace 必要配置和 `packages/core/`（src/tests）。不预建其他 packages。

Phase 2 才建立 storage；Phase 7 才建立已验证接入路径的 codex-adapter；Phase 10 才建立 vscode-extension；CLI Phase 19。独立 Spike 经授权才建立 disposable experiments；方案在 docs/spikes/，不是生产模块。

不提前创建 semantic、shared、verification、analytics、cloud 或 provider registries。Monorepo 已决定，但本轮不初始化。

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
Estimated Progress（Phase 13；非 v0.1/Phase 1）

Timeline

Provenance
Confidence

User Correction
```

Core 是整个产品最重要的部分。

## 6.1 Core 的硬性要求

Core 不导入 Codex protocol、vscode、SQLite driver 或 Storage 实现；不要求 LLM、联网或实际数据库。

Core 只消费 source-aware normalized events 和 user corrections，保留关键结论独立 assertion/provenance/confidence（ARCHITECTURE §5–10）。Agent 身份是来源元数据而不是专有协议类型。未来 estimated 数值在 Phase 13，不能阻塞 Phase 1。

实际持久化在 storage package，依赖 Core 所需契约；host 组合 Core/Adapter/Storage，并提供 repo 外 app storage 位置。依赖图见 §21。

## 6.2 Core 应可以独立测试

例如：

```
// 示意：其余 envelope/source 字段在 fixture 中按 ARCHITECTURE §9 提供
engine.apply({
  type: "task.status_reported",
  payload: { taskId: "task-auth", status: "completed", completionReportRef: "fixture-report" }
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

以下转换是概念示例，当前 Unverified：thread/start 能否表示外部 Session、能否获取既有 Session 的 Plan 须按 D-038 Spike 验证；不能据示例宣称实现。

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

Storage 实现持久化、事务、迁移和恢复读取；编译依赖 Storage → Core。Core 计算状态/进度/解释，不能反向依赖 Storage/SQLite。

保留来源断言、plan revisions、纠正及失效历史、versioned snapshots 和处理 cursor；current state/Timeline 为派生解释，不能只有最终数字。关联更新需要原子持久化和幂等恢复；Phase 2 定义最小 schema 与 crash/restart 验证，不提前实现全部未来表或 ORM。

Host 提供存储位置和生命周期；Storage 不读取 vscode Workspace API、不实施业务推断。具体 driver/宿主 packaging 和同项目多窗口写入策略仍 Technical Verification Pending。

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
- Windows / macOS / Linux 是目标，实际支持矩阵仍待 driver/host Spike 验证。

SQLite 很适合。

# 10. SQLite 不保存完整用户源代码

默认不持久化完整源码、未筛选 raw edit/command output、私有 prompt/messages。仅保存 allowlist 下的必要归一化元数据、Plan Snapshot、状态/权重/完成依据的最小记录、Evidence/Source references 和纠正历史。

“normalized”不表示 payload 无敏感内容；需在边界筛选/脱敏。原始传输内容作必要瞬时解析，不默认日志/数据库保存。具体 bounded retention/删除期限在 Phase 2/真实采集前决定并验证，当前不承诺默认 7 天或无限保存。来源与纠正的最小解释依据须保留。

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

实际验证后再确定。当前 Technical Verification Pending。测试必须在实际 Extension Host/VSIX 下运行，不能以开发 Node.js 24 的成功替代宿主兼容性。

验证矩阵须记录 VS Code 版本、宿主 Node/ABI、OS/architecture、bundle format、driver 和安装/restart 结果。当前 Windows/macOS/Linux、x64/ARM64 是目标候选，尚未确立完整支持；Remote SSH/WSL/container/web host 范围待明确决策，不从 local-first 自动推导。

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

这里指 Phase 10/11 UI，不是 Phase 1 Core。v0.1 核心为 Overview/Plan/Timeline/Correction/Why/必要 Settings；Activity 为 advanced/P1：

```
AI Project Visualizer
│
├─ Overview
├─ Plan
├─ Timeline
└─ Activity (advanced/P1)
```

## 14.1 Overview

回答：

> **现在项目做到哪里？**

显示：

```
Confirmed Project Progress

Current Phase

Current Task

Current Task Confidence / Provenance

Recent Plan Change
```

## 14.2 Plan

适合使用 VS Code TreeView：

```
◐ Phase 1 · Foundation
│
├─ ◐ Core Model
└─ ◐ Storage

▶ Phase 2 · Authentication
│
├─ ◐ Login
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

v0.1 advanced/P1，实际事件能力待 Spike 验证；不是 Phase 10 发布最低 UI 条件。

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

Estimated Progress（Phase 13；非 v0.1/Phase 1）

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

```text
codex-adapter → core
storage → core
host → core / codex-adapter / storage
surface → host 或 core 的公开契约
```

这是编译依赖；数据流中的 Core ↔ persistence contract ↔ Storage 不表示 Core import Storage。Host 可以位于 Extension 的组合入口，不需要额外 package。vscode 只负责宿主/展示 API；领域状态与纠正政策在 Core。

# 22. 第一阶段 package 数量控制

Phase 1 仅 core；Storage、Adapter、Extension 随 Phase 2、7、10 建立，参见 §5。未来扩展点先记录意图，不创建空 provider/shared packages。本次不初始化任何包。

# 23. 最终架构图

以下是目标数据流而非编译依赖；图中的 Codex 接入当前 Unverified，Core → Local Storage 通过契约和 Host 组合。

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

“已锁定”表示方向已接受，不代表 major 版本可用性/驱动/发布目标验证通过；初始化门槛见 §2，runtime/driver 门槛见 §11。

## 已锁定

```
Language
TypeScript 6.0.3 (D-039)

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
ESLint + typescript-eslint 8.71.1
@typescript-eslint/parser 8.71.1

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

以下是历史规格准备状态，非技术验收结果；Phase 0 remediation 后的启动门槛以 ROADMAP Phase 0/1 与 PHASE_0_REVIEW 的追加记录为准。

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

Confirmed Progress ≠ Estimated Progress（始终分离；数值估算 Phase 13）

Progress 可以倒退

Visualizer 可以被用户纠正
```

这些决策正式整理出来，避免后续 Agent 又重新争论、推翻已经确定的方向。
