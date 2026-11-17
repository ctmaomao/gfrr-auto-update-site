# 周报取数：四项容易混用的来源

本表用于每一期的编辑核对，不改变生产取数链，也不是程序可自动判定的发布门槛。先记录本期截止时刻（含时区）、观察日、可证明的发布时刻或版本与检索时刻。只有截止前已可取得且定义匹配的数据，才能作为本期事实。用今天检索的历史序列复盘时，若没有当时版本，标为事后核对，不据此推断当时已知。

| 拟报告指标 | 取数与验收 | 不能满足时 |
|---|---|---|
| 美国 10 年期 ACM 期限溢价 | 从纽约联储[说明页](https://www.newyorkfed.org/research/data_indicators/term-premia-tabs)进入[工作簿](https://www.newyorkfed.org/medialibrary/media/research/data_indicators/ACMTermPremium.xls)。用可读取旧式 XLS 的工具核对日频工作表、日期及期限溢价列 ACMTP10，勿选拟合收益率或月末表。按观察日排序，保留实际使用的文件版本及两期行；日频观察不等于每日发布。 | 下载到 HTML、没读出单元格、列不匹配或未找到当期行：只写最后可核对的观察日，标为滞后或缺失。不能用 10 年国债收益率代算。 |
| 港元同业资金价格 | 用[金管局日度表说明](https://apidocs.hkma.gov.hk/documentation/market-data-and-statistics/monthly-statistical-bulletin/er-ir/hk-interbank-ir-daily/)指向的 API，选 segment=hibor.fixing；按 end_of_day 和固定期限 ir_1m（一个月）或 ir_3m（三个月）取同口径报价，注明 HKAB 定盘、年率 %。 | 不用已停报的 segment=hibor，也不拿按揭调查或不同期限补空。按揭调查以调查月份单列，仅作房地产背景，不写成本周资金价格。 |
| Brent 现货（美元/桶） | 查 [EIA 每日 Europe Brent Spot Price FOB](https://www.eia.gov/dnav/pet/hist/rbrteD.htm)，核对行的周区间和列的星期。记录实际观测日；已有旧值但目标日为空时，可在旁注列旧日、旧值。 | 空白、NA、无数值均为缺失，不作零、前值填充或插值；不用周均、ICE 期货或预测补当日现货。任一比较端点缺失，不写目标时段涨跌。 |
| ICE Brent 期货 | 从 [ICE Futures Europe 产品 219](https://www.ice.com/products/219/Brent-Crude-Future)确认品种，另须有可引用且准许使用的逐日证据，记录交割年月、交易日、价格类型（结算或成交）、单位与来源。周变动两端必须同一具体合约、同价型。 | 规格页不是结算记录；报价的 Last 不是 Settlement。跨换月不拼为同合约涨跌，无精确合约或许可不清时省略数值，不以连续近月代码或 EIA 现货冒充。 |

**交稿抽查：** 任取一条带周差的句子，读者应能由两条来源记录重算。以百分数表示的利率，其百分点差乘 100 才是基点；油价百分比变化为（期末 / 期初 − 1）× 100%。任一字段无法核实，改为部分证据或未取得，不把缺数解读成市场没有变化。
