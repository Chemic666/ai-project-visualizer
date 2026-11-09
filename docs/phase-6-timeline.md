# Phase 6 — Synthetic-only Meaningful Timeline

按当前自主推进授权及 D-017/ARCHITECTURE §18，在已有 Plan/Progress/Correction 输出上实现 Core 时间线，不接入 Storage、Codex、UI 或网络。

## 范围与顺序理由

Phase 5 首片已实现当前任务/权重纠正与有据生命周期。历史 Activity 关联、较新显式源选择仍缺少已定义输入，不能伪造。它们不阻塞对现有已实现输出的 Timeline 投影；本次只继续相邻 Phase 6 的独立合成组件，不宣称 Phase 5/6 完整关闭，也不跳过生产存储和 D-038 门槛。

## 设计与内部计划

- [x] `createTimelineState` / `appendTimelineEvents` / `getTimelineEntries`：只保存有意义的白名单投影，不复制原始工具日志、文本或完整 Core state。
- [x] 接收已准入 normalized Session/Task status 事件及既有 Plan/Progress/Correction 输出；原始 Plan 输入不再重复显示，Task status 始终作为 Agent Reported，不升级 VERIFIED。
- [x] Plan/Progress 的调用方必须提供显式观察时间；Session/Task 使用 receivedAt，Correction 使用自身 at。Core 不读取时钟，不发明 source order。
- [x] 显示按时间 instant 排序，同刻按稳定准入序号；原存储顺序不被查询修改。Project/Session/Source 仅按明确字段过滤，不推断缺失关联。
- [x] 按类别/Project/Source/Event ID 定义投影身份，保留依据引用、规则和原因。相同输入幂等，修改历史身份内容则整批拒绝，JSON 往返不重复产生条目。
- [x] Correction 派生事件补上已有 record scope，供 Timeline 保留 Session/Task 范围；不修改生命周期政策。
- [x] 执行定向、完整 Core、类型、Lint、格式与边界验证，保留原有未提交工作，不 Commit/Push。

## 信任及验收边界

输入是调用方提供的已准入 Core/source 数据，不是 Raw Adapter importer 或独立证据验证器。投影身份只覆盖保留字段，原始事件完整身份仍由 Core/Engine 账本负责。未知/无来源进度不填零；不从工具返回值、时间流逝或 Agent 的 VERIFIED 字样推断独立完成。没有真实失败/Phase 完成输入时，不生成这些事实。内存 JSON 恢复是组件验证，不是 SQLite 恢复或跨实例 exactly-once。

原始 opaque source references 由既有契约保留，不能因此声称任意字符串已匿名化；Storage 的 allowlist/隐私边界仍未因本片而升级。

## 本轮验证

- Timeline 定向 15/15，包括真实 Core Plan/Progress/Correction 组件组合、Session 开始/结束及纠正失效、JSON 往返幂等、命名空间与时间过滤、整批冲突拒绝、未建模原始字段不落入投影。
- Scenario 13/18 的组件子条件：真实计划扩张和权重 3+2 进入 Progress 后，Timeline 同时保留 32/45 → 32/50、plan_expanded 与前后计划依据。不把组件测试称为完整产品 Scenario 或真实 UI 通过。
- unavailable 保留 code/taskId 形式的具体 issues，但不附百分比或权重；该原因丢失曾由失败断言复现后修复。Agent verified 继续是 Agent Reported。
- 既有 Plan Engine 已对无语义变化的更新不派生新 change；Timeline 重放其历史也不新增噪声。没有为此修改 Plan Engine。
- 补齐 D-037 的字段区别：Task Weight 在紧邻已应用计划中被稳定 sourceItemId 明确部分删除时可结束；Current Task 仍要求完整计划移除。部分遗漏或删其他任务不影响该人工权重。
- 最终完整 Core 192/192，通过 Core/Storage 类型、相关 ESLint 与 Prettier 检查。独立只读审查未发现重要残留；静态审查与实际测试分别记录。
- 没有 Storage 运行/SQLite 实验、真实 Adapter/Hook、UI 或生产恢复验证；没有暂存、Commit/Push。原有 Phase 4 与无关实验文件保留。

## 分页浏览补齐（2026-11-08）

范围：为现有 Core Timeline 增加 getTimelinePage(state, query)；不增加来源事件或 UI，不改变生产门禁。沿用显示时间/准入序号顺序与严格 Project/Session/Source 过滤。limit 为 1–100；游标是带版本、过滤条件、固定 throughSequence 和最后条目身份/时间/准入序号的可序列化值，不是鉴权凭据。翻页链仅覆盖第一页已有历史，后续新增（包括回填旧时间）留待重新查询，避免漏页/重复；无效或不兼容游标明确拒绝，不静默重头展示。JSON 往返仅是合成内存恢复，不代表生产恢复。

内部计划：

- [x] 先用真实 appendTimelineEvents 构造乱序、同刻、混合范围和新增事件，观察分页测试失败。
- [x] 在独立 timeline-pagination.ts 实现有界返回/固定视图/游标检查，导出类型及 API；保持原 getTimelineEntries 行为。
- [x] 验证保存游标恢复、过滤隔离、非法大小、游标/历史失配、空/末页；完成必要 Core 回归、类型、Lint、格式和只读复核。

验证：分页定向 15/15，完整 Core 207/207；Core/Storage 类型及相关 ESLint 通过。独立只读审查发现的空查询校验顺序问题已用失败测试复现后修复；现有有效游标路径未发现遗漏、重复或跨范围问题。静态审查不替代运行测试。

调用方在第一页使用 getTimelinePage(state, { projectId, sessionId?, sourceId?, limit })，后续传回同过滤条件及 after: nextCursor；可改变页长。nextCursor 缺省即到末页。重新开始不带 after 的查询才包含此后新增事件。游标不包含完整历史或业务原文，只保留已有范围/条目标识；其版本和范围须相容，不适用于鉴权、跨 generation 或丢失/被改写历史的恢复。Core 初始状态仍是可信 append-only 输入。本实现限制返回页长，但仍扫描/排序内存历史，不宣称持久索引或大数据性能已验证。

未更改原 getTimelineEntries、纠正/进度政策、来源事件 schema、Storage 或观察实验；没有 UI、生产恢复或真实接入验收，没有 Commit/Push。

## Core 原子组合（2026-11-08）

按自主开发范围补齐 Phase 3–6 已有组件衔接，不新增来源契约、Storage、Host、UI 或真实 Adapter。新增 project-engine.ts 的 createProjectEngineState(plan, scope, verificationSupports?) / applyProjectUpdate(state, update, observedAt)，固定一个 Project/Source/Session?/Plan 范围，接收现有 normalized source 或 UserCorrectionInput。初始 PlanEngineState 为可信输入；构造时不虚构历史 Timeline，输出组合仍不是受支持的持久化 bundle。

内部计划：

- [x] 用真实 Session/Plan/Correction/Progress/Timeline 建立合成闭环及失败反例。
- [x] 来源/纠正应用后，依据既有 expireUserCorrection 政策处理计划移除/Session end，再重新计算进度、追加意义事件；全程纯内存，最后一步失败仍返回原组合对象。
- [x] 验证固定范围、未来时间拒绝、未知权重、计划扩张、失效后重入、重复/JSON恢复及下游冲突回滚；完成必要回归与只读复核。

设计选择：unknown/ambiguous Plan 只表示已准入输入尚不可解释，保留账本并产生 unavailable 进度；不伪造百分比。duplicate 不再计算/追加。observedAt 必须不早于本次 receipt/effectiveAt，不读取时钟。仅依据已有明确移除/结束事件失效，不实现缺少可靠顺序的显式源选择或历史 Activity。所谓原子只指返回的内存快照，不指数据库事务、外部副作用或 exactly-once。没有自动启动/控制 Agent。

范围补充：一个组合只接收完全匹配自身 Project/Source/Session?/Plan 的来源；人工纠正的 Project/Session 范围也必须一致，不通过此入口扩大为其他 Session 的纠正。新 task.status_reported 只支持该范围当前可用计划的成员；移除/未知计划下的新历史状态接收仍需后续 Host/历史归属设计，调用方必须处理 rejected，不可当作已准入/已 ACK。较早已准入事件的重放不受当前成员变化影响。

重复身份检查沿用已准入账本，内部 EventId 或稳定 source_event 匹配时比较来源声明，只忽略根 id/receivedAt；内容变化明确 duplicate_claim_conflict，不能把冲突隐藏为 duplicate。未修改 Phase 1 单独入口的去重契约。

verificationSupports 是既有 IndependentVerificationSupport 的明确可信输入，默认为空；组合保留并在每次重算时传递，包括 JSON 往返。它不是由 Agent 的 verified、命令成功或新 sourceId 推导出的证明，也没有新增 Verification Engine。已有 Core 状态的证据/结论仍由调用方按原契约提供，构造器不对整个历史做导入校验。

验证：组合定向 15/15，完整 Core 222/222；Core/Storage 类型通过。只读复核提出的历史任务重放与独立验证依据丢失均经失败测试复现后修复，复核未发现新增重要问题。另覆盖同身份内容冲突、progress evidence_identity_conflict 和 Timeline 冲突的整体回退，以及来源计划无法解释时保留账本/有效纠正且不产生百分比。合成组件结果不等于完整产品 Scenario、真实会话、SQLite 恢复或生产 Host 验收。

## 可运行合成演示（2026-11-08）

为已有 Phase 3–6 组合提供可复跑的开发验收演示，不开始 Phase 7/10、不读取真实项目/会话，也不生成产品 UI。packages/core/examples/walkthrough.ts 只使用公开 Core API 和代码内合成输入，返回明确标为 synthetic 的精简报告；experiments/core-walkthrough/run.mjs 使用已有 esbuild 内存编译并在当前 Node 进程执行，提供中文文本或 --json，无新依赖、网络、模型或持久化数据导入。

内部计划：

- [x] 用报告行为测试锁定未知权重、不混合 provenance、32/45→32/50→32/54、失效/重放/拒绝、确定性和输出范围。
- [x] 实现真实 Core 闭环和运行入口，所有进度/原因来自实际计算；未知不填零，报告不复制完整 Core IDs/来源引用/项目路径。
- [x] 运行文本及 JSON 命令、必要回归/类型/格式，并补齐项目根目录上手说明；不将合成演示称为真实观察或产品验收。

验证：演示行为 4/4，完整 Core 226/226；Core/Storage 类型、标准 lint 与 format:check 通过。文本命令实际运行，JSON 命令解析得到 8 个检查点/24 条意义事件；帮助 exit 0，非法参数 exit 2。独立静态审查未发现实质问题；未将其称为真实会话或产品验收。根 README 提供可复制命令和生产门槛说明。

## 单任务历史查询（2026-11-08）

按 Phase 6 长期可浏览历史和 Scenario 14 的组件要求补齐 getTaskHistory(planState, scope, taskId)。只投影既有 Task/Plan revisions/Assertions/Corrections，不增加 Activity、任务选择协议、UI 或持久化。精确范围必须确曾包含该内部 TaskId；移除后仍可查，sourceItemId 再入生成的新 TaskId 不继承旧历史。当前 membership 通过 getPlanSnapshot 判断，unknown/ambiguous 只返回 lastKnownMembership，不从空/未决输入伪造移除。

内部计划：

- [x] 覆盖不可变标题/Phase/certainty/顺序、移除/重入、纠正及原断言、未知计划、精确范围和无变更历史。
- [x] 实现只读查询与类型；已应用修订只在当前/前一快照含目标 Task 时记录成员行；不将未决输入当已应用版本。
- [x] 必要类型/回归/格式及独立复核；说明 Core 本地依据引用不是匿名化导出，不升级生产门槛。

验证：任务历史定向 8/8，扩展演示行为 5/5，完整 Core 235/235；Core/Storage 类型、标准 lint/format:check 通过。范围外/不存在任务返回 not_found；迟到旧序号不遮蔽已采用当前计划。Current Task A→B 替代仅在各自 Task 展示对应纠正正文，同时保留替代指针。

只读复核发现的依据列表遗漏已用失败用例复现后修复：当前空计划、未决计划及 supersedes/supersededBy 均保留引用。精确 scope 的全部计划观察引用用于成员/当前不确定性的上下文，引用本身不表示这些观察都已采用、或包含该 Task；revisions 正文只保留真正已应用且前后包含目标 Task 的快照。返回的字段断言保留原来源，不按计划来源冒充断言来源。该本地查询含真实 Core/来源引用，不是匿名化/可直接公开导出的数据。

独立合成演示分支从 Session end 前的状态分叉，演示移除后旧 JWT 仍有 3 个计划版本/3 条纠正，再入的新 JWT 只有 1 个版本/0 条旧纠正，且权重未知。它不改变主故事的 8 个检查点或 24 条时间线；没有把 Session 结束后的新工作伪装成同一运行过程。上述数值来自真实 Core API，不是静态示意或真实用户记录。

## 独立合成浏览预览（2026-11-09）

在真实观察与生产 Storage 门槛阻塞时，独立验证现有 Phase 3–6 输出的阅读方式。experiments/core-preview 使用已有 TypeScript/esbuild、固定合成演示和浏览器内存；不是正式 Phase 10 Surface、VS Code Extension、生产 Host 或真实项目接入。原因是尽早发现未知/来源/分母变化的呈现错误，且不依赖被阻塞的采集或持久化；不改变原技术栈和验收顺序。

完成 Overview/Plan/Timeline、八步检查点、Why 分子/分母和任务来源、意义事件以及移除/再入历史。正式未知不绘制百分比，Agent Reported 完成与独立 VERIFIED 严格区分，不添加 Estimated/Confidence 占位。JWT 权重试算重新调用同一 Core 合成演示，每次建立独立案例，不伪装为累计纠正历史或真实输入接入。恢复默认返回第六检查点，权重未知检查点不使用后续数值。

可通过 pnpm demo:preview 运行；固定生成资源服务只监听 127.0.0.1，URL 不映射项目文件，限制 Host/Origin/方法并禁止页面外连。写入前检查三个静态产物，拒绝非普通文件/符号链接/硬链接，适用可信本地 checkout；不提供并发恶意文件系统替换防御或文件写入事务承诺。详见预览 README。

验证：完整 Core 255/255（含演示 13、呈现 4），预览服务/输出边界 7/7，Core/Storage/预览类型、标准 lint/format:check 通过。基础页面已实际检查 1280/390/304 宽度、步骤/Why/未知/结束、键盘与首页导航，窄布局无横向溢出。新增试算的正常/非法 Core 计算已测试，对话框提交与恢复的实际浏览验收因本轮浏览连接中断尚未完成；不能用此前页面检查替代。未声称人工五秒理解、完整 Scenario、生产 Storage、Codex、Phase 10 或正式产品验收通过。没有新依赖、Commit/Push。

## 时间线依据只读展开（2026-11-09）

目标：在既有 ProjectEngineState 内查询单条意义事件的已保存依据，不由 UI 猜测解释。沿用 TypeScript/Core 纯查询；不新增来源契约、采集、文件/网络读取、Storage、Verification Engine 或正式 Surface。

接口选择：getTimelineEntryDetails(state: ProjectEngineState, entryId: string)。只查组合范围内的 TimelineEntry；不匹配/不存在返回 not_found。返回原条目及按原顺序逐项解析的 evidenceRefs：event 可对应原 normalized event、plan change 或 progress change，assertion/correction 保留原记录和来源；找不到、外 Project、归属未知或身份冲突明确 unavailable；source 只作为 opaque external_reference 返回，不跟随路径或链接。

纠正正文的 lifecycle 来自当前传入状态，必须标为 current_state，不冒充该 Timeline 发生时的生命周期。TimelineEntry 本身保留当时 action/time；历史 progress before/after 使用原派生记录，不从当前断言重算。仅展开直接引用，不递归收集其他记录；这是本地解释查询，不是权限边界、匿名化导出或通用快照导入器。

内部计划：

- [x] packages/core/tests/timeline-details.test.ts：真实组合 fixture 检查声明来源、人工纠正及后续替代、missing/外项目引用、派生事件身份冲突、source 不追踪和 JSON 往返；先运行失败用例。
- [x] packages/core/src/timeline-details.ts 及 index.ts：实现范围过滤和直接引用解析，纯读、不改变 eligibility 或 VERIFIED；返回可辨识的局部失败。
- [x] 定向测试、必要回归/类型/静态检查及独立只读复核，记录准确结果与当前合成范围。

合成演示的单条查看入口：在已有 demo:core 中增加 --timeline 列出固定案例事件序号、--inspect N 查看第 N 条的精简依据。runCoreWalkthrough(jwtWeight = 17, inspectPosition?: number) 仅接受合法的案例内序号；examples/timeline-inspection.ts 只呈现 built-in 合成字段，不输出内部身份/路径/完整来源引用，也不作为通用匿名化器。条目按组合范围筛选，正文依据按 Project 归属解析，允许同 Project 的跨 Source/Session/Plan 直接依据。该入口继续属于 Phase 3–6 的开发演示，不是 Phase 19 的真实项目 CLI。

验证：时间线依据查询 8/8，合成演示 22/22，完整 Core 272/272，预览服务/输出边界 7/7；Core/Storage/预览类型、标准 lint/format:check 通过，预览静态构建成功。先观察缺查询/缺单条报告的失败，再实现。完整导出契约随新公开查询同步更新，原隔离检查保留。独立只读复核未发现重要问题。

命令实际运行：--timeline 列出 24 条；--inspect 13 返回原人工选择动作、JWT / User Confirmed 断言及当前已 expired 的纠正；136 项本地直接引用可读，没有未解析引用，也没有跟随外部来源。--inspect 25 与缺参数 exit 2，help exit 0，JSON 报告实际解析。序号只适用于该固定案例的当次浏览顺序，不是跨运行持久身份。没有真实导入、生产持久化、Phase 19 验收、Commit/Push。

接续结果：试算对话框已完成一次实际浏览验收（见下）；生产观察/Storage 门槛不变。普通来源状态出现不同值时，现有 Core 要求覆盖全部候选的显式 ResolvedConclusion，Project 组合不自行选择最新到达或猜测 source-local authority。可靠来源次序/解释接入属于后续契约工作，不借当前开发演示静默新增自动取舍规则。


## 合成预览中的时间线依据（2026-11-09，已验证）

沿用现有 getTimelineEntryDetails 和 summarizeSyntheticEvidence，在创建每个合成检查点时保存精简依据投影；浏览页只读展开它，不接触完整 CoreState、外部来源、真实项目或 Storage。选择检查点内投影，避免早期页面提前显示未来纠正失效；原事件动作/时间与此检查点的纠正 lifecycle 分开标注。Overview 保持最近事件摘要，只在完整 Timeline 提供原生 details/summary 展开，保持蓝灰/紫色和窄屏可读。该改动仍是 Phase 3–6 审阅工具，不启动正式 Phase 10。

- [x] 四项真实演示投影测试 RED：保留 Agent 声明、检查点 lifecycle、旧进度变化及独立试算/字段范围。
- [x] 在 walkthrough.ts 的每个检查点内通过既有 Core 查询及精简投影构建 evidence；app.ts 只渲染文本/来源/此检查点状态，style.css 补最小排版。不添加匿名化/真实导入承诺。
- [x] 定向及 Core 回归、类型/静态检查、独立复核和一次实际浏览展开/键盘/窄屏验证；记录实测结果。

实施裁定：Timeline 的直接引用列表不包含它自己的派生事件；历史进度 before/after 从该条目的已保存 detail 单独投影为 transition，不能伪造一项直接依据。测试按既有 Session end 的 18:12 输入时间检查失效（初稿误写 18:11，已纠正夹具预期）。

独立复核发现一项P2：进度依据中32/13/3/2的任务权重声明缺少任务名称，无法核对归属。用现有 checkpointTaskNames 在任务断言、原任务报告及 task_weight 纠正标签加入固定合成任务标题；不添加内部身份、不改变Core裁决。新增失败测试后修复。


最终验证：新增五项检查点投影/归属用例均先观察失败，再实现修复；演示 **27/27**，完整 Core **277/277**，预览服务/输出边界 **7/7**，Core/Storage/预览类型、lint/格式及差异检查通过。独立复核指出的任务名称遗漏已修复，复核确认无重要残留。仅 examples/预览呈现改变，生产 Core 算法、来源权威、Storage schema 和正式 Surface 未变。

实际浏览先补齐旧试算：5→76.2%，0拒绝且原案例不变，Escape关闭返回焦点，恢复默认→64%，390×844对话框适配。新展开另外实际验证：检查点6的18:06纠正为有效；检查点8同一原动作仍18:06，纠正为已失效/18:12，JWT/User Confirmed原断言保留；原Login完成仍Agent Reported，四项权重能对应任务名；旧进度0%→71.1%未按后来数值重算。Enter可收合/展开；390×844下详情scrollWidth=clientWidth=272，整页scrollWidth375≤视口390。页面error日志为空；临时视口已还原，预览回到默认状态。未声称人工五秒理解或完整Phase10验收。
