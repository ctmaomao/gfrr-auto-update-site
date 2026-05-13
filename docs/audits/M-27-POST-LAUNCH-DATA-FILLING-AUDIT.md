# M-27 Post-launch Data Filling Audit

Scope: v28.0M-27 post-launch read-only diagnostic. This report audits what the website renders, what data exists in the checked-in JSON files, and where the current frontend still shows placeholder language such as `--`, `暂不足以判断`, `数据不足`, or old waiting-state copy.

This audit did not modify code, data, configuration, workflows, or checks.

## 1. Executive Summary

**Total audited surfaces**: 21 areas: 13 homepage IA sections plus 8 appendix/detail subsections.

| Status | Count | Meaning |
|---|---:|---|
| 🟢 fully populated | 10 | DOM targets receive current JSON-backed values, with no obvious render stub. |
| 🟡 partially populated | 10 | Data renders, but some cards still show placeholders, stale gap copy, or ignore available backend fields. |
| 🔴 mostly empty / semantically underfilled | 1 | DOM renders, but the module name over-promises relative to actual synthesis. |
| ⚫ render-only stub | 0 | No audited section is completely unwired. |

**Main finding**: the site is no longer a visual shell. Most data surfaces are wired to `data/radar-data.json`, `data/world-order-stress.json`, realtime fallback data, and M-27 market-pricing metrics. The practical gap is more subtle: several high-value editorial modules still display scaffold-era missing-evidence language or use only a narrow subset of available backend data.

**Highest user-visible gap**: `#homepage-risk-engines` and `#homepage-cross-validation` are rendered by `scripts/modules/renderMacroOverview.js`, but `buildRiskEngines()` and `buildCrossValidation()` still contain Market Pricing waiting-era evidence gaps. M-27 activated `data/market-pricing-metrics.json` for the temperature card only; the risk engine and cross-validation cards do not incorporate latest z-score `+2.2456`, range `[-2.6359, +2.8311]`, or the active QQQ metrics state.

**Backend data is richer than the first-fold synthesis**: `data/radar-data.json` already includes `dailyBrief`, `divergenceLayer`, `brentPricingLayer`, `macroDrivers`, `liquidityIndex`, `transmissionChain`, `assetReturnMap`, `assetMatrix`, `scenarioTree`, `warningSystem`, `tradingSystem`, `decisionModel`, and `aiInterpretationLayer`. Some of this is deeply rendered in appendices but not summarized in the modules users scan first.

**No totally empty section found**: many `--` strings in `index.html` are initial placeholders that `scripts/app.js` fills. Remaining user-facing “数据不足” often comes from explicit render logic or real data gaps, not a missing DOM target.

## 2. Per-Section Detailed Findings

## `#homepage-today-judgment` / 今日总判断

**Status**: 🟡 partially populated  
**DOM targets**: dynamic section `homepage-today-judgment` under `macro-risk-overview-root`  
**Render function(s)**: `renderMacroRiskOverview()` -> `buildTodayJudgment()` in `scripts/modules/renderMacroOverview.js`  
**Data source(s)**: `radar-data.json: score`, `scoreChange1d`, `dailyBrief`, `displayInputsBaseline`, `brentPricingLayer`, `dailyRealtimeInput.healthScore`; `world-order-stress.json`

**Findings**:
- The headline score, stage, one-line judgment, evidence strength, and data coverage are populated from real checked-in data: score `56`, updatedAt `2026-05-12T23:35:33.361Z`.
- The module still hardcodes missing evidence: `市场温度历史数据尚未接入。` This is stale after M-27 because `data/market-pricing-metrics.json` exists and renders the card.

**Backend availability**:
- Backend has active market-pricing metrics, but `buildTodayJudgment()` does not accept `marketPricingMetricsData`.
- Fix is render-layer only if using existing metrics; no data pipeline change needed.

**Severity of gap**: USER VISIBILITY high; INFORMATION VALUE medium; BLAST RADIUS small.

## `#homepage-pressure-sources` / 压力来源

**Status**: 🟡 partially populated  
**DOM targets**: dynamic cards in `homepage-pressure-sources`  
**Render function(s)**: `buildPressureSources()` / `appendEditorialPressureCard()`  
**Data source(s)**: `displayInputsBaseline`, `macroDrivers.consumer`, `brentPricingLayer.dataGaps`, `world-order-stress.json`

**Findings**:
- Brent, rates, DXY, HY OAS, VIX, consumer sentiment, and World Order score are populated.
- Several cards correctly show real data gaps: Dated Brent, term structure, crack spread, freight/shipping, PMI, employment breadth.
- The section is useful but still heavy on “部分缺口”; this is mostly real backend limitation, not render failure.

**Backend availability**:
- `macroDrivers.fedLiquidity`, `curve`, and `credit` are available but not prominent in first-fold pressure cards.
- Could improve with a renderer patch using existing `macroDrivers.activeSignals` and `gatingEvaluation`.

**Severity of gap**: USER VISIBILITY medium; INFORMATION VALUE high; BLAST RADIUS small/medium.

## `#homepage-signal-layers` / 信号分层

**Status**: 🟡 partially populated  
**DOM targets**: dynamic cards in `homepage-signal-layers`  
**Render function(s)**: `buildSignalLayers()`  
**Data source(s)**: `dailyBrief.largestDivergence`, `displayInputsBaseline`, `brentPricingLayer`

**Findings**:
- Verified and pending signals render from real risk inputs.
- The data-gap card still says `Nasdaq / QQQ 周线历史尚未接入。` This is obsolete for QQQ after M-24/M-26/M-27.
- Signal layering does not include the active Market Pricing z-score as either confirming or contradictory evidence.

**Backend availability**:
- `market-pricing-metrics.json` can close the QQQ weekly-history gap.
- More complete signal layering would also include `divergenceLayer.checks` directly, rather than just Daily Brief's largest divergence.

**Severity of gap**: USER VISIBILITY high; INFORMATION VALUE high; BLAST RADIUS small.

## `#homepage-macro-drivers` / 四大驱动

**Status**: 🟡 partially populated  
**DOM targets**: dynamic cards in `homepage-macro-drivers`  
**Render function(s)**: `buildMacroDrivers()`  
**Data source(s)**: `displayInputsBaseline`, `macroDrivers.consumer`, `modules.liquidity`

**Findings**:
- Growth, inflation, liquidity, and policy cards render.
- Growth uses UMCSENT real monthly data (`53.3`, source `FRED:UMCSENT`).
- Policy is intentionally a waiting/data-gap card: no direct Fed expectations or policy path metric is currently attached.
- `macroDrivers.fedLiquidity`, `curve`, and `credit` have live structural fields, but this first-fold module mostly reduces liquidity to DXY/US10Y/HY OAS and misses ON RRP / curve / IG OAS detail.

**Backend availability**:
- `macroDrivers.activeSignals` includes `逆回购准备金告急`.
- `gatingEvaluation.structuralRed === true` exists and is used downstream in decisions, but is not surfaced clearly here.

**Severity of gap**: USER VISIBILITY medium; INFORMATION VALUE high; BLAST RADIUS medium.

## `#homepage-market-temperature` / 市场温度

**Status**: 🟢 fully populated  
**DOM targets**: `market-temperature-card-root` plus dynamic summary  
**Render function(s)**: `renderMarketTemperatureCard()`, `classifyZScoreBucket()`, `buildMarketTemperatureSummary()`  
**Data source(s)**: `data/market-pricing-metrics.json`

**Findings**:
- M-27 wiring is present. `scripts/app.js` fetches `data/market-pricing-metrics.json` independently and re-renders the macro overview.
- Metrics file has `metricsRecordsCount=464`, latest date `2026-05-11`, latest zScore `2.2456`.
- The card displays latest close, MA60, StdDev60, z-score, 7-week sparkline, historical z-score range, sourceCommit, and disclaimer.

**Backend availability**:
- This data is available but currently not propagated into risk engines, signal layers, or cross-validation.

**Severity of gap**: USER VISIBILITY low for this section itself; INFORMATION VALUE high; BLAST RADIUS small for downstream reuse.

## `#homepage-risk-engines` / 风险引擎

**Status**: 🟡 partially populated, high-priority gap  
**DOM targets**: dynamic cards in `homepage-risk-engines`  
**Render function(s)**: `buildRiskEngines()`, `appendEditorialEngineCard()`  
**Data source(s)**: `displayInputsBaseline`, `brentPricingLayer`, `divergenceLayer.checks`, `modules`, `world-order-stress.json`

**Findings**:
- The module is not empty. It renders five engines: energy/inflation, rates/liquidity, asset-pricing mismatch, world-order, and financial fragility.
- Real data is used for Brent `118.26`, US10Y `4.42`, real10Y `1.95`, DXY `118.0392`, HY OAS `2.79`, VIX `18.38`, module scores, and World Order score `49`.
- The asset-pricing mismatch engine still says `Nasdaq / QQQ 周线历史、60 周均值、标准差和 z-score 等待接入。` This is now wrong at the site level.
- Financial fragility remains a thin proxy: it uses `liquidity_vs_credit_transmission`, HY OAS, and VIX, but has no bank stress, private credit, CRE, funding cost, or detailed credit layers.

**Backend availability**:
- Available-but-unused: `market-pricing-metrics.json`, `macroDrivers.credit.igOas`, `macroDrivers.fedLiquidity.onRrp`, `macroDrivers.curve.t10y2y`, `macroDrivers.gatingEvaluation`.
- Requires render change for Market Pricing / existing macroDrivers; requires pipeline/data-source work for bank stress / private credit / CRE.

**Severity of gap**: USER VISIBILITY high; INFORMATION VALUE high; BLAST RADIUS small for stale Market Pricing integration, large for new financial-fragility data.

## `#homepage-cross-validation` / 交叉验证

**Status**: 🔴 semantically underfilled  
**DOM targets**: dynamic cards in `homepage-cross-validation`  
**Render function(s)**: `buildCrossValidation()`, `appendEditorialValidationCard()`  
**Data source(s)**: `displayInputsBaseline`, `divergenceLayer.checks`, `dailyBrief.dominantRiskChain`, `macroDrivers.consumer`

**Findings**:
- The section renders, but it is not a full cross-validation layer across all backend data.
- It checks four narratives: energy shock, stagflation pressure, risk-asset mismatch, and overheat confirmation.
- It does not consume `market-pricing-metrics.json`, `world-order-stress.json`, `decisionModel`, `warningSystem`, `assetMatrix`, `assetReturnMap`, `transmissionChain`, or External AI display layer.
- The overheat confirmation card still says z-score/history are waiting. This is the most obvious M-27 post-launch mismatch.

**Backend availability**:
- Existing backend can already support a better cross-validation matrix: Market Pricing z-score, `risk_complacency_watch`, World Order freshness, structural macroDrivers, warningSystem, and transmissionChain.
- A meaningful fix is render-layer plus a small cross-validation model helper, not new data collection.

**Severity of gap**: USER VISIBILITY high; INFORMATION VALUE high; BLAST RADIUS medium.

## `#wow-key-changes` / 本期关键变化

**Status**: 🟡 partially populated  
**DOM targets**: `wow-key-changes-root`  
**Render function(s)**: `buildKeyChanges()`, `appendEditorialKeyChanges()`  
**Data source(s)**: derived from `buildMacroOverview()`

**Findings**:
- It summarizes score change, leading pressure, signal gaps, risk engine counts, validation counts, and health score.
- Because it depends on the same risk-engine/cross-validation counts, stale Market Pricing gaps can leak into “本期关键变化”.

**Backend availability**:
- No backend blocker. Once risk engines and cross-validation consume metrics, this section improves automatically.

**Severity of gap**: USER VISIBILITY medium; INFORMATION VALUE medium; BLAST RADIUS small.

## `#global-risk-heatmap` / 风险热力图

**Status**: 🟢 fully populated  
**DOM targets**: `world-heatmap`, `heatmap-list`  
**Render function(s)**: `renderHeatmap()` in `scripts/modules/renderCharts.js`  
**Data source(s)**: `radar-data.json: heatmap`

**Findings**:
- Seven regions are populated and rendered with score and note.
- No evidence of render-only stub.

**Backend availability**:
- The heatmap is computed in `scripts/run-daily-pipeline.mjs` from current modules and display inputs.

**Severity of gap**: USER VISIBILITY low; INFORMATION VALUE medium; BLAST RADIUS small.

## `#detail-data` / 详细数据

**Status**: 🟢 fully populated, with normal placeholder boot state  
**DOM targets**: realtime strip, health dashboard, trend charts, module bars, liquidity, transmission, asset tables, scenario list, confidence fields  
**Render function(s)**: `renderRealtimeStrip()`, `renderHealthDashboard()`, `renderBars()`, `renderLineChart()`, `renderTransmission()`, `renderAssetReturnMap()`, `renderAssetTable()`, `renderScenarioTree()`  
**Data source(s)**: `radar-data.json`, `radar-history.json`, `radar-history-full.json`, runtime realtime overlay

**Findings**:
- Many `--` values in `index.html` are initial placeholders and are filled by `scripts/app.js`.
- Current data includes 53 short-history rows and 21 full-history rows.
- `assetReturnMap.rows` has 8 rows; `assetMatrix` has 7 rows; `scenarioTree` has 4 rows; `transmissionChain` has 6 nodes and 5 layers.

**Backend availability**:
- `assetReturnMap` is preserved from previous data by `run-daily-pipeline.mjs` (`prevData.assetReturnMap || { horizon, rows: [] }`), so it is populated but may be less freshly derived than other daily fields.

**Severity of gap**: USER VISIBILITY low; INFORMATION VALUE high; BLAST RADIUS medium for refreshing asset-return generation.

## `#method-evidence` / 方法说明

**Status**: 🟡 partially populated  
**DOM targets**: `daily-brief-*`, `ai-interpretation-*`, `divergence-*`, `brent-*`, `world-order-*`  
**Render function(s)**: `renderDailyBrief()`, `renderAiInterpretationLayer()`, `renderDivergenceLayer()`, `renderBrentPricingLayer()`, `renderWorldOrderStressOverlay()`  
**Data source(s)**: `dailyBrief`, `aiInterpretationLayer`, `divergenceLayer`, `brentPricingLayer`, `world-order-stress.json`

**Findings**:
- The method/evidence section is substantially populated and useful for audit.
- It intentionally retains limitations and data gaps. Examples: Platts Dated Brent, term structure, crack spread, shipping/freight, World Order external-source quality.
- External AI interpretation here is rule-based (`v28.0J-0`), not a live provider call.

**Backend availability**:
- The section could link Market Pricing metrics into divergence/cross-validation explanations, but currently does not.

**Severity of gap**: USER VISIBILITY medium; INFORMATION VALUE high; BLAST RADIUS medium.

## `#external-ai-auxiliary` / 外部 AI

**Status**: 🟢 fully populated within its boundary  
**DOM targets**: `external-ai-display-panel`  
**Render function(s)**: `renderExternalAiPanel()`  
**Data source(s)**: `radar-data.json: externalAiInterpretationLayer`

**Findings**:
- `externalAiInterpretationLayer.status` is `valid` and `displayEnabled=true`.
- This section is deliberately auxiliary. It does not feed scoring, decision, execution, or position.

**Backend availability**:
- No data-filling repair needed unless the route owner wants a later provider refresh; that is outside this audit.

**Severity of gap**: USER VISIBILITY low; INFORMATION VALUE medium; BLAST RADIUS large if provider behavior changes, so defer.

## `#execution-risk-detail` / 执行风控

**Status**: 🟢 fully populated  
**DOM targets**: `decision-header-*`, `execution-*`, `warning-*`, `signal-*`, `action-*`, `position-*`, `risk-*`, `discipline-*`  
**Render function(s)**: `renderDecisionHeader()`, `renderExecutionLock()`, `renderWarningSystem()`, `renderSignalEngine()`, `renderActionLayer()`, `renderPositioning()`, `renderRiskControl()`, `renderDiscipline()`  
**Data source(s)**: `decisionModel`, `tradingSystem`, `warningSystem`, `triggerPanel`

**Findings**:
- Current state is populated: execution lock is red, signal strength is `56`, warnings include structural ON RRP alert, action/position/risk-control blocks are filled.
- Some text remains policy-like by design; no render stub detected.

**Backend availability**:
- Existing decision model already reads structural macro data and health state. Market Pricing is not part of decision logic by current boundary, so do not wire z-score into execution without a separate reviewed decision-layer change.

**Severity of gap**: USER VISIBILITY low; INFORMATION VALUE high; BLAST RADIUS large if changed.

### DATA APPENDIX Subsections

## 实时输入与数据健康

**Status**: 🟢  
**DOM targets**: `rt-*`, `health-*`, `realtime-notes`, `health-issues`, `health-source-list`  
**Render function(s)**: `renderRealtimeStrip()`, `renderHealthDashboard()`  
**Data source(s)**: remote Worker preview / `realtime/market.json` / `dailyRealtimeInput`

**Findings**:
- Local fallback has live-like values for Brent, DXY, HY OAS, VIX, SPX, US10Y, real10Y, breakeven, gold.
- Worker schema supports main preview values plus isolated secondary diagnostics, but the frontend does not load `/market.secondary-preview.json`.

**Backend availability**:
- Secondary diagnostics for VIX/Gold/DXY/US10Y/SPX exist at Worker level but are intentionally isolated and unused by the site.

## 风险趋势进化 / 宏观状态概率 / 危机阶段

**Status**: 🟢  
**DOM targets**: `trend-*`, `regime-bars`, `phase-*`, `phase-signals`  
**Render function(s)**: `renderLineChart()`, `renderBars()`, `renderList()`  
**Data source(s)**: `radar-history.json`, `regimeProbabilities`, `currentCrisisPhase`, `nextCrisisPhase`

**Findings**:
- Populated from 53 history rows and current regime probabilities.
- No empty-render issue detected.

## 30日时间维度 / 趋势解释 / 传导速度

**Status**: 🟢  
**DOM targets**: `score-change-30d`, `avg-30d`, `range-30d`, `draw-from-peak`, `transmission-speed`, `transmission-acceleration`, `path-change-bars`, `time-notes`  
**Render function(s)**: direct `app.js` assignments plus `renderBars()`  
**Data source(s)**: `timeDimension`

**Findings**:
- Current values are computed in `run-daily-pipeline.mjs` from score/history/module pressure.
- This is functional, though not a probabilistic model.

## 六大风险模块 / 流动性指数

**Status**: 🟢 data-populated; 🟡 interpretation depth  
**DOM targets**: `module-bars`, `liquidity-*`, `liquidity-pillars`, `liquidity-notes`  
**Render function(s)**: `renderBars()` plus direct `app.js` assignments  
**Data source(s)**: `modules`, `moduleTrends`, `liquidityIndex`

**Findings**:
- Six module scores are real in current JSON: geopolitical `85`, energy `82`, inflation `61`, liquidity `49`, debt `26`, banking `37`.
- Liquidity pillars are populated.
- User's “风险引擎缺失很多信息” is not caused by empty module scores; it is caused by the first-fold risk engine not synthesizing all available macro/credit/market-pricing inputs.

## 机构级宏观传导网络

**Status**: 🟢  
**DOM targets**: `chain-*`  
**Render function(s)**: `renderTransmission()`  
**Data source(s)**: `transmissionChain`

**Findings**:
- Populated with stressScore `79`, leadShock `战争/油价`, 6 nodes, 5 layers, 4 summary lines, and 6 asset impacts.
- This is one of the strongest existing backend-to-frontend mappings.

## 资产收益/回撤映射 / 资产偏好矩阵

**Status**: 🟡  
**DOM targets**: `asset-return-body`, `asset-table-body`, `return-map-horizon`  
**Render function(s)**: `renderAssetReturnMap()`, `renderAssetTable()`  
**Data source(s)**: `assetReturnMap`, `assetMatrix`

**Findings**:
- Both tables are populated.
- `assetMatrix` is recomputed in the Daily pipeline. `assetReturnMap` is currently preserved from previous data if present, so it may be stale relative to latest M-27 market pricing.

**Backend availability**:
- Refreshing `assetReturnMap` from current modules and Market Pricing metrics would require pipeline logic, not just rendering.

## 四情景树 / 信号可信度

**Status**: 🟢  
**DOM targets**: `scenario-list`, `confidence-score`, `confidence-level-bottom`, `confidence-notes`  
**Render function(s)**: `renderScenarioTree()`, direct `app.js` assignments  
**Data source(s)**: `scenarioTree`, `confidenceScore`, `confidenceLevel`, `confidenceNotes`

**Findings**:
- Populated with 4 scenarios and current confidence values.
- This is structured, not a stub.

## 决策概览 / 执行状态灯 / 预警规则 / 交易信号 / 今日执行 / 目标仓位 / 硬阈值风控 / 行为纪律

**Status**: 🟢  
**DOM targets**: all `decision-header-*`, `execution-*`, `warning-*`, `signal-*`, `action-*`, `position-*`, `risk-*`, `discipline-*`  
**Render function(s)**: decision and table renderers in `render.js` / `renderTables.js`  
**Data source(s)**: `decisionModel`, `tradingSystem`, `warningSystem`

**Findings**:
- Fully populated from current data.
- High blast radius: because this is decision/execution logic, any future change should remain outside data-filling UI fixes unless explicitly approved.

## 3. Cross-cutting Findings

### 3.1 风险引擎模块状态

The risk engine area is **running on real data**, but it is not yet a complete risk-engine synthesis layer.

**Running on real data**:
- Energy/inflation: `displayInputsBaseline.brent`, `breakeven10y`, `brentPricingLayer`.
- Rates/liquidity: `us10y`, `real10y`, `dxy`, `hyOas`, `vix`, `divergenceLayer.rates_vs_risk_assets`.
- World Order: `data/world-order-stress.json` score, state, freshness.
- Financial fragility: `liquidity_vs_credit_transmission`, HY OAS, VIX.

**Static or stale placeholders**:
- Asset-pricing mismatch still says QQQ weekly history / MA60 / std / z-score are waiting.
- Financial fragility lists bank stress, private credit, CRE, funding cost, and detailed credit indicators as missing. That is mostly true, not a render bug.

**Backend data that should be considered for M-28**:
- `data/market-pricing-metrics.json` latest zScore and historical range.
- `macroDrivers.credit.igOas`, `igHyRatio`.
- `macroDrivers.fedLiquidity.onRrp`, `walcl4wChange`.
- `macroDrivers.curve.t10y2y`, `t10y2yWeekChange`.
- `macroDrivers.activeSignals` and `gatingEvaluation`.

### 3.2 交叉验证模块完整度

Current `#homepage-cross-validation` is **not yet a full cross-validation engine**. It is a named editorial section that checks a small set of narratives:

- Energy shock: mainly Brent / public proxy evidence.
- Stagflation pressure: Brent + consumer sentiment / dominant risk chain.
- Risk-asset mismatch: rates check.
- Overheat confirmation: currently hardcoded as data gap.

It does **not** synthesize all backend data. It omits active Market Pricing metrics, World Order score/freshness, structural macroDrivers, asset matrix, warning system, transmission chain, and external AI display state.

Best diagnosis: **real section, but semantically underfilled**. It is not “just one signal”, but it is closer to “four curated checks” than “all-data cross validation”.

### 3.3 数据后台 vs 前端展示对照

| `radar-data.json` top-level key | Frontend consumed? | Current status |
|---|---|---|
| `dailyRealtimeInput` | Yes | Used in runtime/health context; populated. |
| `dailyBrief` | Yes | Populated; appendices use it, first-fold uses part of it. |
| `divergenceLayer` | Yes | Populated; risk/cross use selected checks. |
| `brentPricingLayer` | Yes | Populated; explicit data gaps remain real. |
| `score`, `scoreChange*`, `trendLabel` | Yes | Populated in first-fold and detail. |
| `displayInputsBaseline` | Yes | Heavily consumed. |
| `modules`, `moduleTrends` | Yes | Populated; risk overview uses summaries. |
| `regimeProbabilities` | Yes | Populated in detail. |
| `phaseSignals`, `topRisks`, `triggerPanel` | Yes | Populated in detail/execution. |
| `macroDrivers` | Partially | Consumer is used clearly; Fed liquidity/curve/credit are under-surfaced. |
| `liquidityIndex`, `timeDimension` | Yes | Populated in detail. |
| `heatmap` | Yes | Populated. |
| `transmissionChain` | Yes | Populated and well-rendered. |
| `assetMatrix` | Yes | Populated, recomputed daily. |
| `assetReturnMap` | Yes | Populated but appears carried over from prior data. |
| `scenarioTree` | Yes | Populated. |
| `warningSystem`, `tradingSystem`, `decisionModel` | Yes | Populated; high-risk logic boundary. |
| `aiInterpretationLayer` | Yes | Rule-based interpretation populated. |
| `externalAiInterpretationLayer` | Yes | Auxiliary panel active and valid. |

**Available but not fully consumed**:
- `data/market-pricing-metrics.json` outside the temperature card.
- Worker isolated secondary diagnostics (`/market.secondary-preview.json`) are not loaded by the frontend by design.
- Structural macro details are mostly present but not fully elevated into first-fold risk engines.

**Derived metrics that would be nice but do not exist yet**:
- VIX z-score / percentile, HY OAS z-score / percentile, DXY trend percentile.
- Credit breadth beyond HY OAS / IG OAS.
- Bank stress / CRE / private credit / funding stress.
- A formal cross-validation score matrix that records which signals confirm, contradict, or remain missing.

## 4. Repair Priority Ranking

## Priority 1: Remove stale Market Pricing gap copy from first-fold synthesis

**Why**: The site now has real QQQ metrics, but today judgment, signal layers, risk engines, and cross-validation still say the history/z-score layer is waiting.  
**Estimated PR scope**: small  
**Dependencies**: none; use existing `data/market-pricing-metrics.json` fetch.  
**Suggested next M-stage**: M-28.

## Priority 2: Upgrade `#homepage-cross-validation` into a real matrix

**Why**: This is the section users naturally expect to answer “do all signals agree?”, but current logic only checks four curated narratives and omits several available layers.  
**Estimated PR scope**: medium  
**Dependencies**: Priority 1, plus a small pure helper that accepts `data`, `worldOrderStressData`, and `marketPricingMetricsData`.  
**Suggested next M-stage**: M-29.

## Priority 3: Deepen risk engines with existing structural macro data

**Why**: `macroDrivers.fedLiquidity`, curve, credit, ON RRP, and IG OAS are already present and would make risk engines more practical without new sources.  
**Estimated PR scope**: medium  
**Dependencies**: Keep decision/execution untouched; display-only render/data-model helper.  
**Suggested next M-stage**: M-30.

## Priority 4: Recompute or refresh `assetReturnMap`

**Why**: It renders well, but pipeline code preserves previous rows instead of clearly deriving them from the latest state.  
**Estimated PR scope**: medium/large  
**Dependencies**: Define asset-return contract; avoid trading-advice language.  
**Suggested next M-stage**: M-31.

## Priority 5: Add financial-fragility source layer

**Why**: The “金融脆弱性” engine names real institutional concepts but lacks bank stress, private credit, CRE, and funding-cost data.  
**Estimated PR scope**: route-restart  
**Dependencies**: source review, data contract, staging checkers.  
**Suggested next M-stage**: defer until source-design PR.

## Priority 6: Surface Worker secondary diagnostics

**Why**: Secondary diagnostics exist for VIX/Gold/DXY/US10Y/SPX, but are intentionally isolated from the frontend. Surfacing them would improve data confidence display, not core scoring.  
**Estimated PR scope**: medium/large  
**Dependencies**: explicit design decision to fetch `/market.secondary-preview.json` or summarize it through an existing data artifact.  
**Suggested next M-stage**: defer unless data-confidence UX becomes priority.

## 5. Honest Limitations

- This was a static repository audit. I did not run a browser session, so I did not verify actual pixel-level visibility, collapsed-detail behavior, or whether a user's browser cache still serves old modules.
- I did not fetch live Worker endpoints. Worker schema conclusions come from checked-in worker code, README, and local `realtime/market.json`.
- I did not execute the Daily pipeline, so I did not verify whether a fresh run would rewrite `assetReturnMap` differently from the checked-in state.
- I could identify stale copy and under-consumed data, but I did not prove every user-visible `--` disappears after JS execution. The static HTML intentionally starts with many placeholders that are later filled.
- If a user reports a specific card still showing `--` after reload, the next diagnostic should run the site in a real browser with cache disabled and inspect the DOM after `main()` completes.
