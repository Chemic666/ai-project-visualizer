> 本轮规格修订（2026-10-07）按 D-034–D-038。v0.1 与 Future 标记具有范围含义；所有 mockup 是要求，不是技术/UX 验证结果。

# 第四步：UX 低保真原型设计

## 1. 这一阶段要解决什么

前三步解决的是：

```
产品是什么
↓
技术怎么选
↓
哪些重大原则已经拍板
```

第四步开始解决：

> **这个产品实际用起来是什么感觉？**

也就是：

```
用户安装插件
↓
打开项目
↓
Codex 开始工作
↓
Visualizer 捕获项目状态
↓
用户看到什么
↓
用户怎么理解
↓
用户怎么纠正
```

这一阶段暂时不考虑：

- Logo；
- 品牌配色；
- 动画效果；
- 精美图标；
- 营销截图。

重点只有：

> **信息结构和操作流程。**

# 2. UX 核心目标

整个 Visualizer 的第一设计原则：

> **用户打开插件后，5 秒内知道项目现在做到哪里了。**

因此 UI 的优先级不能平均分配。

首页必须首先回答：

1. 项目整体进度多少？
2. 当前在哪个 Phase？
3. 当前正在处理哪个 Task？
4. 当前 Task 判断有多可靠？（数值完成估算留至 Phase 13）
5. 最近有没有重大 Plan 变化？
6. 最近有哪些意义事件？（Attention Signals 后置）

而不是优先展示：

```
Thread ID
Session ID
Tool calls
Read count
Edit count
Raw JSON
```

# 3. 产品的一级导航

v0.1 核心导航为 Overview / Plan / Timeline；Activity 为 advanced/P1，存在能力时才开放。以下展示包括可选项：

```
AI Project Visualizer

├─ Overview
├─ Plan
├─ Timeline
└─ Activity
```

辅助 Settings 属于 v0.1；Project/Session Selector 为后续设计，第一版只展示已可靠归属的当前项目。以下导航是长期结构：

```
Settings
Project / Session Selector
```

所以总体：

```
AI Project Visualizer
│
├─ Overview        ← 默认首页
├─ Plan
├─ Timeline
├─ Activity
│
├─ Settings
└─ Project Selector
```

# 4. Overview —— 最重要的页面

v0.1 示例（不是已实现界面）：

```text
AI PROJECT VISUALIZER
my-project                 Codex: observed Session state
Confirmed Project Progress: 64%    [Why 64%?]
Current Phase: Authentication
Likely Current Task: JWT Authorization
Current Task Confidence: 65% — association rule score
Source: Visualizer Inferred       [Correct]
Recent Plan Change: + Refresh Token (3), + Token Revocation (2)
Progress: 71.1% → 64% — Plan expanded
Recent Timeline: meaningful changes / completion reports / corrections
```

例中 completed weight=32、total 45→50。v0.1 不显示 Estimated Task Progress 数字或占位。Confidence 不表示任务已完成多少。若为人工选择则显示 User Confirmed，不伪造算法 100%。未知/歧义/断连按 §24–28 呈现。

# 5. Overview 信息优先级

v0.1 顺序：Confirmed Project Progress + Why；Current Phase / Current Task；关联 Confidence / Provenance / Correct；Recent Plan Change / Progress Change；3–5 条意义 Timeline。

没有正式计划/权重则显示 unavailable 原因，不用 0% 或伪造进度。任务部分完成数值属于 Phase 13，不属于这一版的信息层级。五秒理解是人工验收目标，并非当前已通过的测试或数据传输时延承诺。

# 6. Confirmed 与 Estimated 的视觉区分

D-034：v0.1 不实现 Estimated Task Progress 数值；必须保证关联 Confidence/普通活动/部分完成推断不进入正式进度分子。

下列为 Phase 13 独立展示示例，非 Acceptance Scenario 13 的计划扩张计算。

Phase 13 后续 UI 才会显示 Confirmed Project Progress 64% 与 Estimated Current Task ~47% 两个独立数字，并分别标注 estimate confidence、来源及解释。association Confidence 是第三个独立概念，不能复用为 estimate confidence。

# 7. Why X%?

v0.1 点击 Why 64% 显示：

```text
Completed Weight: 32
Total Confirmed Weight: 50
32 / 50 = 64%
Completed: ◐ Agent Reported COMPLETED / ✓ evidence-backed VERIFIED
Remaining: task / weight / status source
Recent Change: total weight 45 → 50
+ Refresh Token (3), + Token Revocation (2)
Previous: 71.1%     Current: 64%     Reason: Plan expanded
```

每条完成项展示其声明或验证依据/时间/来源；不能将 Agent Reported 包装成 Verified。当前 task 未完成不按部分量入分子；所有变化关联 plan/status/weight revision。v0.1 不需要数值 task estimate 或语义分析。

# 8. Plan 页面

v0.1 展示 Project → Phase → Task：

```text
◐ Phase 1 · Foundation (reported complete, verification unknown)
  ◐ Repository setup
  ◐ Core model
▶ Phase 2 · Authentication
  ◐ Login
  ▶ JWT Authorization
  ○ Refresh Token
  ○ Token Revocation
○ Phase 3 · Orders
```

✓ 只用于有独立验证依据的任务或适用任务全部 verified 的 Phase；不能仅凭 Agent 完成声明给绿色验证勾。

# 9. Plan 状态符号

第一版保持简单：

```
○ TODO
▶ IN PROGRESS
◐ COMPLETED
✓ VERIFIED
⚠ BLOCKED
```

其中：

```
◐ COMPLETED
```

表示：

> Agent 报告完成，但 Visualizer 还没有完成验证。

而：

```
✓ VERIFIED
```

表示有 Verification Evidence。

# 10. Plan Certainty

Plan 中不仅有状态，还有：

```
Confirmed
Tentative
Idea
```

不建议把它们和 Task Status 混为一谈。

例如：

```
CONFIRMED
○ Refresh Token

TENTATIVE
◇ OAuth Login

IDEA
· Passkey Support
```

视觉上：

```
Confirmed → 正常任务
Tentative → 更弱的样式
Idea      → 最弱、灰化
```

只有 Confirmed 默认参与正式 Progress。

# 11. 点击 Task 后看到什么

v0.1 Task Detail 显示 title、status 及其独立来源/完成依据、certainty 及 plan source/revision、weight 及其来源/人工调整历史、关联判断的 Confidence/依据、History、Edit Weight / Correct Association。

没有把所有字段共用为一个 Source。纠正关联后，status 仍可为 Agent Reported；v0.1 不显示 Current Estimate 数值。完整多来源 conflict UI 后置，但断言不能相互覆盖。

# 12. 用户修改 Task Weight

独立示例（对应 Acceptance Scenario 10，非 Scenario 13）；变化来自人工权重调整。

用户应该可以：

```
Weight 8
[Edit]
```

修改为：

```
Weight 12
```

修改后不能静默改变项目百分比。本例 completed=32、total=50，未完成 Authentication weight 8→12 后 total=54，所以 32/54=59.3%。

应该产生：

```
Progress changed

64% → 59.3%

Reason:
Task weight corrected by user.
```

同时 Timeline：

```
User corrected task weight

Authentication
8 → 12
```

# 13. 当前 Task 推断与纠正

这是产品里很重要的交互。

Visualizer：

```
Likely Current Task

JWT Authorization

Confidence
65%
```

旁边：

```
Correct
```

点击后：

```
Select Actual Task

○ Login
○ JWT Authorization
● Refresh Token
○ Token Revocation
```

用户选择：

```
Refresh Token
```

按 D-037/ARCHITECTURE §19 生效并持久保存；普通文件活动/新 Turn 不覆盖，明确失效必须记录依据。断连显示最后确认状态，不能直接撤销。之后：

```
Current Task
Refresh Token

Source
User Confirmed
```

同时 Timeline：

```
18:54
User corrected current task

JWT Authorization
→ Refresh Token
```

# 14. Timeline 页面

Timeline 不是 Raw Log。

它回答：

> **项目是怎么一步一步变成现在这样的？**

低保真：

```
┌────────────────────────────────────┐
│ TIMELINE                           │
├────────────────────────────────────┤
│ Today                              │
│                                    │
│ 18:54                              │
│ User corrected current task        │
│                                    │
│ JWT Authorization                  │
│ → Refresh Token                    │
│                                    │
│ ───────────────────────────────    │
│                                    │
│ 18:43                              │
│ Progress changed                   │
│                                    │
│ 71.1% → 64%                        │
│                                    │
│ Reason: Plan expanded              │
│                                    │
│ ───────────────────────────────    │
│                                    │
│ 18:42                              │
│ Plan changed                       │
│                                    │
│ + Refresh Token                    │
│ + Token Revocation                 │
│                                    │
│ ───────────────────────────────    │
│                                    │
│ 18:31                              │
│ JWT Authorization started          │
└────────────────────────────────────┘
```

# 15. Timeline 过滤

未来 Timeline 可能很长。

顶部可以有：

```
All
Plan
Tasks
Progress
Corrections
Errors
```

第一版即使暂时不实现复杂过滤，数据模型也应该支持事件分类。

# 16. Plan Change Detail

用户点击：

```
Plan changed
```

展开：

```
PLAN CHANGE

Before

Authentication
├─ Login
└─ JWT

After

Authentication
├─ Login
├─ JWT
├─ Refresh Token
└─ Token Revocation

Added

+ Refresh Token
+ Token Revocation

Source
Codex

Reason
Agent Reported: Session renewal requirements discovered.
（来源未提供时显示 Reason not provided，不生成事实化理由）

Effect

Project Progress
71.1% → 64%
```

这就是我们的重要差异化功能之一。

# 17. Activity 页面

v0.1 advanced/P1；以下为候选事件 fixture，不代表当前已取得全部 Codex signals。Test result 保留实际来源，不因命令名称或 Agent 总结自动 Verified。

Activity 页面负责保留原来的 Codex Visualizer 精神，但不作为产品中心。

低保真：

```
┌────────────────────────────────────┐
│ ACTIVITY                           │
├────────────────────────────────────┤
│ ● Codex working                    │
│                                    │
│ 18:54 Read                         │
│ AuthService.ts                     │
│                                    │
│ 18:55 Edit                         │
│ JwtValidator.ts                    │
│                                    │
│ 18:56 Command                      │
│ pnpm test                          │
│                                    │
│ 18:57 Test                         │
│ 8 passed · 1 failed                │
└────────────────────────────────────┘
```

用户可以查看细节。

但它不是首页。

# 18. Raw Activity 与 Meaningful Timeline 的区别

只在有来源依据时生成相应意义事件；语义“continued fixing”若推断必须标来源/不确定性，不把低级日志自动解释为完成。

例如 Codex：

```
Read A
Read B
Edit C
Run test
Edit C
Run test
```

Activity 页面显示原始过程。

Timeline 可能只生成：

```
JWT task progressed

Initial test failed
Agent continued fixing validation
```

它们不是同一种信息。

# 19. Semantic Analysis OFF

Settings：

```
Semantic Analysis
[ OFF ]
```

默认关闭。

不开启的时候：

Overview 依然可以显示：

```
Project Progress
Current Phase
Current Task
Plan Changes
Timeline
```

即核心产品不受影响。

# 20. 开启 Semantic Analysis 后

设置：

```
Semantic Analysis
[ ON ]
```

Overview 可以多出：

```
RECENT SEMANTIC ACTIVITY

During the last few minutes:

• JWT validation moved into the
  authentication interceptor.

• Three authorization tests were added.

• Expired token handling is still failing.

• Codex is currently adjusting expiration
  validation.
```

这是：

> Rolling Semantic Summary。

# 21. Semantic Change Detail

点击：

```
JWT validation moved into interceptor
```

显示：

```
Semantic Change

JWT validation is now performed before
controller business logic executes.

Impact

Unauthenticated requests can be rejected
earlier in the request lifecycle.

Evidence

AuthInterceptor.ts
+ validateToken(...)

AuthController.ts
- previous validation logic

Why?
[Show Evidence]
```

# 22. Semantic 信息必须有特殊标识

不要让用户把 AI 分析当事实。

例如：

```
AI Analysis
```

或者：

```
Semantic Inference
```

并显示：

```
Confidence
84%
```

必要时：

```
Why?
```

# 23. Attention Signals

Phase 17 后续 UX，非 v0.1 必须项。

不要使用夸张弹窗。

比如：

```
⚠ Attention

Codex reports this task complete,
but 2 tests are currently failing.
```

放在 Overview 一个小区域即可。

可能的 Signal：

```
Plan expanded
Tests failing
Low current-task confidence
Repeated build failure
Task completed but not verified
```

# 24. 空状态

这是经常被忽视的 UX。

刚安装：

```
AI PROJECT VISUALIZER

No active AI coding session.

Start working with Codex in this project.

目标：在受支持且通过 Spike 的路径自动识别（当前 Unverified）：

• project plan
• current task
• progress
• plan changes
```

不要显示一个完全空白的面板。

# 25. 没有 Plan 的情况

Codex 正在工作，但没有正式 Plan：

```
Project detected

Codex is active.

No confirmed project plan detected yet.

Activity observation is running.

Waiting for:
Plan / Tasks / Project structure
```

不能凭空制造假的 Project Progress。来源暂时不可读取时显示 observation unavailable，不把“没有读到”当作“没有计划”。

# 26. 低 Confidence

如果：

```
Current Task confidence < 某阈值
```

例如：

```
Likely Current Task

JWT Authorization

Confidence
38%

Not sure?

[Correct]
```

不要装作确定。

# 27. 多来源冲突

例如：

```
Codex Active Plan
Authentication = IN PROGRESS

TODO.md
Authentication = DONE
```

Plan UI：

```
⚠ Authentication

Status conflict detected

Codex Active Plan:
IN PROGRESS

TODO.md:
DONE

Unified State:
IN PROGRESS

[View Sources]
```

第一版不一定马上支持 `TODO.md`，但 UX 必须提前考虑这种情况。

# 28. Session 状态

顶部：

```
Codex ● Active
```

可能状态：

```
● Active
○ Idle
○ Finished (Session ended, not task verified)
⚠ Disconnected
```

Session state 必须来自实际可用 signal；断连不等于结束，最后确认的纠正/项目状态标 stale。映射尚待 Spike，不因 mockup 声称已实现。

但不要让 Session 状态盖过 Project 状态。

用户主要关心的是项目。

# 29. Project Selector

如果用户打开多个 Workspace：

```
AI Project Visualizer

Project:
[ ai-project-visualizer ▼ ]
```

第一版可以只支持当前 VS Code Workspace。

但架构允许未来切换。

# 30. Settings 页面

v0.1 保持必要设置很少：可控制 raw activity 展示（如已支持）；显示 repo 外本地存储位置。推断不确定性/来源披露是硬约束，不提供彻底隐藏它的开关。

Semantic 未实现且 OFF，不给出可用 ON 控件；Export 属于 Phase 18；Raw retention 期限仍待 Phase 2/采集前决策，不显示“7 days”有效设置或尚未实现的管理功能。

# 31. 默认首页不能出现什么

不要默认出现：

```
JSON-RPC
Thread ID
Turn ID
Model name
Token count
Raw payload
Database IDs
Event sequence numbers
```

这些可以放：

```
Developer / Debug Mode
```

但不属于普通用户体验。

# 32. UX 中的可信度语言

建议形成统一语言。

## 确定事实

```
Observed
```

例如：

```
Tests: 8 passed
```

## Agent 声明

```
Agent Reported
```

例如：

```
Task completed
Reported by Codex
```

## 插件推断

```
Visualizer Inferred
Confidence 65%
```

## 用户确认

```
User Confirmed
```

这是最强人工来源。

# 33. 第一版颜色暂时不要定死

低保真阶段只考虑：

```
完成
进行中
警告
普通
弱化
```

不要现在讨论：

```
#3A82F7
#00C896
```

等视觉阶段再做。

# 34. 第一版 Icon 语义

先固定语义即可：

```
✓ Verified only (independent evidence)
▶ Active
○ Todo
◐ Agent completed, not verified
⚠ Attention
◇ Tentative
· Idea
```

具体图标以后可以替换。

# 35. 用户第一次安装后的完整流程

理想 Flow：

```
Install Extension
       ↓
Open Project
       ↓
Visualizer detects project
       ↓
Visualizer waits for Codex
       ↓
Codex session starts
       ↓
Plan detected
       ↓
Plan View populated
       ↓
Current Task inferred
       ↓
Overview begins updating
       ↓
User opens Visualizer
       ↓
5-second understanding
```

过程中：

> 不要求 `init`。

# 36. 用户离开 10 分钟的 Magic Moment

独立示例（非 Scenario 13），与 Acceptance Scenario 30 一致：离开时 28/40=70%；期间 JWT weight 4 被 Agent 明确报告完成，32/40=80%；新增任务 weight 6+4 后 32/50=64%。回来 Overview 展示当前 Authentication/Refresh Token、来源/关联 Confidence、JWT Agent Reported COMPLETED（Verification Unknown）、新增计划和 70%→80%→64% 各自原因。

无需 Chat/Terminal/Diff，也无需数值任务估算。五秒理解必须真实 E2E + 人工验收；当前 Pending，不以 mockup 通过。高级 Since Last Viewed/LLM summary 后置。

# 37. 可以增加 “Since you last viewed”

这是一个很有价值的 UX 方向。

如果 Visualizer 知道：

```
lastViewedAt
```

可以专门生成：

> **Since you last viewed**

而不是普通：

```
Recent
```

例如：

```
Since you last viewed

3 meaningful changes

• Plan expanded
• JWT completed
• Refresh Token started
```

这非常符合我们的 Magic Moment。

建议加入长期设计。

# 38. 首页建议最终结构

v0.1：Project + observed Session state；Confirmed Progress / Why；Current Phase / Current Task；Current Task Confidence / Provenance / Correct；Recent Plan/Progress Change；Recent meaningful Timeline。

未来：Estimated Task Progress（Phase 13）、高级 Since Last Viewed、Attention Signals、Semantic Summary。无数据块隐藏时必须保留必要的 unknown/no-plan/uncertainty 提示，不能制造已确定状态。

# 39. v0.1 必须真正做出来的 UX

第一版不需要全部实现。

v0.1 最核心：

### Overview

```
Confirmed Progress
Current Phase
Current Task
Current Task Confidence / Provenance
Recent Plan/Progress Change
```

v0.1 不显示 Estimated Task Progress 数值；Why/empty/uncertainty 是发布 baseline。

### Plan

```
Phase / Task Tree
```

### Timeline

```
Plan Changed
Progress Changed
Task Events
User Correction
```

### Correction

```
Correct Current Task
Edit Task Weight
```

### Why Progress

```
Why X%?
```

# 40. 可以晚一点实现

这些属于后续增强：

```
Semantic Summary
Semantic Code Changes
Attention Signals
Since You Last Viewed 高级摘要
Multi-session UI
复杂 Conflict Resolution
漂亮 Progress 图表
动画
```

不要为了这些拖慢 v0.1。

# 41. UX 原型完成后的验收

第四步完成后，我们应该能不看代码，仅靠 UI 原型回答：

### 问题一

用户打开插件第一眼看什么？

> Confirmed Project Progress。

### 问题二

用户怎么看当前工作？

> Current Phase + Current Task。

### 问题三

如何避免把 AI 推测伪装成事实？

> v0.1：关联 Confidence + Provenance + 不确定性提示；Phase 13 再加入 Estimated 数字。

### 问题四

进度下降怎么办？

> 显示变化历史和原因。

### 问题五

Visualizer 判断错怎么办？

> User Correction。

### 问题六

用户怎么知道为什么是 64%？

> Why 64%。

### 问题七

用户怎么回看开发过程？

> Timeline。

### 问题八

用户怎么看原始 Agent 行为？

> Activity。

### 问题九

Semantic Analysis 是不是强制？

> 不是，默认 OFF。

# 42. 第四步最终页面集合

## v0.1

```
Overview
Plan
Timeline
Task Detail / Correction
Why Progress
Settings
```

## Advanced

```
Activity
```

## Future

```
Semantic Detail
Verification Detail
Multi-session
Conflict Resolution
```

# 43. UX 核心原则

最终固定以下原则：

1. **5 秒理解当前项目状态。**
2. **Progress 永远优先于 Raw Activity。**
3. **Confirmed 与 Estimated 必须明显区分。**
4. **Inference 必须显示 Confidence。**
5. **重要信息必须显示 Provenance。**
6. **用户必须可以纠正 Visualizer。**
7. **Plan Change 必须可见。**
8. **Timeline 记录项目意义，而不是工具调用噪声。**
9. **Semantic Analysis 默认关闭。**
10. **复杂能力按需展开，不污染默认体验。**

# 44. 第四步完成后的产品形态

到这里，AI Project Visualizer 已经从：

```
一个想法
```

变成：

```
明确产品目标
+
明确技术架构
+
明确产品决策
+
明确用户界面
+
明确用户交互
```

接下来就可以进入：

# 第五步：v0.1 End-to-End Acceptance Scenarios（历史编制顺序）

下一步不再讨论“界面应该有什么”。

而是正式定义：

> **什么情况下我们才能说 v0.1 真正做成了。**

也就是把真实用户流程写成一组可以让 Work / Codex 验收的端到端场景，防止出现：

> “所有模块都写了，但整个产品根本没有真正跑通。”

第五步会直接决定以后 Phase 是否能够被判定为真正完成。
