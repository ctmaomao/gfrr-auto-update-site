# 指令与文档治理提交回执 · 2026-09-06

<a id="accepted-pr304"></a>

## 当前验收与决策入口

PR #304 已合并，提交 `8cc2e9cc`；完整本地验证、PR CI、自动 Pages 发布和六份线上文件逐字节核对均通过。最终证据见 [PR 交付记录](https://github.com/ctmaomao/gfrr-auto-update-site/pull/304#issuecomment-5562452977)。下方过程记录中的“未合并/等待 review”属于当时快照。

Owner 明确授权 AI 执行 PR #304 的治理审核与指定 Hook 验收，并另行授权该 PR 合并及其自动 Pages 发布。这是该次执行人例外，不是独立人工签字；后续 PR、其它 Hook、费用与发布继续遵守各自通用要求。

现行决策：[ADR-0024 领域断言归属](ADR/0024-agent-domain-authority.md)、[ADR-0025 按变更验证](ADR/0025-proportionate-validation.md)、[ADR-0026 Git 分级授权](ADR/0026-tiered-git-authorization.md)、[ADR-0027 设计文档例外](ADR/0027-design-document-consistency.md)、[ADR-0028 历史断言归属](ADR/0028-energy-record-assertion-location.md)。日常执行仍从根 AGENTS 读取。

## 2026-09-07 后续整理

- 通用 market-environment-analysis 技能不含项目专用路径或运行时接入，归入个人范围：从项目 .agents/skills 迁至用户级 ~/.agents/skills，原 skills-lock.json 保存在 ~/.agents/skills-lock.json；四个技能文件和锁文件共五份 SHA-256 均不变，不修改其它用户级技能或安装器锁表。此迁移让新会话可在其它项目发现它，不赋予自动调用、更新或发布权限；既有会话的技能路径目录可能要在新会话刷新。
- 检查器和 ignore 规则未改。迁移后干净仓库返回 none；临时普通 Markdown 实际运行 light 文档检查成功；加入未知类型文件仍返回 full。临时探针已清理。本轮治理文档变更仍须完整检查。
- ADR-0024–0028 状态统一指向上方已完成验收；仅补记 PR #304 的执行人例外。根 AGENTS 的 secondary/Worker health 约束归于 §1，render 约束归于 §3，不丢失字段、禁止操作或 gate 边界。
- 默认索引与 backlog 只链接本总回执；逐阶段证据按下方历史目录读取。旧过程与发布前交接原文迁入历史文件，当前交接只保留结果、当前任务与真正待办。

本轮 owner 授权实施上述四项并沿用本系列 commit+push；通用合并 review 保留。检查结果和远端提交以本轮 PR 交付记录为准。

<a id="historical-evidence"></a>

## 历史证据目录（按需）

阶段回执保留原文，不再作为默认启动阅读入口；其中的旧状态不覆盖上方验收。

- [初轮指令审阅](REVIEW_2026-09-06_INSTRUCTIONS.md)、[领域解耦与验证提案](REVIEW_2026-09-06_INSTRUCTIONS_PHASE2.md)、[验证落地与维护源](REVIEW_2026-09-06_INSTRUCTIONS_PHASE3.md)。
- [Markdown 复核](REVIEW_2026-09-06_MARKDOWN_FINAL.md)、[状态与设计文档整理](REVIEW_2026-09-06_DOC_CONSOLIDATION.md)。
- [Energy backlog 整理](REVIEW_2026-09-06_ENERGY_BACKLOG.md)、[历史断言迁移](REVIEW_2026-09-06_ENERGY_ASSERTIONS.md)。
- [指令维护过程与发布前交接原文](PROJECT_HANDOFF_HISTORY.md#instruction-maintenance-2026-09-07)。
- [PR #304 交付、审核与 Hook 启动过程原文](PROJECT_HANDOFF_HISTORY.md#instruction-closeout-pr304)。
