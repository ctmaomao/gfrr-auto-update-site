# Market Pricing Real-Record Contract Design - v28.0M-11

## 1. Status

This round is design / schema scaffold only.

- No live fetch.
- No production data write.
- No history record write.
- No `data/market-pricing-history.json` modification.
- No MA60 / standard deviation / z-score calculation.
- No frontend change.
- Market Pricing Temperature remains `waiting_for_history`.

## 2. Purpose

v28.0M-11 defines the future real-record contract for market pricing artifacts.

This contract is required before a real fetched artifact can be sanitized. Sanitized records still cannot be written to production in this round. Production history write requires a later approved PR. Calculation requires at least 60 validated weekly observations and a later approved PR.

## 3. Supported Production Asset Candidates

Future production candidate assets:

| Asset key | Role | Rule |
| --- | --- | --- |
| `qqq` | preferred primary | QQQ remains preferred if adjusted close is available and source is approved. |
| `ndx` | index candidate | NDX is acceptable if QQQ adjusted close is unavailable or unsuitable. |
| `ixic` | index candidate | IXIC is acceptable if QQQ adjusted close is unavailable or unsuitable. |
| `spx` | fallback only | SPX fallback only; no SPX-as-Nasdaq-temperature labeling. |

Source selection is still pending.

## 4. Future Artifact-Level Contract

Future real-record artifacts should use this structure. This PR does not create real data, and committed fixtures must keep `records` empty.

```json
{
  "contractVersion": "v28.0M-11-real-record-contract-1",
  "kind": "market_pricing_real_record_artifact",
  "artifactOnly": true,
  "productionDataWritten": false,
  "historyFileModified": false,
  "calculationPerformed": false,
  "assetKey": "qqq",
  "symbol": "QQQ",
  "frequency": "weekly",
  "candidateSource": "not_selected",
  "sourceComplianceReviewed": false,
  "records": []
}
```

## 5. Future Record-Level Contract

Future real record fields:

Required:

- `date`: `YYYY-MM-DD`.
- `sourceStatus`: `ok` / `stale` / `fallback` / `rejected`.
- `sourceName`: stable source identifier.
- `sourceType`: `public_csv` / `official_api` / `licensed_provider` / `manual_fixture`.
- `currency`: `USD`.
- `frequency`: `weekly`.

Price fields:

- `adjustedClose`: preferred for ETF assets such as QQQ.
- `close`: acceptable only if `adjustedClose` is unavailable and the limitation is explicitly labeled.
- `priceFieldUsed`: `adjustedClose` / `close`.
- `priceAdjustmentStatus`: `adjusted` / `unadjusted_labeled` / `index_level`.

Optional metadata:

- `rawSourceDate`.
- `sourceTimezone`.
- `providerSymbol`.
- `recordHash`.
- `validationNotes`.

Do not include:

- `ma60`.
- `zScore`.
- `standardDeviation`.
- `upperBand`.
- `lowerBand`.
- `temperature`.
- `signal`.
- `buy`.
- `sell`.
- `short`.
- `inverseEtf`.
- `allocation`.
- `positionAdvice`.

## 6. Future Validation Rules

Required future validation rules:

- `date` must be `YYYY-MM-DD`.
- `date` must be a weekly observation date.
- Records must be sorted ascending.
- Duplicate dates must be rejected.
- `adjustedClose` / `close` must be finite positive numbers.
- `adjustedClose` is preferred for ETF assets.
- If only `close` exists, the limitation must be explicit.
- No non-finite values.
- No negative or zero prices.
- No source secrets.
- No headers / cookies / auth tokens.
- No executable source URLs.
- No calculation fields.
- No trading advice fields.
- No production-write flags.
- No record can be accepted unless source compliance is reviewed.
- No production write even after validation in M-11.
- M-11 requires no MA60 / z-score calculation.
- Future sanitizer output must keep `readyForProductionWrite=false` in this phase.

## 7. Record-Count Policy

| Valid weekly records | State | Rule |
| --- | --- | --- |
| 0 | `waiting_for_history` | Keep Market Pricing Temperature waiting. |
| 1-59 | `insufficient_history` | Keep Market Pricing Temperature waiting. |
| 60+ | `enough_for_future_calculation_review` | Enough for future calculation review, but still no automatic calculation. |

Calculation requires a separate approved PR. History write requires a separate approved PR.

## 8. Sanitizer Output Contract For Real Records

Future sanitizer output may use this shape, but M-11 does not implement production acceptance:

```json
{
  "contractVersion": "v28.0M-11-real-record-sanitizer-report-1",
  "kind": "market_pricing_real_record_sanitizer_report",
  "recordsInspected": 0,
  "recordsStructurallyValid": 0,
  "recordsAcceptedForHistory": 0,
  "readyForProductionWrite": false,
  "productionDataWritten": false,
  "historyFileModified": false,
  "calculationPerformed": false,
  "rejectionReasons": []
}
```

In M-11, `readyForProductionWrite=false` must remain the policy. M-11 does not write history. M-11 does not calculate market temperature.

## 9. Source-Specific Notes

Yahoo-style source:

- Adjusted close may be useful for QQQ.
- Requires compliance / stability review.
- Download availability may depend on subscription or data licensing.
- No implementation in this PR.

FRED:

- Useful for official series observations.
- Not automatically a QQQ adjusted-close source.
- No implementation in this PR.

Stooq / public CSV:

- Possible candidate.
- Requires format and stability review.
- No implementation in this PR.

Future licensed source:

- Acceptable if contractually approved.
- No implementation in this PR.

## 10. Failure Behavior

- If source compliance is not reviewed, reject artifact.
- If records are unsorted, reject artifact.
- If duplicate dates exist, reject artifact.
- If any price is non-finite, zero, negative, or missing, reject affected records.
- If any secret / header / cookie / auth token appears, reject artifact.
- If fewer than 60 valid weekly observations exist, keep Market Pricing Temperature waiting.
- If only SPX exists, label it fallback-only and do not claim Nasdaq / QQQ temperature.
- If artifact has calculation or trading advice fields, reject artifact.

## 11. No-Go Rules

- No live fetch.
- No production data write.
- No market-pricing-history record write.
- No fake production-like records.
- No MA60 / z-score calculation.
- No source credentials.
- No source URL leakage.
- No trading advice.
- No SPX-as-Nasdaq-temperature.
- No frontend change.
- No workflow automation.

## 12. Current Decision

M-11 completes real-record contract design only.

Next recommended step:

```text
v28.0M-12 Market Pricing Real-Record Sanitizer Scaffold - No Production Data Write
```
