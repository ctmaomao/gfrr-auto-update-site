# M-93 V1 用户语言审计报告

审计日期: 2026-05-24  
审计方式: 静态扫描 `data/radar-data.json`、首页入口和前端渲染模块中最终可能进入浏览器的文案;排除注释、console/check 输出、开发文档和测试 fixtures。  
目标用户假设: 中文普通用户,60+ 长辈类型,平时看新闻但不看金融报表、不懂金融术语。

上下文核对备注: 当前 `index.html` 和 `scripts/app.js` 已是 `28.0M-92AV`,git log HEAD 为 `M-92B Desktop Today Summary Visual Hierarchy Restoration`;但 `docs/PROJECT_BACKLOG.md` 的维护状态仍写 `28.0M-91V / M-91`。本报告不修改该既有文档,只记录语言审计证据。

## Section 1 · Executive Summary

结论: 以中文普通用户为目标读者时,当前网站可读性问题为极严重。页面表面是中文,但大量核心判断仍依赖工程契约词、金融英文缩写、未经解释的原始数值和状态枚举;普通用户很难判断"这句话到底是在说风险升高、数据没准备好,还是只是系统内部不能下结论"。当前文案更像给工程师、数据审计者和金融研究员看的控制台,不是给普通用户看的风险说明。

本次按唯一问题项统计,不是按所有重复出现次数统计:

| 问题类别 | 发现数量 | 影响 UI section |
|---|---:|---:|
| 工程师术语 | 29 项 | 13/14 |
| 金融英文缩写 | 50 项 | 10/14 |
| 未解释原始数据 | 15 个样本,覆盖 5 个数据族 | 9/14 |
| 金融行话与状态短语 | 36 项 | 14/14 |

影响范围摘要: 首页 IA 的 14 个 section 中,5 个为"极严重",6 个为"严重",2 个为"中度",1 个为"轻度";没有一个 section 对目标用户可视为"几乎无影响"。问题最集中在"今日总判断 / 主要压力来源 / 四大宏观驱动 / 详细数据 / 执行风控"。

## Section 2 · 工程师术语清单

| 原文 | 出现位置 | 用户为什么看不懂 |
|---|---|---|
| `display-only` | `data/radar-data.json:16`;`scripts/modules/renderMacroOverview.js:2521`;`data/radar-data.json` 路径 `dailyBrief.oneLineConclusion` | 普通用户不知道这是"只展示、不参与模型"的工程边界,会误以为是英文功能状态。 |
| `audit-only` | `data/radar-data.json:136`;`data/radar-data.json:349`;`macroDrivers.*.notes[]` | "审计层"是开发/治理口径,不是用户语言;用户不知道它与风险判断的关系。 |
| `sourceStatus` | `scripts/modules/renderMacroOverview.js:154-159`;`data/radar-data.json:907`;`data/radar-data.json:1216` | 这是数据管线字段名,页面出现 `sourceStatus: BDTI=live` 时,用户只能看到一串状态代码。 |
| `status=live` | `scripts/modules/renderMacroOverview.js:1357`;`data/radar-data.json:462`;多个 `sourceStatus: "live"` | `live` 对普通用户可能像直播/实时,但这里是数据源可用性状态。 |
| `status=live_proxy_curve` | `data/radar-data.json:929`;`data/radar-data.json:1004`;`scripts/modules/renderMacroOverview.js:1034-1037` | 混合了状态、代理、曲线三层含义,用户无法知道是否可信、是否正式数据。 |
| `status=live_public_curve` | `data/radar-data.json:1064`;`scripts/modules/renderMacroOverview.js:1040` | 用户看不出 "public curve" 是公开曲线还是正式报价,也不知道为什么重要。 |
| `live_structure_only` | `data/radar-data.json:468`;`scripts/modules/renderMacroOverview.js:1363` | 这是"只有合约结构、没有正式价格曲线"的工程降级状态,不适合直接展示。 |
| `live_proxy_priced` | `data/radar-data.json:537`;`scripts/modules/renderMacroOverview.js:1369` | 用户不知道 "proxy priced" 是替代价格,也不知道它不能等同正式结算价。 |
| `live_delayed_priced` | `data/radar-data.json:598`;`scripts/modules/renderMacroOverview.js:1366` | "delayed/last quote" 是交易数据术语,普通用户不知道延迟价格对判断有什么限制。 |
| `manual_required` | `data/radar-data.json:1546`;`data/radar-data.json:1594`;`scripts/modules/renderMacroOverview.js:717` | 这是运维状态,用户会误解为自己需要手动操作。 |
| `displayInputsBaseline` | `data/radar-data.json:24`;`data/radar-data.json:199`;`data/radar-data.json:2584` | 内部显示基线字段名直接进入证据/触发条件,普通用户无法理解它和实际市场数据的关系。 |
| `effectiveDisplayInputs` / `__effectiveDisplayInputs` | `scripts/modules/realtime.js:621`;`scripts/modules/realtime.js:644` | 当前主要是 runtime 内部字段,但若进入任何用户可见调试文本,会成为完全不可读的工程字段。 |
| `contractVersion` | `data/radar-data.json:13`;`data/radar-data.json:131`;`scripts/modules/render.js:482` | "合约版本"对开发者有意义,普通用户不知道为什么 Daily Brief 需要合约。 |
| `schemaVersion` | `data/radar-data.json:2684`;`scripts/modules/renderExternalAi.js:289` | 数据 schema 是开发者概念;如果显示到用户,只会增加理解负担。 |
| `boundaries` | `data/radar-data.json:92`;`data/radar-data.json:419`;`scripts/modules/renderExternalAi.js:284` | "边界"在项目治理中重要,但普通用户需要的是"这段能不能作为判断依据"。 |
| `affectsScoring=false` | `data/radar-data.json:94`;`data/radar-data.json:821`;`scripts/modules/renderExternalAi.js:295` | 布尔字段风格像程序配置,用户不知道 scoring 是什么。 |
| `affectsDecisionModel=false` | `data/radar-data.json:95`;`data/radar-data.json:822`;`scripts/modules/renderExternalAi.js:296` | "决策模型"没有解释时容易被理解成自动投资建议。 |
| `affectsExecutionLock=false` | `data/radar-data.json:96`;`data/radar-data.json:823`;`scripts/modules/renderExternalAi.js:297` | `executionLock` 是内部执行状态门控,不是普通用户语言。 |
| `affectsPositionGuidance=false` | `scripts/modules/renderExternalAi.js:298`;`data/radar-data.json:2838` 附近同组边界 | 用户不懂 position guidance,也不需要看到布尔合约字段。 |
| `realtime payload` | `data/radar-data.json:64`;`scripts/modules/realtime.js:67-107` | payload 是工程传输包概念;用户只需要知道数据来自哪里、是否新鲜。 |
| `Worker` / `Worker-first` | `index.html:6`;`index.html:577`;`scripts/modules/health.js:186-197` | Cloudflare Worker 是基础设施名,目标用户无法用它理解市场风险。 |
| `Daily fallback` / `baseline` | `index.html:577`;`scripts/modules/render.js:465-478`;`scripts/modules/realtime.js:580` | fallback/baseline 是数据兜底机制,用户会困惑是否当前数据失效。 |
| `worker-generated-preview` | `scripts/modules/freshness.js:68`;`scripts/modules/health.js:179`;`scripts/modules/realtime.js:400-416` | 这是内部数据源枚举,不应作为面向普通用户的来源名。 |
| `cross-validation matrix` | `scripts/modules/renderMacroOverview.js:2787`;`scripts/modules/renderMacroOverview.js:2829` | "交叉验证矩阵"是研究/建模术语,普通用户不知道矩阵里的确认意味着什么。 |
| `narrative` | `scripts/modules/renderMacroOverview.js:2787-2790`;`scripts/modules/renderMacroOverview.js:2901`;`scripts/check-market-pricing-first-fold-integration-and-cross-validation-matrix.mjs:14-28` | 英文 narrative 在中文页面中没有解释,用户不知道它是信号故事线还是数据类别。 |
| `promotion` / `Brent promotion` | `data/radar-data.json:64`;`data/radar-data.json:206`;`scripts/modules/renderMacroOverview.js:1409` | promotion 在这里指 Brent 主值提升/采用逻辑,普通用户会按"促销/推广"理解。 |
| `proxy` / `public proxy` | `data/radar-data.json:84`;`data/radar-data.json:593`;`scripts/modules/renderMacroOverview.js:1315-1324` | proxy 是代理数据源,但用户不知道它与正式数据的差异和限制。 |
| `frontendDisplayApproved` / `productionWriteApproved` | `data/radar-data.json:2841-2842`;`scripts/modules/renderExternalAi.js:292` | 这是发布审批字段,普通用户不会把它和页面可信度联系起来。 |
| `cache version` / module graph | `index.html:10`;`index.html:1771`;`scripts/app.js:9` | 缓存版本是部署技术细节,不应进入用户理解风险的路径。 |

## Section 3 · 金融英文缩写清单

| 缩写 | 全称 | 出现位置（前 5 个示例） |
|---|---|---|
| UMCSENT | University of Michigan Consumer Sentiment,密歇根消费者信心指数 FRED 代码 | `data/radar-data.json:365`,`data/radar-data.json:372`,`data/radar-data.json:404`,`data/radar-data.json:1286`,`scripts/modules/renderMacroOverview.js:1130` |
| ISM PMI | Institute for Supply Management Purchasing Managers' Index,供应管理协会采购经理指数 | `data/radar-data.json:1288`,`scripts/modules/renderMacroOverview.js:1133`,`scripts/check-consumer-pmi.mjs:134` |
| JOLTS | Job Openings and Labor Turnover Survey,职位空缺和劳动力流动调查 | `data/radar-data.json:1350`,`scripts/modules/renderMacroOverview.js:1062`,`scripts/modules/renderMacroOverview.js:1168`,`scripts/modules/renderMacroOverview.js:1178`,`scripts/modules/renderMacroOverview.js:1185` |
| U-6 | U-6 labor underutilization rate,美国广义失业/低利用率指标 | `data/radar-data.json:1350`,`scripts/modules/renderMacroOverview.js:1064`,`scripts/modules/renderMacroOverview.js:1174`,`scripts/modules/renderMacroOverview.js:1178`,`scripts/modules/renderMacroOverview.js:1182` |
| AHE | Average Hourly Earnings,平均时薪 | `data/radar-data.json:1350`,`scripts/modules/renderMacroOverview.js:1063`,`scripts/modules/renderMacroOverview.js:1178`,`scripts/modules/renderMacroOverview.js:1182` |
| ICSA | Initial Claims,初请失业金人数 FRED 代码 | `data/radar-data.json:1348`,`data/radar-data.json:1350`,`scripts/modules/renderMacroOverview.js:1060`,`scripts/modules/renderMacroOverview.js:1161`,`scripts/modules/renderMacroOverview.js:1162` |
| CCSA | Continued Claims,续请失业金人数 FRED 代码 | `data/radar-data.json:1348`,`data/radar-data.json:1350`,`scripts/modules/renderMacroOverview.js:1061`,`scripts/modules/renderMacroOverview.js:1165`,`scripts/modules/renderMacroOverview.js:1178` |
| CARTS | Chicago Fed Advance Retail Trade Summary,芝加哥联储零售贸易周频摘要 | `data/radar-data.json:1517`,`data/radar-data.json:1519`,`scripts/modules/renderMacroOverview.js:1053`,`scripts/modules/renderMacroOverview.js:1202`,`scripts/modules/renderMacroOverview.js:1221` |
| CARTSR | Chicago Fed CARTS Real,通胀调整后的 CARTS | `data/radar-data.json:1517`,`data/radar-data.json:1519`,`scripts/modules/renderMacroOverview.js:1054`,`scripts/modules/renderMacroOverview.js:1206`,`scripts/modules/renderMacroOverview.js:1220` |
| MRTS | Monthly Retail Trade Survey,美国月度零售贸易调查 | `data/radar-data.json:1363`,`data/radar-data.json:1372`,`data/radar-data.json:1381`,`data/radar-data.json:1390`,`scripts/modules/renderMacroOverview.js:1209` |
| SLOOS | Senior Loan Officer Opinion Survey,银行信贷员贷款标准调查 | `data/radar-data.json:1563`,`scripts/modules/renderMacroOverview.js:1070`,`scripts/modules/renderMacroOverview.js:1105`,`scripts/modules/renderMacroOverview.js:1269`,`scripts/modules/renderMacroOverview.js:1272` |
| HY OAS | High Yield Option-Adjusted Spread,高收益债期权调整利差 | `data/radar-data.json:71`,`data/radar-data.json:78`,`data/radar-data.json:2581`,`scripts/modules/renderMacroOverview.js:1325`,`scripts/modules/renderMacroOverview.js:1424` |
| IG OAS | Investment Grade Option-Adjusted Spread,投资级债期权调整利差 | `data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1082`,`scripts/modules/renderMacroOverview.js:1326`,`scripts/modules/renderMacroOverview.js:1334`,`scripts/modules/renderMacroOverview.js:1341` |
| SOFR | Secured Overnight Financing Rate,有担保隔夜融资利率 | `data/radar-data.json:1003`,`data/radar-data.json:1059`,`data/radar-data.json:1227`,`scripts/modules/renderMacroOverview.js:1030`,`scripts/modules/renderMacroOverview.js:1426` |
| BGCR | Broad General Collateral Rate,广义一般抵押品回购利率 | `scripts/modules/renderMacroOverview.js:1100`,`scripts/modules/renderMacroOverview.js:1436`,`scripts/modules/renderMacroOverview.js:1437`,`scripts/modules/renderMacroOverview.js:1715`,`scripts/modules/renderMacroOverview.js:1783` |
| TGCR | Tri-Party General Collateral Rate,三方一般抵押品回购利率 | `scripts/modules/renderMacroOverview.js:1101`,`scripts/modules/renderMacroOverview.js:1436`,`scripts/modules/renderMacroOverview.js:1437`,`scripts/modules/renderMacroOverview.js:1716`,`scripts/modules/renderMacroOverview.js:1783` |
| ZQ | CME Fed Funds futures ticker family,联邦基金利率期货代码 | `data/radar-data.json:928`,`data/radar-data.json:936`,`data/radar-data.json:944`,`data/radar-data.json:952`,`scripts/modules/renderMacroOverview.js:1034` |
| SR3 | CME Three-Month SOFR futures ticker family,三个月 SOFR 期货代码 | `data/radar-data.json:1003`,`data/radar-data.json:1011`,`data/radar-data.json:1019`,`scripts/modules/renderMacroOverview.js:1037`,`scripts/modules/renderMacroOverview.js:1111` |
| OIS | Overnight Index Swap,隔夜指数互换 | `data/radar-data.json:1000`,`data/radar-data.json:1059`,`data/radar-data.json:1062`,`data/radar-data.json:1185`,`scripts/modules/renderMacroOverview.js:1040` |
| NFCI | National Financial Conditions Index,芝加哥联储全国金融状况指数 | `scripts/modules/renderMacroOverview.js:1104`,`scripts/modules/renderMacroOverview.js:1433`,`scripts/modules/renderMacroOverview.js:1856` |
| CDX | Credit Default Swap Index,信用违约互换指数 | `data/radar-data.json:1587`,`data/radar-data.json:1590`,`data/radar-data.json:1608`,`scripts/modules/renderMacroOverview.js:1083`,`scripts/modules/renderMacroOverview.js:1329` |
| CDX HY | CDX North America High Yield index,北美高收益 CDX 指数 | `data/radar-data.json:1587`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1328`,`scripts/modules/renderMacroOverview.js:1329`,`scripts/modules/renderMacroOverview.js:1872` |
| CDX IG | CDX North America Investment Grade index,北美投资级 CDX 指数 | `data/radar-data.json:1590`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1331`,`scripts/modules/renderMacroOverview.js:1332`,`scripts/modules/renderMacroOverview.js:1872` |
| BIZD | VanEck BDC Income ETF,上市 BDC 收益 ETF | `data/radar-data.json:1608`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1077`,`scripts/modules/renderMacroOverview.js:1314`,`scripts/modules/renderMacroOverview.js:1315` |
| PBDC | Putnam BDC Income ETF,上市 BDC ETF | `data/radar-data.json:1608`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1078`,`scripts/modules/renderMacroOverview.js:1318`,`scripts/modules/renderMacroOverview.js:1334` |
| SRLN | SPDR Blackstone Senior Loan ETF,高级贷款 ETF | `data/radar-data.json:1608`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1079`,`scripts/modules/renderMacroOverview.js:1321`,`scripts/modules/renderMacroOverview.js:1334` |
| CCLFX | Cliffwater Corporate Lending Fund,公开 interval fund NAV 代理 | `data/radar-data.json:1580`,`data/radar-data.json:1608`,`data/radar-data.json:1610`,`scripts/modules/renderMacroOverview.js:1080`,`scripts/modules/renderMacroOverview.js:1323` |
| BDTI | Baltic Dirty Tanker Index,波罗的海脏油轮运价指数 | `data/radar-data.json:1311`,`data/radar-data.json:1313`,`scripts/modules/renderMacroOverview.js:531`,`scripts/modules/renderMacroOverview.js:625`,`scripts/modules/renderMacroOverview.js:1395` |
| BCTI | Baltic Clean Tanker Index,波罗的海成品油轮运价指数 | `data/radar-data.json:1311`,`data/radar-data.json:1313`,`scripts/modules/renderMacroOverview.js:531`,`scripts/modules/renderMacroOverview.js:626`,`scripts/modules/renderMacroOverview.js:1398` |
| BDI | Baltic Dry Index,波罗的海干散货指数 | `data/radar-data.json:1311`,`data/radar-data.json:1313`,`scripts/modules/renderMacroOverview.js:531`,`scripts/modules/renderMacroOverview.js:627`,`scripts/modules/renderMacroOverview.js:1401` |
| VNQ | Vanguard Real Estate ETF,美国房地产 REIT ETF | `data/radar-data.json:1561`,`data/radar-data.json:1564`,`scripts/modules/renderMacroOverview.js:1071`,`scripts/modules/renderMacroOverview.js:1275`,`scripts/modules/renderMacroOverview.js:1286` |
| REM | iShares Mortgage Real Estate ETF,抵押型 REIT ETF | `data/radar-data.json:1561`,`data/radar-data.json:1564`,`scripts/modules/renderMacroOverview.js:1072`,`scripts/modules/renderMacroOverview.js:1278`,`scripts/modules/renderMacroOverview.js:1286` |
| CMBS | iShares CMBS ETF,商业抵押贷款支持证券 ETF | `data/radar-data.json:1561`,`data/radar-data.json:1564`,`scripts/modules/renderMacroOverview.js:1073`,`scripts/modules/renderMacroOverview.js:1281`,`scripts/modules/renderMacroOverview.js:1286` |
| WALCL | FRED 资产负债表总资产代码,美联储总资产 | `scripts/modules/renderMacroOverview.js:1437` |
| ON RRP | Overnight Reverse Repurchase Agreement,隔夜逆回购 | `data/radar-data.json:1617`,`data/radar-data.json:2170`,`data/radar-data.json:2370`,`data/radar-data.json:2375`,`scripts/modules/renderMacroOverview.js:1423` |
| QoQ | Quarter over Quarter,环比季度变化 | `data/radar-data.json:1249`,`data/radar-data.json:1250`,`data/radar-data.json:1524`,`scripts/modules/renderMacroOverview.js:1263`,`scripts/modules/renderMacroOverview.js:1266` |
| YoY | Year over Year,同比变化 | `data/radar-data.json:1323`,`data/radar-data.json:1326`,`data/radar-data.json:1356`,`scripts/modules/renderMacroOverview.js:1168`,`scripts/modules/renderMacroOverview.js:1203` |
| 4w-MA | 4-week moving average,4 周移动平均 | `scripts/modules/renderMacroOverview.js:1162`,`scripts/modules/renderMacroOverview.js:1165`,`scripts/modules/renderMacroOverview.js:1203`,`scripts/modules/renderMacroOverview.js:1206` |
| bp | basis point,基点 | `scripts/modules/renderMacroOverview.js:172` |
| pp | percentage point,百分点 | `scripts/modules/renderMacroOverview.js:206`;渲染输出如 `front-back`、`10Y-2Y`、`IG-HY` |
| Brent | North Sea Brent crude oil benchmark,布伦特原油基准 | `data/radar-data.json:50`,`data/radar-data.json:62`,`data/radar-data.json:64`,`data/radar-data.json:69`,`scripts/modules/renderMacroOverview.js:1357` |
| ULSD | Ultra-Low Sulfur Diesel,超低硫柴油 | `scripts/modules/renderMacroOverview.js:1088`,`scripts/modules/renderMacroOverview.js:1361`,`scripts/modules/renderMacroOverview.js:1707`,`scripts/modules/render.js:1069` |
| Platts | S&P Global Commodity Insights Platts,能源价格报告品牌/正式油价源 | `data/radar-data.json:50`,`data/radar-data.json:142`,`data/radar-data.json:204`,`data/radar-data.json:410`,`scripts/modules/renderMacroOverview.js:1374` |
| SEP | Summary of Economic Projections,美联储经济预测摘要 | `data/radar-data.json:1227`,`data/radar-data.json:1229`,`scripts/modules/renderMacroOverview.js:1042`,`scripts/modules/renderMacroOverview.js:1048`,`scripts/modules/renderMacroOverview.js:1113` |
| FOMC | Federal Open Market Committee,联邦公开市场委员会 | `data/radar-data.json:1212`,`data/radar-data.json:1227`,`scripts/modules/renderMacroOverview.js:1043`,`scripts/modules/renderMacroOverview.js:1044`,`scripts/modules/renderMacroOverview.js:1114` |
| DFF | Effective Federal Funds Rate,有效联邦基金利率 FRED 代码 | `data/radar-data.json:1227`,`data/radar-data.json:1229`,`scripts/modules/renderMacroOverview.js:1437` |
| QQQ | Invesco QQQ Trust,Nasdaq-100 ETF | `scripts/modules/renderMacroOverview.js:43`,`scripts/modules/renderMacroOverview.js:47`,`scripts/modules/renderMacroOverview.js:51`,`scripts/modules/renderMacroOverview.js:2420`,`scripts/modules/renderMacroOverview.js:2423` |
| NDX | Nasdaq-100 Index,纳斯达克 100 指数 | `scripts/modules/renderMacroOverview.js:2419`,`index.html:561` |
| IXIC | Nasdaq Composite Index,纳斯达克综合指数 | `scripts/modules/renderMacroOverview.js:2419`,`index.html:561` |
| VIX | Cboe Volatility Index,芝加哥期权交易所波动率指数 | `data/radar-data.json:71`,`data/radar-data.json:78`,`data/radar-data.json:241`,`data/radar-data.json:289`,`data/radar-data.json:384` |

## Section 4 · 未解释原始数据清单

| 数据族 | 当前显示形式 | 普通用户看不懂的原因 | 一句话简化建议 |
|---|---|---|---|
| 期货曲线类 | `ICE Brent futuresCurve structure-only: Jul26 / Aug26 ...; status=live_structure_only` (`scripts/modules/renderMacroOverview.js:1363`) | 只列合约月份和结构状态,没有说明"这说明油价近期更紧还是更松"。 | 改成"布伦特期货近月比远月更贵,说明市场仍担心近期供给/价格压力"。 |
| 期货曲线类 | `Yahoo Brent priced futures proxy ... front-back 20.09; slope=backwardation` (`scripts/modules/renderMacroOverview.js:1369`) | `front-back`、`backwardation` 未解释,用户不知道是风险上升还是下降。 | 改成"近月油价高于远月,通常表示短期供应偏紧"。 |
| 期货曲线类 | `ZQ monthly futures curve proxy` / `SR3 SOFR futures proxy` / `OIS public curve` (`scripts/modules/renderMacroOverview.js:1034-1040`) | 一屏内混合 Fed funds、SOFR、OIS,用户不知道三者都在表达利率预期。 | 合并成"市场预期未来利率大致维持高位/下行/上行"。 |
| 信用利差类 | `HY OAS 2.78%` (`scripts/modules/renderMacroOverview.js:1325`;`data/radar-data.json:71`) | 用户不知道高收益利差越高代表借钱越难、信用风险越高。 | 改成"较弱公司借钱的额外成本目前仍不高/正在升高"。 |
| 信用利差类 | `IG OAS 0.75%; IG-HY -2.03pp` (`scripts/modules/renderMacroOverview.js:1326`;`scripts/modules/renderMacroOverview.js:1424`) | 同时出现 IG、HY、OAS、pp,没有解释差值方向。 | 改成"优质企业债压力仍低于高收益债,信用压力未全面扩散"。 |
| 信用利差类 | `ICE CDX HY 107.987 / ICE CDX IG 102.1662` (`scripts/modules/renderMacroOverview.js:1329-1332`) | CDX 结算价没有单位和方向解释,普通用户完全无法判断高低。 | 改成"信用违约保险价格未显示全面恐慌/正在转紧"。 |
| 利率水平类 | `联邦基金利率 3.62%; SOFR 3.51%` (`scripts/modules/renderMacroOverview.js:1425-1426`) | 用户不知道官方政策利率和隔夜融资利率的区别。 | 改成"短期资金利率仍在约 3.5%-3.6%,融资环境不算宽松"。 |
| 利率水平类 | `BGCR-SOFR 0bp / TGCR-SOFR 0bp` (`scripts/modules/renderMacroOverview.js:1436`) | 回购利差和 bp 都未解释,用户不知道 0 是好是坏。 | 改成"回购市场暂未显示额外挤兑压力"。 |
| 利率水平类 | `Policy path proxy: target midpoint ... ZQ implied ... SEP current median ...` (`scripts/modules/renderMacroOverview.js:1786`) | target midpoint、ZQ implied、SEP median 三种口径并列,没有用户结论。 | 改成"官方利率和市场预期之间差距不大/存在偏差"。 |
| ETF 代理价格 | `VNQ 96.77; 4周变化 +1.3%` (`scripts/modules/renderMacroOverview.js:1275`) | ETF 价格和商业地产压力之间的关系未说明。 | 改成"公开房地产股票市场最近略有反弹/走弱,只能作参考"。 |
| ETF 代理价格 | `REM 21.72; 4周变化 -4.5%; CMBS 48.47; 4周变化 -0.8%` (`scripts/modules/renderMacroOverview.js:1278-1281`) | REM、CMBS 都是专业 ETF,用户不知道代表哪类房地产风险。 | 改成"抵押地产和商业地产债券代理指标近期偏弱/平稳"。 |
| ETF 代理价格 | `BIZD / PBDC / SRLN / CCLFX ... 4周变化` (`scripts/modules/renderMacroOverview.js:1315-1324`) | 多个 ticker 连续列出,没有说明它们共同代表私募信用压力。 | 改成"上市私募信贷代理整体未明显恶化/出现走弱"。 |
| 航运指数 | `BDTI 2185; 日变化 -1.35%` (`scripts/modules/renderMacroOverview.js:1395`) | BDTI 是油轮运费指数,没有解释与能源压力的关系。 | 改成"原油油轮运费仍处高位,但当天略回落"。 |
| 航运指数 | `BCTI 1668; 日变化 -0.36%` (`scripts/modules/renderMacroOverview.js:1398`) | 成品油轮指数与油价/通胀链条的关系未说明。 | 改成"成品油运输压力仍高,当天变化不大"。 |
| 航运指数 | `BDI 2991; 日变化 +0.91%` (`scripts/modules/renderMacroOverview.js:1401`) | 干散货指数不是普通新闻词汇,用户不知道它代表全球实物贸易温度。 | 改成"干散货运输需求略升,提示实物贸易/运费压力仍需观察"。 |

## Section 5 · 金融行话与状态短语清单

| 短语 | 当前在哪些场景出现 | 为什么对普通用户不友好 | 是否被 contract checker 锁定 |
|---|---|---|---|
| 数据降级，维持观察 | 今日总判断 state conclusion enum (`scripts/modules/renderMacroOverview.js:18`) | 用户不知道是数据坏了,还是风险要继续看。 | 是,`scripts/check-today-summary-card-contract.mjs:20-28` |
| 系统性风险观察 | 今日总判断 enum、stage scale (`scripts/modules/renderMacroOverview.js:19`,`scripts/modules/renderMacroOverview.js:2099`) | 听起来很严重,但没有解释"观察"与"危机"差别。 | 是,`check-today-summary-card-contract.mjs:22`;另被 `check-editorial-redesign-contract.mjs:300-303` 覆盖 |
| 局部冲击观察 | 今日总判断 enum、stage scale (`scripts/modules/renderMacroOverview.js:20`,`scripts/modules/renderMacroOverview.js:2098`) | "局部冲击"没有说明是市场、信用、能源还是地缘政治。 | 是,`check-today-summary-card-contract.mjs:23` |
| 压力上升观察 | 今日总判断 enum (`scripts/modules/renderMacroOverview.js:21`) | "压力"抽象,普通用户不知道该紧张什么。 | 是,`check-today-summary-card-contract.mjs:24` |
| 压力边际缓和 | 今日总判断 enum (`scripts/modules/renderMacroOverview.js:22`) | "边际"是金融行话,普通用户不常用。 | 是,`check-today-summary-card-contract.mjs:25` |
| 维持当前判断 | 今日总判断 enum (`scripts/modules/renderMacroOverview.js:23`) | 没有说明当前判断是什么,用户需要回读上下文。 | 是,`check-today-summary-card-contract.mjs:26` |
| 常态观察 | 今日总判断 enum (`scripts/modules/renderMacroOverview.js:24`) | "常态"和"观察"组合后仍然不说明风险水平。 | 是,`check-today-summary-card-contract.mjs:27` |
| 证据不足，等待确认 | 今日总判断 enum (`scripts/modules/renderMacroOverview.js:25`) | 比"现在看不清"更正式,但没有告诉用户等什么证据。 | 是,`check-today-summary-card-contract.mjs:28` |
| 压力较高 | `statusFromScore` 输出 (`scripts/modules/renderMacroOverview.js:378`) | 不知道压力来自哪里、对普通人有什么影响。 | 否,但相邻 stage 文案部分被 editorial checker 锁定 |
| 压力上升 | `statusFromScore` 和多个卡片 direction (`scripts/modules/renderMacroOverview.js:379`,`scripts/modules/renderMacroOverview.js:1349`) | 只说方向,没说风险是否已经危险。 | 部分,`check-editorial-redesign-contract.mjs:301` |
| 观察中 | `statusFromScore`、多个卡片默认状态 (`scripts/modules/renderMacroOverview.js:380`,`scripts/modules/renderMacroOverview.js:1123`) | 像系统内部待办,没有用户结论。 | 否 |
| 相对平稳 | `statusFromScore` 和私募信用方向 (`scripts/modules/renderMacroOverview.js:381`,`scripts/modules/renderMacroOverview.js:1309`) | "相对"参照物不明。 | 否 |
| 系统性危机 | `stageFromScore` explicit override (`scripts/modules/renderMacroOverview.js:386-398`) | 极强词汇,需要极清楚的定义和触发条件。 | 否,但 stage scale checker相邻 |
| 正常观察 | `stageFromScore` (`scripts/modules/renderMacroOverview.js:392`) | 正常还要观察,普通用户会疑惑。 | 是,`check-editorial-redesign-contract.mjs:300` |
| 滞胀冲击 / 通胀冲击 | `data/radar-data.json:15`;`data/radar-data.json:832-833` | 宏观经济学术语,不解释就像标题党。 | 否 |
| 方向待确认 | 多个 direction fallback (`scripts/modules/renderMacroOverview.js:408`,`scripts/modules/renderMacroOverview.js:1739`) | 没有告诉用户需要哪些数据确认。 | 否 |
| 边际上升 | `directionFromDelta` 默认 (`scripts/modules/renderMacroOverview.js:406`) | "边际"不口语。 | 否 |
| 边际回落 | `directionFromDelta` 默认 (`scripts/modules/renderMacroOverview.js:406`) | 需要改成"比上次低一点"才直观。 | 否 |
| 基本持平 | score change fallback (`scripts/modules/renderMacroOverview.js:225`,`scripts/modules/renderMacroOverview.js:411`) | 相对友好,但在风险分数场景仍缺少解释。 | 否 |
| 等待接入 | 全局 WAITING (`scripts/modules/renderMacroOverview.js:5`) | 用户可能以为自己网络没接上。 | 否 |
| 数据不足 | 全局 INSUFFICIENT (`scripts/modules/renderMacroOverview.js:6`) | 不说明是缺哪个数据、是否影响结论。 | 否 |
| 暂无法判断 | 全局 UNDECIDED、市场温度 fallback (`scripts/modules/renderMacroOverview.js:7`;`index.html:569`) | 结论可理解,但重复出现会让页面像故障页。 | 否 |
| 等待历史周线数据接入 | 市场温度等待状态 (`scripts/modules/renderMacroOverview.js:9`;`index.html:567`) | "周线"和"接入"都是专业/工程词。 | 可能,市场温度 checkers 会保护相关状态 |
| 等待数据校准 | score/update fallback (`scripts/modules/renderMacroOverview.js:219`,`scripts/modules/renderMacroOverview.js:3282`) | "校准"像模型训练,普通用户不知道何时恢复。 | 否 |
| 慢变量观察中 | 宏观驱动卡片 (`scripts/modules/renderMacroOverview.js:1123`,`scripts/modules/renderMacroOverview.js:1147`) | 慢变量是研究术语,不解释会显得玄。 | 否 |
| 周频观察中 | 零售消费卡片 (`scripts/modules/renderMacroOverview.js:1192`) | 用户不知道周频与判断可信度的关系。 | 否 |
| 季频观察中 | CRE 卡片 (`scripts/modules/renderMacroOverview.js:1245`) | 用户不知道季频意味着数据很慢、不能实时判断。 | 否 |
| 数据覆盖：关键数据不足 | 多个卡片 dataCoverage (`scripts/modules/renderMacroOverview.js:1126`,`scripts/modules/renderMacroOverview.js:1199`) | 像内部质检字段,不告诉用户能不能相信结论。 | 否 |
| 公开代理覆盖良好 / 部分覆盖 | 多个卡片 dataCoverage (`scripts/modules/renderMacroOverview.js:1311`,`scripts/modules/renderMacroOverview.js:1352`) | "代理覆盖"不是自然中文。 | 否 |
| 代理信号 | `sourceType` (`scripts/modules/renderMacroOverview.js:1342`,`scripts/modules/renderMacroOverview.js:1466`) | 用户不知道它比正式数据弱多少。 | 否 |
| 事实 + 代理信号 | 政策卡片 sourceType (`scripts/modules/renderMacroOverview.js:1466`) | 把事实和代理混在一起,普通用户难判断可信度。 | 否 |
| 待验证 | 信号分层/交叉验证计数 (`scripts/modules/renderMacroOverview.js:3310`,`scripts/modules/renderMacroOverview.js:3362`) | 没说要验证什么、怎么验证。 | 否 |
| 反向证据 | 多个卡片 sublist (`scripts/modules/renderMacroOverview.js:3070`,`scripts/modules/renderMacroOverview.js:3363`) | 逻辑词偏研究报告,需要改成"哪些现象和主结论不一致"。 | 否 |
| 噪音提示 | 信号分层和卡片 sublist (`scripts/modules/renderMacroOverview.js:3311`,`scripts/modules/renderMacroOverview.js:3071`) | 普通用户不知道噪音是数据误差、短期波动还是反例。 | 否 |
| 暂未扩散 | 压力来源计数 (`scripts/modules/renderMacroOverview.js:3295`) | "扩散"是风险传导术语,应说明"还没传到信用/股市/波动率"。 | 否 |
| 主要压力 | 压力来源卡片 (`scripts/modules/renderMacroOverview.js:646`;`scripts/modules/renderMacroOverview.js:3293`) | 只标重要性,没有说明压力对谁、来自哪里。 | 否 |

## Section 6 · 影响范围矩阵

IA 顺序按 `scripts/check-homepage-ia-contract.mjs:10-24` 和 `scripts/check-editorial-redesign-contract.mjs:153-169` 锁定的首页阅读路径整理。

| Section | 工程师术语 | 金融缩写 | 未解释数据 | 金融行话 | 严重度 |
|---|---|---|---|---|---|
| 今日总判断 | 高 | 中 | 中 | 高 | 极严重 |
| 压力来源 | 高 | 高 | 高 | 高 | 极严重 |
| 信号分层 | 中 | 高 | 中 | 高 | 严重 |
| 四大驱动 | 高 | 高 | 高 | 高 | 极严重 |
| 市场温度 | 中 | 高 | 中 | 高 | 严重 |
| 风险引擎 | 中 | 高 | 高 | 高 | 严重 |
| 交叉验证 | 高 | 高 | 中 | 高 | 严重 |
| 本期关键变化 | 中 | 中 | 低 | 高 | 中度 |
| 风险热力图 | 低 | 低 | 中 | 中 | 轻度 |
| 详细数据 | 高 | 高 | 高 | 高 | 极严重 |
| 世界秩序 | 高 | 中 | 中 | 高 | 严重 |
| 方法说明 | 中 | 低 | 低 | 高 | 中度 |
| 外部 AI | 高 | 中 | 中 | 高 | 严重 |
| 执行风控 | 高 | 中 | 高 | 高 | 极严重 |

严重度分布:

| 严重度 | Section 数 | Section |
|---|---:|---|
| 极严重 | 5 | 今日总判断、压力来源、四大驱动、详细数据、执行风控 |
| 严重 | 6 | 信号分层、市场温度、风险引擎、交叉验证、世界秩序、外部 AI |
| 中度 | 2 | 本期关键变化、方法说明 |
| 轻度 | 1 | 风险热力图 |
| 几乎无影响 | 0 | 无 |

## Section 7 · 与现有 contract checker 的冲突预警

扫描方法: 任务要求的 `grep -r "压力" "观察" "判断" "确认" scripts/check-*.mjs` 在 Windows PowerShell 下用等价命令执行:

```powershell
Get-ChildItem -LiteralPath .\scripts -Filter 'check-*.mjs' |
  Select-String -Pattern '压力|观察|判断|确认'
```

本节列出未来 M-93 V2 改文案最容易触发的 15 个 checker 冲突点。

| 冲突点 | checker / 行号 | V2 风险 |
|---|---|---|
| M-92A 今日卡片 8 个 state-conclusion enum 被硬锁 | `scripts/check-today-summary-card-contract.mjs:20-28`;渲染源 `scripts/modules/renderMacroOverview.js:17-26` | 改"数据降级，维持观察"等 8 个短语前必须同步更新 checker。 |
| M-92A 今日卡片 6 个 DOM selector 被硬锁 | `scripts/check-today-summary-card-contract.mjs:11-18`;`scripts/check-today-summary-card-contract.mjs:91-105` | DOM selector 不变时可改文案;若 V2 改卡片结构会失败。 |
| M-92A helper block 禁止 decision/execution/position/action 文案 | `scripts/check-today-summary-card-contract.mjs:31-46`;`scripts/check-today-summary-card-contract.mjs:141-146` | V2 简化不得把今日卡片写成交易/仓位/操作建议。 |
| M-92A 7日变化标签被检查 | `scripts/check-today-summary-card-contract.mjs:107-117` | 若把 `7日变化` 改成更口语的"一周变化",需同步 checker。 |
| 首页 14 项 IA label 和顺序被锁定 | `scripts/check-homepage-ia-contract.mjs:10-24`;`scripts/check-editorial-redesign-contract.mjs:153-174`;`scripts/check-mobile-first-fold-compaction.mjs:13-25` | 若 V2 要把"交叉验证/执行风控/外部 AI"改成普通话标题,会触发 IA checker。 |
| 旧 IA label 禁止回退 | `scripts/check-homepage-ia-contract.mjs:183`;`scripts/check-homepage-ia-contract.mjs:315-316` | 不能随意改回"核心判断/今日主判断"等旧标题。 |
| 宏观总览 header 静态结构被锁定 | `scripts/check-mobile-first-fold-compaction.mjs:174-184` | 改"宏观风险判断总览"或 header 结构会触发 mobile compaction checker。 |
| Editorial redesign checker 锁定 stage 文案 | `scripts/check-editorial-redesign-contract.mjs:291-304` | `正常观察 / 压力上升 / 局部冲击观察 / 系统性风险观察` 改名需同步 checker。 |
| Copy checker 锁定若干中文禁用词 | `scripts/check-copy-contract.mjs:35-69` | V2 不能重新引入"美元指数"、"十亿美元"、`Δ --` 等旧文案。 |
| M-91 market pricing 多资产状态和标签被锁定 | `scripts/check-market-pricing-multi-asset.mjs:14-23`;`scripts/check-market-pricing-multi-asset.mjs:128-129` | 改 NDX/IXIC 的"横向对照/广度参照"标签或 `display-only` 状态需同步 checker。 |
| M-91 NDX/IXIC 实现 checker 锁定辅助显示文字 | `scripts/check-market-pricing-ndx-ixic-implementation.mjs:189-194` | 改 `AUXILIARY · DISPLAY ONLY` 或 NDX/IXIC label 会触发。 |
| Market pricing first-fold/cross-validation checker 锁定 QQQ z-score 和矩阵 shape | `scripts/check-market-pricing-first-fold-integration-and-cross-validation-matrix.mjs:124-133`;`scripts/check-market-pricing-first-fold-integration-and-cross-validation-matrix.mjs:197-205` | V2 若隐藏或改写市场温度/z-score/交叉验证展示,需确认 checker 是否只检查源码或真实输出。 |
| Cross-validation education 文案被断言 | `scripts/check-cross-validation-education-appendix.mjs:53-59` | 改"一致性分数/金融常识/证据展示工具"等方法说明需同步 checker。 |
| Macro driver 说明文案被多个 checker 锁定 | `scripts/check-consumer-pmi.mjs:134-135`;`scripts/check-fed-liquidity-repo-spread.mjs:85-99`;`scripts/check-macro-drivers-employment.mjs:167`;`scripts/check-macro-drivers-commercial-real-estate.mjs:33` | V2 简化 CARTS/CARTSR、SLOOS、Claims、CRE 状态时,会碰到宏观驱动 checker。 |
| External AI 面板小标题被锁定 | `scripts/check-external-ai-frontend-hidden-scaffold.mjs:213-217` | 改"模型判断/证据来源摘要"等标题需同步 checker,且不能破坏 hidden scaffold 边界。 |

额外注意: `scripts/check-external-ai-output.mjs:50-70` 和 `scripts/check-world-order-stress.mjs:34-37` 禁止"已确认危机/战争已确认"一类危险表述。M-93 V2 即使做口语化,也不能把"观察"改成确定性结论。

## Section 8 · M-93 V2 spec 候选方向

方向 1: 删除原始数据,只保留高层中文解读。工作量: 中到高。Checker 影响: 最大,会碰到 market pricing、cross-validation、macro-driver、today-summary 多个 checker,因为很多 checker 期待现有标签和证据文本仍在源码或输出路径中。失去的能力: 审计者无法直接在页面核对具体数值,页面会更像新闻摘要,透明度下降。

方向 2: 原始数据 + 一句话中文解释并列。工作量: 中。Checker 影响: 中等,大多数现有 DOM/selector 可保留,只是在每个原始数据后增加普通话解释;若不改 locked enum 和 IA label,可减少 checker 改动。失去的能力: 页面会更长,但专业用户仍可看到原始证据。

方向 3: 默认隐藏专业数据,可点击展开。工作量: 高。Checker 影响: 高,需要确认 `detail-data`、macro overview cards、market temperature、cross-validation、external AI 的 DOM 结构是否仍满足现有 checker;也要防止 mobile first-fold 重新变高。失去的能力: 首屏更清楚,但审计证据从默认视野消失,需要展开才能核查。

方向 4: 词典悬停/点击解释术语。工作量: 中到高。Checker 影响: 中,如果只在现有文本旁加 `abbr`/tooltip 或说明按钮,DOM selector 可保持;但会引入新的可访问性和移动端 tap 行为要求。失去的能力: 不删除专业术语,只是降低理解门槛;对 60+ 用户可能仍嫌复杂。
