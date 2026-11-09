# AI Project Visualizer

帮助用户看清 AI 开发项目当前的计划、进度、变化依据和人工纠正。项目定位是本地观察工具；不控制 Agent，不把推断、完成声明和独立验证混为一谈。

## 现在能运行什么

现有 Core 已实现计划修订、正式加权进度、当前任务/权重纠正、意义时间线、分页、一致更新入口，以及移除后仍可追溯的单任务历史和时间线直接依据展开。下面的演示使用代码内的合成数据，通过这些真实 Core API 计算结果。

在仓库根目录、使用现有 Node.js 24 / pnpm 12 和已安装依赖运行（Windows CMD）：

```cmd
pnpm.cmd demo:core
pnpm.cmd --silent demo:core --json
pnpm.cmd demo:core --timeline
pnpm.cmd demo:core --inspect 13
```

演示依次展示无计划、缺少权重、Agent 明确完成声明、用户确认当前任务、计划扩张、人工调整权重和 Session 结束。主要计算为 `32/45 = 71.1%`、`32/50 = 64%`、`32/54 = 59.3%`；权重未知时不显示百分比。演示中的全部权重都是合成的 User Confirmed 输入，不是模型估计。

命令还实际检查重复计划不增加记录、非法权重不改变状态、内存 JSON 往返后的重复结束事件不产生第二次失效，以及原完成声明保留。退出码 0 表示本次合成演示运行成功；不等于真实观察或产品验收通过。JSON 模式只输出固定合成摘要，不导出完整 Core 状态。

演示还单独验证任务移除/重新纳入：旧 JWT 的 3 个计划版本和 3 条纠正保留，新 JWT 不继承旧纠正；缺少新权重时保持进度不可用。这个分支不改变主故事。

--timeline 列出固定案例的 24 条事件，--inspect N 查看对应原声明/纠正的精简依据。示例 13 保留原人工选择动作和 JWT / User Confirmed 声明，同时明确纠正当前已失效；历史动作与当前生命周期分别显示。序号只适用于这个合成案例，不是持久身份。查询不跟随来源路径/链接，也不将本地依据可读升级为独立验证。

## 合成浏览预览

```cmd
pnpm.cmd demo:preview
pnpm.cmd demo:preview --build
```

打开命令打印的本机地址，可切换八个检查点、阅读 Why/计划/时间线和移除后再入历史。JWT 权重试算通过真实 Core 重建独立合成案例；权重 5 得到 32/42 = 76.2%，恢复默认回到 32/50 = 64%。每次试算不累积操作历史。详情和验证限制见 [预览说明](experiments/core-preview/README.md)。试算提交、非法输入、Escape 和恢复默认均已实际浏览验证；完整时间线还能逐条展开原声明/纠正与检查点状态，键盘及390宽度已检查。

这只是 Phase 3–6 合成输出的开发审阅工具，不代表正式 Phase 10 Surface 或真实项目接入。

## VS Code 界面首片

已有可本地安装的插件包：默认打开“未连接会话”的项目概览，进度保持未知；可明确进入内置合成示例，在插件内浏览计划、进度依据和时间线，并进行合成权重试算。命令会复用一个面板，支持返回概览和关闭重开。

```cmd
pnpm.cmd build:surface
pnpm.cmd test:surface
pnpm.cmd validate:surface
```

构建输出独立资源包；安装验证默认不运行。已用现有 VS Code1.144.0 在全新 TEMP 配置中实际打包、安装、执行和检查界面，不安装到正常用户配置。真实会话和生产存储仍未接入，这一首片不代表完整扩展或产品验收。[使用说明](packages/vscode-surface/README.md) / [执行及验证记录](docs/phase-10-surface.md)。

## 实际宿主恢复验证

2026-11-09 已在独立安装的 VS Code 1.144.0 验证扩展中，实际运行两个先后完整退出的 Extension Host：显式合成 TEMP 数据恢复出一致状态、Cursor、原回执和 epoch 2，随后独立进程读取全部九张表核对通过。独立复核匹配 309 份证据、16 个执行输入和 52 个安装运行文件。结论仅为 **PASS WITH LIMITATION**，不是完整引擎状态持久化或产品验收。

LocalAppData 尝试仍在 final-path 准入处失败，未打开数据库；新一轮同现场诊断已保留并独立核对244份证据，仍不授权重定向目录或自动退回TEMP。运行入口、版本限制和原始结果见 [验证说明](packages/storage-host-validation/README.md#explicit-whole-extension-host-normal-restart-2026-11-09) / [存储记录](docs/storage/phase-2-first-slice.md#whole-extension-host-normal-restart-follow-up--2026-11-09)。默认不启动这些验证。

本地存储的受限合成路径还已补齐项目索引8MiB逻辑上限，以及坏缓存不遮蔽有效权威记录的恢复：配额普通3项/Native2项、缓存及权威控制普通11项/Native11项通过。新提交清理坏缓存与业务记录处于同一事务，回滚保留原件。实际安装后的健康重启也已复验；缓存故障测试与宿主正常重启分别记录，不代表生产启用。详见 [Storage说明](packages/storage/README.md)。

已有事件的合成消费位置现可单独原子提交，保持原事件、来源和状态；普通17项、Native17项及实际Worker重启控制通过。恢复现在也会拒绝不可能的写入代次，保留合法换代跳号和原回执；受控提交返回异常会停用旧实例。匹配重试保留原回执，前驱不符或重访已知位置会拒绝。它仍不能证明真实来源的完整消费单元，详见 [受限结果](docs/storage/phase-2-first-slice.md#s09-synthetic-checkpoint-only-follow-up--2026-11-09)。

## 当前边界

- 真实 Codex 现有会话/正式 Plan 的被动观察仍未验证；D-038 / B-06 不因合成结果升级。
- 生产 Storage 仍 unavailable，B1 门槛未关闭；不得只保存 `engine.core` 就声称保存了完整引擎状态。
- 演示及预览不连接实际会话、安装 Hook、调用模型或启动 SQLite 实验；正式界面首片已能安装并展示未连接状态/合成示例，完整产品 UI 尚未交付。
- 历史 Activity 关联、可靠较新显式源选择、生产环境恢复和最终产品体验仍有未完成项。

## 开发检查

```cmd
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd format:check
pnpm.cmd test:storage:validation
```

2026-11-09 当前 Core277/277、预览服务/输出边界7/7、插件界面/构建14/14；标准测试现包含这三组并全部通过。Storage验证契约保留此前35/35记录，本轮界面改动未重复运行。类型、lint、格式通过；插件实际隔离安装与Windows界面检查为受限通过。

这些命令验证现有 Core、Storage 验证契约和相关静态边界，不代替真实 Adapter、SQLite 恢复、Host 打包或用户体验验收。上述验证未新增依赖版本；工作区登记触发的既有工具同步详见界面实施记录。各验证记录中的未提交/推送描述保留其当时状态，Git交付以当前分支历史为准。

## 继续开发从哪里看

- [路线与当前阶段](ROADMAP.md)
- [架构与组件边界](ARCHITECTURE.md) / [已记录决策](DECISIONS.md)
- [Plan Engine](docs/phase-3-plan-engine.md) / [Progress Engine](docs/phase-4-progress-engine.md)
- [人工纠正](docs/phase-5-correction-engine.md) / [时间线与 Core 组合](docs/phase-6-timeline.md)
- [演示场景源码](packages/core/examples/walkthrough.ts) / [运行入口](experiments/core-walkthrough/run.mjs)
- [真实观察研究结果](docs/spikes/codex-observation-feasibility-results.md) / [离线范围校验](experiments/codex-observation/readonly_contract/README.md)

接续时先核对实际工作区、Git远程和相关阶段说明，保留既有更改；不要重新初始化仓库或据旧报告推定生产门槛已通过。

交付约定（2026-11-09）：完成任务后统一报告V1.0工程进度及主要剩余项；相关验收通过后自主commit/push到本项目既有GitHub远程。当前V1.0仍保守估计完成20%–30%，该区间属于工程判断，不是Core计算的正式进度，也不因提交/推送而上调。
