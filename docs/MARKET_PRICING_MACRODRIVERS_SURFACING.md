# Market Pricing MacroDrivers Surfacing (v28.0M-29)

## Purpose

v28.0M-29 surfaces existing `data/radar-data.json` macroDrivers fields into first-fold editorial modules that previously still described those fields as missing or waiting.

数据来源未变。本 PR 仅扩展 render 层使用已有 `data/radar-data.json` 字段。It does not change data, add sources, calculate new indicators, alter scoring, or affect decision / execution / position logic.

## Backend Field to Frontend Mapping

| Modification | Backend field(s) | Frontend display |
|---|---|---|
| B1 信用指标补全 | `macroDrivers.credit.hyOas`, `macroDrivers.credit.igOas`, `macroDrivers.credit.igHyRatio` | The liquidity / credit evidence line now shows HY OAS, IG OAS, and IG/HY ratio together. |
| B2 流动性结构补全 | `macroDrivers.curve.t10y2y`, `macroDrivers.fedLiquidity.onRrp`, `macroDrivers.fedLiquidity.walcl4wChange`, `macroDrivers.activeSignals` | The liquidity driver now shows 10Y-2Y spread, ON RRP balance, Fed balance sheet four-week change, and the ON RRP critical annotation when present. |
| B3 政策代理信号 | `macroDrivers.fedLiquidity.onRrp`, `displayInputsBaseline.us10y`, `displayInputsBaseline.dxy` | The policy driver moves from pure waiting state to `基于代理信号观察`, clearly labeling ON RRP / long-end yield / dollar strength as proxies rather than official Fed expectation data. |
| B4 金融脆弱性补强 | `macroDrivers.fedLiquidity.onRrp`, `macroDrivers.credit.igHyRatio`, `displayInputsBaseline.hyOas`, `displayInputsBaseline.vix` | The financial fragility engine now includes ON RRP and IG/HY ratio as supporting evidence while keeping credit / volatility counter-evidence visible. |

## Missing Evidence Discipline

The missing-evidence lists now distinguish between:

- Data that already exists and should be displayed.
- Data that remains genuinely absent, such as SLOOS, repo stress, bank-specific stress, private credit, CRE, CDX, dot plot, official Fed expectation statements, market-implied rate path, and policy communication text analysis.

This removes false waiting-state copy for ON RRP, term spread, IG OAS, and IG/HY ratio while preserving honest gaps for data that is still unavailable.

## Rendering Boundaries

M-29 is render-layer only:

- No `data/*.json` writes.
- No new data source.
- No new frontend fetch.
- No workflow change.
- No External AI change.
- No scoring / decision / execution / position logic change.
- No new MA / standard deviation / z-score calculation.

The displayed values are read directly from existing JSON fields and formatted for editorial readability.

## Maintenance Notes

If a future data refresh removes one of the macroDrivers fields, the affected card should degrade to the existing conservative wording rather than fabricate values. New direct policy data, credit-default-swap data, or bank-stress data should arrive through a separate reviewed data/source PR before the missing-evidence lists are reduced again.
