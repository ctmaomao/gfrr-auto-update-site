# Project Backlog · GFRR Auto-Update Site

Persistent project self-memory for open work, current status, and maintenance rules. Milestone history lives in [MILESTONE_INDEX.md](MILESTONE_INDEX.md); this file keeps only the actionable backlog and compact recent context.

---

## Section 1 · 维护状态

| 项 | 当前值 |
|---|---|
| 当前生产状态 | v28.0N-1 editorial first-fold + Stage 6A China 10Y/CFETS + Stage 6C China CPI/PPI/PMI + Stage V2X 欧元区波动率(VSTOXX,boerse 主源 / STOXX fallback)live display-only 卡 |
| Cache version | `stage-v2x-vstoxx-1` |
| check:all 项数 | 23 top-level suites |
| 最后审计日期 | 2026-05-29 |
| 主 runtime | Worker-first `/market.worker-preview.json` |
| secondary diagnostics | `/market.secondary-preview.json` only |
| 下次审计建议 | 下一次 stage / milestone 合并时 |

当前边界摘要:

- `macroDrivers.*`、`brentPricingLayer`、`consumer_vs_asset_pricing`、`dailyBrief`、`divergenceLayer` 和 `aiInterpretationLayer` 仍为 audit-only / display-only 解释层。
- 这些层不得进入 scoring、decision、execution、position、Worker main payload、`displayInputsBaseline`、`effectiveDisplayInputs` 或 cross-validation matrix,除非另开 reviewed PR。
- Public proxy 必须继续清楚标注,不得冒充 Platts Dated Brent、official ICE settlement、private credit marks、non-public CRE loan tape、Redbook raw feed 或 BoA raw card feed。
- 详情字段和 schema 约束以 [DATA_CONTRACT.md](DATA_CONTRACT.md) 为准;运维流程以 [OPERATIONS.md](OPERATIONS.md) 为准。

---

## Section 2 · Open Backlog Items

### P0 Items

No active P0 item.

### P1 Items

No active P1 item. ACLED/SIPRI/GDELT、Pages trigger coverage、World Order refresh、market pricing history merge 和 check-suite compaction 已关闭;历史见 [MILESTONE_INDEX.md](MILESTONE_INDEX.md)。

### P2 Items

No active P2 item. P2-13(Node daily/realtime)+ P2-13b(Cloudflare Worker)FRED API 迁移**全部完成并线上验证通过**(详见 Section 3/5)—— 三链路均 API-first + CSV-fallback;CSV 端点仍宕时全部经官方 API 回 live。FRED CSV 通道现为 dormant fallback,长期确认废弃后可一次性清理(见 Section 4)。

### P3 Items

#### P3-10: Fed dot plot / OIS / FOMC 文本

- 已连接: FRED target range / DFF、Yahoo ZQ futures proxy、Fed SEP / statement、FOMC minutes keyword count、Yahoo SR3 SOFR futures proxy、CheckMySwap USD OIS public curve。
- 未连接: proprietary dealer OIS forward curve 和更完整的政策文本 NLP 质量模型。
- 边界: 不得把 public curve 写成 licensed dealer forward curve;政策文本不得进入 scoring 或 decision。

#### P3-11: Brent 实物端 / 期限结构 / freight

- 已连接: StockQ BDTI/BCTI/BDI freight proxy、ICE structure-only、Yahoo BZ priced proxy、ICE delayed last-price curve、EIA Europe Brent Spot Price FOB public HTML proxy。
- 未连接: Platts Dated Brent、formal Dated Brent、official ICE settlement curve。
- 边界: 不改 `values.brent`、Brent promotion、scoring、decision、execution、position、Worker 或 workflow。

#### P3-14: Redbook + BoA raw card 高频消费证据

- 已连接: Chicago Fed CARTS/CARTSR、FRED MRTS segment basket、BoA Consumer Checkpoint public HTML summary、Trading Economics Redbook public HTML latest summary。
- 未连接: Redbook raw subscription feed、BoA raw card feed。
- 边界: 不得把公开摘要写成 raw feed。

#### P3-15: CDX HY/IG + 私募信贷 fundraising

- 已连接: HY OAS、IG OAS、BIZD/PBDC/SRLN public proxies、ICE public CDX HY/IG settlement prices、CCLFX public interval-fund NAV proxy、FRED aggregate CRE loan balance、VNQ/REM/CMBS public proxies。
- 未连接: true private credit marks、licensed Markit history database、non-public CRE loan tape。
- 边界: 不得把 public ETF / OAS / settlement proxy 写成 private marks 或 non-public tape。

---

## Section 3 · Completed Items

Recent completed context only; full milestone archive is [MILESTONE_INDEX.md](MILESTONE_INDEX.md).

| Milestone | 一句话 |
|---|---|
| Stage V2X 欧元区波动率(VSTOXX) | 6-脆弱批收口:接 C5 末位 V2X 卡(display-only)。已知干净源全死(STOXX `h_vstoxx.txt` 2016 冻结、Yahoo `V2TX.DE` 2016 死)→ Codex 实证新主源 **boerse-frankfurt quote_box JSON**(`quote_box/single?isin=DE000A0C3QF1&mic=XFRA`,V2TX 主指数,**无需 token**)+ **STOXX 官页 HTML fallback**(`#overview-last-value`+末图表点)。新增 `macroDrivers.euroVolatility`{value,refDate,changePct};freshness refDate Europe/Berlin ≤5 自然日 + fail-closed;plausible [5,100];`vixSpread` **仅 render 侧读 `displayInputsBaseline.vix` 派生,不入数据块/不回写 values/scoring**。5 处 wiring(results[18] + fetchDisplayOnly[8] + 落盘)+ render(renderC5 早退前)+ index C5 count `1暂代·3live·1P1`→`1暂代·4live` + intro 改 + validator optional + DATA_CONTRACT 1 行 + degraded 8→9 块 + source-review §5 勘误。commit `a92ee96`,20 Assert Count=1 + check:all 全绿。**线上待验证**:euroVolatility live(boerse,GitHub US runner 可达 api.boerse-frankfurt.de?)或 fallback(STOXX);value ~15–35。 |
| Stage 6C China CPI/PPI + China PMI | 接中国官方通胀/景气 2 卡(display-only):NBS primary(stats.gov.cn `/sj/zxfb/` 索引含分页→LINK_RE 链接发现→抓发布**正文**→YOY_RE/PMI_RE 提值)+ TradingEconomics fallback。`macroDrivers.chinaInflation`{cpi,ppi}(YoY decimal,render ×100)+ `macroDrivers.chinaPmi`{pmi}(点值);**PMI fallback=`/china/business-confidence`(NBS 官方口径 ~50.x,非 RatingDog/S&P 52.x)**;freshness 45d hard-guard(publishedAt/endOfRefMonth)+ fail-closed;cpi/ppi 独立三态。5 处 wiring(results[16]/[17] + fetchDisplayOnly + 落盘)+ 2 卡 render(renderC6 早退前,neutral OBS)+ index C6 count 5live·2P1→7 live + intro 改 + validator optional ×2 + DATA_CONTRACT 2 行 + degraded 6→8 块。commit `cd42b75`,15 Assert Count=1 + check:all 全绿。**线上待验证**:GitHub US runner 能否抓 stats.gov.cn 正文(live=NBS)或回落 TE(fallback);PMI 须 ~50.x 官方口径。 |
| Stage 6A China 10Y + CFETS RMB | 接 2 个实证 fresh 的中国官方 JSON 源:China 10Y(ChinaBond `historyQuery` JSON,日频)+ CFETS RMB(ChinaMoney `RmbIdxHis` JSON,周频精确,含 BIS/SDR;喂 C2+C6 两卡)。新增 `macroDrivers.chinaBond`/`cfetsRmb`(display-only);按最大日期选最新行 + freshness hard-guard(10Y>7d/CFETS>14d→fallback)+ plausible + fail-closed;5 处 wiring 含 fetchDisplayOnlyMacroDrivers + 落盘;neutral OBS。commit `9fe8b1b`。**线上验证**:GitHub runner 可达中国站点,chinaBond/cfetsRmb 均 live(10Y=1.72/CFETS=100.47)。**重定范围注**:原 6A 的 China CPI(FRED OECD 停 2025-04)/PPI(停 2022-12)/V2X(STOXX txt 死 2016、Yahoo V2TX.DE 死)均实证陈旧/死,连同 China PMI 一并归入「NBS/脆弱批」延后。 |
| Stage 6 难源调研(research-only) | 为 5 张 pending 卡(China PMI/CPI/PPI/10Y、CFETS RMB、V2X)逐源实证公开源,**每数据点找到 ≥2 可行源**,多数干净 JSON/CSV/API:China CPI/PPI=FRED OECD(`CHNCPIALLMINMEI`/`CHNPIEATI01GYM`)+NBS XLSX;China 10Y=ChinaBond/ChinaMoney JSON(日,精确,实测✅);CFETS=ChinaMoney `RmbIdxHis` JSON(周,精确,含 BIS/SDR,实测✅)+ BIS/FRED 代理;V2X=STOXX `h_vstoxx.txt`(日CSV,实测✅)+Yahoo `V2TX.DE`;China PMI=NBS+S&P/RatingDog。owner 姿态:私用非商业,ChinaMoney/ChinaBond 低频+缓存可自动抓。结论 + 实施分层(6A/6B/6C)见 `docs/CHINA_V2X_SOURCE_REVIEW.md`。未实施(research-only)。 |
| Stage 5 历史窗口字段 | 给已有 live 卡补 4 个 display-only 历史窗口派生字段(统一 `historyWindowFields` namespace):HY OAS WoW(7日)/ DXY 12周高 / Private Credit 6-proxy 12周 rolling z-score(不含 CDX,价格 −z·OAS +z,headline=6 均值)/ SPX 52周高(spx+privateCredit6 加进 appendHistoryFull 每日 snapshot,从 0 累积)。各带 windowStatus(ready/partial/missing),未满显示「累积中 N/target」、不上强 tone。commit `4598e8a`。线上验证:hyOasWoW=ready(−7bp)、dxy12wHigh=partial(36/84)、privateCredit/spx52w=partial(累积中)。 |
| P2-13b Worker FRED API 迁移 | Cloudflare Worker(`worker-market-preview.js`)FRED 抓取迁官方 API:`env.FRED_API_KEY` 沿 builder→fetchAllFredSeries→fetchFredSeries 下传,API-first(`maxAttempts:1`)+ CSV-fallback,新增 `latestTwoFredApiValues`,失败仅追加 `fredApi*` 诊断不污染 sourceStatus。commit `d44c4f1`→`d3adf69` + `wrangler deploy`(version `477574de`)。**线上验证**:CSV 仍宕时 worker preview `health=100/criticalMissing=0`,前端主源恢复。Cloudflare secret `FRED_API_KEY` 已配。 |
| P2-13 FRED API 迁移 | FRED 抓取从公开 CSV 端点(`fredgraph.csv`)迁官方 API(`api.stlouisfed.org/fred/series/observations` + `FRED_API_KEY`),**API-first + CSV-fallback**(无 key/API 失败回落 CSV,零回归)。覆盖 realtime 9 + Daily 55 个 series 两个 chokepoint;source 标签不动;两个 build workflow 注入 secret。commit `d44c4f1`。**线上验证通过**:CSV 仍宕时,realtime 经官方 API 回 health=100/live、Daily degradedMode=false、`inflationEnergy` live。 |
| Daily degraded display refresh | Daily fallback 路径不再跳过 display-only macroDrivers:新增 `fetchDisplayOnlyMacroDrivers`,`buildFallback` 改 async 并 merge `worldEconomy`/`chinaEquity`/`inflationEnergy`/`copperGold` 四块,preserve-set 零覆盖。修复「realtime 降级时 C1/C5/C6/C2 展示卡数据永不进生产」。线上活体验证通过(降级态下 3 个 Yahoo 块 live,degradedMode 仍 true)。commit `d270176`。 |
| Stage C2 Cu/Au | C2 全球流动性 Cu/Au 铜金比从 P1 升级为 Yahoo `HG=F`/`GC=F` live 派生比率 display-only OBS 卡;接入 `macroDrivers.copperGold` (`results[13]`);schema 存原始 `ratio`,前端 render ×1000(`1.418`);`ratioChangePct` 两腿 `prev=price/(1+changePct)` 派生;不进 scoring/decision/execution/position/effectiveDisplayInputs/cross-validation。commit `80b2bac`。 |
| M-93A V3 | `#plain-summary-card` editorial section 上线;9 narrative + 31 evidence 翻译表 + 5 risk-level / 3 data-health enum;bounded checker + bump 工具命令示例 marker 覆盖;frontend display-only,不动 scoring/decision/execution/position guidance。 |
| M-93A0 | Homepage IA contract 新增 non-nav plain summary preface slot;DESIGN.md §4.1/§5.1/§10.2/§12 正式引入 `#plain-summary-card` 概念;`check-homepage-ia-contract.mjs` 添加 `checkOptionalPlainSummaryPreface()` 提供 optional allow + position guard。 |
| M-93A V2 | Plain User Summary section source review spec 落地 docs/PLAIN_SUMMARY_M93A_V2_SOURCE_REVIEW.md;12 sections 覆盖翻译表、bounded checker、cache marker 豁免边界、V3 实施清单。 |
| M-93 V1 | User Language Audit 完成,docs/USER_LANGUAGE_AUDIT_M93_V1.md 落地禁词清单与术语翻译基线。 |
| M-91 / P2-12 | Market Pricing keeps QQQ primary and adds Yahoo `^NDX` / `^IXIC` as Daily/manual display-only auxiliary comparison metrics;Worker/scoring/decision boundaries unchanged. |
| P2-11 | Backend/frontend coverage display completion merged to main; External AI raw runtime fields remain explicit ignore rather than frontend display. |
| P2-10 | Macro driver card date rendering rechecked; employment / CRE frontend output is guarded against `undefined` / `NaN` / `Invalid Date` date text. |
| M-87 | Null-to-zero display guards prevent missing sources from rendering as `0.00` or `+0.0bp`. |
| M-86 | Macro Overview separates public proxy coverage from formal / non-public boundary notes. |
| M-85 | EIA Europe Brent Spot Price FOB public HTML proxy added to `brentPricingLayer`. |
| M-84 | FRED aggregate bank CRE loan balance proxy added to `commercialRealEstate`. |
| M-83 | CCLFX public interval-fund NAV proxy added to `privateCreditProxy`. |
| M-82 | ICE public delayed Brent futures last-price curve added to `brentPricingLayer`. |
| M-81 | ICE public CDX NA HY/IG 5Y settlement prices added to `privateCreditProxy`. |
| M-80 | CheckMySwap USD OIS public curve, CMBS ETF, PBDC/SRLN public proxies added. |
| M-76 | Backend-present macro fields surfaced across Macro Drivers / Risk Engines / Brent detail. |
| M-75 | `check:all` grouped into 23 top-level suites while preserving atomic checks. |
| M-74 | shipping/freight, policy expectations, retail segments, private-credit proxy, CRE proxy connected as display-only layers. |
| M-71 Brent public proxy source review | EIA / ICE / Baltic / Freightos / future S&P-Platts source families reviewed without runtime wiring. |

---

## Section 4 · Future Considerations

- Brent physical side: pursue formal Platts / ICE settlement only through a separate reviewed source contract.
- Policy text: improve FOMC tone quality review without turning it into a decision engine.
- Backtesting: replay historical narrative triggers around 2008 / 2020 / 2022.
- Worker reliability: consider additional fallback only after current Worker-first health has enough observation time.
- Annual SIPRI refresh: update normalized data after SIPRI releases the new annual dataset.
- FRED sourcing policy (P2-13 起): 新增 FRED-able 数据一律走官方 API（`FRED_API_KEY`），不加 CSV 端点(疑似永久关闭)。2026-05-29 审计:现有 FRED-able 数据已基本全接 FRED;非-FRED 源多为 FRED 不提供者(Baltic 运价/ETF 代理/期货曲线/ISM PMI〔FRED 无授权〕/Cboe 盘中/gold-api/CFETS 篮子/HTML 摘要)。边缘候选(产品决策):DXY 卡接 `DTWEXBGS`(已抓,属展示接线)、CFETS RMB 用 `DEXCHUS` 双边代理(非篮子,需 proxy 声明)。CSV fallback 长期若确认废弃可一次性清理删除。

---

## Section 5 · Audit History

Compact current audit trail:

| Date | Scope | Outcome |
|---|---|---|
| 2026-05-29 | Stage V2X 欧元区波动率(VSTOXX,boerse 主源 + STOXX fallback)实施 | 6-脆弱批收口。7 步协作全过(outline v1.0 → Codex 实证 DP0 闸门:已知干净源全死,新主源 = boerse-frankfurt quote_box JSON 无 token、fallback = STOXX 官页 HTML → v1.1 锁定 → Codex brief → Claude 逐字符复核 20 改动点 Count=1 + helper(`finiteNumberOrNull`/`isoNow`/`fetchJsonText` 4-arg)+ `validateNullableIsoString` 接受 date-only → Codex 实施 → diff 复核无 weld/resolver 不碰 values)。新增 `macroDrivers.euroVolatility`{value,refDate,changePct};freshness refDate Europe/Berlin ≤5d + fail-closed;plausible [5,100];vixSpread 仅 render 派生(`displayInputsBaseline.vix`,不回写)。5 处 wiring(results[18]+fetchDisplayOnly[8]+落盘)+ render(renderC5 早退前)+ index count/intro + validator optional + DATA_CONTRACT 1 行 + degraded 8→9 + source-review §5 勘误。commit `a92ee96`(15 files +272/−43;app.js 首字节因 PowerShell Set-Content 带 UTF-8 BOM,无害,check:all 全绿)。asset bump `stage-v2x-vstoxx-1`。**线上待验证**:euroVolatility live(boerse,确认 GitHub US runner 可达)/fallback(STOXX);value ~15–35。**至此 6-脆弱批(6A/6C/V2X)全部收口,路线图只剩 Stage 7。** |
| 2026-05-29 | Stage 6C China CPI/PPI + China PMI(NBS primary + TE fallback)实施 | 7 步协作流程全过(outline v1.0→v1.1:Codex 实证复审锁两处必修——NBS 抓**正文**非标题、PMI fallback=`business-confidence` → Codex brief → Claude 逐字符复核 15 改动点 Count=1 + helper 存在性 + `retryFetch` UA option → Codex 实施 → Claude diff 复核:render 无 weld、9 bump 文件纯版本串)。`macroDrivers.chinaInflation`{cpi,ppi} + `chinaPmi`{pmi};NBS 多步(索引+分页 → `LINK_RE` 链接发现 → 抓正文 `htmlToPlainText` → `YOY_RE`/`PMI_RE`)+ TE fallback;CPI/PPI YoY decimal、PMI 点值;freshness 45d(publishedAt/endOfRefMonth)+ fail-closed;cpi/ppi 独立三态;display-only 不进 scoring/decision/baseline/effectiveDisplayInputs/cross-validation。commit `cd42b75`(14 files +497/−43),15 Assert Count=1 + check:all 全绿;asset bump `stage-6c-china-cpi-ppi-pmi-1`。**线上待验证**:Daily run 看 chinaInflation/chinaPmi live(NBS,GitHub US runner 可否抓 stats.gov.cn 正文)或 fallback(TE);PMI 须 ~50.x 官方口径不混 RatingDog。 |
| 2026-05-29 | Stage 6A China 10Y(ChinaBond)+ CFETS RMB(ChinaMoney)实施 | 实测发现 FRED OECD 中国 CPI(停 2025-04)/PPI(停 2022-12)、STOXX txt(2016 死)、Yahoo V2TX.DE(2016 死)均陈旧/死 → 6A 重定为 2 个 fresh 中国官方 JSON 源(China 10Y + CFETS,后者喂 C2+C6)。新增 `macroDrivers.chinaBond`/`cfetsRmb` display-only;选最新行 + freshness guard(7d/14d)+ plausible + fail-closed;fetchJsonText 复用;5 处 wiring(含 fetchDisplayOnlyMacroDrivers + 落盘);validator optional;DATA_CONTRACT 2 行 + degraded 6-block;asset bump `stage-6a-china-bond-cfets-1`。commit `9fe8b1b`,20 Assert Count=1 + check:all 全绿。线上 Daily run(`40e34bf`)验证 chinaBond/cfetsRmb=live(GitHub runner 可达中国站点)。CPI/PPI/PMI/V2X 归「NBS/脆弱批」延后。 |
| 2026-05-29 | Stage 6 难源调研(source-resolution,research-only) | Claude 设计 + Codex 全球搜寻 + Claude 端点交叉核对(实测 200+真实数据):China 10Y(ChinaBond `historyQuery` / ChinaMoney `ClsYldCurvHis` JSON,日频精确)、CFETS RMB(ChinaMoney `RmbIdxHis` JSON,周频精确,同记录含 BIS/SDR)、V2X(STOXX `h_vstoxx.txt` 日CSV)、China PPI(FRED OECD `CHNPIEATI01GYM`)均实测可达。5 卡 + China CPI 共 6 数据点全部找到 ≥2 优质源。owner 确认私用非商业 → ChinaMoney/ChinaBond JSON 低频+缓存可自动抓。交付 `docs/CHINA_V2X_SOURCE_REVIEW.md`(逐源对比 + 抓取指引 + 6A/6B/6C 实施分层)。无代码改动。 |
| 2026-05-29 | Stage 5 历史窗口字段(HY WoW / DXY 12w / Private Credit 6-proxy z / SPX 52w) | 新增顶层 display-only `historyWindowFields`;appendHistoryFull 每日 entry 追加 `spx`(真实 realtime.values.spx,缺失 null,不用 deriveRisk 的 5100 default)+ `privateCredit6` compact snapshot(BIZD/PBDC/SRLN/CCLFX/HY OAS/IG OAS,**不含 CDX**);`buildHistoryWindowFields` 在 appendHistoryFull 后用更新后的 full history 计算(N-1 z、stddev=0→0、不足→null);4 卡 render leaf-only 接线,partial 不上强 tone;validator optional;asset bump → `stage-5-history-window-1`。commit `4598e8a`,`check:all` 全绿。线上 Daily run(`edd214a`)验证四字段 windowStatus 符合预期。SPX/PrivCredit 从 0 累积,~364/84 天后自动 ready。 |
| 2026-05-29 | P2-13b Worker FRED 抓取迁官方 API(选项 3) | Cloudflare Worker 主 preview 的 FRED 抓取改 API-first(`maxAttempts:1`)+ CSV-fallback;`env.FRED_API_KEY` 沿链下传(index.js:694 + builder/fetchAllFredSeries/fetchFredSeries);新增 `latestTwoFredApiValues`/`buildFredApiUrl`/`fredApiFallbackFields`;`fetchTextWithDiagnostics` 加 `maxAttempts`(默认 2 不变);fallback 仅追加 `fredApi*` 诊断,不污染 sourceStatus。commit `d3adf69`,两 `node --check` + `check:workflows`/`check:modules`/`check:all` 全绿。Cloudflare secret 已配 + `wrangler deploy`(version `477574de`)。**线上验证**:CSV 端点仍宕时 worker preview `health=100/live/criticalMissing=0` → 前端主源恢复。至此 FRED-API 迁移三链路(Node daily/realtime + Worker)全完成。 |
| 2026-05-29 | P2-13 FRED 抓取迁官方 API(韧性加固) | `run-realtime.mjs` + `run-daily-pipeline.mjs` 的 FRED 抓取改 API-first + CSV-fallback;新增 `parseFredApiObservations`/`buildFredApiUrl`,API 单次尝试失败即回落现有 CSV(零回归);两个 build workflow env 注入 `FRED_API_KEY: ${{ secrets.FRED_API_KEY }}`;source 标签/validator/前端/Worker 不动。commit `d44c4f1`,`check:all` 全绿。`FRED_API_KEY` secret 已配。**线上验证通过(同日)**:官方 API 已恢复(快速 400)而 CSV 端点仍超时;手动触发两 workflow → realtime `health=100/live`、Daily `degradedMode=false` + `inflationEnergy` cpi/wti `live` + `fedLiquidity` 实值,全经官方 API。整条数据管线(realtime/Daily/前端 fallback)靠 P2-13 从 FRED CSV 故障中自救恢复;仅 Worker(选项 3)仍走 CSV。 |
| 2026-05-29 | Daily 降级模式 display-only 修复 + FRED 故障 RCA | 查实 Daily 长期走 `buildFallback`(realtime 降级)→ 跳过 `fetchMacroDrivers` → C1/C5/C6/C2 四块从未进生产数据。修复:fallback 也刷新 4 个 display-only 块(commit `d270176`,`check:all` 全绿,线上验证四块出现且 `degradedMode` 仍 true)。FRED RCA:realtime/Worker/Daily 全线降级源于公开 CSV 端点 `fred.stlouisfed.org/graph/fredgraph.csv` 大范围超时 + `api.stlouisfed.org` 504(独立网络复现,排除 CI-IP 封锁),始于 05-28 23:41Z;外部故障,自愈为主。开 P2-13 韧性加固。 |
| 2026-05-29 | Stage C2 Cu/Au 铜金比接入 (Yahoo `HG=F`/`GC=F` live display-only) | 7 步协作流程全过 (outline v1.0/v1.1 → Codex brief → Claude 逐行复核 → Codex 实施 → Claude diff 复核);commit `80b2bac` pushed to main;14 files +251/−33;`macroDrivers.copperGold` 作为 `results[13]` 接入,raw ratio 存储 / render ×1000 / OBS 中性 tone;边界守住(不进 scoring/decision/execution/position/effectiveDisplayInputs/cross-validation);无 data/realtime 手改,`build:data` 留给生产 CI;`check:all` 23 suites PASS;cache bump → `stage-c2-copper-gold-ratio-1`。 |
| 2026-05-24 | M-93 4 阶段全流程 (V1 audit / V2 spec / M-93A0 IA / V3 implementation) | PR #244/#245/#247/#248 全部 merged;新增 `#plain-summary-card` editorial section + bounded checker (`check-plain-summary-card-contract.mjs`) + `renderPlainSummary.js` 翻译表;cache version bump 28.0M-91V → 28.0M-93AV via 官方工具,工具同时扩展正则覆盖命令示例 marker;`check:all` 23 suites PASS;无 data/realtime/workers runtime/workflows 改动。 |
| 2026-05-23 | M-91 / P2-12 Market Pricing NDX/IXIC implementation | Yahoo `^NDX` / `^IXIC` added as Daily/manual auxiliary history + metrics;QQQ primary, SPX fallback, Worker/scoring/decision boundaries preserved;self-audit required by AGENTS.md Section 10 completed in delivery. |
| 2026-05-22 | M-87 null-zero display guards | Missing Brent / repo source values stay missing instead of rendering as zero. |
| 2026-05-22 | M-74 to M-86 macro public-source and frontend display work | Public proxies connected and displayed; formal/non-public boundaries preserved. |
| 2026-05-22 | M-75 check-suite compaction | Top-level `check:all` reduced to 23 suites; atomic checks retained. |
| 2026-05-20 to 2026-05-21 | M-67 to M-73 macro-driver and Brent source review | Employment, consumer retail, CRE, BGCR/TGCR, ISM PMI and Brent source-review tracks advanced. |
| 2026-05-17 to 2026-05-20 | M-57 to M-66 project memory, World Order, ACLED, IA | Backlog, SIPRI/ACLED/GDELT, Pages trigger coverage and homepage IA contracts stabilized. |

Historical detail belongs in [MILESTONE_INDEX.md](MILESTONE_INDEX.md), specific milestone docs, or git history. Do not re-copy long milestone prose into this file.

---

## Section 6 · 工作流约定

Add or update backlog items with these rules:

1. Keep one item per problem; do not bundle unrelated sources or UI work.
2. Record priority, current status, data boundary, expected output, and verification path.
3. When an item closes, keep only a one-line recent summary here and move detail to [MILESTONE_INDEX.md](MILESTONE_INDEX.md) or a scoped doc.
4. P3 / won't-fix / source-review items must state the boundary reason and the unlock path.
5. This file is checked by `npm run check:project-backlog-format` and `npm run check:all`.

---

## 🔄 Session Handoff (最新)

- **上次会话结束于**: Stage V2X 上线 — 欧元区波动率(VSTOXX,boerse 主源 + STOXX fallback)live display-only(commit `a92ee96` pushed,15 files +272/−43)+ backlog 收尾(本次提交)。Stage 6C 已线上验证通过(chinaInflation/chinaPmi 均 NBS live:CPI 1.2%/PPI 2.8%/PMI 50.3,Daily `da4a898`)。会话累计:C2、Daily 降级修复、FRED RCA、P2-13、P2-13b、Stage 5、Stage 6 调研、Stage 6A、Stage 6C、Stage V2X。
- **当前进行中**: 无活跃任务。Stage V2X **待线上 Daily run 验证**(euroVolatility 出现且 sourceStatus live(boerse,GitHub US runner 可否达 api.boerse-frankfurt.de)或 fallback(STOXX);value ~15–35;refDate Europe/Berlin 新鲜;freshness ≤5d 生效)。
- **下一步建议**: **6-脆弱批(6A/6C/V2X)全部收口**,路线图只剩 **Stage 7** = World Order 暂代卡退场 D2(牵动 C5 count `1 暂代 · 4 live` + 卡总数 + IA checker;暂代 overlay 卡在 `index.html:333`)。小缺口:ISM「深度收缩」tone 映射(`ismToneFromRegime` 未映射,顺手 1-2 行修)。
- **阻塞或等待**: 等 Stage V2X 线上 Daily run 验证结果。`.claude/stage-briefs/` 存有 C2/Daily-fix/P2-13/P2-13b/Stage5/Stage6A/Stage6C/V2X(+Stage6 调研)outline+brief(gitignored);Stage 6 source-review = `docs/CHINA_V2X_SOURCE_REVIEW.md`(V2X §5 已勘误;FRED OECD 陈旧勘误仍可补)。
