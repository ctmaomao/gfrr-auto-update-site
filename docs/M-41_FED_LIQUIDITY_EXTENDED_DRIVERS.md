# M-41 Fed Liquidity Extended Drivers

M-41 extends the existing Fed liquidity daily-pipeline layer with two additional FRED series:

- `DFF` — Effective Federal Funds Rate, daily percentage series.
- `SOFR` — Secured Overnight Financing Rate, business-daily percentage series.

The existing series remain unchanged:

- `WALCL` — Federal Reserve total assets, weekly, millions of dollars.
- `RRPONTSYD` — ON RRP balance, daily, billions of dollars.

## Scope

M-41 changes only the data pipeline reading layer, the Macro Risk Overview evidence surface, and documentation/checker contracts.

It does not change:

- scoring
- `decisionModel`
- `executionLock`
- `positionGuidance`
- Worker runtime
- workflows
- `data/*.json`

`data/radar-data.json` is intentionally not regenerated in this PR. `effectiveFedFundsRate`, `sofr`, and their `sourceStatus` keys will appear after the next scheduled `daily-pipeline.yml` run.

## Evidence Surface

B3 policy evidence now can show:

- `联邦基金利率 X.XX% — 政策利率`
- `SOFR X.XX% — 隔夜担保融资`

B4 financial fragility evidence now can show:

- `SOFR X.XX% — 隔夜担保融资压力`

These are direct Fed/funding metrics added to a surface that previously relied mostly on proxies such as ON RRP, 10Y yield, DXY, HY OAS, VIX, and IG/HY ratio.

## Formal Contract

M-41 adds the first formal `macroDrivers.fedLiquidity` contract to `docs/DATA_CONTRACT.md`.

The contract marks `effectiveFedFundsRate` and `sofr` as optional so pre-M-41 snapshots remain valid. `sourceStatus` records per-series status as `live`, `fallback`, or `missing`.

## RESBALNS Deferred

`RESBALNS` is deliberately deferred to M-42. It is also reported in millions of dollars like `WALCL`, so adding it safely requires explicit naming and unit distinction in the data contract and UI evidence copy.

## M-40 Skip Context

M-40 was skipped. Its planned interpretation-layer reason-field cleanup was reviewed as audit scanner false positives:

- Chinese em-dash punctuation was misread as placeholder content.
- English count labels such as `fallback 0` were real template output.
- Phrases such as `0 个 check 数据不足` were descriptive count output, not missing data.

No M-40 PR exists. M-41 is the next implemented M-series rung after M-39.
