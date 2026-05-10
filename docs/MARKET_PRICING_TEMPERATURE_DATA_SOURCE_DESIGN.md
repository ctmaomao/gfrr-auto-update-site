# Market Pricing Temperature Data Source Design - v28.0M-5

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

## 14. v28.0M-6 Scaffold Status

v28.0M-6 creates the first market pricing history contract scaffold.

Implemented boundary:

- `data/market-pricing-history.json` exists as scaffold only.
- The scaffold contains QQQ, NDX, IXIC, and SPX candidates.
- QQQ / NDX / IXIC remain prioritized before SPX.
- SPX is fallback candidate only and must not be labeled as Nasdaq / QQQ temperature.
- All `records` arrays are empty.
- No data fetch is implemented.
- No MA60, standard deviation, z-score, band, or temperature calculation is implemented.
- `scripts/check-market-pricing-history.mjs` validates the scaffold contract.
- `npm run check:market-pricing-history` is wired into `npm run check:all`.
- Market Pricing Temperature remains waiting-for-history.

Next recommended step:

```text
v28.0M-7 Market Pricing Source Adapter Dry-Run Design - No Production Data Write
```

## 15. v28.0M-7 Source Adapter Dry-Run Status

v28.0M-7 adds the first local-only source adapter dry-run scaffold.

Implemented boundary:

- `scripts/market-pricing/source-adapter-dry-run.mjs` generates a dry-run adapter report only.
- Default report output is `manual-artifacts/market-pricing/source-adapter-dry-run-latest.json`.
- The report is manual artifact output, not production data.
- No live source fetch is implemented.
- No production data write is implemented.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or temperature calculation is implemented.
- Candidate source roles are documented for QQQ / NDX / IXIC / SPX.
- QQQ remains the preferred first candidate.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- `scripts/check-market-pricing-source-adapter-dry-run.mjs` validates static no-network boundaries and runtime dry-run report boundaries.
- `npm run check:market-pricing-source-adapter-dry-run` is wired into `npm run check:all`.

Next recommended step:

```text
v28.0M-8 Market Pricing Artifact-Only Fetch Design - No Production Data Write
```

## 16. v28.0M-8 Artifact-Only Fetch Design Status

v28.0M-8 documents the future artifact-only market pricing fetch path.

Implemented boundary:

- `docs/MARKET_PRICING_ARTIFACT_ONLY_FETCH_DESIGN.md` defines the artifact-only fetch architecture and source-compliance boundaries.
- No live fetch is implemented.
- No production data write is implemented.
- Source selection is still pending.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or temperature calculation is implemented.
- `scripts/check-market-pricing-artifact-fetch-design.mjs` validates the design document, protected scaffold state, and no committed market-pricing manual artifacts.
- `npm run check:market-pricing-artifact-fetch-design` is wired into `npm run check:all`.
- Market Pricing Temperature remains waiting-for-history.

Next recommended step:

```text
v28.0M-9 Market Pricing Artifact-Only Fetch Scaffold - No Production Data Write
```

## 17. v28.0M-9 Artifact Fetch Scaffold Status

v28.0M-9 establishes a local scaffold only for the future artifact fetch path.

Implemented boundary:

- `scripts/market-pricing/artifact-fetch-scaffold.mjs` creates an ignored scaffold report under `manual-artifacts/market-pricing/`.
- The command does not call Stooq, Yahoo-style sources, FRED, paid providers, or any other live source.
- `--allow-network` is parsed only so the report can record and reject the request in this version.
- Source selection remains pending.
- QQQ remains the preferred primary candidate.
- NDX and IXIC remain index candidates.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or market temperature calculation is implemented.
- `scripts/check-market-pricing-artifact-fetch-scaffold.mjs` validates the scaffold report contract and no-production-write boundary.
- `npm run check:market-pricing-artifact-fetch-scaffold` is wired into `npm run check:all`.

## 18. v28.0M-10 Artifact Sanitizer Scaffold Status

v28.0M-10 establishes a local sanitizer scaffold before any live source implementation or production history write.

Implemented boundary:

- `scripts/market-pricing/artifact-sanitizer-scaffold.mjs` validates scaffold artifact boundaries only.
- Valid scaffold fixtures can pass only with `readyForProductionWrite=false`.
- Invalid fixtures verify rejection of sensitive fields, source URL fields, calculation fields, trading advice fields, and production-write flags.
- Future records must pass a separately approved sanitizer before any history write is considered.
- Source selection remains pending.
- QQQ remains the preferred primary candidate.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or market temperature calculation is implemented.
- `npm run check:market-pricing-artifact-sanitizer-scaffold` is wired into `npm run check:all`.

## 19. v28.0M-11 Real-Record Contract Design Status

v28.0M-11 defines the future weekly record contract before any real source implementation.

Implemented boundary:

- Future records require at least 60 validated weekly observations before any calculation review.
- Source selection remains pending.
- QQQ adjusted close remains preferred if an approved source can provide it.
- NDX and IXIC remain index candidates.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- Future records must pass sanitizer and separate history-write approval before production history changes.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or market temperature calculation is implemented in M-11.
- `npm run check:market-pricing-real-record-contract-design` is wired into `npm run check:all`.

## 20. v28.0M-12 Real-Record Sanitizer Scaffold Status

v28.0M-12 adds synthetic fixture validation for future real-record-like artifacts.

Implemented boundary:

- Structurally valid synthetic records do not activate Market Pricing Temperature.
- `recordsAcceptedForHistory` remains `0` and `readyForProductionWrite` remains `false`.
- At least 60 validated production weekly observations and separate calculation approval are still required before any market temperature calculation review.
- Source selection remains pending.
- QQQ adjusted close remains the preferred future candidate if a compliant source is approved.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- `data/market-pricing-history.json` remains scaffold-only and records remain empty.
- No MA60, standard deviation, z-score, band, or market temperature calculation is implemented in M-12.
- `npm run check:market-pricing-real-record-sanitizer-scaffold` is wired into `npm run check:all`.

## 21. v28.0M-13 Source Selection Review Status

v28.0M-13 reviews source candidates without activating Market Pricing Temperature.

Implemented boundary:

- Source review does not activate Market Pricing Temperature.
- At least 60 validated weekly observations are still required before any calculation review.
- QQQ adjustedClose remains preferred only after source approval.
- Yahoo-style and Stooq / public CSV remain future proof-of-source candidates.
- FRED remains an official-series candidate only, not an automatic QQQ adjusted-close source.
- SPX remains fallback candidate only and must not be treated as Nasdaq / QQQ temperature.
- No production source is selected.
- No live fetch, production write, or calculation is approved.

## 22. v28.0M-14 Proof-of-Source Design Status

v28.0M-14 adds source-specific proof-of-source design without activating Market Pricing Temperature.

Implemented boundary:

- Primary proof target is QQQ, but QQQ target metadata is not a production record.
- QQQ adjustedClose remains preferred only after source approval.
- Stooq / public CSV is the first proof-of-source design candidate only, not a production source.
- Yahoo-style remains a comparison candidate.
- FRED remains an official-series comparison candidate only.
- SPX remains fallback-only and must not be treated as Nasdaq / QQQ temperature.
- At least 60 validated weekly observations remain required before calculation review.
- No live fetch, production write, history write, or calculation is approved.

## 23. v28.0M-15 Source-Specific Artifact Fetch Scaffold Status

v28.0M-15 does not activate Market Pricing Temperature.

Implemented boundary:

- The source-specific scaffold keeps network disabled.
- QQQ target metadata is not price history.
- Stooq / public CSV remains a design candidate only.
- No 60-week history exists.
- `data/market-pricing-history.json` remains scaffold-only and empty.
- SPX remains fallback-only and must not be treated as Nasdaq / QQQ temperature.
- No live fetch, source approval, production write, history write, or calculation is approved.
