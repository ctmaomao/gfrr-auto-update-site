# M-47 ISM PMI Growth Layer

M-47 adds ISM Manufacturing PMI to the consumer / growth macro-driver layer and upgrades the consumer data contract to the current table format.

## Scope

- Add FRED:NAPM to `resolveConsumerSentiment`.
- Add `ismManufacturingPmi`, `ismManufacturingPmi3mChange`, and `ismPmiRegime` to the `macroDrivers.consumer` pipeline shape.
- Update `macroDrivers.consumer.source` from `FRED:UMCSENT` to `FRED:UMCSENT; FRED:NAPM`.
- Surface one conditional PMI evidence line in `pressure-consumer`.
- Surface one conditional PMI evidence line in `driver-growth`.
- Upgrade `stagflation_pressure` cross-validation from hardcoded missing PMI evidence to conditional supporting / contradicting / missing classification.
- Add `check:consumer-pmi` and include it in `check:all`.
- Bump the frontend cache version to `28.0M-47V`.

## Source Choice

FRED:NAPM is the ISM Report On Business PMI Composite Index for manufacturing. It is one of the most widely cited monthly leading indicators for recession, stagflation, and growth-cycle turning points.

M-47 intentionally adds only NAPM. ISM Services PMI is deferred because the correct FRED series identifier needs a separate source review. Employment indicators such as PAYEMS are also deferred to a future growth-layer expansion.

## Frequency And Lookback

NAPM is monthly, like UMCSENT. M-47 uses `fetchFredSeries('NAPM', 420)` so the resolver has roughly 14 months of data, matching the existing UMCSENT window and leaving enough history for slower monthly refresh cadence.

The 3-month PMI change uses `findValueAgo(rows, 90)`, matching the existing consumer-change pattern without adding a new resolver helper.

## Cross-Validation Upgrade

Before M-47, `buildStagflationNarrative` always treated PMI as missing:

```javascript
evidence('pmi', null, 'PMI 与就业广度未接入')
```

M-47 changes that to dynamic classification:

- `ismManufacturingPmi < 45`: supporting evidence for deep contraction.
- `45 <= ismManufacturingPmi < 50`: supporting evidence for manufacturing contraction.
- `50 <= ismManufacturingPmi <= 55`: neutral; no evidence is added.
- `ismManufacturingPmi > 55`: contradicting evidence against near-term stagflation.
- `null`: missing evidence remains.

Only the `stagflation_pressure` narrative changes. The other six cross-validation narratives stay unchanged.

## DATA_CONTRACT Upgrade

M-47 upgrades the `macroDrivers.consumer` section from the older v28.0I-4A bullet list to the same table format used by the M-42 Fed liquidity and M-46 credit contracts.

The `source` constraint changes from single-source `FRED:UMCSENT` to multi-source `FRED:UMCSENT; FRED:NAPM`. The new PMI fields are optional to preserve compatibility with committed snapshots before the next Daily pipeline refresh.

## Contract Boundary

`macroDrivers.consumer` remains audit-only / display-only. PMI does not enter `values.*`, scoring, `decisionModel`, `executionLock`, or `positionGuidance`.

M-47 does not regenerate `data/radar-data.json`; committed data remains unchanged. The new PMI values populate on the next scheduled `daily-pipeline.yml` run with live FRED data. The new checker emits soft warnings until that refresh lands.

## Related Rungs

- M-41: `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- M-42: `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- M-43: `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- M-46: `docs/M-46_SLOOS_BANK_LOAN_STANDARDS.md`
