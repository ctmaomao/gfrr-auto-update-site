# Documentation Authority Index

本索引区分现行规则、任务范围和历史证据，不复制每个阶段的实施/待合并状态。新增、移动或删除文档时更新适用的入口；一般任务只读命中范围及其直接依赖，不遍历本仓库全部 Markdown。

## Rule of Conflict Resolution

1. 系统、平台权限和用户当前指令不由仓库文档改变；项目执行以 [AGENTS.md](../AGENTS.md) 为入口。
2. 先核对路径、阶段、操作及明确的 reviewed supersession。已批准的窄范围替代只在该范围优先；同范围、同状态且无明确替代关系的冲突才取更严格者。检查通过不是授权。
3. 历史设计的“下一步/仅手工/未上线/待人工确认”只描述其当时阶段，不自动阻断后续已批准并验证的实现，也不解锁仍未批准的路径。[ADR-0092](ADR/0092-delegated-ai-review.md) 统一项目独立 AI 审查和同范围免重复确认。
4. 当前状态查实际代码/配置、最新任务与 PR/运行回执；已合并不等于线上验收成功，旧通过记录也不是今天的健康证明。数据来源、费用、凭据、破坏性操作与证据质量边界不因文档整理解除。
5. 检查命令以 [package.json](../package.json) / [check-suite](../scripts/check-suite.mjs) 为准；适用检查和副作用见 AGENTS §5，不机械运行历史命令。

## Current Authority

| 入口 | 何时读取 |
|---|---|
| [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md) | 执行规则 / 简短启动导航 |
| [PROJECT_BACKLOG.md](PROJECT_BACKLOG.md) | 当前工作、真实等待与最新四字段交接 |
| [DESIGN.md](../DESIGN.md) | 前端视觉、IA、组件与变更流程 |
| [DATA_CONTRACT.md](DATA_CONTRACT.md) | 字段、生产/展示契约；先定位改动对应章节 |
| [DATA_SOURCES.md](DATA_SOURCES.md) | 来源、时效、降级与权利边界；按来源读取 |
| [OPERATIONS.md](OPERATIONS.md) | 对应运行/排障/发布步骤；命令执行仍需任务授权 |
| [ADR/README.md](ADR/README.md) | 架构决策、明确替代关系和相关历史依据 |
| [SECURITY.md](../SECURITY.md) | 安全报告与披露渠道，不替代来源条款 |

## Conditional Authority

只约束点名子系统、路径或任务，不是全项目新增限制。根 AGENTS 委托的 [AGENT_DOMAIN_BOUNDARIES.md](AGENT_DOMAIN_BOUNDARIES.md) 保留机器校验的领域规则；按 runtime / external-ai / sources / energy / transport 条目读取。

### 当前产品与发布

- 首页的周报/雷达/Bubble 三标签见 [DESIGN §4.5](../DESIGN.md#45-周报默认入口与三标签2026-11-09)、[周报记录](WEEKLY_HOMEPAGE_VISUAL_2026_11_09.md)与[周报档案说明](../weekly-reports/README.md)。
- OFR 主压力读数与旧公开建议退役已经实现，见 [ADR-0080](ADR/0080-ofr-primary-pressure-migration.md)、[迁移记录](OFR_PRIMARY_MIGRATION_2026_11_01.md)、现行 DATA_CONTRACT / DESIGN。七候选研究并未因此晋升。
- 观察日期、缺失/真实零、代理身份及显示修复见 [数据口径核查](DATA_PROVENANCE_CLARITY_2026_11_09.md)。日期化局部回执不扩大修改范围。
- Pages/EdgeOne 实际 checked-main、发布去重与触发契约见 [ADR-0057](ADR/0057-publication-current-main-and-odp-tail.md)、[ADR-0066](ADR/0066-pages-publication-coalescing.md)和 OPERATIONS；完整保护网保留。

### AI 编辑与 Bubble

- 现行编辑层：[Macro Risk](MACRO_RISK_EDITORIAL_DESIGN.md)、[Bubble Weekly Editorial](BUBBLE_WATCH_WEEKLY_EDITORIAL_DESIGN.md)、DATA_CONTRACT / OPERATIONS。只解释、不改 scoring/decision/execution/position。
- 预算与搜索：[ADR-0090](ADR/0090-shared-editorial-budget-and-free-search.md) 与 monthly v2 [ADR-0110](ADR/0110-monthly-cny-ten-and-balance.md)；一次性 grant 记录 [ADR-0094](ADR/0094-editorial-one-shot-additional-grant.md)。状态必须核实实际账本/当前授权，不能由历史说明恢复已耗额度或默认重试。
- 免费完整刷新见 [ADR-0095](ADR/0095-bubble-full-free-refresh.md)；输入证据/编辑诊断的后续决策查 [ADR 索引](ADR/README.md)，本页不重复维护并行任务进度。
- Bubble Core-23 / Shadow-4、资格与 revision 见 [ADR-0069](ADR/0069-bubble-qualified-evidence-and-score-bounds.md)及其明确后续修订；[ARR 来源](ARR_EPOCH_SOURCE_REVIEW.md)不因诊断通过自动晋升。
- 旧 `EXTERNAL_AI_*` 阶段文档保留原输入/输出设计和审计证据，旧面板/旧生产刷新已退役；先读[统一状态](LEGACY_DOCUMENT_STATUS.md#external-ai)，再按兼容/手工工具需要定位。旧 no-go 不覆盖现行独立编辑链，旧工具也不继承新链授权。

### 宏观、World Order 与来源

- [WORLD_ORDER_STRESS.md](WORLD_ORDER_STRESS.md)、[WORLD_ORDER_SOURCE_REVIEW.md](WORLD_ORDER_SOURCE_REVIEW.md)、[SIGNAL_INTAKE.md](SIGNAL_INTAKE.md)：overlay / 来源接入边界。
- ACLED 现行自动链见 [ACLED_AUTOMATIC_UPDATE.md](ACLED_AUTOMATIC_UPDATE.md)、[ADR-0055](ADR/0055-acled-weekly-automation.md) / [ADR-0056](ADR/0056-acled-split-cadence.md)。[M-63](M-63_ACLED_INTEGRATION.md)仍约束手工归一化、数据和 reminder，不能用其旧全局 manual-only 文字撤销上述固定路径例外；EULA 披露、拒绝即停和已耗预算仍保留。
- [ACLED HDX/HAPI 候选](ACLED_HDX_MONTHLY_SOURCE_REVIEW.md)是独立来源评审，不是自动链替代或下载许可。[SIPRI](M-61_SIPRI_INTEGRATION.md)仍为年度手工来源契约。
- ISM 当前来源是 [M-67](M-67_ISM_PMI_SOURCE_REPAIR.md)，不是 M-47 的退役 FRED:NAPM；其它宏观源以 DATA_SOURCES 为首选。
- [China V2X](CHINA_V2X_SOURCE_REVIEW.md) / [China 宏观](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md)、[Treasury TGA](TREASURY_FISCAL_DATA_TGA_SOURCE_REVIEW.md) / [流动性校准](FED_LIQUIDITY_RECALIBRATION_BRIEF.md)：各自源评审/研究范围，不自动批准新运行输入。
- [压力研究最终标准](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md)保留冻结样本与独立评审门槛；技术审阅主体按 ADR-0092，真实来源/人工标注事实不得改写。

### Energy / ODP / Transport

- `docs/BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md`：[Brent 公共代理](BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md)；[ODP source-of-record](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)是现行证据边界，不把公共代理包装为官方结算或 Platts。
- [Oil News](OIL_NEWS_EVENT_SOURCE_REVIEW.md)、[GDELT policy](GDELT_SOURCE_POLICY.md)、[publication evidence](OIL_NEWS_PUBLICATION_EVIDENCE_REVIEW.md)、[Oil Thermal](OIL_THERMAL_ANOMALY_SOURCE_REVIEW.md)分别承载新闻/时效/热异常门槛。
- [OPEC](OPEC_SPARE_CAPACITY_SOURCE_REVIEW.md)、[库存](ENERGY_INVENTORY_BALANCE_SOURCE_REVIEW.md)、[PortWatch](ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md)及[条款核对](PORTWATCH_TOS_PIN_REVIEW.md)：来源、代理与再分发边界。
- Transport 已批准 capped free-proxy 入分与未解锁 route/market 确认分开，入口见 [runtime](AGENT_DOMAIN_BOUNDARIES.md#transport-runtime) / [manual helpers](AGENT_DOMAIN_BOUNDARIES.md#transport-manual)。`TRANSPORT_SHOCK_*` 与 `ROUTE_LEVEL_TANKER_FREIGHT_*` 分别只约束其点名工具/源/阶段，不能把整个系列作为每次开发必读。
- [路线 source rights gate](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md) / [production readiness](ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md)继续有效；检查器消费的文档和 [Energy/Transport 原文](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)不做无证据删除。


#### Transport 机器依赖入口

以下路径仍由既有 checker 直接验证，保留为可点击的精简索引；只读本次任务对应条目，不重复展开所有阶段禁令。删除或迁移这些入口需另做断言归属审阅，本轮不改 checker。

| 文档 | 契约定位 |
|---|---|
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md`](ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md`](ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md`](ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md`](ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md`](ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md`](ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL_REVIEW.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md`](ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_DESIGN.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_DESIGN.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_RUNNER_DESIGN.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_RUNNER_DESIGN.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md) | `transport-shock-confirmation-factor-free-proxy-score-design-v1` |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md) | `transport-shock-confirmation-factor-market-confirmation-source-review-v1` |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md) | `transport-shock-confirmation-factor-source-to-score-contract-v1` |
| [`docs/TRANSPORT_SHOCK_FREE_FREIGHT_ALTERNATIVE_SOURCE_REVIEW.md`](TRANSPORT_SHOCK_FREE_FREIGHT_ALTERNATIVE_SOURCE_REVIEW.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |
| [`docs/TRANSPORT_SHOCK_FREE_PROXY_SCORE_BRIDGE_REVIEW.md`](TRANSPORT_SHOCK_FREE_PROXY_SCORE_BRIDGE_REVIEW.md) | `transport-shock-free-proxy-score-bridge-review-v1` |
| [`docs/TRANSPORT_SHOCK_SATELLITE_HANDLING_POLICY.md`](TRANSPORT_SHOCK_SATELLITE_HANDLING_POLICY.md) | 对应文件点名的来源/手工工具；不扩展运行授权 |

### Market Pricing、前端与 Worker

- 现行 [指标计算](MARKET_PRICING_METRICS_CALCULATION.md)、[温度展示](MARKET_PRICING_TEMPERATURE_DISPLAY.md)、[M-91 多资产](MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md)与 OPERATIONS；[weekly fallback](MARKET_PRICING_WEEKLY_REFRESH.md)仍为手工备用操作，不是调度入口。
- 早期 `MARKET_PRICING_*` 阶段设计保留历史；当前字段、60 周不足降级和 display-only 边界见[统一状态](LEGACY_DOCUMENT_STATUS.md#market-pricing)，不由旧 records-empty/仅 scaffold 状态阻断当前功能。
- [M94_V0_DATA_CONTRACT.md](M94_V0_DATA_CONTRACT.md)仍是前端字段消费与 mock 基准；后续明确的 DESIGN/ADR 修订在对应范围优先。[七阶段重建计划](m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md)已完成，非新实施清单。
- [Worker README](../workers/gfrr-realtime-worker/README.md) / [ADR-0018](ADR/0018-m94-path-c-static-frontend-runtime.md)区分 Worker 预览与静态前端；[架构提案](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md)不是现行运行合约。

## Historical Background

以下默认按需查阅，不定义全项目新门槛：

- [MILESTONE_INDEX.md](MILESTONE_INDEX.md)：已完成 M/v 系列；历史 cache 版本和“下一步”不作今日状态。
- [2026-09 至 2026-11 交接](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)、[更早交接](PROJECT_HANDOFF_HISTORY.md)、[完成事项](PROJECT_COMPLETED_HISTORY.md)、[Energy/Transport 历史](ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md)：原批准、失败、预算、验收与限制保留，归档不等于解除。
- [V27_BASELINE.md](V27_BASELINE.md)、[SYSTEM_UPGRADE_PLAN.md](SYSTEM_UPGRADE_PLAN.md)、已完成 milestone scope docs、旧 M-92/M-93 设计/源审计：只说明对应阶段。仍有效的具体来源契约以本页现行入口明确引用为准。
- `docs/evidence/`、`docs/review-evidence/`、`deliverables/engineering-assurance/` 与日期化审计/修复报告：证据、当时结论或限定任务契约，不证明最新线上健康。测试 fixture README / `manual-artifacts/` README 只说明对应样本和工具。
- 未逐个列出的任务文档按文内明确范围与后续修订解释；不能因有“必须”二字升级为全仓规则。无法确定是否已被替代时核对相关 ADR、代码和最新回执，不自动删证据或放宽门禁。

## 指令维护入口

[2026-11-10 全仓 Markdown 核查](MARKDOWN_MAINTENANCE_2026_11_10.md)记录覆盖、精简和限制；[2026-09-06 总回执](REVIEW_2026-09-06_CLOSEOUT.md)保留先前拆分依据。阶段回执不逐篇预读，规则维护按实际影响验证，机器断言迁移另做独立方案与审阅。
