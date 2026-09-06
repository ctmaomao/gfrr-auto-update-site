# ODP / Energy backlog 整理回执 · 2026-09-06

Owner 授权执行前轮点名的 P3-19/P3-19a 精简。仅调整文档组织，不修改领域 checker、运行时、生产数据、源权利或审批门槛。前轮状态/设计整理见[此前回执](REVIEW_2026-09-06_DOC_CONSOLIDATION.md)。

## 交付

- [PROJECT_BACKLOG](PROJECT_BACKLOG.md) 保留原章节锚点，改为当前状态、范围、未解锁事项、对应契约及验证入口。仍被 checker 消费的阶段标题保留为短索引，明确不是待执行清单。
- [ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md) 原文保留两个阶段块，包括既有批准、边界、预登记回测依据、样本结论和 commit/run ID。历史“下一步”不恢复为当前任务；仍有效的预登记和阶段约束没有因归档取消。
- INDEX 与 MILESTONE_INDEX 同步导航。本轮不增加新 ADR、运行机制或定时任务。

## 当前事实与容易误读的边界

- FIRMS 本地 baseline 已记录 9 月 5 日成熟晋升：42/42 设施，最短窗口 35.48 天。旧 P60/P68 的“等待首次晋升”留作历史，不作为今天的阻塞；后续 promotion 的健康门、最短设施窗口门与人工要求保留。
- P50/P51 已批准 PortWatch capped free-proxy runtime，默认 0、最多 +3；route/market confirmation 仍未连接，manual readiness 成功不扩大授权。两条路径的状态不是互相矛盾。
- Web NGrams 自动聚合展示和 shadow 已接入，但 routing policy 仍为 DOC primary + Web shadow。9 月 5 日 v2 修复后须独立积累同口径观察窗，不能混算旧样本或自动切源。
- PortWatch writer 已用 `imf_data_terms_pinned`，再分发 caveat 和旧 `partial` 兼容边界仍在；不能从 enum 更新推断来源权利或生产接入授权。

本轮事实核对来自本地配置、数据、源契约及最新交接，没有重新做线上验收、运行生产刷新、调用付费源或执行发布。

## 验证结果

Backlog 从 239,042 bytes 降至 109,088 bytes，缩减 54.4%；P3-19/P3-19a 从 141,132 bytes 降至 10,843 bytes，缩减 92.3%。历史仍完整存在于归档，收益是减少默认加载量。

保全核对 exit 0：两个阶段块原文各保留一次，原章节标题及范围外待办/完成事项未变。856 个已有文件哈希核对证明本轮只改相关文档，保留此前代码/指令改动和用户文件。

初次完整检查在前端卡片文档断言处失败，原因是六个带阶段信息的标题未进入首次短索引。已补回原标题，并检查其它消费者的 schema/阶段依赖；共核对 76 项既有字面量依赖，原断言没有改动。完整重跑已通过，最终没有未解决的检查失败。

| 命令 | 结果 |
|---|---|
| `npm run check:changed` | exit 0；自动选择 full，已执行并通过 `npm run check:all` |
| `npm run check:docs` | exit 0；194 份 Markdown，链接/锚点问题 0 |
| `python manual-artifacts/instructions-20260906/phase7/verify_preservation.py` | exit 0；原文、章节、76 项依赖、当前事实和已有文件哈希核对通过 |
| `git diff --check` | exit 0 |

完整检查之后仅补写本回执，并复查文档/保全/空白差异。详细日志保存到 ignored `manual-artifacts/instructions-20260906/phase7/`。没有执行 commit/push、生产刷新或发布；本地文档交付完成。

## 后续

短索引和验证入口仍保留 checker 的标题/schema 依赖。进一步移走它们需要单独迁移 checker 的文档目标并保留断言语义；本次不为缩短文字改动校验逻辑。其余长期待办及实际生产观察继续按当前 backlog，历史归档本身不触发新工作。
