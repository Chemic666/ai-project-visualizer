# Core 合成浏览预览（开发审阅工具）

在生产观察/Storage 门槛仍阻塞时，独立检查 Phase 3–6 现有数据能否被正确阅读。该预览不是正式 Phase 10 Surface、VS Code Extension 或真实项目接入，不改变已批准技术栈/发布门槛。数据来自 runCoreWalkthrough 的合成输入及真实 Core 计算。

界面沿用 UX 的 Overview / Plan / Timeline 信息层级，正式进度/Why 优先。未知不填零，不展示 Estimated/Confidence 占位，Agent Reported COMPLETED 不画 VERIFIED 勾。步骤切换展示当时快照，不提前借用后续任务/权重。配色采用蓝灰/低饱和紫，使用系统字体。

## 运行

使用现有 Node.js 24、pnpm 12 和已安装依赖，在仓库根目录运行（Windows CMD）：

```cmd
pnpm.cmd demo:preview
pnpm.cmd demo:preview --build
pnpm.cmd demo:preview --help
```

默认命令打印 http://127.0.0.1:随机端口，打开该地址即可浏览；Ctrl+C 结束服务。页面可以切换八个检查点、查看 Why、计划来源和意义时间线，另有任务移除/再入的独立历史案例。--build 只生成本目录 dist 中的 index.html、app.js、style.css，不启动服务。

JWT 权重试算调用同一 Core 合成演示重新计算：权重 5 时，第七检查点为 32/42 = 76.2%；默认权重 17 时为 32/54 = 59.3%。每次试算建立一个独立合成案例，不累积保存用户操作历史；恢复默认返回第六检查点的 32/50 = 64%。非法输入保留原案例。

## 实现与验证

- [x] 最小 Task/Timeline 阅读投影及未知、来源、独立验证呈现测试。
- [x] 使用现有 TypeScript/esbuild 构建静态页面及只监听 127.0.0.1 的固定资源服务。
- [x] 基础页面实际浏览检查：八步切换、Why、未知进度、Session 结束、来源标记、键盘/首页导航及 1280/390/304 宽度；窄布局无横向溢出。

2026-11-09 接续验证：完整 Core **277/277**（含演示 **27/27**），预览服务/输出边界 **7/7**，Core/Storage/预览类型、标准 lint/format:check 通过。试算对话框已实际浏览：输入 5 得到 32/42 = 76.2%；输入 0 显示拒绝提示并保留原案例；Escape 关闭并返回焦点；恢复默认回到第六检查点的 32/50 = 64%。390×844 对话框在视口内且无内部横向溢出。此前浏览中断的待验收项已由本次实际交互补齐；未进行人工五秒理解或正式产品体验验收。

完整 Timeline 现在可逐条展开“查看依据”：使用既有 Core 查询，在每个检查点内生成精简投影。任务状态/权重/纠正附可读任务名称，保留 Agent Reported / User Confirmed；旧进度前后值取原条目的保存值。当前任务纠正的原动作仍是 18:06，在前期检查点显示有效，Session end 后显示该检查点下已失效及 18:12，原 JWT 声明仍在。展开不跟随来源路径/链接，也不提供真实数据导入或通用匿名化。

新增展开已实际检查：点击、Enter 收合/展开、原 Agent 完成声明、各任务权重归属、旧 0%→71.1% 变化和检查点生命周期；390×844 下详情宽度无横向溢出。两次浏览检查捕获的页面 error 日志均为空。自动化交互与截图审阅只证明这些限定行为，不是完整产品或人类理解验收。

```cmd
pnpm.cmd test:preview
pnpm.cmd typecheck:preview
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd format:check
```

## 运行边界

服务只提供内存中的固定生成资源，URL 不映射文件路径；拒绝非本机 Host/Origin 和写入方法，CSP 禁止外连。页面没有实际会话导入、模型请求、Hook、生产 Storage 或持久化纠正。默认数据也没有从真实项目、日志或私人聊天抽取。

输出程序在写入前检查目录及三个目标，拒绝符号链接、非普通文件和已有硬链接。它适用于可信本地 checkout，不保证抵御并发恶意改名，也不声称生成文件写入具备事务原子性。输出测试留下的独立 output-case-* 合成样本位于被忽略的 dist 下，不作为交付数据或自动删除用户文件。

真实 Adapter、D-038/B-06 观察、SQLite 恢复、Host 打包和 Phase 10 验收仍按各自门槛执行。
