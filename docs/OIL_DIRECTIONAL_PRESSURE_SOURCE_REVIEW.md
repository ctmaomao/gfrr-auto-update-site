# Oil Directional Pressure Model 油价方向压力研判 — Source Review（docs-only · source-review / feasibility）

> **STATUS（2026-06-04 更新）:** ODP PR1–PR5 已全部 merged（EIA 周度物理链接入 + 回测 GATE + classifier + 中文 UI + dailyBrief 只读引用,audit-only/display-only）。本文已从「feasibility / 拟实现」转为**已实现模块的 source-of-record / 历史记录**;下文 §0/§10/§12 的「若未来实现」「PR 拆分」「开工前必答」按当时计划保留作历史,实际状态以 backlog / `DATA_CONTRACT.md` / `DATA_SOURCES.md` 为准。硬边界不变:不进 scoring/decision/execution/position,Global Risk Heatmap 保持独立。

## 2026-11-17 接收快照用途边界（离线）

`brent-snapshot-use-boundary.mjs` 将前述用途限制变成可执行审查：必须重新提交原字节、计划和 receipt 并通过原校验器，不能拿调用方伪造的 summary/eligible 标志通行。用途只允许起点特征、起点训练标签、固定后验版本评估标签候选；起点与读取时刻不得晚于用途审查时刻。对特征/训练用途，接收晚于起点明确拒绝；即使接收早于起点，现有材料未认证来源时点、完整日历和标签构造，也不能自动准入。后验用途只标待独立审查，不提供训练许可或反向回填起点。 这是独立离线审查器，尚未接入拟合或生产入口，不能称系统级强制执行已完成。

复用已私有保存的 30 行新快照做离线时钟反例：历史起点 2026-11-01 与接收后起点 2026-11-17T03:00Z 分别审查三种用途，均不开放拟合或评估。前者 feature/training 明确含 `received_after_origin`；后者没有这个具体时钟冲突，但不等于资格通过。测试用时钟及调用方本机记录不是可信时间戳认证；此入口不构造收益/标签、不拟合、不证明完整依赖成熟。

未新增网络请求或具体后续采样安排，未改现有每日研究任务；前瞻数据链仍需在未来起点前固定来源版本、锚点/终点与缺失/修订/截止规则，再独立检查实际接收证据。不能把这种未来设计意向、后验候选或合成测试称为已冻结预测。v1/v2、公开概率和正式评分继续不变。

## 2026-11-17 新接收 Brent 短窗口快照（非历史首版）

在本次取数前于 `2026-11-17T02:53:46.372Z` 固定单次 FRED `DCOILBRENTEU` CSV 请求、观察窗口 2026-10-01 至 11-16、1 MiB/30 秒上限、不重试/重定向。实际请求 02:53:58.090Z 开始、02:54:03.288Z 接收，HTTP 200、564 bytes，SHA256 `7c85a0d0e74cc4c92316b31213e002dd3c740d55146ed7656d8657d9eaba6f72`。返回 30 个正数报价槽位、0 个显式缺失，首末日期 10-01 / 11-11；请求末端未返回，不能补齐、推断交易日历完整或据此排除尚未发布/漏报。HTTP Last-Modified 为 11-13 01:31:23 GMT，并不是报价首发时间。

[FRED 系列页](https://fred.stlouisfed.org/series/DCOILBRENTEU)有 Public Domain: Citation Requested 标签，建议署名 EIA/FRED；[EIA 复用说明](https://www.eia.gov/about/copyrights_reuse.php)的第三方材料例外仍适用，不能据此推广至其它报告价格。原 CSV、预先计划及接收记录仅在私有研究存证保存，公开仓库不存原始价格。本次是新版本身份，不恢复或冒充失踪的 ALFRED 原 CSV，也不改写其异常记录。

新增离线接收快照校验器仅核对声明、字节哈希与解析一致性，保留完整返回槽位；它不是服务器签名或时点真实性证明。该副本至早可作为本次接收之后的信息，不得当作 10 月历史起点可见特征或当时已经成熟的训练标签。它可以作为明确固定版本的后验结果候选，但尚未构造标签、收益或拟合；后验标签不解除训练/校准逐起点成熟和独立测试要求。研究输出与公开摘要隔离，公开摘要无价格；v1/v2 不变，evaluation/public probability/main-score 资格继续关闭。

## 2026-11-17 WPSR 文案更正与 EIA 数值类型隔离

[官方 2026-08-28 勘误](https://www.eia.gov/petroleum/supply/weekly/includes/revision-notice.php)说明 8 月 26 日 10:30 发布的摘要将馏分油库存减少 220 万桶写成增加，12:13 修正文案，表格正确。该案例不证明其它表或当前 API 有误；ODP 的 `WDISTUS1` 库存变化来自 API 数值差分，并不解析这段摘要。[官方日程](https://www.eia.gov/petroleum/supply/weekly/schedule.php)包含假日周四 12:00 的例外，常规周三 10:30 不能认证历史逐期首发时间；现有 16 日新鲜度容限也不是首发时钟。

代码审计另复现独立类型缺陷：`Number(null/false/[]/空白)` 变成 0、`Number(true)` 变成 1。压力与历史构建器现在共用严格周度投影，仅接收有限数值或十进制/科学计数数值字符串，保留真实 0。响应内任一行数值/日期不合法则整条 series 返回 `invalid_observation`，沿既有 missing 分支降级；不能先删掉异常中间行再把跨缺失差值称为一周变化。这是保守策略，旧历史中的缺失也可能令当前 series 不可用，未以补值或静默筛除换覆盖。它不认证响应未返回的缺失周、重复期或历史版本完整性。

离线模拟实际两条 fetch 路径并核验压力 evidence 的 missing/null 与真实零值；未调用 EIA、未改生产快照。检查时仓库快照（builtAt `2026-11-16T03:12:31.139Z`）8 个 EIA 当前值均为正常非零数值，不能据类型反例声称生产曾误算。单测/合并与后续自然运行验收分别记录，历史 builder 不随每日压力刷新执行。

## 2026-11-17 STEO 更正范围与时间反例

[2020-12-08 官方公告](https://www.eia.gov/outlooks/steo/archives/notice_data_12_08_2020.php) 明确更正档案中 2019-08 至 2020-11 期 Excel Table 7d part 2 的 C 列：2019 年相关期次涉及 2015-01，2020 年相关期次涉及 2016-01；data browser 与季度表未受此错误影响。它证实档案可追溯修改，但没有指称本次 2026 Table 3a 被改，也不能反过来证明其未改。本轮固定一个 URL、1 MiB 上限、30 秒、无重试/重定向取回 HTML，接收于 `2026-11-17T00:00:46.611246Z`，51,743 bytes，SHA256 `72d1c2723052dd905254588efea6293de424bb6fff5068ee6d70e172819a21e0`，未下载更多工作簿或价格。

旧公告页的共享顶栏显示当前 2026 年发行日期，正文却是 `Released: December 8, 2020`。新增离线 `steo_revision_notice.py` 只在 Notice 正文标题后的段落识别这份已审更正范围，并严格匹配四个规范化关键段落，不能仅靠月份关键词猜关联；多正文日期、缺日期、隐藏正文、错误列/月份、月份与期次对调、否定/冲突段落等保守拒绝，支持真实 HTML 的隐式段落关闭。不抓取、不写文件、不认证输入真实性。范围比较同时匹配期次、表、列、观察月与格式：范围外返回“不属于本公告范围，不证明没有其它修订”，不是 unaffected 或样本可用。合成回归单测及真实 HTML 调用分别核验；该工具不解析任意更正语义，也不建立完整更正链。

[发行日历](https://www.eia.gov/outlooks/steo/release_schedule.php) 仅说通常在 12:00–12:15 EDT/EST，允许提前发布、假日和其它调整；2026 年 10 月标有 Winter Fuels。不得由常规时段合成精确历史首发时刻，也不得忽略夏令时。上述公告的“约中午 Eastern”同样不是精确分钟证据。

另外三份官方正文展示不同证据等级（本轮只读网页，未纳入上述单份 parser）：[2020-03-18](https://www.eia.gov/outlooks/steo/archives/notice_data_03_18_2020.php) 记载 3 月 11 日首发的美国能源总消费 2019–2021 数值在 3 月 18 日约中午更正；[2025-12-18](https://www.eia.gov/outlooks/steo/archives/notice_data_12_18_2025.php) 只是计划下一期修正部分历史 Permian 区域归类；[2026-09-10](https://www.eia.gov/outlooks/steo/archives/notice_data_09_10_2026.php) 记载 Overview 裂解价差错误已改，但无精确更正时刻。这些是事件/计划证据，不是当前文件等同当时字节的证明，均不认证本次 Table 3a。

下一项真实实验仍可推进，但须区分目标：另立协议可预登记固定后验价格版本作为事后结果标签，特征与锚点只用发行时已知版本，训练/校准标签仍须在各预测起点前已成熟；预测起点后才可得的固定后验版本只能用于预登记事后评估，不能倒灌训练。这叫后验标签研究，不能改名为实时版本回测或可交易收益，也不改变 v1 初版标签要求。更强的前瞻路径是从实际接收起保留有限 EIA 自有供需字段及版本，特征快照先冻结、标签成熟后追加；价格数值保存权利需单独明确，哈希不能代替数值样本。更正清单应按字段记录实际发生/未来计划/未知，缺公告不得填“无修订”；计划中的日期不得当成已经发生。尚未执行新协议或计算真实收益。

## 2026-11-16 STEO 两期真实预测字段可行性

按固定两请求清单读取官方 [October workbook](https://www.eia.gov/outlooks/steo/archives/oct26_base.xlsx) 与 [November workbook](https://www.eia.gov/outlooks/steo/archives/nov26_base.xlsx)，每份上限 5 MiB、30 秒、零重试、不跟重定向；全部成功，无额外历史下载或价格收益计算。原始整本只留在本地研究存证，不入仓库或生产。下载前清单固定两份报告和物理供需范围，未预登记具体季度或单元格。随后仅核对相邻两期对同一未来 2027Q1 的供需预测字段，没有读取油价结果以挑选月份。

| 当前取得的官方副本 | Body received UTC | Bytes / SHA256 |
|---|---|---|
| October 2026 | 2026-11-16T23:23:50.582074Z | 1,098,385 / `54989362410da4aff5673580396380c3a8f4f111fa6d01c6d4fab05ef90efbf4` |
| November 2026 | 2026-11-16T23:23:54.141012Z | 1,096,645 / `7d28012ff726ebeafd584905d842ded42bb3c9922550cb26e005af9cd4e27fb5` |

两本 `3atab` 的 BK3/BK4/BL4/BM4 标识 2027 年 Jan/Feb/Mar，A6/A19 为 `papr_world` / `patc_world`，对应世界石油及其它液体燃料生产/消费，单位为 million barrels per day，不是仅原油。BK:BM 的第 6/19 行为本次 12 个数；第 10 行重复生产数，全部一致。B55 明示预测来自 EIA Short-Term Integrated Forecasting System；仅这些自有预测及派生摘要按 [EIA 署名重用政策](https://www.eia.gov/about/copyrights_reuse.php) 纳入研究，不据此放开其它表中的第三方价格或整本公开再分发。历史量与预测不能混同，表中历史/预测字体分界也只是近似说明；本次所选季度晚于两次发行日期。

| 2027Q1，按 31/28/31 日加权，million barrels per day | 10 月预测 | 11 月预测 | 11 月减 10 月 |
|---|---:|---:|---:|
| 世界生产 | 106.108737 | 105.997852 | -0.110885 |
| 世界消费 | 103.082608 | 102.819921 | -0.262687 |
| 生产减消费（本地派生） | 3.026129 | 3.177931 | +0.151803 |

以上仅六位展示，计算保留源数值精度。最后一行不是实测库存变化、缺口确认或油价预测。该差值修订已经是可计算候选特征，而非模型有效性的证据；两个发行点不足以训练或评估。

离线命令：`node scripts/oil-directional/steo-forecast-pair.mjs <oct26_base.xlsx> <nov26_base.xlsx>`。只读两个显式本地常规文件、校验固定 SHA/5 MiB 限额后使用 Python 标准库固定字节/XML helper 解析指定表（不新增 XLSX 导入）；无网络/输出文件/生产接线。严格匹配表题、年份、月份、期次、单位、来源、重复行，拒绝缺失、非有限/非数值、带公式的数值格和非正世界总量；日期/年份标签按固定副本的缓存值匹配，不执行公式。CLI stdout 只含限定字段及派生摘要，不泄露原始整本或价格。合成单测验证边界与数学；真实文件调用另行验证，不能相互替代。

**可用时点尚未通过**：[当前官方目录](https://www.eia.gov/outlooks/steo/outlook.php) 声明发行日为 2026-10-06 / 2026-11-10，表内 Forecast date 为 10-01 / 11-05；HTTP Last-Modified 又分别为 10-01 / 11-09，均不得替代公众可得时刻。当前副本哈希只认证本次字节身份，不认证历史初版/全修订链；目录的 [October notice](https://www.eia.gov/outlooks/steo/archives/notice_data_10_06_2026.php) 本轮网页读取返回 404。不得把 11-16 接收回填为 10 月或 11 月首发收据，也不得以缺 notice 猜测“无更正”。`firstPublicAvailabilityVerified`、`revisionHistoryComplete` 与所有评估/公开概率/主分资格始终 false。

下一步应沿独立新协议增加有发行与更正证据的原期供需样本，并单独解决可信价格标签。该脚本固定在两份已审副本，不自动泛化、下载更多期次、修改冻结 v1 或放行真实回测。扩大样本需预先声明固定清单/预算/异常处理；不能仅更换 SHA 将当前结果冒称完整历史验证。

## 2026-11-16 扩展研究路线：先取得可审计样本，再比较预测增量

本节为独立研究设计建议和公开元信息核验，不修改下文两个冻结协议，不解除 v1 数据拒绝，不实施新采集、拟合、主分或公开概率。已复核现有 case/model/evaluation 模块：时点构造、固定 ridge logistic、sigmoid 校准、配对评分与块区间已有合成测试；重复实现模型不是当前瓶颈。新的真实研究须另立版本，不能为取得结果暗改 v1 的价格版本、发行/锚点或分割。

### 目标与候选的优先顺序

| 优先 | 候选 / 免费路径 | 时点与历史证据门槛 | 可回答 / 不能回答 |
|---|---|---|---|
| 1 | 单一 Brent 现货价格及其滞后收益/波动，既有 EIA/FRED/ALFRED | ALFRED 异常原样隔离；独立新方案须事先定义不可靠时点处理、数据覆盖与共同评估集，不能删坏点后沿用 v1；当前值或报价日期不证明当时可知 | 首先验证是否超越简单基线；不能混入期货或声称可交易成交价 |
| 2 | EIA WPSR 自采物理量：库存、炼厂、进出口与 product supplied | 用具体发行批次及可用时刻，不用数据周；同日多报告整体处理，保留更正；不将最新 PSM/年度值倒灌 | 物理端增量候选；库存变化不是市场预期差，product supplied 不是终端消费实测 |
| 3 | EIA STEO 原期报告的供需预测及预测修订 | 官方档案有逐期 PDF/XLS 与发行日，但需逐文件/字段核验版本、更正、单位与权利；只采用发行后已知的预测，不用后来实现值 | 中期供需预期候选；不能把预测当事实或每日独立新信号 |
| 4 | 同一 Brent 产品各到期合约的曲线横截面、现货价差、持仓 | 先证明免费历史使用权、同一时刻各到期合约和滚动规则；当前代理/连续合约不能还原历史曲线 | 期限结构有经济含义，但不是上涨概率；缺乏合规完整数据时跳过而非付费/爬受限源 |
| 5 | CFTC COT、已有宏观价格/美元/利率 | COT 仓位日不是公布日，年度文件未证明历史初版；须区分具体合约、交易所和分类；宏观用 vintage/真实发行日 | 定位/金融条件增量；不同市场、净仓位和油价因果不能等同 |
| 6 | PortWatch、卫星 FIRMS、新闻事件 | 仅从真实接收开始前瞻留痕，保留缺测/停源/修订与许可；旧当前API历史不能回填为当时可得 | 可测试扰动/波动增量，不预设方向；贸易量估计不等于可用运力，火点不等于产量或停产 |

先固定一组小模型：无信息/训练期上涨频率基线、末值随机游走配合训练期经验增量分布、既有 price-only logistic，再一次只添加一个物理量或预期特征组。简单波动基线可用训练期常方差或预登记 EWMA；之后才考虑 GARCH、正则化多变量/混频或树模型。复杂模型及更多特征是待比较的假设，不是自动改进。将价格水平、方向概率、区间/波动、极端变化概率分开登记与评分；波动成功不能冒充方向成功。不得用月平均价格间方向替代从预测时可用价格起算的日度目标；若另研究月均，必须单独命名并使用同目标基线。冻结 v1 的未来锚点目标原样保留。

### 本轮新增的官方证据与限制

- [EIA 对 WPSR/PSM 的说明](https://www.eia.gov/tools/faqs/faq.php?id=1398&t=6)：WPSR 为抽样近端估计，product supplied 的周变动受抽样、计量及通关时间影响；官方建议观察四周均值。通常不修订不等于不可修订，重大错误、遗漏或自然灾害属于例外。PSM 的覆盖和发布时间不同，不能用后来的月度/年度统计修写历史周度信息集。本段仅确认统计政策，不证明任何历史文件的初版身份。
- [STEO 官方档案](https://www.eia.gov/outlooks/steo/outlook.php) 本轮页面明确列出 2026 年 11 月报告的完成日为 11 月 5 日、发行日为 11 月 10 日，并提供历期报告和数据表。完成日不是公众可得日；档案可见性不证明文件不可变，也未认证整段历史。下一项有界数据可行性工作宜比较预先指定的两期报告：只检验相同目标季度的 EIA 自有供需预测、发行日期与更正说明，不先看价格收益或挑选有利月份。
- [CFTC 当前报告说明](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) 描述通常周五发布周二仓位；[2026-10-27 公告](https://www.cftc.gov/PressRoom/PressReleases/9316-26) 则宣布计划年底改为每周两次。计划不证明已执行；研究必须绑定实际历史发布日历及变更生效证据，不能永久硬编码“周二加三天”。本轮未获取 COT 原始历史。
- [EIA 重用政策](https://www.eia.gov/about/copyrights_reuse.php) 允许署名重用政府内容，但明确保留第三方保护材料例外。优先审查 EIA 自采物理量/自有预测；这不自动准许再分发 WPSR 中的 Reuters 价格、ICE/Baltic 数据或原始 AIS。数据免费可读、可自动化、可长期私存和可公开再分发须分别登记。

### 新协议必须预登记的检验门槛

1. 固定品种、价格版本、单位、发行时刻、锚点、期限、持平处理及真正可观测标签。分别存 observation / official release / received / revision / label-mature 时钟；日期粒度不得冒充精确分钟。未知时点不能被默认滞后“修好”。
2. 在真实收益计算前冻结数据质量规则、来源请求与存储预算、特征列表、候选模型/超参数上限、时间分割、指标、最小有效样本量、增量阈值/区间方法和失败标准。已有研究暴露过的数据不叫全新盲测；另外锁定今后真正前瞻样本。
3. 只按时间前推；标准化、特征选择、季节调整、超参和校准均只看过去。训练样本标签成熟后才能入模；重叠期限按标签跨度 purge，并对相关性使用预登记块区间。不同模型比较同一有效样本，另报各自拒绝率，避免复杂模型通过丢弃难样本获胜。
4. 方向主报配对 Brier/log loss、校准和区间，不只命中率/AUC；区间报覆盖与宽度，波动报预登记损失。训练频率、50%及经验分布基线均保留；分时期与压力期稳定性、数据缺失敏感性及逐组消融全部报告，不择优。多个候选/期限需控制多重比较或明确只属探索。
5. 若增量不稳定、校准失效或独立样本不足，输出“没有可信方向优势”，同时可独立展示经过验证的波动/风险信息。任何公开概率资格另行评审；本节没有计算真实样本、收益、准确率或预测。

## 2026-11-16 前瞻概率研究：冻结协议与数据拒绝

独立研究协议 [`brent-spot-release-direction-v1`](../config/brent-spot-release-direction-protocol.json) 于 `2026-11-16T00:56:22.285Z` 在完整历史导出与任何真实收益/模型结果计算前冻结，文件 SHA256 `2bc3f54ccda10efe2c72ea734d6dbbd6d130fcd5a606491e136fccf6236757e3`。目标为 EIA/FRED `DCOILBRENTEU` 日度现货，不混合期货、不把稀疏站点快照当日历；主目标是发行后第一个有效报价起的 5 个有效报价变化间隔，上涨的补集包括持平，不称为下跌概率。

`brent-release-study-cases.mjs` 仅构造离线研究样本：同一初次可用批次只发行一次，特征截止批次日 D，保守发行时点为 D+2 UTC；严格未来起点、首次发布价格、标签双时点成熟及跨阶段清洗分开核验。输入来源真实性和报价日历完整性不能由纯函数证明，保持 false；数值/日期/同日报价冲突整体拒绝，不静默删除或假定固定滞后。合成回归通过不代表真实预测能力，任何研究输出均不接前台、ODP 或主评分。

数学模块采用固定 train-only 缩放、ridge logistic 与 sigmoid 校准；评估入口从同一 case 构造器生成各期限样本，再计算同样本基线、Brier/logloss、可靠性分箱和移动块区间。当前入口仅接受显式 synthetic fixture 声明，无真实文件读取或运行接线；声明不是输入真实性认证。冻结协议未指定的伪随机实现于查看真实结果前固定为 `mulberry32`；主块长 8、敏感性块长 4/12 均保留，不能择优。次要 1/20 期限采用与主期限相同的保守样本/类别数量门槛，不能挽救主期限失败；这两项工程解释不修改冻结协议原字节。实现正确不等于预测有效，公开概率资格始终为 false。

[ALFRED 官方导出](https://alfred.stlouisfed.org/series?seid=DCOILBRENTEU) 的 Initial Release Only 两个有界分片合并得到 4043 行（其中 72 行缺值），807 个初次可用日；合并原样 CSV 为 117,966 bytes，SHA256 `2ce37cac2ac2ef4f70c7fbfd672c61109078d570298b45784639da19a61d59b8`。这不是 1987 年起的完整历史，实际报价从 2011-04-06 起；日度报价不等于每天独立发行。未计算真实收益或拟合结果。

**v1 真实研究被数据门槛阻止**：报价日 `2012-12-27` 的初次可用日标为 `2012-12-26`。另一次官方 All Observations 窄范围导出确认 12/26 与 12/27 两个 vintage 都含该报价，原 ZIP SHA256 `afea907c78722cbcb96069b547d1266830e3a43cb3985c35d28699db60704254`，获取于 `2026-11-16T01:05:17.750Z`。日粒度档案不能证明异常由时区造成或确定真实可用日；保留原始证据，不加一天、不删点、不用最新修订覆盖。后续若另立协议，必须显式预注册质量规则、依赖隔离和独立确认集，不能绕过 v1 冻结规则恢复拟合。原始下载留在研究存证中，不作为生产数据入仓库。

**2026-11-18 同一异常的版本边界复核（未计算收益）**：[ALFRED 指定日期 CSV](https://alfred.stlouisfed.org/graph/alfredgraph.csv?id=DCOILBRENTEU&vintage_date=2012-12-25&cosd=2012-12-27&coed=2012-12-27) 固定序列及目标日，仅将 `vintage_date` 依次设为 2012-12-25、26、27。三份返回的列名分别确认相应版本。25 日版未含目标行（接口实际返回 6492 行，末行为 12 月 17 日）；26、27 日版各含一行，均为 12 月 27 日且报价相同。三份 CSV 的 SHA256 按版本顺序为 `dd9eab912a5ab9f6f9f23e4118d77ef48b9fe26558f025c9ad76b1fa6d45aacb`、`a14d7811a298b96e84075cebb86c0359ade239851140da5c5ddebc987d80f986`、`706e722accbf0b371694eb1eff4df80562f7eff325fc811883aaf6cea772adf5`。新增的 25 日阴性对照仅界定当前档案版本所示差异；这些新取得的 CSV 不是原 ZIP，也不能证明当年实际公开时间。v1 仍停在数据门槛，不删点、改日或启动拟合。

## 2026-11-17 v2 草稿：固定合成依赖图质量隔离

2026-11-17 在可访问云工作区、桌面相关研究/下载目录、Library 相关检索与原研究 PR 的 CI artifact 中，未寻回上述 SHA 的原始 CSV/ZIP；这不是对所有磁盘或隐藏缓存的穷尽证明。已记录摘要不等于可恢复原始数据，本轮不以其它下载冒充同一存证。后续若重新获取，须记录新的请求、接收、哈希与覆盖身份。

独立 [v2 draft](../config/brent-spot-release-direction-v2-draft.json) 只预备异常隔离研究，限定实现已独审、协议尚未冻结，不替代或修改 v1。已知 ALFRED 异常是设计动机，不能声称完全未受数据认知影响。`brent-v2-quality-graph.mjs` 只审调用方声明的合成槽位/依赖图：保留全部声明 availability batches，每批次固定 1/5/20 三个候选；这个网格是候选超集，**未认证 v1 的 latest-quote-advance 发行选择**。不采集、读取真实序列、计算收益、拟合或生成概率。

图内21点特征、anchor、endpoint 与 h+1 固定路径不因异常隔离重排。日期/身份无法定位、重复冲突、schema/引用不合法全局停止；可定位非正/非有限价格、unknown/quarantined 与 availability 早于 quote 标记依赖污染。anchor 至 endpoint 的全部原始日期槽位（包括未选路径的 null）自动纳入区间依赖；当前/此前 latest、窗口与 anchor 选择依赖由调用方声明，未选但可能影响选择的成员不能因遗漏声明而被认为不存在。未知 closure 不可用，label 成熟与跨阶段 purge 包括全部声明标签依赖和区间 availability+2及closure。缺失不是零，source-null 不被改造成价格或偷偷补点。

输出 `syntheticGraphQualityPass` 仅表示声明图通过有限一致性/质量规则；依赖完整性、真实case构造、时点真实性、evaluation/public/main-score 资格均为 false。按年份/阶段/horizon报告原始候选与图内通过数、可重叠拒绝原因；过滤不解决选择偏差，不能推广至被排除阶段或证明剩余时点正确。v1 的模型数值/分割/最低样本规则保持，草稿提议将未校准完整logistic纳入同样本正式强基线比较，尚未执行。真实入口继续关闭，后续须独立审核来源权利、首版与可用时点、完整原始网格及所有选择依赖；目前只完成合成工程增量。

## 2026-11-16 官方 HTML 元信息解析（离线研究）

`wpsr_html_metadata.py` 只接收内存中的 HTML 原字节及调用方提供的 receipt，不含网络、文件采集或模型入口。先核原字节长度/SHA256，再严格 UTF-8 解码，保留 CRLF 与原始字节定位；调用方 receipt 一致不等于网络真实性或历史不可变性。真实 HTML 不放入代码仓库，测试只用合成片段；Node 测试桥运行 Python 标准库测试，不新增第三方依赖。

目录日期来自可见年份标题、月份及发行/数据周列，不从 section ID 或 URL 推断。月份上下文也必须来自闭合、非隐藏且受支持的完整行；无效中间行会清空继承月份，不能把该行的月份借给后续空月份行。年份标题未闭合时亦不建立年份上下文。相同发行日保留不同成员；只有无歧义完整五格、合法列型和结束标签的缺起始 tr 情形才显式恢复并保存证据定位。隐藏内容、跨度或结构歧义、重复 URL 日期冲突不能晋升为合格记录。这里检查静态隐藏标记及继承语义，不认证外部 CSS 的实际渲染。现代 issue 读取页面明确的发行/数据周段落和唯一官方 HTTPS Table11 href，与索引矛盾时拒绝。旧模板仅在唯一非隐藏 td.update 明确给出 Released 日期时保留部分证据：页面数据周为 null、数据周来源为 index_only、双日期一致性仍为 false；不能借此解除原抓取批次的失败状态。同名同值重复属性可兼容，冲突属性及隐藏守卫不放松。链接只按 receipt URL 解析；遇到带 href 的 base 元素，整个文档以 unsupported document base href 拒绝，不能忽略文档基准后构造错误的官方链接。空值、隐藏或可能无效的 base 亦保守拒绝，这是兼容性限制，不声称它们均会改变浏览器链接；仅 target 的 base 不改变 URL，仍支持。notice 仅提取可见 p 元素，覆盖完整性保持 false，空列表不等于没有公告；不自动推断 Brent 修订、日内顺序或发布完整性。

输出是当前保存页面的元信息，不是同期首发存证。当前目录、历史发布/修订、实际首次可用、真实性及公开概率/主分资格保持 false；不改变已冻结的合成协议或 ALFRED v1 拒绝结论。后续获取必须另列固定请求清单、真实墙钟截止、节流/字节/存储预算及失败停机与续跑规则，不能让解析器自动追踪链接或因已有目录映射就下载全史。

链接基准修复另经两次官方 HTML 请求做旧/新 parser 等价核验：单响应上限 1 MiB、总上限 2 MiB、15 秒超时、不重试/重定向，原 HTML 仅在内存中处理，不下载 PDF/价格。2026-11-16T18:48:10Z 当前目录为 175,706 bytes、SHA256 `e7bcbd1fffe59a67435219776d5751600126baa5bd8bbc2e5ebb4fb3f2582ddf`，新旧均解析 798 条、0 隔离；18:48:14Z 上述 2023-11-15 issue 为 67,057 bytes、SHA256 `26d3b8dae64c770ccecdf8768334e82a7dee9e82b41d594cfc0282709a59cd38`，新旧完整输出一致且不隔离。两个当前响应只能证明这两份格式兼容，不能推广为全部历史格式；哈希与前次不同也不自动证明价格修订。

## 2026-11-16 官方发行元信息：有界真实验收

在 `5c341ab0` 的离线 parser 上，12:04:46–12:04:59 UTC 执行了一个固定五页批次（下表）：逐页最多 1 MiB、批次最多 2 MiB、请求超时 15 秒、每次开始请求前检查批次已耗时不超过 100 秒（不是响应中的强制中断）、逐页间隔 1 秒；不重试、不跟随重定向、不递归链接。本批次实际五次 HTTP 200，共 439,791 bytes；只在内存中处理 HTML，未保存/发布原 HTML、下载 PDF/CSV 或取得价格序列。下表哈希为当次原始响应字节 SHA256，不证明页面历史不可变。

| 官方页面 | bytes | 原始响应 SHA256 | 当前页面元信息结果 |
|---|---:|---|---|
| [目录](https://www.eia.gov/petroleum/supply/weekly/archive/) | 175671 | `f1add7f69352d5183113a2ddca9a1e98994ded54f4a086a387d19c42109010f1` | 798 条映射、0 条隔离；只表明当次可见链接映射完整 |
| [2022-06-17 数据周](https://www.eia.gov/petroleum/supply/weekly/archive/2022/2022_06_17_data/wpsr_2022_06_17_data.php) | 65710 | `f2ce320acff7d2e69f2ac3f15d33c47a8ea98843ed779a6b2f506fe7448622c4` | 发行日 2022-06-29 |
| [2022-06-24 数据周](https://www.eia.gov/petroleum/supply/weekly/archive/2022/2022_06_29/wpsr_2022_06_29.php) | 65787 | `db42dc40cb59ba53b0c4a29af561048fbb02d8e679efce310ea9fb50d1472fd1` | 发行日 2022-06-29 |
| [2023-11-03 数据周](https://www.eia.gov/petroleum/supply/weekly/archive/2023/2023_11_03_data/wpsr_2023_11_03_data.php) | 65601 | `e3b314e0e3e9a33b470e9c0885fa532be5349eff4137d34ef21cb4aecfd59c11` | 发行日 2023-11-15 |
| [2023-11-10 数据周](https://www.eia.gov/petroleum/supply/weekly/archive/2023/2023_11_15/wpsr_2023_11_15.php) | 67022 | `f9c209f7c02ac766673e06a6ed07243674097794a302c0fc4d33ef6d002c82ee` | 发行日 2023-11-15 |

四份 issue 的页面明确日期均与目录相符，`indexDatesAgree=true`、`quarantined=false`。这是真实 HTML 元信息解析验收，不是历史模型验收。两个发行日各包含两份不同数据周的报告，不能计成四个独立发行时点，也不能用 URL 的数据周日期或常规周历回填可用时间。另经网页核对的 [EIA 2022-06-29 公告](https://www.eia.gov/pressroom/releases/press507.php)说明数据中心硬件故障后的恢复过程中，当晨发布两周 WPSR；这份公告未计入上述五请求批次，也未由该 parser 处理。

四页均保留 `eligibleForEvaluation=false` 与 `inputAuthenticityVerified=false`；目录的历史发布/修订完整性仍未认证。当前获取、页面声称的报告发行日和报价原始首发日是不同证据，不相互替代。2023 年追加的第二个延期案例支持按报告批次验证可用时点，而非假定固定滞后；它不修复 ALFRED v1 的异常、不开放真实拟合或公开概率。下一步仍需在独立 WPSR 方案下核验报告内价格布局、同日成员完整性及版本证据，不能直接把这四页转换为可训练样本。

## 2026-11-16 同日报告价格布局与图像来源核验

本次另行有界可行性核验于 `2026-11-16T12:50Z` 读取上述两份 2023 issue HTML，再各读取其唯一 Table11 PDF：四次 HTTP 200，共 308,846 bytes，单响应上限 1 MiB、总上限 2 MiB、单请求 15 秒、不重试/重定向；每次请求前检查批次已耗时不超过 90 秒（非响应中的强制中断）。两份 HTML 哈希与前表一致。PDF 仅临时本地渲染、文本及元数据比对，原文和价格序列不入仓库；不改变零下载的合成协议。

| 当前官方副本 | bytes | 原始响应 SHA256 | 接收时间 UTC |
|---|---:|---|---|
| [11/03 数据周 Table11](https://www.eia.gov/petroleum/supply/weekly/archive/2023/2023_11_03_data/pdf/table11.pdf) | 91014 | `99b0b3618fa580a62bed1153fa037c0f58e770846cdaa7b160a16e417fc4ccaf` | 2026-11-16T12:50:04Z |
| [11/10 数据周 Table11](https://www.eia.gov/petroleum/supply/weekly/archive/2023/2023_11_15/pdf/table11.pdf) | 85209 | `bfe52259897d0470fa2855593fc660d202bc12ab13ab524d929988745f08829a` | 2026-11-16T12:50:12Z |

图像与文本独立复核一致：上部是月均价，下部前两列是周均价，之后才是十个日价列；不能用首个 Brent 行或固定整行数字数组作为日价。两份日价覆盖 10/23–11/03、10/30–11/10，五个重叠日期的 Brent 数值在当前副本中相同，合计 **15 个去重报价日期**，不是 20 个样本，亦不暗示统计独立性。两份 issue 页面均称 11/15 发行，不能计成两个发行日期。11/10 的 WTI 缺失而 Brent 有值，缺失必须按品种识别，不能共享缺失掩码或转成零。

原始 PDF CreationDate 分别为 `D:20231109172442-05'00'`、`D:20231115125535-05'00'`；第一份早于页面声明的发行日，再次否定以文件创建日替代公开可用日。当前副本的重叠一致性不证明历史初版、不可变性、修订完整性或首次公众可得时刻，也不修复 ALFRED v1。没有计算收益、模型或概率；尚不足以实施通用价格解析器或构造真实训练样本。

另用两次请求读取 11/15 issue 与其明确链接的[来源说明](https://www.eia.gov/petroleum/supply/weekly/archive/2023/2023_11_15/pdf/sources.pdf)，来源 PDF 于 `2026-11-16T12:53:21Z` 接收，124,763 bytes，SHA256 `192ae64cc49d700d5fc8b05214fd472ce63812c4a6a28b40391ff7305629ba29`。印刷页 29 的 Table11 来源为 **THOMSON REUTERS 图像标识**；纯文本抽取只剩空 bullet，不能解释为无第三方来源。标识本身也不确定完整许可条款。[EIA 使用政策](https://www.eia.gov/about/copyrights_reuse.php)对第三方材料另有权利保留；本文后部早期“EIA 公共领域”概括不能扩展为这类价格序列的再分发许可。后续仍需独立核验版本与来源权利，不公开原始序列、不使用付费来源、不开放真实拟合。

## 2026-11-16 WPSR 独立合成时点验证

[`brent-spot-wpsr-report-asof-synthetic-v1`](../config/wpsr-report-asof-synthetic-protocol.json) 于 `2026-11-16T01:54:07.283Z` 经独审后冻结，SHA256 `6b6336acd1ed4cc2b77eec2ff2d99e757a0cabdd5b75c38cbf6203f8d7f408de`。仅允许合成输入、同日批次与时点验证，不生成真实预测样本、收益或模型；新增请求/下载上限为零。它不替代 ALFRED v1，不把报告出现日塞入 v1 初版可用日期，也不授予原始序列上传或持久化权限。

`wpsr-report-timing-fixtures.mjs` 校验固定 manifest 成员、缺成员/同日冲突整批隔离、numeric/source-null/unknown/quarantine 四状态，以及显式依赖路径的支持闭合（closure）。未知或隔离不能按 null 跳过；来源 null 后来变为 numeric 导致路径变化时不能事后重排。closure 必须有可知时间，标签成熟取两端报告日期 D+2 与 closureKnownAt 的最大值；未来闭合不能追认早期特征或穿过训练/校准边界。日期粒度 D 的特征截止按 UTC 日终解释，仍须在发行/as-of 之前；不认证实际发布时间。

显式 `syntheticKnownAtUTC` 与获取时间、官方报告日期及 closure 时间分离；as-of 资格只使用当时已知的报告，未来成员或 null→numeric 变化只进入独立事后审计，不回灌过去结果。这是合成知识时钟，不认证真实历史时点。

同日两份报告只是一批，文件日期和 HTTP Last-Modified 不决定发行时间。七份官方 Table11 样本只支持布局与反例：2022 一份 PDF 元数据为 06/28、官方发行日为 06/29，证明不可使用元数据捷径；2013-01-04 报告中的 2012-12-27 报价不证明原始初发，也不能修补 v1。当前目录、历史发布/修订完整性均未认证。合成调用者声明和显式路径不能证明真正 anchor、完整观察网格或来源真实性；输出只标 synthetic timing 资格，caseConstructionVerified 与公开/主分资格为 false。真实七报告可行性审计须另行有界验证，不能直接将此合成接口晋升为完整历史模型。

## 2026-11-16 脱敏接收元信息：默认关闭接缝

`realtime/brent-receipt-metadata.mjs` 和 `run-realtime.mjs` 的 Brent-only 观察接缝，可在现有 DCOILBRENTEU API/CSV 请求完成后生成有界元信息。默认 observer 为 null，没有 CLI/env 启用、workflow 接入、写盘、上传或持久账本；因此目前**没有自然采集或长期前瞻样本**。生产请求、重试、fallback、parser 与 payload 不因这个默认关闭的接缝改变；模拟网络下验证真实 fetchRows 控制流，不冒称完整线上产物已验收。

元信息仅含白名单 UTC/HTTP/transport、解码后文本 SHA256、字节及解析计数；不保存原文、URL、密钥、异常正文或 quoteDate/value 序列。`decodedResponseTextSha256` 不是原始 wire bytes 哈希。四次尝试、32 KiB 文本解析和 64 行上限只约束研究处理，不限制既有网络 body 读取；超限/无效日期/冲突/缺失不会改生产取数。观察器 throw/reject/永不完成的 Promise 不等待，首次提供方发布与跨轮 firstSeen 均未知；捕获完成不等于来源完整、数据合格或可预测。

现有原始历史序列上传禁令保持。元信息 hash 无法恢复价格或计算标签，7 天 artifact 也不是长期账本；公开 Git 分支属于公开保存。持久研究需要另审字段最小化、来源许可、保存目的地、并发/缺口和首次接收不可后填规则，不得以这次接缝合并替代准入。

## 2026-11-16 研究隔离补充：季度结构参考

`eia-structural-reference.mjs` 固定保存 [EIA Global Energy Security Data](https://www.eia.gov/outlooks/steo/report/energysecurity/article.php) 的 10 个已核对单元，仅作研究口径与冲突回归，不是全球完整目录、实时油流、权重、断供估计或油价预测。它不取数、不改 ODP、前台或评分；PortWatch 仍是已有来源，不能再算独立新增证据。

原始页面于 `2026-11-16T00:29:31.053Z` 一次性获取，78,814 bytes，SHA256 `812535df648559d204165128b3f5f8835c8aab846107feb082670b80d998bd85`；原 HTML 不入仓库。专题日期为 2026-08-12，外层 STEO 日期为 2026-11-10。当前页面没有证明每个单元在专题日期已经可见，故 `sourceVintageVerified=false`、`historicalAsOfEligible=false`；本数据集首次获取不是提供方原始发布时间。

保留表题、表号、原行列与原值、单位、产品、地理和季度起止。Suez+SUMED 不映射为 Suez，Dardanelles 不映射为 Bosporus；LNG 行单位与原油不同，`-` 保留 null 且不猜含义。Hormuz 总分差仅在明示“最近 0.1 舍入”假设下兼容，不能修写原值。Malacca 2025Q4 的表2总量24.9、表3总量24.0及18.0+6.9全部保留，冲突不静默择一；跨表产品口径等价尚未验证。固定来源比较拒绝篡改 locator/raw value 后冒用快照身份；合成算术测试独立标识。所有评价/主评分资格保持 false，后续历史概率研究不得将这些当前季度参考倒灌为当时已知特征。

---

> **Source-review / feasibility only。** 本文为可行性审计 + 数据可得性核验 + 模型设计 + 实施拆分的登记文档,**不写 fetcher、不接 runtime、不改 `data/*.json`、不改 frontend、不触发 GitHub Actions、不进 scoring/decision/execution/position**。
> **候选模块命名**:**Oil Directional Pressure Model**(内部代号 ODP),中文显示名「油价方向压力研判」。若未来实现,**必为 audit-only / display-only 的独立能源专题**。
> **Global Risk Heatmap 必须保持独立**——ODP 与其并列,不得合并、挤占或破坏它。
> 沿用 `BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md` / `CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md` 模板与边界纪律。

调研/裁决日期:2026-06-03。流程:Codex 只读审计 → Claude 交叉验证(代码级核 + EIA dnav live 核验)→ owner 终裁(2026-06-03):数据源优先级 / 落点 / PR 拆分已裁;**取数架构 = A-first**(EIA API v2 JSON,零依赖)—— PR1 先过 EIA API route discovery 硬 gate,**B 仅 fallback / manual seed**(见 §9/§12)。本文**不批准** live fetch、不写生产数据、不改 scoring。

---

## 0. 模块定位与硬边界

ODP 的目标**不是预测绝对油价点位**,而是判断当前原油价格更偏向哪种方向压力(强看涨 / 温和看涨 / 中性震荡 / 偏空 / 假性下跌但物理压力仍强 / 假性上涨但缺数据确认 / 成品油压力主导)。核心是**数据链条**(库存降速 → 柴油/馏分油 → 期限结构 → 炼厂开工 → SPR 缓冲),地缘风险仅辅助。

**硬边界**(与 World Order Stress overlay 同范式,见 `CLAUDE.md` 绝对规则 3「overlay 不是第七个底层风险模块」):

- **不接入** `scoring` / `decisionModel` / `executionLock` / `positionGuidance` / `Action Queue` / `Trigger Monitor` / `Invalidation Rules`。
- **不进** `values.*` / `displayInputsBaseline` / `effectiveDisplayInputs` / cross-validation matrix。
- **不并入、不挤占 Global Risk Heatmap**;ODP 是六大底层风险模块**之后**的独立能源专题。
- 公开公告级 / 周报级数据 ≠ 逐机构 / 逐笔 raw tape;字段名 / 前端文案 / notes 不得暗示替代关系。

---

## 1. 复用 vs 新增（"凡现有管道已能覆盖的必须复用,不得重复造轮子"）

### 1.1 复用现有 in-repo 字段（零新 fetch）

| ODP 需要 | 复用现有字段 | 现有来源（已验证） | 复用方式 |
|---|---|---|---|
| WTI 市场代理 | `macroDrivers.inflationEnergy.wtiMarketProxy` 优先;缺失/过期回退 `macroDrivers.inflationEnergy.wti` | Yahoo `CL=F` WTI futures 快速代理;FRED `DCOILWTICO` 官方 WTI spot 作低噪声滞后 fallback | ODP build 读已构建的 `radar-data.json` 快照,不重抓;proxy 不是官方 spot |
| Brent 现货 | `values.brent` / `brentPricingLayer.selectedBrent` | FRED `DCOILBRENTEU` + Yahoo `BZ=F` + TE promotion gate | 同上 |
| 柴油裂解价差 | `brentPricingLayer.crackSpread` | FRED `DHOILNYH` × 42 − Brent | 同上 — ⚠️ **这是价格/利润代理,不是馏分油库存**;库存走 §1.2 `WDISTUS1` |
| 期限结构 backwardation/contango | `brentPricingLayer.futuresPriceCurve.{slopeRegime, frontMinusBack, contracts[]}` | Yahoo `BZ` 月度期货代理（**已有,低置信**） | 复用;M1-M2 / M1-M6 可从 `contracts[]` 逐月价**派生**(仍低置信);缺则该信号降级"不参与裁决" |

> `macroDrivers.inflationEnergy` 已是一个 display-only 能源层（其 source note 即「tone 仅展示,不进 scoring/decision/execution/position」）——ODP 是它的天然兄弟,边界范式现成。

### 1.2 新增数据（EIA dnav 周度物理链 — 2026-06-03 live 核验确认）

dnav 模式:XLS = `eia.gov/dnav/pet/hist_xls/<ID>w.xls` · HTML = `eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=<ID>&f=W`

| ODP 指标 | dnav series ID | 确认标题 | 单位 | 频率 | 史起 | 喂给信号 |
|---|---|---|---|---|---|---|
| 商业原油库存 ex-SPR | `WCESTUS1` | Weekly U.S. Ending Stocks excluding SPR of Crude Oil | 千桶 | 周 | 1982-08 | inventoryDrawPressure |
| SPR 原油库存 | `WCSSTUS1` | Weekly U.S. Ending Stocks of Crude Oil in SPR | 千桶 | 周 | 1982-08 | sprBufferEffectiveness |
| 馏分油库存 | `WDISTUS1` | Weekly U.S. Ending Stocks of Distillate Fuel Oil | 千桶 | 周 | 1982-08 | dieselProductStress |
| 炼厂开工率 | `WPULEUS3` | Weekly U.S. Percent Utilization of Refinery Operable Capacity | % | 周 | 1990-11 | refineryConfirmation |
| 炼厂原油净投入 | `WCRRIUS2` | Weekly U.S. Refiner Net Input of Crude Oil | 千桶/日 | 周 | 1982-08 | refineryConfirmation |
| 汽油库存 | `WGTSTUS1` | Weekly U.S. Ending Stocks of Total Gasoline | 千桶 | 周 | 1990-01 | 成品油压力（辅） |
| 汽油 product supplied | `WGFUPUS2` | Weekly U.S. Product Supplied of Finished Motor Gasoline | 千桶/日 | 周 | — | demandDestructionRisk |
| 馏分油 product supplied | `WDIUPUS2` | Weekly U.S. Product Supplied of Distillate Fuel Oil | 千桶/日 | 周 | 1991-02 | demandDestructionRisk |

- **8 个系列全部存在、单位/频率/标题已 live 确认;EIA dnav WebFetch 可达**(对比:FRED 官网对抓取工具返 403)。
- **单位是「千桶」/「千桶/日」/「%」——不是「百万桶」**。原始需求结构里若写 `million barrels` 须改为 EIA 实际口径(千桶),否则单位 check 与真实数据对不上。
- **days-of-supply** 不需单独 series:用 `WCESTUS1 ÷ WCRRIUS2` 派生。
- 史起 1982–1991 → 2020 / 2022 / 2023-24 回测数据充分(见 §6)。

---

<a id="dnav-bounded-cohort-fallback"></a>

## 2. 数据源可得性裁决（D 级:期限结构单独标注难度）

**2026-11-27 窄范围替代**：下方通用 HTML 最新行不可信的结论保留；依据 owner 要求完善 GFRR 自动备用取数，仅替代下方及 §9、§12、§13 的 HTML 元数据限制中「已批准 EIA 的 §1.2 八个固定系列、ODP 整批备用」这一部分，维持 owner 2026-06-03 的 A-first 与 XLS 限制。仍先用 API；仅按[官方发布时间表](https://www.eia.gov/petroleum/supply/weekly/schedule.php)中代码明确列出的已发布期次，在 API 未对齐时尝试一次。同一周及发布日期、身份与单位、连续 14 周及五年参照均须匹配；任何重叠值不一致或任一系列失败时保留原 API 路径。 [托管实测](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/45942745288)取齐 11/20 八项；[历史证据](PROJECT_BACKLOG.md#active-worktable)不当作实时版本一致性证明。2027-01-06 15:30 UTC 到期停用，待重新核对日历；不扩展 XLS、历史回填、Brent 条件或主评分。

| 源 | 免费 | 稳定 | 需 key | 频率 | 裁决 |
|---|---|---|---|---|---|
| **EIA Open Data API v2**(物理链,JSON) | ✅ | ✅ | ✅ 需免费 key | 周(WPSR) | **CI 自动首选**:JSON 零依赖解析,可在 GitHub Actions 直接写 `data/`(ADR-0013 clean) |
| **EIA dnav XLS**(物理链) | ✅ | ✅(官方公开页) | ❌ | 周(周三 WPSR) | 仅经 **dev-time/手动 sanitizer**(xlsx)写 `config/`,再零依赖 build 写 `data/`(ACLED 模式);**ADR-0013 禁止 xlsx 直写 `data/` 或在 CI production 路径运行** |
| **现有 FRED helper**(WTI/ULSD/Brent) | ✅ | ✅ | 已有 key | 日 | **复用已验证 series**,不扩新 series 除非另核 |
| **期限结构连续合约曲线**（M1-M2/M1-M6） | — | — | — | — | ⚠️ **高难度,单独标注**(见下) |
| Nasdaq Data Link / IEA MODS / 正式 ICE settlement / Stooq / Google Finance | — | — | — | — | **不接入**(新 vendor/key/订阅风险,或与现有公开代理边界冲突;F6 已删 worker Stooq probe) |

**⚠️ 期限结构难度单独说明**:免费、干净、可自动化的**连续合约价差**数据极难获得(Yahoo 连续合约有 roll 跳变;EIA/FRED 不直接给完整期货曲线)。**但项目已有低置信代理**:`brentPricingLayer.futuresPriceCurve`(Yahoo `BZ` 月度期货,带 `slopeRegime`/`frontMinusBack`/逐月 `contracts[]`/显式 `limitationZh`)。**降级方案**:复用该代理 + 从 `contracts[]` 派生近远月价差(低置信),数据缺失时把「期限结构确认度」降级为**低置信 / 不参与裁决**,绝不假设可直接接入完整曲线。

**⚠️ EIA dnav HTML 端点 latest-row 不可信(2026-06-03 实测教训)**:同属一份 WPSR、周三同步发布的系列,经 HTML `LeafHandler` 抓回的"最新日期"互相矛盾(SPR/炼厂 @2026-05-22,但原油 ex-SPR 被读成 @2025-03-28、馏分油/汽油 @2025-12 月)——这是把抽取套在「年×周」巨型网格表上的**抽取假象**,非真实数据状态。**结论:HTML 端点只能确认 series 存在/标题/单位/频率,不能取 latest-row 或新鲜度。**结构化来源 = EIA API v2 JSON(CI 自动、零依赖、ADR-0013 clean)或 dnav XLS(仅 dev-time sanitizer 用,见 §9 的 ADR-0013 约束)。

---

## 3. 频率对齐、陈旧度与季节性

混用 daily(油价)/ weekly(EIA 物理)/ monthly(未来 OECD/IEA)三种频率。规则:

- **每个指标带自己的 `asOfDate`**(数据点自身日期),**禁止**用单一全局日期掩盖时间差。
- **`maxAgeDays` 阈值**:daily=4;weekly(周三发布上周五数据)=10;monthly=45。超阈 → `sourceStatus:"stale"` → 该指标降级低置信 / 不参与裁决。
- **跨频率规则**:用周三库存与周五油价比较时,必须靠各自 `asOfDate` 显式暴露时间差;**禁止「用上周库存解释今天油价」而不标注时间差**(展示侧 PR4,数据侧 PR1 保证字段在)。
- **季节性**:库存的 5 年均值/区间比较**必须按 week-of-year(同周历史)对齐**,不用滚动均值;允许 ±1 week fallback;标 `seasonBucket`(winter_heating / summer_driving / shoulder)。柴油库存判断须区分采暖季(冬)与驾驶季(夏),夏季正常去库**不得**误判为供应危机。

---

## 4. 数据结构契约草案

落点(**建议折中,owner 倾向、UI 前再定,非已批准最终决策**):**PR1/PR2 先建独立文件** `data/oil-directional-pressure.json`(隔离周频、不污染日频评分管线);UI 前再决定是否把 latest compact snapshot 投影进 `radar-data.json` root。
依据:`scripts/app.js` 的 `loadAllData()` 当前恰好 4 个并行 fetch(radar-data / world-order-stress / market-pricing-metrics / radar-history)——**独立文件 = 第 5 个 fetch = 碰高风险 `app.js`**;root snapshot = 前端从已加载 `radarData` 直读、零新 fetch、PR4 最小碰 `app.js`。

PR1 只落 **evidence + freshness + seasonality**;`signals` / `finalBias` / `interpretation` 字段**预留为 null,PR1 不写**(契约前向兼容,contract check 对这些字段「允许缺失」)。

```jsonc
{
  "schemaVersion": "odp-1",
  "module": "oil-directional-pressure",
  "boundary": "audit-only/display-only; NOT in values/scoring/decisionModel/executionLock/positionGuidance",
  "builtAt": "<ISO>",                 // 本次 build 时间(≠ 数据本身日期)
  "evidence": {
    "crudeStocksExSpr": {
      "value": 0, "unit": "千桶",
      "asOfDate": "YYYY-MM-DD",        // 数据点自身日期,分字段、不共用全局日期
      "frequency": "weekly",
      "ageDays": 0, "maxAgeDays": 10,
      "sourceStatus": "live",          // live | fallback | stale | missing
      "source": "EIA:dnav:WCESTUS1",
      "sourceUrl": "https://www.eia.gov/dnav/pet/hist_xls/WCESTUS1w.xls",
      "change1w": 0, "change4w": 0, "change13w": 0,   // 客观派生(算术,非判断)
      "vs5yAvgPct": 0, "fiveYrRangePosition": 0.0     // 同周 5 年区间分位 0–1
    },
    "distillateStocks":   { "...同结构, maxAgeDays": 10 },
    "sprStocks":          { "..., change1w, sprReleaseRate(派生)" },
    "refineryUtilization":{ "..., unit": "%", "util4wChange": 0 },
    "refinerCrudeInputs": { "..." },
    "gasolineStocks":     { "..." },
    "demandDistillateSupplied": { "..." },
    "demandGasolineSupplied":   { "..." },

    "wtiPrice":   { "value":0,"unit":"$/bbl","frequency":"daily","maxAgeDays":3,"source":"radar-data:macroDrivers.inflationEnergy.wtiMarketProxy" },
    "brentPrice": { "...","source":"radar-data:values.brent" },
    "crackSpread":{ "...","source":"radar-data:brentPricingLayer.crackSpread","note":"价格/裂解代理,非库存" },
    "curve":      { "slopeRegime":"backwardation|contango|flat|未知","frontMinusBack":0,
                    "confidence":"low","source":"radar-data:brentPricingLayer.futuresPriceCurve",
                    "limitationZh":"公开月度期货代理,非官方结算曲线" }
  },
  "seasonality": {
    "crudeStocksExSpr": { "weekOfYear":0,"fiveYrSameWeekMean":0,"fiveYrSameWeekMin":0,
                          "fiveYrSameWeekMax":0,"seasonBucket":"winter_heating|summer_driving|shoulder",
                          "windowFallback":"exact|±1week" }
    // …每个周度物理指标一条;week-of-year 对齐
  },

  // ↓ PR3 才写;PR1 预留 null,contract check 允许缺失
  "signals": null,
  "finalBias": null,
  "interpretation": null
}
```

---

## 5. 模型设计（PR3 — 可解释,非黑箱）

**6 子信号**:`inventoryDrawPressure`(库存降速 1w/4w/13w + 同周 5 年位置)、`dieselProductStress`(馏分油库存 + crack + 区分需求强 vs 炼厂供应不足)、`futuresCurveConfirmation`(backwardation/contango,**仅确认信号、非硬门槛、低置信**)、`refineryConfirmation`(开工率/投入,区分真实需求 / 检修 / 瓶颈)、`sprBufferEffectiveness`(**SPR 释放速度是否足以抵消商业库存降速**,而非看库存高低)、`demandDestructionRisk`(价涨但库存累积 + crack 走弱 + 开工下降时触发)。

**finalBias 枚举**:`strong_bullish` / `moderate_bullish` / `neutral_range` / `bearish` / `false_down_physical_stress` / `false_up_unconfirmed` / `product_crisis` / `insufficient_data`。

**信号冲突裁决(显式成文,不藏在加权黑箱)**:
- **物理信号**(库存、期限结构、馏分油、SPR 净效果、炼厂)**优先于** **金融/情绪信号**(价格表象、地缘溢价)。
- 三个必须保留的反直觉判断:① 油价跌但库存仍降 + backwardation 扩大 + 柴油仍低 → `false_down_physical_stress`;② 油价涨但库存回升 + 曲线走弱 + 柴油改善 → `false_up_unconfirmed`;③ 原油不强但柴油/crack 极紧 + 炼厂受限 → `product_crisis`(重通胀/物流压力,非油价本身)。
- **数据不足 → `insufficient_data`,不硬下结论**。

---

## 6. 历史回测可行性（PR2 — 作上线 GATE）

- 本地 `data/radar-history-full.json` 仅 ~40 条(2026-04-21 → 2026-06-03,约 6 周),**不足以**回测 2020/2022/2023-24。
- 可行路径:EIA dnav 物理链史起 1982–1991、FRED 价格史起 1980s,**单次 XLS 拉取即含完整历史**,可对模型做**历史 replay 回测**。
- 验收预期:2020 需求崩塌 → bearish / demand destruction;2022 供给冲击 → physical stress / product crisis;2023-24 → neutral_range / mixed(避免过度看涨)。
- **GATE 定性**:回测在已知拐点给不出合理方向之前,**不把 UI 文案写成高置信结论、不进 PR4**。这关系到模型是否值得上线,不只是"能不能跑"。

---

## 7. UI 集成（PR4）

- 位置:六大底层风险模块**之后**的独立能源专题(不塞进某个风险模块、不并入 Heatmap)。
- 路径:结论 → 一句话中文结论 → 原因拆解(库存降速/柴油/期限结构/炼厂/SPR)→ 证据(各指标值/最近变化/历史区间位置/对方向贡献)→ 展开详情(指标为何重要/当前数据说明什么/是否互相验证/哪些信号矛盾)。全中文;英文仅限变量名/内部字段。
- **IA 守卫现状(重要)**:`check-homepage-ia-contract.mjs` / `check-editorial-redesign-contract.mjs` **已在 checker 精简 Phase 1+2 退役**(见 `AGENTS.md` 当前 IA/font 权威说明)——**无自动 IA checker**。PR4 必须:① 手工同步 `DESIGN.md` §4.1 文档化阅读顺序(把新专题写进去)+ 人工 review(ADR-0014);② 过 `check:dom`(新 DOM id 两边一致,这个 checker 是活的);③ `npm run bump:frontend-asset-version`(并 `git checkout HEAD --` 还原被扇写的冻结 `scripts/modules/realtime.js`,保 diff=0)。**不得假设有 IA 自动脚本兜底。**
- **Global Risk Heatmap 仍独立显示。**

---

## 8. 检查脚本

新建 `check-suite.mjs` 的 **`oil-directional` 套件**;`package.json` 加 `check:oil-directional` 并入 `check:all` → **顶层项 15 → 16**(须同步 `CLAUDE.md` / `AGENTS.md` / `MILESTONE_INDEX.md` / `PROJECT_BACKLOG.md` 的计数字段)。

| # | check | 职责 | 阶段 |
|---|---|---|---|
| 1 | `check:odp-contract` | 字段/类型/单位枚举完整;`schemaVersion=odp-1`;`boundary` 标记在;预留字段(signals/finalBias)允许 null | **PR1** |
| 2 | `check:odp-freshness` | 每指标独立 `asOfDate`/`frequency`/`ageDays`/`maxAgeDays`/`sourceStatus`;ageDays 自洽;超阈必降级 | **PR1** |
| 3 | `check:odp-seasonality` | 同周 5 年基线存在;week-of-year 对齐(非滚动均值);`seasonBucket` 枚举合法;±1 week fallback 标注 | **PR1** |
| 4 | `check:odp-degradation` | 缺失/stale 禁止伪造 value;insufficient 下禁止填 finalBias;sourceStatus 正确降级（落实"数据不足→暂不判断") | **PR1** |
| 5 | `check:odp-boundary` | 守边界:ODP 字段**不出现**在 radar-data 的 values/scoring/decision/exec/position(同 brentPricingLayer/world-order 守卫范式) | **PR1** |
| 6 | `check:odp-score` | 分数范围/finalBias 枚举合法性 | PR3 |
| 7 | `check:odp-zh-copy` | 中文 UI 文案、无 action 词 | PR4 |

**关键**:数据缺失时网站**不得硬下结论**,必须显示「数据不足 / 暂不判断 / 缺哪些关键数据 / 当前仅低置信度判断」。

---

## 9. 抓取纪律（若未来实现,沿用 ISM/Redbook/NBS/EIA 纪律）

- ⚠️ **ADR-0013 硬约束(写 `data/` 的代码必须零依赖)**:`docs/ADR/0013-*.md` 明确 devDependency(含 `xlsx`)**不得**被任何写 `data/` 的代码、或任何 GitHub Actions production 路径脚本导入(line 30/36)。因此 **xlsx 不能用于直写 `data/oil-directional-pressure.json` 的 fetcher/build,也不能在 CI 自动 refresh 里跑**。两条合规路径:
    - **(A) CI 自动【owner 终裁 = 已选主路】**:EIA API v2 返 **JSON → 零依赖解析 → build 写 `data/`**;需免费 EIA key(GitHub secret,同 FRED/GDELT 管理);全程无 devDep。前置硬 gate 见 §12。
    - **(B) 手动 sanitizer(ACLED 模式)【fallback / manual seed / API 不通退路】**:operator 本地下 dnav `.xls` → `scripts/oil-directional/sanitize-*.mjs`(xlsx,dev-time entry,**只写 `config/`**)→ 零依赖 build 读 config 写 `data/`;xlsx 永不进 CI/`data/`(ADR-0013 line 23/29 sanctioned 模式)。**选 B 须同步放宽 `AGENTS.md`(:86)/ `DATA_SOURCES.md`(:317)的「xlsx 仅限 ACLED sanitizer」边界以纳入 ODP sanitizer(选 A 不动)。**
- **结构化解析**:无论 A/B,latest-row 都从结构化源取;**HTML LeafHandler 仅确认 series 存在/元数据,不取 latest-row**(见 §2 实测教训；仅有[按期整批备用例外](#dnav-bounded-cohort-fallback))。
- 低频 + 按日期缓存 + UA `GFRRBot/1.0`;不绕 SSO/captcha;只用官方显式端点 URL,不广扫站点。
- **Fail closed**:空记录 / schema 变化 / 非 200 / 解析失败 / 超期 → `missing` / `stale` / `fallback`,**不得伪造缺失值、不得把 stale 当 live**。
- source 标签:EIA dnav 物理链标 `EIA:dnav:<ID>`;复用字段标 `radar-data:<path>`。
- **EIA = 美国政府公共领域数据**,标注 source URL 即可(比 ACLED EULA 宽松,无 scraping 禁令)。

---

## 10. PR 拆分（serial trunk,逐个合并;PR1 不碰 UI/`app.js`）

1. **PR1** — **第一步过 EIA API route discovery 硬 gate(8 WPSR series live-proof,见 §12)** + source review + data contract + fetch/build 脚本(**零依赖写 `data/`**,见 §9 ADR-0013)+ 5 个 check + 一次性 build 初始 `data/oil-directional-pressure.json`;**不含 workflow**;**不渲染、不碰 `app.js`/`index.html`/`renderMacroOverview.js`/`validate-data.mjs`**;`radar-data.json` 零改动。
2. **PR1b** — 周度 refresh workflow(镜像 `refresh-world-order-stress.yml`)+ 按 `check-workflows.mjs` 接入 `deploy-static-site-to-pages.yml` 的 Pages trigger 覆盖。**与 PR1 分开**,避免第一刀扩到 workflow + trigger 接线(呼应原始约束「第一 PR 纯数据接入 + check」)。
3. **PR2** — 历史 cache + 2020/2022/2023-24 回测 harness(**GATE**:拐点方向合理才进 UI)。
4. **PR3** — `signals`/`finalBias`/`interpretation` 模型固化 + 物理>金融裁决,仍 display-only;启用 `check:odp-score`。
5. **PR4** — 中文 UI 独立能源专题;同步 `DESIGN.md` §4.1 + `check:dom` + asset version bump + 最小 `app.js`(整包升级 + `node --check`);决定 root snapshot 投影;启用 `check:odp-zh-copy`。
6. **PR5** — 稳定观察后,才让 `dailyBrief` / interpretation 层**只读引用**。

---

## 11. PR1 文件清单

**PR1 新建**:`scripts/oil-directional/build-oil-directional-pressure.mjs`(**零依赖**,写 `data/`)+ 取数路径 = **A 主路**(零依赖 EIA API client,见 §9;B=`scripts/oil-directional/sanitize-*.mjs` 用 xlsx 写 `config/` 仅 fallback)· `data/oil-directional-pressure.json`(初次 build)· `scripts/check-oil-directional-*.mjs` ×5 · 本文档。

**PR1 触碰**:`scripts/check-suite.mjs`(加套件)· `package.json`(加脚本 + 入 check:all)· `DATA_SOURCES.md`(主表 + 反向索引)· `DATA_CONTRACT.md`(新文件契约)· `PROJECT_BACKLOG.md`(backlog 项 + Handoff)· 计数字段(`CLAUDE.md` / `AGENTS.md` / `MILESTONE_INDEX.md` 15→16)· **`docs/INDEX.md`**(按其自身规则:新增文档必登记,放「Brent / energy public proxy source review scope」段)。

**PR1 触碰(仅 B 路径额外)**:`AGENTS.md`(:86)与 `docs/DATA_SOURCES.md`(:317)的「xlsx 仅限 ACLED sanitizer」边界须放宽以纳入 ODP sanitizer;选 A 则不动这条。

**PR1b 新建/触碰**:`.github/workflows/refresh-oil-directional-pressure.yml` + `.github/workflows/deploy-static-site-to-pages.yml`(Pages trigger 覆盖,`check-workflows.mjs` 强制)。

**明确不碰**:`scripts/app.js` · `index.html` · `scripts/modules/renderMacroOverview.js` · `scripts/validate-data.mjs` · `data/radar-data.json` · 前端 asset version。

---

## 12. PR1 source-review 开放问题（开工前必须先回答）

1. **取数架构 —— owner 2026-06-03 终裁:A-first**(EIA API v2 JSON,零依赖 + 免费 key,CI 自动);**B(手动 xlsx sanitizer→`config/`→零依赖 build)仅作 fallback / manual seed / API 不通退路**。**硬 gate(PR1 第一个动作)**:用 EIA key live-proof 8 个 WPSR series 的 API route(`petroleum` route 或 v2 `/seriesid/` legacy)—— 覆盖 / 返回结构 / 单位频率坐实才写正式 build;映射不稳或结构不适合才切 B。顺带查 dnav 是否另有零依赖 CSV 端点(若有则 A 连 key 都省)。**不接受**为自动化让 xlsx 进 CI 写 `data/`(撞 ADR-0013)。A-first 不变；同源 HTML 仅有[按期整批备用例外](#dnav-bounded-cohort-fallback)。
2. **deploy-trigger 接线**:新 refresh workflow commit 到 main,`check-workflows` 是否强制它进 `deploy-static-site-to-pages.yml` 的 `workflow_run.workflows`?(PR1-3 前端尚未读此文件,理想是不触发 Pages 重建;须确认 checker 是否允许非部署型 commit workflow,否则接入即可,无害重建。)
3. **dnav 稳定性**:连续几次拉取确认 XLS 结构不变、无地理封锁(EIA 在 US runner 应可达,不同于 pbc.gov.cn)。
4. **`WGFUPUS2` / `WDIUPUS2` / days-of-supply**:确认 product-supplied 口径是否满足 `demandDestructionRisk` 需求;days-of-supply 采「`WCESTUS1 ÷ WCRRIUS2` 派生」。

---

## 13. 待办 / 注

- 本文为 source-review / feasibility,**无代码改动、无 runtime、无 data 写入、无 frontend 改动、无 workflow 触发**。
- 数据可得性核验状态:EIA 8 系列 2026-06-03 live 确认存在 + 单位/频率坐实(Codex 另用结构化 xlsx 复核 latest 行一致 @2026-05-22);取数架构**已裁为 A-first**(EIA API v2 JSON,零依赖;owner 2026-06-03);B 仅 fallback / manual seed;PR1 先过 EIA API route discovery 硬 gate;通用 HTML 仅取元数据，[按期整批备用例外](#dnav-bounded-cohort-fallback)除外。
- 任何实现须各自另开 PR 走完整复核流程(outline → 实证 → brief → 复核 → 实施 → diff 复核),且永不进 scoring/decision/execution/position。

---

## 结论

ODP 适合作为 GFRR 的**独立能源专题、audit-only / display-only**(非第七个底层风险模块,Heatmap 保持独立)。核心物理链数据**可得**:dnav XLS 已证明**零 key 可得**(手动 B 路径);CI 自动主路 = EIA API v2(owner 终裁 A);PR1 先过 route discovery 硬 gate 确认 8 series 并配免费 key(见 §9/§12)。dnav XLS 提供原油/SPR/馏分油/汽油库存、炼厂开工率与投入、product-supplied 需求 proxy(2026-06-03 已 live 确认,史起 1982–1991),价格/裂解/曲线复用现有 FRED + Yahoo 字段。第一步**不碰 UI、不碰 `app.js`**,先做 source review + data contract + check scripts;期限结构只能低置信复用、缺则不参与裁决;回测作上线 GATE;数据不足时显式「暂不判断」。
