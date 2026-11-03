# Bubble ABS 与资本开支缺失证据：免费公开来源复核

复核日期：2026-11-03，新西兰日期。owner 要求研究免费公开来源、修复可修复问题、审核后上线并核验两站，明确不放宽证据或计分门槛。本次不调用 Wind、搜索计费接口或外部 AI，不绕过登录、付费墙、403或反爬机制。

## 资本开支：可修复的季度准入维护缺口

生产使用 ADR-0072 的固定四家季度财报关联，不是旧滚动收益或新闻数量代理。只读诊断4请求、0来源失败，四家公司均为`latest_quarter_not_reviewed`：七月清单之后的十月电话会已公开，但尚未经过逐项源审核。

本次已审材料：

| 公司 | 官方交叉材料 | 具名二手电话会 | 本年度指引及限制 |
|---|---|---|---|
| MSFT | [本季官方电话会](https://www.microsoft.com/en-us/investor/events/fy-2027/earnings-fy-2027-q1)、[官方日程](https://news.microsoft.com/source/2026/10/07/microsoft-announces-quarterly-earnings-release-date-69/)、[七月官方比较基线](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4) | [FY2027Q1](https://stockanalysis.com/stocks/msft/transcripts/718712-q1-2027/) | 当前日历年账面约170，对照先前175，反映第三方产能时移；不能说成经济投入削减或本季租赁重分类。保持同年度及租赁处理，不计为上调。 |
| META | [公司发布稿](https://www.prnewswire.com/news-releases/meta-reports-third-quarter-2026-results-302915964.html) | [Q3](https://stockanalysis.com/stocks/meta/transcripts/718643-q3-2026/) | 含融资租赁本金，130–145→135–145，仅下限上调。 |
| AMZN | [公司新闻稿](https://www.aboutamazon.com/news/company-news/amazon-earnings-q3-2026-report)、[公开日程](https://press.aboutamazon.com/2026/10/amazon-com-to-webcast-third-quarter-2026-financial-results-conference-call) | [Q3](https://stockanalysis.com/stocks/amzn/transcripts/720308-q3-2026/) | 年度现金资本开支维持220；不能把2027年投入方向当作2026年上调。 |
| GOOGL | [公司CEO电话会文章](https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q3-2026/) | [Q3](https://stockanalysis.com/stocks/googl/transcripts/712854-q3-2026/) | 2026年度195–205维持。文章核对事件/时点，CFO金额仍明确归因二手电话会文本。 |

表中金额保留原始USD billion单位，仅用于审阅，前端继续按项目的“亿美元”规则格式化。四家会计基础不同，不能横向相加。官方调用时段/文章发表时点不是首次指引披露或因果证明。

本机对`ir.aboutamazon.com`的一次请求返回403，停止该主机，不跟重定向、不重试或代理绕过。独立公开的公司新闻站与press中心均返回200，完整官方身份/指引/日程可验证。不是把403换成成功诊断。

实际新面板20次免费请求、约4.8MB、0失败、4家公司完整通过，沿用同一纽约交易日历、原价格窗口及复权历史价格重放。仅Meta是上调，个股相对QQQ约−4.1191pp，未超过原−5pp严格门槛；其他三家不计上调受罚。原规则得到黄灯，不输出绿色或改变门槛。原始HTML只存本地ignored研究目录，仓库/Actions仅保存派生事实、摘要、哈希及链接。

## ABS：公开背景存在，合格报价链仍缺

当前 r1 要求同一美国数据中心ABS债项、同一分层和USD币种的三次市场收益率观测；债券与基准同日、期限差≤0.1年，最新≤21天，4周间距20–40天、12周间距75–95天，并分别完成来源权利及核心代表性审阅。不能缩分母或让ABS/CMBS/公司债跨品种互换。

| 免费公开候选 | 能证明什么 | 本次不能填核心的原因 |
|---|---|---|
| [L&G自有投研](https://am.landg.us.com/insights/insights-blog/2026/securitized-credit-financing-data-centers/) | 数据中心ABS发行及新发行利差背景 | 新发行区间与典型WAL是横截面背景，未给同一债项三期市场收益率及同日基准。 |
| [BBH自有季度投研](https://www.bbh.com/us/en/insights/capital-partners-insights/bbh-structured-fixed-income-quarterly-update-q3-2026.html) | 截至9月末的部门变化和ABS/CMBS区分 | 年度部门价差变化不是4/12周同债项观测，不把行业39bp写成本指标的4周变化。 |
| [FINRA公开投资者说明](https://syndication.finra.org/content/bond-investing-and-due-diligence) | TRACE交易查询存在、成交及流动性限制 | 本轮未取得可匿名有界复现、覆盖指定数据中心债项/分层及三期匹配基准的合格链；有成交价本身不补造收益率或固定现金流假设。 |
| [FINRA增强历史数据说明](https://www.finra.org/sites/default/files/TRACE_Enhanced_Historical_Data.pdf) | 交易级历史产品的时滞及权利条件 | 官方说明证券化产品延迟18个月，须历史数据协议并缴费；不能满足本任务免费与最新≤21天要求。没有订阅、安装或调用此产品。 |

结论为“本次未找到合格的免费报价链”，不是断言全球不存在公开数据。评级、票息、发行价格、行业指数或中国通用ABS收益率均不冒充同债项市场利差。`approvedAbsSourceReviews=[]`、`absObservation=null`保持原样，待将来真实、可复核的候选独立审阅。

## 发布顺序与验收

先按[ADR-0083](ADR/0083-bubble-october-capex-source-continuation.md)完成独立来源/校验准入，保留七月旧路径和全部断言；通过后另开运行接线及既有四项资格定向刷新入口。正式数据必须重新免费采集并通过完整checker，研究产物不可晋升。ABS、内部人、资本开支、Fed四项沿用同日证明合同重新免费核验，其它23卡保留原观测；完整刷新锚点及模型计分规则保持。若合格面板发布，覆盖可从21/23变为22/23，ABS缺口仍保留；实际结果以正式运行与两站实物为准。

评分披露变化会使既有AI周评的精确快照绑定失效，按原合同隐藏并回退确定性正文。不得修改旧AI稿的快照或as-of，不额外调用收费AI来补齐。
