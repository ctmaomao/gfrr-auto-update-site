# 指令与文档治理提交回执 · 2026-09-06

Owner 已授权完成建议并 commit+push。本系列仓库交付包含 AGENTS/CLAUDE 精简、领域规则承接、校验器文档读取解耦、按变更验证、设计例外、重复状态合并及 backlog 历史归档。此前各阶段回执是当时快照，其中“未 commit/push”不代表本轮最终交付状态。

## 本轮整理

维护状态只保留版本依据、前端/Worker/Daily 职责与现行契约入口，不手抄检查数量或旧健康快照。Completed 表、P3-17/18/20 和旧维护状态原文存入 [PROJECT_COMPLETED_HISTORY](PROJECT_COMPLETED_HISTORY.md)；原章节入口与当前待办保留。

领域附件纠正旧 v28.0J “当前基线”描述，增加 Transport 手工条目的按需导航，原领域规则正文保留。AGENTS 删除“空 ignore list 也解释为何为空”的形式要求；实际 ignore 的理由、边界、解锁路径和人工合并审阅仍保留。此修改不增加操作权限。

## 验证与交付

- `npm run check:changed`：exit 0；本系列含治理/校验器变更，自动选择完整 `check:all`，全部通过。
- `npm run check:docs`：exit 0；36 个指令/历史读取与验证分流测试通过，198 个 Markdown 文件的链接/锚点问题为 0。
- 本轮原文保全核对：exit 0；5 个归档块逐字保留，其余 8 个 Open 条目不变，领域附件 158 条列表行不变，862 个基线文件核对未发现范围外修改。Backlog 从 104,554 降至 43,402 字节。
- `git diff --check`：exit 0。Git SHA/远端核对结果在交付回复给出，提交和推送不代替独立人工合并审阅。

使用独立任务分支 `codex/instruction-docs-maintenance`，从 fetch 时的最新 origin/main 建立；只提交本系列仓库文件，不混入用户原有 `.agents/`、`skills-lock.json` 或 ignored 手工产物。独立人工 checker/治理 review 完成前不合并 main。分支 push 不是生产部署。

个人全局 AGENTS、技能与维护源位于仓库外，保留在现有个人维护来源，不复制到项目公开远端。`manage.py status --installed` exit 0，pending writes / conflicts / upstream review 均为 0；维护工具的 12 个单元测试通过（exit 0）。Hook 首次信任/真实 SessionStart 激活仍未实证，必须与脚本自身测试区分。

## 后续评审与 Hook 验收

本系列实现已提交为 `e268bef6a14cfddae47d9970fe549bf736dff0a4` 并推送，远端 SHA 核对一致。Owner 随后要求继续完成两项剩余验收并 commit+push；这不撤销独立人工 review 或平台首次信任要求。

- 已创建[独立评审草稿 PR #304](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304)，含 ADR-0024 至 0028、权限变化、设计例外、测试和需人工核对的差异。以 `ea1fecea` 为基线再次反向替换比对 73 个领域校验器：除了读取路径、诊断标签和一个对象键重命名，文件完全相同；断言及阈值未变。check-workflows 的来源迁移、原有 serial trunk 检查和新增文档分流另行自审。此证据是 AI 自审，尚无独立人工批准，不合并 main。
- 首个 PR CI [run 34017545933](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34017545933) 已成功：依赖审计、单元测试覆盖、完整检查和 Chromium 浏览器 smoke 均通过。这验证了远端干净 checkout 的实现，不代替人工 review；后续提交另按其 CI 状态报告。
- Codex CLI `0.153.0` 的原生 `hooks/list` 确认：唯一用户 SessionStart hook 已启用，异步、匹配 startup/resume、超时 8 秒，warnings/errors 为空；实际信任状态为 **untrusted**。本轮直接调用 handler 返回 `{}`、exit 0，12 个维护测试再次通过；这些不是生命周期触发成功的证据。
- 待信任的定义 hash 为 `sha256:94e4c828c2ba141e5807c83db488f1982fe42f7901b43749324a45216d47078d`。在 CLI 输入 `/hooks`，审阅用户级 hooks.json 中运行 instruction-maintenance/session_start.py 的命令；仅信任这个确切定义。之后在一次自然新会话或恢复中核对平台的 SessionStart 完成事件及退出结果；无漂移时 handler 应保持安静，不能用“没看到提示”推断已执行。

[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)规定非 managed hook 在审阅并信任当前定义前跳过执行。没有改写信任存储、使用 bypass 参数、伪造事件或把直接脚本测试记为真实触发。PR 人工审阅与 CLI 信任是目前等待 owner 的具体动作；其余准备已完成。本段后续文档检查及 commit/push 结果在交付回复给出。
