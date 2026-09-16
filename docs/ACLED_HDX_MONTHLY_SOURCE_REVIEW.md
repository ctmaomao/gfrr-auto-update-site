# ACLED / HDX 月度自动接入来源评审

<a id="当前状态2026-09-08-授权联系复核"></a>

## 当前状态：2026-09-16 HDX/HAPI 许可确认与隔离验收

### 本次 acceptance baseline（替代下文旧阶段的许可等待）

- ACLED Access 于 2026-09-15 09:00:15 UTC 在已授权询问信线程明确答复：允许本项目使用 ACLED 在 HDX 公开的月度聚合数据或 HAPI 资源；下载遵守 HDX 平台条款，公开成果正确归因 ACLED。已核对来信认证。此答复不是对六项指标等价性的确认，也不授权官网自动抓取或付费 registry API。
- Owner 随后要求开始下一步。本次只执行一次隔离验收：最多两个 HAPI 请求（一个数据、一个关联资源元数据），合计不超过 200 行 / 1 MiB，每次 15 秒、零重试、串行间隔至少 1 秒。先明确国家、月份、类别和行政层级，再检查实际返回；命中 limit、缺行、层级/版本不明均不得宣称完整。
- 原“条款入口部署一致性”阻碍已核验关闭：旧条款入口实际 HTTP 301 指向 [新版官方 API 总览](https://docs.humdata.org/build/overview/hdx-api-overview)，沿官方文档索引完整读取 [现行 HAPI 条款](https://docs.humdata.org/about/hdx-terms-of-service/hapi-terms-of-service.md)、[HDX 平台条款](https://docs.humdata.org/about/hdx-terms-of-service.md) 和 [许可说明](https://docs.humdata.org/about/data-licenses.md)。HAPI 八节仍要求最多 10,000 行/请求、每秒最多一次、应用标识和使用日志；平台第 12 条仍要求遵守具体数据许可。页面未给明确版本生效日，记录读取日期而不自行推定。
- 独立 AI 来源审阅通过此小样本方案；允许用 owner 已批准的应用联系信息在本机编码标识，仅通过 HAPI 请求头发送，不公开邮箱、可逆标识、私人邮件或原始数据行。样本仅保留本地 ignored artifact，不发信、不注册账户、不改生产或提醒链。
- 当前状态拆分为 `sourcePermission=permitted_hdx_hapi_for_disclosed_project`、`isolatedSampleApproved=true`、`metricEquivalence=unverified`、`productionDataWriteApproved=false`、`sourceCutoverApproved=false`。新 baseline 仅替代旧阶段“未获 HDX/HAPI 许可 / 不执行隔离正文读取”表述；所有现行 manual-xlsx 生产规则及其它来源保障继续保留。

### 本次实际验收结果

- 2026-09-15 20:56 UTC（本地 09-16）完成一次小样本：`NZL / admin_level=0 / political_violence / 2026-07`，一个 conflict-events 请求和一个关联 resource 请求均 HTTP 200，共 2 行、1,706 字节。无重试、无分页、无 ACLED 官网请求；dry-run 在真实请求前执行。
- 数据响应 SHA-256 为 `e1c18a5ff40dd01ae57b4febc4e7ffc5e98d3615b005437ede9545a59bfe92b2`；资源响应为 `952aede27f312607f609f9b3f7f7e1632014ab51c79acf31d5564facdfa18243`。原始行、联系信息及完整回执只在 ignored `manual-artifacts/acled-hapi-20260916/` 保留，不进入公开仓库。
- 初次本地关联检查误用了旧 v1 示例的 `hdx_id`，在两个请求完成后报 `metadata_mismatch`。按实际 v2 的 `resource_hdx_id` 修正后，仅离线复核已保存响应：国家、月、类别、层级、整数及来源关联通过，未再次请求。没有将初次退出码 1 改称成功执行。
- HAPI 关联的是 ACLED 的 PV XLSX 资源 `99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f`，不是 HAPI 导出的年度 CSV。响应资源名 as-of **08-28**、资源更新时间 **09-03 10:29:54 UTC**、HAPI 更新时间 **09-07 01:33:17 UTC**。同日 CKAN 目录中这个相同资源 ID 已是 as-of **09-04**、更新时间 **09-10 10:25:01 UTC**；HAPI 导出 2026 CSV 的目录截止也是 09-04。这证明**相同 resource ID 或更新目录不等于实际 HAPI 响应已同步**，不得以目录最新日期覆盖响应来源日期。
- 只读检查 operator 合法持有的 `number_of_political_violence_events_by_country-month-year_as-of-21Aug2026.xlsx`：SHA-256 `a3201b7350cd4a11064614f98f130e1bc97ba6cd073927ddbd90f4b5968b6949`，读取前后不变。文件的 worksheet dimension 声明为 A1；只读解析重新扫描实际单元格，保留 50,000 行/8 列边界，不改 XLSX 或现行 sanitizer。对应国家/月行未找到；不能把缺行当零或据此判等价。
- 结论为 **schema/来源关联通过；数值等价 `indeterminate`**（本地对应行缺失、08-21/08-28/09-04 版本未对齐）。这不是解析错误已证明、六指标替代通过或全球完整覆盖。未改变 `config/`、`data/`、`realtime/`、workflow、生产 fetcher 或发布链。

### 历史往来与手工发布回执（截至 2026-09-13）

Owner 已提供联系邮箱并授权发信；本轮又明确授权逐项实施、验证、commit+push、独立 AI 审阅及合并。下文原始阶段的“不发信 / 联系信息待批准”只描述当时范围，不撤销后来授权，也不代表已取得第三方数据许可。

- 最新只读邮箱复核：截至 2026-09-13，09-10 之后的 ACLED/HDX 搜索仍仅有 09-10T17:12:43Z 的 ACLED 回复，内容提供 Codebook/Knowledge Base 以解释字段定义，没有答复免费程序化访问或公开衍生成果适用性。此前 owner 批准的英文续询已发出；本轮没有重复发信或公开邮件原文。方法文档链接不等于本项目的自动接入许可。

- 2026-09-08 03:23 UTC 的两封首次询问信分别发给 ACLED Access 与 HDX。ACLED 于当日 16:17 UTC 回复；已核对来信认证通过。官方要求公开数据须有实质转换并正确归因，邀请提交截图供其审阅，并说明按所述用途获得更高访问层级需许可，可转介 API 许可团队。这不是本项目转换成果已获认可，也不是 HDX/HAPI 免费接入批准。
- Owner 授权先制作为英文再回复。2026-09-09 01:52 UTC 已在原 ACLED 线程发送英文说明及三张 PNG：当前 World Order 面板英文审阅副本、Arms & Conflict 卡英文审阅副本、另制的英文数据用途/公开暴露说明。发送后读回确认 SENT、线程与三份附件相符；没有重复发送。HDX 的适用渠道与权限确认仍待取得。
- 续询明确披露：公开产物不只是抽象评分，还包括可获取的聚合值、部分地区/国家/行政区摘要与排名、输入元数据和公开仓库历史；不声称聚合天然满足不可还原要求。请官方明确哪些字段、粒度、归因或公开控制需修改，以及是否存在适用的免费官方低频渠道和六项指标映射。未接受费用、API 付费方案或协议。
- 公开仓库只记录必要的状态摘要，不保存个人邮箱、邮件内部 ID、原始邮件头、完整私人邮件或邮件附件；私有审阅材料不因文档同步而重新发送或公开。这里的英文材料是发送时的快照；后续 #322 展示措辞修复不等于官方已审阅新版页面。
- 手工更新的当前回执：#350 自动准备 main 入口已合并，09-11 22:32 UTC 配置发布 `b06aaaf4` 与 World Order `34654473322` 成功；09-13 产物及双站实读为六地区同窗、周截止 08-28、月 as-of 08-21，weekly aging/overall partial 如实保留。9 月 9 日部分地区仍 08-14 的记录是历史快照，不是当前本地配置待发布。此手工发布不是 HDX/HAPI 自动接入或同源版本等价验证。
- 当前 HDX/HAPI 候选 `sourceComplianceStatus=unresolved`；该候选的正文读取、生产写入和切源仍未开启。等待资源级权限、公开转换/归因适用性及指标口径答复，不执行 HAPI 数据请求、应用标识注册或 comparator；不把六项指标编码成已批准映射。既有手工更新、缓存保留与观察门槛不变。

## 初始阶段状态与批准范围（2026-09-08 历史）

2026-09-08，owner 在来源调查后要求“请做下一刀”，对应本次**来源评审与隔离验证设计**，沿用逐项 commit + push。本文是可评审交付物，不是数据下载器、接入许可或生产切换决定。

- 结论：HDX/HAPI 是值得继续验证的官方分发渠道；**月度接入链的六项指标（五项年度、一项月度）尚未证明等价，完整自动替代暂不批准**。
- 本轮只读取公开文档、HDX 目录元数据和现有源码/已提交 JSON；没有读取远端数据正文、运行 sanitizer、注册应用标识、发送邮件或触发刷新。
- `sourceComplianceStatus=unresolved`、`liveDataFetchApproved=false`、`productionDataWriteApproved=false`、`sourceCutoverApproved=false`。这些是评审状态，不新增 runtime 配置。
- [AGENTS](../AGENTS.md)、[来源规则](AGENT_DOMAIN_BOUNDARIES.md#sources)、[M-63 操作契约](M-63_ACLED_INTEGRATION.md) 和现有 HDX metadata-only reminder 边界全部保留。PR #309 的单次 AI 代人工审阅例外不沿用。

2026-09-08 补充 acceptance baseline：owner 明确确认 GFRR 为**个人非商业项目，无广告、付费订阅或客户服务**，并要求继续。用途事实已确认，不再重复询问；不是替 ACLED/OCHA 授权，也不扩大为发信、披露联系邮箱、接受付费协议、真实样本下载或生产发布。本次补充留在同一 PR #310。

## 初始代码与数据基线（2026-09-08 历史）

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
2. **用途已由 owner 确认**：2026-09-08 确认为个人非商业，无广告、付费订阅或客户服务。依此按非商业用途继续评审，不从 `licenseLevel=open` 反推许可，也不额外声称具有学术机构身份。以后增加商业或代客用途须重新评审。
3. **数据条款仍适用**：2026-09-08 重读 [ACLED EULA](https://acleddata.com/eula) 与 [Content Usage Terms](https://acleddata.com/contentusage)，两页标注更新日期均为 2025-07-08。EULA §1.2、§3.1–3.3 涉及商业许可、转换成果、再分发及网站抓取限制；§7 涉及 AI 使用及防提取。用途确认解决商业身份疑问，但公开成果仍须满足转换且不可还原等条件，不能把仅重排的仪表盘视为已合规。
4. **HAPI 现行条款已核验**：09-08 的旧入口读取与源码证据链保留在下文；09-16 已沿实际官方跳转和索引完整读取新版平台/HAPI 条款，旧部署一致性缺口关闭。未换代理、伪造身份或访问受限资源。
5. **公开 Git/JSON 也属于发布面**：未来不能只检查 UI 是否展示原表，还须检查 public repository、静态 JSON、Actions artifact 可见性及是否可还原数据。原始文件、国家级对照行与含邮箱的应用标识不得进入公开提交；现有发布范围本刀不扩展。
6. **权限不迁移**：镜像不洗掉 ACLED 权利；Open 档不自动赋予原始事件 API。09-16 实读 [HAPI OpenAPI](https://hapi.humdata.org/openapi.json) 为 0.9.14，现行路径 `/api/v2/coordination-context/conflict-events`，支持 `X-HDX-HAPI-APP-IDENTIFIER` 请求头；标识是应用名与邮箱的可逆编码，不是秘密 API key，不得公开。旧入门页的 v1 示例不当作当前接口。

下一次来源评审应记录：适用条款 URL/版本日期、用途确认、允许的渠道/频率/存储期限/发布形式、剩余歧义及答复依据。只有有权方才能授予来源许可；owner 可以批准项目操作，不能代第三方授予数据权利。

### HAPI 官方条款历史证据链（剩余入口缺口已于 09-16 关闭）

2026-09-08，通过 GitHub 官方仓库 `OCHA-DAP/hdx-ckan` 的默认分支 `dev`，固定到 commit `128d8406828e49f4a6fd24331f8f9a0d34cf171b`，核对以下读取链：

1. [路由](https://github.com/OCHA-DAP/hdx-ckan/blob/128d8406828e49f4a6fd24331f8f9a0d34cf171b/ckanext-hdx_theme/ckanext/hdx_theme/views/landing_pages.py)将 `/hapi/terms/` 交给 `faq_read('hapi-terms')`；[配置](https://github.com/OCHA-DAP/hdx-ckan/blob/128d8406828e49f4a6fd24331f8f9a0d34cf171b/common-config-ini.txt)登记分类 `599` 及官方内容站示例地址。
2. [FAQ 读取器](https://github.com/OCHA-DAP/hdx-ckan/blob/128d8406828e49f4a6fd24331f8f9a0d34cf171b/ckanext-hdx_theme/ckanext/hdx_theme/helpers/faq_wordpress.py)从公开分类和条目 JSON 加载正文；[条款模板](https://github.com/OCHA-DAP/hdx-ckan/blob/128d8406828e49f4a6fd24331f8f9a0d34cf171b/ckanext-hdx_theme/ckanext/hdx_theme/templates/faq_others/hapi-terms/main.html)渲染该内容。
3. 实际只读 GET [官方分类 599](https://centre.humdata.org/custom-ufaq-category/599.json) 返回子分类 `600`（HAPI Terms of Service Content），count=8；[官方条目 600](https://centre.humdata.org/custom-ufaq-list/600.json) 返回 8 节，ID 为 `88585/88590/88595/88596/88597/88600/88605/88607`，数量一致。条目声明发布日均为 2024-06-06，最新 modified 为 2024-06-07（Data Logging and Analysis）；这不是另行推定的条款生效日期。

八节分别涉及简介、接受条款、单次条数限制、请求频率、用户行为、日志与分析、免责声明及联系信息。其约束摘要：单次最多 10,000 条；请求按每秒一次节制；不得干扰服务；须带应用标识，OCHA 可记录 API 调用并分析使用情况；数据不代表 OCHA/联合国背书；疑问联系 `hdx@un.org`。内容没有给出 ACLED 数据的独立再分发许可或项目专属保留期限，不能拿平台条款覆盖资源级 ACLED 条款。八节中的旧简介范围也不能代替现行资源覆盖证据。

当时补齐了**官方公开条款内容**，但没有证明不可读入口当前部署的全部呈现。09-16 已直接读取现行官方条款并完成独立来源方案审阅，窄范围隔离读取按顶部 baseline 执行；不再把旧入口问题当作必须重复联系官方的阻碍。

## 隔离验证设计（原方案与后续完整验收）

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
| sourceComplianceStatus | 原方案为 `unresolved`；当前窄范围许可及执行状态见顶部 acceptance baseline |
| affectsScoring / affectsDecisionModel / affectsExecutionLock / affectsPositionGuidance | 本提案均为 false；不改变现有 weekly overlay 的既有作用 |

不在 reminder 中添加 checkout、安装或下载；不往现有生产 JSON 伪装写入六个 `filesIngested`、`preparedBy=manual` 或 `isRealData=true`。字段迁移和 writer 是后续独立事项。

### 授权后的一次性最小样本提案

以下是原具体操作预算；09-16 已按顶部窄范围批准完成一次试验，不因本 PR 合并自动续跑或扩大：

- 优先 HAPI 官方 API 的单次小样本，预先核对现行 endpoint/schema、应用标识、所选国家/日期和资源版本；最多 2 个数据请求、合计 200 行/1 MiB、每请求 15 秒、零重试。请求串行、开始时间至少相隔 1 秒，不因平台上限 10,000 条而扩大本项目预算。不以 limit 命中推断完整覆盖；分页耗尽预算即返回“不完整”。
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

兼容性基线已更新：旧评审中 `buildMonthlyTrend` 只选最近有记录月份的问题已由 [ADR-0034](ADR/0034-acled-complete-month-windows.md) 独立修复；当前生产要求 as-of 月之前的连续 24 个日历月，缺月整个趋势为 null。未来 comparator 必须对照该现行逻辑，并保留年度缺年/国家覆盖检查，不以旧算法作等价依据。本刀不修改现行算法或 checker。

## 已发送询问所用草稿（保留模板）

**首次询问及续询已发送；09-15 的许可回复见本文顶部。** Owner 已另行批准联系信息和发信，不能再把模板占位符当作缺少邮箱。下列保留首次询问模板，不是许可答复；个人署名/邮箱不公开，不因本次文档合并而重发或注册账户。

Subject: Clarification of ACLED aggregate data access via HDX/HAPI for GFRR

Hello ACLED Access / HDX team,

I maintain GFRR, a personal, non-commercial financial-risk dashboard. It has no advertisements, paid subscriptions, or client services. Please assess this stated use case; I am not claiming institutional academic status.

We currently use manually downloaded ACLED aggregated workbooks. We would like to evaluate low-frequency programmatic access to ACLED-published HDX monthly resources or OCHA's HAPI conflict-events API/CSV, without scraping ACLED's website or accessing event-level data outside our entitlement.

Could you confirm the applicable terms and whether this access, local retention and our intended public derived summaries are permitted? Public outputs would exclude raw workbooks and row-level downloads; please advise what transformations and anti-reconstruction controls are required for the dashboard, public JSON/repository and any artifacts. We propose no model training or use that substitutes for ACLED services. Please flag any additional license or fee; this inquiry does not accept a paid agreement.

For equivalence, please clarify the mapping to the six country-month/year products: political violence events (month and year), demonstrations, civilian-targeting events, reported fatalities, and reported civilian fatalities. In particular: mob violence classification; whether civilian_targeting fatalities correspond to civilian deaths; how total fatalities can be recovered without overlapping categories; national/admin coverage; missing versus zero; complete-month cutoffs; and retrospective version alignment. Is a supported weekly-admin aggregate endpoint or explicitly permitted weekly file-download mechanism available for our access level?

We reviewed the eight HAPI terms sections published through OCHA's official content site (category 600, retrieved 8 September 2026), after the main terms page was inaccessible to our reader. Please confirm whether these remain applicable and provide any updates, additional terms, and relevant resource-specific documentation. We will not assume a public URL grants redistribution rights or switch production before reviewing your response.

Thank you,
[owner name and approved contact address]

## 本刀交付与后续判定

- 已完成：ACLED 对所披露项目 HDX/HAPI 用途的明确许可、现行平台条款核验、独立小样本方案审阅、两次有界真实请求、已有响应的离线 schema/来源关联与本地月表缺行复核。
- 未完成：六项数值/定义/覆盖等价、同版本完整样本、可复用 comparator、生产更新和周表自动化。完整源码生产接入、调度及公开派生成果须另作独立实施/发布审阅；本轮不把“允许使用”扩大为无限制再分发。
- 下一步是审阅**版本固定的月度候选适配方案**：显式区分目录与实际响应版本，独立采集/比较预算，保留三类非互斥、总死亡数无证明映射、缺行不作零和原始行不发布边界。可考虑只覆盖可证明的月度 evidence，但须明确这是部分来源改造而非六表无损替换；不能隐式实施。
- 不再把已经取得的 HDX/HAPI 许可列为待联系事项；ACLED 官网自动抓取与免费直接 API 仍未获准。实际完整检查、commit、push、PR 与最终独立审阅状态以对应回执为准。

## 离线版本固定候选工具（2026-09-16）

此节更新上节“comparator 未实现”的状态，仅覆盖政治暴力国家月度事件数；前述六指标完整等价验收仍未完成。owner 已批准本下一刀实施，独立方案审阅通过。工具属于 artifact_sanitizer_layer，不接入生产、调度或发布。

- 实现：[纯候选模块](../scripts/world-order/acled-monthly-candidate.mjs)、[stdin CLI](../scripts/review-acled-monthly-candidate.mjs)、[合成回归](../tests/unit/acled-monthly-candidate.test.mjs)。入口 `npm run review:acled-monthly-candidate` 从 stdin 接收 JSON；`npm run check:acled-monthly-candidate` 已加入完整检查。没有文件路径、联网、凭证、写入或批准开关；不要将原始输入放进命令参数、日志或公开仓库。
- 输入严格为 `{current, baseline}`，baseline 可为 null；每份快照为 `{pin, sampleJson, metadataJson}`，后两项是保存的 UTF-8 JSON 字符串。pin 的完整字段以模块 `PIN_KEYS` 为准：schemaVersion=`acled-hapi-pv-pin-v1`、两个保存字节 SHA256、固定 resource ID、资源文件名/asOfDate、resourceUpdatedAt、hapiUpdatedAt、fetchedAt、countries、months、requestLimit。格式化保存后的 hash 不等于原网络响应 hash，必须针对实际传入字符串计算。
- 每份样本与元数据合计最多 1 MiB、100 原始行；最多 10 个唯一国家、24 个唯一月份、100 个预期国家月键。整个 stdin 在解析前限制 4 MiB、5 秒。明确声明范围不代表全球覆盖；命中请求行上限、缺行、事件数 null 或 as-of 当月都 hold，不补零。重复行先计原始行预算，所有校验字段完全相同才去重，冲突拒绝。
- 时间严格校验真实 UTC 日历并保留微秒；来源覆盖、更新时间、HAPI 同步和获取时间分别记录。资源 ID/文件名/来源/版本元数据必须关联，且只接受 admin0 / political_violence。文件 hash 固定的是本地保存字节，元数据是声明证据，不认证上游，也不保证 HAPI 可重新获取该历史版本；不以目录新日期刷新样本。
- 同范围完整快照才作逐键比较；相同声明版本但值或其它行字段变动报告 revision_conflict，不同声明版本报告 revision_difference。获取时间、HAPI 同步时间、JSON 顺序或空白变化本身不是来源修订。输出只有变化行数和状态，不含国家月键、事件值、明细 hash 或原文异常；不持久化或自动更新基线。
- 真实离线验收：仅重放前次保留的两份 JSON，exit 0、保存字节未变、声明范围完整；没有第二份真实快照，返回 baseline_required。13 项合成测试覆盖缺失/零、微秒、部分月、上限、冲突、跨版本、格式变化、CLI 超限/超时及脱敏。六指标等价、来源真实性、全球覆盖、时效与生产授权均不因通过而成立。

下一刀可评审可复用有界采集器及第二快照预算，明确请求前后版本一致性；本工具不追加网络预算。完整年度/连续 24 月、另外五项指标与生产切源仍遵守前述独立门槛。

## 有界采集与版本围栏（2026-09-16）

Owner 在下一刀明确批准**仅此次三请求真实验收**：免费 HAPI，三次响应累计最多 1 MiB / 102 原始行，每请求（含正文）15 秒、零重试。此窄范围批准替代前次已耗尽的两请求操作预算，不授权自动续跑、官网访问、收费、生产或公开原始数据。方案已独立审阅；本轮读取官方 OpenAPI 0.9.14，核对 v2 参数，文档读取不属于数据采样请求。

- [采集核心](../scripts/world-order/acled-hapi-collector.mjs) 仍归 artifact_sanitizer_layer，仅固定既有 `NZL / 2026-07 / admin0 / political_violence` 范围；不是六指标替换。依次读取固定资源 metadata、样本、同资源 metadata；起始时间至少间隔 1,100ms。固定 `https://hapi.humdata.org` 的两个 v2 路径，不接受其它 URL、分页、redirect 或 retry。401/403/429/非200、错误正文、超时、行数或字节超限立即停止。
- 请求先累计流式字节再解析 JSON，三响应总计受限；metadata 各最多一行，sample 最多100行，命中100仍不完整。前后 provider/dataset/format/ID/name/source date/update/HAPI sync 分别校验，样本逐行绑定同资源；可见版本不同即拒绝候选。双读**不证明事务一致快照**，服务未提供不可变 revision 查询保障，保留 `atomicSnapshotProven=false`。
- [CLI](../scripts/collect-acled-hapi-candidate.mjs) 的 `npm run collect:acled-hapi-candidate` 默认 dry-run，零数据请求；仅明确 `-- --live` 才读 stdin。输入精确为 `{approval, application, email, baseline}`，approval 固定 `pv-20260916-three-requests`；该标识只是本次实际批准的记录，不自行授予权限。baseline 为合法本地候选或 null，并在任何请求前复验相同范围；不自动更新基线。stdin 限4 MiB/5秒，联系信息仅通过 HAPI header 使用，不放 URL、argv、日志或候选。
- 固定 ignored `manual-artifacts/acled-hapi-collector/pv-20260916-three-requests/`，拒绝重解析链接、路径参数、覆盖和已有 attempt；联网前独占保留 attempt 和预算。失败也保留尝试，不删除/改名目录重用同次批准。此防重是当前 checkout 的操作保护，不是跨所有机器或复制 checkout 的授权系统；禁止通过复制/改源码绕过本次预算。
- 成功时原子保存一个 `candidate.private.json` 私有封装（current、baseline=null、metadataBeforeJson），stdout/receipt 只有汇总状态。离线工具输入必须取 `{current, baseline}` 两项，不能将附带前置元数据的存储封装直接当作其严格输入。失败不保存合格候选；不打印原始异常、单行值或邮箱。原始候选不得上传 GitHub/Actions artifact；生产 `config/`、`data/`、`realtime/` 和 workflow 均不修改。
- 回归入口 `npm run check:acled-hapi-collector` 加入完整套件；测试使用合成响应和临时仓库，不消耗 HAPI 请求或写真实尝试目录。真实验收只在 dry-run、专项及独立代码审阅通过后执行，并记录结果；未取得第二真实快照前，不声称跨运行验收完成。

后续自动化必须另行审阅持续采样范围、频率、版本退回/过期规则和保留预算；一次样本成功不能直接开启周期任务或覆盖手工月表。

### 本次真实验收回执

- 2026-09-15 22:04 UTC（本地09-16），独立代码审阅、12项合成回归和 dry-run 通过后，仅在本 checkout 执行一次。metadata/sample/metadata 三次均200，总计3行/3,047字节（1,341 + 365 + 1,341），零重试/分页/重定向，预算已耗尽。
- 前后来源元数据一致；候选范围完整，保存候选用既有离线 CLI 复验 exit 0。与前次20:56样本的比较为 serialization_or_metadata_change：声明版本相同、事件及全部校验行字段变化数均0；进一步本地只读复核两个 JSON 的结构语义也分别相等，字节 hash 差别来自保存序列化格式，而非已观察到的数据修订。旧保存样本字节保持不变。
- 实际仍 as-of08-28、来源更新09-03、HAPI同步09-07，不能把本次获取时间09-16或目录日期作为来源更新日。此次已完成第二份真实快照的同范围跨运行比较，**没有获得新来源版本、六指标等价或全球覆盖证据**。
- 本地 ignored attempt、receipt 和候选封装已保留，未公开原始行/联系信息，不自动晋升baseline；`config/`、`data/`、`realtime/`、workflow 未修改。失败重跑、下一次真实采样和周期调度仍需相应独立预算/方案；本次不再执行任何数据请求。

## 四槽候选试行（2026-09-16）

Owner 已批准前轮独立评审提出的**四次低频候选采集试行**，替代“后续持续采样尚未批准”的本次范围门槛：PV/admin0、源as-of之前24完整日历月、每周最多一次且首次计入四次；每次三响应累计≤8MiB/10,002原始行（sample最多10,000、两个metadata各1），最多3请求，15秒/请求含正文、起始间隔≥1,100ms、零重试/分页/redirect；全试行≤12请求/32MiB。没有免费官网/API替换或生产授权。

### 候选与数据边界

- [候选核心](../scripts/world-order/acled-pilot.mjs) 和[本地记录](../scripts/world-order/acled-pilot-store.mjs) 归artifact_sanitizer_layer。新全返回范围契约逐国家复用既有小样本validator；原100行/1MiB/checker断言不改。只取同一PV资源/admin0，最多400个返回国家代码；sample命中10,000即hold，不截断后宣称完整。
- 无官方完备国家清单，`globalCoverage=not_proven`；只统计返回国家是否具备24个月。缺月/null不补零，重叠月份逐键比较，新增/移出月份独立计数；国家消失、共同键丢失或同版本内容变化不能替换旧候选。无全球总量输出，不建立其它五指标的未经证明映射。
- 首次读取metadata，只有来源as-of/资源更新时间/HAPI同步时间都未变且旧文件hash/结构/覆盖复验通过时，才只用一个请求返回metadata_only。它仅表示未检测到元数据版本变化，不证明正文没发生静默修订；保留旧dataFetchedAt、另记metadataCheckedAt。同步时间变化触发完整三请求路径。源as-of超过45天只检查metadata、不取正文，不刷新旧数据时效。
- 新版本有数据时，再读metadata确认前后一致；该围栏仍不证明事务快照。同版本冲突、来源/同步版本倒退或国家范围异常缩减暂停；所有失败不覆盖旧候选。合格新候选可在私有档案中成为下一轮比较参照，**不是人工/生产基线晋升**。

### 运行记录、保存与停止

- [CLI](../scripts/run-acled-four-slot-pilot.mjs)：`npm run acled:pilot` 默认dry-run；`npm run acled:pilot -- --status` 仅读状态；`npm run acled:pilot -- --live` 最多执行当前槽一次。CLI只接受这三种模式，没有URL、输出目录、预算或日期覆盖参数。
- 只准Git common-dir所在的canonical主checkout，拒绝linked worktree；固定ignored `manual-artifacts/acled-pv-four-slots-20260916/`。首attempt设置startedAt及28天后的绝对expiresAt，四个7天槽；相邻实际attempt还须间隔≥7天，漏槽不补、失败耗槽、到期无条件停止。先持有互斥`.lock`，再读状态、预留、占槽、请求、保存回执。进程崩溃留下锁或不完整attempt时拒绝续跑，不自动删除/恢复。
- 原始sample、前后metadata分别按响应字节保存，再写hash manifest和脱敏receipt；不重复JSON封装原文。联网前预留8MiB+64KiB，实际落盘前再校验，含pending的总保存上限64MiB；不足就停止，不删除用户资料。完整receipt最后落盘，未完成归档不能成为下一轮有效候选。
- ignored `contact-source.json` 只保存已批准本地联系文件的绝对路径，不复制邮箱；联系文件限4KiB、拒绝链接，应用标识只放HAPI请求头。不得在日志、argv、Git或远端artifact中展示联系信息或原始行。
- 本线程heartbeat每次唤醒至多执行采集CLI一次，not_due立即结束不补跑。任何CLI退出1或paused/locked/finished应停止ACLED分支并报告；finalSlot结束也停止该分支。按下文双任务安排，仅当ARR也完成或停止时才暂停共享heartbeat。即使停止调度失败，CLI的槽和截止保护仍禁止额外请求。不自动删除锁/状态、换目录/ID或改源码重用预算。
- 本地定时执行需要机器开机、桌面应用运行及本项目可用；离线漏过的槽不会补采。依据[官方定时任务说明](https://learn.chatgpt.com/docs/automations?surface=app)。后续三次尚未实际执行时，不声明四槽试行完成；四周内无版本变化不算真实修订路径验收。

### 验证入口

`npm run check:acled-pilot` 使用合成数据与临时仓库，覆盖月份/层级/null/重复、metadata-only时钟、窗口与修订区分、HTTP/字节/行数/超时、四槽/到期/重复/漏跑、锁与中断、hash/容量/目录链接及linked worktree拒绝。已加入check:all；不联网、不操作真实试行记录。真实首槽须在专项、dry-run和独立代码审阅通过后执行；生产config/data/realtime/workflows始终隔离。

### 首槽真实回执

- 2026-09-15 22:53 UTC（本地09-16）完成首槽，三请求全部200、总1,863,079字节，原始行总5,234（metadata各1，sample5,232）。样本为218个返回国家代码×24个月，2024-08至2026-07；缺月、事件null、重复均0。来源as-of仍08-28，前后metadata一致，状态initial_candidate，不虚构同范围旧版作差异基线。
- 当前只证明**返回国家范围的连续月覆盖**，未证明官方全球国家清单、领土等价或其它五指标映射；无全球数值总量/逐国家值公开。保存的原始响应和manifest只在ignored目录，复验hash通过。
- 随即再次调用同CLI验收重复触发，返回not_due/零请求，未新增slot。startedAt=`2026-09-15T22:53:47.771Z`，expiresAt=`2026-10-13T22:53:47.771Z`；后续最多三个周槽，首槽已计入总预算。其它槽尚未实际执行，不能宣称四次试行全部完成。

## 替代验收与免手工目标（2026-09-16）

本节24月缺口描述对应默认pilot输入；后续独立年度候选已补齐2022–2025时间覆盖，现可通过下文 `--annual` 显式接入报告，不将候选完成冒充生产替代完成。

Owner 要求继续逐步达成免手工更新，ARR可同步优化。本阶段属于 `artifact_sanitizer_layer`，不扩大四槽预算或生产权限；四槽完成不是六指标等价的替代证据。

- [替代就绪报告](../scripts/world-order/acled-replacement-review.mjs) 分别列出六项的定义、时间覆盖、地理范围、数值对照与生产连接状态，不把部分通过压成一个绿色ready。`npm run review:acled-replacement` 零网络/零写入，读取当前固定私有pilot档案，复用hash/metadata围栏/锁检查，不读取联系文件，不预留或消耗槽位，不输出逐行值。
- 当前24个月2024-08至2026-07仅完整覆盖2025年度；[`fetch-acled.mjs`](../scripts/world-order/fetch-acled.mjs) 消费最新完整年与前三年均值，需2022–2025。缺年列表中的2024表示不完整（缺1–7月），不是2024全无数据。补完整年及其它类别需要独立采样方案，不能扩现有pilot参数绕过批准预算。
- `comparePilotToReference` 接受只含 `asOfDate` 和规范化 `rows[{countryCode,month,events}]` 的本地引用对象（至多50,000行）。国家名→代码映射须先核验，不做模糊匹配；仅对候选月份的国家键并集逐键比较，引用额外国家也计入缺口。null不作零、重复拒绝、整数精确比较；不同as-of报告不可判定，相同as-of的值相等仍只报告 `values_equal_revision_unproven`，并非版本或定义等价。没有生产批准开关。
- 当前CLI只接已有候选，不读XLSX或外部引用路径；真实执行为 `reference_missing`。本刀交付了比较核心及合成回归，**尚未完成手工XLSX逐行实际对照**。后续需从合法同版本原件在既有sanitizer边界内准备引用，不能从已汇总生产JSON倒造逐国家行。
- 示威、平民受害事件尚无本次类别样本；civilian_targeting fatalities不自动等于平民死亡人数，总死亡数没有已证明映射。月数据不能替代周度行政区统计；未取得免费等价周源时，保留手工要求而不是悄悄移除模块。
- 平台每线程只能绑定一个活动heartbeat，现已更新既有 `arr` 为“ARR 验收与 ACLED 候选试行”。ARR原证据/预算/9月21日等待保留，仅周一/二运行；ACLED仅周三/四20时检查，周四为夏令时或离线后的尚未用槽提供下一次检查机会，不补已过期槽。采集仍由CLI强制168小时间隔与绝对截止。各分支独立停止，全部结束才暂停整体；不是GitHub云端采集或正式发布安排。

## 年度候选与公开筛选规则（2026-09-16）

### 公开来源研究

- [ACLED汇总下载目录](https://acleddata.com/conflict-data/download-data-files/aggregated-data)明确：总死亡年度表包含全部报告死亡；平民直接受害年度死亡表包含直接针对平民事件产生的报告死亡。后者不是所有战争平民死亡，也不是已证明可按任意事件类别死亡数相加复原的总量。
- [HAPI类别定义](https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/enums/)说明三类非互斥；civilian_targeting简述为针对平民的暴力及针对平民的爆炸/远程暴力。[ACLED Codebook](https://acleddata.com/methodology/acled-codebook)对直接针对平民还讨论部分暴乱/暴民暴力及对抗议者过度使用武力。文档描述差异不能证明实际数据必然缺漏，也不能自行判定两张死亡表已经等价。
- [OCHA转换器固定版本](https://github.com/OCHA-DAP/hdx-scraper-acled/blob/64b7855739249eccc7c52d0f6b64aca656929200/src/hdx/scraper/acled/pipeline.py)按上游数据集识别类别并转换聚合字段，不重新执行事件级筛选。其国家代码特殊处理说明返回代码数量不是全球覆盖证明；本次查看源码不代表确认线上部署版本。
- 关联的[HAPI协调与背景指南](https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/coordination_and_context/)提供月度序列；更新频率不是周度统计粒度。[HDX Signals](https://centre.humdata.org/introducing-hdx-signals/)是提示服务，未证明能合法免费提供现有六地区周/admin1完整表。公开GitHub、社区及论坛检索未找到足以消除上述产品映射歧义的权威筛选配方。没有给ACLED发新邮件，没有抓取官网表格或增加数据请求。

### 独立一次性年度验收

Owner批准固定PV/admin0 2022–2025，仅本地私有候选：元数据→2022–2023→2024–2025→元数据，最多4请求、累计16MiB/20,002原始行、15秒每请求含正文、开始间隔至少1,100ms，零重试/分页/重定向。独立 `acled-pv-annual-20260916` once目录先占用，失败或中断也不重跑；不复用四槽预算、不加入heartbeat、不写生产。

`npm run collect:acled-annual` 默认只输出dry-run。`-- --live`为此次已消耗的批准入口，不可换ID、删目录或重置预算；`-- --review`只离线读取私有四响应及manifest进行哈希和覆盖复验，无网络。CLI不接受任意URL/日期/预算，联系文件沿用既有私有指针，不在日志/argv/Git输出。保存上限为16MiB加64KiB控制文件，不自动清理资料。

2026-09-16 02:49 UTC实际四请求全部200，总3,723,475字节、10,466原始行（10,464样本+2元数据），218返回国家代码各具备2022–2025完整48个月。前后元数据一致，sourceAsOf=2026-08-28，状态candidate_ready；随后的零网络保存档案复验为saved_candidate_verified。只证明返回范围完整，不证明全球覆盖、事务原子快照、两死亡指标语义或生产等价。

9项专项测试覆盖固定预算/间隔、国家并集缺失、月/类别/层级/重复/null、元数据围栏、HTTP失败、累计字节/截断、实际15秒超时、once失败占用、哈希与路径保护。原validator断言不变；真实执行前独立AI审阅通过。原pilot和生产config/data/workflows未修改。

### 年度报告接入与本地引用盘点

2026-09-16 owner要求继续离线替代验收。`npm run review:acled-replacement -- --annual` 使用已保存的独立年度档案，不读取联系文件或创建请求/槽位。四份响应hash、metadata围栏与完整性均重新验证；损坏或缺失退出失败，不静默回退。默认无参数仍为原24月报告。

年度信息单列 `annualCandidate`，保留独立sourceAsOf/fetchedAt/返回范围；只有与pilot来源日期一致时才用于PV年度时间覆盖。它不更新月度pilot数据时钟、不改变月度比较或其它四类别、不证明相同revision。真实运行的requiredYears和completeYearsInCandidate均为2022–2025、missingYears为空，但数值引用仍reference_missing，globalCoverage仍not_proven、productionEligible=false。历史档案不能代替后续新年度基线。

本次只读检查项目manual-artifacts/world-order/acled-input/monthly中的两份08-21原件：

- 月表 `number_of_political_violence_events_by_country-month-year_as-of-21Aug2026.xlsx`，Sheet1，COUNTRY/MONTH/YEAR/EVENTS，29,353数据行；SHA256 `a3201b7350cd4a11064614f98f130e1bc97ba6cd073927ddbd90f4b5968b6949`。
- 年表 `number_of_political_violence_events_by_country-year_as-of-21Aug2026.xlsx`，Sheet1，COUNTRY/YEAR/EVENTS，2,765数据行；SHA256 `febdaf5130f7c5ac460f359ef05687248bca52a5921c4dbaa6be6a9ef689b06a`。

两表读取前后hash不变；以只读扫描实际单元格处理错误的A1维度声明，不修写原件或生产sanitizer。两表各250个国家/地区名称，候选218代码的名称关系经双向检查无一名多码/一码多名，182名称精确对应。原表68名称和候选36名称无精确同名；这是映射线索，不是核准别名表，也不是68个真实缺国。未使用模糊匹配、补零或国家交集隐藏缺口，未公开原始逐行事件值。

当前Downloads六份为周表，项目monthly六份为08-21；没有找到同08-28引用，因此未执行数值对照。下一阶段先核验国家名/代码与各行政层级覆盖，再准备合法同版本引用；不能把不同层级直接相加补齐，也不能把公开转换器的分层设计推断当作真实返回覆盖验收。以上盘点不请求新数据、不改变四槽/ARR调度、不发邮件或批准生产替代。

## 地理覆盖与历史版本证据（2026-09-16）

Owner要求完成剩余可做事项，本项仅 `artifact_sanitizer_layer` 离线报告及公开来源证据，不下载新ACLED正文、不发邮件或扩大生产权利。

### 名称和代码

以[OCHA国家分类表固定版本](https://github.com/OCHA-DAP/hdx-python-country/blob/ee175764b5550de2169cb98ef1c1c945c4d1658a/src/hdx/location/Countries%20%26%20Territories%20Taxonomy%20MVP%20-%20C%26T%20Taxonomy.csv)的preferred term/ISO3及[UN M49](https://unstats.un.org/unsd/methodology/m49/overview/)核对国家代码。36组原表名称→代码→候选标准名已登记于[地理报告](../scripts/world-order/acled-geography-review.mjs)，不使用模糊搜索；这只是身份交叉索引，不证明争议或特殊领土、年度边界、事件统计口径等价。VAT/SHN/TWN等也保留这一限制。

`npm run review:acled-geography` 零参数、零网络、零写入，先读取并校验年度archive hash/schema/月份覆盖，再检验逐期一码多名/一名多码、标准名漂移。真实36个标准名/代码对全部吻合；以下24个有限参考代码未在当前admin0档案出现：AFG/BFA/BDI/CMR/CAF/TCD/COL/COD/ETH/HTI/LBN/MLI/MOZ/MMR/NER/NGA/PSE/SOM/SSD/SDN/SYR/UKR/VEN/YEM。这是本地原表已知名称对应的有限参考集，不是全球或HRP成员清单。即使全部返回也仍报告全球覆盖未证明。

另8名称（Akrotiri and Dhekelia、Atlantic Ocean、French Southern and Antarctic Lands、Indian Ocean、Kosovo、Mediterranean Sea、Pacific Ocean、Southern Ocean）保持未解决。没有将其放入ignore、补零或静默剔除；海域不能映射为国家，特殊领土/代码还需源口径核验。报告只说明admin0参考缺口、admin2未采集/跨层重叠未验，不把未在admin0返回写成整个HAPI无数据。报告引用08-21名称盘点，不重新打开XLSX或公开原始事件数。

### 行政层级证据

[固定OCHA配置](https://github.com/OCHA-DAP/hdx-scraper-acled/blob/64b7855739249eccc7c52d0f6b64aca656929200/src/hdx/scraper/acled/config/project_configuration.yaml)列出Non_HRP、HRP_1、HRP_2；[转换代码](https://github.com/OCHA-DAP/hdx-scraper-acled/blob/64b7855739249eccc7c52d0f6b64aca656929200/src/hdx/scraper/acled/pipeline.py)按有无Admin1列赋admin2/admin0，没有把admin2汇总成admin0，也没有跨层互斥校验。这能解释分层风险，但不能证明当前部署、两层实际互斥或整体地理完备。后续不得把两层直接相加。

### 历史文件可取得性

本次只读[HDX历史元数据](https://data.humdata.org/api/3/action/package_activity_list?id=3e6bfc98-f837-495d-b8de-71e5ac026f59&limit=5)找到08-28版本记录：resource update为09-03 10:29:54、size44,096,516、声明hash `8378025004dd6dadb230581a143c224b`。[当前资源元数据](https://data.humdata.org/api/3/action/resource_show?id=99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f)为09-04版：update09-10 10:25:01、size44,297,863、声明hash `ad06a8d31331d01252955d7aa0d0778a`。未从字段推断hash算法。

两记录的download URL相同，指向该resource下不带日期的political-violence-events-and-fatalities.xlsx。故历史metadata不是不可变历史文件；不得改URL日期参数、重命名当前文件或结合旧metadata冒充08-28。尚未发现已验证的历史字节地址，不等于证明历史原件不存在。此处只读CKAN元数据，无HAPI数据请求或44MiB正文下载；它也不是六份官网产品的同版本等价证明。

### 后续小样本方案（未执行）

状态补充：下述方案随后取得owner明确批准并完成一次验收，现行结果见文末；保留方案提出时范围，不再将“待批准”当当前阻塞。

独立请求AFG/2025-01/PV/admin2，元数据→样本→元数据，最多3免费请求/累计1MiB/1,002原始行、15秒每请求含正文、至少1,100ms间隔、零重试/分页/重定向，私有一次性占用目录。命中1,000样本行即停止；空/错国家月份层级/缺行政代码/重复/元数据变化拒绝。尚需owner明确批准本次预算；原四槽和年度once预算不得借用。没有权威行政区全集时，样本有效不等于地理完整，不全国汇总、不与admin0相加或上线。

## AFG 二级行政区一次验收（2026-09-16）

Owner明确批准了上节三请求预算。新增 `collect:acled-admin2` 默认dry-run；只有固定 `-- --live` 一次性入口，独立 `acled-afg-admin2-20260916` 目录先占用，失败或中断也不得删目录/换ID重跑。累计3请求、1MiB/1,002原始行、单请求含正文15秒、开始间隔至少1,100ms，固定AFG/2025-01/PV/admin2、limit1,000且命中即拒绝，无分页/重试/重定向。私有保存上限1MiB加64KiB控制文件，不删除旧资料腾空间；联系信息沿用私有指针且仅在请求头，不进入argv、日志、Git或远端artifact。

严格校验13字段、完整UTC月边界、source resource ID、源截止覆盖及45天采样时效；events须非负安全整数，fatalities允许null但不参与计算。行政code/name非空、有界、无控制字符，重复key、同码异名、同名多码及跨省复用district code拒绝。行政代码有效性仍只是源声明，不证明权威行政区全集。前后metadata一致也不证明事务快照。

真实执行前8项专项、dry-run和独立AI审阅通过。2026-09-16 04:23:01 UTC完成3请求全部200，共150,768字节/400原始行，sample398行/148,086字节，metadata各1行/1,341字节。返回34个admin1代码、398个admin2代码，来源as-of08-28、前后围栏一致。原始三响应私有保存、manifest绑定SHA256、receipt最后写入。随后 `npm run collect:acled-admin2 -- --review` 零网络复验为saved_candidate_verified。预算已用完，不再执行live；没有全国总量计算或生产写入。

`npm run review:acled-geography -- --admin2` 显式加载并复验独立档案，单列AFG/2025-01证据；来源日期不同则显示source_date_mismatch，损坏则失败，不用汇总回执代替原始验证。无参数不加载admin2，状态为not_loaded_for_review；全局admin0参考缺口、跨层互斥未验和禁止聚合保持。新增回归证明单国样本不能消除24代码参考缺口或升级globalCoverage/productionEligible。

本次证实AFG在该版本admin2具有返回记录，与分层发布的解释一致，但尚未证明admin0缺失原因或两层互斥；不证明34/398就是官方全集，不证明其它23参考国家也齐全，不把2025-01扩为四年。下一阶段仍需完整行政区/月份覆盖和跨层互斥方案、合法同版本原件及其它类别定义证据。任何扩大国家/月范围或新下载须新预算，不能把本次三请求改成常驻任务；四槽、ARR及周表生产流程不变。

## 多国二级行政区返回范围验收（2026-09-16）

Owner明确批准独立方案：固定2025年1月、political_violence、admin2，不设置country筛选，仅获取该层返回范围。最多3免费HAPI请求（metadata→sample→metadata）、累计8MiB/10,002原始行；sample limit10,000且命中即hold，每请求含正文15秒、开始间隔≥1,100ms，零重试/分页/重定向。8MiB是探索上限，不承诺能取得全层数据；不扩AFG一次、年度一次和四槽试行预算。

`npm run collect:acled-admin2-scope`默认dry-run不读档案或请求；`-- --live`先复验既有年度及AFG私有档案hash/schema，任一失败零网络停止。独立acled-admin2-scope-20260916目录原子占用，失败或中断也不重跑/换ID；仅在主checkout执行。联系资料仅请求头使用，不进入Git、argv或日志。快照验证完成时三响应与manifest私有保存，receipt最后写入，上限8MiB加64KiB控制文件，不删除旧资料；本次失败仅保存attempt/receipt。`-- --review`只离线复验，不读联系信息。

严格字段/资源/月份/层级/计数校验，null fatalities不补零；行政码与同名冲突按国家命名空间检查，跨国复用代码不相互合并。报告只列返回国家及有限24参考集的returned/notReturned，不将未返回认定为无事件、不被覆盖或全球缺失。少于limit也不证明行政全集。

跨档案比较使用完整可见版本tuple（as-of/sourceUpdatedAt/hapiUpdatedAt），不以相同as-of代替版本；不一致分别indeterminate，不静默跳过。相同版本下AFG按完整行政键双向核对全部验证字段（已验证月界格式规范化），新增/消失/身份或数值变化均comparison_hold，保存证据但不晋升。跨层仅检查该国家月在两层是否都返回；有交集不证明事件重复，无交集不证明长期互斥，禁止全国聚合/相加。任何结果productionEligible=false，原地理报告全球门槛及生产config/data/workflow不变。

10项离线专项覆盖正常多国、返回缺口、跨国代码碰撞、同国冲突、满limit、AFG双向变化、精确版本差异、坏基线零请求、HTTP/正文超时/累计超限、once/hash/链接目录及CLI。专项、dry-run和独立pre-live审阅通过后执行一次真实请求。

真实验收未通过：第2请求后reason=duplicate_row，2次HTTP200，共1,723,981字节/4,596原始行；metadata为1,341字节/1行，sample为1,722,640字节/4,595行。第3请求未发送，无重试；独立once已占用，不能把未用1请求用于重新下载或改筛选。失败回执留本地；当前实现拒绝无效snapshot，因此失败正文未保存，不能事后分析重复是否同值、冲突或上游映射问题，不据行数认定覆盖完整。未完成AFG双向及跨层比较，不新增国家覆盖结论，不修改旧候选、生产或观察任务。

后续应先设计“拒绝正文隔离取证”：严格限额内保存失败响应为不可晋升的私有quarantine，并输出脱敏重复键数量/完全相同与冲突分类，不去重后冒充通过；经独立审阅和新取证预算批准后再执行，不能重放此次已消耗once。此方案尚未实施或获得新下载批准。
