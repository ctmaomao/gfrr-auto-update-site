# 周报取数：四项容易混用的来源

本表用于每一期的编辑核对，不改变生产取数链，也不是程序可自动判定的发布门槛。先记录本期截止时刻（含时区）、观察日、可证明的发布时刻或版本与检索时刻。只有截止前已可取得且定义匹配的数据，才能作为本期事实。用今天检索的历史序列复盘时，若没有当时版本，标为事后核对，不据此推断当时已知。

| 拟报告指标 | 取数与验收 | 不能满足时 |
|---|---|---|
| 美国 10 年期 ACM 期限溢价 | 从纽约联储[说明页](https://www.newyorkfed.org/research/data_indicators/term-premia-tabs)进入[工作簿](https://www.newyorkfed.org/medialibrary/media/research/data_indicators/ACMTermPremium.xls)。用可读取旧式 XLS 的工具核对日频工作表、日期及期限溢价列 ACMTP10，勿选拟合收益率或月末表。按观察日排序，保留实际使用的文件版本及两期行；日频观察不等于每日发布。 | 下载到 HTML、没读出单元格、列不匹配或未找到当期行：只写最后可核对的观察日，标为滞后或缺失。不能用 10 年国债收益率代算。 |
| 港元同业资金价格与结算流动性 | 按下方[香港编辑核对](#hkma-weekly-evidence)，用金管局同一日频表配对 1 个月 HIBOR 定盘和银行体系收市总结余；价格和结算余额分别解释。 | 不用已停报的 segment=hibor，不以隔夜或其他期限、开市值、预测值或按揭调查补空。 |
| Brent 现货（美元/桶） | 查 [EIA 每日 Europe Brent Spot Price FOB](https://www.eia.gov/dnav/pet/hist/rbrteD.htm)，核对行的周区间和列的星期。记录实际观测日；已有旧值但目标日为空时，可在旁注列旧日、旧值。 | 空白、NA、无数值均为缺失，不作零、前值填充或插值；不用周均、ICE 期货或预测补当日现货。任一比较端点缺失，不写目标时段涨跌。 |
| ICE Brent 期货 | 从 [ICE Futures Europe 产品 219](https://www.ice.com/products/219/Brent-Crude-Future)确认品种，另须有可引用且准许使用的逐日证据，记录交割年月、交易日、价格类型（结算或成交）、单位与来源。周变动两端必须同一具体合约、同价型。 | 规格页不是结算记录；报价的 Last 不是 Settlement。跨换月不拼为同合约涨跌，无精确合约或许可不清时省略数值，不以连续近月代码或 EIA 现货冒充。 |

**交稿抽查：** 任取一条带周差的句子，读者应能由两条来源记录重算。以百分数表示的利率，其百分点差乘 100 才是基点；油价百分比变化为（期末 / 期初 − 1）× 100%。任一字段无法核实，改为部分证据或未取得，不把缺数解读成市场没有变化。

<a id="hkma-weekly-evidence"></a>
## 香港：两项日频观测，一项月频背景

1. **先定日期，再取数。** 以各周同一规则选香港交易日，例如每周最后一个交易日；节假日改用当周最后一个交易日，标明实际日期。不因缺数改选更有利的日期。按[金管局同业流动资金日度表](https://apidocs.hkma.gov.hk/documentation/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity/)及[查询参数说明](https://apidocs.hkma.gov.hk/documentation/)，在官方 API 单次查询中用 `column=end_of_date`、`filter=期初日期,期末日期`（ISO 日期）、`fields=end_of_date,hibor_fixing_1m,closing_balance`、`pagesize=10`。核对响应成功、两个日期各有一条记录，再逐字段核对有限数值；同一日期出现重复即不采用该日期。保留确切查询、所用行、可证的发布时间或版本和检索时间。HTTP 成功不是数据有效的凭据；截止后取得的记录若无证据证明截止前已公开，只作事后核对。
2. **分别报告资金价格和结算余额。** `hibor_fixing_1m` 是香港银行公会 1 个月 HIBOR 定盘（年率 %）；两端差乘 100 为基点。`closing_balance` 是银行体系结算账户的收市总结余（百万港元），差额保持同单位；余额不是总体银行存款或流动性压力评分。可用[金管局同业拆息日度表](https://apidocs.hkma.gov.hk/documentation/market-data-and-statistics/monthly-statistical-bulletin/er-ir/hk-interbank-ir-daily/)的 `segment=hibor.fixing`、`end_of_day`、`ir_1m` 交叉核对；同日同口径数值不符则先查版本，不自行选边。单项的两端俱全才报该项周差；只有同日两项俱全时才并列描述当日价格和余额，否则只列可核实的单项，另一项标未知，不补零、不前填。若另写 3 个月 HIBOR，用 `ir_3m` 独立列示，不替代 1 个月定盘。
3. **按揭作为月频背景单列。** 用金管局[住宅按揭统计调查](https://apidocs.hkma.gov.hk/documentation/market-data-and-statistics/monthly-statistical-bulletin/banking/residential-mortgage-survey/)及对应新闻稿，注明调查月份、新闻稿发布日期和所用指标（例如新批出贷款额或拖欠比率）。选择截止前已证实公开的最新月份；新稿未出，就标明旧月份，不写成本周数据；无法验证则省略住宅背景。月度贷款变化不能补日频数据，也不能证明本周流动性或按揭风险方向。

刊出时逐项链接金管局官方表或当期新闻稿，标注来源及权属，遵循[金管局使用条款](https://www.hkma.gov.hk/eng/other-information/terms-and-conditions-of-use/)。其中金管局条款不授权第三方所有的内容：[HIBOR 基准归香港银行公会所有](https://www.hkab.org.hk/files/page/interest-rates/1/Specifications_of_HKD_HIBOR_%2830_Sep_2025%29-1761875069.pdf)，公开 API 可读取不等于可转载。公开版引用方式和权限无法确认时，只链接官方来源，不刊登该项数值或周差，不镜像原始响应。

第三方 [hkgov-rethink HKMA 连接器](https://github.com/alencheung/hkgov-rethink/blob/main/crates/connectors/src/hkma.rs)仅供参考响应结构和故障隔离，不作为取数源、回退源或本项目依赖。本节只用于周报编辑核对，不新增自动取数、程序发布门槛、评分或历史回填。
