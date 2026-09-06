# 指令维护第三轮：官方指南对齐与自动化

## 授权与结论

2026-09-06 owner 要求完善轻量检查覆盖及升级维护，并按 GPT-6 Astra 官方文档精简、通用化、自动化。本轮据此落实普通文档验证例外，保持明确的 Git 人工执行、发布、付费和源权利审批。不是模型性能评测，也不宣称存在官方认证配置。

## 改动依据

| 原指令/机制 | 问题与实际改动 | 权限影响 |
|---|---|---|
| 全局 AGENTS：`Local token anomaly awareness`、`GPT-5.5`、固定七项汇报、复杂任务必须列整套步骤 | 旧模型异常不是可验证的当前运行约束；通用流程多次重复。删旧模型提醒与固定格式，保留证据、适度规划、有效验证和完整交付 | 无外部权限扩展；允许按任务决定规划/汇报深度 |
| 全局：`Repository-level AGENTS.md ... must not weaken these global rules` | 把所有个人偏好升级为绝对上位规则。改为个人默认值与平台/就近作用域，明确审批仍保留 | 项目可以细化普通工作偏好；不能借此取消明确审批 |
| 根 AGENTS：`只改 README / AGENTS / docs` 也必须 `check:all` | 普通说明与契约修改混同。新增整个工作区自动分流，根/递归 Markdown 链接锚点覆盖；规则文件仍走完整验证 | 窄范围降低普通文档本地检查成本，见 ADR-0025 |
| OpenAI Docs 技能：`First substantive action` 必须先搜再读本地、`Read at most one primary reference` | 强制顺序和配额可能阻止合理的本地诊断或跨主题查证。改为任务相关证据优先、官方事实实时验证、引用按需加载；减少技能正文 | 不授予安装、更新、API 或凭证权限 |
| 升级维护：人工核对版本并编写 `--targets` JSON | 改为 `--installed` 读取本地 CLI 的实际已安装版本，拒绝缺失、禁用、重复或非法版本；不选缓存中“最新目录” | 自动只读发现；写入仍需现有 review token 与授权 |
| 每次升级后人工想起检查 | 配置官方 SessionStart 异步 hook，正常时无提示；漂移时给有界提示，不阻塞原任务、不读取聊天或上传内容 | 新增启动时只读本地检测；首次需官方 Hooks 信任，不改信任数据库 |

## 维护来源与操作

全局规则、OpenAI Docs 的修改同时更新个人维护源的 local/hash/diff，不只改缓存。维护工具位于用户 Codex home 的 `instruction-maintenance/`，新增 installed-version discovery 和 SessionStart handler；安装路径记录仍为本机路径，换机器需重新绑定，不能宣称整份 manifest 自动跨机器适配。

状态：`python ~/.codex/instruction-maintenance/manage.py status --installed`。审阅相关 upstream/local 差异后，在已授权维护任务内沿用现有 token 执行 apply；不需要让用户再手写目标 JSON。发生上下文冲突时保留新上游，不能自动认定批准条款可覆盖。升级检测仅在受信任 hook 的 startup/resume 事件执行，不是后台插件升级服务。

配置保留现有 `gpt-6-astra` / `high`；未把 API 的 async、Responses 或 reasoning 参数机械写入 Codex 配置。未强制每个任务用子代理或最大推理强度；这些取决于宿主能力和实际任务。

## 验证记录

- `npm run check:changed`：exit 0，整个工作区自动选择 full 并完成 `check:all`。日志：`manual-artifacts/instructions-20260906/phase3/check-changed.log`。
- 完整链后最终的根规则压缩和链接检查增强，重跑 `npm run check:docs`、`npm run check:workflows`：均 exit 0；文档 18 个测试通过，186 个 Markdown 的链接/锚点问题为 0。复用未变化的其余 full-suite 结果，没有再次全量重跑。
- 个人维护 `test_manage.py`（10 项）、`test_discover.py`（2 项）：exit 0。覆盖 13 份原始恢复、升级新增内容保留、冲突拒绝、幂等性、目标限制、实际版本映射、禁用/重复/非法版本及非阻塞提示。
- `session_start.py`：exit 0，输出 `{}`；`manage.py status --installed --diff`：exit 0，13 current / 0 pending / 0 conflicts / 0 upstreamReview。Hook JSON 已写入用户 `.codex/hooks.json`，未更改官方信任状态，尚未验收真实生命周期触发。
- OpenAI Docs 的 `quick_validate.py`：exit 0；最终 `git diff --check`：exit 0。
- `node manual-artifacts/instructions-20260906/phase3/verify-final.mjs`：exit 0；72 个领域 checker 保持机械等价、153 条原领域约束保留、13 份安装目标与维护源哈希一致。
- 根 AGENTS：本轮 18,026 → 16,695 bytes（最初 105,265）；全局：6,601 → 2,804 bytes；合计 19,499 bytes。前端必读、PR 声明、变更前盘点和禁止越界要求压缩表达后保留。OpenAI Docs 当前 2,624 bytes。

本轮变更文件：根 AGENTS/CLAUDE、package.json、新增 scripts/check-changed.mjs / scripts/lib/doc-change-policy.mjs / tests/unit/doc-change-policy.test.mjs、ADR-0025 及索引/回执/交接；仓库外为全局 AGENTS、OpenAI Docs SKILL、个人维护源及 hooks.json。此前 72 个 checker 等第二轮改动继续保留，未修改原有未跟踪 .agents/ 或 skills-lock.json。

## 官方来源与剩余边界

- [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model)：持续执行、技能敏感性、适度验证；本轮采用简短表达，没有复制整套官方示例提示词。
- [Codex best practices](https://learn.chatgpt.com/guides/best-practices) 与 [AGENTS discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)：根规则简短实用、按作用域加载。
- [Skills](https://learn.chatgpt.com/docs/build-skills)：按需加载；长期维护源避免依赖缓存存续。
- [Hooks](https://learn.chatgpt.com/docs/hooks)：标准用户级 hooks.json、SessionStart、异步只读提示；新/改 hook 必须通过 CLI `/hooks` 审阅并信任精确定义。

首次信任和真实新任务触发仍须实际验证；直接运行脚本成功不等于 Codex 生命周期已经激活。Git 提交/合并仍由 owner 操作；独立 checker/governance review 仍适用。未来真实上游冲突只能在出现后审阅，不能现在宣布已解决所有未来升级。
