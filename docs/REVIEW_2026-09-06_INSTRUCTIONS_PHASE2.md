# 2026-09-06 指令治理第二轮

基线 main / `1e0f4a1f`，承接上一轮未提交的本地指令修改。owner 本轮要求：解除领域 checker 与根工具名的绑定、评审验证深度、持久保存技能修改。三项本地交付已完成；验证深度按请求完成评审，政策提案尚未启用。未 commit/push/deploy。

## Checker 与 AGENTS

72 个领域 checker 仅替换权威文档路径与对应错误标签；workflow checker 的 3 个领域文档列表和 G-6 读取源作同样迁移。原断言、阈值、运行路径与失败逻辑保持；serial trunk 仍在根文件检查。新增根到领域附件的链接/锚点检查，以及 6 类真实 checker 的缺文件/缺标记反例。根文件中的大段工具名清单已删除。

根 AGENTS 从上一轮 23,751 降至 18,026 bytes（进一步减少 24.1%）；相对最初 105,265 bytes 减少 82.9%。全局与项目根合计 24,627 bytes。153 条领域规则仍完整保留在附件中；这是按需加载与去重，不是删除保障。

按 [ADR-0024](ADR/0024-agent-domain-authority.md) 独立审阅该治理变更；本轮不自动创建 PR 或执行 Git。上一轮回执中的大小和“未改 checker”仅描述上一轮。

## 验证深度评审（提案，尚未改变现行要求）

现行 AGENTS §5 要求提交前 `check:all`，§6 又要求所有文档修改 `check:docs + check:all`。全套覆盖运行代码、工作流、数据、静态时效和手工样本；对于修正错字/普通解释性文字，其中多数检查没有新增覆盖收益，而且会生成 ignored analyst input。与此同时 `check:docs` 当前只扫描根 README/AGENTS 和 docs 顶层，未完整覆盖 CLAUDE、DESIGN、ADR 子目录及通用 Markdown 锚点。因此现在直接把所有 `.md` 变更降为 check:docs 不可靠。

建议今后明确分两档，而非用扩展名一刀切：

| 范围 | 建议最低验证 | 原因 |
|---|---|---|
| 纯叙述、拼写、非执行示例、历史说明；不改规则/命令/链接目标/契约 | 改动文件的链接及锚点、`check:docs`、`git diff --check` | 不改变运行行为，可免除本地重复全套 |
| AGENTS/CLAUDE/领域边界/数据源与契约/运维命令/部署说明/ADR 决策，或任何被 checker 读取的文本 | 对应专项 + `check:all` | 文档可能控制 agent 操作或参与契约检查 |
| 混合代码/配置/脚本/workflow/fixtures/生产数据改动，或无法可靠归类 | `check:all` 及现有专项 | 按最高影响范围验证 |

可审阅的替换条文：

> 提交前默认运行 `npm run check:all`。唯一例外是经完整 diff 核对的纯叙述性文档变更：未改变权限、契约、可执行命令、来源/部署约束或受 checker 消费的文本，且改动文件链接与锚点、check:docs、git diff --check 均通过。混合或不确定变更继续全套；CI/部署门禁不变。

采用前需先补齐轻量文档检查的覆盖，并用“改命令/审批/契约但仍是 .md”反例验证分类。这个提案减少本地验证义务，属于验证政策放宽，不扩大付费、发布、Git 或生产写入权限。本轮仅评审，保留现行 §5/§6 与 CI 完整检查要求。

## 技能可维护来源

已将上一轮 13 个外部目标的原版、修改版、逐项 diff 与 SHA-256 从项目 ignored 临时产物复制至本机 `C:/Users/ctmaomao/.codex/instruction-maintenance/`，共 43 个可维护源文件。它是维护源，不是第二份插件注册或自动加载的同名技能。全局 AGENTS 增加按需读取该维护源的入口；安装前备份保存在维护源的 `backups/20260906T043434440868Z/`。项目内旧备份未删除。

`manage.py status` 默认只读；显式 `apply --review-token ...` 才写已审阅目标。升级后的缓存版本必须显式映射到同一 package-relative 路径；不能猜测活动版本。只应用唯一匹配的上下文差异，保留其它上游变化；冲突或来源哈希不符时停止整次写入。备份位于维护源目录，不位于易被替换的缓存。

不新增启动钩子、计划更新、联网安装或后台写入；源码持久化不等于所有未来版本已经兼容。未来升级后先审阅新版本，再重应用对应差异；新的上游冲突仍需人工判断。

## 验证与交接

- `npm run check:all`：exit 0，执行 session 71156；包含新 `check:docs` 回归。没有删除、放宽或跳过原 checker 断言。正常 WARN/EXPECTED SKIP 仍是原有观测/样本结果，不表示解除生产待办。
- `node --test tests/unit/agent-domain-authority.test.mjs`：exit 0，13 项通过。包含 6 种真实读取/断言形态各自缺文件与缺标记的 12 个失败场景；只读子进程注入，真实文档未被破坏。
- `python C:/Users/ctmaomao/.codex/instruction-maintenance/test_manage.py`：exit 0，10 项通过；覆盖全部 13 组原版恢复、全部 13 组模拟升级新增内容保留、幂等、状态只读、过期 token、冲突阻止整组写入、缺失文件、歧义/审批上下文改变、来源哈希和路径限制。
- `python C:/Users/ctmaomao/.codex/instruction-maintenance/manage.py status`：exit 0，13 current / 0 pending / 0 conflicts。不代表所有未来上游版本已验证。
- `node manual-artifacts/instructions-20260906/phase2/verify-final.mjs`：exit 0，逐文件验证 72 个机械替换与迁移前除路径外完全一致、153 条原规则保留、43 个维护源 SHA-256 与计划一致、13 个目标内容匹配。全局 AGENTS 与维护源仅有 CRLF/LF 换行差异，已按文本逐字核验；其它 12 个目标字节哈希一致。
- `git diff --check` 与运行文件/生产数据/前端/工作流差异复核通过；完成回执更新后补跑 `npm run check:docs`。全套检查后没有新的 checker/runtime 变更，仅个人维护源落盘与交接记录更新。

本轮仓库改动：根 AGENTS、72 个领域 checker、workflow checker、doc-links checker、链接校验 helper、2 个回归测试文件、package 的 check:docs 入口、INDEX/ADR 索引、ADR-0024、本回执和 PROJECT_BACKLOG。完整机械迁移清单与证据在 ignored `manual-artifacts/instructions-20260906/phase2/migration.json` / `verification.json`；前一轮 CLAUDE/领域附件等未提交修改仍在工作区。

自审：实施范围对应 owner 的三项要求；机械替换及 workflow 短 diff 均已复核；没有新增 ignore list、削弱断言或改变费用/发布/Git 权限。ADR-0024 的合并前独立人工 review 仍保留。

后续仅有两类独立事项：若采纳轻量文档验证提案，先完善其覆盖与分类回归，再明确修订 §5/§6；插件实际升级后按维护源 README 核对活动版本并审阅重应用。当前不自动启用这些后续操作。

不更改站点 runtime、生产 JSON、前端、发布流程或个人记忆。已有 `.agents/`、`skills-lock.json` 不纳入本轮。完成后 owner 只需审阅治理差异并按现有规则手动 Git；当前任务不要求部署。
