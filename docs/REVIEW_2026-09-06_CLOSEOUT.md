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

个人全局 AGENTS、技能与维护源位于仓库外，保留在现有个人维护来源，不复制到项目公开远端。`manage.py status --installed` exit 0，pending writes / conflicts / upstream review 均为 0；维护工具的 12 个单元测试通过（exit 0）。Hook 后续实证见下节。

## 后续评审与 Hook 验收

本系列实现为 `e268bef6`，评审准备为 `9158babb`，均已 push 并核对远端。Owner 随后明确授权：“我授权你帮我实际操作审核执行上述两项”。据此，由 AI 执行本次 PR #304 的审核与指定 Hook 信任/启动验收；这是仅针对这两项的执行人例外，不宣称独立人工签字，不扩展一般审核、其他 Hook 或合并/部署权限。

- **审核完成，未发现阻断项**：[PR #304](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304) 的 ADR-0024 至 0028、权限和设计例外、文档分流、负向测试及范围已复核。73 个领域校验器反向替换后与 `ea1fecea` 完全相同，断言/阈值未变；check-workflows 的来源切换及根 serial trunk 检查单独核对。没有生产数据、运行时、前端、workflow 或依赖锁文件改动。轻量判定是保守启发式、链接解析不是完整 CommonMark，这些既有局限保留。
- **信任操作完成**：在 Codex CLI `0.153.0` 原生审阅界面核对并信任唯一用户 SessionStart 命令。原生 hooks/list 复查为 enabled/trusted、异步、startup/resume、8 秒超时，无 warnings/errors；hash 保持 `sha256:94e4c828c2ba141e5807c83db488f1982fe42f7901b43749324a45216d47078d`。未直接编辑信任存储或使用 bypass 参数。
- **真实启动执行通过**：原生 App Server 新建会话及最小首轮对话触发已安装脚本。会话 `01a07633-e994-7c41-a566-270bb4d31634` 的运行时 trace 记录 SessionStart/user/async 于 `2026-09-06T10:11:52.008374Z` 开始、`10:11:52.748339Z` 以 command_outcome=completed 结束。初期探针因未收到 hook/completed 通知而失败；后改为核对原生 command_runner trace，验证 exit 0。此证据来自生命周期执行，不是直接调用 handler。会话为 ephemeral、read-only，模型只返回固定 smoke 标识；未调用项目工具。
- `9158babb` 的 [PR CI run 34017717539](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/34017717539) 已成功，涵盖依赖审计、单元测试覆盖、完整检查和 Chromium smoke；后续验收记录提交按其最终 CI 状态另行报告。

[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)规定按当前定义审阅/信任及 SessionStart 生命周期。此次两项按明确授权完成；未来 Hook 定义改变仍需按平台要求重新审阅。原始 trace 留在本机，不上传个人会话日志；本次证据摘要存于个人维护来源的 activation-verification.json。尚未合并或部署。
