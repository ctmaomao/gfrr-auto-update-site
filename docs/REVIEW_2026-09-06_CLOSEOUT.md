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

七份分阶段回执于 2026-11-15 归并为下表；下列均为 **2026-09-06 的历史执行事实**，不是当前规则或未完成任务。完整原文在固定提交中保留，可按链接取回并核对 SHA256；细节不依赖易失的 ignored 日志。现行权限/流程仍以根 AGENTS 和明确后续 ADR 为准，旧“人工 Git/待合并/未启用”不得覆盖后来的已审决定。

<a id="instructions"></a>

### 初轮

初轮：153 条领域规则迁入按需附件；根规则压缩，Wind 默认更新副作用加门禁。13 个外部目标维护独立于仓库，缓存更新可能覆盖；未证明新会话确认次数已经减少。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_INSTRUCTIONS.md) · SHA256 `1517f3b8918bcb6a40034dc38b149ccab359274ab17155d7c2e5421b466e707b`。

<a id="phase2"></a>

### 第二轮

第二轮：72 个 checker 仅迁移权威路径/诊断标签，保留全部断言；13 项领域回归含 12 个缺文件/标记反例。个人维护源保留 43 文件，写入仍需已审 token，冲突整组停止。轻量检查当时仅提案。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_INSTRUCTIONS_PHASE2.md) · SHA256 `6be0a96cfbf36813498dd229dd919d7281b606d1df5da8523ec50ebc529559a7`。

<a id="phase3"></a>

### 第三轮

第三轮：ADR-0025 落实普通文档 light/full 分类及递归链接锚点；契约/权限/命令及混合变更仍 full。SessionStart 仅本地只读漂移提示，真实生命周期当时未验，不是后台升级服务或官方认证配置。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_INSTRUCTIONS_PHASE3.md) · SHA256 `6fe6d3bd8d230dc4018740de3669c9f4f146d1937d68fd5c4fd4afdb81c3e24a`。

<a id="markdown-final"></a>

### Git 分级与扫描

Git 分级与扫描：ADR-0026 取代通用 owner-manual 限制；186→188 篇历史扫描不是最新数量。neat-freak 只吸收已审上游触发边界，未整包安装；缺原来源锁的限制保留。识别 27 篇重复状态及设计矛盾。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_MARKDOWN_FINAL.md) · SHA256 `b975cf3e2d3a92c0da49846002afb8ec77fea211aa2998fcbed647b20032b417`。

<a id="doc-consolidation"></a>

### 状态与设计

状态与设计：13 篇 Market Pricing、14 篇 External AI 状态归一；旧交接原文归档。ADR-0027 仅明确 token 定义与既有单条 #999 边框例外，不批准其它视觉漂移。27 篇状态替换与历史/ADR 正文保全验证通过。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_DOC_CONSOLIDATION.md) · SHA256 `2fc64c26155dbdfdaa3e22072d44ed5d0b299aa6ae17bb2baab0b190b2b4c0a7`。

<a id="energy-backlog"></a>

### Energy 归档

Energy 归档：P3-19/P3-19a 原文移入历史，保留批准、预登记、样本及 commit/run；76 项 checker 标识当时仍在 backlog。FIRMS 首次成熟是 9 月 5 日快照，不证明后续健康；PortWatch capped free proxy 最多 +3 不解锁 route/market，Web shadow 不自动切源。首次检查缺 6 标题失败，补齐后完整重跑通过。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_ENERGY_BACKLOG.md) · SHA256 `4475e4f62087f0c6d7e7b3cf6c08713bff09f8657ea9b04bfdfacce8e7343cff`。

<a id="energy-assertions"></a>

### 断言迁移

断言迁移：ADR-0028 将 68 个 checker 的 76 项标题/schema 读取移至 Energy 历史，机械等价且历史字节不变。18 项真实 checker 隔离测试覆盖缺文件/标记必须失败；backlog 不再负担兼容索引，其它消费者及必需章节保留。

[完整阶段原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/REVIEW_2026-09-06_ENERGY_ASSERTIONS.md) · SHA256 `0f769a674a88a993dbf115fe052a334efe89fff8c40cf385b4075620b5435467`。

各阶段原文记录完整检查及专项保全通过，也保留首次失败、环境限制和未验项目；本次整理没有重新执行当年的外部技能/Hook 操作。源码、数据、费用、来源权利、生产写入和凭据保护不因归并放宽。PR #304 最终审核及 Hook 启动验收以上方总回执为准，不把早期未验状态重新变为待办。

- [指令维护过程与发布前交接原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/87fa3710a2975d4d96ea0175c1b51d362089ac66/docs/PROJECT_HANDOFF_HISTORY.md#instruction-maintenance-2026-09-07)。
- [PR #304 交付、审核与 Hook 启动过程原文](https://github.com/ctmaomao/gfrr-auto-update-site/blob/87fa3710a2975d4d96ea0175c1b51d362089ac66/docs/PROJECT_HANDOFF_HISTORY.md#instruction-closeout-pr304)。
