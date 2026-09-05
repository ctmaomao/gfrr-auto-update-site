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
| `DTWEXBGS` | Trade Weighted U.S. Dollar Index: Broad, Goods and Services | `values.dxy` / `displayInputsBaseline.dxy`;主分数 `dollarRisk` 采用 2006-2026 历史分位校准 | 长期 / 2026-06-16 calibration |
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

**2026-09-05 BoA 摘要语义复核**：8月[官方 HTML](https://institute.bankofamerica.com/economic-insights/consumer-checkpoint-august-2026.html)改用简写，旧parser因此沿用五月缓存。[同月官方 PDF](https://institute.bankofamerica.com/content/dam/economic-insights/consumer-checkpoint-august-2026.pdf)第1页及Exhibit 1确认7月5.0%、6月6.3%、7月除油4.3%均为每户口径；PDF仅作为本次人工source-review依据，runtime仍只读HTML，不增加PDF抓取或raw card feed。省略per-household的简写仅在精确已审阅HTML/PDF配对下允许，未知报告不自动类推。选取报告年月最新的官方链接，拒绝未来或超过62天报告月龄的新live结果；抓取/语义失败仍可保留旧报告并明确fallback，不拼接不同时期字段。

**M-70/M-81/M-83/M-84 注意**: `macroDrivers.commercialRealEstate` M-84 起可读取 FRED `CREACBW027SBOG` public aggregate CRE loan balance proxy,但仍不接 non-public CRE loan tape / private CRE marks,不代表 CDX 或 私募信贷数据。M-81 起 `macroDrivers.privateCreditProxy` 可读取 ICE Clear Credit public CDX index EOD settlement price,但不得写成 private credit marks 或完整 licensed Markit history database。M-83 起可读取 Yahoo `CCLFX` public interval-fund NAV proxy,但不得写成 private credit marks、fundraising data、Cliffwater Direct Lending Index licensed dataset 或非公开私募贷款估值。

**M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85/Energy Stress Phase 2/P6A 注意**: `macroDrivers.policyExpectations` 直接读取 FRED target range / DFF、Federal Reserve SEP accessible table + FOMC statement/minutes、Yahoo `ZQ=F` front Fed funds futures proxy、Yahoo ZQ monthly futures proxy curve、Yahoo SR3 monthly SOFR futures proxy curve 与 CheckMySwap USD OIS public curve；`macroDrivers.shippingFreight` 读取 StockQ `BDTI` / `BCTI` / `BDI` 公开页面；`macroDrivers.energySpareCapacity` 读取 EIA STEO `COPS_OPEC` OPEC surplus crude oil production capacity monthly estimate/forecast；`macroDrivers.energyInventoryBalance` 读取 EIA STEO `PASC_OECD_T3` OECD commercial inventory、`T3_STCHANGE_WORLD` global net inventory withdrawals 与 `PATC_WORLD` global consumption monthly estimate/forecast；`macroDrivers.energyTransport` 读取 IMF PortWatch `Daily_Chokepoints_Data` public ArcGIS FeatureServer,只保存 AIS-derived chokepoint compact 派生摘要；`macroDrivers.privateCreditProxy` 读取 Yahoo `BIZD` / `PBDC` / `SRLN` / `CCLFX`、FRED HY/IG OAS cash-bond proxies 与 ICE public CDX index settlement；`macroDrivers.commercialRealEstate` 读取 Yahoo `VNQ` / `REM` / `CMBS` 与 FRED `CREACBW027SBOG` public aggregate exposure proxy；`brentPricingLayer.iceFuturesPriceCurve` 读取 ICE Brent public delayed last-price curve；`brentPricingLayer.eiaBrentSpotProxy` 读取 EIA Europe Brent Spot Price FOB public HTML。CheckMySwap 是 public OIS curve,不得写成 proprietary dealer forward curve；EIA STEO `COPS_OPEC` 不得写成实时物理闲置桶数、OPEC 官方配额执行或油价预测；P6A `PASC_OECD_T3` / `T3_STCHANGE_WORLD` 不得写成实时全球商业库存总量、Kpler/AIS oil-on-water 确认、OPEC 月报或油价预测；PortWatch 不得写成官方贸易统计、封锁确认、战争概率或油价预测;2026-06-09 TOS pin review 已把 exact ArcGIS item `licenseInfo` pin 到 IMF Data Terms,TOS pin Phase A writer emits `usageTermsPinned=imf_data_terms_pinned` while validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` 必须保留；ICE CDX public settlement 与 CCLFX NAV proxy 不得写成 private credit marks；FRED `CREACBW027SBOG` 不得写成 non-public CRE loan tape；ICE Brent public delayed curve 不得写成 official settlement curve 或 Platts；EIA Brent spot proxy 不得写成 Platts Dated Brent 或正式 Dated Brent。

### GFRR 主雷达核心分数 Wind paid fallback 源策略

`config/main-score-source-policy.json` 是主雷达核心分数的 Wind 付费兜底源策略。它和 Bubble Watch 第二页面的 Wind paid final fallback 是两个独立边界:Bubble Watch 仍是 display-only;这里描述的是 `brent` / `dxy` / `vix` / `hyOas` / `us10y` / `real10y` / `breakeven10y` / `spx` 等 GFRR 主分数输入。

Wind 兜底成功可以进入 GFRR 主雷达核心分数，但前提是对应 official/public 主源不可用、stale、结构性阻断或 degraded，且 Wind 值通过 freshness、plausibility range、conflict tolerance 与 `npm run audit:main-score-backtest` 的 `wind_fallback_conflict_replay_v1` 回放门槛。fresh official/public primary 不得被 Wind 覆盖;两者同时 fresh 且冲突超容差时，official/public 主源胜出，Wind 只作为 sourceConflictAudit 注记。

成功进入主分数路径的 Wind 值必须带 `sourceMode=wind_paid_fallback`、`paidWindFallback=true`、`participatesInMainScore=true`、`sourceConflictAudit`、原始时间戳和 fallback reason。若 Wind source switch 会触发超过阈值的分数跳变、跨多档跳变、已有 yellow/red 档位自动降级或 tailRiskOverlay 开关翻转,分数影响守门会把该值转入 review_required / independent-confirmation 路径,不得自动改主分数。无 key、Wind 调用失败、字段缺失、超出合理范围或回放门槛未通过时，不得以 Wind 值写入 `values.*` / `displayInputsBaseline`，只能退回 last-good / rules default / unavailable 语义。

Daily runtime 已接入 `wind_paid_invalid_leaf_fallback_v1`。触发条件更窄：整体 `realtime/market.json` 必须先通过信任门槛，且某个核心叶子输入缺失、非数值、source detail 明确失败，或 source status 明确 stale/fallback/degraded/error/unavailable/blocked。它不合成完整 realtime payload，也不覆盖正常可用的 public primary。GitHub Actions 使用现有 `WIND_API_KEY` secret，并在 `build-daily-radar-data.yml` 的 `Generate radar data` step 设置 `GFRR_MAIN_SCORE_WIND_FALLBACK=1`；本地默认不开启，除非手动设置同名 env var。

该 runtime 会在 `data/radar-data.json.mainScoreSourcePolicy` 写入审计对象。`status=applied` 才代表 Wind 已实际进入本轮 GFRR 主雷达核心分数；`status=review_required` 表示 Wind 候选值取得成功但被 source conflict 或 score-impact guard 拦下。`mainScoreSourcePolicy` 不得保存 raw Wind response、Authorization header、cookie 或 API key。

SEC EDGAR 免费补充源不需要 GitHub secret。它在数据中心或 GitHub runner 403 时必须 fail-closed，不得把 403/blocked 伪装成可用数据。

---

> 运价源维护（2026-09-05）：StockQ BDI/BDTI/BCTI仅接收对应指数页面的日期绑定明文历史报价；收益率表、混淆/空白值、错页、未来或超过7天的最新记录不能标live。解析失败保留合法旧值并标fallback，无合法旧值则missing；不解码隐藏报价，不把百分比或非正/非整数值当指数，不把旧涨跌幅拼入新报价。仍是广义运价display-only背景，不授予路线级运费确认或重分发权限。

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
| **fetcher** | Worker secondary: `workers/gfrr-realtime-worker/src/worker-market-preview.js`;Daily display-only macro proxies: `scripts/run-daily-pipeline.mjs::fetchYahooChartQuote`;Market Pricing NDX/IXIC: `scripts/market-pricing/ndx-ixic-yahoo-history-refresh.mjs`;Market Pricing QQQ: `scripts/market-pricing/qqq-yahoo-history-refresh.mjs` |

**当前消费的 symbol**:

| Symbol | 含义 | 用途 |
|---|---|---|
| `BZ=F` | Brent crude futures | Brent fresh confirmation (D-5),与 FRED + TE 取一致 |
| `CL=F` | WTI crude futures | `macroDrivers.inflationEnergy.wtiMarketProxy` Daily display-only 快速市场代理;ODP `wtiPrice` 优先复用它,缺失/过期时回退 FRED `DCOILWTICO`;不是官方 WTI spot,不进 scoring/decision/execution/position |
| `^GSPC` | S&P 500 index | secondary diagnostics only (不影响 scoring,M-E-4) |
| `^NDX` | Nasdaq 100 index | `marketPricingHistory.assets.ndx` Daily/manual history refresh;QQQ primary 的辅助横向对照,不进 Worker/scoring |
| `^IXIC` | Nasdaq Composite index | `marketPricingHistory.assets.ixic` Daily/manual history refresh;Nasdaq 广度参照,不进 Worker/scoring |
| `QQQ` | Invesco QQQ ETF | `marketPricingHistory.assets.qqq` 每周自动 history refresh(Yahoo chart,替代手动 Nasdaq CSV;`refresh-qqq-market-pricing.yml` 周六 cron);primary 市场温度计 display-only,不进 Worker/scoring |
| `^TNX` | US 10Y treasury yield | secondary diagnostics only;`rawValue > 20` 时按 `divide-by-10` 归一化 (E-3A) |
| `GC=F` | Gold futures | secondary diagnostics only (E-1) |
| `DX-Y.NYB` | DXY 美元指数 | secondary diagnostics only (E-2) |
| `^MOVE` | ICE BofA MOVE 债券/利率波动率指数 | `macroDrivers.rateVol` 结构信号（进结构门控：≥140→黄、≥160→红）；**评分例外**，非 secondary/display-only；日频 + 闸门 `[20,400]`/INDEX/≤5d + fail-closed |

Market Pricing 新鲜度复核使用 `npm run review:market-pricing-freshness`，只读比较 QQQ / NDX / IXIC weekly history 与 metrics 的 latest date。QQQ 继续由周六 workflow 自动刷新；NDX/IXIC 仍是 M-91 manual-only 刷新路径，WARN 后先跑 `market-pricing:ndx-ixic-yahoo:dry-run`，经人工批准再 commit history 并重算 metrics。reviewer 本身不访问 Yahoo、不写 production data，也不改变 display-only / no-Worker / no-scoring 边界。

---

### Stooq

| 字段 | 值 |
|---|---|
| **License** | 公开 CSV,需 User-Agent |
| **Quota** | 无明确限制 |
| **Refresh 频率** | run-realtime Brent consensus 候选(每次 realtime 运行) |
| **失败 fallback** | Brent consensus 多源交叉(ice / barchart / stooq / marketwatch / oilprice / yahoo + FRED anchor) |
| **影响 scoring?** | 作为 run-realtime Brent consensus 候选之一参与交叉(多源、非单一决定)。当 FRED DCOILBRENTEU anchor 超过 72 小时时，GitHub `realtime-data` fallback producer 可在 high-confidence consensus 或 guarded two-source medium consensus 下受控晋升 `values.brent`。**worker `/q/d/l/` Brent 诊断 sourceProbe 已于 F6(2026-06-02)删除** |
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
| EIA STEO `PASC_OECD_T3` / `T3_STCHANGE_WORLD` / `PATC_WORLD` (`EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD`) | `macroDrivers.energyInventoryBalance` | OECD commercial inventory + global net inventory withdrawals + global consumption monthly estimate/forecast; not real-time global commercial inventory total, Kpler/AIS oil-on-water confirmation, or oil price forecast |
| IMF PortWatch `Daily_Chokepoints_Data` (`IMFPortWatch:Daily_Chokepoints_Data`) | `macroDrivers.energyTransport` | AIS-derived chokepoint tanker/count/capacity proxy compact summary; not official trade statistics, blockade confirmation, war probability, or oil price forecast |
| Federal Reserve `fomcprojtablYYYYMMDD.htm` | `macroDrivers.policyExpectations` | Fed dot plot federal funds median proxy from SEP accessible table |
| Federal Reserve `monetaryYYYYMMDDa.htm` | `macroDrivers.policyExpectations` | FOMC policy text tone count |
| Federal Reserve `fomcminutesYYYYMMDD.htm` | `macroDrivers.policyExpectations` | FOMC minutes keyword NLP tone/topic count |
| BoA Consumer Checkpoint public HTML | `macroDrivers.consumerRetail` | card spending per household YoY / ex-gas YoY public summary |
| Trading Economics Redbook public HTML | `macroDrivers.consumerRetail.redbookRetailSalesYoY` | Redbook same-store sales YoY public summary; not Redbook raw subscription feed |

These M-74/M-77/M-78/M-79/M-80/M-81/M-82/M-83/M-84/M-85/Energy Stress Phase 2/P6A sources are audit-only / display-only. They must not change Brent promotion, scoring, decision, execution, position, Worker runtime, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation. Private credit marks, Redbook raw subscription feed, BoA raw card feed, Platts Dated Brent, official ICE Brent settlement curve, proprietary dealer OIS forward, non-public CRE loan tape, OPEC official quota execution, real-time global commercial inventory total, Kpler/AIS oil-on-water confirmation, PortWatch raw AIS-derived history, war/blockade probability, and oil-price prediction remain unconnected or explicitly out of scope.

FOMC minutes keyword NLP 只使用已落盘的 `macroDrivers.policyExpectations` 字段做离线质量复核。`npm run review:fomc-minutes-tone-quality -- --no-output` 会复算语气阈值、topic 排序、摘要、官方 URL/日期与证据龄；它不重新请求 Federal Reserve,不升级为完整政策 NLP 模型,也不把 `fallback` / `manual_required` / `stale` 包装成新鲜信号。人工需要把 `WATCH` 也作为非零退出时才使用 `--strict`。

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
| **MLF 发现与解析保护** | 主关键词没有可解析的有效操作时使用备用关键词（包括主查询失败）；最多 2 次逻辑查询、总计最多 6 篇去重正文，优先 MLF 标题。毛额、期限及可选利率只绑定同一操作上下文，逆回购/到期/净额不能补位；严格校验日历和非未来操作日，45 天按操作日计算，不能用新文章日期刷新旧操作。逻辑请求预算不改变既有 HTTP retry 的有界策略。 |
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

WTI / Brent / 裂解价差 / 期限结构由 `oil-directional-pressure.json` **复用** `data/radar-data.json`(`macroDrivers.inflationEnergy.wtiMarketProxy` 优先,回退 `macroDrivers.inflationEnergy.wti` / `brentPricingLayer.selectedBrent` / `.crackSpread` / `.futuresPriceCurve`),不重抓。`Refresh Oil Directional Pressure` 每日 23:45 UTC 在 Daily 后重建 ODP,以刷新这些 T1 市场代理与 evidence `ageDays`;EIA WPSR 仍是周频物理锚。`wtiMarketProxy` 为 Yahoo `CL=F` WTI futures 快速市场代理,用于降低 ODP 的 WTI T1 证据滞后;FRED `DCOILWTICO` 官方 WTI spot 保留为低噪声滞后校准 fallback。P6B 起,ODP build 还会复用 `radar-data.macroDrivers.energyInventoryBalance` / `energySpareCapacity` / `energyTransport` 生成 `interpretation.globalOverlay` 慢变量确认层;该层仍 display-only,不改变 `finalBias` 枚举、不进入 scoring/decision/Heatmap。`macro-overview-narrative-v1` 可在首页 Macro Risk Overview 只读引用 ODP 作为油价方向证据,但不得把 ODP 并入 `values.*`、六大模块、cross-validation 或 Global Risk Heatmap。EIA = 美国政府公共领域数据,标注 source URL 即可。详见 [`OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md`](OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md)。

P9 起,ODP 每条 evidence 均携带时点分级 metadata:`T2_weekly_official_anchor` 用于 EIA WPSR 8 个周度官方锚,`T1_daily_market_proxy` 用于复用的 WTI / Brent / crack / curve 日频市场代理。P40a 起,每条 evidence 还必须携带 `directionalRole`:当前 EIA 8 源为 `core_physical_anchor`,复用的 WTI / Brent / crack / curve 为 `market_confirmation`;该字段只为后续 ODP Decision Ladder UI 提供只读展示分层依据,不得被解释为新模型权重、方向 call 或预测分数。该 metadata 只解释“快信号 vs 慢锚点”和“核心物理锚 vs 市场确认”的证据节奏/校准关系;不代表已接入新闻 API、FIRMS/VIIRS 热异常、Kpler/Vortexa、API 周报、或任何新实时源,也不得被用于 scoring/decision/execution/position。

P10 起,ODP 前端折叠详情新增 `NEWS EVENT WATCH / 新闻事件观察`,只读复用已有 `data/world-order-stress.json` 的 GDELT Cloud 广义冲突事件摘要和 Worker 市场确认 Brent 值。该复用不新增抓取请求、不读取浏览器外部 API、不写 `data/oil-directional-pressure.json`,也不代表已接入专用油价新闻 API、FIRMS/VIIRS 热异常、Kpler/Vortexa 或船舶级 AIS 流向。用户可见文案必须保留低置信边界:只能提示能源事件背景观察,不得写成通道中断、断供、真实油轮流量、战争概率或油价预测。

P28 起,新增 `npm run diagnose:oil-news-events` 作为 **manual-only** ODP 专用 oil-news event 诊断辅助。默认 dry-run/no-network;显式 `--allow-network` 后才查询 GDELT DOC 2.0 public search、Tavily Search API 与 Brave News Search API,围绕 chokepoint/tanker shipping、sanctions/shadow fleet、facility/supply disruption 与 market reaction 四组查询生成 ignored `manual-artifacts/oil-news/oil-news-events-diagnosis-latest.json`。P36 起,GDELT DOC 请求由共享 wrapper `scripts/gdelt/fetch-gdelt.mjs` 统一处理串行请求/退避/timeout/诊断,helper 不再持有直接 GDELT endpoint。P37 起,GDELT DOC 从四组 per-bucket 查询收口为单条 `gdelt_broad_oil_news` broad query + 本地 bucket 分类,并通过 `data/gdelt-news-cache.json` 保存 compact cache;Tavily/Brave 仍保留 per-topic cross-check。P39a 起,Oil News 的 GDELT DOC 子源降为慢速背景源:成功 cache 24 小时内复用,live 失败后 24 小时 error cooldown 内不再请求 GDELT,72 小时内可用 stale cache 兜底,且单次 Oil News 刷新对 GDELT 不做第二次 retry。429/error 时保留的 `lastUsableCache` 只作 audit-only 背景,不得增强当前 Oil News 聚合。Tavily/Brave key 可通过环境变量或 ignored local key files 提供,artifact 不保存 key。该 helper 只用于 source review 与人工复核,不新增 scheduled workflow、不写 `data/*.json` / `realtime/*.json`(生产 build 除 `data/oil-news-event-watch.json` + `data/gdelt-news-cache.json`),不进入 production display、ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。source-review 见 [`OIL_NEWS_EVENT_SOURCE_REVIEW.md`](OIL_NEWS_EVENT_SOURCE_REVIEW.md)。

P29 起,ODP 专用 oil-news event 从 manual-only 研究工具推进到 **production read-only observation artifact**:`data/oil-news-event-watch.json`。sourceKey=`odp_oil_news_event_watch`,sourceDomain=`GDELT DOC via scripts/gdelt/fetch-gdelt.mjs + api.tavily.com + api.search.brave.com`,assignedLayer=`github_actions_backup_validation_layer` + `frontend_display_layer`,primaryOwnerLayer=`github_actions_backup_validation_layer`,freshnessCadence=`6h scheduled at minute 37 + manual dispatch; GDELT DOC sub-source is cache/cooldown gated`,artifactOnlyBeforeProduction=`false`(只写 sanitized compact production artifact),sanitizerRequired=`built-in compact writer + check:oil-news-event-watch`,productionWriterRequired=`Refresh Oil News Event Watch workflow`,fallbackPolicy=`source_unavailable/partial fail-closed`,sourceComplianceStatus=`GDELT public no-key + Tavily/Brave GitHub secrets, no committed key, no raw news body redistribution`,affectsScoring/Decision/Execution/Position=`false`。P37 后 workflow 同时提交 `data/gdelt-news-cache.json`;主 watch JSON 与 GDELT cache 均不得保存 article title、URL、snippet/body/raw response,只保存 domain/publishedAt/bucket/source/query 等 redacted metadata、聚合风险计数和脱敏 diagnostics。P39a 后该 cache policy 为 `ttlMinutes=1440` / `staleMaxHours=72` / `errorCooldownHours=24`,因此每 6 小时的 workflow 可继续刷新 Tavily/Brave 快新闻,但 GDELT DOC live request 最多在 fresh/error cooldown 过期后才发生。当前共享 Tavily/Brave 免费层预算按最坏 31 天估算为 scheduled 737 requests/provider + 200 manual reserve,不得把 cadence 提高到导致总预算超过 1,000 requests/provider/month。429/error 下 `lastUsableCache` 可保留最近可用 compact GDELT cache 供审计,但 `usedForCurrentSignal=false`,不得增强本轮新闻信号。workflow 读取 `TAVILY_API_KEYS` / `BRAVE_API_KEYS` GitHub Secrets;前端 ODP `NEWS EVENT WATCH` 只读消费主 watch JSON。`watch` / `elevated_manual_review` 只代表新闻事件代理需人工复核,不得写成霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向确认。

P41 起,新增 `npm run diagnose:gdelt-web-ngrams` 作为 **manual-only** GDELT Web NGrams live smoke/source-review。默认 dry-run/no-network;显式 `--allow-network` 后才通过共享 wrapper 下载 GDELT Web NGrams v5 legacy `ngrams.txt.gz`,扫描 oil/chokepoint/tanker/sanctions/facility/supply 相关短语并生成 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json`。P42 起,该 helper 使用 bounded HEAD latest-file discovery:先轻量探测最近 heartbeat-style candidate timestamps,命中后只下载第一份可用文件;若公开存储当前没有近实时文件,artifact 会明确 `source_unavailable` 而不是假装 live。P43 起,新增 `npm run review:gdelt-web-ngrams-samples` 对多份 ignored diagnosis artifact 做 no-network 样本复核,只输出 discovery 稳定性、hit/doc range、bucket/term coverage 与 warnings/blockers。P44 起,新增 `npm run archive:gdelt-web-ngrams-samples` 将有效 diagnosis artifact 以 sanitized sample 归档到 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-samples/`,写入 sidecar 并调用 P43 reviewer 形成 `insufficient_samples` / `stable_manual_review_ready` / `unstable_keep_manual_only`。P45 起,新增 `gdelt-web-ngrams-fallback-source-review-p45` source-review,只把 Web NGrams 定义为 `oil_news_gdelt_web_ngrams_background_fallback_display_only` 候选,状态固定 `source_review_manual_fallback_candidate_no_production_display`,并要求未来 P46 另开合同。P46 起,新增 `gdelt-web-ngrams-production-display-fallback-contract-p46` 合同设计,状态固定 `contract_design_only_waiting_for_sufficient_p44_samples_no_production_write`,只定义未来 `sourceCaches.gdeltWebNgramsFallback` 的 `aggregate_source_health_only_no_headlines` 字段形状与样本门槛;仍不批准 production write/frontend/workflow/current signal/scoring。P47 起,新增 `GDELT Web NGrams Sample Collector` (`.github/workflows/gdelt-web-ngrams-sample-collector.yml`) 做 artifact-only sample collection,每 3 小时恢复上一轮 artifact、跑 live diagnosis、archive 和 8-sample gate review;P47 does not write production data,不 commit/push,不读取 Tavily/Brave/GDELT Cloud/FIRMS secrets,不接生产 Oil News build。P48 起,新增 `sanitize:gdelt-web-ngrams-artifacts` / `gdelt-web-ngrams-artifact-sanitizer-p48`,移除 legacy `selectedFile.url`、URL fields、raw title/body/snippet/raw response markers;collector 恢复旧样本和生成最新 diagnosis 后都会先清洗,archive 写 sanitized sample,review 阻断残留 URL/raw marker。P49 起,新增 `gdelt-web-ngrams-fallback-gate-review-p49` 正式 sample-gate review,状态 `sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write`,只确认 Web NGrams fallback 样本已满足 display-only projection dry-run 的前置门槛,下一步仅允许 `p50_display_only_fallback_projection_dry_run_no_production_write`,仍不批准 production write/frontend/workflow/current signal/scoring。P50 起,新增 `gdelt-web-ngrams-display-fallback-projection-p50` dry-run projector,只把 P49 样本门槛投影为未来 `sourceCaches.gdeltWebNgramsFallback` 的 compact display-only shape,输出仅限 ignored `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json`,状态 `display_only_fallback_projection_ready_no_production_write`,下一步仅允许 `p51_display_only_fallback_projection_review_no_production_write`。P51 起,新增 `gdelt-web-ngrams-display-fallback-projection-review-p51` review,命令为 `review:gdelt-web-ngrams-display-fallback-projections` / `check:gdelt-web-ngrams-display-fallback-projection-review`,通过状态 `display_fallback_projection_review_passed_no_production_write`,只复核 P50 projection 仍满足 future field absent、aggregate-only、no raw content、sample gate 与 all approvals false,并保持 `productionWriteApproved=false`,`frontendApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p52_display_only_fallback_writer_contract_design_no_production_write`。P52 起,新增 `gdelt-web-ngrams-display-fallback-writer-contract-design-p52` writer contract design,状态 `display_only_fallback_writer_contract_design_no_production_write`,只定义未来 `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback` 的 compact display-only cache shape(`gdelt-web-ngrams-display-fallback-cache-v1`),并保持 `productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false`,`apiKeyReadApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p53_display_only_fallback_disabled_writer_scaffold_no_production_write`。P53 起,新增 `gdelt-web-ngrams-display-fallback-disabled-writer-p53` disabled writer scaffold,状态 `disabled_no_production_write`,writerState=`disabled_scaffold_no_production_write`,命令为 `project:gdelt-web-ngrams-display-fallback-disabled-writer` / `check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold`,只输出 ignored manual artifact,并保持 `productionDataWriteApproved=false`,`productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write`。P54 起,新增 `gdelt-web-ngrams-display-fallback-disabled-writer-review-p54` review,通过状态 `disabled_writer_scaffold_review_passed_no_production_write`,命令为 `review:gdelt-web-ngrams-display-fallback-disabled-writer` / `check:gdelt-web-ngrams-display-fallback-disabled-writer-review`,只确认 P53 仍 disabled/no-production/future-field-absent/aggregate-only/no-raw/all-approvals-false,并保持 `productionDataWriteApproved=false`,`productionWriteApproved=false`,`writerImplementationApproved=false`,`frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p55_display_only_fallback_production_write_readiness_gate_no_production_write`。P55 起,新增 `gdelt-web-ngrams-display-fallback-production-write-readiness-p55` readiness gate,状态 `production_display_only_write_ready_no_production_write`,命令为 `review:gdelt-web-ngrams-display-fallback-production-write-readiness` / `check:gdelt-web-ngrams-display-fallback-production-write-readiness`,本身不写 production data,但对 P56 授予窄作用域 `p56ProductionDataWriteApproved=true`,仅允许写 `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback` compact display-only cache,并保持 `frontendImplementationApproved=false`,`workflowAutomationApproved=false`,`currentSignalEnhancementApproved=false`,`scoreApproved=false`;下一步仅允许 `p56_display_only_fallback_production_display_write`。该路径用于验证 GDELT DOC 429 时的下载型替代思路是否可用;不读取 TOC 标题/URL,不保存新闻正文或 raw response,不写 `realtime`,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P56(Web NGrams fallback) 起,`write:gdelt-web-ngrams-display-fallback-production-cache` 将 P55 审核后的 compact cache 写入 `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback`;`check:gdelt-web-ngrams-display-fallback-production-display-write` 验证该字段 contract 为 `gdelt-web-ngrams-display-fallback-cache-v1`,display mode 为 `aggregate_source_health_only_no_headlines`,并且 `productionDataWriteApproved=true` 仅限这个单字段。该字段仍保持 `frontendDisplayApproved=false`,`workflowAutomationApproved=false`,`currentSignalEnhancement=false`,`eventConfirmationSource=false`,`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`;它只做 GDELT DOC 受限时的 source-health/background fallback provenance,不展示标题/URL/正文/raw response,不改 Oil News 当前信号、前端、workflow、ODP build、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P63(Web NGrams frontend aggregate health) 起,独立 `gdelt-web-ngrams-frontend-aggregate-health-p63` 闸门仅批准前端只读展示上述 production cache 的 aggregate sample-gate/source-health 摘要,状态 `frontend_aggregate_source_health_approved`,并把当前 cache marker 更新为 `frontendDisplayApproved=true`。renderer 必须 fail-closed 且只显示样本数、时间戳数、观察窗、告警数和“不用于当前新闻信号”边界;不得读取/展示 headline、URL、snippet、body、raw response 或事件主张。`currentSignalEnhancement=false`,`eventConfirmationSource=false`,`headlineSource=false`,`oilDirectionInput=false`,`eligibleForScoring=false`,`workflowAutomationApproved=false`,`liveFetchApproved=false` 继续保持;不改 Oil News 当前信号、workflow、ODP build/`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P67(Web NGrams frontend sample age) 起,additive `gdelt-web-ngrams-frontend-sample-age-p67` 只批准读取既有 cache 的 `sampleGate.latestSelectedTimestamp` 与 `staleAfterHours`,派生“历史审阅样本截至日期 / 距今时长 / 是否超时效”。它不新增或刷新 source,不改 production cache/workflow,不得写成当前新闻 freshness、事件确认或油价方向证据；无效/未来异常时间必须 fail-closed,headline/URL/snippet/body/raw response 继续禁止,Oil News signal 与所有 ODP/scoring/decision/execution/position 边界不变。

P64(ODP verdict history monitor) 起,新增 `monitor:oil-directional-verdict-history` / `check:oil-directional-verdict-history-monitor` 与只读 workflow。monitor 只从 git history 读取 committed `data/oil-directional-pressure.json`,汇总既有 `finalBias` / `physicalBias`、verdict/family transitions、当前 streak、physical/final divergence、confidence、data sufficiency、evidence age/status 与 global overlay effect;默认只写 ignored `manual-artifacts/oil-directional/oil-directional-verdict-history-monitor-latest.json` 和可选 GitHub Summary。它不抓新源、不读 API key、不重建 ODP、不写 production data、不自行计算新 verdict/score,不改变 `values.*`、scoring、decision、execution、position、Brent promotion、ODP `finalBias`、Global Risk Heatmap 或 cross-validation。

P65(FIRMS history-window capacity) 起,baseline preparation / rolling refresh / quality monitor 默认审阅 240 commits / 240 samples,archive/preparation/refresh/monitor CLI 统一允许 1..500。该容量修复只读取更多 committed sanitized Oil Thermal watch history,不新增 FIRMS 请求、不读 MAP_KEY、不改变 P59 request policy、P60 health gate、30-day quality threshold、repeated-observation 数学或人工 promotion 边界；不得自动写 production baseline,不得接入 ODP `finalBias`、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P68(FIRMS facility-window quality gate) 起,global healthy history `sampleWindowDays` 仅作为审计跨度；baseline quality / quality monitor / 前端质量说明必须使用全部 ready/promoted facilities 的最短 `windowDays` (`effectiveQualityWindowDays`)。只有所有已晋升设施都达到 30 天才可显示 `established_observation_window`。当前 no-write packet 的 36.20 天全局跨度不得掩盖 27.74 天最短设施窗与 30 个未满 30 天设施；因此人工 promotion 继续等待新的健康样本。本变更不新增 source/fetch/MAP_KEY 使用,不改变 FIRMS request policy、P60 health gate、baseline p95/repeated/elevated 数学或任何 ODP/scoring/decision/execution boundary。

P66(ODP persistent-low-confidence observation) 起,P64 monitor 在最近 7 个 committed valid ODP samples 全部 `confidence=low` 时只记录正交观察 `persistentLowConfidence=true` 与 manual review suggestion。它不抓新源、不把 low confidence 解释成新的方向信号,不替换 primary monitor status,不单独触发 required action,不得削弱 confidence caps/classifier,不得写 production data 或改变 ODP `finalBias`、`values.*`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P30 起,新增 `npm run review:oil-news-event-watch-samples` 作为 **manual/local calibration review**。默认从 git history 抽取最近 `data/oil-news-event-watch.json` sanitized production samples,也可读取 fixtures/manual artifacts,只输出 ignored `manual-artifacts/oil-news/oil-news-event-watch-samples-review-latest.json`。该 review 汇总 Tavily/Brave/GDELT source health、usable sample count、bucket stability、article count range、domain frequency 与 high-claim headline title risk,用于决定是否继续保持 display-only 或是否另开 reviewed UI/copy 增量。它不访问网络、不读取 API key、不写 production data、不修改 frontend、不展示 headline、不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P31 起,`data/oil-news-event-watch.json` 生产 artifact 增加 `titleRisk` 与 `headlineDisplayReadiness`。`titleRisk` 只对 build 内存中的 transient article titles 做高主张标题计数,生产 JSON 只保存聚合计数、域名和触发词类别,不得保存标题原文或 URL;`headlineDisplayReadiness.displayHeadlinesApproved` 必须保持 `false`,若出现 blockade/closure/war/attack/mine/strike/shutdown/halt/disruption 等标题风险词,state 必须为 `not_ready_high_claim_title_noise`。这是标题展示安全闸,不是新闻事实确认;不新增抓取源、不修改 frontend、不改变 workflow 节奏、不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P32 起,ODP `NEWS EVENT WATCH` 前端只读展示 P31 的标题闸门聚合信息:headline readiness state、high-claim title count、evaluated title count 与 source-domain count,并明确提示不展示标题原文。Renderer 不得读取 `topArticles` 或展示 article title;`check:oil-directional-zh-copy` 对此做静态守卫。P32 不新增抓取源、不改 production artifact schema、不展示新闻标题列表、不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P33 起,ODP `NEWS EVENT WATCH` 前端新增 `来源健康` 聚合文案,只读消费 production artifact 已有 `sourceStatus` / `queryCoverage` / `aggregate.liveSourceCount`。它显示 GDELT / Tavily / Brave 三源可用性、查询成功率、部分来源降级与失败关闭语义,并把 legacy World Order GDELT fallback 明确标为"专用三源未接入"。P33 不新增抓取源、不改 production artifact schema、不展示新闻标题、不读取 `topArticles`,不把单一路径新闻报道写成霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向确认,不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P34 起,新增 `npm run review:oil-news-source-health-samples` 作为 **manual/local source-health sample review**。默认从 git history 抽取最近 `data/oil-news-event-watch.json` sanitized production samples,也可读取 fixtures/manual artifacts,只输出 ignored `manual-artifacts/oil-news/oil-news-source-health-samples-review-latest.json`。该 review 聚焦 sourceStatus/queryCoverage/aggregate 的历史稳定性:三源 live/partial/error 分布、Tavily/Brave 可用率、GDELT 降级/429 等错误、查询成功率区间、fail-closed copy readiness 与 headline-display guard 状态;输出不保存 article title 字符串。它不访问网络、不读取 API key、不写 production data、不修改 frontend、不改变 workflow cadence 或 production schema,不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P52 起,新增 `npm run review:oil-news-claim-ledger` 作为 **manual/local claim-ledger review**。默认从 git history 抽取最近 `data/oil-news-event-watch.json` sanitized production samples,也可读取 fixtures/manual artifacts,只输出 ignored `manual-artifacts/oil-news/oil-news-claim-ledger-latest.json`。该 review 内部读取 compact title 做规则分类,但输出不保存原始 title 或 URL;每条 claim 只保留 `titleHash`、domain、sourceTier、eventType、claimAxis、claimPolarity、bucket/query ids 与 trigger-term classes。`claimPolarity` 分为 `risk_escalation` / `risk_deescalation` / `mixed_or_contested` / `market_reaction_only` / `unclear_or_high_claim`,用于把 bucket count 拆成“风险升级、风险缓和、市场反应、方向混杂”的人工复核账本。2026-07-02 起 artifact 追加 `claimAxisCounts` / `axisCounts` / `axisSplit`,用于把 transport_security 与 supply_flow 等轴拆开,避免把“咽喉安全风险升高”与“供应流恢复”误读为同一命题互相抵消;`axisSplit` 仍只是人工复核证据,不确认事件或方向。P52 不访问网络、不读取 API key、不写 production data、不修改 frontend、不批准 headline display、不确认霍尔木兹关闭/重开、断供、油轮流向、炼厂事故、制裁影响或油价方向,不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P53 起,`data/oil-news-event-watch.json` 生产 artifact 增加 `claimPolarity` 聚合字段,由 `scripts/oil-directional/oil-news-claim-classifier.mjs` 在 build 时从 compact article metadata 派生。该字段只保存 polarity/eventType/sourceTier counts 与 contradiction state,不保存标题、URL、titleHash、正文或 raw response;`displayMode=aggregate_only_no_headlines` 且标题展示批准字段保持 false。ODP `NEWS EVENT WATCH` 前端只读显示“升温/降温/混合/市场反应”聚合计数和混合待核状态,renderer 仍不得读取 `topArticles` 或展示 article title。P53 不新增抓取源、不改变 GDELT/Tavily/Brave cadence、不确认通道/断供/事故/制裁/油价方向,不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P54 起,ODP 前端新增 `CROSS-CONFIRMATION / 交叉确认` display-only 汇总,把 Oil News `claimPolarity`、Worker/World Order 市场确认输入、Oil Thermal facility baseline 聚合与 EIA/WPSR 周度物理锚放在同一可读层里比较。它不新增外部源、不改变任何刷新频率、不写 production data,也不把四层比较结果回流到 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。该层只能显示“同向/背离/确认不足”的说明,不得确认断供、封锁、炼厂事故、制裁影响或油价方向。

P56 起,ODP 前端新增 `READINESS / 证据成熟度矩阵` display-only 汇总。该矩阵不新增数据源,只读页面已加载的 ODP/EIA、radar-data global energy overlay/energyTransport 摘要、World Order/Worker 市场确认、Oil News 与 Oil Thermal production artifacts,把证据成熟度和闸门状态整理成方向锚、确认/反证、慢变量、运输候选、新闻观察与卫星设施代理。ODP renderer 不直接读取 Transport Shock candidate 字段;具体路线/市场确认候选仍由 C1 Transport Shock 专属卡展示。它不写 production data、不读取新闻 `topArticles` 或 ignored manual artifacts、不改变刷新频率,不得回流到 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P57 起,ODP `NEWS EVENT WATCH` 前端新增 `主张质量` display-only 行。该行不新增数据源,只读 Oil News production artifact 已有的 `claimPolarity`、标题闸门、标题风险、source health 与 query coverage 聚合字段,说明新闻主张是否混合、是否存在未明/高主张、标题是否仍未批准、来源是否降级、多源是否不足。它不读取 `topArticles`、title、URL、snippet/body/raw response 或 ignored manual artifacts,不展示标题原文,不把单一路径新闻写成霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向确认,也不进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P58 起,新增 `npm run probe:oil-thermal-targeted` 作为 **manual/local Oil News → Oil Thermal targeted probe planner**。它只读 `data/oil-news-event-watch.json` 与 `config/oil-thermal-watch-facilities.json`,用设施别名匹配新闻文本后输出 ignored `manual-artifacts/oil-thermal/targeted-probe-plan-latest.json` 与可供 `diagnose:firms-thermal` 使用的 ignored target facilities artifact。默认 dry-run/planning 不访问 FIRMS、不读取 MAP_KEY、不写 production data;只有 operator 显式加 `--run-diagnosis` 时才复用现有 `diagnose:firms-thermal` 对命中设施跑 1/3/5 天 FIRMS 诊断,且结果仍只写 ignored manual artifacts。输出只保留 source domain 与 hash,不得输出 raw title/headline/snippet/body/URL,不得确认设施事故、断供、通道中断、封锁或油价方向,也不得进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P-score-35 起,新增 `npm run review:transport-shock-confirmation-factor-high-frequency-confirmation` 作为 **manual/local high-frequency confirmation review**。它只读 Oil News claim ledger review、可选 P-score-36 news manual gate 与 Oil Thermal watch/probe artifact,输出 schema `transport-shock-confirmation-factor-high-frequency-confirmation-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/high-frequency-confirmation-latest.json`。该 helper 明确区分 `newsRepeatedElevatedObservation`、`thermalRepeatedObservation` 与 `thermalElevatedRepeatedObservation`:新闻可以显示多轮 `elevated_manual_review`,但若存在 mixed claims、低置信高主张或标题展示闸门,仍保持人工复核;news manual gate clear 只能清理新闻人工复核 blocker,不能替代热异常/设施确认;热异常只有达到 established baseline + repeated + elevated 阈值才算 elevated repeated。状态 `partial_progress_keep_display_only` 只代表新闻重复升高和/或热异常重复观察已有进展,不是 no score write 的突破,不得确认断供、设施事故、封锁、霍尔木兹中断或油价方向,也不得进入 ODP build/classifier/finalBias/scoring/decision/execution/position/Brent promotion/Global Risk Heatmap/cross-validation。

P-score-36 起,新增 `npm run review:transport-shock-confirmation-factor-news-manual-gate` 作为 **manual/local news manual gate**。它只读 Oil News claim-ledger review,输出 schema `transport-shock-confirmation-factor-news-manual-gate-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json`。该 helper 将 sample sufficiency、repeated elevated news samples、claim direction stability、source-tier risk 和 headline guard 拆成 `manualReviewBlockers`;当前 `news_manual_gate_blocked_keep_manual_review` 表示新闻重复升高仍受 mixed claims、低置信高主张或标题闸门限制,不得作为通道/断供/事故/油价方向确认。即使未来 gateClear,也只允许进入 separate cross-confirmation review,仍不得 score write、production write、frontend write、ODP finalBias 或今日总判断打分。

P-score-41 起,新增 `npm run review:transport-shock-confirmation-factor-news-operator-review` 作为 **manual/local delegated operator review**。它只读 Oil News claim-ledger review,输出 schema `transport-shock-confirmation-factor-news-operator-review-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/news-operator-review-latest.json`,reviewerType 固定 `codex_operator_delegate`。状态 `operator_review_clear_for_cross_confirmation_no_score_write` 可把 mixed claims 解释为 `axis_split_reviewed_not_direct_contradiction`(优先读取 claim ledger 的 `axisSplit=security_risk_vs_supply_flow_split`,即咽喉/航运安全风险升高与供应流量去风险可并存),并把低置信高主张降级为 `downgraded_to_non_confirming_context`;它只允许 news manual gate 进入 cross-confirmation review,不得确认霍尔木兹关闭、断供、路线级运费、设施事故或油价方向,不得 score write、production write、frontend write、ODP finalBias、Brent promotion、今日总判断打分或 cross-validation。

P-score-42 起,新增 `npm run monitor:transport-shock-confirmation-factor-news-operator-review` 作为 **artifact-only news operator-review monitor**。它默认从 git history 重建 Oil News claim-ledger artifact,再运行 delegated operator review,输出 schema `transport-shock-news-operator-review-monitor-p42` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/news-operator-review-monitor-latest.json`。monitor 依据 claim-ledger `lastSampleAt` 追加 `newsManualGateHint.freshness`:0-12h full、12-24h strong_but_aging、24-48h reduced、>48h `expired_over_48h` 并要求重新复核。状态 `news_operator_review_still_clear_for_cross_confirmation_no_score_write` 只说明新闻层的 mixed/source-tier 人工复核仍可进入 cross-confirmation review;它不触发 Daily、不联网、不写 production data、不接 workflow/Worker/frontend,也不得确认通道、断供、路线级运费、设施事故或油价方向,不得 score write、ODP finalBias、今日总判断打分或 cross-validation。

P-score-37/P-score-39/P-score-40 起,`npm run review:transport-shock-confirmation-factor-cross-confirmation` 是 **manual/local cross-confirmation review**。它只读 production `macroDrivers.energyTransport.transportShockCandidate`、P-score-36 news manual gate、P-score-35 high-frequency confirmation、manual/display-only market-confirmation projection、P-score-40 PortWatch freshness probe 与 ODP 周度物理锚,输出 schema `transport-shock-confirmation-factor-cross-confirmation-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json`。该 helper 将 PortWatch freshness、route freight、market confirmation、news gate、high-frequency physical confirmation 和 ODP anchor 拆成 `rows` / `hardBlockerIds`;market projection ready 只能作为 supporting pass,PortWatch freshness probe ready 也只能清理 `portwatch_physical_proxy_freshness` 这一项,不得写 production `marketConfirmation`、不得确认路线级运费或油价方向。当前 `cross_confirmation_blocked_keep_display_only` 表示运输候选仍未完成多源交叉确认,不得作为封锁、断供、事故、油价方向或今日总判断打分输入。即使未来 `crossConfirmationReady=true`,也只能进入 separate score-design review,仍不得 score write、production write、frontend write、ODP finalBias、Brent promotion 或 cross-validation。

P-score-38 起,新增 `npm run review:transport-shock-confirmation-factor-score-integration-preflight` 作为 **manual/local score-integration preflight**。它只读 free-proxy score-readiness gate、P-score-37 cross-confirmation artifact 与可选 P-score-47 free-proxy bridge preflight artifact,输出 schema `transport-shock-confirmation-factor-score-integration-preflight-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json`。该 helper 明确区分历史样本 gate、当前交叉确认与低权重免费代理路径的 route blocker 重分类:只有 cross-confirmation 仅剩 `route_freight_confirmation`,且 bridge preflight 已明确 `bridgePreflightPassed=true` / `remainingHardBlockerIds=[]`,才允许 `score_integration_preflight_ready_for_design_review_no_score_write`。其他 cross-confirmation blocker 仍必须保持 `score_integration_preflight_blocked_keep_no_score_write` / `clear_cross_confirmation_blockers_before_score_design`。未来 preflightPassed 也只允许另开 reviewed score-design PR,不得 score write、production write、frontend write、ODP finalBias、Brent promotion、今日总判断打分或 cross-validation。

P-score-43 起,新增 `npm run monitor:transport-shock-confirmation-factor-score-integration-preflight` 作为 **manual/local score-integration preflight monitor**。它只运行 P-score-38 preflight,输出 schema `transport-shock-score-integration-preflight-monitor-p43` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-monitor-latest.json`。若 P-score-38 仍 blocked,状态 `blocked_on_external_evidence_or_source_rights` 表示剩余 blocker 已不是可继续 code-only 清理的事项;若 P-score-38 因 P-score-47 bridge + 高频物理确认而通过,也只提示可另开 reviewed score-design PR,仍不批准 score write。该 monitor 不联网、不写 production data、不接 workflow/Worker/frontend、不批准 score write、ODP finalBias、Brent promotion、今日总判断打分或 cross-validation。

P-score-44 起,新增 Transport Shock free freight alternative source-review(`transport-shock-free-freight-alternative-source-review-v1`)。该 review 把 IMF PortWatch、StockQ BDTI/BCTI、NOAA MarineCadastre AIS、Suez/Panama 官方统计、EIA/IEA chokepoint exposure、CME/ICE TD3C link/manual reference、Solactive wet freight index 与 Baltic daily TD/TC route assessments 分成 automatable/existing context、source-terms-review candidate、link-only/manual reference 与 blocked-without-rights。状态固定 `source_review_free_alternatives_no_route_freight_confirmation`;它只定义 `free_transport_pressure_proxy`,不得批准 unauthorized scraping、live fetch、production write、frontend、workflow、Worker、score write、ODP finalBias、Brent promotion、今日总判断打分或 cross-validation,也不得清理 `route_freight_confirmation`。

P-score-45 起,新增 Transport Shock satellite handling policy(`transport-shock-satellite-handling-policy-v1`)。该 policy-review 规定 Oil Thermal / FIRMS 卫星热异常未满足 repeated elevated observation 时不得降低 FRP、置信度、设施半径、重复观测或基线阈值来清 blocker。状态固定 `policy_review_no_thermal_blocker_bypass`;no-detection 只能作为设施事故主张的负证据和展示文案 `未见卫星热异常确认`,不能证明无事故、不能清 `high_frequency_physical_confirmation`、`routeFreightConfirmation`、market blocker 或 score blocker。新闻/设施提及时只允许 ignored `manual-artifacts/oil-thermal/` targeted probe,不得写 production data、不得接 frontend/workflow/Worker、不得入分或改变 ODP finalBias、Brent promotion、今日总判断打分、Global Risk Heatmap、cross-validation。

P-score-46 起,新增 Transport Shock free-proxy score bridge review(`transport-shock-free-proxy-score-bridge-review-v1`)。该 bridge-review 把 P44/P45 与 P19/P38 串联:未来 artifact-only preflight 可把 `route_freight_confirmation` 归类为 `not_applicable_to_free_proxy_low_weight_path`,但 `routeFreightConfirmation` 必须继续是 `not_connected`,true route-level tanker freight 仍不可确认。状态固定 `bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write`;`high_frequency_physical_confirmation` 仍是硬 blocker,只能由 repeated elevated Oil Thermal / facility evidence 或另开的 reviewed thermal bypass policy 清理。边界:no score write/no production write/no frontend/no workflow/no Worker/no ODP finalBias/no main judgment weighting/no cross-validation。

P-score-47 起,新增 `review:transport-shock-free-proxy-bridge-preflight` local/manual ignored artifact helper,输出 schema `transport-shock-free-proxy-bridge-preflight-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json`。该 preflight 只读 P46 bridge-review、free-proxy readiness gate 与 cross-confirmation artifacts;可把 `route_freight_confirmation` 重分类为低权重 free-proxy path 的 `not_applicable_to_free_proxy_low_weight_path`,但必须保持 `routeFreightConfirmation=not_connected`、`routeFreightConfirmationCleared=false`、no score write。若剩余 blocker 为 `high_frequency_physical_confirmation`,状态为 `free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write`;不得写 production data、不得接 frontend/workflow/Worker、不得改变 ODP finalBias、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-48 起,新增 `review:transport-shock-confirmation-factor-free-proxy-score-write-design` 作为 **manual/local score-write design review**。它只读 P-score-20 `transport-shock-confirmation-factor-free-proxy-score-candidate-v1` 与 P-score-21 `transport-shock-confirmation-factor-free-proxy-score-replay-v1` artifact/fixture,输出 schema `transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-write-design-review-latest.json`。状态 `score_write_design_review_ready_no_production_write` 只说明 3% cap、news-only / single-chokepoint-only / stale-PortWatch 零贡献控制和 ready-candidate cap replay 控制自洽;它仍必须保持 `scoreWriteApproved=false`,`productionWriteApproved=false`,`scoreIntegrationApproved=false`,`eligibleForMainScore=false`,`historicalBacktestPerformed=false`。recommendation 只能是 `open_separate_runtime_score_integration_design_review_do_not_auto_wire`;不得写 production data、不得接 frontend/workflow/Worker、不得 score write、不得自动入分、不得改变 ODP finalBias、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-49 起,新增 `review:transport-shock-confirmation-factor-runtime-score-integration-design` 作为 **manual/local runtime score integration design review**。它只读 P-score-48 score-write design review artifact/fixture,输出 schema `transport-shock-confirmation-factor-runtime-score-integration-design-review-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/runtime-score-integration-design-review-latest.json`。状态 `runtime_score_integration_design_ready_no_production_write` 只说明未来接入主分前的 runtime guard 设计清单已成形,包括 `feature_flag_default_off`、`hard_cap_three_pct`、缺字段/非 live/fail-closed zero contribution、contract migration review 与 rollback/kill-switch。它仍必须保持 `runtimeIntegrationApproved=false`,`scoreWriteApproved=false`,`productionWriteApproved=false`,`eligibleForMainScore=false`;不得写 production data、不得接 frontend/workflow/Worker、不得 score write、不得自动入分、不得改变 ODP finalBias、Brent promotion、今日总判断打分、Global Risk Heatmap 或 cross-validation。

P-score-50 起,新增 Transport Shock runtime scoring migration authorization fixture(`transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1`) 与 `check:transport-shock-confirmation-factor-runtime-scoring-migration-authorization`。该授权由 `owner_thread_approval` 给出,状态 `runtime_scoring_migration_authorized_capped_free_proxy`,只允许下一步把 `macroDrivers.energyTransport.transportShockCandidate` 的 free-proxy low-weight candidate 接入受控 runtime scoring migration;范围固定 `maxContributionPct=3`,`defaultContributionPct=0`,pressure-only,fail-closed。该授权不允许 routeFreightConfirmation/marketConfirmation connected,不允许 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch mutation。P-score-1 source-to-score contract 通过 `subsequentRuntimeScoringAuthorization.runtimeScoringAuthorized=true` 明确记录该后续授权,但仍不把 P-score-1 改写成 score-writing contract。P-score-50 本身不写 production data、不接 runtime;下一步才允许实现带 hard cap 与 fail-closed guards 的 runtime scoring。

P-score-51 起,Transport Shock runtime scoring migration 在 Daily runtime 中输出顶层 `transportShockScoringImpact`(`transport-shock-scoring-impact-v1`)。该字段只从 `macroDrivers.energyTransport.transportShockCandidate` 的 PortWatch free-proxy 读数派生,并必须显式包含 `runtimeScoringAuthorized=true`;只有 source live、latestAgeDays<=7、candidate status 为 watch/elevated_watch 且 `eligibleForMainScore=true` 时才允许 1/2/3 分正贡献,硬上限 +3,默认 fail-closed 0,并且不得降低主分。routeFreightConfirmation/marketConfirmation 仍必须 `not_connected`,该路径不确认封锁、断供、路线级油轮运费、战争概率或油价方向,不得改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-52 起,C1 `Transport Shock / 运输冲击确认因子` 前端卡新增 `主分影响` 行,只读 production payload 顶层 `transportShockScoringImpact` 的 contribution/reason/guards,显示当前 `0 / +3` 或已触发的 `+1/+2/+3` capped impact。该 refinement 不新增抓取源、不写 production data、不读取 manual artifacts、不自行计算 score、不连接 routeFreightConfirmation/marketConfirmation,也不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-53 起,`#homepage-risk-engines` 可显示 `Transport Shock 主分归因`,复用 production payload 顶层 `transportShockScoringImpact` 的 capped contribution、reason、scoreBeforeTransport 与 scoreAfterTransport,并由 frontend contract checker 覆盖非零 +3 fixture。该归因层不新增抓取源、不写 production data、不读取 manual artifacts、不自行计算 score、不连接 routeFreightConfirmation/marketConfirmation,也不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-54 起,新增 Transport Shock score-impact history monitor: `monitor:transport-shock-confirmation-factor-score-impact-history` 只读 git history 中 committed `data/radar-data.json` 的顶层 `transportShockScoringImpact`,聚合最近 contribution/reason/candidate/source freshness/score path 样本,输出 ignored `manual-artifacts/transport-shock-confirmation-factor/score-impact-history-latest.json`。该 monitor 不新增抓取源、不写 production data、不读取 manual artifacts、不自行计算 score、不连接 routeFreightConfirmation/marketConfirmation,也不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-55 起,新增 Transport Shock runtime score policy replay review: `review:transport-shock-confirmation-factor-runtime-score-policy` 只读 production `data/radar-data.json` 或 tracked fixture,不抓新源,独立复放 `transportShockScoringImpact` 的 gate order、7 天 freshness、+3 hard cap 与 75/60/50 -> +3/+2/+1 threshold,确认当前 production reason/contribution/guards 是否与授权政策一致。输出 schema `transport-shock-confirmation-factor-runtime-score-policy-review-v1` 到 ignored artifact;该 review 不写 production data、不改 runtime scoring、不连接 routeFreightConfirmation/marketConfirmation,也不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-56 起,新增 Transport Shock runtime score policy drift monitor: `monitor:transport-shock-confirmation-factor-runtime-score-policy` 包装 P-score-55 review 的 no-output JSON 路径,输出 `transport-shock-runtime-score-policy-monitor-p56` artifact,用于定期确认 runtime score policy 未漂移,并在未来出现非零 +1/+2/+3 contribution 时提示人工复核。该 monitor 不新增抓取源、不写 production data、不改 runtime scoring、不连接 routeFreightConfirmation/marketConfirmation,也不改变 ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-57 起,新增 `review:transport-shock-path-boundaries` 作为双路径只读聚合审阅器,输出 schema `transport-shock-path-boundary-review-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/path-boundary-review-latest.json`。它运行 production-refresh、runtime-score-policy、score-readiness 三个既有 no-output monitor,分别报告已批准 capped free-proxy runtime path 的当前贡献/`+3` hard cap,以及 route/market-confirmed readiness path 的 blocker / `not_connected` 状态。前者 active 与后者 blocked 可以同时成立,属于两个不同批准层；该 helper 不抓新源、不写 production data、不改变 runtime score/cap、不连接 routeFreightConfirmation/marketConfirmation,也不改变 frontend、Worker、workflow、ODP finalBias、Brent promotion、Global Risk Heatmap、cross-validation 或 Bubble Watch。

P-score-40 起,新增 `npm run review:transport-shock-confirmation-factor-portwatch-freshness` 作为 **manual/local PortWatch freshness probe**。它只读 IMF PortWatch `Daily_Chokepoints_Data` ArcGIS JSON 或 tracked/manual fixture payload,输出 schema `transport-shock-confirmation-factor-portwatch-freshness-v1` 到 ignored `manual-artifacts/transport-shock-confirmation-factor/portwatch-freshness-latest.json`。该 probe 只判断 core chokepoints 是否有 7 天内新鲜观测,用于解释 `cross-confirmation` 中的 `portwatch_physical_proxy_freshness` blocker;即使状态为 `portwatch_freshness_probe_fresh_no_production_write`,也只能提示可重新运行 cross-confirmation 以清理 PortWatch freshness 这一项,不能清除 `route_freight_confirmation`、`news_manual_gate` 或 `high_frequency_physical_confirmation`,不得 score write、production write、frontend write、ODP finalBias、Brent promotion、今日总判断打分或 cross-validation。

P11 起,ODP 前端折叠详情新增 `SATELLITE THERMAL WATCH / 卫星热异常观察`,但当前只是 readiness slot:候选源为 NASA FIRMS / VIIRS NRT,正式 API 需要免费 `MAP_KEY`,且必须先建立炼厂/终端设施坐标白名单、半径/FRP/置信度/昼夜/历史基线规则。P11 不新增 FIRMS 抓取、不提交设施坐标、不写 `data/*.json`,也不得把全球火点写成炼厂事故、供应中断、真实油轮流量、战争概率或油价预测。source-review 见 [`OIL_THERMAL_ANOMALY_SOURCE_REVIEW.md`](OIL_THERMAL_ANOMALY_SOURCE_REVIEW.md)。

P12 起,新增 `npm run diagnose:firms-thermal` 作为 **manual-only** FIRMS bounded-area smoke/diagnostic。它读取 operator 环境变量 `FIRMS_MAP_KEY`,默认查询 `VIIRS_SNPP_NRT` / `47,23,58,31` / `1` day,只写 ignored `manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json`;header-only CSV 视为 API/key/path 正常但 bbox/window 无热异常。P12 仍不新增 scheduled workflow、不提交 MAP_KEY 或设施坐标、不写 `data/*.json` / `realtime/*.json`,不进入 production display、ODP `finalBias`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P13 起,`diagnose:firms-thermal` 支持 `--facilities manual-artifacts/oil-thermal/facilities.json` + `--sources VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT` 的设施级 manual batch。设施清单仍由 operator 手动提供并保持 ignored;提交库内只有 schema 示例 `docs/fixtures/oil-thermal/facilities.example.json`,不是生产白名单。脚本限制每个设施 bbox 为小框(max span 1.5°)、每轮最多 50 个设施 / 150 次 FIRMS 请求,输出 `sourceAgreement` 与 heuristic-only `anomalyLevel`,但仍不得写成炼厂事故确认、供应中断确认或油价预测;不新增 workflow、不写 `data/*.json` / `realtime/*.json`,不进入 production display、ODP `finalBias`、scoring、decision、execution、position、Brent promotion、Global Risk Heatmap 或 cross-validation。

P14 起,`diagnose:firms-thermal` 可在未设置 `FIRMS_MAP_KEY` 时读取 ignored 本地 key 文件 `manual-artifacts/oil-thermal/firms-map-key.txt`(也可用 `--map-key-file <path>` 指定)。解析顺序为 env var 优先、key file 兜底;输出只记录 `mapKeySource`,不得打印或提交 MAP_KEY。该便利性只服务本地/manual diagnostic,不改变 P13 的 production 边界,不新增 workflow、不读取 GitHub secret、不写 production data。

P15 起,`diagnose:firms-thermal` 在非 dry-run 时默认向 stderr 输出进度日志(设施 id、source、请求进度、row count),最终 JSON 仍输出到 stdout;可用 `--quiet` 关闭。进度日志不得包含 MAP_KEY 或 raw URL,仅解决批量请求时 PowerShell 看似无输出的问题;不改变 artifact schema、不写 production data、不新增 workflow。

P16 起,新增 `npm run init:firms-facilities` 作为 **manual-only** 设施清单初始化/严格校验辅助。该命令只在 ignored `manual-artifacts/oil-thermal/facilities.json` 缺失时从 `docs/fixtures/oil-thermal/facilities.example.json` 创建示例,若文件已存在则只校验不覆盖;`--strict-facilities` 要求每个设施带 `region` / `assetType` / `sourceNote`。P16 不提交真实设施坐标、不新增 workflow、不读取 GitHub secret、不写 `data/*.json` / `realtime/*.json`,也不把设施清单提升为 production whitelist 或油价预测输入。

P17 起,新增 `npm run review:firms-thermal` 作为 **manual-only** FIRMS artifact 离线审阅辅助。它默认读取 ignored `manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json`,可写 ignored `manual-artifacts/oil-thermal/firms-thermal-review-latest.json`,并检查 schema、artifact freshness、FIRMS URL 脱敏、manual-only boundary、example facility rows、设施 metadata 与 detections 是否需要人工复核。该 helper 不读取 MAP_KEY、不访问网络、不写 production data,输出 `promotionEligible=false`;`check:firms-thermal-review` 只用 committed example fixture 离线守门。

P18 起,新增 `npm run review:firms-facilities` 作为 **manual-only** 设施清单覆盖质量审阅辅助。它默认读取 ignored `manual-artifacts/oil-thermal/facilities.json`,可写 ignored `manual-artifacts/oil-thermal/firms-facilities-review-latest.json`,检查 facility count、请求预算、重复/非法 id、bbox 合法性和小框约束、metadata、example rows、region/assetType 覆盖以及可选 `--require-regions`。该 helper 不读取 MAP_KEY、不访问网络、不写 production data,输出 `promotionEligible=false`;`check:firms-facilities-review` 只用 committed example fixture 离线守门。

P19 起,新增 `npm run review:firms-thermal-baseline` 作为 **manual-only** 当前诊断 vs 手动历史基线复核辅助。它默认读取 ignored `firms-thermal-diagnosis-latest.json` 与 ignored `firms-thermal-baseline.json`,可写 ignored `firms-thermal-baseline-review-latest.json`;比较 `rowCountP95` / `maxFrpP95` / `highConfidenceCountP95` / `sourcesWithDetectionsP95` / `frpOver50CountP95` 等手动基线字段,并用 `--min-repeat-sources` 与 `--min-baseline-samples` 降低单次噪声。缺 baseline 显式 WARN,可用 `--require-baseline` 升为 FAIL。该 helper 不读取 MAP_KEY、不访问网络、不写 production data,输出 `promotionEligible=false`;`check:firms-thermal-baseline-review` 只用 synthetic committed fixtures 离线守门。

P20 起,新增 `npm run review:firms-thermal-watch` 作为 **manual-only** FIRMS watch-pack 总审阅。它默认读取 P17/P18/P19 产生的 ignored review artifacts,合成 `firms-thermal-watch-review-latest.json`,检查上游 review schema、`promotionEligible=false`、productionImpact 全 false、manual-only boundary 与 FAIL 状态,并输出 `signalState` / `manualReviewReadiness` / `futureIntegrationGate`。该 helper 不读取 MAP_KEY、不访问网络、不写 production data,不批准 frontend display、scheduled workflow、ODP build input 或油价方向信号;`check:firms-thermal-watch-review` 只用 committed review fixtures 离线守门。

P22 起,NASA FIRMS / VIIRS NRT 从 manual-only 研究工具推进到 **production read-only observation artifact**:`data/oil-thermal-watch.json`。sourceKey=`nasa_firms_viirs_nrt_oil_thermal_watch`,sourceDomain=`firms.modaps.eosdis.nasa.gov`,assignedLayer=`github_actions_backup_validation_layer` + `frontend_display_layer`,primaryOwnerLayer=`github_actions_backup_validation_layer`,freshnessCadence=`3h scheduled + manual dispatch`,artifactOnlyBeforeProduction=`false`(只写 sanitized compact production artifact),sanitizerRequired=`built-in compact writer + check:oil-thermal-watch`,productionWriterRequired=`Refresh Oil Thermal Watch workflow`,fallbackPolicy=`not_configured/source_unavailable/partial fail-closed`,sourceComplianceStatus=`free MAP_KEY, no committed key, bounded facility boxes only`,affectsScoring/Decision/Execution/Position=`false`。workflow 读取 `FIRMS_MAP_KEY` GitHub Secret;设施白名单由 `config/oil-thermal-watch-facilities.json` 控制。无历史基线前所有检出只能写成人工复核热异常代理,不得确认事故、断供、封锁或油价预测。

P23 起,`config/oil-thermal-watch-facilities.json` 添加第一批 production starter whitelist:12 个 U.S. Gulf Coast Texas/Louisiana 炼厂小 bbox,来源为直接下载的 EIA/HIFLD `Petroleum_Refineries_US_EIA.zip` / `Petroleum_Refineries_US_2021.shp` 点数据。每行保存 `region` / `assetType` / `sourceNote`,bbox 规则为 source point `+/-0.05 degree`,不是精确厂界 polygon。Product terminals、全球 refinery/terminal coverage、GEM trackers、论文/大学遥感项目只作为后续 source-review 候选;本批不接入。该白名单只让 `Refresh Oil Thermal Watch` 产生 facility-level FIRMS 聚合摘要,仍不进入 `data/oil-directional-pressure.json` build input、ODP `finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P24 起,`config/oil-thermal-watch-baseline.json` 定义 production baseline / repeated-observation policy。初始 baseline 可为 `status=not_established` 且无历史样本;只有 facility baseline row 达到 `minSamplesPerFacility` 且具备 rowCount/maxFrp/sourcesWithDetections p95 字段时,`build:oil-thermal-watch` 才会把该设施视为 baseline established。生产 artifact 新增 top-level `baseline` 与 per-facility `baselineComparison`,并只在「已建立设施基线 + 多源重复 + 超基线强度」同时满足时输出 `baseline_repeated_watch` / `baseline_elevated_repeated_watch`。该规则只改变人工复核分层,不得确认炼厂事故、停产、断供、封锁或油价预测;仍不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P25 起,新增 `npm run review:oil-thermal-baseline-samples` 作为 **manual/offline** production-watch 样本积累复核辅助。它只读取一个或多个 sanitized `data/oil-thermal-watch.json` 同 schema artifact 或 ignored/manual 归档目录,计算 facility-level 候选 p95 baseline rows,默认只写 ignored `manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json`。输出固定 `candidateOnly=true`、`promotionEligible=false`、`productionBaselineWriteApproved=false`;不读取 MAP_KEY、不访问 FIRMS、不写 `config/oil-thermal-watch-baseline.json`、不写 `data/*.json` / `realtime/*.json`。当前单样本状态应为 `collect_more_samples_before_baseline_candidate_review`;只有后续人工 reviewed PR 才能把成熟候选 baseline rows 提升到 production config。该 helper 仍不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P26 起,新增 `npm run archive:oil-thermal-watch-sample` 作为 **manual/local** production-watch 样本归档辅助。它默认读取当前 `data/oil-thermal-watch.json`,校验 sanitized `oil-thermal-watch-1`、无 raw FIRMS Area API URL、`productionImpact` 全 false 后,复制到 ignored `manual-artifacts/oil-thermal/watch-samples/` 并写 sidecar `*.archive-meta.json`。归档目录可直接交给 P25 review:`npm run review:oil-thermal-baseline-samples -- --input-dir manual-artifacts/oil-thermal/watch-samples`;P25 会跳过 archive metadata sidecar。该 helper 不读取 MAP_KEY、不访问网络、不写 `config/` / `data/` / `realtime/`,不批准 production baseline,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P27 起,新增 `npm run archive:oil-thermal-watch-history-samples` 作为 **manual/local** git-history 样本归档辅助。它只读本地 git history 中最近触碰 `data/oil-thermal-watch.json` 的 commits,用 `git show` 抽取 sanitized `oil-thermal-watch-1` artifacts,跳过无设施行的早期 watch shell,按 `generatedAt` 与 content hash 去重,并写入 ignored `manual-artifacts/oil-thermal/watch-samples/` + sidecar metadata。已有文件标记为 `already_archived` 而非失败,所以可重复运行;默认目标是帮助 P25 快速积累最多 8 个 production watch 样本。该 helper 不读取 MAP_KEY、不联网、不请求 FIRMS、不写 `config/` / `data/` / `realtime/`,不批准 production baseline,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P47 起,新增 `npm run prepare:oil-thermal-baseline-review` 作为 **manual/local** 基线候选准备器。它串联 P27 git-history archive 与 P25 baseline sample review,把最近 production watch history 中的 sanitized 样本归档到 ignored `manual-artifacts/oil-thermal/watch-samples/`,再生成 ignored `oil-thermal-baseline-samples-review-latest.json` 与 `oil-thermal-baseline-readiness-latest.json`。readiness artifact 会显示 valid sample count、每个 facility 是否达到 `minSamplesPerFacility`、候选 baseline 状态和下一步人工复核命令,但固定 `promotionEligible=false` / `productionBaselineWriteApproved=false`。该 helper 不读取 MAP_KEY、不联网、不请求 FIRMS、不写 `config/oil-thermal-watch-baseline.json` / `data/` / `realtime/`,不批准 production baseline,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P48 起,`npm run promote:oil-thermal-baseline-candidate -- --write-production-baseline` 将 P25/P47 已复核的候选 p95 rows 提升为 **production starter baseline config**:`config/oil-thermal-watch-baseline.json`。当前 baseline 覆盖 12 个 U.S. Gulf Coast starter refinery facilities,每个设施来自 15 个 sanitized production watch samples,`sourceReview.baselineQuality=starter_short_window` 且 `sampleWindowDays=2.36`;因此它只用于 repeated-observation 人工复核分层,不是成熟季节性/长历史运行基线。新增 `check:oil-thermal-baseline-config` 离线守门,检查 policy、facility row、短窗口 caveat、无 MAP_KEY/raw URL/candidateOnly/productionImpact 误入。P48 可刷新 `data/oil-thermal-watch.json` 显示 `baseline.status=established`,但仍不确认事故、断供、封锁或油价方向,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P49 起,新增 `npm run refresh:oil-thermal-baseline-candidate` 作为 **manual/local rolling refresh**。它先重跑 P47 git-history archive + P25 baseline sample review,再调用 P49 promotion helper;默认只评估候选并写 ignored review/readiness artifacts,只有 `--write-production-baseline` 才更新 `config/oil-thermal-watch-baseline.json`。baseline quality 按样本窗口 aging:`<7d=starter_short_window`,`7-30d=starter_observation_window`,`>=30d=established_observation_window`,并记录上一版 `previousBaseline` 与 `qualityTransition`。本次 P49 refresh 后 baseline 为 16 个 sanitized production watch samples、`sampleWindowDays=2.48`、`baselineQuality=starter_short_window`、`qualityTransition=unchanged`;`data/oil-thermal-watch.json.baseline.sourceReview` 只读透传该质量摘要。P49 仍不读取 MAP_KEY、不请求 FIRMS 本身、不确认事故/断供/封锁/油价方向,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P50 起,ODP 前端 `SATELLITE THERMAL WATCH` 将 `data/oil-thermal-watch.json.baseline.sourceReview` 显示成 `基线质量` 行:质量标签、样本数、样本窗口天数与 quality transition。该展示只解释 P49 已产出的 production read-only 摘要,不触发新 FIRMS 请求、不写生产数据、不改变 baseline config、不确认事故/断供/封锁/油价方向,也不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P51 起,新增 `Oil Thermal Baseline Quality Reminder` artifact-only monitor workflow。它每 12 小时或手动触发运行 `npm run monitor:oil-thermal-baseline-quality -- --github-summary`,通过 git history 重建 sanitized watch sample review,只判断 baseline quality 是否从 `<7d` 进入 `7-30d` 或从 `7-30d` 进入 `>=30d`。该 workflow 仅 `contents: read`,使用 `fetch-depth: 0`,上传 `manual-artifacts/oil-thermal/oil-thermal-baseline-quality-monitor-latest.json` artifact,不读取 `FIRMS_MAP_KEY`,不请求 FIRMS,不写 production baseline config,不 commit/push。若门槛已到,它只提示人工 review / `refresh:oil-thermal-baseline-candidate -- --write-production-baseline` 命令,不自动执行。P51 仍不确认事故、断供、封锁或油价方向,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P55/P58 起,`config/oil-thermal-watch-facilities.json` 将 production whitelist 从 12 个 U.S. Gulf Coast refinery starter rows 扩展到 **42 个设施观察样本**:保留 EIA/HIFLD 美国 Gulf Coast 炼厂点,并新增 Saudi Arabia / Iran / Israel / UAE / Qatar / Kuwait / Iraq 的 Middle East starter watch boxes。中东样本来源为 NGA GNS 官方 downloadable country files(`Saudi Arabia.txt`,`Iran.txt`,`Israel.txt`,`United Arab Emirates.txt`,`Qatar.txt`,`Kuwait.txt`,`Iraq.txt`)中的 feature points,每个点仍按 `+/-0.05 degree` 转成 FIRMS query bbox。新增样本包括 oil terminal、oil field、GOSP、port terminal、refinery/refinery-area/energy-processing-area/refinery-terminal/energy-port/industrial-port proxy;其中 proxy assetType 必须被解读为官方地名/港口/海湾/城市/油田点派生的小框,不是精确厂界 polygon。辅助官方网页只用于设施存在/上下文交叉核验;生产 writer 只保存 sanitized compact aggregate,不保存原始 GNS 文件、MAP_KEY、raw FIRMS URL 或原始火点明细。扩展后 baseline 为 `partial`:原 12 个 US Gulf Coast rows 保持 established starter baseline,新增中东 rows 需重新累计样本后才可进入 repeated-observation 分层。P55/P58 不确认事故、断供、封锁、霍尔木兹中断或油价方向,不进入 ODP build input、`finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

P59 起,production `build:oil-thermal-watch` 与 manual `diagnose:firms-thermal` 共用 `firms-request-policy-1`。错误只按脱敏枚举归类:`timeout` / `network_error` / `rate_limited` / `server_error` / `authentication_error` / `request_rejected` / `unexpected_http_status` / `empty_response` / `non_csv_response` / `invalid_csv_schema` / `response_parse_error` / `unknown_error`;不得把 URL、MAP_KEY、provider response body 或原始异常文本写入 artifact。仅 `408` / `429` / `5xx` / timeout / network failure 可重试,每个逻辑请求最多 1 次、整轮最多 6 次,backoff 从 1 秒起且 `Retry-After` 最多 5 秒;认证、其他 4xx 与内容/schema 错误立即 fail-closed。production `aggregate.requestDiagnostics` 只保存逻辑请求数、总 attempts、retry/recovery/error 分类计数和预算;manual batch 可输出 `partial` / `source_unavailable` 并保留同类脱敏摘要。`check:firms-request-policy` 为 no-network synthetic guard,并由 `check:oil-thermal-watch` / `check:all` 调用。该 hardening 不改变设施范围、FIRMS 阈值、repeated-observation、前端、ODP `finalBias`、Brent promotion、`values.*`、scoring、decision、execution、position、Global Risk Heatmap 或 cross-validation。

2026-07-26 起,`review:oil-thermal-baseline-samples` 升级为 `oil-thermal-baseline-samples-review-p26` 健康门控版:候选 baseline 只按健康样本统计,`summary.sampleCount` / `summary.sampleWindowDays` 现在表示 **eligible healthy samples only**;全样本口径改存 `summary.totalSampleCount` / `summary.allSampleWindowDays`。样本必须同时满足 artifact `status=ok`、FIRMS source 与所有设施 `sourceStatus=live`、最终 request error 为零、request/facility coverage 完整且内部计数一致;缺少这些可验证 request-health 证据时必须 fail-closed quarantine。P59 `aggregate.requestDiagnostics` 存在时还必须匹配 `firms-request-policy-1`、logical request count 与 failed request count;成功 retry-recovery 仍可入样本。隔离样本只保留审计,不得进入 p95 / readiness / monitor / promotion 统计。review 还会输出 `quarantinedSampleCount`、`sampleEligibility.{eligibleByReason,quarantinedByReason}`、脱敏 failure category counts 与 `facilityP95ChangedCountAfterQuarantine`。

当前 `main` 的健康门控重算结果为:117 个 sanitized history samples 中 86 个健康样本可入候选,31 个样本被隔离(13 个 `partial`,18 个 `source_unavailable`),健康窗口 32.32 天,且隔离异常样本后有 16 个设施的 candidate p95 发生变化。86 个健康样本均为 P59 前的 aggregate-health 证据,尚无带 `firms-request-policy-1` diagnostics 的健康 production watch sample,因此 `oil-thermal-sample-health-gate-p60` 的 promotion gate 继续 HOLD。默认 recommendation 为 `health_filtered_candidate_ready_post_policy_observation_required`;`refresh` 输出 `prepared_health_gate_hold`,`monitor` 输出 `observe_post_policy_health_sample` 且 `manualAction.requiredNow=false`;显式 production write 也必须 fail-closed。当前 production baseline 继续保持 P49 已晋升的 16 samples / 2.48 days。

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

### EIA API v2 — STEO OECD Inventory / Global Draw Balance (P6A)

| 字段 | 值 |
|---|---|
| **License** | 公开;US EIA Open Data API v2,需免费 `EIA_API_KEY`(GitHub secret;本地从 gitignored `manual-artifacts/eia-api-key.txt` 注入) |
| **Route** | `/v2/steo/data/?facets[seriesId][]=PASC_OECD_T3&facets[seriesId][]=T3_STCHANGE_WORLD&facets[seriesId][]=PATC_WORLD...` |
| **Refresh 频率** | Daily pipeline (`build-daily-radar-data.yml`)；源数据为 STEO monthly estimate/forecast 慢变量 |
| **失败 fallback** | 短超时(`ENERGY_INVENTORY_BALANCE_FETCH_TIMEOUT_MS`,默认 10s)+ carry last-good if not stale；无 key/网络/解析失败时 `sourceStatus.inventoryBalance='fallback'` 或 `missing`；超过 95 天 stale 时 fail-closed 为 null |
| **影响 scoring?** | **否** — audit-only / display-only,写入 `macroDrivers.energyInventoryBalance`;不进 `values.*`、`displayInputsBaseline`、`effectiveDisplayInputs`、scoring、decisionModel、executionLock、positionGuidance、cross-validation、Brent promotion、World Order weights 或 Global Risk Heatmap |
| **fetcher** | `scripts/run-daily-pipeline.mjs::resolveEnergyInventoryBalance` |

**当前消费的 series**:

| Series ID | 含义 | 单位 | 消费层 |
|---|---|---|---|
| `PASC_OECD_T3` | OECD End-of-period Commercial Crude Oil and Other Liquids Inventory | million barrels, end-of-period | `macroDrivers.energyInventoryBalance.oecdCommercialInventoryMbbl` |
| `PASC_US` | U.S. End-of-period Commercial Crude Oil and Other Liquids Inventory | million barrels, end-of-period | `macroDrivers.energyInventoryBalance.usCommercialInventoryMbbl` |
| `PASC_OOECD_T3` | Other OECD End-of-period Commercial Crude Oil and Other Liquids Inventory | million barrels, end-of-period | `macroDrivers.energyInventoryBalance.otherOecdCommercialInventoryMbbl` |
| `T3_STCHANGE_WORLD` | Net Inventory Withdrawals, Total World Crude Oil and Other Liquids | million barrels per day | `macroDrivers.energyInventoryBalance.globalInventoryDrawMbpd` |
| `T3_STCHANGE_US` | Net Inventory Withdrawals, U.S. | million barrels per day | `macroDrivers.energyInventoryBalance.usInventoryDrawMbpd` |
| `T3_STCHANGE_OOECD` | Net Inventory Withdrawals, Other OECD | million barrels per day | `macroDrivers.energyInventoryBalance.otherOecdInventoryDrawMbpd` |
| `T3_STCHANGE_NOECD` | Net Inventory Withdrawals, Non-OECD | million barrels per day | `macroDrivers.energyInventoryBalance.nonOecdInventoryDrawMbpd` |
| `PATC_WORLD` | Total World Consumption of Crude Oil and Other Liquids | million barrels per day | `macroDrivers.energyInventoryBalance.worldConsumptionMbpd` |
| `PATC_OECD` | OECD Consumption of Crude Oil and Other Liquids | million barrels per day | OECD days-of-supply denominator |

`PASC_OECD_T3` 是 OECD commercial inventory,不是全球商业库存总量；`T3_STCHANGE_WORLD` 是全球净库存 withdrawal/build 代理,正数表示抽库、负数表示累库。用户可见文案必须保留“月度估算/预测、非实时、不是全球商业库存总量、非油价预测”边界；不得写成 Kpler/AIS oil-on-water、OPEC 月报、封锁确认、断供概率或交易信号。source-review 见 [`ENERGY_INVENTORY_BALANCE_SOURCE_REVIEW.md`](ENERGY_INVENTORY_BALANCE_SOURCE_REVIEW.md)。

---

### IMF PortWatch — Energy Chokepoint Transport Proxy (Energy Stress Phase 2)

| 字段 | 值 |
|---|---|
| **License / usage** | Public PortWatch / ArcGIS FeatureServer surface;exact ArcGIS item `licenseInfo` points to IMF terms;2026-06-09 TOS pin review maps this to IMF Data Usage terms,while retaining third-party / UN Global Platform caveat. TOS pin Phase A writer emits `usageTermsPinned=imf_data_terms_pinned`;validator temporarily accepts legacy `partial` until Daily proof;`redistributionCaveat=true` remains required. |
| **Route** | ArcGIS `Daily_Chokepoints_Data/FeatureServer/0/query`, whitelisted `chokepoint1`...`chokepoint8` only |
| **Refresh 频率** | Daily pipeline (`build-daily-radar-data.yml`)；存 compact derived summary,不提交 raw AIS-derived 120d dump |
| **失败 fallback** | 短超时(`ENERGY_TRANSPORT_FETCH_TIMEOUT_MS`,默认 10s)+ carry last-good if not stale；schema drift / stale latest date / missing core chokepoints fail-closed 为 `missing` 或 `stale`;`transportShockCandidate` 同步降级为 unavailable 或用未过期 fallback compact 摘要重新派生 |
| **影响 scoring?** | **有限影响** — P-score-51 起仅 `macroDrivers.energyTransport.transportShockCandidate` 可通过顶层 `transportShockScoringImpact` (`transport-shock-scoring-impact-v1`) 作为 free-proxy low-weight runtime scoring input;硬上限 +3,默认 fail-closed 0,pressure-only,不进 `values.*` / Brent promotion / World Order weights / Global Risk Heatmap / cross-validation;route/market confirmation 仍 `not_connected` |
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

PortWatch 字段是 AIS-derived chokepoint proxy,本项目只保存 latest、7d/30d average 与相对 30d deviation 等 compact 派生摘要。P-score-51 后,`transportShockCandidate` 仍只把霍尔木兹、红海/曼德-好望角绕行和多咽喉偏离转成候选审计分,并固定 `candidateOnly=true`、`auditOnly=true`、`routeFreightConfirmation=not_connected`、`marketConfirmation=not_connected`;但当 source live、latestAgeDays<=7 且 status 为 watch/elevated_watch 时,可声明 `eligibleForMainScore=true` 并通过 `transportShockScoringImpact` 给主分数贡献最多 +3。路线级油轮运费与市场确认仍未接入,因此这只是低权重运输压力代理,不得写成 route-level tanker freight confirmation。用户可见文案必须保留 GPS jamming / AIS spoofing / vessels going dark / routing changes / data lag 限制；不得写成官方贸易统计、实际油轮流量确认、封锁确认、战争概率、断供概率、World Order 权重或油价预测。source-review、实现契约、TOS pin review、路线级确认源审查与前端展示 brief 见 [`ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md`](ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md)、[`ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md`](ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md)、[`PORTWATCH_TOS_PIN_REVIEW.md`](PORTWATCH_TOS_PIN_REVIEW.md)、[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md) 和 [`ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md`](ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md)。

### Route-Level Tanker Freight Confirmation Source Review (source-review only)

P2 route-level oil tanker freight confirmation source-review identifies Baltic Exchange route assessment families (`TD3C` / `TD8` / `TC5` / `TD15` / `TD20` / `TD22` / `TD25` 等)、ICE wet freight derivatives、CME Baltic wet freight futures 与 Vortexa/Kpler/LSEG/Argus/Platts/Clarksons/Signal Ocean 等 future licensed route-level vendor families。P2B Route-Level Tanker Freight Proof-of-Source Design adds the acceptance gates, route mapping contract, dry-run-only manual artifact candidate shape and future production contract candidate. This path remains **source-review only / proof-of-source design only**: no live fetch, no production data write, no workflow, no frontend, no Worker runtime, no ODP `finalBias`, no Brent promotion, no scoring/decision/execution/position, no World Order weights, no Global Risk Heatmap, and no cross-validation. Existing StockQ `BDTI` / `BCTI` / `BDI` remains aggregate context only and must not be promoted to route-level confirmation. Current production `transportShockCandidate.routeFreightConfirmation` remains `not_connected`;the manual artifact scaffold is `route_level_tanker_freight_manual_artifact_scaffold_dry_run_only`.

[`ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md`](ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md) is the current Route-Level Tanker Freight Proof-of-Source Design. It permits only the local/manual artifact scaffold that writes ignored review artifacts under `manual-artifacts/` and does not use network or write production data.

`npm run review:route-level-tanker-freight-manual-artifact` is the dry-run-only local/manual artifact scaffold. It reads a user-provided JSON input from `manual-artifacts/route-level-tanker-freight/` or tracked fixtures, validates route codes/buckets/units/source-review claims, hashes citation hints instead of storing raw source text, and may write only ignored review output under `manual-artifacts/route-level-tanker-freight/`. It does not fetch Baltic/ICE/CME/vendor pages, does not read API keys, does not write production data, and does not change `routeFreightConfirmation=not_connected`.

`npm run review:route-level-tanker-freight-manual-samples` is the manual sample collection/review helper. It reads multiple `route-level-tanker-freight-proof-review-v1` artifacts from `manual-artifacts/route-level-tanker-freight/` or tracked fixtures, summarizes usable sample count, route bucket coverage, repeated route observations and blockers, and writes only ignored `route-level-tanker-freight-manual-samples-review-v1` output under `manual-artifacts/route-level-tanker-freight/`. It is still local/manual only: no network, no API key, no production write, no frontend, no workflow, no Worker runtime, no route confirmation, and no main-score eligibility.

`route-level-tanker-freight-display-contract-v1` is the display-only candidate contract that describes the future shape of a possible route-level tanker freight confirmation watch. Its status remains `contract_only_no_production_write`: it does not live fetch, does not read API keys, does not write production data, does not add frontend/workflow/Worker runtime, does not change `macroDrivers.energyTransport.routeFreightConfirmation`, and leaves current production `routeFreightConfirmation` as `not_connected`.

`npm run project:route-level-tanker-freight-production-display` is the production display projection dry-run-only helper. It reads a `route-level-tanker-freight-manual-samples-review-v1` artifact, combines it with `route-level-tanker-freight-display-contract-v1`, and writes only an ignored `route-level-tanker-freight-production-display-projection-v1` projection under `manual-artifacts/route-level-tanker-freight/` unless `--no-output` is used. It is not production data and does not live fetch, read API keys, write `data/radar-data.json`, add frontend/workflow/Worker runtime, approve direct display, change `routeFreightConfirmation=not_connected`, or create main-score eligibility.

`npm run review:route-level-tanker-freight-production-display-projections` is the production display projection review helper. It reads one or more `route-level-tanker-freight-production-display-projection-v1` artifacts, summarizes usable projection count, projection states and repeated route coverage, and writes only an ignored `route-level-tanker-freight-production-display-projection-review-v1` review artifact under `manual-artifacts/route-level-tanker-freight/`. It is still manual/local only and does not approve direct display, production write, frontend/workflow/Worker runtime, `routeFreightConfirmation` changes or main-score eligibility.

[`ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md`](ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md) is the Route-level tanker freight frontend display brief. The associated `route-level-tanker-freight-frontend-display-brief-v1` fixture is docs-only: it describes a possible future folded-detail UI inside existing `#oil-directional-pressure`, but adds no frontend implementation, no production data write, no workflow, no Worker runtime, no live fetch, no ODP `finalBias`, and no main-score eligibility. It explicitly keeps the current production state as `routeFreightConfirmation=not_connected`, `marketConfirmation=not_connected`, and `eligibleForMainScore=false`.

[`ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md`](ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md) defines the Route-level tanker freight production write readiness gate. `npm run review:route-level-tanker-freight-production-write-readiness` reads the projection review, display contract, and frontend brief, then writes only an ignored `route-level-tanker-freight-production-write-readiness-v1` manual artifact. A passing artifact only means `ready_for_separate_production_write_design_keep_non_production`;source-rights remain `manual_review_required`, immediate production write remains blocked, and `productionWriteApproved=false`. It is no production write, no live fetch, no frontend, no workflow, no Worker runtime, no ODP `finalBias`, no Brent promotion, and no main-score eligibility.

[`ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md`](ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md) is the Route-level tanker freight thematic card brief. The associated `route-level-tanker-freight-thematic-card-brief-v1` fixture records the final UI target as one future route-level tanker freight card inside `C1 通胀与能源 / INFLATION & ENERGY`, but it is docs-only and no route-level tanker freight frontend implementation. It does not add `c1-route-tanker-freight`, does not write production data, and does not approve ODP `finalBias`, Brent promotion, scoring, decision, Global Risk Heatmap, or cross-validation.

[`ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md`](ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md) is the Route-level tanker freight production writer contract design. The associated `route-level-tanker-freight-production-writer-contract-design-v1` fixture defines the future `macroDrivers.energyTransport.routeFreightConfirmation` field shape, but its status is `contract_design_only_no_writer`. It is no production data write, no frontend implementation, no workflow, no Worker runtime, no live fetch, no API key read, and no route confirmation;`confirmed` is intentionally excluded until a later reviewed source-rights and writer implementation path exists.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md) is the Route-level tanker freight source-rights approval gate. The associated `route-level-tanker-freight-source-rights-approval-gate-v1` fixture keeps status `manual_review_required_no_source_rights_approved` and `source_rights_and_redistribution_not_approved`;it confirms no candidate source family currently has live fetch, route-value storage, redistribution, production write, workflow, frontend, ODP `finalBias`, Brent promotion, or main-score approval.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md) is the Route-level tanker freight source-rights approval template. The associated `route-level-tanker-freight-source-rights-approval-template-v1` fixture has status `template_only_no_approval` and block reason `template_only_no_source_rights_approved`;it only defines the future operator-supplied source-rights evidence fields and grants no source approval, live fetch, route-value redistribution, production write, workflow, frontend, ODP `finalBias`, Brent promotion, or main-score approval.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md) is the Route-level tanker freight source-rights input prep. `prepare:route-level-tanker-freight-source-rights-input` reads only the approval template fixture and writes an ignored local `route-level-tanker-freight-source-rights-input-v1` draft under `manual-artifacts/`;the draft status is `draft_manual_input_no_approval`, all approval claims default false, and it grants no source approval, live fetch, route-value redistribution, production write, workflow, frontend, ODP `finalBias`, Brent promotion, or main-score eligibility.

`guide:route-level-tanker-freight-source-rights-input` is the read-only Route-level tanker freight source-rights input guide. It emits `route-level-tanker-freight-source-rights-input-guide-v1` summary output listing present/missing evidence fields, approval claims, and the next review command;it does not write files, approve source rights, update the gate, write production data, or connect frontend/workflow/Worker runtime.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md) is the Route-level tanker freight source-rights artifact review helper. `review:route-level-tanker-freight-source-rights-artifact` reads only manual/fixture JSON plus the template/gate fixtures, writes only ignored `route-level-tanker-freight-source-rights-artifact-review-v1` output, and can mark `fixture_only_reviewable_keep_blocked` or `reviewable_pending_separate_gate_update` for a later separate gate review. It never updates the source-rights gate, writes production data, or approves frontend/workflow/Worker runtime, ODP `finalBias`, Brent promotion, or main-score eligibility.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md) is the Route-level tanker freight source-rights gate update proposal. `project:route-level-tanker-freight-source-rights-gate-update` reads a source-rights review artifact and current gate fixture, then writes only ignored `route-level-tanker-freight-source-rights-gate-update-proposal-v1` output. It can mark `fixture_only_proposal_keep_gate_blocked` or, for real non-fixture evidence, `ready_for_human_gate_update_review`;it never edits the gate fixture, writes production data, or approves frontend/workflow/Worker runtime, ODP `finalBias`, Brent promotion, or main-score eligibility.

[`ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL_REVIEW.md`](ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL_REVIEW.md) is the Route-level tanker freight source-rights gate update proposal review. `review:route-level-tanker-freight-source-rights-gate-update-proposal` reads a proposal artifact plus the current gate fixture, then writes only ignored `route-level-tanker-freight-source-rights-gate-update-proposal-review-v1` output. It can mark `fixture_only_review_keep_gate_blocked` or, for real non-fixture evidence, `ready_for_human_gate_update_pr_review`;it never applies the proposal, edits the gate fixture, writes production data, or approves frontend/workflow/Worker runtime, ODP `finalBias`, Brent promotion, or main-score eligibility.

[`ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md`](ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md) is the Route-level tanker freight Baltic context policy. The associated `route-level-tanker-freight-baltic-context-policy-v1` fixture locks the current IA decision as `keep_baltic_freight_as_broad_context` and `additive_card_until_separate_deprecation_review`: existing StockQ BDTI/BCTI/BDI remains broad freight context, not route-level confirmation, and deleting or merging the `Baltic Freight` card requires a separate reviewed deprecation path.

[`ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md`](ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md) is the Route-level tanker freight disabled writer scaffold. `project:route-level-tanker-freight-disabled-writer` emits only ignored `route-level-tanker-freight-disabled-writer-scaffold-v1` manual artifacts with status `disabled_no_production_write`, candidate field status `not_connected`, and `sourceRightsStatus=manual_review_required`;it does not write production data, does not read external sources or API keys, and does not approve frontend/workflow/Worker runtime, ODP `finalBias`, Brent promotion, or main-score eligibility.

### Transport Shock Confirmation Factor (P-score-1 contract only)

[`TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md) defines the P-score-1 source-to-score contract for a future `Transport Shock Confirmation Factor` / `transportShockConfirmationFactor`. The contract combines already-connected display-only evidence (`macroDrivers.energyTransport` PortWatch, `macroDrivers.shippingFreight` StockQ BDTI/BCTI, `data/oil-news-event-watch.json`, `data/oil-thermal-watch.json`, and ODP Brent/curve/crack evidence) with two future source-review candidates: **Free Route-Linked Tanker Transport Pressure Proxy** (Solactive wet freight futures candidate plus CME/ICE TD3C link-only/manual reference) and **Baltic Weekly Tanker Report public route-signal**. P-score-1 status remains `contract_only_no_shadow_score`: no new live fetch, no Solactive ingestion, no Baltic Weekly parsing, no CME/ICE value scraping, no production data write, no score-bearing frontend card, no workflow/Worker change, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

[`TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md) is the Transport Shock Confirmation Factor source-review (`transport-shock-confirmation-factor-source-review-v1`). It reviews the **Free Route-Linked Tanker Transport Pressure Proxy** (IMF PortWatch / IEA chokepoint context, Solactive Breakwave wet freight futures index candidate, CME/ICE TD3C link-only/manual references, StockQ aggregate BDTI/BCTI context) and the **Baltic Weekly Tanker Report public route-signal**. P-score-2 status is `source_review_ready_for_manual_sample_scaffold`: no live fetch, no production data write, no workflow/Worker/frontend change, no shadow score, no ODP `finalBias`, no main judgment weighting, and no cross-validation input.

`review:transport-shock-confirmation-factor-manual-sample` is the P-score-3 manual sample scaffold. It reads only `manual-artifacts/transport-shock-confirmation-factor/` or `docs/fixtures/transport-shock-confirmation-factor/` and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/` review JSON with schema `transport-shock-confirmation-factor-manual-sample-review-v1`. It is manual sample scaffold only: no live fetch, no production data write, no workflow/Worker/frontend change, no shadow score, no ODP `finalBias`, no main judgment weighting, and no cross-validation input.

`review:transport-shock-confirmation-factor-manual-samples` is the P-score-4 manual sample collection review. It reads only manual-sample review artifacts from `manual-artifacts/transport-shock-confirmation-factor/` or `docs/fixtures/transport-shock-confirmation-factor/`, aggregates bucket/source/direction coverage, and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/` review JSON with schema `transport-shock-confirmation-factor-manual-samples-review-v1`. It is still a sample collection review only: no live fetch, no production data write, no workflow/Worker/frontend change, no shadow score, no ODP `finalBias`, no main judgment weighting, and no cross-validation input.

`project:transport-shock-confirmation-factor-shadow-score` is the P-score-5 manual route-signal shadow-score projection. It reads only a `transport-shock-confirmation-factor-manual-samples-review-v1` artifact from `manual-artifacts/transport-shock-confirmation-factor/` or `docs/fixtures/transport-shock-confirmation-factor/` and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/` projection JSON with schema `transport-shock-confirmation-factor-shadow-score-v1`. It may produce a capped `manual_route_signal_slice_only` candidateShadowScore for manual review, but it is not production data and not a complete factor score: no live fetch, no production data write, no workflow/Worker/frontend change, `routeFreightConfirmation=not_connected`, `marketConfirmation=not_connected`, `eligibleForMainScore=false`, no ODP `finalBias`, no main judgment weighting, and no cross-validation input.

`project:transport-shock-confirmation-factor-display-projection` is the P-score-6 display projection dry-run. It reads only a `transport-shock-confirmation-factor-shadow-score-v1` artifact from `manual-artifacts/transport-shock-confirmation-factor/` or `docs/fixtures/transport-shock-confirmation-factor/` and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/` projection JSON with schema `transport-shock-confirmation-factor-display-projection-v1`. It may produce `manual_shadow_projection_ready_non_production` card-design fields for future `C1 通胀与能源` review, but `displayProjectionOnly=true`: no direct frontend implementation from this artifact, no production data write, no workflow/Worker change, no complete factor score, no ODP `finalBias`, no main judgment weighting, and no cross-validation input.

Transport Shock Confirmation Factor frontend card(P-score-7) implements the first display-only thematic card for this factor in `C1 通胀与能源`. The card reads only committed production payload data under `radarData.macroDrivers.energyTransport.transportShockCandidate` when that optional candidate exists; if the candidate is absent, it fails closed as data insufficient / candidate field pending. It does not read `manual-artifacts/`, does not read P-score-5/P-score-6 projection artifacts, does not approve route-level tanker freight source rights, does not write `data/radar-data.json`, does not connect workflows/Worker/runtime fetch, and does not affect ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

Transport Shock Confirmation Factor production refresh verification(P-score-8) is a read-only guard for the Daily production payload transition. `check:transport-shock-confirmation-factor-production-refresh` verifies that `scripts/run-daily-pipeline.mjs` writes `transportShockCandidate` on live, fallback, and missing energy-transport paths, then inspects committed `data/radar-data.json`. If the committed payload has not refreshed to the new optional field yet, it reports `awaiting_production_refresh` / WATCH first; it may fail only when trusted git history proves two consecutive `chore: refresh radar data` Daily refresh commits after writer activation still lack the candidate. Shallow history, missing git history, or schedule-only fallback remains diagnostic and must not be described as successful Daily refreshes. Once present, it validates `transport-shock-candidate-v1`, `candidateOnly=true`, `auditOnly=true`, `eligibleForMainScore=false`, route/market confirmation `not_connected`, and all boundary flags. It does not trigger Daily, does not fetch the network, does not write production data, and does not affect ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

Transport Shock Confirmation Factor production refresh monitor(P-score-9) adds a read-only GitHub Actions reminder around the P-score-8 transition. `.github/workflows/transport-shock-confirmation-factor-production-refresh-monitor.yml` runs daily at 23:19 UTC or manually, after the 22:30 UTC Daily schedule, and executes `npm run monitor:transport-shock-confirmation-factor-production-refresh -- --github-summary`. The monitor reads only committed `data/radar-data.json`, writes only ignored `manual-artifacts/transport-shock-confirmation-factor/production-refresh-monitor-latest.json` plus GitHub Summary/artifact, and uses full checkout history (`fetch-depth: 0`) to count real Daily refresh commits. Missing candidate remains `awaiting_production_refresh` unless trusted history proves two consecutive post-writer Daily refresh commits still lack `transportShockCandidate`, in which case the monitor may fail as `missing_candidate_daily_refresh_threshold_exceeded`; shallow/unavailable history remains diagnostic only. It has `contents: read`, no secrets, no network fetch, no Daily trigger, no commit/push, no production write, and no effect on ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

Transport Shock Confirmation Factor history sample archive(P-score-10) adds a local/manual git-history sampler for the production candidate field. `archive:transport-shock-confirmation-factor-history-samples` reads only committed `data/radar-data.json` from git history and writes compact candidate samples to ignored `manual-artifacts/transport-shock-confirmation-factor/history-samples/` when `macroDrivers.energyTransport.transportShockCandidate` is present and contract-valid. Until Daily refreshes that optional field, `check:transport-shock-confirmation-factor-history-sample-archive` runs with `--allow-empty` and reports WARN rather than failing. The archive does not fetch external sources, does not trigger Daily, does not write production data, and does not affect ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

Transport Shock Confirmation Factor history sample review(P-score-11) adds a local/manual quality review for the P-score-10 git-history archive. `review:transport-shock-confirmation-factor-history-samples` reads only ignored `manual-artifacts/transport-shock-confirmation-factor/history-samples/` or fixtures, ignores sidecar archive metadata, validates `transport-shock-confirmation-factor-history-sample-1` samples and emits `transport-shock-confirmation-factor-history-samples-review-v1` to ignored `manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json`. A `history_samples_review_ready_keep_display_only` result only means enough candidate history samples exist for display-only review; it is not production data write approval, not source-rights approval, not route/market confirmation, and not main judgment scoring eligibility.

Transport Shock Confirmation Factor frontend caveat refinement(P-score-12) extends the existing C1 card with sample-quality and data-age caveats. The renderer still reads only production `radarData.macroDrivers.energyTransport` and `transportShockCandidate`; it does not read P-score-10/P-score-11 ignored artifacts. Sample-quality copy is derived from candidate confidence and route/market confirmation gates, while data-age copy is derived from `energyTransport.latestAgeDays`. It remains display-only and does not create route freight confirmation, market confirmation, source-rights approval, production write approval, or main judgment scoring eligibility.

Transport Shock Confirmation Factor frontend scoring-gate row(P-score-18) extends the same C1 display-only card with `入分闸门`. The row is derived only from the production `transportShockCandidate.routeFreightConfirmation` and `marketConfirmation` gates and explains whether route/market confirmation is still blocking score eligibility. It does not read manual artifacts or P-score-17 projection output, does not write production data, does not create marketConfirmation, and does not affect ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

Transport Shock Confirmation Factor frontend blocker row(P-score-40) extends the same C1 display-only card with `阻塞项`. The row is derived only from production `transportShockCandidate.routeFreightConfirmation`, `marketConfirmation`, `macroDrivers.energyTransport.latestAgeDays`, and `eligibleForMainScore`, and summarizes why the factor is still not score-ready: route-level tanker freight unconfirmed, market confirmation not connected, PortWatch data stale, or main-judgment score write not approved. It does not read manual artifacts, P-score-13 readiness output, or P-score-17 projection output, does not write production data, does not create route/market confirmation, and does not affect ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation.

`review:transport-shock-confirmation-factor-score-readiness` is the Transport Shock Confirmation Factor score-readiness matrix(P-score-13). It reads committed production payloads (`data/radar-data.json`, `data/oil-news-event-watch.json`, `data/oil-thermal-watch.json`, `data/oil-directional-pressure.json`) plus optional ignored P-score-11 history review and `transport-shock-confirmation-factor-score-integration-preflight-v1` artifacts or fixtures, then writes only ignored `manual-artifacts/transport-shock-confirmation-factor/score-readiness-latest.json` with schema `transport-shock-confirmation-factor-score-readiness-v1`. The default status can remain `not_ready_for_score`; when the score-integration preflight has passed and no hard blocker remains, it can report `ready_for_score_design_review_no_score_write` and reclassify legacy route/market/source-rights/news/thermal blockers as design-review-required. This is still a no score write gate: no live fetch, no production data write, no workflow/Worker/frontend change, no source-rights approval, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

`monitor:transport-shock-confirmation-factor-score-readiness` is the P-score-14 artifact-only score-readiness monitor (`transport-shock-score-readiness-monitor-p14`). It runs the local P-score-13 readiness review, writes only ignored `manual-artifacts/transport-shock-confirmation-factor/score-readiness-monitor-latest.json`, and the scheduled `.github/workflows/transport-shock-score-readiness-monitor.yml` only uploads an artifact plus GitHub Summary. The normal current status is `blockers_still_present`; if every hard blocker clears, it can only report `score_ready_requires_separate_review`, not wire scoring. No live fetch, no secrets, no Daily trigger, no commit/push, no production write, no frontend/Worker change, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

[`TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md) is the Transport Shock Confirmation Factor market-confirmation source-review (`transport-shock-confirmation-factor-market-confirmation-source-review-v1`). It reviews already-connected display-only evidence families: Brent futures price curve proxy, ICE Brent futures structure context, EIA Brent spot proxy, ODP raw Brent/WTI/crack/curve evidence, and Oil News market-reaction aggregate. P-score-15 status is `market_confirmation_source_review_ready_for_manual_sample_scaffold`: marketConfirmation remains `not_connected`, no new live fetch, no new data source, no production data write, no workflow/Worker/frontend change, no marketConfirmation write, no score write, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

`review:transport-shock-market-confirmation-manual-sample` is the P-score-16 market-confirmation manual sample scaffold. It reads only `manual-artifacts/transport-shock-confirmation-factor/` or tracked fixtures and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/market-confirmation-manual-sample-review-latest.json` with schema `transport-shock-market-confirmation-manual-sample-review-v1`. It can classify manually supplied Brent price-structure, Oil News market-reaction, and ODP raw market-stress observations, but it is not production data and grants no marketConfirmation write, no score write, no live fetch, no workflow/Worker/frontend change, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

`project:transport-shock-market-confirmation-display-projection` is the P-score-17 market-confirmation display-readiness projection. It reads only a `transport-shock-market-confirmation-manual-sample-review-v1` artifact from `manual-artifacts/transport-shock-confirmation-factor/` or `docs/fixtures/transport-shock-confirmation-factor/` and writes only ignored `manual-artifacts/transport-shock-confirmation-factor/market-confirmation-display-projection-latest.json` with schema `transport-shock-market-confirmation-display-projection-v1`. A `manual_market_confirmation_review_ready_non_production` result only means the manual market-confirmation sample set has enough bucket coverage for human display-design review; it grants no marketConfirmation write, no score write, no production display approval, no frontend implementation, no workflow/Worker change, no ODP `finalBias`, no Brent promotion, no main judgment weighting, no Global Risk Heatmap, and no cross-validation input.

[`TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md`](TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md) is the Transport Shock Confirmation Factor free-proxy score design contract (`transport-shock-confirmation-factor-free-proxy-score-design-v1`). P-score-19 status is `design_only_no_score_write`: it defines a future `free_proxy_only_low_weight_candidate` path capped at `maxFutureMainScoreContributionPct=3` when licensed route-level tanker freight is unavailable. It does not approve scoring, production write, live fetch, frontend changes, workflow/Worker changes, marketConfirmation writes, ODP `finalBias`, Brent promotion, Global Risk Heatmap, or cross-validation. News-only, single-chokepoint-only, and stale-PortWatch contributions are fixed at 0.

`project:transport-shock-confirmation-factor-free-proxy-score-candidate` is the P-score-20 local/manual free-proxy score candidate projection. It reads `transport-shock-confirmation-factor-free-proxy-score-design-v1` from the committed fixture or ignored `manual-artifacts/transport-shock-confirmation-factor/`, plus an optional ignored/fixture `transport-shock-confirmation-factor-score-readiness-v1`, then writes only ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-candidate-latest.json` with schema `transport-shock-confirmation-factor-free-proxy-score-candidate-v1`. Without design-ready score-readiness, status remains `free_proxy_score_candidate_blocked_no_score_write` and `candidateScoreContributionPct=0`; with `ready_for_score_design_review_no_score_write`, it can report `free_proxy_score_candidate_ready_no_score_write` with capped `candidateScoreContributionPct=3`. It grants no score write, production write, frontend card implementation, workflow/Worker change, ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation input.

`replay:transport-shock-confirmation-factor-free-proxy-score-candidate` is the P-score-21 local/manual hard-cap replay scaffold. It reads only `transport-shock-confirmation-factor-free-proxy-score-candidate-v1` from ignored manual artifacts or `docs/fixtures/transport-shock-confirmation-factor/`, then writes only ignored `manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-replay-latest.json` with schema `transport-shock-confirmation-factor-free-proxy-score-replay-v1`. It produces `free_proxy_score_replay_scaffold_pass_no_score_write` with `historicalBacktestPerformed=false`: blocked candidates must pass zero-contribution controls for news-only, single-chokepoint-only, stale-PortWatch, and blocked-candidate cases; ready candidates must also pass the `ready_candidate_cap` 3% cap control. It grants no score integration, score write, production write, frontend implementation, workflow/Worker change, ODP `finalBias`, Brent promotion, main judgment weighting, Global Risk Heatmap, or cross-validation input.

---

### Bubble Watch 专题源 — SEC EDGAR / multpl / stockanalysis / Wikipedia / public research proxies (ADR-0016 / ADR-0019)

第二页面「AI 泡沫监测」(`data/bubble-watch.json`,周一 cron)专属,display-only,不进 GFRR 主雷达 scoring/decision。Bubble Watch v2 的 27 张证据卡继续使用原有来源构建,但只让固定 Core-23 进入专题页内部主分/Stage/Trigger/分类共振;`private_secondary_marks` / `token_revenue_ratio` / `gpu_rental_price` / `frontier_progress` 为 Shadow-4,全部展示但不入分。正式页面刷新仍由 `refresh-bubble-watch.yml` 周一写入;`audit-bubble-watch-sources.yml` 周二至周五只做 source-health 只读审计,不提交数据、不触发 Pages,默认设置 `BUBBLE_WATCH_DISABLE_WIND=1` 避免 Wind 付费调用(仅手动 dispatch 勾选 paid Wind opt-in 时才注入 `WIND_API_KEY`)。复用既有 FRED API(`BAMLH0A0HYM2`/`DFF`/`CPIAUCSL`/`DFEDTARL`/`DFEDTARU`,`FRED_API_KEY`;本地无 key/接口失败时短窗口 `fredgraph.csv?cosd=...` 兜底)、Federal Reserve SEP 公开页与 Yahoo Chart(SPY/RSP/成份股/ZQ Fed funds futures closes)之外,新增:

| 源 | 端点 | 喂养指标 | 边界 |
|---|---|---|---|
| **SEC EDGAR companyconcept** | `data.sec.gov/api/xbrl/companyconcept/CIK*/us-gaap/*.json` | hyperscaler capex YoY、Big5 capex/OCF、NVDA LTM 收入(投资/收入比分母)、Cloud RPO | 美国政府公共领域;UA 必须携带联系方式;**实测对数据中心 IP(含 GitHub runner)整段 403** → capex/Big5 capex/OCF/NVDA 收入三项落 stockanalysis 季报镜像;Cloud RPO 若 EDGAR 样本不足则落 StockAnalysis/Fiscal.ai metrics 镜像;10-Q 现金流为 YTD 累计,build 内差分出单季 |
| **multpl.com** | `/shiller-pe` 公开 HTML | Shiller CAPE | 公开 HTML proxy,不得写成官方 Shiller 数据库 |
| **stockanalysis.com** | `/stocks/nvda/statistics/`、`/etf/spy/holdings/`、`/stocks/*/financials/{,cash-flow-statement/}?p=quarterly`、`/stocks/{msft,amzn,googl}/metrics/`、`/stocks/orcl/financials/metrics/` 公开 HTML | NVDA 远期 PE、S&P Top-5 权重(SPY 持仓代理,服务端只渲染前 ~25 行)、**EDGAR 被封时的季报镜像**(OCF/Capex/Revenue/FCF,~20 季服务端渲染)、Cloud RPO 二级源(MSFT/AMZN/GOOGL 季度 operating metrics + ORCL 年度 metrics) | 公开页代理;Top-5 是 SPY 持仓口径非 S&P 官方权重;季报数字为 $M 口径镜像非 SEC 原始 filing;Big5 capex/OCF 主口径固定为 AMZN/MSFT/GOOGL/META/ORCL realized TTM cash capex ÷ Operating Cash Flow,同一 `mag4_fcf_yoy` score slot 改造而来;不得与前瞻 FCF、levered/unlevered FCF、单家公司压力或参考站编辑口径混用;RPO metrics 标注为 StockAnalysis/Fiscal.ai 镜像,不是公司官方 API |
| **Wikipedia** | `List of S&P 500 companies` | 全市场广度成份股名单(~503 只 → Yahoo 实算 %>50DMA) | 名单代理;广度为全成份实算,非 Barchart S5FI 官方序列 |
| **SEC EDGAR Form 4** | `data.sec.gov/submissions/CIK*.json` + Archives ownership XML | AI 龙头(NVDA/PLTR/AVGO)内部人卖买比 | 权威主 live 路径;只解析非衍生 P/S 交易金额,买入不足 $1M 按 $1M 下限折算。数据中心/GitHub runner 403 时转 Xoomar HTTPS 独立镜像;两路都不可达才 fail-closed 沿用带日期快照 |
| **Xoomar Form 4 HTTPS mirror** | `https://xoomar.com/api/markets/insiders/{ticker}` | `insider_sell_buy` 的 SEC 403 独立实时备用 | 公开无密钥 HTTPS API,fair-use;只接受 `isOpenMarket=true` 且 `txCode=P/S` 的 `valueUsd`,`updatedAt` 超过 48h 或 schema 异常必须失败。单标的当前响应最多 200 条,所以 provenance 必须保留 `coverageStart` / `recordLimitReached`;备用样本触顶且买入分母接近零时,页面只显示「高卖压·覆盖受限」并保守维持黄灯,不得把极端原始倍数包装成完整周期可比值,也不得冒充 SEC 官方接口。`insider-form4-partial-live-coverage-v1` 只允许 NVDA/PLTR/AVGO 中恰好一只瞬态失败、其余 2 只都通过上述 live 校验且合计卖买比 ≥5x 时降级为明确 WARN/黄灯;provenance 必须记录 successful/missing symbols 与逐标的失败原因。仅 1/3 可用、2/3 比率 <5x、重复/越界标的或数据异常仍必须 fail-closed,不得用 partial coverage 消除真实源故障。 |
| **SEC EDGAR submissions / ownership XML** | `data.sec.gov/submissions/CIK##########.json`、`sec.gov/Archives/edgar/data/*/*/ownership.xml`、`sec.gov/files/company_tickers_exchange.json` | `insider_sell_buy` 的 Form 4 权威主路径;`ai_ipo_pipeline` 的 S-1/F-1/424B4 官方申报确认 | 美国政府公共领域;UA 必须携带联系方式;与 companyconcept 一样可能对数据中心/GitHub runner 返回 403。Form 4 只解析非衍生 P/S 交易金额;AI IPO 只确认 watchlist 中已能通过 CIK/ticker 发现且近 12 个月有公开申报的公司,不是完整私募 IPO calendar |
| **Crunchbase News WordPress API** | `news.crunchbase.com/wp-json/wp/v2/{search,posts}` | `vc_ai_share`、`ai_ipo_pipeline` 的 hybrid public-source 覆盖 | 只解析公开文章的金额/占比/IPO-exit 语义,不是 PitchBook/Crunchbase Pro 数据库,不是正式 IPO calendar;`vc_ai_share` 必须优先匹配 AI sector / total global venture funding 句子(例如 `$242B = 80% of total global venture funding`),不得误抓 OpenAI/Anthropic/xAI/Waymo 等少数巨额轮次合计 `$188B / 65%`;`ai_ipo_pipeline` 可叠加 SEC S-1/F-1/424B4 官方确认,抓取失败 fail-closed 回 `config/bubble-watch-curated.json` |
| **OpenRouter public rankings API** | `openrouter.ai/api/frontend/v1/rankings/market-share` | `token_volume_mom` 的 hybrid public-source 覆盖 | frontend-public weekly token-volume proxy,用于 4w/4w growth;不是全行业 token tape,endpoint 可能变动,失败 fail-closed 回 curated |
| **OpenRouter model ranking + catalog pricing** | `openrouter.ai/api/frontend/v1/rankings/model-rankings-chart`、`openrouter.ai/api/frontend/v1/catalog/models` | `token_revenue_ratio` 的 hybrid public-source 覆盖(Shadow-4) | model-level weekly token volume × public endpoint list price 估算 OpenRouter 平台 spend proxy;不是厂商真实收入/recognized revenue,priced-token coverage 不足则 fail-closed 回 curated。因与 token 活动/收入基本面重叠且口径较脆弱,v2 全量展示但不进入 Core-23 |
| **SaaStr WordPress public API / Sacra public research** | `saastr.com/wp-json/wp/v2/...`、`sacra.com/research/...` | `arr_2nd_deriv` 的 hybrid public-source 覆盖 | 公开 AI ARR/run-rate 里程碑 proxy；builder 要求多期 Anthropic 里程碑可解析，并用最新里程碑自身日期对照该指标 `maxAgeDays`。网页本周抓取成功不等于底层观测新鲜；超龄时自动结果失败关闭并沿用更新的 curated 快照。该口径不是审计收入、不是私营公司完整 panel |
| **SEC RSS / DOJ News API** | `sec.gov/newsroom/press-releases`、`justice.gov/api/v1/press_releases.json` | `accounting_events` 的正式执法事件监测 | 只有核心企业实体、会计/财报/证券欺诈语义与正式执法动作在同一邻近语境中同时成立才计入；`Google Drive` 等消费服务名称提及不得当作企业实体命中。任一官方源失败会记录 source failure，两路均失败才 fail-closed 回 curated |
| **Neocloud public credit-event monitor** | `prnewswire.com/news/coreweave/`、`lambda.ai/blog/...credit-facility`、`crusoe.ai/resources/newsroom/...credit-facility`、`nebius.com/newsroom/...` | `neocloud_credit` 的 hybrid public-source 覆盖 | CoreWeave/Lambda/Crusoe/Nebius 公开融资、票据、credit facility 与违约/降级关键词监测;不是完整 S&P/Moody's/Fitch rating database,负面未命中只代表公开监测未见正式事件 |
| **Forge Global / Caplight / Hiive public commentary** | `forgeglobal.com/insights/` + 上游周报公开引用 | `private_secondary_marks` candidate-only / Shadow-4 周度编辑口径 | 比较 OpenAI/Anthropic/xAI 二级隐含估值与最近一级估值;公开材料间歇且不是完整成交 tape,当前只走上游周报同步 + curated/maxAgeDays STALE,不得由缺失报价推断灯色,不进入 Core-23 |
| **Thunder Compute / getdeploying** | `thundercompute.com/blog/ai-gpu-rental-market-trends` + 公开价格比较页 | `gpu_rental_price` candidate-only / Shadow-4 周度编辑口径 | 观察 H100/H200 小时价与可得性;供应商/配置样本会漂移,形成稳定可比面板前只走上游周报同步 + curated/maxAgeDays STALE,不得把单一最低报价写成全市场现货指数,不进入 Core-23 |
| **METR / Epoch AI / ARC Prize** | `metr.org/time-horizons/` + 公开 benchmark releases | `frontier_progress` candidate-only / Shadow-4 月度研究口径 | METR time horizon 为主锚,其它公开困难基准只作交叉语境;方法与发布时间不一致,当前只走上游周报同步 + curated/maxAgeDays STALE,不得机械合并不可比 benchmark,不进入 Core-23 |
| **Google Cloud ROI of AI / Deloitte State of AI public reports** | `cloud.google.com/transform/roi-of-ai-how-agents-help-business`、`deloitte.com/.../state-of-ai-in-the-enterprise.html` | `enterprise_deploy` 的 hybrid public-source 覆盖 | survey/public-report proxy,Google production AI-agent 部署率为主,Deloitte/McKinsey 作方向校准;不等同所有企业 AI use case 的正式生产部署率 |
| **SEC RSS / DOJ News API official monitor** | `sec.gov/news/pressreleases.rss`、`justice.gov/api/v1/press_releases.json` | `accounting_events` 的 hybrid public-source 覆盖 | 用官方 RSS/API 替代易 403 的搜索页作为主监控;只作为核心 AI 名单的公开执法事件观察,不等同法律尽调;缺命中只能说明公开新闻稿监测未见新红灯 |
| **Federal Reserve SEP + Yahoo Fed funds futures** | `federalreserve.gov/monetarypolicy/fomccalendars.htm` → `fomcprojtablYYYYMMDD.htm`;`query1.finance.yahoo.com/v8/finance/chart/ZQZ{YY}.CBT` | `fed_policy` 自动政策方向覆盖 | Fed 政策方向不再只靠 DFF+CPI 推导;目标区间来自 FRED,SEP federal funds median 来自 Fed 官方公开页,年末 ZQ 合约为公开 Fed funds futures proxy。SEP 或年末 futures 明显高于当前 target mid 时可判红;缺源时仍降级回 DFF+CPI 口径。Yahoo ZQ 不是 CME FedWatch 概率表,不得写成 proprietary OIS/dealer forward |
| **Barchart $S5FI** | `barchart.com/stocks/quotes/$S5FI` | `breadth_50d` 自动市场广度覆盖 | S&P 500 Stocks Above 50-Day Average 直接指数,与模板站使用的 S5FI 口径对齐;页面解析失败时才回退 Yahoo Chart × Wikipedia 成份股实算。S5FI 是市场广度 display-only 输入,不进入 GFRR 主评分/decision/execution/position |
| **StockAnalysis quarterly cash-flow + Yahoo Chart** | `stockanalysis.com/stocks/*/financials/cash-flow-statement/?p=quarterly`、`query1.finance.yahoo.com/v8/finance/chart/*` | `capex_reaction` 的 hybrid public-source 覆盖 | hyperscaler capex acceleration × 21/63/126 交易日相对 QQQ/SPY 多窗口回报 proxy;不是逐字 earnings-call guidance parser,也不得用单一短期窗口噪音直接判定系统性惩罚。红灯需要 capex 仍加速且至少两个窗口出现系统性惩罚;若本地多窗口价格代理已达红灯,且新鲜上游研究周报也给出系统性重定价/回报质疑证据,可按红灯发布;失败 fail-closed 回 curated |
| **Yahoo Chart public daily equity prices** | `query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d` | `market_technical_heat` 独立公开市场技术热度审计面板 | 免费公开日线价格代理;等权 AI 篮子(NVDA/AMD/MSFT/GOOGL/META/TSLA/AVGO/ORCL)+ QQQ/SPY 对照,只计算 21D 相对动量、RSI、Bollinger %B、200D 均线偏离、60D 相关性/Beta。该面板 display-only,明确排除 27 卡灯色计数、Core-23 主分/Stage/Trigger/分类共振/本周判读及 GFRR scoring/decision/execution/position;Yahoo 不可用时 fail-closed 为 unavailable,不得用旧值伪装实时热度 |
| **public-apis/public-apis Finance candidates** | `github.com/public-apis/public-apis#finance` | `market_technical_heat` source-review fallback candidates | 已作为免费公开 API 目录审阅入口;Alpha Vantage / Marketstack / Finnhub / FRED 等可作后续 source-review 候选,多数高质量 equity price API 需要 apiKey 或配额,本轮未接入生产路径。Wind paid API 只作为最终兜底,不得在 Yahoo 免费源健康时主动消耗 |
| **Morgan Stanley public AI data-center financing research** | `morganstanley.com/insights/articles/ai-market-trends-institute-2026` | `debt_capex_ratio` 的 hybrid public-source 覆盖 | 解析总 data-center capex、hyperscaler cash-flow 覆盖与 corporate debt / securitized credit / private credit / other capital split,发布派生外部融资缺口/Capex 比;低频研究估算,不得写成单一债券发行指数或实时专属债务流 |
| **GDELT DOC 2.0 public search** | `api.gdeltproject.org/api/v2/doc/doc` via `scripts/gdelt/fetch-gdelt.mjs` | `ceo_hedging` 的 hybrid public-source 覆盖 | P38 起,低频读取 `data/gdelt-bubble-watch-cache.json`;cache 超过 132 小时才尝试 live GDELT,live 失败但 21 天内有缓存时使用 stale cache。仅计 AI bubble/overbuild/capex 相关公开报道和高管线索;失败后先尝试 Tavily/Brave free-credit fallbacks,再尝试 Wind paid final fallback |
| **Tavily Search API** | `api.tavily.com/search` | `ceo_hedging` 的 free-credit 交叉确认与新闻搜索兜底 | 需 `TAVILY_API_KEYS`;GDELT 成功时用 `topic=news` + `time_range=month` 做第二新闻源确认,GDELT 429/不可用时作为免费兜底。它是搜索结果代理,不是完整高管 transcript database;红灯必须有多源确认,单一路径命中不得直接升红,仍受 `local_proxy_confidence_v1` 多源/样本门槛约束 |
| **Brave News Search API** | `api.search.brave.com/res/v1/news/search` | `ceo_hedging` 的 free-credit 交叉确认与新闻搜索兜底 | 需 `BRAVE_API_KEYS`;使用官方 News Search endpoint + `freshness=pm` 检索近 31 天 AI bubble/overbuild/capex 与 CEO/高管线索。它与 Tavily 作为独立新闻索引交叉确认源;红灯必须在 GDELT/Tavily/Brave 中至少两源确认,单一路径命中不得直接升红 |
| **Tavily Search API — Bubble Watch weekly editorial** | `api.tavily.com/search` | `summary.weekly_editorial` 的周度新闻发现与交叉确认 context | ADR-0021 起复用 `TAVILY_API_KEYS`,固定 6 个预登记 topic、每 topic 最多 5 条、周频有界调用。只保留 bounded title/URL/snippet 到 transient artifact；不提交 raw response/headers/完整正文，不修改任何 Bubble Watch 指标或评分。Tavily 单源结果只能标 `discovery_only`，除非 URL 属官方来源或被独立 domain 交叉确认 |
| **Brave News Search API — Bubble Watch weekly editorial** | `api.search.brave.com/res/v1/news/search` | `summary.weekly_editorial` 的独立新闻索引与 cross-check | ADR-0021 起复用 `BRAVE_API_KEYS`,`freshness=pw`、相同 6 topic、每 topic 最多 5 条。canonical URL + title fingerprint 去重；同一 story cluster 至少两个独立 domain 才可标 `cross_checked`。搜索结果只作 DeepSeek compact evidence context，不是事实数据库或评分输入 |
| **DeepSeek — Bubble Watch weekly editorial** | 复用仓库 DeepSeek chat-completions endpoint，默认 `deepseek-v4-flash` | 将已校验 compact evidence pack 编辑为周度长篇只读判读 | `response_format=json_object`、`max_tokens=8000`、timeout 120s、每 workflow 最多一次调用且 retry=0。可见正文目标 2,600–3,400 字，以参考站最近 5 期均值 2,947 字 / 最大 3,278 字为标定；8,000-token 预算另覆盖 JSON 字段名、stable IDs、引用和边界序列化开销。Provider 不浏览网页；output 必须通过引用完整性、unsafe wording、评分边界和质量审阅后才可由专用 writer 写入 `summary.weekly_editorial`。Tavily/Brave 全部 topic 查询健康但可信新闻为 0 时必须在 provider 前 `SKIPPED_NO_CREDIBLE_NEWS`，保持 calls/writes=0；搜索源异常仍 hard fail。失败或 expected skip 时保留 `bubble-watch-narrative-v2` fallback |
| **Wind MCP paid optional / final fallback / audit cross-check** | `mcp.wind.com.cn/vserver_{stock,analytics,economic,financial_docs}_data/mcp/` | `dc_abs_spread` 的 paid optional 覆盖;`debt_capex_ratio` 的 paid cross-check;`ai_ipo_pipeline` / `accounting_events` / `token_revenue_ratio` / `enterprise_deploy` / `capex_reaction` / `ceo_hedging` 的 paid final fallback;Big5 capex/OCF 的人工/审计复核 | 需 `WIND_API_KEY`;builder 只发布派生判级/摘要,不提交 raw Wind 响应。`dc_abs_spread` 使用数据中心 ABS 样本识别 + 中国 ABS AAA 收益率基准方向 + 金融新闻证据,并明确标注为 paid proxy;样本券专属估值利差字段为空时不得写成正式数据中心连续利差。paid final fallback 只在免费/公开主源失败后触发,成功时 `provenance.detail.paidWindFinalFallback=true`;无 key/证据不足仍 fail-closed 回 curated。Wind `stock_data.get_stock_fundamentals` 可用于复核 OCF/Capex 原始列,但不得直接混入 Wind 自带自由现金流派生列或前瞻 FCF |
| **aibubble-cn.github.io 上游周报** | `raw.githubusercontent.com/crystal-xiaoxiao/ai-bubble-monitor/main/docs/data/latest.json`(该站页面的实际数据端点) | 编辑/研究类 15 项 + 部分自动指标 fallback 快照的滚动自动同步;历史 snapshots 仅作写作结构校准参考 | 每轮 build(周一 cron)检查:上游 `as_of_date` 比本地口径新 → 对允许同步的指标自动采纳 status/value_display/note 并回写 `config/bubble-watch-curated.json`(workflow 随数据一起提交);不可达/未更新 → 沿用现状、下周期再查,超期由 STALE 暴露。上游为人工周报,不得写成 API 实时数据;生产 `summary.verdict_desc` 由本地 `bubble-watch-narrative-v2` evidence-pack 生成,不得直接采纳上游正文。`private_secondary_marks` / `gpu_rental_price` / `frontier_progress` 复用此路径并在源候选矩阵声明为 candidate-only;它们与 `token_revenue_ratio` 一起组成 Shadow-4。`capex_reaction` 可把新鲜上游红灯周报作为本地价格代理的研究确认锚。`mag4_fcf_yoy` score slot 改造为本地权威 Big5 realized TTM capex/OCF 指标,在上游同步 blocklist 中;参考站若存在只能作为可选差异提示,不可作为发布值、fallback 值或灯色仲裁依据 |
| **Bubble Watch source-health audit** | `.github/workflows/audit-bubble-watch-sources.yml` / `scripts/audit-bubble-watch-sources.mjs` | 周二至周五免费源链路健康检查;artifact-only report | `permissions: contents: read`;运行 builder 后恢复 `data/bubble-watch*.json` 与 `config/bubble-watch-curated.json`,只上传 `manual-artifacts/bubble-watch-source-health-*` artifact。scheduled 默认禁用 Wind;paid optional/final fallback 因 Wind disabled 跳过时应作为 expected WARN。`arr_2nd_deriv` 仅在失败原因精确为 `arr_underlying_observation_stale`、且 curated 回退快照本身未 stale 并满足 `ageDays <= maxAgeDays` 时作为 policy-driven expected WARN;其它 fallback/stale/fetch failure 仍使 audit 失败 |

代理源置信度校准: `insider_sell_buy` / `ai_ipo_pipeline` / `capex_reaction` / `ceo_hedging` / `token_revenue_ratio` / `enterprise_deploy` 的免费/付费代理源若更严重,必须先通过本地二次确认门槛,否则发布灯色按 `local_proxy_confidence_v1` 多源/样本规则降档。`capex_reaction` 的二次确认可来自直接 earnings-call/指引惩罚证据,也可来自新鲜上游研究周报对系统性市场重定价的红灯确认;本地价格侧使用 `capex_reaction_multi_window_v1`,避免 21 日单窗口相对收益噪音误判。自动原始证据仍保留在 `provenance.detail.proxyConfidenceCalibration`(兼容别名:`templateCompatibilityCalibration`),并在 `meta.proxy_confidence_calibrations[]` 汇总;这不是抓取失败,也不是人工覆盖生产 JSON,目的是避免单一新闻/搜索/平台 proxy 把 Bubble Watch 总分误推高。上游/curated 只可在 `maxAgeDays` 内作为显示值锚点;若上游长期不可达,本地规则仍独立工作,过期锚点按 STALE 机制暴露。

编辑/研究类 15 项改称 **curated-origin**:源候选矩阵登记在 `config/bubble-watch-source-candidates.json`。其中 `private_secondary_marks` / `gpu_rental_price` / `frontier_progress` 为 `candidate_only`,继续走上游周报同步 + curated/maxAgeDays STALE;其余既有 11 项为 `hybrid_live`,`dc_abs_spread` 为 `hybrid_paid_optional`。来源自动化状态与 v2 计分角色相互独立:`token_revenue_ratio` 虽保持 `hybrid_live`,仍属于 Shadow-4。Shadow 晋升至少要求 52 周观察、fresh 可用率 ≥90%、历史代理/回填、非冗余消融、预登记目标样本外改善和独立 contract migration,禁止自动晋升。build 对 hybrid 先尝试免费公开源自动覆盖,有明确授权时才使用已登记 Wind 付费路径;失败仍 fail-closed 回 `config/bubble-watch-curated.json`。契约见 [`DATA_CONTRACT.md`](DATA_CONTRACT.md)「bubble-watch 专题数据契约」。

---

### GDELT Cloud v2

| 字段 | 值 |
|---|---|
| **License** | 商业 + free tier;需 `GDELT_CLOUD_API_KEY` Bearer |
| **Quota** | free tier 有限;P39 起 daily build 先读 `data/gdelt-world-order-cache.json`,12 小时内 manual rerun 不再 live 请求 |
| **Refresh 频率** | `refresh-world-order-stress.yml` (daily);cache 超窗后最多单次 live Cloud attempt |
| **失败 fallback** | 12h fresh cache → live single attempt → 72h stale cache → previous `data/world-order-stress.json` GDELT summary;仍不可用时标记 `error` / `not_configured` |
| **影响 scoring?** | **overlay only** — 进入 World Order Stress Overlay;**不进入** values / main scoring / decision / execution / position / ODP oil direction / Brent promotion / Global Risk Heatmap / cross-validation |
| **fetcher** | `scripts/world-order/fetch-gdelt-cloud.mjs` via shared wrapper `scripts/gdelt/fetch-gdelt.mjs`;cache artifact `data/gdelt-world-order-cache.json` |

2026-07-26 起，`npm run review:world-order` 离线复核 GDELT / OFAC / SIPRI / ACLED 四源状态与 World Order `freshness` / `sourceMode` 聚合是否一致，并在降级源仍显示高置信度时给出 WARN。ACLED `manual_required` / `not_configured` 的运维动作统一为手工下载 ACLED weekly/monthly xlsx 后运行 weekly/monthly sanitizer，不再提示配置已退役的 API 凭据。该 reviewer 不访问网络、不刷新源、不写 production data，保持 World Order overlay-only 边界。

### GDELT site-wide source policy

P35 起,新增 [`GDELT_SOURCE_POLICY.md`](GDELT_SOURCE_POLICY.md) 与 `npm run check:gdelt-source-policy`。GDELT 在本项目中统一定义为低频、可缓存、需退避的全球新闻代理源,不得被新增模块当作高频实时 API 直接调用。P36 起,ODP oil-news GDELT DOC 请求已迁入共享 wrapper `scripts/gdelt/fetch-gdelt.mjs`,由 wrapper 统一处理串行请求、`Retry-After`、bounded retry、timeout 与 sanitized diagnostics;ODP diagnosis helper 不再持有直接 GDELT endpoint。P37 起,ODP GDELT 改为单条 broad query + 本地 bucket 分类,并落地 `data/gdelt-news-cache.json` compact cache。P39a 起,Oil News GDELT DOC 增加 24 小时 fresh cache、72 小时 stale fallback、24 小时 error cooldown、429/error `lastUsableCache` 审计保留与 single-attempt live policy,降低 429 风险且不让旧 GDELT 文章增强当前信号。P41/P42/P43/P44/P45/P48/P49/P50/P51/P52/P53/P54/P55 起,ODP Oil News 增加 Web NGrams manual-only live smoke、latest-file discovery、sample review、sample archive、fallback source-review、artifact sanitizer、sample gate review、`gdelt-web-ngrams-display-fallback-projection-p50` dry-run projection、`gdelt-web-ngrams-display-fallback-projection-review-p51`、`gdelt-web-ngrams-display-fallback-writer-contract-design-p52`、`gdelt-web-ngrams-display-fallback-disabled-writer-p53`、`gdelt-web-ngrams-display-fallback-disabled-writer-review-p54` 与 `gdelt-web-ngrams-display-fallback-production-write-readiness-p55`,用于评估下载型 ngram 文件能否在 DOC API 受限时提供候选叙事热度来源;P55 本身仍不写 production data,但对 P56 授权单字段 display-only cache write,且不批准 frontend/workflow/current signal/scoring,下一步仅允许 `p56_display_only_fallback_production_display_write`。P38 起,Bubble Watch `ceo_hedging` 也迁入共享 wrapper,并新增 `data/gdelt-bubble-watch-cache.json` compact cache;Refresh Bubble Watch 周一提交该 cache,source-health audit 只读运行后恢复该文件。P39 起,World Order GDELT Cloud 也迁入共享 wrapper + `data/gdelt-world-order-cache.json`:12 小时 fresh cache、72 小时 stale fallback、6 小时 error cooldown、cache 过期后单次 live Cloud attempt;`refresh-world-order-stress.yml` 同步提交该 cache。P40 起,`npm run review:gdelt-cache-health` / `check:gdelt-cache-health` 只读复核 Oil News、Bubble Watch 与 World Order 三个 GDELT cache 及对应 production artifact,用于识别 schema/policy failure、旧 query cache、placeholder/seed cache、rate-limit 与 post-migration refresh lag;默认不联网、不写 production data,`WATCH`/`WARN` 不阻断 `check:all`,但 schema/policy/placeholder-threshold `FAIL` 会阻断。当前登记的 GDELT endpoint 引用只允许存在于共享 wrapper、GDELT 相关 checker 和手动 API secret diagnostic workflow。新增 GDELT endpoint 字符串或 runtime 直连必须先更新 source policy 并通过 checker。P39/P40/P41/P42/P43/P44/P45/P48/P49/P50/P51/P52/P53/P54/P55 不改变 World Order/ODP/Bubble Watch scoring 或 frontend display behavior。

2026-07-26 P40 post-refresh context hardening 后,每行增加 `refreshContext`:Oil News 依据 cache age、24h error cooldown 与 production watch 的实际生成时点区分 `expected_error_cooldown_after_refresh` / `degraded_awaiting_post_cooldown_refresh_evidence` / `persistent_error_after_cooldown_expiry`;只有 watch 本身在 cooldown 到期后刷新且仍 degraded 才允许判为 persistent。Bubble Watch 依据 132h fresh TTL、168h 周一 cadence 与 12h grace 区分 `expected_pre_refresh_schedule_gap` / `scheduled_refresh_overdue`。这些字段只改善 operator triage,不得用来放宽 cache policy、修改 writer 或改变 workflow cadence。

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
| **HDX metadata gate** | `data.humdata.org` CKAN `package_show` metadata-only probe for `political-violence-events-and-fatalities` / `civilian-targeting-events-and-fatalities` / `demonstration-events`;no API key;只用于判断是否打开手动刷新 issue,不下载 HDX data files,不替代 weekly-admin 主源 |
| **EULA §3.3** | "Scraping and crawling the Site is prohibited." |
| **Refresh 频率** | Weekly regional files:每周 Monday/Tuesday;Monthly global files:每月约 8 日 |
| **状态** | M-63a/M-63b 起为 `manual_required` / `partial` / `ok` 三态:weekly+monthly 均无或 `isRealData !== true` 时 `manual_required`;仅其中一种到位时 `partial`;两种 sanitized JSON 都 `isRealData=true` 时 `ok` |
| **失败 fallback** | `manual_required` / `error` / legacy `not_configured` 只影响 World Order overlay 可用性提示,不得阻断 `check:all`,不得进入 main scoring / decision / execution / position |
| **影响 scoring?** | **overlay only** — M-63a 起只允许进入 World Order `peaceDividendRetreat` 维度;不得影响主决策模型 |
| **fetcher** | `scripts/world-order/fetch-acled.mjs` (M-63a local JSON importer;不访问网络、不读取 credentials、不导入 `xlsx`) |
| **weekly sanitizer** | `scripts/world-order/sanitize-acled-weekly.mjs` (唯一允许导入 `xlsx` 的 ACLED weekly 路径;解析前执行 path/file/ZIP/batch cap，解析后执行 350,000-row / 32-column cap) |
| **monthly sanitizer** | `scripts/world-order/sanitize-acled-monthly.mjs` (唯一允许导入 `xlsx` 的 ACLED monthly 路径;解析前执行 path/file/ZIP/batch cap，解析后执行 50,000-row / 8-column cap) |
| **提醒机制** | `.github/workflows/acled-weekly-refresh-reminder.yml` (daily 00:00 UTC HDX metadata scan) + `.github/workflows/acled-monthly-refresh-reminder.yml` (cron 9th 00:00 UTC each month);M-63c 起 active;HDX metadata-gated reminder-only,同一 HDX as-of 只提醒一次;不得升级为 ACLED auto-fetch |
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
| **Refresh 频率** | `macro-risk-editorial-refresh.yml` 每日 00:05 UTC；Bubble Watch 周度编辑层按其周一 workflow；manual test 仍显式 opt-in |
| **失败 fallback** | provider/contract/review/freshness 失败只写脱敏 artifact 或直接 fail-closed；不写入 production，首页继续显示 deterministic macro overview |
| **影响 scoring?** | **否** — `macroRiskEditorialLayer` 是首页唯一可见外部 AI 编辑层；旧 `externalAiInterpretationLayer` 仅保留数据兼容、无可见消费者。所有层始终不影响 scoring/decision/execution/position |
| **fetcher** | `scripts/external-ai/provider-adapters.mjs` + `scripts/macro-risk/*` + `scripts/bubble-watch/weekly-editorial-*` |

⚠️ **不得**:
- 把 manual artifacts 直接 promotion 进 production
- 绕过当前批准的 `Macro Risk Editorial Refresh` / Bubble Watch weekly editorial workflow 或各自 write guard 写入生产 JSON
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
| **Quota** | <800 writes/day (free-tier safe);v28.0B 后每轮 scheduled 最多 1 次主 KV 写；Free Cron CPU 上限 10 ms，生产路径使用 compact FRED newest-two + deferred experimental Google HTML diagnostics |
| **KV keys** | `market:latest` (production, **当前 Worker 不写**), `market:latest-preview` (GitHub mirror), `market:worker-generated-preview` (主 worker preview), `market:secondary-preview` (secondary), `market:worker-heartbeat` (status) |
| **影响 scoring?** | Worker preview 仍服务 Worker/diagnostics 与部分后端确认链路；M-94 V0 路径 C 后前端入口只读 `data/radar-data.json` 静态快照，不再运行 worker-first strict gate。是否重接 realtime overlay 必须另开评审 |
| **deploy** | `wrangler deploy` (manual,Cursor 实现后) |

---

### 2026-07-31 GDELT DOC resilience follow-up

ODP Oil News 的 GDELT DOC broad query 继续保持 24h fresh / 72h stale 与
fail-closed 边界,但 live path 允许严格一次有界重试,遵守 `Retry-After` 并增加
最多 1.5 秒 jitter。错误冷却按 429=24h、timeout/network=4h、5xx=6h、
other=12h 分类；`lastFetchFailure` 让 stale-cache-after-error 后续刷新也遵守
对应窗口。`data/gdelt-news-cache.json` 只新增最多 64 条 sanitized availability
history 与 7/30 天成功率,不得保存 URL、标题、正文、header 或 secret。429 下
`lastUsableCache` 仍仅供审计且 `usedForCurrentSignal=false`;本改动不进入 Oil
News signal、ODP `finalBias`、scoring、decision、execution、position、Brent
promotion、Global Risk Heatmap 或 cross-validation。

同日 Web NGrams automated display-only 路径把既有 bounded diagnosis 接入
`Refresh Oil News Event Watch`:主 build 内的一次 pair fetch 直接更新
`sourceCaches.gdeltWebNgramsFallback`，不再由 workflow 做第二次下载。production contract
为 `gdelt-web-ngrams-display-fallback-cache-v2`,只保存源文件时间、可达状态和
compact aggregate counts；不保存 headline/URL/snippet/body/raw row/response。
该缓存 is not a current Oil News signal；`currentSignalEnhancement=false`,
`oilDirectionInput=false`,`eligibleForScoring=false`。live 失败只可在 12h 内把
上一份 v2 observation 标为 stale,超窗必须 `source_unavailable`。

P69A 起,新增 `gdelt-web-ngrams-article-pair-v1` 适配器基础。它只通过共享
GDELT wrapper 串行探测/下载相同时间戳的 `ngrams.txt.gz` +
`toc.json.gz`,任一半缺失都 fail-closed,且不向诊断投影 provider URL。该
适配器属于 `github_actions_backup_validation_layer`,P69A 仅有 library/check
路径,尚未接 workflow、production writer 或 current Oil News signal。raw
NGRAMS/TOC 内容只允许在内存中用于后续 sanitized join；不得写入 production
artifact。完整晋升仍需 article join、多语言分类、去重、Tavily/Brave 独立
确认与 shadow quality gate；ADR 见
[`ADR-0020`](ADR/0020-web-ngrams-primary-article-discovery.md)。

P69B 在同一 `github_actions_backup_validation_layer` 内增加
`gdelt-web-ngrams-article-candidates-shadow-v1` join/dedupe 层。该层用共享
`odp-oil-news-web-ngrams-taxonomy-v1` 从 NGRAMS 选择 document IDs，再与同
timestamp TOC metadata 连接并按 canonical URL 去重。title/URL 只在进程内
短暂存在；sanitized output 只包含 domain、publishedAt、language、
term/bucket IDs、mention count、不可逆 URL/story cluster hashes 与 compact
quality metrics，且目前只能写 ignored shadow artifact。它没有 workflow、
production writer、frontend/current-signal/scoring approval；不得写入
`data/*.json` / `realtime/*.json`，也不得把候选报道包装成事件确认。

P69C 增加
`gdelt-web-ngrams-multilingual-classification-shadow-v1`，在同一 backup
validation layer 内对进程内 title 做 `en/zh/ar/ru/es` 本地规则分类。规则将
topic context 与 escalation/deescalation 分离；多方向命中必须标成 mixed。
sanitized output 只保留 rule IDs 与聚合计数，不保留命中的原始 pattern/title/
URL。该分类仍是 ignored shadow-only，不改变 current Oil News signal，也不
进入 frontend、ODP finalBias、`values.*`、scoring、decision、execution、
position、Brent promotion、Heatmap 或 cross-validation。

P69D 增加 `gdelt-web-ngrams-cross-source-telemetry-shadow-v1`。它只接受
Tavily/Brave 作为独立 comparison providers：同 URL/title hash 只表示
discovery overlap；不同 domain、36h 内、同 axis/polarity 且 bucket overlap
才记录 independent support；Tavily+Brave 和至少两个 supporting domains
同时满足才记录 cross-provider support。上述状态仍不是事件确认，只能写
ignored shadow artifact，不得写 production data 或改变 current signal。

P69E 把 article shadow 接入现有 refresh，但仍位于
`github_actions_backup_validation_layer`。`build:oil-news-event-watch` 复用本轮
Tavily/Brave transient results，并以同一 Web pair 同时生成 display cache、
aggregate-only `sourceCaches.gdeltWebNgramsArticleShadow` 与 ignored sanitized
observation artifact。production shadow cache 不含 article/hash/domain/title/URL；
per-article sanitized observation 只上传 35-day GitHub artifact。该路径不新增
provider/key 请求，不做第二次 Web download，不接 frontend/current signal/
event confirmation/scoring。

P69F 增加 `oil-news-discovery-policy-v1` 与只读 git-history readiness reviewer。
当前 source routing 仍是 GDELT DOC primary + Web NGrams shadow；目标
Web NGrams primary + GDELT DOC fallback 只登记、不激活。reviewer 只读取
production watch 历史中的 aggregate shadow cache，并以 30 天/120 usable
samples、pair availability、usable rate、candidate count、多语言覆盖与
Tavily/Brave 独立/cross-provider support 作质量门禁。每日 readiness workflow
只生成 ignored artifact/GitHub Summary，不访问新闻源、不读取 secrets、不
commit/push。门禁通过仍只表示可另开人工 reviewed cutover PR，不会自动改变
source order，也不批准 current signal、event confirmation、frontend 或 scoring。

## 反向索引 (消费层 → 数据源)

| 消费层 | 主要数据源 |
|---|---|
| `values.brent` | Worker path:FRED `DCOILBRENTEU` anchor + Yahoo `BZ=F` fresh confirmation + TE freshness gate + D-6 extreme-move guard；GitHub `realtime-data` fallback path:FRED anchor + public Brent consensus promotion when anchor stale >72h and high-confidence or guarded two-source medium consensus |
| `brent public proxy candidates` | M-71 source-review only: EIA Europe Brent Spot Price FOB / ICE Brent futures curve / Baltic Exchange freight benchmarks / Freightos Baltic Index / future licensed S&P-Platts Dated Brent |
| `values.vix` / `values.gold` / `values.dxy` / `values.us10y` / `values.spx` | 来自 GitHub realtime-data 或 displayInputsBaseline;`values.dxy` 主源为 FRED `DTWEXBGS` 且 `dollarRisk` 用历史分位校准;**secondary preview 仅诊断,不覆盖** |
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
| `macroDrivers.energyInventoryBalance` | `EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD` / EIA STEO OECD commercial inventory + global net inventory withdrawals + global consumption;monthly estimate/forecast display-only slow variable;not real-time global commercial inventory total, Kpler/AIS oil-on-water confirmation, or oil price prediction |
| `macroDrivers.energyTransport` | `IMFPortWatch:Daily_Chokepoints_Data` / IMF PortWatch public ArcGIS chokepoint proxy;AIS-derived compact tanker/count/capacity summary;TOS pin review maps exact ArcGIS item license to IMF Data Terms;writer emits `usageTermsPinned=imf_data_terms_pinned`,validator accepts legacy `partial` until Daily proof,redistributionCaveat `true`;not official trade statistics, blockade confirmation, war probability, or oil price prediction |
| `macroDrivers.policyExpectations` | FRED: DFEDTARL/DFEDTARU/DFF + Yahoo: ZQ=F / ZQ monthly futures curve / SR3 monthly SOFR futures curve + CheckMySwap USD OIS public curve + Federal Reserve SEP/FOMC statement/minutes |
| `macroDrivers.commercialRealEstate` | FRED: DRCRELEXFACBS, CORCREXFACBS, SUBLPDRCSN, SUBLPDRCSC, SUBLPDRCSM, CREACBW027SBOG + Yahoo: VNQ, REM, CMBS |
| `macroDrivers.privateCreditProxy` | Yahoo: BIZD, PBDC, SRLN, CCLFX + FRED: BAMLH0A0HYM2 / BAMLC0A0CM + ICE public CDX index settlement; private marks = manual_required |
| `brentPricingLayer.crackSpread` | FRED `DHOILNYH` × 42 − Brent |
| `brentPricingLayer.eiaBrentSpotProxy` | EIA `RBRTE` Europe Brent Spot Price FOB public HTML; not Platts/formal Dated Brent |
| `brentPricingLayer.futuresCurve` | ICE Brent futures public product page structure-only contracts |
| `brentPricingLayer.iceFuturesPriceCurve` | ICE Brent futures public delayed last-price curve; Platts/official ICE settlement = not connected |
| `brentPricingLayer.futuresPriceCurve` | Yahoo: BZ monthly futures priced proxy; Platts/official ICE settlement = not connected |
| `macroRiskEditorialLayer` | Tavily/Brave 近 7 日 discovery（受资格约束的美国 `.gov` 根域/子域为 official）+ 站内结构化证据 + DeepSeek production；首页唯一可见外部 AI 编辑层，只读展示。双搜索健康但 0 credible news 时 provider 前 `SKIPPED_NO_CREDIBLE_NEWS`、0 DeepSeek call/0 write；真实失败时 deterministic overview + 自动展开专业证据 |
| `externalAiInterpretationLayer` | 历史数据兼容字段；无前端 consumer、无 scheduled provider refresh |
| `worldOrderStress.marketConfirmation` | Worker preview → local realtime → Daily baseline (优先级) |
| `worldOrderStress.dimensions.economicWeaponization` | OFAC + (GDELT) |
| `worldOrderStress.dimensions.peaceDividendRetreat` | SIPRI (年度) |
| `worldOrderStress` GDELT narrative | GDELT Cloud v2 |
| `data/oil-directional-pressure.json` (ODP, 独立文件) | EIA API v2 weekly petroleum (`PET.*.W`) + 复用 radar-data WTI market proxy(优先 `macroDrivers.inflationEnergy.wtiMarketProxy`,回退 FRED WTI spot)/Brent/crack/curve + radar-history-full Brent ~4w 价格方向(PR3 背离层) + radar-data `energyInventoryBalance` / `energySpareCapacity` / `energyTransport` 慢变量(P6B global overlay, display-only) |
| `data/oil-directional-history.json` (ODP PR2 回测 cache) | EIA API v2 weekly petroleum (`PET.*.W`) 2014-至今 committed snapshot;仅 backtest replay,不进 live / scoring / Heatmap |
