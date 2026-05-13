# Market Pricing First Fold and Cross Validation (v28.0M-28)

## Purpose

v28.0M-28 connects the M-27 Market Pricing Temperature metrics to the editorial first-fold modules and upgrades cross-validation from four curated narratives into a seven-narrative evidence matrix.

This is frontend display-layer work only. It reads existing local data already loaded by the page:

- `data/radar-data.json`
- `data/world-order-stress.json`
- `data/market-pricing-metrics.json`

It does not modify data, add data sources, alter scoring, change decision / execution / position logic, or calculate MA60 / standard deviation / z-score in the frontend.

## First-Fold Metric Integration

When `data/market-pricing-metrics.json` is available, these modules now use the latest QQQ metric record:

- 今日总判断 (`#homepage-today-judgment`) shows QQQ z-score and bucket as supporting evidence.
- 信号分层 (`#homepage-signal-layers`) treats the QQQ bucket as verified pricing evidence instead of a waiting gap.
- 风险引擎 (`#homepage-risk-engines`) shows current close, 60-week mean, 60-week standard deviation, z-score, and bucket label for asset-pricing mismatch.
- 交叉验证 (`#homepage-cross-validation`) uses the QQQ z-score in the overheat confirmation narrative.

If metrics are unavailable, the modules keep the previous waiting-state copy. The fallback is intentional so a missing metrics file does not break the homepage.

## Seven-Narrative Matrix

`buildCrossValidationMatrix(data, worldOrderStressData, marketPricingMetricsData)` returns seven structured narratives:

| Narrative | Main sources | Evidence rules |
|---|---|---|
| 能源冲击 | `displayInputsBaseline.brent`, `transmissionChain.leadShock`, `dailyBrief.pressureSources` | Brent shock level and explicit oil/war lead shock support the narrative; missing fresh energy confirmation remains visible. |
| 滞涨压力 | `macroDrivers.consumer`, `macroDrivers.curve`, `displayInputsBaseline.us10y`, `displayInputsBaseline.brent` | Consumer stress, positive yields, and high Brent support stagflation pressure. |
| 风险资产错配 | `macroDrivers.activeSignals`, `macroDrivers.gatingEvaluation`, `displayInputsBaseline.vix`, `market-pricing metrics` | Structural red gates, low VIX, and hot QQQ pricing identify mismatch between risk assets and macro pressure. |
| 过热确认 | `market-pricing metrics`, `macroDrivers.credit.hyOas`, `displayInputsBaseline.vix` | QQQ z-score >= +2 is strong overheat support. Calm credit or VIX can be contradicting evidence. |
| 信用利差预警 | `macroDrivers.credit.hyOas`, `igOas`, `igHyRatio`, `divergenceLayer.checks` | HY OAS > 5.0, IG OAS > 1.5, or IG/HY ratio < 0.25 support warning. HY OAS < 3.5 while QQQ z-score >= 1.5 is a contradiction: risk assets are hot while credit is calm. |
| 流动性收紧确认 | `macroDrivers.fedLiquidity`, `macroDrivers.curve`, `displayInputsBaseline.dxy` | ON RRP < $200B, DXY > 105, T10Y2Y > +0.5, or WALCL 4-week change < -$50B support tightening. ON RRP > $1T or WALCL +$50B contradict it. |
| 世界秩序压力交叉 | `data/world-order-stress.json`, `data/radar-data.json.score` | World-order score >= 50 with fresh/partial data and confidence >= 50% supports cross-confirmation. Low confidence, stale / not configured sources, or high geopolitical pressure without financial transmission remain visible as gaps or contradictions. |

Each narrative separates:

- `supportingEvidence`
- `missingEvidence`
- `contradictingEvidence`
- `assessment`
- `interpretation`

Allowed assessments are:

- `strong_confirmation`
- `partial_confirmation`
- `insufficient_data`
- `contradiction`

## Composite Consistency Score

The display score is:

```text
score = 100 * (strongConfirmations + 0.5 * partialConfirmations) / totalNarratives
```

For M-28, `totalNarratives = 7`. The score is rounded to the nearest integer.

State labels:

- `score >= 70`: 高度一致
- `40 <= score < 70`: 中等一致
- `20 <= score < 40`: 证据混杂
- `score < 20`: 证据严重不足或矛盾

Contradiction and insufficient-data narratives count as 0 in the score, but their evidence remains visible in the card.

## Graceful Degradation

If `data/market-pricing-metrics.json` is unavailable, malformed, or empty:

- The four first-fold modules retain the earlier waiting-state copy.
- The cross-validation matrix still renders using radar and world-order data.
- Market-pricing evidence appears as missing evidence rather than fabricated data.

## What This Step Does Not Do

- Does not change scoring.
- Does not change decision, execution, or position logic.
- Does not write or modify `data/*.json`.
- Does not add external data sources.
- Does not add network fetches.
- Does not calculate MA60, standard deviation, or z-score in the frontend.
- Does not cap z-score values.
- Does not change workflows or External AI behavior.

M-26 remains the source of truth for MA60 / sample standard deviation / z-score calculations. M-28 only consumes the committed metrics file in editorial display modules.
