# ACLED / HDX 月度自动接入来源评审

## 状态与批准范围

2026-09-08，owner 在来源调查后要求“请做下一刀”，对应本次**来源评审与隔离验证设计**，沿用逐项 commit + push。本文是可评审交付物，不是数据下载器、接入许可或生产切换决定。

- 结论：HDX/HAPI 是值得继续验证的官方分发渠道；**六项月度指标尚未证明等价，完整自动替代暂不批准**。
- 本轮只读取公开文档、HDX 目录元数据和现有源码/已提交 JSON；没有读取远端数据正文、运行 sanitizer、注册应用标识、发送邮件或触发刷新。
- `sourceComplianceStatus=unresolved`、`liveDataFetchApproved=false`、`productionDataWriteApproved=false`、`sourceCutoverApproved=false`。这些是评审状态，不新增 runtime 配置。
- [AGENTS](../AGENTS.md)、[来源规则](AGENT_DOMAIN_BOUNDARIES.md#sources)、[M-63 操作契约](M-63_ACLED_INTEGRATION.md) 和现有 HDX metadata-only reminder 边界全部保留。PR #309 的单次 AI 代人工审阅例外不沿用。

## 已核对的现状

基线为 main `235653a6c505d6ab4a7e5401d0ec15bb5b806cad`。现有 [monthly sanitizer](../scripts/world-order/sanitize-acled-monthly.mjs) 要求六个文件、共同 as-of 日期、严格表头及单一 `Sheet1`；只允许本地 XLSX 输入。单文件上限 1 MiB、批次 2 MiB、50,000 行、8 列；本次不修改这些保护。

[现有月度 JSON](../config/world-order-acled-global-monthly.json) 的 `asOfDate=2026-07-31`、`latestFullYear=2025`；六项输入覆盖年份均为 1997–2026。已生成的两个趋势窗口为 2025-08 至 2026-07、2024-08 至 2025-07。以上是现有产物元数据，不证明每个国家每个月都有记录或完整覆盖。

来源分工：weekly 的 4/12 周统计和 hot zones 继续使用六地区周表；monthly 只提供 World Order evidence/summary。不能用月度值反推周值、填充周表 freshness、改变 `peaceDividendRetreat` 权重或影响主评分/决策。

### 2026-09-08 元数据复查

下表来自对应 `package_show` 的只读响应，均为目录声明，**不是实际数据内容验收**。三组 ACLED 数据发布者为 ACLED；HAPI CSV 发布者为 HDX Humanitarian API Data。四者 `license_id=hdx-other`，`license_other` 均指向 ACLED Terms of Use and Attribution Policy。

| 目录 | 资源标识 | 声明覆盖截止 | 资源 last_modified（UTC） | 声明字节数 |
|---|---|---|---|---:|
| [Political violence](https://data.humdata.org/api/3/action/package_show?id=political-violence-events-and-fatalities) | `99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f`，XLSX | 2026-08-28 | 2026-09-03 10:29:54 | 44,096,516 |
| [Civilian targeting](https://data.humdata.org/api/3/action/package_show?id=civilian-targeting-events-and-fatalities) | `fb139931-641f-4428-be77-429972878e19`，XLSX | 2026-08-28 | 2026-09-03 10:42:15 | 43,867,834 |
| [Demonstrations](https://data.humdata.org/api/3/action/package_show?id=demonstration-events) | `4f98e767-d28d-4711-b575-ded17a0421ce`，XLSX | 2026-08-28 | 2026-09-03 10:13:01 | 40,270,649 |
| [HAPI global conflict event](https://data.humdata.org/api/3/action/package_show?id=hdx-hapi-conflict-event) | `f9fcac67-6bc3-4256-b7fe-e2d18ca29580`，2026 CSV | 2026-08-28 | 2026-09-04 09:53:50 | 21,444,980 |

三个 XLSX 明显超出现行 monthly 输入容量，也不是现有六文件契约；不能改名后直接导入，更不能放宽现有 sanitizer 来接纳它们。API/CSV 可减少 XLSX 依赖，但在读取实际字段、确认覆盖与许可前只是候选。

## 六项指标对照：候选映射，不是批准映射

现有六个文件名均以 `number_of_` 开头、附共同 `as-of` 日期；下表使用 sanitizer 的真实 metric ID。HAPI 的 `event_type` 是聚合类别，不等同于原始六类 ACLED event type。[HAPI 分类说明](https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/enums/#event-type)

| 现有 metric / 输入列 | 候选来源及处理 | 必须解决的差异 |
|---|---|---|
| `demonstrations` / COUNTRY, YEAR, EVENTS | `demonstration.events` 按国家及完整年汇总 | 暴民暴力的排除规则、国家覆盖、零行/缺失行及 12 月完整性 |
| `civilianTargeting` / COUNTRY, YEAR, EVENTS | `civilian_targeting.events` 按国家及完整年汇总 | 直接针对平民的定义、涉及 riots/protests 的类别归属，不能仅按显示标签对应 |
| `politicalViolenceMonthly` / COUNTRY, MONTH, YEAR, EVENTS | `political_violence.events` 按国家/月对应 | mob violence 归属、地理层级去重、未完成月份、版本修订 |
| `politicalViolence` / COUNTRY, YEAR, EVENTS | 对已确认等价的 PV 月度行逐国家汇总 12 月 | 不把缺月当零；必须与同版本年度表复核，不能仅验证全球和相同 |
| `civilianFatalities` / COUNTRY, YEAR, FATALITIES | `civilian_targeting.fatalities` 仅是待核实候选 | 类别事件中的死亡数不自动证明等于“平民死亡数”；需要资源级定义及逐国家对照 |
| `fatalities` / COUNTRY, YEAR, FATALITIES | 当前没有已证明等价的映射 | 总报告死亡数与 PV 死亡数范围不能混淆；不能把三个非互斥类别相加，也不能凭假定补成总数 |

文档已显示口径风险：HAPI 的 PV 描述明确包含 mob violence，而 [ACLED 月表页面](https://acleddata.com/conflict-data/download-data-files/aggregated-data) 的 PV 简述只列 battles、explosions/remote violence、violence against civilians。该差异**不证明哪份实际文件漏算**；须由资源版本定义及对照确认，不能自行选择较方便的描述。六项目前均未通过数值等价验收。

HAPI 与 ACLED/HDX 同源；双路径数值一致是分发/变换验证，不是独立事实印证。年度 CSV 是文件分区，不代表其行粒度从月度变成年度。[HAPI 数据说明](https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/coordination_and_context/#conflict-events)

## 来源权利评审

这不是法律意见。区分平台允许机器访问、数据许可、owner 批准和公开发布权利，不能用其中一个替代其它项。

1. **渠道依据已找到**：ACLED [FAQ](https://acleddata.com/faq-codebook-tools) 指向 HDX 的国家—月/年聚合数据；OCHA [HAPI 说明](https://centre.humdata.org/announcing-the-hdx-humanitarian-api/) 面向自动化访问。因此不将 HAPI 与浏览器抓取 ACLED 网站混为一谈。
2. **用途待核实**：owner 尚未确认 GFRR 是否完全非商业、是否有客户服务/商业主体。不能仅由现有 `licenseLevel=open` 推断适用许可。已提出用途问题，未替 owner 填写身份或机构。
3. **数据条款仍适用**：[ACLED EULA](https://acleddata.com/eula) §1.2、§3.1–3.3 涉及商业许可、可发布的转换成果、原始内容再分发及网站抓取限制；§7 涉及 AI 使用及防提取要求。[Content Usage Terms](https://acleddata.com/contentusage) 同样需要纳入公开仪表盘用途评估。非商业和署名不是自动满足全部条件。
4. **HAPI 条款仍缺证据**：2026-09-08 访问 [HAPI Terms](https://data.humdata.org/hapi/terms) 得到 403。没有换代理、伪造身份或绕过限制；需取得可读取的现行条款或官方答复，不能按“未读到禁止条款”批准。
5. **公开 Git/JSON 也属于发布面**：未来不能只检查 UI 是否展示原表，还须检查 public repository、静态 JSON、Actions artifact 可见性及是否可还原数据。原始文件、国家级对照行与含邮箱的应用标识不得进入公开提交；现有发布范围本刀不扩展。
6. **权限不迁移**：镜像不洗掉 ACLED 权利；Open 档不自动赋予原始事件 API。HAPI [应用标识要求](https://hdx-hapi.readthedocs.io/en/latest/getting-started/#generating-a-key) 需真实应用信息与 owner 批准的联系邮箱，本刀不生成，不使用示例/第三方标识。

下一次来源评审应记录：适用条款 URL/版本日期、用途确认、允许的渠道/频率/存储期限/发布形式、剩余歧义及答复依据。只有有权方才能授予来源许可；owner 可以批准项目操作，不能代第三方授予数据权利。

## 隔离验证设计（未执行真实数据验证）

### 层归属与停止条件

按 [统一数据架构](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md) 登记候选，而不写实际 registry：

| 项 | 提案值 |
|---|---|
| sourceKey | `acled_hdx_monthly_candidate`（HAPI API / HAPI CSV / ACLED HDX XLSX 分别记录 transport，不混称独立源） |
| sourceDomain | `data.humdata.org`、`hapi.humdata.org`；不自动访问 `acleddata.com` |
| assignedLayer / primaryOwnerLayer | 当前拟议验证属于 `artifact_sanitizer_layer`；未来接入由 `daily_history_layer` 下既有 World Order 链负责，须另审 |
| freshnessCadence | 以实际数据截止期检查；目录标记 weekly update，统计粒度 monthly |
| artifactOnlyBeforeProduction / sanitizerRequired / productionWriterRequired | 均为 true |
| fallbackPolicy | 任何未知、超限、授权撤销或失败保留旧数据；不刷新其数据日期，不转用未批准渠道 |
| sourceComplianceStatus | `unresolved` |
| affectsScoring / affectsDecisionModel / affectsExecutionLock / affectsPositionGuidance | 本提案均为 false；不改变现有 weekly overlay 的既有作用 |

不在 reminder 中添加 checkout、安装或下载；不往现有生产 JSON 伪装写入六个 `filesIngested`、`preparedBy=manual` 或 `isRealData=true`。字段迁移和 writer 是后续独立事项。

### 授权后的一次性最小样本提案

以下是**待批准的具体操作预算**，不是可执行命令，也不因本 PR 合并自动打开：

- 优先 HAPI 官方 API 的单次小样本，预先核对现行 endpoint/schema、应用标识、所选国家/日期和资源版本；最多 2 个数据请求、合计 200 行/1 MiB、每请求 15 秒、零重试。不以 limit 命中推断完整覆盖；分页耗尽预算即返回“不完整”。
- 401/403/429、重定向至未批准目标、正文类型异常、超时/体积超限即停止，不轮换身份/代理或转下载 CSV。数据只在受控本地 ignored artifact 中处理；未审阅的原文/异常不得进入日志。
- 从 operator 合法持有、相同覆盖期且可追溯版本的月表选对照；先检查是否实际存在，缺失则等待，不执行 ACLED 网站自动下载。小样本只验证 schema、来源与候选口径，**不声称全球等价**。
- 如无适用应用标识，CSV 不是自动兜底；另行确认特定 resource ID、容量和保留方式。当前 2026 CSV 约 21.4 MB，亦不能放入上述 1 MiB 试验预算。
- 原始样本及含个人信息材料仅在批准的隔离目录保留；公开报告只记录经权利核对的来源元数据、hash、检查结果和差异类别，不公开明细。清理仍须对应授权。

### 完整等价验证的验收清单

小样本通过后，另行审阅完整取样预算及 comparator 实现；本次不声称已经编写或执行这些测试。

| 验证项 | 必须满足 / 必须拒绝 |
|---|---|
| 日期与版本 | 分开记录获取时间、HDX resource 更新时间、ACLED 覆盖截止期、revision/hash、行统计期。相同截止期不证明同一版本；新文件重算旧年月时不得误报 parser regression 或强行校准一致 |
| 完整月份 | HAPI reference period 可由月份扩展到月末；它不证明该月数据完整。8 月 28 日覆盖只能将 8 月标为部分月；不因 9 月上传或行 end=8 月 31 日而升级 |
| 地理粒度 | 每个国家/月份/类别采用一个已证实完整的层级；不累加 admin0 与 admin1/2。仅有部分地区不能报全国；国家名称映射冲突、领土口径、缺失/未匹配均显性报告 |
| 类别与死亡数 | 三类不得总和去重；逐项核对本表六个 metric。死亡数范围或 mob violence 归属未知即 hold，不以全局数字接近判等价 |
| 零/缺失与错误 | 明确零才是 0；空值、缺行、未知类别不转零。API 和 CSV 的 error/warning 过滤保持对应；有 error 的行不得因 CSV 可见而计入，丢失覆盖须显性阻断完整性结论 |
| 版本内重复 | 校验 resource/时间/地理/类别唯一键；相同重复不能重复累加，冲突重复不得 last-write-wins；国家汇总不能掩盖正负差异抵消 |
| 全年与趋势 | 对齐最新完整年 Y 及 Y-1/Y-2/Y-3（当前为 2025、2024、2023、2022）；另外核对连续 24 月及全部适用国家。不得只下载 2026 文件就宣称覆盖年度基线 |
| 数值比较 | 同版本同口径整数逐键相等；导出比率按现有六位小数规则复算。差异必须归因，缺少同版本原件为 indeterminate；不得增加容差隐藏分类差异 |
| 保护性回归 | 构造重复层级、三类重叠、部分月、缺月、缺年、未知分类、错误行、null/0、分页截断、超限、过期/未来、版本混用的负例；所有例子与真实事件隔离 |
| 发布隔离 | 检查前后 `config/world-order-acled-*.json`、`data/`、`realtime/` 及 workflows 未变；无网络的 comparator 检查不触发 provider、publish、Git push 或来源切换 |

需要显性处理的兼容性问题：现有 `buildMonthlyTrend` 选最近 12 个有记录月份和前 12 个，不验证连续完整月；`deriveLatestFullYear` 有缺年 fallback。未来新路径若加强完整期要求，必须独立说明行为差异并评审，不能一边改变窗口一边声称与旧算法完全等价。本刀不修改现行算法或 checker。

## 待发送的授权与口径询问信草稿

**未发送。** 收件渠道应由 owner 确认官方 Access 联系方式与 OCHA `hdx@un.org`；不同机构各答其职责。发送前填写真实用途和身份，不要把方括号保留或擅自声明非商业。批准本 PR 不等于批准发信。

Subject: Clarification of ACLED aggregate data access via HDX/HAPI for GFRR

Hello ACLED Access / HDX team,

I maintain GFRR, a financial-risk dashboard. My actual use and organization are: [owner-confirmed personal/commercial status, organization if any, and whether this serves clients]. Please assess this use case rather than assuming it is non-commercial research.

We currently use manually downloaded ACLED aggregated workbooks. We would like to evaluate low-frequency programmatic access to ACLED-published HDX monthly resources or OCHA's HAPI conflict-events API/CSV, without scraping ACLED's website or accessing event-level data outside our entitlement.

Could you confirm the applicable terms and whether this access, local retention and our intended public derived summaries are permitted? Public outputs would exclude raw workbooks and row-level downloads; please advise what transformations and anti-reconstruction controls are required for the dashboard, public JSON/repository and any artifacts. We propose no model training or use that substitutes for ACLED services. Please flag any additional license or fee; this inquiry does not accept a paid agreement.

For equivalence, please clarify the mapping to the six country-month/year products: political violence events (month and year), demonstrations, civilian-targeting events, reported fatalities, and reported civilian fatalities. In particular: mob violence classification; whether civilian_targeting fatalities correspond to civilian deaths; how total fatalities can be recovered without overlapping categories; national/admin coverage; missing versus zero; complete-month cutoffs; and retrospective version alignment. Is a supported weekly-admin aggregate endpoint or explicitly permitted weekly file-download mechanism available for our access level?

Please provide current HAPI terms and any relevant resource-specific documentation. We will not assume a public URL grants redistribution rights or switch production before reviewing your response.

Thank you,
[owner name and approved contact address]

## 本刀交付与后续判定

- 已完成：源码/元数据对照、六项候选映射与缺口、来源权利问题清单、隔离预算与验收用例设计、未发送询问信。
- 未完成且未冒充完成：现行 HAPI 条款读取、用途/许可确认、真实样本下载与数值对照、comparator 实现、生产更新和周表自动化。
- 下一决策：先完成用途与条款确认，再批准特定的一次性隔离读取和实现；若六项无法等价，保留现有月表，不把部分代理覆盖当作无损替换。可另提独立辅助指标，但需新范围批准。
- 本文新增的是评审入口，不是 source approval；实际验证、commit、push、PR 与独立评审状态以对应回执为准。
