# M-48 NFCI Bank Stress Index

M-48 adds the Chicago Fed National Financial Conditions Index (`FRED:NFCI`) to
the credit macro-driver layer. The field is audit-only / display-only and does
not affect `values.*`, scoring, `decisionModel`, `executionLock`, or
`positionGuidance`.

## Source Choice

`NFCI` is the main Chicago Fed weekly financial conditions index. It is chosen
before KCFSI because it is a broadly cited national financial conditions series
with a long history and a clear zero-axis interpretation.

Deferred sources:

- KCFSI remains a future candidate.
- NFCI sub-indices are not added in M-48.
- ANFCI is not added in M-48.

## Pipeline Shape

`resolveCredit` now pulls four FRED series in total:

- `BAMLC0A0CM` for IG OAS
- `DRTSCILM` for SLOOS large / medium C&I tightening
- `DRTSCIS` for SLOOS small-firm C&I tightening
- `NFCI` for weekly national financial conditions

The NFCI fetch uses a 60-day lookback. That covers roughly eight weekly prints,
enough to capture both the latest value and a 28-day / four-week comparison.

`nfci4wChange` is calculated with `findValueAgo(rows, 28)` and is stored as a
standard-score point change.

## Semantic Direction

NFCI has the opposite sign intuition from credit spreads:

- NFCI positive = tighter financial conditions = bad for credit.
- NFCI negative = looser financial conditions = good for credit.
- IG OAS / HY OAS higher = more credit risk = bad for credit.

Because of this, display copy should pair the signed NFCI value with text labels
such as `偏紧`, `偏松`, or `中性` so users do not have to remember the sign
direction.

## Classification

`classifyNfciRegime` uses five levels because NFCI is interpreted around its
historical mean and sigma-like distance from zero:

- `>= 0.5`: `显著收紧`
- `0.1` to `0.5`: `温和收紧`
- `-0.1` to `0.1`: `中性`
- `-0.5` to `-0.1`: `温和宽松`
- `< -0.5`: `显著宽松`

## Cross-Validation Upgrade

`credit_spread_warning.bank_stress_index` changes from hardcoded missing
evidence to conditional NFCI classification:

- `>= 0.5`: supporting evidence
- `0.1` to `0.5`: supporting evidence
- `-0.1` to `0.1`: neutral no-op
- `-0.5` to `-0.1`: contradicting evidence
- `< -0.5`: contradicting evidence
- `null`: missing evidence

Only the `credit_spread_warning` narrative is changed in M-48. The other six
cross-validation narratives remain unchanged.

## Related Rungs

- M-41 / M-42: Fed liquidity extension and reserve balances.
- M-43: external AI provenance metadata.
- M-46: SLOOS bank loan standards and first formal `macroDrivers.credit`
  contract.
- M-47: ISM Manufacturing PMI and `macroDrivers.consumer` multi-source upgrade.
