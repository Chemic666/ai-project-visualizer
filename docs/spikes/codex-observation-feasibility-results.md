# Codex Passive Observation Feasibility — execution results

Date: 2026-10-07. Plan: [codex-observation-feasibility.md](codex-observation-feasibility.md).

## 1. Verdict

**Inconclusive — Codex Passive Observation remains Unverified / Technical Verification Pending.**

完成了正式接口研究、安装版本核对、协议契约导出及有限运行实验。没有取得来自既有用户 Session 的观察数据，不能给出 Pass 或 Restricted Pass，也不能把访问失败解释为 Codex 本身不具备该能力。

本次没有创建开发 Thread、恢复用户 Thread、发送 Turn、安装 Hook、批准工作或解析私有日志协议。独立 app-server 进程的启动尝试不属于“观察成功”，更不属于“用户正常启动的 Session 已被观察”。未实施生产 Adapter、初始化 Monorepo、安装依赖或开始 Phase 1。

B-06 的 **Specification Resolved** 状态不变；技术门槛仍未通过。此报告不是支持范围决策，也不是 v0.1 实现或验收证明。

## 2. Official basis and candidate selection

以下资料于 2026-10-07 实际打开阅读；当前网页不等于所有已安装客户端都实现了相同能力。

| Primary reference | Research finding | Boundary |
| --- | --- | --- |
| [Codex App Server](https://learn.chatgpt.com/docs/app-server)（原 developers.openai.com/codex/app-server/ 重定向） | 正式描述 stdio、初始化、`thread/list`、不恢复会话的 `thread/read`、事件与按安装版本生成 schema | 历史读取与运行中事件接收分开；文档亦标注 app-server command / WebSocket 的实验性与生产限制，不能直接推广为已支持的生产集成 |
| [Hooks](https://learn.chatgpt.com/docs/hooks) | 生命周期 Hook 输入提供 `session_id` / `cwd`；本地工具覆盖包括 `update_plan`。非托管 Hook 需人工审阅并信任；可用无输出、退出 0 的记录方式 | 需要设置和信任，不是零配置；`transcript_path` 对应格式不是稳定接口；Hook 文档不证明既有 Session 的历史回放可用 |
| [Build plugins](https://developers.openai.com/plugins/build/plugins) | Plugin 可承载 Hook，但有安装、信任与分发限制 | Plugin 包装本身不是独立的旁观订阅 API，不能凭“能安装 Plugin”判定通过 |
| 本机 `codex app-server --help`、`proxy --help`、`daemon --help` | 安装命令公开列出 proxy 与只查询版本的 daemon version | 本次仅查询版本，没有执行 proxy 连接或改变 daemon；在线资料未建立这一安装组合的完整只读旁观保证 |

候选路径及选择：

1. **现有 daemon 的公开入口**：先只查询版本；因套接字访问失败停止，未进入客户端连接实验。
2. **独立 stdio 历史读取客户端**：正式文档与本机 schema 都支持，选作最小运行实验。仅初始化、列表、读取，目标是已有用户存储中的记录；即便成功，也只先证明历史读取，不证明连接了原有运行进程。
3. **用户正常启动的 CLI + 已审阅的记录 Hook**：有正式研究依据，保留为下一轮候选。没有安装或自动信任 Hook；尚无真实运行证据。
4. **扫描 rollout JSONL / 私有 SQLite schema / 猜测 socket 消息**：不执行。没有找到满足此 Spike 稳定接口要求的依据，Hook 文档还明确提醒 transcript 格式不稳定。

研究未建立一条可直接执行、对任意既有用户 Session 生效的只读实时订阅路径。没有用 `thread/resume`、远程 CLI wrapper 或 `thread/start` 替代旁观实验。

## 3. Environment and version evidence

原始版本查询与安装包 metadata 结果见 [environment.json](../../experiments/codex-observation/evidence/environment.json)。

| Component | Actual observation |
| --- | --- |
| OS | Windows 10.0.26200；X64 / AMD64（系统报告值） |
| Installed CLI | `codex-cli 0.160.0`；npm package `@openai/codex` version `0.160.0` |
| Node | `v24.21.0` |
| Python | `3.12.7`；仅使用标准库 |
| Protocol | 本机 CLI 导出，未传 `--experimental`；314 个 JSON schema，合计 3,540,819 bytes |
| Existing daemon version | **未验证**；只读版本命令遇到 OS error 10013 |
| Desktop app version | **未验证**；安装 metadata 查询被拒绝 |
| IDE extension version / behavior | **未验证**；没有据局部目录查询推断已安装或未安装 |
| Permission boundary | managed workspace-write shell；网络受限；当前策略禁止 sandbox 提权请求 |

已安装 CLI 版本不能代替桌面 app 内置 daemon 或 IDE 扩展版本。原用户 Session 的 Surface、版本、Session ID 和生命周期尚未与实验客户端对应。

## 4. Reproducible experiment and actual observations

完整命令与边界见 [experiment README](../../experiments/codex-observation/README.md)。脚本为一次性研究工具，不是 Adapter。

| Step | Operation | Actual result |
| --- | --- | --- |
| R-01 | 查阅上述正式文档，核对本机 help / version | 完成；CLI / Node / Python 版本已取得 |
| R-02 | `codex app-server generate-json-schema --out <experiment-dir>` | Exit 0；获得安装版本契约。存在 arg0 临时目录权限 warning；它没有阻止 schema 导出 |
| E-01 | `codex app-server daemon version`，保持默认权限 | 无版本响应；现有控制套接字访问报 OS error 10013 |
| E-02 | 请求同一只读版本查询的 sandbox 提权 | **在执行前被策略拒绝**：`sandbox_approval=false`。不是用户拒绝，也不是 daemon 的协议响应 |
| E-03 | 启动独立 `codex app-server --listen stdio://`，发送 `initialize` | 进程 Exit 1，初始化响应前 stdout EOF；请求等待约 250.0 ms。未到达 `initialized` 或任何 `thread/*` 请求 |
| E-04 | 同一启动失败的两次有限诊断，无配置更改 | 两次均 Exit 1 / stdout 空。末行报告 state-database/runtime 初始化错误；精确底层原因未确定。另两行 arg0 权限 warning 不能单独证明退出根因 |

E-03 的预定只读链是：`initialize → initialized → thread/list(cwd, useStateDbOnly:true) → thread/read(includeTurns:true) → thread/loaded/list`。实际只发送了第一项。两个 cwd 参数分别是本仓库与当前聊天工作目录，未发生列表访问；它们**不是**已完成的“两相似项目隔离”实验。

`useStateDbOnly:true` 用来避免列表查询的 scan-and-repair 行为；它不保证整个 app-server 进程绝不写运行日志或初始化存储。脚本保持用户配置不变，没有重新指定用户 home 或复制私有数据库来绕过失败。

没有原 Session 事件 fixture；没有 synthetic fixture 冒充真实事件。已保存的是版本、生成契约、请求审计和脱敏失败证据。

## 5. Capability matrix

Available / Unavailable 在本表中明确区分“契约字段存在”与“真实观察可用”。所有运行能力均未验证。

| Capability | Formal / installed contract evidence | Existing user-started Session result | Verdict |
| --- | --- | --- | --- |
| Automatic discovery | `thread/list`、cwd / sourceKinds / cursor / useStateDbOnly 存在 | 未执行列表；无同一 Session 身份核对 | Unknown / Inconclusive |
| Project association | Thread 有 cwd、projectId、gitInfo 等字段；cwd 支持精确过滤 | 没有两个相似项目或 worktree 的实际结果 | Unknown / Inconclusive |
| Formal structured plan | `turn/plan/updated` 通知契约存在 | 没收到用户 Session 的 plan 通知 | Unknown / Inconclusive |
| Proposed plan text | 历史 `ThreadItem.plan` 为 id / text，与结构化更新分属不同契约 | 没有历史读取结果 | Unknown / Inconclusive |
| Plan revisions | 通知可承载步骤状态；**该通知没有稳定 step ID、revision ID、event ID、timestamp 或 replay cursor 字段** | 未观察增加、改名、重排或删除 | Unknown；稳定步骤身份字段在该通知契约中 Unavailable |
| Task completion reports | agentMessage / plan status / turn status 有不同契约 | 没有可归属于具体任务的报告 | Unknown / Inconclusive；Turn completed 不计作任务 Verified |
| Live passive subscription | 生成 ClientRequest 无 `thread/subscribe`；只有 `thread/unsubscribe`。`thread/read` 不作为恢复操作 | 未连接原运行进程；未采用 resume 替代 | Unknown；候选入口未建立 |
| Actual Active / Idle / End | 存在 Thread status 契约；Hook 生命周期有正式依据 | 没有用户 Session 状态信号；observer EOF 不代表其 Session End | Unknown / Inconclusive |
| History / reconnect | read 与分页字段存在；字段导出不保证 runtime gate 或持久化内容 | 未取得 history，未发生一次成功连接后的重连 | Unknown / Inconclusive |
| Duplicates / gaps / ordering | 列表分页 cursor 不是 plan 事件 replay cursor | 没有重复、乱序或 gap 实测 | Unknown / Inconclusive |
| No formal plan vs unreadable | 必须保留不同结果 | 本次只证实 observer 未取得数据；**没有证实 no-plan** | Observation unavailable |
| Activity inventory | 历史 union 包含 commandExecution、fileChange 等 | 没有真实读/写/命令事件 | Unknown / Inconclusive |
| Observer-created Thread | start / fork 契约存在，非目标 | **0；未调用** | Not tested；不得计为观察成功 |

字段分析来自本机生成的 [schema-contract-summary.json](../../experiments/codex-observation/evidence/schema-contract-summary.json) 和保留 schema，属于静态契约证据，不是通知捕获。正式字段有定义不等于数据会在其他客户端的 Session 中暴露。

## 6. Identity, ordering, confidence and provenance limits

以下是契约分析与后续验证要求，不是已实现的归一化逻辑：

- Thread / Session：分别保留来源 thread id 与显式 sessionId；不能自行假定两者永远相等。真正采集后记录来源 Surface 和版本。本次没有任何可映射的真实 ID。
- Project：cwd / projectId / gitInfo 只能作为各自来源断言；尚未验证 path casing、symlink、worktree 或跨宿主路径映射。关联不确定时保留 Unknown。
- Formal Plan：结构化 `turn/plan/updated` 的 step / status 与 `plan` 文本项不混用。flat 步骤数组不证明嵌套 Phase / Task；缺少稳定 step ID 时，改名与删后新增之间的身份判断需保留歧义。
- Revision / ordering：接收次序只可记为本地 observation order；不能冒称源端全局顺序。没有源时间或可回放序号时，不保证精确重建丢失修订，也不凭空生成来源 event ID。
- Completion：显式报告须分别保存任务关联、报告内容依据和 source reference，按 Agent Reported 处理；命令 Exit 0、final_answer 或 Turn completed 均不单独证明任务 VERIFIED。
- Confidence / Correction：采集失败不能产生确定任务或进度；不能覆盖有效人工纠正。未知关联、缺失完成依据与 source unavailable 分开保存。
- Latency：250.0 ms 是失败请求的等待时间；没有 plan、状态或发现延迟数据，也没有做性能验收。

Core 应继续使用 Agent-neutral 契约。这些字段仅是未来 Adapter 可能提供的来源输入，不向 Core 引入 Codex 类型，也不修改已批准的纠正优先级。

## 7. Evidence inventory and privacy

实验目录：[experiments/codex-observation](../../experiments/codex-observation/README.md)。

- `evidence/environment.json`：版本和访问边界，无 auth / config 内容。
- `evidence/command-observations.json`：命令结果与拒绝原因的人工整理记录，非原始 wire capture。
- `evidence/schema-contract-summary.json`：安装版本生成字段、方法是否存在、11 份源 schema SHA-256；明确标注 generated contract。
- `evidence/standalone-read.json`：实际发送请求的 method、参数 key、延迟、EOF 与退出码；无 Session 内容。
- `evidence/startup-diagnostic.json`、`startup-error-classification.json`：诊断固定标签 / 固定短语，无原始 stderr。
- `evidence/validation.json`：脚本语法、RPC allowlist、人工构造的 privacy sentinel 检查、11 个 schema 哈希及 JSON / whitespace 检查。该检查使用 synthetic 输入，明确不是 Session fixture。
- `schema-0.160.0/`：314 份本机生成 schema，非用户资料。本来计划仅保留摘要和哈希，但清理命令在执行前被批准策略阻止，因此保留整个生成目录；没有改用其他删除途径。
- `read_probe.py`：仅研究客户端，RPC allowlist；raw response / stderr 仅在内存处理。若可读取数据，输出限定为别名、字段存在性和计数，不保存标题、私有提示词、代码、token 或工具输出。

无实际事件数据可脱敏留存；不虚构正向 fixture。实验脚本的 privacy / allowlist 检查不等于 Codex 观察能力通过。

核对结果：上述本地 artifact 检查通过；`git diff --check` 无 whitespace 错误。该 Git 命令只覆盖已跟踪差异，新增报告、脚本与 evidence 另做了 JSON / 文本检查；314 份 schema 另核对 JSON 可解析性、数量与总字节数。没有用这些结果自动打勾技术能力验收。

## 8. Remaining verification and retry gate

本次停止，不自动执行下面的下一轮工作。

1. 在允许访问用户运行环境的执行位置核对既有 daemon、桌面 app / IDE 的实际版本。先复现并定位 app-server state-database/runtime 初始化失败，不能只消除 arg0 warning 就宣称修复。
2. 由用户按正常方式启动无敏感数据的试验 Session；事先约定可公开的 Session 标记和两个相似名称项目。observer 必须晚于 Session 启动并自动发现它；人工提供 ID 的读取单列记录。
3. 首先重跑只读 history 客户端，确认读取的是同一外部用户 Session，分开记录历史完整性和源实时状态。必要分页接口须核对该 host 的实际 runtime gate；不因无 `--experimental` 导出而假定 runtime 稳定可用。
4. 对实时候选，只使用正式接口。若仅 resume 才能接收事件，记录该路径不满足当前只读规则；不自行实施。若尝试 Hook，先准备无输出的记录器并让用户通过正常信任流程启用；不绕过 trust。此设置限制需在结果中明示。
5. 再逐项测试正式 plan / 增删改重排 / 任务完成报告 / Idle-End / observer 重连 / duplicate-gap / no-plan / unreadable；留存测试 Session 的真实脱敏来源证据及延迟。
6. 如只能取得最终历史、缺少关键修订或必需信号，按原计划给 Fail；若能在明确 Surface / setup 下完成核心闭环，再考虑 Restricted Pass 并由用户批准支持边界。

未解决问题：只读实时入口、跨客户端可见性、真实 plan 历史与修订完整性、任务身份、任务完成依据、状态真实性和重连恢复均 Pending；跨平台、VSIX 和 SQLite packaging 不在本次已验证范围。

## 9. Stop / readiness

- [x] 当前正式资料研究与本机 CLI 契约核对。
- [x] 严格区分历史 / 实时、既有 Session / observer-created Thread。
- [x] 最小运行尝试、脱敏失败证据、明确 Inconclusive。
- [ ] 成功观察既有用户 Session、项目和 Formal Plan。
- [ ] Plan revisions / task-attributable reports / reconnect / truthfulness 验证。
- [ ] 如有 Restricted Pass，用户批准支持范围。
- [ ] B-06 Technical Verification 通过。

Phase 1 未开始；本报告不自动放行任何实施阶段。独立 Core 的既有 roadmap 顺序不变，但真实 Codex 集成与 v0.1 feasibility 没有获得技术通过证据。完成本次有界执行记录后停止，等待审核。
