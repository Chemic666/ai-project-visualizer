# Project-scoped read-only observer contract — research only

本轮只做公开文档/保留 schema 核对及合成 RPC policy，不启动 server、连接 daemon/socket、读取用户会话、安装 Hook 或调用模型。CLI 0.160.0 的保留 schema 不是 observed events；D-038/B-06 仍未通过，不能开始 Phase 7 生产接入。

## 离线结果（2026-11-08）

- 已核对保留契约的 cwd、useStateDbOnly 与 includeTurns；11 个索引 schema 的 SHA-256 与历史记录一致，没有重新生成或修改证据。
- 已实现默认拒绝的请求及响应范围校验：只放行同项目 metadata 请求，线程 ID/游标必须来自已验证页面，混合页面不新增绑定，矛盾范围撤销旧绑定。
- 已实现固定字段摘要和 stdin 合成回放；摘要不输出原始 ID、cwd、preview、turns、prompt、token 或工具输出。
- 离线测试覆盖请求白名单、混合项目、身份/响应关联、分页、范围变更、畸形输入、脱敏输出及保留 schema 完整性。这不是 transport、Adapter 或读取成功证明。

## 运行合成检查

从项目根目录运行；需要现有 Python 3.12 标准库，无第三方依赖。以下是 Windows CMD 写法：

```cmd
python -I -S -B -m unittest discover -s experiments\codex-observation\readonly_contract -p "test_*.py" -v
python -I -S -B experiments\codex-observation\readonly_contract\audit_fixture.py < experiments\codex-observation\readonly_contract\fixtures\synthetic.json
```

审计入口只读取有限的标准输入：最多 1 MiB、100 个 exchange，拒绝重复 JSON key、非标准常量和未知 fixture 顶层字段。请只输入合成数据。原始输入不写盘；输出固定声明 `runtime_requests_sent:0`、`real_session_observed:false` 和 `plan_capture:not_established`。有效 fixture 中被拒绝的请求仍可完成审计；exit 0 表示审计完成，并非所有请求通过。无效 fixture 返回 exit 1 及固定 `invalid_fixture`，不回显输入或异常细节。

`policy.py` 是纯内存判断模块；`audit_fixture.py` 读取本地模块和合成 stdin，无 transport。测试只启动 Python 子进程执行这个入口，并读取已保留的公开 schema，不启动 Codex。

## 正式资料与尚未建立的能力

[App Server 正式文档](https://learn.chatgpt.com/docs/app-server) 将 `thread/read` 描述为读取存储状态而不订阅；它本身不能证明可实时旁观其他客户端的现有会话。公开 `turn/plan/updated` 结构和本机 schema 都不是实际 Plan 更新事件。本轮未验证跨客户端发现、实时订阅、可靠 Plan 身份/顺序或 Session 生命周期。

[Hooks 正式文档](https://learn.chatgpt.com/docs/hooks) 描述的工具覆盖包括 `update_plan`，但文档能力不等于本环境已有该正式工具或 Hook 实测成功。未启用 Hook、修改 trust/许可标记或读取 transcript。D-038/B-06 和生产接入门禁保持原状态。

本轮仅运行 CLI version/help 元数据命令确认 `0.160.0`。CLI 启动尝试初始化用户临时目录/PATH 辅助文件，被环境拒绝并输出权限警告；因此不能将这些命令描述为零文件操作。未再次启动 CLI、server、proxy、daemon 或模型；本模块不依赖这些命令。

## 严格范围

仅针对本机静态 CLI 0.160.0 契约。版本参数是调用方声明，不是运行时探测或桌面版本证明。只支持明确 Windows drive-root 项目的路径字符串比较；不支持 UNC/device path、dot segments，也不证明 junction/symlink/真实文件身份。真实 runtime/Host binding 仍待验证。

`thread/list` 必须显式限定单一 cwd、有限页长和 useStateDbOnly=true；后者避免契约描述的 rollout scan-and-repair 路径。`thread/read` 必须先有同项目绑定且 includeTurns=false。初始化仅接受最小 clientInfo；所有控制方法、全局 loaded/list、history item 读取以及未知方法均拒绝。不会仅凭方法名是 read 就接受任意参数。

不承诺读取过程零文件写入、服务端过滤正确或跨客户端可见性；回复必须再次核对关联。原始 RPC 只在调用方/本模块内存中存在，安全摘要不携带它。该 policy 模块没有网络、进程或文件存储能力。它不验证响应真实性、不管理 pending 请求/重放，也不建立握手状态。后续 live transport 如要接入，仍需正常授权、握手/响应相关性和真实控制实验，不能因本测试通过自动放行。

旧 `../read_probe.py` 保留为历史研究脚本：其循环会在记录 cwd 是否匹配后继续读取列出的线程，且使用 includeTurns=true；这不满足本轮同项目 metadata-only 契约。没有运行或修改该脚本及其历史证据，也未将本模块接到它上面。
