# Project Backlog · GFRR Auto-Update Site

本页只保留当前工作、未解依赖与维护入口。已完成任务的过程记录移入[2026-09 至 2026-11 原文快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)；更早记录见[历史目录](MILESTONE_INDEX.md)。旧“待合并/下一步”不覆盖下方已核实的 main 状态，合并也不自动证明生产验收完成。

## Section 1 · 维护状态

核对基线：2026-11-11 main `68b6a31e`（#535）。本表描述已合入代码，不声明当前远端工作流、账户余额或各来源健康。

| 项 | 当前依据 / 职责 |
|---|---|
| Release/display version | `v28.0.10`；以 package.json / release 定义为准 |
| Data/decision contract version | `data.version` / `decisionModel.contractVersion` 保持 `v27.0`，不可机械同步展示版本 |
| Cache version | `editorial-review-20261110-r2` |
| 前端输入 | 首页读取静态 JSON；周报为默认入口，另有雷达与 Bubble 标签；`scripts/modules/realtime.js` 冻结、未接入 |
| 雷达主读数 | OFR 已发表 FSI；旧模型保留审计，旧公开仓位/状态/风险预算/动作建议已退役，不把百分位当风险分或概率 |
| Worker / Daily | `/market.worker-preview.json` 是 Worker 主预览，secondary 只作诊断；Daily 仍消费 `realtime-data` |
| 检查组成 | package.json / scripts/check-suite.mjs；不手抄检查数量 |

执行/权限见 [AGENTS](../AGENTS.md)；来源与字段见 [DATA_SOURCES](DATA_SOURCES.md)、[DATA_CONTRACT](DATA_CONTRACT.md)；运行步骤见 [OPERATIONS](OPERATIONS.md)。适用领域规则按 [AGENT_DOMAIN_BOUNDARIES](AGENT_DOMAIN_BOUNDARIES.md) 选择，不全量读取历史。

现有专题入口：**Market Pricing freshness/alignment review**（display-only）、**FOMC Minutes tone/topic quality review**（display-only）、**World Order source-health consistency review**（overlay-only）。这些检查不是取数、付费或发布授权。

## Section 2 · Open Backlog Items

### 当前实施与真实等待

- **Bubble 新稿事实隔离**：run `42935389410` 一次生成成功，commit `423c9dc7` 自动质量门槛通过，但独立事实复核确认 RPO/backlog 被误称递延收入，以及 SPY/RSP 百分收益率差被误写为百分比而非百分点。按 owner 当前修复范围优先撤下本次 `summary.weekly_editorial`，精确恢复生成前已验证的 Bubble 文件；其余结构化数据和分数不变。原稿保留在原 commit `423c9dc7` 与受控快照，安全回执仅保留诊断摘要/哈希，不再调用、不手改稿件、不改变预算。之后分别修正源标签、单位和新闻报道日/事件日语义；自动通过不等于事实验收完成。

- **编辑提示恢复 / 新授权真实验证**：#535提示修复和#536独立新grant均已合入；新grant代码main `6c2dd08c`通过精确head CI及Pages，genesis/pins独审并回读一致。owner批准两页各一次、合计CNY4.33，本次Bubble run `42935389410`已消耗一次且有有效token回执，永久预留CNY2.161152，实际货币费用未核实。自动质量与提交成功不代表事实验收，本稿因上述两项P2隔离；Macro尚未调用，当前11月10日输入已claim，等自然新输入。旧消耗、monthly及所有预算/事实门槛保持不变。[前轮证据和继承解析局限](EDITORIAL_PROMPT_RECOVERY_2026_11_10.md)。
- **文档维护**：核查 338 个受控 Markdown，归档旧交接、消除现行导航矛盾与重复状态；完整检查和独立审阅后串行集成。验收基线是用户要求跟上开发进度、避免过严文档妨碍开发；不修改运行代码、checker、费用或来源规则。范围和检查记录见[本轮说明](MARKDOWN_MAINTENANCE_2026_11_10.md)。
- **Macro / Bubble 编辑恢复**：#532/#533 已合入 main。真实生成、状态/安全回执与 Bubble 校订由独立进行中的任务协调；本轮文档整理不运行 provider/search 或晋升诊断稿。已消耗调用不恢复，原稿隔离、单次调用/no retry、预算、来源资格与最终 writer/review 保护继续有效；新授权或账本状态须核对当前任务及实际回执，不从旧文字推算可用次数。
- **ACLED 来源故障**：自动链与分频已实施，2026-10-05/07 自然采集和双站回执见[运行说明](ACLED_AUTOMATIC_UPDATE.md)；#518 已补登录拒绝脱敏诊断。旧“尚无自然运行”已过期，但之后的登录拒绝是否恢复仍需新来源回执，不能由代码合并推断。保留 26/14/14、每周最多 54 请求和已耗 initial；不重跑、重置 claim 或绕过拒绝。
- **压力研究**：冻结 cohort `pressure-shadow-29d69c0ecb7b98a0` 继续现有采集；84 日/40 输入/12 周及[最终评审标准](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md)不变，最早时间门槛 2026-12-10 UTC。旧 2 条样本的快照不是当前计数，未重新核对实际 ledger，不声明达标或晋升。OFR 生产主读数迁移不代表七候选研究通过。
- **CSP**：采集线冻结，生产 C 不启用；原生投递、alarm/清理、隐私、共享额度和真实平台验收缺口保留。原回执、预算、一次性 marker 与锁见[归档](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)，不把归档当重启或重复试验许可。
- **其它观察与源权利**：Oil News 同口径窗口、FIRMS 后续质量与独立晋升、ARR 跨周期证据、路线级运费权利和 HAPI 候选条件保留；没有新证据不制造待办或宣称恢复。旧失败次数、账户额度和样本计数按原日期保留，不冒充最新状态。

### P0 / P1 / P2

本次文档核查不重新评定运行事故优先级。历史 P0/P1/P2 完成项已归档；当前编辑恢复、ACLED 故障与其它进行中事项以上方清单和实际最新回执为准，不再笼统声明“无 active P2”。

### P3 · 研究候选与受限来源

以下是持续边界/候选，不是自动启动的实施队列。新功能按具体任务及来源契约推进，不需要为无关历史阶段重复审批。

#### P3-10: Fed dot plot / OIS / FOMC 文本

现有公开利率、SEP、期货/公共 OIS 代理与政策文本按 [DATA_SOURCES](DATA_SOURCES.md) 使用。proprietary dealer forward curve 和更完整 NLP 尚未连接；公开代理不冒充 licensed curve，政策文本不进入 scoring/decision。历史质量修复原文已归档。

#### P3-11: Brent 实物端 / 期限结构 / freight

现有公开 Brent、期限结构与广义运价仅按源契约使用；Platts Dated Brent、formal Dated Brent 和 official ICE settlement 不因代理可用而解锁。Baltic 公共 ticker 与 StockQ 缓存按 [ADR-0067](ADR/0067-baltic-public-ticker.md)，不再把 StockQ-only 当现行要求。

#### P3-14: Redbook + BoA raw card 高频消费证据

CARTS、MRTS、BoA 和 Redbook 公开摘要已连接；raw subscription/card feed 未连接。公开摘要不得写成原始交易数据，具体字段/失败降级见 [DATA_SOURCES](DATA_SOURCES.md)。

#### P3-15: CDX HY/IG + 私募信贷 fundraising

已有 OAS、ETF、公开 settlement、NAV 与 CRE 代理；true private credit marks、licensed Markit history、non-public CRE loan tape 未连接。保留 public proxy 身份，不把它们包装为非公开底层数据。

#### P3-16: China Macro Liquidity / Property Evidence Layer

70 城、社融、OMO、MLF 的已实施来源和聚合转载身份见 [China source review](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md) / [DATA_SOURCES](DATA_SOURCES.md)。不把旧成功时点称作今日全 live；SLO 仅历史，不等于 Fed SLOOS。微观 raw tape 未连接，继续 display-only。

#### P3-17 / P3-18 · 已完成清理

F1–F6、stale-display 与 WIRE A–E 已关闭，见[完成记录](PROJECT_COMPLETED_HISTORY.md)。大型模块拆分只是候选，须有明确收益、范围与验证，不能从旧下一步自动启动；现行 DESIGN、asset bump 与冻结边界保持。

#### P3-19: Oil Directional Pressure (ODP)

ODP 为独立 audit-only/display-only 专题；不改变主分、Brent promotion、Heatmap 或 cross-validation。源/预登记回测门槛见 [source-of-record](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)、[energy](AGENT_DOMAIN_BOUNDARIES.md#energy) 与[实施历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#odp-records)。

Web NGrams 同口径观察、独立切源审查与 `automaticCutoverApproved=false` 保留，新闻/热异常/AIS 不作事故确认。FIRMS 首次成熟晋升已经完成，后续仍按 [P65 容量](OIL_THERMAL_HISTORY_WINDOW_CAPACITY.md)及 P60/P68 质量门槛，不因时间经过自动放宽。未在本轮重跑观察窗或核查线上数据。

#### P3-19a: Energy Stress Phase 2

STEO、库存与 PortWatch 摘要已接入；现行 [P50 授权](fixtures/transport-shock-confirmation-factor/runtime-scoring-migration-authorization-v1.json) / [P51–P56 runtime](AGENT_DOMAIN_BOUNDARIES.md#transport-runtime)仅允许合格 free proxy 的 +1/+2/+3、上限 +3、默认 fail-closed 0。该旧模型诊断路径不抬高 OFR 主读数。

`routeFreightConfirmation` / `marketConfirmation` 仍 `not_connected`；手工/replay/preflight 成功不构成 runtime、路线权利或生产批准。来源授权、PortWatch 条款差异与未解依赖见[领域附件](AGENT_DOMAIN_BOUNDARIES.md#transport-manual)和[历史记录](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md#energy-transport-records)，仍须保留，不借本轮整理解锁。

#### P3-20: External AI 深化（旧路径已完成并退役）

旧 `externalAiInterpretationLayer` 仅兼容/手工诊断；当前首页 [Macro Risk](MACRO_RISK_EDITORIAL_DESIGN.md) 与 Bubble 编辑层另有生产契约，均不改 scoring/decision/execution/position。旧阶段入口见[统一状态](LEGACY_DOCUMENT_STATUS.md#external-ai)。

#### P3-21: Bubble Watch

当前 Core-23 / Shadow-4、已批准 revision 和逐项来源资格以 [ADR-0069](ADR/0069-bubble-qualified-evidence-and-score-bounds.md)、[数据契约](DATA_CONTRACT.md)与实际配置为准。旧 24 指标、固定灯数、“24/24 全 live”属于历史，不能作当前保证；每次真实刷新仍验证证据日期、缺失/缓存、来源边界和独立编辑层资格。

## Section 3 · Completed Items

以下只列已核实的代码整合或已有验收记录；不把合并等同最新数据健康。

| 已完成事项 | 证据 / 当前入口 |
|---|---|
| M-71 Brent public proxy source review | [Brent source review](BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md)，公共代理和主值晋升隔离 |
| M-91 / P2-12 Market Pricing NDX/IXIC implementation | [M-91](MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md)，QQQ primary、NDX/IXIC auxiliary、display-only |
| OFR 主读数及旧公开建议退役 | #491/#492；[ADR-0080](ADR/0080-ofr-primary-pressure-migration.md)，2026-11-01 双站验收原文已归档 |
| 周报默认首页与历史档案 | #510；[周报入口](WEEKLY_HOMEPAGE_VISUAL_2026_11_09.md)，历史正文与固定 URL 保留 |
| 独立 AI 审查与同范围免重复确认 | #514 / `34c2df15`；[ADR-0092](ADR/0092-delegated-ai-review.md) |
| 近期来源/证据与编辑修复 | #511/#513、#515–#519、#521–#533 已在本次基线 main；各自 ADR 与原始回执保留，不追加旧 PR |

## Section 4 · Future Considerations

候选不自动成为任务：正式 Brent/路线运费源、政策文本质量、模块拆分、[Fed 流动性校准](FED_LIQUIDITY_RECALIBRATION_BRIEF.md)及年度 SIPRI 更新。来源权利、离线研究和独立模型评审在各自契约中定义；不重新启用旧公开建议、修改冻结协议或按旧油价占比快照直接调权重。

## Section 5 · Audit History

- [2026-09 至 2026-11 原文快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)：迁移前完整 backlog，包括成本、失败、CSP negative controls、来源审查和当时未验项。
- [更早交接与审计](PROJECT_HANDOFF_HISTORY.md)、[完成事项](PROJECT_COMPLETED_HISTORY.md)、[Energy/Transport 历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)：保留原始证据和仍有效的领域约束。
- [本轮 Markdown 核查](MARKDOWN_MAINTENANCE_2026_11_10.md)：覆盖口径、精简选择与验证限制。归档不取消未解条件，也不是新授权。

## Section 6 · 工作流约定

每个问题保留一个当前条目：目标/基线、状态、下一步、真实阻塞；状态变化直接更新同一条，不在顶部持续叠加相互矛盾的“最新”。完成后保留一行结论和证据入口，详细过程移到对应历史或任务文档。仅在有意义的实施/验收变化时更新，普通问答不用追加日志。

现有 `check:docs` 验证六个必需章节、内容与链接；不为排版删除其契约。规则、命令、权限或 checker 消费文档改动仍走完整检查及独立审查，按 [AGENTS](../AGENTS.md) 复用相同输入的成功结果，CI/生产验收要求不减。

## 🔄 Session Handoff (最新)

- **最后基线 / 改动**：2026-11-11 main `034f2573`；新Bubble正文由 `423c9dc7`正常生产生成，其后仅追加follow-up状态文件。隔离补丁精确恢复 `6c2dd08c` 的Bubble文件，差异仅为撤下该run的AI层，不改数值/评分/原期时间。
- **当前任务**：优先可恢复隔离两项独立复核确认的事实口径错误，保留原commit/受控快照和安全诊断哈希，完整检查与独审后串行发布。来源标签、收益差单位与新闻日期语义修复单独准备。
- **下一步**：核查隔离精确head CI和两站实际数据；之后审查来源语义修复。Macro仅在自然新输入、旧去重和剩余一次预算等门槛满足时继续，不重复Bubble调用。
- **阻塞 / 运行边界**：本次Bubble一次provider调用完成，尚未通过独立事实验收；费用仅有token回执，预留不是实际结算。Macro次数未使用、当前输入已claim。不删除/重置账本或标签，不改时间戳，不做额外provider调用、独立余额诊断或手工稿晋升，不把自动检查或代码部署冒充事实恢复。
