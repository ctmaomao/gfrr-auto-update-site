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
