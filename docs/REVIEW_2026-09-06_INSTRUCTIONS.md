# 2026-09-06 指令与技能维护回执

基线 main / 1e0f4a1f。owner 请求按上一轮建议逐项处理并精简 AGENTS.md。本地实施与必要验证已完成；未 commit/push/deploy。

## 范围

根规则前置自主执行、审批、Git 人工控制和完成条件。领域原条目逐条移至 [AGENT_DOMAIN_BOUNDARIES.md](AGENT_DOMAIN_BOUNDARIES.md)，按主题读取；同步导航、权威索引和当前交接。
仓库内不改 runtime、生产 JSON、工作流或 checker；不 commit/push/deploy；不更新个人记忆。外部目录 13 个文件已获文件系统批准并应用，其中 3 个 Wind 更新入口脚本增加授权门禁。

## 逐项处理结果

| 原问题 | 已实施处理 | 权限影响 |
|---|---|---|
| 全局“先停下来”容易停掉整个任务 | 仅暂停真实越界步骤及其依赖，继续独立的已授权工作 | 不扩大操作权限 |
| Git 人工操作与普通源码编辑混淆 | 明列 Git 变更命令及只读命令；源码编辑按任务授权执行 | 保留 owner 手动 Git，确认不等于转授执行权 |
| “永远更严格”使已批准例外失效 | 先匹配路径、操作、阶段及明确 supersession；仅未解决的同范围冲突取严 | 恢复既有窄范围授权，不授予新例外 |
| AGENTS 过大、关键规则位于尾部 | 审批/自主性/Git 前置；153 条领域原文迁至按主题读取的附件 | 领域禁令与审批原文保留 |
| Wind 把所有金融任务都路由到安装 | 明确仅必需的 Wind 能力触发缺失技能安装门槛；允许适合任务的已有来源 | 扩展非 Wind 路由选择；必需安装仍需确认 |
| 普通 Wind 调用隐式启动更新 | 3 个入口脚本用单次 `WIND_SKILL_UPDATE_APPROVED=1` 门禁，技能禁止把它持久化或自行设置 | 收紧默认副作用；不执行真实安装/更新 |
| neat-freak 把小收尾扩成全库/记忆清理 | 默认只处理受影响文档；文件大小是信号而非硬完成门槛；个人记忆须明确请求 | 收紧作用域，未修改个人记忆 |
| 审计、交接、上下文压缩与实施混淆 | 审计只交付建议；授权同步才改文档；上下文压缩后继续当前任务 | 不把技能触发视为写入授权 |
| 检查失败与完成条件含糊 | 区分自身回归、历史失败和环境阻塞；复用相同输入的通过结果；不以未通过检查宣称全部完成 | 必需 check:all、checker 人工评审保留 |
| Windows UI 只接受首轮预批准 | 第 3 类允许同一任务任一轮有效预批准；第 1/2 类临执行确认原文不变 | 扩展第 3 类授权有效轮次，非全面免确认 |
| Sites 建站默认接着发布 | 建站交付不隐含发布；无发布授权时交付预览/准备结果 | 收紧隐式发布；公开/共享地址批准保留 |
| openai-docs/imagegen 过宽的预先阻塞 | 本地指令审计允许先用本地事实；图像只为关键缺失信息询问 | 常规选择自主；付费 CLI/模型与必要输入门槛保留 |

## 文件与大小

- 仓库 6 个文件：`AGENTS.md`、`CLAUDE.md`、`docs/INDEX.md`、`docs/PROJECT_BACKLOG.md`，以及新增的领域附件和本回执。
- 外部 13 个文件：全局 AGENTS；neat-freak 技能及路径参考；Wind 路由技能/更新脚本；Wind MCP 技能/CLI/更新脚本；openai-docs、imagegen、computer-use confirmations、Sites building/hosting。
- 根 AGENTS：105,265 → 23,751 UTF-8 字节，减少约 77.4%；全局与项目根合计 29,829 字节。这个数字只统计两份文件，不代表整个会话上下文。
- 153 条原领域规则逐条保留，仅调整迁移后的相对文档链接。已过期阶段的适用范围由附件开头解释，不将历史门禁误套到已批准生产路径。
- 原文件备份、外部目标清单与前后 SHA-256 位于 ignored `manual-artifacts/instructions-20260906/`；外部清单为 `external/plan.json`。插件缓存升级可能覆盖这些本地修改。

## 必须保留与可继续精简

必须保留：费用与重试限额、数据源使用权/再分发许可、生产写入路径、模型与数据契约、失败关闭、凭证保护、临执行确认和 owner 手动 Git。它们限制真实副作用，有明确目的。

已取消不必要的普遍化要求：每个执行步骤都当新 milestone、遇到潜在风险停止整项任务、小范围同步扫描/重写全部文档、按行数制造无关改动、审计自动写交接或个人记忆、普通查询隐式更新、建站默认发布。

暂时保留但值得下一轮评审：只改文档也要求全套检查；每次非平凡前端调整阅读全文 DESIGN；根 AGENTS 中大量工具名称。尤其根名称与 checker 硬编码断言耦合，进一步瘦身需要把断言迁至真正的领域权威文档并验证覆盖等价，不能直接删断言或加 skip。本轮未改变这类验证政策。

## 验证

- `node manual-artifacts/instructions-20260906/verify.mjs`：exit 0。153 条迁移、大小预算、主题锚点、13 个外部文件哈希及明确审批门槛通过；4 个默认 Wind 更新入口零写入/子进程/网络尝试，1 个批准分支仅拦截验证，3 个脚本语法通过。
- Python 3.12 执行 `manual-artifacts/instructions-20260906/verify-skills.py`：exit 0。7 个技能 YAML 有效，6 个通过通用 quick validator；Wind MCP 原有扩展元数据在修改前后均不受通用 validator 支持，未为过检删除元数据；0 个新增失败。
- `npm run check:all`：最终 exit 0（执行 session 3309）。早期失败揭示根 AGENTS 名称/版本标记依赖，已补回必要标记；沙箱 `.gstack` 目录读取 EPERM 后使用获批权限运行，未改 checker 或目录权限。例行 WARN/EXPECTED SKIP 不代表生产观测项已解除。
- 直接 `node scripts/check-suite.mjs oil-directional` 在 Windows 因 `npm.cmd` spawn EINVAL 退出 1；改用 package 定义的 `npm run check:oil-directional` 后 exit 0（88 项），不改实现。
- `npm run check:docs`、`git diff --check`、`git diff --exit-code -- scripts tests package.json data realtime .github`：exit 0；完成回执更新后再次复核文档与差异。
- `check:all` 不写生产数据，但会运行既有 offline/manual input scaffold 并写 ignored manual-artifacts；已更正文档中“完全零文件写入”的误导描述。无真实 provider 调用、更新安装、生产发布或 UI 操作。
- 尚未通过全新会话行为测试证明“多余确认次数减少”；当前证据为规则完整性、格式、代码分支与副作用测试。

## 后续

- 本地任务已完成。若要纳入仓库历史，由 owner 审阅 6 个仓库文件并手动执行 Git；本次未暂存既有 `.agents/` / `skills-lock.json`。外部技能属于本机配置，不会被本仓库 Git 提交包含。
- 插件更新可能覆盖缓存修改；保留本地备份/哈希，不能声称上游已修复。
- 根规则中的工具定位名受现有 checker 约束；进一步移除须独立 reviewed checker 迁移，不能削弱 assertion。
