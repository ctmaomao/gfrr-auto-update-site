# Data Sources

> 项目所有外部数据源的边界手册。
> 任何新增数据源前必读;任何"为什么 X 不该影响 scoring"的疑问先查本文。
>
> **维护规则**:新接入数据源时,在本文档主表追加一行 + 在反向索引补充消费层映射。

## 主表 (按数据源驱动)

### FRED — Federal Reserve Economic Data

| 字段 | 值 |
|---|---|
| **License** | 公开,需 API key (`FRED_API_KEY` env) |
| **Quota** | ~120 req/min,Daily pipeline 一轮 ~18 次调用,余量充裕 |
| **Refresh 频率** | Daily pipeline (`build-daily-radar-data.yml`) |
| **失败 fallback** | `displayInputsBaseline` 保留上次值;`source: 'fred-stale'` 标记 |
| **影响 scoring?** | **是** — Brent/Fed liquidity/credit/consumer 等核心 driver 都来自 FRED |
| **fetcher** | `scripts/run-daily-pipeline.mjs` 内 `fetchFredSeries(seriesId, days)` |

**当前消费的 series**:

| Series ID | 含义 | 消费层 | Milestone |
|---|---|---|---|
| `DCOILBRENTEU` | Brent crude oil spot (USD/bbl) | Brent main value (anchor) | 长期 |
| `DGS10` / `DGS2` / `T10Y2Y` | US Treasury yields + 10y2y spread | macroDrivers.fedLiquidity | 长期 |
| `BAMLH0A0HYM2` | HY OAS (high-yield bond spread) | macroDrivers.credit, macroDrivers.privateCreditProxy, cross-validation | 长期 / M-74 |
| `BAMLC0A0CM` | IG OAS (investment-grade spread) | macroDrivers.credit, macroDrivers.privateCreditProxy | 长期 / M-78 |
| `DFF` | Effective federal funds rate | macroDrivers.fedLiquidity | M-41 |
| `SOFR` | Secured overnight financing rate | macroDrivers.fedLiquidity | M-41 |
| `WRESBAL` | Bank reserve balances (weekly Wed, NSA, M USD) | macroDrivers.fedLiquidity, B4 financial fragility | M-42 |
| NY Fed secured rates API `BGCR` / `TGCR` | NY Fed reference repo rates,派生 BGCR-SOFR / TGCR-SOFR spread | macroDrivers.fedLiquidity, repo_stress narrative | M-50 / M-73 |
| `DRTSCILM` / `DRTSCIS` | SLOOS C&I loan tightening (large/medium + small firms, quarterly) | macroDrivers.credit, liquidity_tightening narrative | M-46 |
| `NFCI` | Chicago Fed National Financial Conditions Index (weekly) | macroDrivers.credit, credit_spread_warning narrative | M-48 |
| `DHOILNYH` | NY Harbor ULSD spot (daily);派生 diesel crack spread = ULSD×42 − Brent | brentPricingLayer, energy_shock narrative | M-49 |
| `UMCSENT` | U Michigan consumer sentiment (monthly) | macroDrivers.consumer | 长期 |
| `ICSA` | Initial Jobless Claims (SA, weekly) | macroDrivers.employment | M-68 |
| `CCSA` | Continuing Claims (SA, weekly, 1w lag) | macroDrivers.employment | M-68 |
| `JTSJOL` | JOLTS Job Openings (monthly, ~6w lag) | macroDrivers.employment | M-68 |
| `CES0500000003` | Average Hourly Earnings of All Employees, Total Private (monthly) | macroDrivers.employment | M-73 |
| `U6RATE` | U-6 labor underutilization rate (monthly) | macroDrivers.employment | M-73 |
| `MANEMP` / `USCONS` / `USTRADE` / `USTPU` / `USPBS` / `USEHS` / `USLAH` / `USFIRE` / `USINFO` / `USMINE` / `USGOVT` | Public payroll industry basket for monthly diffusion proxy | macroDrivers.employment | M-73 |
| `CARTS` | Chicago Fed Advance Retail Trade Summary, nominal (SA, weekly) | macroDrivers.consumerRetail | M-69 |
| `CARTSR` | Chicago Fed CARTS, real (inflation-adjusted, weekly) | macroDrivers.consumerRetail | M-69 |
| `MRTSSM441USN` / `MRTSSM442USN` / `MRTSSM443USN` / `MRTSSM444USN` / `MRTSSM445USN` / `MRTSSM446USN` / `MRTSSM447USN` / `MRTSSM448USN` / `MRTSSM451USN` / `MRTSSM452USN` / `MRTSSM453USN` / `MRTSSM454USN` / `MRTSSM722USN` | FRED MRTS monthly retail trade segment basket | macroDrivers.consumerRetail | M-74 |
| `DRCRELEXFACBS` | CRE Loan Delinquency Rate (quarterly) | macroDrivers.commercialRealEstate | M-70 |
| `CORCREXFACBS` | CRE Loan Charge-off Rate (quarterly) | macroDrivers.commercialRealEstate | M-70 |
| `SUBLPDRCSN` | SLOOS Nonfarm Nonresidential CRE Tightening (quarterly) | macroDrivers.commercialRealEstate | M-70 |
| `SUBLPDRCSC` | SLOOS Construction/Land Development CRE Tightening (quarterly) | macroDrivers.commercialRealEstate | M-70 |
| `SUBLPDRCSM` | SLOOS Multifamily CRE Tightening (quarterly) | macroDrivers.commercialRealEstate | M-70 |
| `CREACBW027SBOG` | Commercial Real Estate Loans, All Commercial Banks, SA (weekly, USD billions) | macroDrivers.commercialRealEstate | M-84 |
| `DFEDTARL` / `DFEDTARU` / `DFF` | Fed target range lower/upper and effective fed funds rate | macroDrivers.policyExpectations | M-74 |
| `BAMLH0A0HYM2` / `BAMLC0A0CM` | ICE BofA US HY / IG OAS cash-bond spread proxy | macroDrivers.privateCreditProxy | M-74 / M-78 |
| `CheckMySwap USD OIS public curve` | USD OIS curve from DTCC/CFTC public swap data | macroDrivers.policyExpectations.oisForwardCurve | M-80 |
| `PBDC` / `SRLN` | Listed BDC / senior-loan ETF public proxies | macroDrivers.privateCreditProxy | M-80 |
| `CCLFX` | Cliffwater Corporate Lending Fund public interval-fund NAV proxy via Yahoo chart | macroDrivers.privateCreditProxy | M-83 |
| `CMBS` | iShares CMBS ETF public proxy | macroDrivers.commercialRealEstate | M-80 |
| `ICE:CDX-index-settlement-public` | ICE Clear Credit public CDX index EOD settlement price | macroDrivers.privateCreditProxy | M-81 |

**注意**: NFCI 正值=收紧、负值=宽松,**方向与 IG/HY OAS 相反**。误判方向会让 cross-validation 完全反向。

**M-69/M-77/M-79 注意**: `CARTSP` 价格指数 未接,future scope only；`macroDrivers.consumerRetail` 使用 `CARTS` / `CARTSR`、MRTS 细分零售、BoA Consumer Checkpoint 公开 HTML 摘要与 Trading Economics Redbook public HTML 摘要。BoA Consumer Checkpoint 不是 Redbook；Redbook public HTML 不是 Redbook raw subscription feed；两者都不是 BoA 原始卡明细或非公开 raw feed。

**M-70/M-81/M-83/M-84 注意**: `macroDrivers.commercialRealEstate` M-84 起可读取 FRED `CREACBW027SBOG` public aggregate CRE loan balance proxy,但仍不接 non-public CRE loan tape / private CRE marks,不代表 CDX 或 私募信贷数据。M-81 起 `macroDrivers.privateCreditProxy` 可读取 ICE Clear Credit public CDX index EOD settlement price,但不得写成 private credit marks 或完整 licensed Markit history database。M-83 起可读取 Yahoo `CCLFX` public interval-fund NAV proxy,但不得写成 private credit marks、fundraising data、Cliffwater Direct Lending Index licensed dataset 或非公开私募贷款估值。

**M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85 注意**: `macroDrivers.policyExpectations` 直接读取 FRED target range / DFF、Federal Reserve SEP accessible table + FOMC statement/minutes、Yahoo `ZQ=F` front Fed funds futures proxy、Yahoo ZQ monthly futures proxy curve、Yahoo SR3 monthly SOFR futures proxy curve 与 CheckMySwap USD OIS public curve；`macroDrivers.shippingFreight` 读取 StockQ `BDTI` / `BCTI` / `BDI` 公开页面；`macroDrivers.privateCreditProxy` 读取 Yahoo `BIZD` / `PBDC` / `SRLN` / `CCLFX`、FRED HY/IG OAS cash-bond proxies 与 ICE public CDX index settlement；`macroDrivers.commercialRealEstate` 读取 Yahoo `VNQ` / `REM` / `CMBS` 与 FRED `CREACBW027SBOG` public aggregate exposure proxy；`brentPricingLayer.iceFuturesPriceCurve` 读取 ICE Brent public delayed last-price curve；`brentPricingLayer.eiaBrentSpotProxy` 读取 EIA Europe Brent Spot Price FOB public HTML。CheckMySwap 是 public OIS curve,不得写成 proprietary dealer forward curve；ICE CDX public settlement 与 CCLFX NAV proxy 不得写成 private credit marks；FRED `CREACBW027SBOG` 不得写成 non-public CRE loan tape；ICE Brent public delayed curve 不得写成 official settlement curve 或 Platts；EIA Brent spot proxy 不得写成 Platts Dated Brent 或正式 Dated Brent。

---

### ISM — Institute for Supply Management

| 字段 | 值 |
|---|---|
| **License** | Public web reports,no API |
| **Source URL** | `https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/` |
| **Quota** | 低;Daily pipeline only |
| **Refresh 频率** | Monthly;ISM 通常每月第一个工作日发布 Manufacturing PMI report |
| **失败 fallback** | `prevConsumer` carry-over 或 null + `source_unavailable` / `parse_error` |
| **影响 scoring?** | **否** — audit-only / display-only |
| **fetcher** | `scripts/run-daily-pipeline.mjs::fetchIsmManufacturingPmiReport` |

M-67 起,ISM Manufacturing PMI 直接解析 ismworld.org 公开 HTML:fetcher 使用 `User-Agent: GFRRBot/1.0`,不尝试 SSO/login/captcha 绕过,只提取 headline PMI 与 last-12-month table,不保存完整 HTML。失败只降级 `macroDrivers.consumer.sourceStatus.pmi`,不得伪造 PMI 或用相似指标冒充。

---

### Yahoo Finance

| 字段 | 值 |
|---|---|
| **License** | 公开;非官方 API,需 User-Agent + Referer 头 |
| **Quota** | 无明确限制,但建议 < 1 req/sec |
| **Refresh 频率** | Realtime worker (high freq) + Daily pipeline 兜底；Market Pricing NDX/IXIC 仅走 Daily/manual history refresh |
| **失败 fallback** | 失败时记录 `previewFetchStatus`,主 worker preview 不写入;前端通过 strict gate 回退 |
| **影响 scoring?** | **仅 Brent**:Yahoo `BZ=F` 作为 Brent fresh confirmation(M-D-5+);**其他 secondary 不影响 scoring** |
| **fetcher** | Worker secondary: `workers/gfrr-realtime-worker/src/worker-market-preview.js`;Market Pricing NDX/IXIC: `scripts/market-pricing/ndx-ixic-yahoo-history-refresh.mjs` |

**当前消费的 symbol**:

| Symbol | 含义 | 用途 |
|---|---|---|
| `BZ=F` | Brent crude futures | Brent fresh confirmation (D-5),与 FRED + TE 取一致 |
| `^GSPC` | S&P 500 index | secondary diagnostics only (不影响 scoring,M-E-4) |
| `^NDX` | Nasdaq 100 index | `marketPricingHistory.assets.ndx` Daily/manual history refresh;QQQ primary 的辅助横向对照,不进 Worker/scoring |
| `^IXIC` | Nasdaq Composite index | `marketPricingHistory.assets.ixic` Daily/manual history refresh;Nasdaq 广度参照,不进 Worker/scoring |
| `^TNX` | US 10Y treasury yield | secondary diagnostics only;`rawValue > 20` 时按 `divide-by-10` 归一化 (E-3A) |
| `GC=F` | Gold futures | secondary diagnostics only (E-1) |
| `DX-Y.NYB` | DXY 美元指数 | secondary diagnostics only (E-2) |

---

### Stooq

| 字段 | 值 |
|---|---|
| **License** | 公开 CSV,需 User-Agent |
| **Quota** | 无明确限制 |
| **Refresh 频率** | Realtime worker + Daily pipeline 多源 cross-check |
| **失败 fallback** | sourceProbe diagnostic only |
| **影响 scoring?** | **否** — D-8B 后只保留 sourceProbe;不参与 Brent consensus/promotion |
| **fetcher** | `workers/gfrr-realtime-worker/src/worker-market-preview.js` (CSV `https://stooq.com/q/d/l/?s=<symbol>&i=d`) |

---

### Cboe — VIX

| 字段 | 值 |
|---|---|
| **License** | 公开 |
| **Quota** | 低,30 分钟 1 次刷新 |
| **Refresh 频率** | Secondary preview 链路独占,主 worker KV 写成功后才低频尝试 |
| **失败 fallback** | secondary unavailable payload;不影响主 preview |
| **影响 scoring?** | **否** — secondary diagnostics only |
| **fetcher** | Worker `worker-market-preview.js` (v28.0D-3) |

---

### Trading Economics — Brent

| 字段 | 值 |
|---|---|
| **License** | 公开 web page;无 official API key (project 用 scraper) |
| **Quota** | 低频,只在 Brent confirmation 时调用 |
| **Refresh 频率** | Realtime worker |
| **失败 fallback** | `tradingeconomics-observedAt-invalid` / `tradingeconomics-confirmation-stale` 会 hold Brent promotion (M-G-4C 后是 hard gate) |
| **影响 scoring?** | **仅 Brent promotion gate**:G-4C 之后,Brent promotion 需要 Yahoo fresh + TE observedAt fresh;TE observedAt 不可解析或 > 48h 会 hold promotion |
| **fetcher** | Worker `worker-market-preview.js` |

⚠️ **不得**在 G-4B 前把 TE freshness 升级为 hard gate;旧 PR #53 已 superseded。

---

### Google Finance — Brent (deprecated)

| 字段 | 值 |
|---|---|
| **License** | 公开;非官方 |
| **影响 scoring?** | **否** — D-8B-lite sourceProbe only;不进入 Brent consensus 或 promotion |
| **状态** | diagnostic-only,**不得升级为 validation source**,除非另开版本连续验证 |

---

### Yahoo / StockQ / Federal Reserve / BoA / Redbook / CheckMySwap / ICE public macro-driver inputs (M-74 / M-77 / M-78 / M-79 / M-80 / M-81 / M-82 / M-83 / M-84)

| Source | Layer | Role |
|---|---|---|
| Yahoo `ZQ=F` | `macroDrivers.policyExpectations` | front Fed funds futures proxy |
| Yahoo `ZQ-monthly-futures` (`ZQ{month}{year}.CBT`) | `macroDrivers.policyExpectations.fedFundsFuturesCurve` | Fed funds futures monthly proxy curve; not OIS forward |
| Yahoo `SR3-monthly-SOFR-futures` (`SR3{month}{year}.CME`) | `macroDrivers.policyExpectations.sofrFuturesCurve` | Three-Month SOFR futures monthly proxy curve; not OIS forward |
| CheckMySwap USD OIS public curve | `macroDrivers.policyExpectations.oisForwardCurve` | USD OIS public curve from DTCC/CFTC public swap data; not proprietary dealer forward curve |
| EIA Europe Brent Spot Price FOB | `brentPricingLayer.eiaBrentSpotProxy` | public Brent spot price proxy; not Platts Dated Brent or formal Dated Brent |
| ICE Brent public contract-data | `brentPricingLayer.iceFuturesPriceCurve` | Brent futures delayed last-price curve; not official ICE settlement curve or Platts |
| Yahoo `BZ{month}{year}.NYM` | `brentPricingLayer.futuresPriceCurve` | Brent monthly futures priced proxy; not ICE official settlement curve or Platts |
| Yahoo `BIZD` | `macroDrivers.privateCreditProxy` | listed BDC / private-credit public proxy |
| Yahoo `PBDC` | `macroDrivers.privateCreditProxy` | second listed BDC public proxy; not private marks |
| Yahoo `SRLN` | `macroDrivers.privateCreditProxy` | senior loan ETF public proxy; not CDX or private marks |
| Yahoo `CCLFX` | `macroDrivers.privateCreditProxy.intervalFundNavPrice` | Cliffwater Corporate Lending Fund public interval-fund NAV proxy; not private credit marks or fundraising data |
| ICE `CDX-NAHY*-5Y` / `CDX-NAIG*-5Y` public index settlements | `macroDrivers.privateCreditProxy` | CDX NA HY/IG 5Y public EOD settlement price; not private credit marks or full licensed Markit history |
| Yahoo `VNQ` | `macroDrivers.commercialRealEstate` | public REIT market proxy |
| Yahoo `REM` | `macroDrivers.commercialRealEstate` | mortgage REIT market proxy |
| Yahoo `CMBS` | `macroDrivers.commercialRealEstate` | commercial MBS ETF public proxy; not non-public CRE loan tape |
| FRED `CREACBW027SBOG` | `macroDrivers.commercialRealEstate.creLoanBalance` | weekly public aggregate bank CRE loan balance / exposure stock proxy; not non-public CRE loan tape |
| StockQ `BDTI` / `BCTI` / `BDI` | `macroDrivers.shippingFreight` | shipping / freight / oil tanker freight pressure proxy |
| Federal Reserve `fomcprojtablYYYYMMDD.htm` | `macroDrivers.policyExpectations` | Fed dot plot federal funds median proxy from SEP accessible table |
| Federal Reserve `monetaryYYYYMMDDa.htm` | `macroDrivers.policyExpectations` | FOMC policy text tone count |
| Federal Reserve `fomcminutesYYYYMMDD.htm` | `macroDrivers.policyExpectations` | FOMC minutes keyword NLP tone/topic count |
| BoA Consumer Checkpoint public HTML | `macroDrivers.consumerRetail` | card spending per household YoY / ex-gas YoY public summary |
| Trading Economics Redbook public HTML | `macroDrivers.consumerRetail.redbookRetailSalesYoY` | Redbook same-store sales YoY public summary; not Redbook raw subscription feed |

These M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85 sources are audit-only / display-only. They must not change Brent promotion, scoring, decision, execution, position, Worker runtime, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation. Private credit marks, Redbook raw subscription feed, BoA raw card feed, Platts Dated Brent, official ICE Brent settlement curve, proprietary dealer OIS forward, and non-public CRE loan tape remain unconnected or `manual_required`.

---

### Brent physical / term / freight public proxy candidates (M-71 source review only)

| Candidate | Source family | Review role | Status |
|---|---|---|---|
| EIA Europe Brent Spot Price FOB | `eia.gov` Open Data petroleum | public Brent spot proxy comparison | M-85 live public proxy in `brentPricingLayer.eiaBrentSpotProxy`;not Platts Dated Brent |
| ICE Brent futures curve | `ice.com` Brent Crude Futures / ICE Data Services | Brent term structure candidate | `sourceApproved=false`;`liveFetchApproved=false`;futures curve only |
| Baltic Exchange freight benchmarks | `balticexchange.com` data services / indices | shipping / freight stress source family | `sourceApproved=false`;`liveFetchApproved=false`;freight benchmark only |
| Freightos Baltic Index | `freightos.com` / Freightos Terminal | container freight public proxy candidate | `sourceApproved=false`;`liveFetchApproved=false`;container proxy only |
| S&P / Platts Dated Brent | S&P Global Commodity Insights / Platts Market Data | future licensed formal Dated Brent source | `sourceApproved=false`;`liveFetchApproved=false`;future licensed only |

M-71 public proxy source review identifies websites and source families for a
future audit-only/public-proxy rung. It does **not** approve live fetch, does not
write production data, does not modify Worker runtime, does not modify frontend,
does not change `values.brent`, and does not change Brent promotion. Platts
Dated Brent / 正式 Dated Brent remains unconnected unless a future licensed
source review and implementation PR explicitly changes that.

M-77 implements a narrow ICE public page read into `brentPricingLayer.futuresCurve`
as `live_structure_only`: contract months, last-trade dates, and final-settlement
dates only. It does not fetch or infer official settlement prices, contango /
backwardation, Platts Dated Brent, Brent promotion, scoring, decision, execution,
position, Worker runtime, `displayInputsBaseline`, `effectiveDisplayInputs`, or
cross-validation.

M-78 implements Yahoo `BZ` monthly futures quotes into
`brentPricingLayer.futuresPriceCurve` as `live_proxy_priced` when available.
This is a public priced proxy only; it is not Platts Dated Brent, not formal
Dated Brent, and not the official ICE settlement curve.

M-82 implements ICE product-guide public `contract-data` into
`brentPricingLayer.iceFuturesPriceCurve` as `live_delayed_priced` when
available. This is an ICE public delayed last-price futures curve only; it is
not Platts Dated Brent, not formal Dated Brent, and not the official ICE
settlement curve.

M-85 implements EIA Europe Brent Spot Price FOB public HTML into
`brentPricingLayer.eiaBrentSpotProxy` as `live` when available. This is a
public spot proxy only; it is not Platts Dated Brent, not formal Dated Brent,
and not physical transaction evidence.

See [`BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md`](BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md).

---

### China central-bank operation / SReFin / property index public candidates (source review only)

| Candidate | Source family | Review role | Status |
|---|---|---|---|
| PBOC OMO 公开市场操作公告 | `pbc.gov.cn` 公开市场业务交易公告 | 操作级逆/正回购 利率·期限·中标量 evidence | implemented (Stage 11);audit-only/display-only;announcement-level, not raw tape;stores awarded amount only, no bid amount / net amount |
| PBOC MLF 招标公告 | `pbc.gov.cn` MLF 操作 / 招标公告 | 中期借贷便利 公告级(规模·期限)evidence 候选 | source-review only;not implemented;announcement-level |
| PBOC 社融组件分项 | `pbc.gov.cn` 金融统计数据报告 | 社融存量/增量分项(人民币贷款、外币贷款、委托/信托贷款、未贴现银承、企业债、政府债、股票融资等)evidence 候选 | source-review only;not implemented;report-level, not loan-level micro |
| NBS 70 城房价指数 | `stats.gov.cn` 月度城市价格指数页 | 城市级新建商品住宅 / 二手住宅销售价格指数 evidence | implemented (Stage 10);audit-only/display-only;index-level count summary, not transaction-level raw tape |
| PBOC SLO 短期流动性调节工具 | `pbc.gov.cn` 历史 SLO 公告 | 历史/低频 evidence 候选 | source-review only;historical / inactive / no_recent_operation;**≠ Fed SLOOS** |

Except for the Stage 10 NBS 70-city implementation row and the Stage 11 PBOC OMO implementation row, these China central-bank operation / social-financing / property-index candidates are **source-review only**. Non-implemented rows are NOT fetched at runtime and NOT written to production data. Implemented rows remain audit-only / display-only under the `China Macro Liquidity / Property Evidence Layer`: they must not change `scoring`, `decisionModel`, `executionLock`, `positionGuidance`, `Action Queue`, `Trigger Monitor`, `Invalidation Rules`, `values.*`, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation. Announcement-level OMO/MLF, report-level SReFin components, and index-level 70-city prices must **not** be written as per-institution / per-bid / loan-level / unit-level raw tape, and field names / frontend copy / notes must not imply such substitution. **PBOC SLO** is the PBOC Short-term Liquidity Operations tool and must not be confused with **Fed SLOOS** (already connected via FRED `DRTSCILM` / `DRTSCIS` in `macroDrivers.credit`).

See [`CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md`](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md).

---

### GDELT Cloud v2

| 字段 | 值 |
|---|---|
| **License** | 商业 + free tier;需 `GDELT_CLOUD_API_KEY` Bearer |
| **Quota** | free tier 有限,本项目 daily 1 次 |
| **Refresh 频率** | `refresh-world-order-stress.yml` (daily) |
| **失败 fallback** | `externalSources.gdelt.status = 'error'`;world_order 仍可 build,但 GDELT supporting branch 标记 missing |
| **影响 scoring?** | **是 (overlay)** — 进入 World Order Stress Overlay 的 `marketConfirmation` 与 4 个 supporting narrative;**不进入** scoring/decision/execution/position 主链 |
| **fetcher** | `scripts/world-order/fetch-gdelt-cloud.mjs` (M-59 替换 legacy GDELT DOC API) |

---

### OFAC — Treasury sanctions feed

| 字段 | 值 |
|---|---|
| **License** | 公开;US Treasury |
| **Quota** | 无明确限制 |
| **Refresh 频率** | World Order build (daily) |
| **失败 fallback** | `externalSources.ofac.status` 降级;recentActionsCount 标记 missing |
| **影响 scoring?** | **overlay only** — 进入 World Order economicWeaponization 维度 |
| **fetcher** | `scripts/world-order/fetch-ofac.mjs` |

---

### ReliefWeb

| 字段 | 值 |
|---|---|
| **License** | 公开 |
| **状态** | diagnostic only (`scripts/world-order/diagnose-reliefweb-source.mjs`);**不进入** scoring |
| **影响 scoring?** | **否** — 必须先通过 diagnosis / source review,再另开版本接入 |

---

### ACLED — Armed Conflict Location & Event Data

| 字段 | 值 |
|---|---|
| **License level** | `open`;owner 曾申请 Research tier 但被拒。Open level 允许 aggregated downloads 的 unlimited public access、non-commercial use,并要求 attribution |
| **Source URL** | `https://acleddata.com/conflict-data/download-data-files` |
| **数据获取方式** | 手动下载 xlsx;**不得**由代码、workflow、script、crawler 或 scraper 自动访问 `acleddata.com` |
| **EULA §3.3** | "Scraping and crawling the Site is prohibited." |
| **Refresh 频率** | Weekly regional files:每周 Monday/Tuesday;Monthly global files:每月约 8 日 |
| **状态** | M-63a/M-63b 起为 `manual_required` / `partial` / `ok` 三态:weekly+monthly 均无或 `isRealData !== true` 时 `manual_required`;仅其中一种到位时 `partial`;两种 sanitized JSON 都 `isRealData=true` 时 `ok` |
| **失败 fallback** | `manual_required` / `error` / legacy `not_configured` 只影响 World Order overlay 可用性提示,不得阻断 `check:all`,不得进入 main scoring / decision / execution / position |
| **影响 scoring?** | **overlay only** — M-63a 起只允许进入 World Order `peaceDividendRetreat` 维度;不得影响主决策模型 |
| **fetcher** | `scripts/world-order/fetch-acled.mjs` (M-63a local JSON importer;不访问网络、不读取 credentials、不导入 `xlsx`) |
| **weekly sanitizer** | `scripts/world-order/sanitize-acled-weekly.mjs` (M-63a 已落地;唯一允许导入 `xlsx` 的 ACLED 路径) |
| **monthly sanitizer** | `scripts/world-order/sanitize-acled-monthly.mjs` (M-63b 已落地;唯一允许导入 `xlsx` 的 ACLED monthly 路径) |
| **提醒机制** | `.github/workflows/acled-weekly-refresh-reminder.yml` (cron Tuesday 00:00 UTC) + `.github/workflows/acled-monthly-refresh-reminder.yml` (cron 9th 00:00 UTC each month);M-63c 起 active;reminder-only,不得升级为 auto-fetch |
| **derived JSON** | `config/world-order-acled-regional-weekly.json` (M-63a) + `config/world-order-acled-global-monthly.json` (M-63b) |
| **raw xlsx storage** | `manual-artifacts/world-order/acled-input/{weekly,monthly}/` (gitignored) |

**Canonical derived-metadata fields** (M-63a/M-63b implementation must match verbatim):

```jsonc
{
  "sourceUrl":     "https://acleddata.com/conflict-data/download-data-files",
  "licenseLevel":  "open",
  "attribution":   "ACLED (Armed Conflict Location & Event Data) — https://acleddata.com"
}
```

**Aggregated download tracks**:

| Track | Files | Scope |
|---|---:|---|
| Weekly regional | 6 | Africa;Middle East;Europe and Central Asia;United States and Canada;Latin America and the Caribbean;Asia-Pacific |
| Monthly global | 6 | political_violence_country_month;political_violence_country_year;demonstrations_country_year;civilians_targeted_country_year;fatalities_country_year;civilian_fatalities_country_year |

**Status vocabulary**:

| Status | 含义 |
|---|---|
| `ok` | M-63b 起要求 weekly + monthly 两份 sanitized JSON 都为真实数据 (`quality.isRealData=true`) |
| `partial` | M-63b 起:仅 weekly 或仅 monthly 真实数据可用 (另一边 missing / `isRealData=false` / parse error) |
| `manual_required` | weekly 与 monthly 都不可用;operator 需手动下载 xlsx 后运行 `npm run acled:sanitize:weekly` 与 `npm run acled:sanitize:monthly` |
| `error` | JSON parse failure or schema validation failure |
| `not_configured` | Pre-M-63a baseline state retained only for compatibility with already-committed historical JSON |

**Attribution requirement**:

The frontend dashboard must display `ACLED (Armed Conflict Location & Event Data) — https://acleddata.com`
wherever ACLED-derived signals are displayed. Implementation is deferred to a later PR, but any drift between this
documented attribution string and code is a contract violation.

---

### SIPRI — Military Expenditure

| 字段 | 值 |
|---|---|
| **License** | 公开 (annual report);**无 API**,手动从 Excel 提取 |
| **Refresh 频率** | 年度,每年 4-5 月 SIPRI 发布后手动更新 |
| **失败 fallback** | `world-order-sipri-normalized.example.json` 是 placeholder,`quality.isRealData=false` 时**不进入 scoring** (M-61 边界);只有真实手动标准化文件 (`config/world-order-sipri-normalized.json` + `isRealData=true`) 才让 SIPRI 进入 `ok` |
| **影响 scoring?** | **overlay only** — World Order peaceDividendRetreat 维度 + 3 个 supporting narrative (M-61) |
| **提醒机制** | `.github/workflows/sipri-annual-refresh-reminder.yml` 每年 5 月 1 日开 GitHub issue (M-61b) |
| **fetcher** | `scripts/world-order/import-sipri.mjs` |

---

### DeepSeek — External AI Provider

| 字段 | 值 |
|---|---|
| **License** | 商业 API;`DEEPSEEK_API_KEY` env |
| **Quota** | 按账单付费;**fail 后不得反复重试** (K-4E-1) |
| **Refresh 频率** | `external-ai-production-refresh.yml` (manual + scheduled) |
| **失败 fallback** | `provider_unavailable` / `provider_timeout` 写 failure artifact;`promotionEligible=false`;不写入 production data |
| **影响 scoring?** | **否** — External AI 是只读展示层 (`externalAiInterpretationLayer`),`generatedByExternalAi=false` 时不显示 |
| **fetcher** | `scripts/external-ai/provider-adapters.mjs` + `scripts/run-external-ai-manual-test.mjs` |

⚠️ **不得**:
- 把 manual artifacts 直接 promotion 进 production
- 写入 `data/radar-data.json` 字段 (有 write guard)
- 通过削弱 unsafe wording validator 让 artifact 通过
- 复述具体 execution / position / exposure / cash buffer 字段

---

### OpenAI — External AI Provider (alternate)

与 DeepSeek 同样的边界 (External AI = 只读展示层;不影响 scoring/decision/execution/position)。当前未启用为主 provider。

---

### Cloudflare Workers KV — `gfrr-realtime-worker`

| 字段 | 值 |
|---|---|
| **License** | Cloudflare Workers free tier |
| **Quota** | <800 writes/day (free-tier safe);v28.0B 后每轮 scheduled 最多 1 次 KV 写 |
| **KV keys** | `market:latest` (production, **当前 Worker 不写**), `market:latest-preview` (GitHub mirror), `market:worker-generated-preview` (主 worker preview), `market:secondary-preview` (secondary), `market:worker-heartbeat` (status) |
| **影响 scoring?** | `market:worker-generated-preview` **是主 realtime overlay 来源**,通过前端 strict gate 决定是否用;不通过则回退 GitHub `realtime-data` 分支 |
| **deploy** | `wrangler deploy` (manual,Cursor 实现后) |

---

## 反向索引 (消费层 → 数据源)

| 消费层 | 主要数据源 |
|---|---|
| `values.brent` | FRED `DCOILBRENTEU` (anchor) + Yahoo `BZ=F` (fresh confirmation) + TE (freshness gate) + D-6 extreme-move guard |
| `brent public proxy candidates` | M-71 source-review only: EIA Europe Brent Spot Price FOB / ICE Brent futures curve / Baltic Exchange freight benchmarks / Freightos Baltic Index / future licensed S&P-Platts Dated Brent |
| `values.vix` / `values.gold` / `values.dxy` / `values.us10y` / `values.spx` | 来自 GitHub realtime-data 或 displayInputsBaseline;**secondary preview 仅诊断,不覆盖** |
| `marketPricingHistory.assets.ndx` / `marketPricingHistory.assets.ixic` | Yahoo chart `^NDX` / `^IXIC`;Daily/manual Market Pricing history only;display-only auxiliary,QQQ remains primary |
| `macroDrivers.fedLiquidity` | FRED: DFF, SOFR, WRESBAL + NY Fed secured rates API: BGCR/TGCR (+ 派生 spreads) |
| `macroDrivers.credit` | FRED: BAMLH0A0HYM2 (HY OAS), BAMLC0A0CM (IG OAS), DRTSCILM, DRTSCIS, NFCI |
| `macroDrivers.consumer` | FRED: UMCSENT + ISM: Manufacturing PMI public report parser |
| `macroDrivers.employment` | FRED: ICSA, CCSA, JTSJOL, CES0500000003, U6RATE, public industry payroll basket |
| `macroDrivers.consumerRetail` | FRED: CARTS, CARTSR, MRTS monthly retail trade segment basket + BoA Consumer Checkpoint public HTML + Trading Economics Redbook public HTML |
| `macroDrivers.shippingFreight` | StockQ: BDTI, BCTI, BDI public index pages |
| `macroDrivers.policyExpectations` | FRED: DFEDTARL/DFEDTARU/DFF + Yahoo: ZQ=F / ZQ monthly futures curve / SR3 monthly SOFR futures curve + CheckMySwap USD OIS public curve + Federal Reserve SEP/FOMC statement/minutes |
| `macroDrivers.commercialRealEstate` | FRED: DRCRELEXFACBS, CORCREXFACBS, SUBLPDRCSN, SUBLPDRCSC, SUBLPDRCSM, CREACBW027SBOG + Yahoo: VNQ, REM, CMBS |
| `macroDrivers.privateCreditProxy` | Yahoo: BIZD, PBDC, SRLN, CCLFX + FRED: BAMLH0A0HYM2 / BAMLC0A0CM + ICE public CDX index settlement; private marks = manual_required |
| `brentPricingLayer.crackSpread` | FRED `DHOILNYH` × 42 − Brent |
| `brentPricingLayer.eiaBrentSpotProxy` | EIA `RBRTE` Europe Brent Spot Price FOB public HTML; not Platts/formal Dated Brent |
| `brentPricingLayer.futuresCurve` | ICE Brent futures public product page structure-only contracts |
| `brentPricingLayer.iceFuturesPriceCurve` | ICE Brent futures public delayed last-price curve; Platts/official ICE settlement = not connected |
| `brentPricingLayer.futuresPriceCurve` | Yahoo: BZ monthly futures priced proxy; Platts/official ICE settlement = not connected |
| `externalAiInterpretationLayer` | DeepSeek (production) / OpenAI (alternate);只读展示 |
| `worldOrderStress.marketConfirmation` | Worker preview → local realtime → Daily baseline (优先级) |
| `worldOrderStress.dimensions.economicWeaponization` | OFAC + (GDELT) |
| `worldOrderStress.dimensions.peaceDividendRetreat` | SIPRI (年度) |
| `worldOrderStress` GDELT narrative | GDELT Cloud v2 |
