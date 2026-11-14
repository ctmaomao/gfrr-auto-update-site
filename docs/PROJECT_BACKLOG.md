# Project Backlog · GFRR Auto-Update Site

- **Bubble 独立市场观察**：按owner时效升级授权，新增合格来源日期的独立观察快照，复用信用工作流与串行发布，五次固定免费请求，不重复信用取数；周度评分、27卡证据、历史和文章保持原期次。无效/未来/缺失来源不晋升，失败沿用原日期或未知。初始真实采集、完整检查、独立代码/实图审阅、精确CI及双站验收以实际回执区分。[契约与限制](BUBBLE_INDEPENDENT_MARKET_OBSERVATIONS.md)。

本页只保留当前工作、未解依赖与维护入口。已完成任务的过程记录移入[2026-09 至 2026-11 原文快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)；更早记录见[历史目录](MILESTONE_INDEX.md)。旧“待合并/下一步”不覆盖下方已核实的 main 状态，合并也不自动证明生产验收完成。

## Section 1 · 维护状态

核对基线：2026-11-14 main `2bb84648`，含 #568。下表与当前条目区分代码合并、自然产物和线上验收；未列出的账户激活、来源健康及后续运行不作保证。原实施过程与当时的待审状态保留在[收口前固定版本](https://github.com/ctmaomao/gfrr-auto-update-site/blob/2bb84648/docs/PROJECT_BACKLOG.md)，不得把其中旧“待发布”当作当前状态。

| 项 | 当前依据 / 职责 |
|---|---|
| Release/display version | `v28.0.10`；以 package.json / release 定义为准 |
| Data/decision contract version | `data.version` / `decisionModel.contractVersion` 保持 `v27.0`，不可机械同步展示版本 |
| Cache version | `source-disclosure-20261114-r1` |
| 前端输入 | 首页读取静态 JSON；周报为默认入口，另有雷达与 Bubble 标签；`scripts/modules/realtime.js` 冻结、未接入 |
| 雷达主读数 | OFR 已发表 FSI；旧模型保留审计，旧公开仓位/状态/风险预算/动作建议已退役，不把百分位当风险分或概率 |
| Worker / Daily | `/market.worker-preview.json` 是 Worker 主预览，secondary 只作诊断；Daily 仍消费 `realtime-data` |
| 检查组成 | package.json / scripts/check-suite.mjs；不手抄检查数量 |

执行/权限见 [AGENTS](../AGENTS.md)；来源与字段见 [DATA_SOURCES](DATA_SOURCES.md)、[DATA_CONTRACT](DATA_CONTRACT.md)；运行步骤见 [OPERATIONS](OPERATIONS.md)。适用领域规则按 [AGENT_DOMAIN_BOUNDARIES](AGENT_DOMAIN_BOUNDARIES.md) 选择，不全量读取历史。

现有专题入口：**Market Pricing freshness/alignment review**（display-only）、**FOMC Minutes tone/topic quality review**（display-only）、**World Order source-health consistency review**（overlay-only）。这些检查不是取数、付费或发布授权。

## Section 2 · Open Backlog Items

### 当前实施与真实等待

- **本次文档状态收口**：2026-11-14 owner 要求继续完善项目，协调任务指定核对 backlog 与 Bubble 来源审计。基于 `2bb84648`，仅整理已有 PR、自然运行与产物证据，保留仍未解决的模型、来源及费用边界；不改代码、数据、频率或权限。独立文件审阅、完整检查和精确 CI 后串行集成。
- **Brent 观察审计元数据**：[#568](https://github.com/ctmaomao/gfrr-auto-update-site/pull/568) 已合并 `498f83f5`。白名单来源/品种/合约/观察时钟/获取时钟/hold 原因与输入身份、可比性及 null 拒绝已实现；未改选源、阈值或评分。下一次使用该版本的自然 Daily 日志仍待验收；此前 [Daily 43547163286](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43547163286) 早于合并，不能代替验收，历史缺失元数据不能回填。
- **已合并来源修复的自然采用**：#553/#555 的 Bubble 日期和缺失值修复已入 main，但本基线全量快照仍为 `2026-11-10T06:14:30.988Z`；信用独立更新不证明全量采用。#561 黄金获取时钟/null 日变动修复已合并，真实生产采用仍单列待核验，不把 provider 获取时间称作交易所报价时点。
- **World Order V2 来源与不确定性迁移**：#559/#560 的纯区间、历史/展示适配器、来源元数据与预备 checker 已合并但未启用。缺失值不能归零制造低风险；真实观察语义、来源更新日历、美元口径校准、全部消费者/历史接线及桌面手机验收仍未完成。设计及阶段边界见 [迁移设计](WORLD_ORDER_UNCERTAINTY_MIGRATION.md)。 本轮 [PR #570](https://github.com/ctmaomao/gfrr-auto-update-site/pull/570) 按 owner 最新继续迁移授权增加未接生产的原始记录/选中值、系列身份、日历时钟和 fallback/held 离线预检；所有来源仍未获资格，六判据保持 unknown，不使用美元 105 阈值、不缩小条件界限、不改生产评分。31 项相关回归、完整本地检查和独审通过；已按 #569 收口后的文档基线合流，更新 head 的精确 CI 尚待核验。
- **来源覆盖缺口**：Bubble ARR 加速、VC/Neocloud 当期覆盖和 AI 专项 ABS 等仍需合格证据；新获取时间不使旧里程碑变新。热观察历史基线截至 9 月 5 日，成熟窗口不证明近期适用；0 条观测不能证明设施安全。已完成的是缺口/旧基线披露，不是恢复全部来源或确认风险消失。

- **Bubble 候选发布准备**：[#548](https://github.com/ctmaomao/gfrr-auto-update-site/pull/548) 已合并 `95a5681c`；纯离线准备器仅重放精确已审候选。新候选仍需认证原 run/artifact/ledger、独立事实复核与原 writer 时效及 CAS 门槛；不代表已生成或上线。见[发布准备契约](BUBBLE_REVIEWED_PUBLICATION.md)。

- **DeepSeek key 私密核验与 Bubble 单次准备**：#546/#547/#550 已合并，涵盖不访问 provider 的私密身份诊断、单次候选准备和私密 claim。代码可用不代表预算已激活或新稿已调用/发布。网站用途需与账户其它 key 区分，旧名额消耗和永久预留保持；实际私密配置、证据时效和新稿事实复核仍待完成，不在公开文档披露账户材料。

- **Brave 免费额度记录**：[#544](https://github.com/ctmaomao/gfrr-auto-update-site/pull/544) 已合并 `df5e8dcc`，v2 共享免费硬限与核验入口已实现；历史不重置。生产激活必须由真实证据和 create-only 流程确认，不能以代码合并宣称恢复调用。见 [ADR-0111](ADR/0111-brave-shared-free-only.md)。

- **两篇编辑月预算 CNY10 / 余额识别**：[#543](https://github.com/ctmaomao/gfrr-auto-update-site/pull/543) 已合并 `dc444239`，仅新 monthly v2 genesis 为 10 元；旧 monthly v1 hold、旧 grant/price digest、已耗四次永久预留与事实门槛保持。代码上线与账户激活分开，尚不能宣称自动编辑已恢复。见 [ADR-0110](ADR/0110-monthly-cny-ten-and-balance.md)。

- **Macro 预算暂停重复告警**：[#542](https://github.com/ctmaomao/gfrr-auto-update-site/pull/542) 已合并 `a9f6cab6`。monthly 双空配置在网络前分类为 expected skip，不作无意义发布；真实 API、账本、配置、价格或生成失败仍保留。此项不恢复预算或文章，见 [ADR-0109](ADR/0109-macro-budget-pause-notifications.md)。

- **Bubble 来源语义与日期绑定修复**：#538 已合并 `2591d3b4`，落地 [ADR-0106](ADR/0106-bubble-evidence-semantics.md) 与有界当前文案迁移，并保留 #537 新稿隔离及随后自然数据更新。验收基线是 RPO/百分点/发行待发管线/HY 广义代理语义纠错、新时间线报道日绑定；数值、评分、所有原期时钟、provenance 和历史 AI 正文不变，当前 AI 层保持缺席。双站验收仍由协调任务按实际回执核实；不调用 provider、不恢复已耗授权。

- **Bubble 新稿事实隔离**：run `42935389410` 一次生成成功，commit `423c9dc7` 自动质量门槛通过，但独立事实复核确认 RPO/backlog 被误称递延收入，以及 SPY/RSP 百分收益率差被误写为百分比而非百分点。#537 已合并 `1a3a04eb`，撤下本次 `summary.weekly_editorial` 并精确恢复生成前已验证的 Bubble 文件；该隔离提交的其余结构化数据和分数不变。双站部署验收由协调任务核实。原稿保留在原 commit `423c9dc7` 与受控快照，安全回执仅保留诊断摘要/哈希，不再调用、不手改稿件、不改变预算。之后分别修正源标签、单位和新闻报道日/事件日语义；自动通过不等于事实验收完成。

- **Macro OFR 语义修复**：#540 已合并 `80ebf718`，按 [ADR-0107](ADR/0107-ofr-editorial-semantic-boundaries.md) 区分原值相对 OFR 校准均值、严格过去十年样本排序及本站贡献缺项。验收基线为用户要求继续修复 AI 生成：只增强 compact input、prompt、新稿 validator/review/final writer 的有界关系与来源归属检查，保留原数值/日期/币种/引用/安全断言及旧稿读取兼容；不改模型、生产 JSON、历史正文、预算或调用次数。代码已合并不等于新稿事实审核通过；语义检查不是全文事实核查，当前不据此生成或恢复新稿。

- **Macro 新稿事实隔离**：run `42950570179` 生成并写入 `d2905d32`，但独立事实复核确认两项 P2：把 OFR 负原值误写成历史相对低位（绑定严格过去十年百分位实际为 74.18850215095816）；把站内未发布贡献分解误写成 OFR 官方不公布分解。原稿保留在 `d2905d32`；安全回执仅含诊断摘要/哈希。本次应急修复只撤下当期 `macroRiskEditorialLayer`：先验证去除此字段后与实际父提交 `895aa309` 的 radar 对象完全相等，再恢复该文件精确原字节；其它源数据、确定性输出、分数、时钟、provenance、历史证据与 Bubble 修复均不变。#539 已完成独立实际树审查及精确 head CI，并合并为 `90cd0d1e`（tree `3f43f514`）；双站生效仍由协调任务按实际回执核实。隔离补丁没有手改 AI 正文或修改 prompt/validator/来源，也没有重置费用或重试；后续语义修复 #540 已合并，未据此恢复被隔离的稿件。

- **编辑提示恢复 / 新授权真实验证**：#535 提示修复与 #536 独立新 grant 已合入；owner 批准两页各一次、合计 CNY4.33。Bubble run `42935389410`、Macro run `42950570179` 均已完成单次 API 调用并生成输出，两个名额均已消耗，各永久预留 CNY2.161152、合计 CNY4.322304；token 回执不是实际货币费用结算。两稿自动质量门槛通过，但均未通过独立事实复核，不能宣称编辑恢复完成。此前 Macro 自动 run `42946982770` 使用 monthly，因 `deepseek_budget_uninitialized` 在调用和账本写入前停止，只是历史预检失败，不表示新 verification 名额仍可用。保持旧消耗、monthly、全部账本/标签及事实门槛，不再调用 provider。[前轮证据和继承解析局限](EDITORIAL_PROMPT_RECOVERY_2026_11_10.md)。
- **文档维护**：#534 已合并 `e1939f86`；当时核查 338 个受控 Markdown，归档旧交接、消除导航矛盾与重复状态。本文本轮另按 11 月 14 日证据收口，不把当时文件数量称作现在总数。验收基线是用户要求跟上开发进度、避免过严文档妨碍开发；不修改运行代码、checker、费用或来源规则。范围和检查记录见[本轮说明](MARKDOWN_MAINTENANCE_2026_11_10.md)。
- **Macro / Bubble 编辑恢复**：#532/#533 已合入 main，两次新授权真实 API 调用已成功，但两稿事实复核失败，当前仍处于隔离和修复阶段，非恢复成功。Bubble 与 Macro 隔离均已合并；两站最新状态由协调任务按部署回执核实。已消耗调用不恢复，原稿证据、单次调用/no retry、预算、来源资格与最终 writer/review 保护继续有效；不从旧文字推算可用次数。
- **ACLED 候选比较修复**：[#541](https://github.com/ctmaomao/gfrr-auto-update-site/pull/541) 已合并 `f4da1dd8`；随后 `18fa663b` 已提交 reviewed weekly/monthly pair，不再把旧 `42975462379` 的阻塞写作现状。当前源仍按周/月频与自己的观察日解释，非实时事件确认；后续健康按实际运行核验。[运行说明](ACLED_AUTOMATIC_UPDATE.md)与 [ADR-0108](ADR/0108-acled-common-window-comparison.md)保留规则和原失败脉络。
- **压力研究**：冻结 cohort `pressure-shadow-29d69c0ecb7b98a0` 继续现有采集；84 日/40 输入/12 周及[最终评审标准](PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md)不变，最早时间门槛 2026-12-10 UTC。旧 2 条样本的快照不是当前计数，未重新核对实际 ledger，不声明达标或晋升。OFR 生产主读数迁移不代表七候选研究通过。
- **CSP**：采集线冻结，生产 C 不启用；原生投递、alarm/清理、隐私、共享额度和真实平台验收缺口保留。原回执、预算、一次性 marker 与锁见[归档](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)，不把归档当重启或重复试验许可。
- **其它观察与源权利**：Oil News 同口径窗口、FIRMS 后续质量与独立晋升、ARR 跨周期证据、路线级运费权利和 HAPI 候选条件保留；没有新证据不制造待办或宣称恢复。旧失败次数、账户额度和样本计数按原日期保留，不冒充最新状态。

### P0 / P1 / P2

本次文档核查不重新评定运行事故优先级。历史 P0/P1/P2 完成项已归档；当前编辑恢复、来源待验与其它进行中事项以上方清单和实际最新回执为准，不再笼统声明“无 active P2”。

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

### 2026-11-14 收口：合并与运行证据分列

| 事项 | 已核实代码 / 运行证据 | 验收边界 |
|---|---|---|
| ICE Brent 候选 / 隔夜 OMO / CARTS 独立观察日 | #551 `54c3ec91`、#552 `dde79b43`、#554 `9f214f28`；后续 Daily 产物 `338083e5`、`376312e7` | 修复已入 main；保留现货/期货、获取/观察日期和天然发布滞后，不宣称全部实时 |
| Bubble SPY/RSP 对齐、CAPE/持仓/PE/FRED 日期与空值 | #553 `95aa69e3`、#555 `0dd3c8ff` | 代码已合并；全量新快照采用仍待验证，不能用信用更新替代 |
| 独立信用历史刷新 | #556 `d78ef3c3`；[自然运行 43444779335](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43444779335) 成功、产物 `3713fb90` | 周二至周六 06:20 UTC 计划；实际首次 11 月 13 日 14:39 UTC 执行，计划非准时承诺；仅信用展示、不重算周分数 |
| ACLED 测试隔离 / World Order 无效时钟 | #557 `d009e4cc`、#558 `1fbfe682` | 已合并，不再待实现；不证明全部来源新鲜或 V2 可启用 |
| 黄金真实获取时间 | #561 `7a2aaddc` | 已合并；生产采用另待核验，单报价日变动为 null |
| 热观察基线披露 / 完成后直接发布 | #562 `abded283`、#563 `e1798ac3`；[thermal 43540690722](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43540690722) → `765ea955` → [EdgeOne 43541207646](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43541207646) 成功 | 已有自然端到端验收回执：两站与本轮文件 SHA256 `8769b21ac6cf497b6d68cf732558d7aec9c923bb60938173d13566a429534bc5` 一致；该轮无卫星观测，旧基线仍受限 |
| 前后台 null/日期/覆盖/图表表达 | #564 `abe9107d`、#565 `555316a4`、#566 `bae3b06d`、#567 `2a032d70` | 已合并且协调任务记录桌面手机实图及双站验收；不是本次重新验图，也不代表来源缺口已修复 |
| FRED 等价解析 / 语法有界并行 | #545 `9b29bc6c`、#520 `dfbdd250` | 已合并；不改来源资格、评分、预算或发布保护 |

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

- **最后基线 / 改动**：2026-11-14 main `a4e91eb7`（#569 文档收口）；#570 增加默认未激活的 World Order 来源资格纯函数预检，保留收口后的当前事项和历史链接。
- **当前任务**：原始记录绑定、系列身份、真实日历时钟及 fallback/held 缺失标记离线预检；点分与合格观察日均为 null，六判据仍 unknown，不接生产或前端。
- **下一步**：核验合流后实际 diff、精确 head CI 再串行合并；之后仍需来源日历/美元口径校准与全消费者、历史和视觉迁移。自然 Daily 对 #568 元数据的采用、全量 Bubble 与黄金采用继续各自核验。
- **阻塞 / 运行边界**：本次无取数、付费调用、账本或生产生成；World Order V2、编辑预算激活、缺证据指标与研究晋升均未解锁。
