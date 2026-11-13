# Project Backlog · GFRR Auto-Update Site

- **Bubble 独立信用历史日更**：新增受控免费采集计划，周二至周六 06:20 UTC 只刷新既有 HY/CCC/IG 展示字段，每轮三次公开 FRED 请求；不改周度评分、证据日期或 AI 正文。源失败沿用带原日期历史，保护网和串行发布不变。合并/首次自然运行/双站更新须按实际回执区分，不宣称整体市场实时。[范围与后续设计](BUBBLE_CREDIT_DAILY_REFRESH_2026_11_12.md)。

本页只保留当前工作、未解依赖与维护入口。已完成任务的过程记录移入[2026-09 至 2026-11 原文快照](PROJECT_HANDOFF_HISTORY_2026_09_TO_11.md)；更早记录见[历史目录](MILESTONE_INDEX.md)。旧“待合并/下一步”不覆盖下方已核实的 main 状态，合并也不自动证明生产验收完成。

## Section 1 · 维护状态

核对基线：2026-11-11 main `90cd0d1e`（含 #535–#539、自然 Daily/World Order/ODP 更新；本次 Macro 不合格稿已隔离）。本表描述已合入代码，不声明当前远端工作流、账户余额或各来源健康。

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

- **ACLED 清理测试隔离**：2026-11-13 全面审核发现测试直接比较全局临时目录，可能把其它并行校验创建的目录误判为泄漏。仅为测试分配各自临时根，保留全部原清理断言并新增本测试遗留检测及外部目录隔离回归；生产清理、来源、预算和工作流不变。干扰复现旧测试失败、新测试通过；合并前仍需完整检查及独立审阅。

- **CARTS 各源观察日修复**：全源审计发现 producer 丢弃名义/实际 CARTS 日期，fallback 又借用包含 Redbook 的组合日期。新增向后兼容的两个 nullable 观察日，旧快照不推断日期，fallback 只保留各自合法日期；显示层改动另待可用浏览器验证，当前仍明确未提供各自日期，不以日期存在宣称实时。验证包括混合日期、旧快照、未知/未来日期、失败回退、真实零值、完整套件与独立审阅。无评分/取数频率/生产 JSON 改动。

- **Bubble 来源日期与缺失值修复**：2026-11-12 全源审计续项，CAPE 改用同站页面提供的 Atom 日期绑定条目，SPY 持仓/NVDA PE 绑定指标更新日，HY OAS 绑定实际 FRED 日；均保留原公式及日期明确的失败快照。FRED 空值不再强转零，真实零保留。无新增收费源或刷新频率；待实际补丁独审、完整检查和串行发布，详见 [审计说明](BUBBLE_SOURCE_FRESHNESS_AUDIT_2026_11_12.md)。

- **全源及时性梳理 / OMO 修复**：2026-11-12 owner 要求检查所有数据源的及时性和准确性。首个窄范围修复基于 `ad516204`：现有 EastMoney 搜索已返回当日隔夜逆回购，但旧解析器仅接受数字天数；显式支持隔夜为一天，保留毛额、利率、七天时效及 display-only 边界。验收为新旧期限及拒绝场景回归、完整检查、独立实际 diff 审阅与串行集成。其余源需按真实观察日和发布频率区分获取失败与天然滞后，不把获取成功称为实时；不更改冻结研究、评分或付费来源。

- **Brent 时效修复**：2026-11-12 owner 要求检查并升级免费 Brent 获取方式。基于 `ad516204` 修复 realtime ICE 候选的旧 HTML 抓取，复用 Daily 已有 structured contract-data；严格近月身份、报价日期与失败隔离，保留全部晋升条件及冻结研究现货协议。不将期货称为实时现货、不新增收费源或绕过访问限制。验收要求离线边界测试、完整检查、独立实际 diff 审阅及后续真实运行核验；当前实施中，未声明上线。

- **Bubble 数据时效审计**：2026-11-12 owner 要求梳理全部来源并升级实时性/准确性。首个修复将 SPY/RSP 六个月价差绑定共同交易日和真实观测日期，保留价格收益率公式、阈值和原失败回退；100 个共同交易日、150–200 天窗口及 7 天时效门槛防止截短/错期输入。来源审计及待办见 [审计说明](BUBBLE_SOURCE_FRESHNESS_AUDIT_2026_11_12.md)。待独立实际 diff 审阅、完整检查与串行发布，不声称周频全量数据已变实时。

- **Bubble 候选发布准备**：固定 receipt grant 的纯离线准备器仅重放精确已审候选，不调用 provider、不写生产或远端。协调者负责认证原 run/artifact/ledger 与独立事实批准，按当前 main/源证据及原 writer 时效检查生成单文件 CAS 提案；冲突 HOLD。验收与信任边界见 [发布准备契约](BUBBLE_REVIEWED_PUBLICATION.md)，待独立实际补丁审阅与完整验证；不能据候选成功声称已上线。

- **DeepSeek key 私密核验与 Bubble 单次准备**：2026-11-12 owner 要求确认网站实际使用的 key，并仅调用一次 Bubble、事实复核后上线，月上限10元且搜索只用免费额度。基于 `dfbdd250` 新增离线 key SHA-256 与导出遮罩投影 SHA-256 诊断，独立 main-only 手动入口不访问 provider、不读写账本、不输出密钥片段。新单次预算准备与诊断分开，旧四个名额和预留不变；新 grant 仅保留通过验证的短期来源证据候选，跳过 writer/commit，待独立事实复核和原最终 writer 门槛后才能发布；长期预算应归属网站 key，账户合计只能作为本次临时历史上界。当前仍待独立实际 diff 审阅、远端诊断和运行证据，不宣称 key 已匹配或已生成文章。

- **语法检查有界并行（PR #520）**：继续 owner 持续精简目标，2026-11-12 串行整合 main `70cac20c`，保留 #534 文档清理、Brave #544、FRED #545 及全部自然数据。仅把 `check-syntax.mjs` 的逐文件 Node 解析改为最多 4 个并发，扫描范围、排序、1 MiB 输出上限、全文件检查和失败退出不变；11 项回归与[性能证据](SYNTAX_CHECK_PERFORMANCE_2026_11_09.md)同步复验。当前基线完整检查、单元 coverage 与独立实际文件审阅已通过，下一步是精确 head CI 与串行发布；不修改工作流、预算、数据、checker assertion 或发布门槛，不把本地加速写成账单节省。

- **运行代码等价精简**：owner 要求持续精简代码、Markdown 与 Actions，优先降低维护复杂度而非减少文件数。2026-11-12 基于已合入 Brave #544 的 main `df5e8dcc`，先把 Daily/realtime 完全相同的 FRED CSV/API 解析收口至 `scripts/lib/fred-observations.mjs`，原调用点、异常、行序及数值行为不变；697 组原实现差分一致，评分实现指纹未变。验收要求既有纯函数套件新增回归、完整检查、独立实际 diff 审阅与最新 main 串行集成。未运行取数或生成命令，不改预算、来源资格、评分、生产数据或工作流；其它重复片段须分别证明语义等价，不能据文件名删除历史保护工具。

- **Brave免费额度记录修复**：2026-11-12 owner要求修复记录且Brave/Tavily只用免费额度。基于main `a3feda3f` 实施 [ADR-0111](ADR/0111-brave-shared-free-only.md) 的独立v2共享免费硬限类型、诚实的账户观察/项目计数与原status workflow隔离指纹核验入口。验收边界：v1、付费预算、生产数据、四consumer、CAS/时钟/未知结果hold均不变，历史不重置；真实证据与指纹私密核验、独立实际树审阅、串行发布和create-only激活仍由协调任务执行，代码完成不代表已恢复调用。

- **两篇编辑月预算 CNY10 / 余额识别**：2026-11-12 owner 要求上限设为10元且 Tavily/Brave 只用免费额度。本地基于 `a9f6cab6` 实施 [ADR-0110](ADR/0110-monthly-cny-ten-and-balance.md)：仅新 monthly v2 genesis 使用10元，共用严格 CNY＋可选全零 USD 校验；旧 monthly v1 hold，两个 one-shot grant/price digest 与已耗四次永久预留不变。验收基线包括最多四次全上下文预留、第五次拒绝、全部历史/价格/时钟/事实门槛。代码上线与账户激活分开；历史证据不足不初始化，无真实余额/搜索/provider请求、远端账本或生产数据写入。Brave免费记录修复由独立协调步骤处理，不把本补丁当成完成证明。最终完整检查、独立实际树审阅与串行发布以交付回执为准。

- **Macro 预算暂停重复告警**：2026-11-12 基于 `cbce451b6b15e1ad7bfac433e33ee3137af27a31` 隔离实现 [ADR-0109](ADR/0109-macro-budget-pause-notifications.md)。验收基线为 owner 要求排查每日多次 GitHub Actions 报错：仅将自动 Macro、monthly 双空配置的预网络暂停分类为可审计 expected skip，显式跳过全部费用/数据副作用，并以认证上游执行证据阻止 Pages/EdgeOne 无意义发布。真实 API、账本、配置、价格和生成失败仍红，全部预算/旧消耗/事实门槛不变。完整离线检查、实际 diff 独立审阅、精确 head CI 和后续自然运行验收按交付回执核实；本轮不重跑工作流、不请求 source/provider/余额、不写生产数据。

- **Bubble 来源语义与日期绑定修复**：#538 已合并 `2591d3b4`，落地 [ADR-0106](ADR/0106-bubble-evidence-semantics.md) 与有界当前文案迁移，并保留 #537 新稿隔离及随后自然数据更新。验收基线是 RPO/百分点/发行待发管线/HY 广义代理语义纠错、新时间线报道日绑定；数值、评分、所有原期时钟、provenance 和历史 AI 正文不变，当前 AI 层保持缺席。双站验收仍由协调任务按实际回执核实；不调用 provider、不恢复已耗授权。

- **Bubble 新稿事实隔离**：run `42935389410` 一次生成成功，commit `423c9dc7` 自动质量门槛通过，但独立事实复核确认 RPO/backlog 被误称递延收入，以及 SPY/RSP 百分收益率差被误写为百分比而非百分点。#537 已合并 `1a3a04eb`，撤下本次 `summary.weekly_editorial` 并精确恢复生成前已验证的 Bubble 文件；该隔离提交的其余结构化数据和分数不变。双站部署验收由协调任务核实。原稿保留在原 commit `423c9dc7` 与受控快照，安全回执仅保留诊断摘要/哈希，不再调用、不手改稿件、不改变预算。之后分别修正源标签、单位和新闻报道日/事件日语义；自动通过不等于事实验收完成。

- **Macro OFR 语义修复**：本地实现按 [ADR-0107](ADR/0107-ofr-editorial-semantic-boundaries.md) 区分原值相对 OFR 校准均值、严格过去十年样本排序及本站贡献缺项。验收基线为用户要求继续修复 AI 生成：只增强 compact input、prompt、新稿 validator/review/final writer 的有界关系与来源归属检查，保留原数值/日期/币种/引用/安全断言及旧稿读取兼容；不改模型、生产 JSON、历史正文、预算或调用次数。原候选已通过独立实际文件审阅，本次在 #539 合并后的 `90cd0d1e` 新工作树串行集成，13 文件含本条状态同步；最终完整检查、coverage、实际树独审和逐文件 blob 以交付回执为准，不复用中间树绿灯。新语义检查不是全文事实核查，当前不生成新稿，远端发布与两站验收仍由协调任务处理。

- **Macro 新稿事实隔离**：run `42950570179` 生成并写入 `d2905d32`，但独立事实复核确认两项 P2：把 OFR 负原值误写成历史相对低位（绑定严格过去十年百分位实际为 74.18850215095816）；把站内未发布贡献分解误写成 OFR 官方不公布分解。原稿保留在 `d2905d32`；安全回执仅含诊断摘要/哈希。本次应急修复只撤下当期 `macroRiskEditorialLayer`：先验证去除此字段后与实际父提交 `895aa309` 的 radar 对象完全相等，再恢复该文件精确原字节；其它源数据、确定性输出、分数、时钟、provenance、历史证据与 Bubble 修复均不变。#539 已完成独立实际树审查及精确 head CI，并合并为 `90cd0d1e`（tree `3f43f514`）；双站生效仍由协调任务按实际回执核实。隔离补丁没有手改 AI 正文或修改 prompt/validator/来源，也没有重置费用或重试；后续语义修复是上方独立候选。

- **编辑提示恢复 / 新授权真实验证**：#535 提示修复与 #536 独立新 grant 已合入；owner 批准两页各一次、合计 CNY4.33。Bubble run `42935389410`、Macro run `42950570179` 均已完成单次 API 调用并生成输出，两个名额均已消耗，各永久预留 CNY2.161152、合计 CNY4.322304；token 回执不是实际货币费用结算。两稿自动质量门槛通过，但均未通过独立事实复核，不能宣称编辑恢复完成。此前 Macro 自动 run `42946982770` 使用 monthly，因 `deepseek_budget_uninitialized` 在调用和账本写入前停止，只是历史预检失败，不表示新 verification 名额仍可用。保持旧消耗、monthly、全部账本/标签及事实门槛，不再调用 provider。[前轮证据和继承解析局限](EDITORIAL_PROMPT_RECOVERY_2026_11_10.md)。
- **文档维护**：核查 338 个受控 Markdown，归档旧交接、消除现行导航矛盾与重复状态；完整检查和独立审阅后串行集成。验收基线是用户要求跟上开发进度、避免过严文档妨碍开发；不修改运行代码、checker、费用或来源规则。范围和检查记录见[本轮说明](MARKDOWN_MAINTENANCE_2026_11_10.md)。
- **Macro / Bubble 编辑恢复**：#532/#533 已合入 main，两次新授权真实 API 调用已成功，但两稿事实复核失败，当前仍处于隔离和修复阶段，非恢复成功。Bubble 与 Macro 隔离均已合并；两站最新状态由协调任务按部署回执核实。已消耗调用不恢复，原稿证据、单次调用/no retry、预算、来源资格与最终 writer/review 保护继续有效；不从旧文字推算可用次数。
- **ACLED 候选比较修复**：自然 run `42975462379` 已确认登录、六地区下载、退出和私有校验/清理成功，但 `invalid_config_review_input` 阻止生产，不能称全链恢复。[ADR-0108](ADR/0108-acled-common-window-comparison.md) 的验收基线是持续审核/及时修订授权内，仅让比较器按既有共同连续周窗契约解释 `latestWeek`，保留更晚原文件覆盖日期；旧格式、hash pin、严格发布和所有来源/预算门槛不变。基于 `51bebb2d` 隔离修复，真实合成 XLSX 已复现原错误并验证修复；原真实候选已清理，不能逐字节回放。本轮不登录、采集、重跑或重置 claim；完整检查、独立审阅、精确 head CI 和部署按交付回执核实，真实更新仍待后续自然槽。[运行说明](ACLED_AUTOMATIC_UPDATE.md)保留证据与限制。
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

- **最后基线 / 改动**：2026-11-13 main `328d5967`；仅隔离 ACLED 清理测试的临时根并增加并发干扰回归，生产代码及数据未变。
- **当前任务**：修复全面审核发现的测试假失败；每个测试只检查自己拥有的临时文件，仍检测真正遗留并保留原全部清理断言。
- **下一步**：独立实际 diff 审阅、完整检查及精确 head CI 通过后串行合并；干扰复现已确认原测试失败、修复后通过。
- **阻塞 / 运行边界**：不触发取数、付费调用、账本或生产生成；不修改运行时清理策略、checker assertion、来源或评分门槛。
