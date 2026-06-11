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

**M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85/Energy Stress Phase 2 注意**: `macroDrivers.policyExpectations` 直接读取 FRED target range / DFF、Federal Reserve SEP accessible table + FOMC statement/minutes、Yahoo `ZQ=F` front Fed funds futures proxy、Yahoo ZQ monthly futures proxy curve、Yahoo SR3 monthly SOFR futures proxy curve 与 CheckMySwap USD OIS public curve；`macroDrivers.shippingFreight` 读取 StockQ `BDTI` / `BCTI` / `BDI` 公开页面；`macroDrivers.energySpareCapacity` 读取 EIA STEO `COPS_OPEC` OPEC surplus crude oil production capacity monthly estimate/forecast；`macroDrivers.energyTransport` 读取 IMF PortWatch `Daily_Chokepoints_Data` public ArcGIS FeatureServer,只保存 AIS-derived chokepoint compact 派生摘要；`macroDrivers.privateCreditProxy` 读取 Yahoo `BIZD` / `PBDC` / `SRLN` / `CCLFX`、FRED HY/IG OAS cash-bond proxies 与 ICE public CDX index settlement；`macroDrivers.commercialRealEstate` 读取 Yahoo `VNQ` / `REM` / `CMBS` 与 FRED `CREACBW027SBOG` public aggregate exposure proxy；`brentPricingLayer.iceFuturesPriceCurve` 读取 ICE Brent public delayed last-price curve；`brentPricingLayer.eiaBrentSpotProxy` 读取 EIA Europe Brent Spot Price FOB public HTML。CheckMySwap 是 public OIS curve,不得写成 proprietary dealer forward curve；EIA STEO `COPS_OPEC` 不得写成实时物理闲置桶数、OPEC 官方配额执行或油价预测；PortWatch 不得写成官方贸易统计、封锁确认、战争概率或油价预测;2026-06-09 TOS pin review 已把 exact ArcGIS item `licenseInfo` pin 到 IMF Data Terms,TOS pin Phase A writer emits `usageTermsPinned=imf_data_terms_pinned` while validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` 必须保留；ICE CDX public settlement 与 CCLFX NAV proxy 不得写成 private credit marks；FRED `CREACBW027SBOG` 不得写成 non-public CRE loan tape；ICE Brent public delayed curve 不得写成 official settlement curve 或 Platts；EIA Brent spot proxy 不得写成 Platts Dated Brent 或正式 Dated Brent。

---

### Treasury Fiscal Data — Daily Treasury Statement / TGA candidate(source-review only)

| 字段 | 值 |
|---|---|
| **License** | U.S. Treasury Fiscal Data public API,no key used in source-review probe |
| **Source URL** | `https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/` |
| **Probe endpoint** | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance` |
| **Candidate fields** | TGA closing balance;Total TGA Deposits(Table II);Total TGA Withdrawals(Table II) |
| **Current status** | **source-review only;artifact-only replay scaffolds exist;not implemented** |
| **Potential future consumer** | `macroDrivers.fedLiquidity` candidate input after artifact-only replay/backtest |
| **影响 scoring?** | **否** — no runtime / formula / scoring approval;future main-calculation use requires separate owner-approved formula/backtest PR |
| **fetcher** | none |

2026-06-10 source-review 实测 `operating_cash_balance` 可用精确
`account_type` filter 稳定抽取:

- `Treasury General Account (TGA) Closing Balance` line 4。
- `Total TGA Deposits (Table II)` line 2。
- `Total TGA Withdrawals (Table II) (-)` line 3。

该候选只证明 DTS/TGA 具备未来财政流动性冲击输入的可审查基础:
可派生 TGA 余额、1d/5d/20d 变化与 deposits-minus-withdrawals。它尚未证明
相对 ON RRP / WALCL / reserve balances 的预测增量;不得进入 `values.*`、
`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、
position、Action Queue、Trigger Monitor 或 Invalidation Rules。source-review 见
[`TREASURY_FISCAL_DATA_TGA_SOURCE_REVIEW.md`](TREASURY_FISCAL_DATA_TGA_SOURCE_REVIEW.md)。本地
`npm run treasury:tga-replay`、`npm run treasury:liquidity-replay` 和
`npm run treasury:liquidity-long-backtest` 仅写 ignored
`manual-artifacts/treasury-fiscal-data/` 报告;`liquidity-replay` 需要 `FRED_API_KEY`
并拒绝 unsupported FRED CSV fallback。长历史判断使用 FRED `WDTGAL` / `WTREGEN`
TGA weekly proxies,因为 DTS `operating_cash_balance` reviewed rows 当前只回到
2022-04-18。2026-06-10 默认 2014+ 长回测结论为
`accuracy_not_proven_not_formula_approved`;随后 adversarial cross-audit 的 2002+
周频面板结论为 current liquidity pressure `needs_recalibration`、TGA
`tga_incremental_signal_not_proven`、new model candidate not strong enough for
formula PR。任何 artifact replay 都不批准 formula 或 production 接入。

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
| **Refresh 频率** | Realtime worker (high freq) + Daily pipeline 兜底；Market Pricing QQQ 每周自动 + NDX/IXIC Daily/manual history refresh |
| **失败 fallback** | 失败时记录 `previewFetchStatus`,主 worker preview 不写入;前端通过 strict gate 回退 |
| **影响 scoring?** | **仅 Brent**:Yahoo `BZ=F` 作为 Brent fresh confirmation(M-D-5+);**其他 secondary 不影响 scoring** |
| **fetcher** | Worker secondary: `workers/gfrr-realtime-worker/src/worker-market-preview.js`;Market Pricing NDX/IXIC: `scripts/market-pricing/ndx-ixic-yahoo-history-refresh.mjs`;Market Pricing QQQ: `scripts/market-pricing/qqq-yahoo-history-refresh.mjs` |

**当前消费的 symbol**:

| Symbol | 含义 | 用途 |
|---|---|---|
| `BZ=F` | Brent crude futures | Brent fresh confirmation (D-5),与 FRED + TE 取一致 |
| `^GSPC` | S&P 500 index | secondary diagnostics only (不影响 scoring,M-E-4) |
| `^NDX` | Nasdaq 100 index | `marketPricingHistory.assets.ndx` Daily/manual history refresh;QQQ primary 的辅助横向对照,不进 Worker/scoring |
| `^IXIC` | Nasdaq Composite index | `marketPricingHistory.assets.ixic` Daily/manual history refresh;Nasdaq 广度参照,不进 Worker/scoring |
| `QQQ` | Invesco QQQ ETF | `marketPricingHistory.assets.qqq` 每周自动 history refresh(Yahoo chart,替代手动 Nasdaq CSV;`refresh-qqq-market-pricing.yml` 周六 cron);primary 市场温度计 display-only,不进 Worker/scoring |
| `^TNX` | US 10Y treasury yield | secondary diagnostics only;`rawValue > 20` 时按 `divide-by-10` 归一化 (E-3A) |
| `GC=F` | Gold futures | secondary diagnostics only (E-1) |
| `DX-Y.NYB` | DXY 美元指数 | secondary diagnostics only (E-2) |
| `^MOVE` | ICE BofA MOVE 债券/利率波动率指数 | `macroDrivers.rateVol` 结构信号（进结构门控：≥140→黄、≥160→红）；**评分例外**，非 secondary/display-only；日频 + 闸门 `[20,400]`/INDEX/≤5d + fail-closed |

---

### Stooq

| 字段 | 值 |
|---|---|
| **License** | 公开 CSV,需 User-Agent |
| **Quota** | 无明确限制 |
| **Refresh 频率** | run-realtime Brent consensus 候选(每次 realtime 运行) |
| **失败 fallback** | Brent consensus 多源交叉(ice / barchart / stooq / marketwatch / oilprice / yahoo + FRED anchor) |
| **影响 scoring?** | 作为 run-realtime Brent consensus 候选之一参与交叉(多源、非单一决定;FRED DCOILBRENTEU 仍为 daily anchor)。**worker `/q/d/l/` Brent 诊断 sourceProbe 已于 F6(2026-06-02)删除** |
| **fetcher** | `scripts/run-realtime.mjs` (`fetchBrentStooqCandidate`,quote `https://stooq.com/q/l/?s=cb.f`);worker `/q/d/l/` 诊断探针已移除 |

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

### Yahoo / StockQ / EIA STEO / IMF PortWatch / Federal Reserve / BoA / Redbook / CheckMySwap / ICE public macro-driver inputs (M-74 / M-77 / M-78 / M-79 / M-80 / M-81 / M-82 / M-83 / M-84 / Energy Stress Phase 2)

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
| EIA STEO `COPS_OPEC` (`EIA:STEO:COPS_OPEC`) | `macroDrivers.energySpareCapacity` | OPEC surplus crude oil production capacity monthly estimate/forecast; not real-time spare barrels, OPEC quota execution, or oil price forecast |
| IMF PortWatch `Daily_Chokepoints_Data` (`IMFPortWatch:Daily_Chokepoints_Data`) | `macroDrivers.energyTransport` | AIS-derived chokepoint tanker/count/capacity proxy compact summary; not official trade statistics, blockade confirmation, war probability, or oil price forecast |
| Federal Reserve `fomcprojtablYYYYMMDD.htm` | `macroDrivers.policyExpectations` | Fed dot plot federal funds median proxy from SEP accessible table |
| Federal Reserve `monetaryYYYYMMDDa.htm` | `macroDrivers.policyExpectations` | FOMC policy text tone count |
| Federal Reserve `fomcminutesYYYYMMDD.htm` | `macroDrivers.policyExpectations` | FOMC minutes keyword NLP tone/topic count |
| BoA Consumer Checkpoint public HTML | `macroDrivers.consumerRetail` | card spending per household YoY / ex-gas YoY public summary |
| Trading Economics Redbook public HTML | `macroDrivers.consumerRetail.redbookRetailSalesYoY` | Redbook same-store sales YoY public summary; not Redbook raw subscription feed |

These M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85/Energy Stress Phase 2 sources are audit-only / display-only. They must not change Brent promotion, scoring, decision, execution, position, Worker runtime, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation. Private credit marks, Redbook raw subscription feed, BoA raw card feed, Platts Dated Brent, official ICE Brent settlement curve, proprietary dealer OIS forward, non-public CRE loan tape, OPEC official quota execution, PortWatch raw AIS-derived history, war/blockade probability, and oil-price prediction remain unconnected or explicitly out of scope.

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
| PBOC OMO 公开市场操作公告 | EastMoney 搜索聚合(转载央行公开市场操作新闻) | 操作级逆/正回购 利率·期限·操作量 evidence | implemented (Stage 11, runtime source switched in Stage 15);实采源 = EastMoney 聚合新闻(pbc.gov.cn US runner 地理封锁,改抓境外可达聚合源);audit-only/display-only;announcement/news-level,非官方原始页,not raw tape;stores gross operation amount only, no maturity / net injection |
| PBOC MLF 招标公告 | EastMoney 搜索聚合(转载央行 MLF 操作新闻) | 中期借贷便利 公告/新闻级(规模·期限·可选利率)evidence | implemented (Stage 13, runtime source switched in Stage 16);实采源 = EastMoney 聚合新闻(pbc.gov.cn US runner 地理封锁,改抓境外可达聚合源);audit-only/display-only;announcement/news-level,非官方原始页,not raw tape;stores gross operation amount only, no maturity / net injection;rate may be null when not disclosed |
| PBOC 社融组件分项 | EastMoney 搜索聚合(转载央行社融报告) | 社融存量同比 + 年内累计增量 + 8 个累计分项 evidence | implemented (Stage 12, runtime source switched in Stage 14);实采源 = EastMoney 聚合转载(pbc.gov.cn US runner 地理封锁,改抓境外可达聚合源);audit-only/display-only;report-level cumulative / announcement-level,非官方原始页,not raw tape;no derived monthly increment |
| NBS 70 城房价指数 | `stats.gov.cn` 月度城市价格指数页 | 城市级新建商品住宅 / 二手住宅销售价格指数 evidence | implemented (Stage 10);audit-only/display-only;index-level count summary, not transaction-level raw tape |
| PBOC SLO 短期流动性调节工具 | `pbc.gov.cn` 历史 SLO 公告 | 历史/低频 evidence 候选 | source-review only;historical / inactive / no_recent_operation;**≠ Fed SLOOS** |

Except for the Stage 10 NBS 70-city implementation row, the Stage 11 OMO implementation row (runtime source now EastMoney aggregated news because pbc.gov.cn is geoblocked on US runners), the Stage 12 TSF implementation row (runtime source now EastMoney aggregated repost because pbc.gov.cn is geoblocked on US runners), and the Stage 13 MLF implementation row (runtime source now EastMoney aggregated news because pbc.gov.cn is geoblocked on US runners), these China central-bank operation / social-financing / property-index candidates are **source-review only**. Non-implemented rows are NOT fetched at runtime and NOT written to production data. Implemented rows remain audit-only / display-only under the `China Macro Liquidity / Property Evidence Layer`: they must not change `scoring`, `decisionModel`, `executionLock`, `positionGuidance`, `Action Queue`, `Trigger Monitor`, `Invalidation Rules`, `values.*`, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation. Announcement-level OMO/MLF, report-level SReFin components, and index-level 70-city prices must **not** be written as per-institution / per-bid / loan-level / unit-level raw tape, and field names / frontend copy / notes must not imply such substitution. Stage 11/15 OMO stores gross operation amount only and must not label maturity, net injection, or net withdrawal as operation amount. Stage 13/16 MLF stores gross operation amount/term plus nullable disclosed rate only and must not label maturity, net injection, net withdrawal, or 加量续作轧差 as operation amount. Stage 12 TSF stores report-level cumulative values only and must not derive or label an implied current-month increment. **PBOC SLO** is the PBOC Short-term Liquidity Operations tool and must not be confused with **Fed SLOOS** (already connected via FRED `DRTSCILM` / `DRTSCIS` in `macroDrivers.credit`).

See [`CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md`](CHINA_MACRO_LIQUIDITY_PROPERTY_SOURCE_REVIEW.md).

---

### EastMoney aggregated reports / news

| 字段 | 值 |
|---|---|
| **License** | Public EastMoney search JSONP + public article HTML reposts/news |
| **Refresh 频率** | Daily pipeline discovery;OMO daily/workday news cadence, MLF monthly operation cadence, TSF monthly report cadence |
| **失败 fallback** | `macroDrivers.chinaOmo.sourceStatus` / `macroDrivers.chinaMlf.sourceStatus` / `macroDrivers.chinaTsf.sourceStatus = 'fallback'` or `'missing'`;OMO amount/term/type/rate 缺失、MLF gross amount/term 缺失或 TSF stockYoY 缺失时 fail-closed |
| **影响 scoring?** | **否** — display-only / audit-only,不进入 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decision、execution、position 或 cross-validation |
| **fetcher** | `resolveChinaOmo` / `resolveChinaMlf` / `resolveChinaTsf` |
| **边界** | 东方财富聚合转载公开财经媒体文本,非 PBOC 官方原始公告/报告；OMO 只保存新闻毛额操作句中的期限、利率、操作量,不得把到期量、净投放/净回笼写成操作量；MLF 只保存新闻毛额操作句中的操作量和期限,不得把到期量、净投放/净回笼或加量续作轧差写成操作量；TSF 只保存报告级累计社融口径,不得写成贷款笔级 / 机构级 raw tape |

---

### EIA API v2 — Weekly Petroleum (Oil Directional Pressure / ODP)

| 字段 | 值 |
|---|---|
| **License** | 公开;US EIA Open Data API v2,需免费 `EIA_API_KEY`(GitHub secret;本地从 gitignored `manual-artifacts/eia-api-key.txt` 注入) |
| **Route** | `/v2/seriesid/PET.<id>.W`(legacy 全 ID;裸 `WCESTUS1` 无效) |
| **Refresh 频率** | Weekly(WPSR,周三发布上周五数据);PR1 一次性 build,PR1b 周度 workflow |
| **失败 fallback** | 短超时(`EIA_FETCH_TIMEOUT_MS`,默认 15s)+ fail-closed:`sourceStatus='missing'`(reason timeout/http_*/no_data…),不伪造值、不抛穿透 |
| **影响 scoring?** | **否** — audit-only / display-only,独立文件 `data/oil-directional-pressure.json`;不进 `values.*`、scoring、decisionModel、executionLock、positionGuidance、cross-validation 或 Global Risk Heatmap |
| **fetcher** | `scripts/oil-directional/build-oil-directional-pressure.mjs`(零依赖,ADR-0013:写 `data/` 不导入 devDep) |

**当前消费的 series**(全 PET 数据集,weekly):

| Series (legacy ID) | 含义 | 单位 | 喂给信号 |
|---|---|---|---|
| `PET.WCESTUS1.W` | 商业原油库存 ex-SPR | 千桶 | inventoryDrawPressure |
| `PET.WCSSTUS1.W` | SPR 原油库存 | 千桶 | sprBufferEffectiveness |
| `PET.WDISTUS1.W` | 馏分油库存 | 千桶 | dieselProductStress |
| `PET.WGTSTUS1.W` | 总汽油库存 | 千桶 | dieselProductStress(辅) |
| `PET.WPULEUS3.W` | 炼厂开工率 | % | refineryConfirmation |
| `PET.WCRRIUS2.W` | 炼厂原油净投入 | 千桶/日 | refineryConfirmation |
| `PET.WGFUPUS2.W` | 成品汽油 product supplied | 千桶/日 | demandDestructionRisk |
| `PET.WDIUPUS2.W` | 馏分油 product supplied | 千桶/日 | demandDestructionRisk |

WTI / Brent / 裂解价差 / 期限结构由 `oil-directional-pressure.json` **复用** `data/radar-data.json`(`macroDrivers.inflationEnergy.wti` / `brentPricingLayer.selectedBrent` / `.crackSpread` / `.futuresPriceCurve`),不重抓。EIA = 美国政府公共领域数据,标注 source URL 即可。详见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

**PR2 历史 cache**（`data/oil-directional-history.json`）：同 8 个 `PET.*.W` series、同 `/v2/seriesid/` route，由 `scripts/oil-directional/build-oil-directional-history.mjs`（零依赖，ADR-0013）一次性抓 2014-至今全周度史并切片落盘（每 series ~647 周，2014-01-03 起），作 **committed snapshot** 供回测 harness 离线、可复现回放（`check:all` 不联网）。fail-closed：失败 series → `sourceStatus:'missing'` / `points:[]`，不伪造。**仅供 PR2 回测 GATE**，不进 live `oil-directional-pressure.json`、不进 `values.*` / scoring / decision / Global Risk Heatmap。文件契约 + 分类器 / GATE / 预登记阈值见 [`DATA_CONTRACT.md`](DATA_CONTRACT.md)。

---

### EIA API v2 — STEO OPEC Spare Capacity (Energy Stress Phase 2)

| 字段 | 值 |
|---|---|
| **License** | 公开;US EIA Open Data API v2,需免费 `EIA_API_KEY`(GitHub secret;本地从 gitignored `manual-artifacts/eia-api-key.txt` 注入) |
| **Route** | `/v2/steo/data/?facets[seriesId][]=COPS_OPEC` |
| **Refresh 频率** | Daily pipeline (`build-daily-radar-data.yml`)；源数据为 STEO monthly estimate/forecast 慢变量 |
| **失败 fallback** | 短超时(`ENERGY_SPARE_CAPACITY_FETCH_TIMEOUT_MS`,默认 10s)+ carry last-good if not stale；无 key/网络/解析失败时 `sourceStatus.spareCapacity='fallback'` 或 `missing`；超过 95 天 stale 时 fail-closed 为 null |
| **影响 scoring?** | **否** — audit-only / display-only,写入 `macroDrivers.energySpareCapacity`;不进 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decisionModel、executionLock、positionGuidance、cross-validation、Brent promotion、World Order weights 或 Global Risk Heatmap |
| **fetcher** | `scripts/run-daily-pipeline.mjs::resolveEnergySpareCapacity` |

**当前消费的 series**:

| Series ID | 含义 | 单位 | 消费层 |
|---|---|---|---|
| `COPS_OPEC` | OPEC Total Spare Crude Oil Production Capacity | million barrels per day | `macroDrivers.energySpareCapacity` |

`COPS_OPEC` 是 EIA STEO estimate / forecast product。用户可见文案必须保留“估算/预测、非实时、非油价预测”边界；不得写成实时物理闲置桶数、OPEC 官方配额执行、OPEC+政策承诺、断供概率或交易信号。source-review 见 [`OPEC_SPARE_CAPACITY_SOURCE_REVIEW.md`](OPEC_SPARE_CAPACITY_SOURCE_REVIEW.md)。

---

### IMF PortWatch — Energy Chokepoint Transport Proxy (Energy Stress Phase 2)

| 字段 | 值 |
|---|---|
| **License / usage** | Public PortWatch / ArcGIS FeatureServer surface;exact ArcGIS item `licenseInfo` points to IMF terms;2026-06-09 TOS pin review maps this to IMF Data Usage terms,while retaining third-party / UN Global Platform caveat. TOS pin Phase A writer emits `usageTermsPinned=imf_data_terms_pinned`;validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` remains required. |
| **Route** | ArcGIS `Daily_Chokepoints_Data/FeatureServer/0/query`, whitelisted `chokepoint1`...`chokepoint8` only |
| **Refresh 频率** | Daily pipeline (`build-daily-radar-data.yml`)；存 compact derived summary,不提交 raw AIS-derived 120d dump |
| **失败 fallback** | 短超时(`ENERGY_TRANSPORT_FETCH_TIMEOUT_MS`,默认 10s)+ carry last-good if not stale；schema drift / stale latest date / missing core chokepoints fail-closed 为 `missing` 或 `stale` |
| **影响 scoring?** | **否** — audit-only / display-only,写入 `macroDrivers.energyTransport`;不进 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decisionModel、executionLock、positionGuidance、cross-validation、Brent promotion、World Order weights 或 Global Risk Heatmap |
| **fetcher** | `scripts/run-daily-pipeline.mjs::resolveEnergyTransport` |

**当前消费的 chokepoints**:

| Port ID | 含义 | 消费层 |
|---|---|---|
| `chokepoint1` | Suez Canal | `macroDrivers.energyTransport.chokepoints.suez` |
| `chokepoint2` | Panama Canal | `macroDrivers.energyTransport.chokepoints.panama` |
| `chokepoint3` | Bosporus Strait | `macroDrivers.energyTransport.chokepoints.bosporus` |
| `chokepoint4` | Bab el-Mandeb Strait | `macroDrivers.energyTransport.chokepoints.babElMandeb` |
| `chokepoint5` | Malacca Strait | `macroDrivers.energyTransport.chokepoints.malacca` |
| `chokepoint6` | Strait of Hormuz | `macroDrivers.energyTransport.chokepoints.hormuz` |
| `chokepoint7` | Cape of Good Hope | `macroDrivers.energyTransport.chokepoints.capeGoodHope` |
| `chokepoint8` | Gibraltar Strait | `macroDrivers.energyTransport.chokepoints.gibraltar` |

PortWatch 字段是 AIS-derived chokepoint proxy,本项目只保存 latest、7d/30d average 与相对 30d deviation 等 compact 派生摘要。用户可见文案必须保留 GPS jamming / AIS spoofing / vessels going dark / routing changes / data lag 限制；不得写成官方贸易统计、实际油轮流量确认、封锁确认、战争概率、断供概率、World Order 权重或油价预测。source-review、实现契约、TOS pin review 与前端展示 brief 见 [`ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md`](ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md)、[`ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md`](ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md)、[`PORTWATCH_TOS_PIN_REVIEW.md`](PORTWATCH_TOS_PIN_REVIEW.md) 和 [`ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md`](ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md)。

---

### Bubble Watch 专题源 — SEC EDGAR / multpl / stockanalysis / Wikipedia / OpenInsider (ADR-0016)

第二页面「AI 泡沫监测」(`data/bubble-watch.json`,周一 cron)专属,display-only,不进 scoring/decision。复用既有 FRED API(`BAMLH0A0HYM2`/`DFF`/`CPIAUCSL`,`FRED_API_KEY`)与 Yahoo Chart(SPY/RSP/成份股 6mo closes)之外,新增:

| 源 | 端点 | 喂养指标 | 边界 |
|---|---|---|---|
| **SEC EDGAR companyconcept** | `data.sec.gov/api/xbrl/companyconcept/CIK*/us-gaap/*.json` | hyperscaler capex YoY、Mag4 FCF YoY、NVDA LTM 收入(投资/收入比分母)、Cloud RPO | 美国政府公共领域;UA 必须携带联系方式;**实测对数据中心 IP(含 GitHub runner)整段 403** → capex/FCF/NVDA 收入三项落 stockanalysis 季报镜像,RPO 无镜像落 curated;10-Q 现金流为 YTD 累计,build 内差分出单季 |
| **multpl.com** | `/shiller-pe` 公开 HTML | Shiller CAPE | 公开 HTML proxy,不得写成官方 Shiller 数据库 |
| **stockanalysis.com** | `/stocks/nvda/statistics/`、`/etf/spy/holdings/`、`/stocks/*/financials/{,cash-flow-statement/}?p=quarterly` 公开 HTML | NVDA 远期 PE、S&P Top-5 权重(SPY 持仓代理,服务端只渲染前 ~25 行)、**EDGAR 被封时的季报镜像**(OCF/Capex/Revenue,~20 季服务端渲染) | 公开页代理;Top-5 是 SPY 持仓口径非 S&P 官方权重;季报数字为 $M 口径镜像非 SEC 原始 filing |
| **Wikipedia** | `List of S&P 500 companies` | 全市场广度成份股名单(~503 只 → Yahoo 实算 %>50DMA) | 名单代理;广度为全成份实算,非 Barchart S5FI 官方序列 |
| **OpenInsider** | `/screener?s=<ticker>&fd=365&xp=1&xs=1` 公开 HTML | AI 龙头(NVDA/PLTR/AVGO)内部人卖买比 | SEC Form 4 聚合代理;买入不足 $1M 按 $1M 下限折算,不得写成官方 SEC 统计 |
| **aibubble-cn.github.io 上游周报** | `raw.githubusercontent.com/crystal-xiaoxiao/ai-bubble-monitor/main/docs/data/latest.json`(该站页面的实际数据端点) | 编辑/研究类 11 项 + 自动指标 fallback 快照的滚动自动同步 | 每轮 build(周一 cron)检查:上游 `as_of_date` 比本地口径新 → 自动采纳 status/value_display/note 并回写 `config/bubble-watch-curated.json`(workflow 随数据一起提交);不可达/未更新 → 沿用现状、下周期再查,超期由 STALE 暴露。上游为人工周报,不得写成 API 实时数据 |

编辑/研究类 11 项(VC AI 占比、IPO pipeline、DC ABS、token 量等)无公开 API,人工口径唯一来源 = `config/bubble-watch-curated.json`(带 asOfDate + maxAgeDays,超期自动 STALE)。所有自动指标 fail-closed 回退该文件快照。契约见 [`DATA_CONTRACT.md`](DATA_CONTRACT.md)「bubble-watch 专题数据契约」。

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
| `macroDrivers.fedLiquidity.tga candidate` | Treasury Fiscal Data DTS / TGA source-review only;not implemented;future formula/backtest required before any main-calculation use |
| `macroDrivers.credit` | FRED: BAMLH0A0HYM2 (HY OAS), BAMLC0A0CM (IG OAS), DRTSCILM, DRTSCIS, NFCI |
| `macroDrivers.rateVol` | Yahoo: `^MOVE` 债券波动率；**评分例外结构信号**，进结构门控（≥140 黄 / ≥160 红），不进 6 模块 score / `values.*` |
| `macroDrivers.consumer` | FRED: UMCSENT + ISM: Manufacturing PMI public report parser |
| `macroDrivers.employment` | FRED: ICSA, CCSA, JTSJOL, CES0500000003, U6RATE, public industry payroll basket |
| `macroDrivers.consumerRetail` | FRED: CARTS, CARTSR, MRTS monthly retail trade segment basket + BoA Consumer Checkpoint public HTML + Trading Economics Redbook public HTML |
| `macroDrivers.shippingFreight` | StockQ: BDTI, BCTI, BDI public index pages |
| `macroDrivers.energySpareCapacity` | `EIA:STEO:COPS_OPEC` / EIA STEO `COPS_OPEC` OPEC Total Spare Crude Oil Production Capacity;monthly estimate/forecast display-only slow variable;not real-time spare barrels or oil price prediction |
| `macroDrivers.energyTransport` | `IMFPortWatch:Daily_Chokepoints_Data` / IMF PortWatch public ArcGIS chokepoint proxy;AIS-derived compact tanker/count/capacity summary;TOS pin review maps exact ArcGIS item license to IMF Data Terms;writer emits `usageTermsPinned=imf_data_terms_pinned`,validator accepts legacy `partial` until Daily proof,redistributionCaveat `true`;not official trade statistics, blockade confirmation, war probability, or oil price prediction |
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
| `data/oil-directional-pressure.json` (ODP, 独立文件) | EIA API v2 weekly petroleum (`PET.*.W`) + 复用 radar-data WTI/Brent/crack/curve + radar-history-full Brent ~4w 价格方向(PR3 背离层) |
| `data/oil-directional-history.json` (ODP PR2 回测 cache) | EIA API v2 weekly petroleum (`PET.*.W`) 2014-至今 committed snapshot;仅 backtest replay,不进 live / scoring / Heatmap |
