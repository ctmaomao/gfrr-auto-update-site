# Transport Shock Free Freight Alternative Source Review

Contract version: `transport-shock-free-freight-alternative-source-review-v1`  
Status: `source_review_free_alternatives_no_route_freight_confirmation`  
Scope: P-score-44 source-review only.

## 2026-09-08 免费替代源复核结论

Owner 已授权依次调查、实施可做事项、验证、commit+push、独立 AI 审阅后合并。本项完成来源复核，不新增采集器、付费、发信、来源替换或生产写入。下文英文分类及 fixture 保留 P44 历史范围；其中 `eligibleForMainScore=false` 不撤销后来 P50/P51 已批准的窄范围 PortWatch free-proxy 入分（live、age≤7 天及既有资格/压力条件满足才 +1/+2/+3，最大 +3，默认 0），见[现行 runtime 规则](AGENT_DOMAIN_BOUNDARIES.md#transport-runtime)。`routeFreightConfirmation` / `marketConfirmation` 仍为 `not_connected`。

**结论：本次检查的渠道中，没有确认同时满足免费、允许自动读取与公开使用、时效合格、口径等价的 StockQ/Baltic 替代源。** 公开浏览和免费延迟报价不能直接等同于自动缓存/公开 JSON/衍生展示许可。以下为项目接入决策，不是法律意见，也不是对所有潜在来源已穷尽的声明。

| 已查官方依据 | 可确认内容与限制 | 当前处理 |
|---|---|---|
| [Baltic Data Policy](https://www.balticexchange.com/en/site-services/data-policy.html)（2025-11）及 [Non-Display](https://www.balticexchange.com/en/data-services/Non-Display.html) | 许可按用途限定；vendor/channel partner 不自动转授公开、再分发或衍生使用权。未发现个人非商业公开仪表盘自动豁免。官方数据合作联系为 `data.partners@balticexchange.com` | 不从镜像绕过权利；需覆盖自动读取、留存和公开衍生成果的具体许可，不接受付费协议 |
| [CME market-data 条款](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html)及 [settlement FAQ](https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html) | 免费延迟/午夜后查看不代表程序提取与再分发许可；自动交付及其它使用仍受对应许可约束 | 维持 link-only，不新增延迟报价 scraper 或把期货结算当路线现货评估 |
| [Solactive disclaimer](https://www.solactive.com/disclaimer/) | 公开指数内容仍受复制、存储及再分发限制，未确认适用的自动使用许可 | Breakwave Wet Freight 继续参考链接，不能作为免费机器替代源上线 |
| [NOAA MarineCadastre AIS FAQ](https://coast.noaa.gov/data/marinecadastre/ais/faq.pdf)（2026-06） | 主要覆盖美国水域/陆基接收范围，不是全球卫星 AIS；AccessAIS 历史数据按季度更新，FAQ 报告总滞后约 145–165 天。衍生产品可按其用途/引用条件评审，但不等于任意原始再分发授权 | 不满足 7 天 freshness，也不覆盖霍尔木兹/红海实时路线运价；不下载大体量 AIS 来伪装等价数据 |
| [Panama 官方统计入口](https://pancanal.com/transparencia/) | 有月度/财年累计通行统计，但不是运价。developer 门户的可用具体 API、资源级条款和字段尚未核实；不把其它子站条款迁移为 API 授权 | 最多是后续慢频物理背景候选，本项不新增读取/解析 |
| [StockQ 公共入口](https://www.stockq.org/) | 可见页面不证明底层 Baltic 数据的自动读取/公开使用权；没有找到可确认的等价免费授权通道 | 不通过反混淆或其它镜像恢复值；也不借本次调查删除/合并既有来源，退役仍需独立评审 |

### 实际基线与下一步

本地已提交 `data/radar-data.json` 的 `updatedAt=2026-09-08T00:35:49.288Z`，其中 shippingFreight 的 BDTI/BCTI 仍是 2026-08-10 fallback，BDI 缺失；这不是当前实时行情。PortWatch chokepoints 的 source status 为 live，但 latestAgeDays=9，不能仅凭 live 文案宣称满足 7 天门槛。本次不更改数据日期、空值、fallback、评分或现有 checker，不扩展 ODP/Brent/Heatmap/cross-validation/Bubble Watch。

现行免费物理代理继续按已批准契约运行，不升级为路线运价确认。新的可实施替代源至少须给出具体产品/endpoint、范围/频率、费用、留存期限、公开 JSON 与衍生成果权利及署名条件，并通过粒度、现货/期货、时效、缺失与修订口径复核。若有明确免费许可或合适的官方开放 API，再做有界读取、失败隔离及独立来源接入评审；若只有历史船流量或需付费的运价，不声称已解决等价替代。本轮来源复核可关闭，**来源恢复/替换仍受外部许可和数据适用性阻塞**。

## Census monthly shadow intake (2026-11-20)

The [U.S. Census import archive](https://www.census.gov/foreign-trade/data/dataproducts.html) provides a separate national monthly cost measure. From the [IMP_COMM layout](https://www.census.gov/foreign-trade/reference/products/layouts/imdb.html), sum same-month U.S. general vessel shipping weight and [import charges](https://www.census.gov/foreign-trade/reference/definitions/index.html) across HTS10 codes starting `270900`, then calculate `charges_usd × 1000 / weight_kg`. Charges include freight, insurance and other transport costs, not duties. This is not a route, tanker class, spot assessment, TCE or clean freight-only series; origin mix and insurance can move it.

Run `python3 tools/oil-directional/fetch-census-import-cost.py 2025-11` to read just the public national commodity member by bounded HTTPS ranges. The November 2025 archive independently reproduced **US$17.17245/metric tonne** (US$139,629,980 / 8,131,046,060 kg). The September 2026 archive returned **US$22.51436/metric tonne** in five requests with 2,754,234 response bytes. With no strong ETag, the collector checks matching ZIP member directory metadata before and after reading and validates its CRC; the second directory request may be served by a CDN cache. It records the extracted member hash and all observed range modification clocks, not an immutable upstream edition. No raw archive or records were saved. The independent [monthly workflow](../.github/workflows/census-import-cost-shadow.yml) defaults to the statistical month two months prior and archives only successful derived summaries for 30 days; it never rewrites the site or the last good data. It records statistical month, archive evidence and retrieval time separately, not first publication or point-in-time availability. No credentials, paid service, model input or production publish hook.

VLCC's public [route CSV](https://github.com/Data4ThePeople/VLCC/blob/main/data/baltic_td3c_weekly.csv) includes vintage-sensitive estimates. Its August 14, 2026 Worldscale value was reconstructed from the August 21 report, and its TCE interpolated. Row date is not knowledge date; exclude these estimates from a primary walk-forward test and require per-metric first-known evidence on all observed rows. GFRR already uses its own upstream Brent/WTI inputs; a mirror of them is not an independent signal.

Before score use: compare detection and incremental false alerts against existing PortWatch on frozen independent disruption/control windows with capped-score ablation. Before oil forecast use: use a separate preregistered horizon, lag-aware walk-forward test, skill against the existing oil model and a naive baseline, and uncertainty; do not use revised archives as first-release vintages. The Census job is only a research input for those tests, not an authorization to activate either model path.

## Purpose

This review defines the legal free-source fallback path when licensed Baltic TD/TC route assessment values are unavailable.

It does not approve unauthorized scraping, route freight confirmation, production writes, frontend changes, workflow automation, or score writes. It only classifies which public sources can support a future low-weight free proxy review.

## Source Classification

### Automatable Or Already Connected Context

- IMF PortWatch Daily Chokepoints Data: usable as public AIS-derived chokepoint physical proxy, already aligned with `macroDrivers.energyTransport`; it is not route-level tanker freight pricing.
- StockQ BDTI/BCTI/BDI: usable as broad public freight context already displayed elsewhere; it is not route-level TD/TC confirmation.
- EIA / IEA chokepoint exposure pages: usable as static exposure and weighting context; they are not live route freight prices.

### Candidate After Separate Source-Terms Review

- NOAA MarineCadastre AIS: public AIS CSV data for U.S. waters; useful for U.S. Gulf tanker movement proxy, not Hormuz/Bab el-Mandeb route freight. Any use must be low-frequency and compact-derived, not raw AIS redistribution.
- Suez Canal Authority / Panama Canal Authority statistics: official canal transit statistics can support slow chokepoint context after parser/source-term review; they are not oil tanker freight prices.

### Link-Only / Manual Reference

- CME TD3C delayed product page: route-relevant public product page, but automated scraping/caching of delayed market values is not approved by this review.
- ICE TD3C product page: route-relevant product reference, but automated value capture is not approved by this review.
- Solactive Breakwave Wet Freight Futures Index: public index reference; automated value capture is not approved by this review without a separate terms review.

### Blocked Without Rights

- Baltic daily TD/TC route assessment values remain blocked without explicit source rights.
- Third-party pages that mirror TD/TC values remain blocked for automated scraping or value redistribution unless their terms explicitly allow it.

## Resulting Free Proxy Path

The only acceptable path is a `free_transport_pressure_proxy`, not a `route_freight_confirmation`.

Allowed future ingredients:

- PortWatch chokepoint freshness and deviation.
- StockQ broad tanker freight direction.
- Static EIA/IEA chokepoint exposure weights.
- Optional NOAA/Suez/Panama slow physical context after separate source-term review.
- CME/ICE/Solactive link-only manual references for operator review.

Hard limits:

- `routeFreightConfirmation` must remain `not_connected`.
- `eligibleForMainScore` remains `false`.
- Any future score design must stay capped by the existing free-proxy low-weight design.
- Unauthorized Baltic/TD/TC scraping is not approved.

## Current Decision

P-score-44 does not change:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- production `macroDrivers.energyTransport`
- frontend
- workflow / Worker runtime
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is a separate artifact-only free-proxy policy or source-terms review for NOAA/Suez/Panama/CME/ICE/Solactive. It still cannot clear `route_freight_confirmation`.
