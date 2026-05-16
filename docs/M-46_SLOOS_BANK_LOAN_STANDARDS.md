# M-46 SLOOS Bank Loan Standards

M-46 adds SLOOS bank loan standards to the credit macro-driver layer and formalizes the first `macroDrivers.credit` contract.

## Scope

- Add FRED:DRTSCILM to `resolveCredit` for domestic banks tightening C&I loan standards to large and medium market firms.
- Add FRED:DRTSCIS to `resolveCredit` for domestic banks tightening C&I loan standards to small firms.
- Add SLOOS fields to the `macroDrivers.credit` return shape and fallback shape.
- Surface one SLOOS large-firm evidence line in `driver-liquidity`.
- Surface one SLOOS large-firm evidence line in `engine-financial-fragility`.
- Upgrade `liquidity_tightening` cross-validation from hardcoded missing SLOOS evidence to conditional supporting / contradicting / missing classification.
- Add `check:macro-drivers-credit-sloos` and include it in `check:all`.
- Bump the frontend cache version to `28.0M-46V`.

## Source Choice

DRTSCILM and DRTSCIS come from the same Senior Loan Officer Opinion Survey (SLOOS) quarterly release. Using both keeps the credit layer able to compare large / medium firm tightening with small firm tightening.

That distinction matters because small-firm tightening can lead broad credit-cycle stress, while large-firm tightening confirms that bank lending restraint has spread to bigger borrowers.

DRTSCLCC, the SLOOS credit-card series, is intentionally deferred. It belongs more naturally in a future `macroDrivers.consumer` expansion rather than this first formal credit-environment contract.

## Frequency And Lookback

SLOOS is a quarterly slow variable, so M-46 uses `fetchFredSeries(..., 180)` instead of the shorter daily-series windows. The 180-day lookback gives the pipeline enough room to capture both the latest survey and the prior quarter.

QoQ changes use `findValueAgo(rows, 90)`, matching the approximate quarter-to-quarter interval without adding a new resolver path.

## Cross-Validation Upgrade

Before M-46, `buildLiquidityTighteningNarrative` always treated SLOOS as missing:

```javascript
evidence('sloos', null, 'SLOOS / 银行贷款标准未接入')
```

M-46 changes that to dynamic classification:

- `sloosTighteningLargeFirms >= 20`: supporting evidence that bank loan conditions are materially tightening.
- `0 <= sloosTighteningLargeFirms < 20`: supporting evidence with mild-tightening language.
- `sloosTighteningLargeFirms < 0`: contradicting evidence against a liquidity-tightening narrative.
- `null`: missing evidence remains.

Only the `liquidity_tightening` narrative changes. The other six cross-validation narratives stay unchanged.

## Contract Boundary

`macroDrivers.credit` remains audit-only / display-only. SLOOS does not enter `values.*`, scoring, `decisionModel`, `executionLock`, or `positionGuidance`.

M-46 does not regenerate `data/radar-data.json`; committed data remains unchanged. The new SLOOS values populate on the next scheduled `daily-pipeline.yml` run with live FRED data. The new checker emits soft warnings until that refresh lands.

## Related Rungs

- M-41: `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- M-42: `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- M-43: `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- M-45: `docs/M-45_FRONTEND_FIELD_SYNCHRONIZATION.md`
