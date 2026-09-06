# Market Pricing Temperature Data Source Design - v28.0M-5

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This document is design only.

- No data fetch.
- No calculation.
- No production data change.
- No frontend change.
- No workflow change.
- No provider call.
- Market Pricing Temperature remains waiting-for-history.

## 2. Purpose

Market Pricing Temperature is a lagging market pricing deviation layer. It is intended to identify whether risk assets are cold, normal, hot, overheated, or panic-like relative to a medium-term trend.

It is not a buy/sell system. It does not predict tops or bottoms. It must not justify long-term inverse ETF holding.

Future UI-safe wording:

```text
该指标为滞后型市场定价偏离指标，用于识别市场冷热和风险资产定价状态，不构成单独买卖信号。
```

## 3. Current Data Availability

Read-only inspection in v28.0M-5 found:

| Item | Current status | Evidence |
| --- | --- | --- |
| Nasdaq Composite | not found | No `nasdaq` / `IXIC` equivalent found in `data/radar-data.json`, `data/radar-history.json`, or `data/radar-history-full.json`. |
| Nasdaq 100 / NDX | not found | No `ndx` field found in current data or history files. |
| QQQ | not found | No `qqq` field found in current data or history files. |
| S&P 500 / SPX | available | `data/radar-data.json.displayInputsBaseline.spx`; SPX also exists as secondary diagnostics documentation/source path. |
| Russell 2000 | not found | No `russell` / `rut` field found in current data or history files. |
| VIX | available | `data/radar-data.json.displayInputsBaseline.vix`; also present in history-full records. |
| HY OAS | available | `data/radar-data.json.displayInputsBaseline.hyOas`; also present in history-full records. |
| US10Y | available | `data/radar-data.json.displayInputsBaseline.us10y`; also present in history-full records. |
| DXY | available | `data/radar-data.json.displayInputsBaseline.dxy`; also present in history-full records. |
| Brent | available | `data/radar-data.json.displayInputsBaseline.brent`; also present in history-full records. |
| Gold | available | `data/radar-data.json.displayInputsBaseline.gold`. |
| Historical daily data | partially available | `data/radar-history.json` currently has 51 rows from 2026-03-19 to 2026-05-09. |
| Historical weekly data | not found | No dedicated weekly market pricing history file exists. |
| At least 60 weekly observations | not available | Current history is not a 60-week series and does not include Nasdaq / QQQ. |

Decision:

```text
市场定价温度计 v1 should remain in waiting-for-history state until historical weekly data is connected.
```

## 4. First Asset Priority

Future source selection should prioritize:

1. QQQ, if a stable historical adjusted close source can be connected.
2. Nasdaq 100 / NDX, if available through a reliable source.
3. Nasdaq Composite, if easier from FRED or another stable source.
4. S&P 500 as temporary fallback only if Nasdaq / QQQ is not available.

This PR does not choose a source. Final source selection requires a future implementation PR.

Selection criteria:

- Source stability.
- At least 60 weekly observations.
- Licensing and public access.
- Update cadence.
- Field consistency.
- Clear fallback behavior.
- Adjusted close availability, especially for ETF assets.

## 5. Candidate Data Sources

### A. Stooq

Potential use:

- QQQ daily historical data if available.
- SPY / SPX-like fallbacks.
- Public CSV-like access.

Risks:

- Symbol stability.
- Adjusted-close availability.
- Rate or format changes.
- Source reliability.

### B. Yahoo Finance style source

Potential use:

- QQQ / ^NDX / ^IXIC / SPY.
- Adjusted close may be available.

Risks:

- Unofficial endpoint.
- Query fragility.
- Throttling or format changes.
- Must be guarded by validation.

### C. FRED

Potential use:

- S&P 500 via `SP500`.
- VIX via `VIXCLS`.
- Rates, credit, and macro series.

Limits:

- May not provide Nasdaq / QQQ directly.
- Better for macro and index levels than ETF adjusted close.

### D. Existing project data

Potential use:

- `displayInputsBaseline.spx`.
- Existing radar history.

Limits:

- Current history is not enough for 60 weekly observations.
- Current history does not include Nasdaq / QQQ.
- Current history is not a dedicated weekly adjusted-close series.

### E. Future paid / licensed source

Potential use:

- Reliable adjusted close.
- Broad asset coverage.
- More stable schema and service terms.

This is not required now.

## 6. Proposed Storage Contract

Future implementation may add a dedicated history file such as:

```text
data/market-pricing-history.json
```

This PR does not create that file.

Proposed shape:

```json
{
  "schemaVersion": "v28.0M-market-pricing-history-1",
  "updatedAt": "...",
  "assets": {
    "qqq": {
      "symbol": "QQQ",
      "labelZh": "纳斯达克100 ETF",
      "source": "stooq_or_future_source",
      "currency": "USD",
      "frequency": "weekly",
      "records": [
        {
          "date": "YYYY-MM-DD",
          "close": 0,
          "adjustedClose": 0,
          "sourceStatus": "ok"
        }
      ],
      "coverage": {
        "weeklyRows": 0,
        "hasAtLeast60Weeks": false,
        "oldestDate": null,
        "latestDate": null
      }
    }
  }
}
```

Contract notes:

- `records` must not contain fabricated observations.
- `adjustedClose` must not be silently invented when unavailable.
- A fallback asset must be clearly labeled as fallback.
- Source status must remain visible to validators and operators.

## 7. Proposed Derived Output Contract

Future implementation may add a derived layer such as:

```text
marketPricingTemperatureLayer
```

This PR does not implement or write this layer.

Proposed shape:

```json
{
  "schemaVersion": "v28.0M-market-pricing-temperature-1",
  "status": "waiting_for_history",
  "updatedAt": null,
  "primaryAsset": "qqq",
  "temperature": "等待历史周线数据接入",
  "zScore": null,
  "ma60": null,
  "upperBand": null,
  "lowerBand": null,
  "deviationPct": null,
  "evidence": [],
  "dataGaps": [],
  "boundaries": {
    "displayOnly": true,
    "notInvestmentAdvice": true,
    "affectsScoring": false,
    "affectsDecisionModel": false,
    "affectsExecutionLock": false,
    "affectsPositionGuidance": false
  }
}
```

Boundary:

- No calculation in this PR.
- No production write in this PR.
- The layer remains display-only when implemented.

## 8. Future Calculation Design

Future calculation should:

- Use weekly close or adjusted close.
- Require at least 60 weekly observations.
- Prefer adjusted close for ETF assets.
- Compute MA60 as a 60-week moving average.
- Compute standard deviation as rolling 60-week standard deviation.
- Prefer z-score based on percentage or log deviation rather than raw index-point deviation:
  - `log(price / MA60)`
  - or percentage deviation from MA60.

Future temperature bands:

| Range | UI label |
| --- | --- |
| below -2σ | 极冷 / 恐慌区 |
| -2σ to -1σ | 偏冷 |
| -1σ to +1σ | 正常 |
| +1σ to +1.5σ | 偏热 |
| +1.5σ to +2σ | 过热 |
| above +2σ | 极热 |

Warnings:

- +2σ is not a top.
- -2σ is not a bottom.
- MA60 is not a buy point.
- z-score is not a short signal.
- The indicator cannot justify long-term inverse ETF holding.

## 9. Future Implementation Phases

Recommended staged plan:

- M-6: add market pricing history scaffold and validator, with no live fetch.
- M-7: implement one source fetch for QQQ / Nasdaq candidate as artifact-only or local dry-run first, with no production frontend calculation.
- M-8: write validated weekly history data, while keeping frontend waiting until enough history exists.
- M-9: implement calculation layer as display-only, with no scoring impact.
- M-10: integrate into asset pricing mismatch engine and cross-validation, still without scoring or trading advice unless separately approved.

## 10. Failure and Fallback Policy

- If fewer than 60 weekly observations exist, status must be `waiting_for_history`.
- If source fetch fails, keep prior valid history and mark `sourceStatus`.
- If data is stale, lower confidence.
- If adjusted close is unavailable, do not silently substitute close without labeling the substitution.
- If only S&P 500 is available, label it as fallback and do not claim Nasdaq temperature.
- Do not invent missing observations.
- Do not interpolate missing weeks unless explicitly approved later.

## 11. UI Wording

Future UI copy should stay calm and explicit:

```text
市场定价温度计
状态：等待历史周线数据接入
当前结论：暂无法判断
该指标为滞后型市场定价偏离指标，用于识别市场冷热和风险资产定价状态，不构成单独买卖信号。
+2σ 不是顶部，-2σ 不是底部。
市场偏热不等于可以长期持有反向 ETF。
```

## 12. No-go Rules

- No fake Nasdaq / QQQ / MA60 / z-score values.
- No calculation without at least 60 weekly observations.
- No scoring / decision / execution / position impact in the first implementation.
- No provider or DeepSeek use.
- No automatic trading interpretation.
- No long-term inverse ETF recommendation.
- No Global Risk Heatmap layout changes.

## 13. Current Decision

M-5 completes data-source design only.

Next implementation should not fetch data unless explicitly approved.

Recommended next step:

```text
v28.0M-6 Market Pricing History Contract Scaffold - No Fetch / No Calculation
```

## 14. v28.0M-6 → M-16 phase status (compact)

> Folded from the original per-phase §14–§25 status sections (B-consolidated; full phase tables remain in git history). Per the STATUS banner, the shared "scaffold-only / records empty / waiting-for-history / no MA60 / source-selection-pending" framing those sections repeated is now superseded (history live, M-27). **The `check:market-pricing-*` names below are phase-history guards — not necessarily current `check:all` membership** (the Market Pricing suite evolved). Still-true rules the boilerplate repeated: **SPX is fallback-candidate-only and must never be labeled Nasdaq / QQQ temperature**; **≥60 validated weekly observations are required before an asset's metrics activate** (degradation rule); the layer is **display-only / no-impact** (no scoring / decision / execution / position); and **Market Pricing belongs to the Daily / history layer, not a realtime Worker primary fetch** (M-15A). Each phase also has its own doc and a SYSTEM_UPGRADE_PLAN M-series bullet.

| Phase | Added / recorded | Historical guard/checker | Load-bearing delta + constraints | Next |
|---|---|---|---|---|
| M-6 | history contract scaffold `data/market-pricing-history.json` (QQQ/NDX/IXIC + SPX candidates, empty records) | `check:market-pricing-history` | QQQ/NDX/IXIC prioritized over SPX; SPX fallback-only | M-7 |
| M-7 | source-adapter dry-run scaffold `scripts/market-pricing/source-adapter-dry-run.mjs` → ignored `manual-artifacts/market-pricing/source-adapter-dry-run-latest.json` | `check:market-pricing-source-adapter-dry-run` | candidate source roles for QQQ/NDX/IXIC/SPX; QQQ preferred first; no live fetch | M-8 |
| M-8 | artifact-only fetch design [`MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md`](MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md) | `check:market-pricing-artifact-fetch-design` | future artifact-only fetch architecture + source-compliance boundaries; source selection pending | M-9 |
| M-9 | artifact-fetch scaffold `scripts/market-pricing/artifact-fetch-scaffold.mjs` → ignored `manual-artifacts/market-pricing/` report | `check:market-pricing-artifact-fetch-scaffold` | `--allow-network` parsed only to record + reject; no live source call | M-10 |
| M-10 | artifact-sanitizer scaffold `scripts/market-pricing/artifact-sanitizer-scaffold.mjs` | `check:market-pricing-artifact-sanitizer-scaffold` | valid fixtures pass only with `readyForProductionWrite=false`; rejects sensitive / source-URL / calculation / trading-advice / production-write fields | M-11 |
| M-11 | real-record contract design [`MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md`](MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md) | `check:market-pricing-real-record-contract-design` | future records require ≥60 validated weekly observations before calculation review; QQQ adjustedClose preferred if an approved source provides it; NDX/IXIC index candidates | M-12 |
| M-12 | real-record sanitizer scaffold (synthetic fixtures) | `check:market-pricing-real-record-sanitizer-scaffold` | synthetic records keep `recordsAcceptedForHistory=0` / `readyForProductionWrite=false`; ≥60 validated production weeks + separate calculation approval still required | M-13 |
| M-13 | source selection review [`MARKET_PRICING_SOURCE_SELECTION_REVIEW.md`](MARKET_PRICING_SOURCE_SELECTION_REVIEW.md) | — | QQQ adjustedClose preferred only after source approval; Yahoo-style + Stooq/public CSV = future proof-of-source candidates; FRED = official-series candidate only (not auto QQQ adjusted-close); no production source selected | M-14 |
| M-14 | proof-of-source design [`MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md`](MARKET_PRICING_PROOF_OF_SOURCE_DESIGN.md) | — | primary proof target QQQ (target metadata ≠ production record); Stooq/public CSV = first proof-of-source design candidate; Yahoo-style + FRED = comparison candidates; SPX fallback-only | M-15 |
| M-15 | source-specific artifact fetch scaffold | — | network disabled; QQQ target metadata ≠ price history; Stooq/public CSV = design candidate only; no 60-week history yet | M-15A |
| M-15A | unified data pipeline architecture placement [`UNIFIED_DATA_PIPELINE_ARCHITECTURE.md`](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md) | — | Market Pricing → **Daily/history layer, not a realtime Worker primary fetch**; realtime may only cross-validate / provide context if separately approved; GitHub Actions backup validation may verify/audit but **must not bypass sanitizer**; market-pricing artifacts stay in the artifact-sanitizer layer until an approved writer exists | M-16 |
| M-16 | network gate design [`MARKET_PRICING_NETWORK_GATE_DESIGN.md`](MARKET_PRICING_NETWORK_GATE_DESIGN.md) | — | `networkAllowed=false` | M-17 |
