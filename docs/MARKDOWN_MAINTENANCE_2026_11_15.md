# Markdown 精简复核 · 2026-11-15

## 范围与基线

用户要求继续精简代码与全部 Markdown。本轮文档基线为 main `7a23c8d4911b7a35c5a17e6e01c6fcf9e606698c`：359 个 Git 受控 `.md`、49,583 行。覆盖根目录 5 个、docs 顶层 218 个、ADR 111 个，其余 25 个为嵌套设计、证据、交付、fixture、Worker、周报和手工样本说明。

逐文件扫描路径、字节哈希、行数及内联本地链接；没有完全相同的 Markdown 文件。除本补丁新建说明尚未落盘时的两条预期引用外，扫描未发现缺失本地路径。此口径不验证 URL 可达性、锚点、引用式链接或所有历史结论；不声称 359 篇来源、经济判断和当前运行状态已逐句重新认证。

## 有界修改

- `PROJECT_BACKLOG.md`：撤除顶部四段重复待验，按 main 提交历史归并已合并 #503、#570–#573；去掉 #569/#570 仍待集成的旧状态。把三处重复 AI 恢复/隔离说明合为一项，保留已耗次数、永久预留金额、原稿/run、no retry 和事实门槛。
- `LEGACY_DOCUMENT_STATUS.md`：历史 Market Pricing 快照不再写作 “Today”，旧 External AI 替代设计不再暗示今天已有文章；现行状态指向 backlog。
- `INDEX.md`：补充独立市场观察契约入口，不复制运行进度。
- 原 backlog 全文通过 [固定提交](https://github.com/ctmaomao/gfrr-auto-update-site/blob/7a23c8d4911b7a35c5a17e6e01c6fcf9e606698c/docs/PROJECT_BACKLOG.md)保留。不是不可恢复删除，也不更改原始历史文件。

## 保留与停止条件

大型 DATA_CONTRACT、OPERATIONS、DATA_SOURCES、历史交接及来源审计并非精确副本：包含字段、操作、阶段证据或失败条件。此次不凭篇幅合并，不迁移机器消费标记，不删除 ADR/fixture README，不改变预算、来源权利、运行授权或生产 JSON。代码已合并不代表自然采用、线上健康、来源资格或预算激活。

后续只在明确重复、过时状态或可验证维护收益出现时继续精简；不为减少文件数而抹去证据。本轮未重新抓取数据或核验线上，仍待自然采用的项目继续由 backlog 单独追踪。验证要求为完整检查、独立实际补丁审阅与精确提交 CI，结果随 PR 回执报告，不预写通过。

## 后续深审：归并后移除冗余副本

针对“是否有删减必要”的追问，继续检查同一阶段的重复规划/过程回执，而不是以最少文件数为目标。#574 后基线 `1d1db609` 为 360 篇（比此前增加本说明），合计 4,428,000 字节。互斥结构分类如下；专题文件不能仅凭旧日期判为失效：

| 类别 | 数量 | 本轮判断 |
|---|---:|---|
| 根入口 | 5 | 保留运行/设计/安全导航 |
| ADR 与决策索引 | 111 | 保留决策理由与替代关系；仅迁移受影响证据链接 |
| 证据与交付附件 | 20 | 不把截图、验收和安全证据当可再生成垃圾 |
| 工具样本与运行说明 | 4 | 保留样本、Worker、手工输入及周报说明 |
| 明确历史交接/完成记录与日期化维护回执 | 15 | 7 个同一 PR 的分阶段治理回执归并到已有总回执；其它保留 |
| 专题契约、来源、设计与任务说明 | 205 | 2 个旧 AI 规划副本及 1 个重复校验说明归并；其它不机械删除 |

专项扫描了 19 篇旧 External AI、22 篇 Market Pricing，共 11,037 行的文件名引用；这是消费者盘点，不声称逐句复核全部 41 篇。10 个删除候选完整逐段阅读，并检查入链及 Git 受控脚本/测试/工作流/数据的完整文件名引用，没有发现机器消费者。动态拼接读取不能仅由此排除，仍要求完整回归和独立实际补丁审阅。没有把受控 Markdown 中的历史/证据说明认定为可自动重建产物；本轮不删生成管线、原数据或图片。

| 归并后删除的副本 | 保留位置与重要内容 |
|---|---|
| `REVIEW_2026-09-06_` 的 INSTRUCTIONS、INSTRUCTIONS_PHASE2、INSTRUCTIONS_PHASE3、MARKDOWN_FINAL、DOC_CONSOLIDATION、ENERGY_BACKLOG、ENERGY_ASSERTIONS 共 7 篇 | [PR #304 总回执](REVIEW_2026-09-06_CLOSEOUT.md#historical-evidence)：阶段结论、失败/未验限制、ADR 与原文 SHA256；原 ADR 决策和领域历史不删 |
| `EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md`、`EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md` | [旧 AI 状态与归档](LEGACY_DOCUMENT_STATUS.md#archived-l-3d--l-3e-planning-and-audit-trail)：实际调用/无调用、质量失败、旧链退役、现存手工安全边界、未证实完成的提案及原文 SHA256 |
| `MARKET_PRICING_WEEKLY_HISTORY_BUILDUP.md` | [M-25 先决校验](MARKET_PRICING_METRICS_CALCULATION.md#m-25-history-prerequisites-consolidated)：完整九项条件、覆盖一致性、只读及 M-26/M-27 职责隔离，checker 不删 |

10 篇原副本共 107,675 字节，完整原文可通过承接文档的固定提交链接恢复，哈希可核对。所有现有入链已迁移；旧 AI 历史描述仍链接其原始固定版本，不篡改当时状态。工作树 Markdown 减少 10 个至 350 个；最终净字节节省在 PR 回执报告，包含本说明及导航的维护成本。

停止于有证据的冗余：其它旧 Market Pricing 展示说明仍含兼容算法，来源审计仍含资格/限制；无入链不等于无价值。其余专题材料尚未逐篇逐句核验，不宣称全部 350 篇都已达到不可再精简，也不把这次归并视为关闭历史未解条件。
