# Market Pricing Artifact-Only Fetch Design - v28.0M-8

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

This round is design / scaffold only.

- No live fetch.
- No production data write.
- No `data/market-pricing-history.json` record change.
- No MA60 / standard deviation / z-score calculation.
- No frontend change.
- No workflow change.
- Market Pricing Temperature remains waiting-for-history.

## 2. Purpose

The future market pricing fetch path must first produce an artifact-only report. The artifact is manual diagnostic output only and must not be treated as production data.

Before any future history write, the artifact must pass an explicit validator and sanitizer. Production history writes require a separate approved PR. Calculation requires at least 60 weekly observations and a separate approved PR.

## 3. Candidate Source Hierarchy

Future source selection should use this hierarchy:

1. QQQ adjusted close weekly history, if a stable and compliant source is approved.
2. NDX / Nasdaq 100 index weekly history, if QQQ adjusted close is unavailable or unsuitable.
3. IXIC / Nasdaq Composite weekly history, if NDX / QQQ are unavailable.
4. SPX only as fallback candidate, not as Nasdaq / QQQ temperature.

SPX must not be mislabeled as Nasdaq / QQQ temperature. Source selection is not finalized in this PR. Live source use requires a future PR.

## 4. Source Compliance Boundaries

Yahoo Finance historical download is subject to availability and licensing / subscription constraints. Yahoo-style endpoints require compliance and stability review before implementation.

FRED is suitable for macro / index series, but may not provide QQQ adjusted close. Stooq or public CSV-style sources require format validation and source reliability checks. Future licensed sources remain optional.

This PR does not select or call any source. Docs may describe candidates textually, but no executable source URLs are included in code.

## 5. Future Artifact Contract

A future artifact-only fetch path may write a local ignored report such as:

```text
manual-artifacts/market-pricing/source-fetch-artifact-latest.json
```

This PR does not create a real fetched artifact.

Intended future artifact contract:

```json
{
  "contractVersion": "v28.0M-8-artifact-fetch-design",
  "kind": "market_pricing_artifact_fetch_report",
  "status": "artifact_only_design",
  "generatedAt": "...",
  "sourceMode": "artifact_only",
  "networkAllowed": false,
  "apiCalled": false,
  "secretsRead": false,
  "productionDataWritten": false,
  "historyFileModified": false,
  "calculationPerformed": false,
  "assetKey": "qqq",
  "symbol": "QQQ",
  "candidateSource": "not_selected",
  "records": [],
  "recordsProduced": 0,
  "weeklyRows": 0,
  "hasAtLeast60Weeks": false,
  "validation": {
    "status": "design_only",
    "recordsValidated": false,
    "sourceComplianceReviewed": false
  },
  "boundaries": {
    "artifactOnly": true,
    "noProductionWrite": true,
    "noCalculation": true,
    "displayOnly": true,
    "notInvestmentAdvice": true,
    "affectsScoring": false,
    "affectsDecisionModel": false,
    "affectsExecutionLock": false,
    "affectsPositionGuidance": false
  }
}
```

Future artifact records must be validated before use. This PR does not create records. This PR does not create production history entries.

## 6. Future Artifact Sanitizer Requirements

Future sanitizer / checker coverage must reject:

- secrets.
- request headers.
- API keys.
- cookies.
- raw auth tokens.
- unexpected URLs if source is not approved.
- records without date and close / adjusted close fields.
- records with non-finite prices.
- fewer than required fields in a real artifact.
- records that are not sorted or have duplicate dates.
- artifacts that contain MA60 / z-score / temperature fields before the calculation phase.
- trading recommendation fields such as buy, sell, short, or inverseEtf.

## 7. Future Fetch Failure Behavior

If a future fetch fails, no production data is written. If artifact validation fails, no production data is written.

If a source returns fewer than 60 weekly observations, keep waiting_for_history. If adjusted close is unavailable, label source limitations explicitly. If only SPX is available, keep SPX as fallback candidate and do not claim Nasdaq / QQQ temperature.

There must be no automatic retry loop without approval.

## 8. Future Staged Implementation

Recommended staged path:

- M-9: implement artifact-only fetch script behind explicit allow-network flag, output only to manual-artifacts, and perform no production write.
- M-10: add artifact sanitizer scaffold and fixture rejection checks, with no production write.
- M-11: add real-record contract design for future sanitizer inputs, with no production write.
- M-12: add real-record sanitizer scaffold, with no production write.
- M-13: write validated history to `data/market-pricing-history.json`, still with no calculation if fewer than 60 weekly rows exist.
- M-14: implement calculation layer only after sufficient history exists; keep it display-only with no scoring impact.
- M-15: integrate market temperature into asset pricing mismatch and cross-validation, still not trading advice.

## 9. No-Go Rules

- No live fetch in design / scaffold PR.
- No production write before artifact validation.
- No fake history.
- No fake QQQ / NDX / IXIC records.
- No calculation without at least 60 weekly observations.
- No trading advice.
- No long-term inverse ETF recommendation.
- No Global Risk Heatmap layout change.
- No scoring / decision / execution / position impact.

## 10. Current Decision

M-8 completes artifact-only fetch design. Market Pricing Temperature remains waiting-for-history.

Recommended next step:

```text
v28.0M-9 Market Pricing Artifact-Only Fetch Scaffold - No Production Data Write
```

## 11. v28.0M-9 Artifact Fetch Scaffold Status

v28.0M-9 adds the first local artifact fetch scaffold command and checker.

Implemented boundary:

- `scripts/market-pricing/artifact-fetch-scaffold.mjs` writes only a local ignored scaffold report.
- Default output is `manual-artifacts/market-pricing/artifact-fetch-scaffold-latest.json`.
- The scaffold report uses `contractVersion=v28.0M-9` and `kind=market_pricing_artifact_fetch_scaffold_report`.
- No live fetch is implemented.
- If `--allow-network` is supplied, the scaffold records the request and rejects network access in this version.
- No production data is written.
- No `data/market-pricing-history.json` history records are written.
- No `data/radar-data.json` write is performed.
- No MA60, standard deviation, z-score, band, or market temperature calculation is performed.
- QQQ remains the preferred primary candidate; SPX remains fallback candidate only.
- Candidate sources are descriptive only and are not executable source selections.
- `scripts/check-market-pricing-artifact-fetch-scaffold.mjs` validates the no-network static contract, report contract, allow-network rejection behavior, protected file state, and ignored artifact boundary.
- `npm run check:market-pricing-artifact-fetch-scaffold` is wired into `npm run check:all`.

## 12. v28.0M-10 Artifact Sanitizer Scaffold Status

v28.0M-10 adds the first local sanitizer scaffold for market pricing artifacts.

Implemented boundary:

- `scripts/market-pricing/artifact-sanitizer-scaffold.mjs` validates scaffold artifact structure and writes only a local ignored sanitizer report.
- Default output is `manual-artifacts/market-pricing/artifact-sanitizer-scaffold-latest.json`.
- `docs/fixtures/market-pricing/artifact-sanitizer-scaffold-valid-v28.0M-10.json` is a valid scaffold fixture with no records.
- `docs/fixtures/market-pricing/artifact-sanitizer-scaffold-invalid-v28.0M-10.json` tests rejection of sensitive fields, source leakage fields, premature calculation fields, trading advice fields, and production-write flags.
- The sanitizer rejects secrets, headers, cookies, API tokens, source URL fields, MA60 / standard deviation / z-score / band / temperature fields, trading advice fields, and production-write flags.
- A pass means scaffold structure is acceptable only; `readyForProductionWrite` remains false.
- No production data is written.
- No `data/market-pricing-history.json` history records are written.
- No `data/radar-data.json` write is performed.
- No MA60, standard deviation, z-score, band, or market temperature calculation is performed.
- `scripts/check-market-pricing-artifact-sanitizer-scaffold.mjs` validates static no-network boundaries, valid fixture pass behavior, invalid fixture rejection behavior, protected file state, and ignored artifact boundary.
- `npm run check:market-pricing-artifact-sanitizer-scaffold` is wired into `npm run check:all`.

Next step requires explicit approval before any real fetched records can be sanitized for a later history writer, live source call, production history write, or calculation layer.

## 13. v28.0M-11 Real-Record Contract Design Status

v28.0M-11 adds the future real-record contract design layer for market pricing artifacts.

Implemented boundary:

- `docs/MARKET_PRICING_REAL_RECORD_CONTRACT_DESIGN.md` defines artifact-level and record-level contracts for future weekly records.
- `docs/fixtures/market-pricing/real-record-contract-design-v28.0M-11.json` is schema-only and keeps `records=[]`.
- `scripts/check-market-pricing-real-record-contract-design.mjs` validates the design document, schema-only fixture, existing sanitizer no-network boundary, and protected production data state.
- Future sanitizer work must validate sorted weekly records, duplicate dates, finite positive price fields, `adjustedClose` / `close` usage, source compliance, forbidden fields, and record-count policy.
- Source selection remains pending.
- No live fetch is implemented.
- No production data is written.
- No `data/market-pricing-history.json` history records are written.
- No MA60, standard deviation, z-score, band, or market temperature calculation is performed.
- `npm run check:market-pricing-real-record-contract-design` is wired into `npm run check:all`.

Next step requires explicit approval before a real-record sanitizer scaffold accepts any record-bearing artifact.

## 14. v28.0M-12 Real-Record Sanitizer Scaffold Status

v28.0M-12 lets the sanitizer scaffold inspect synthetic real-record structure, but it still cannot promote records to production history.

Implemented boundary:

- Valid synthetic records can pass structural checks for date format, sorted weekly order, duplicate-date absence, finite positive price fields, `adjustedClose` / `close` consistency, source metadata, and forbidden-field absence.
- Invalid synthetic fixtures verify rejection for duplicate dates, unsorted dates, non-positive prices, calculation fields, trading / advice fields, and source leakage fields.
- Real fetched artifacts still require separate source implementation, source selection review, artifact-only fetch approval, sanitizer approval, and production-write approval.
- `recordsAcceptedForHistory` remains `0`.
- `readyForProductionWrite` remains `false`.
- No live fetch, production history write, or market temperature calculation is implemented.

## 15. v28.0M-13 Source Selection Review Status

v28.0M-13 adds a source selection review before any source-specific artifact-only proof-of-source step.

Implemented boundary:

- `docs/MARKET_PRICING_SOURCE_SELECTION_REVIEW.md` reviews QQQ, NDX, IXIC, and SPX asset candidates.
- Yahoo-style and Stooq / public CSV candidates remain candidates for a future source-specific proof-of-source design.
- FRED remains a candidate for official series only, not a QQQ adjusted-close source.
- Future licensed source remains a long-term option.
- Source implementation remains disabled until a later approved PR.
- No live fetch is implemented in M-13.
- No production source is selected.
- No production write or calculation is approved.

## 16. v28.0M-14 Proof-of-Source Design Status

v28.0M-14 defines the next source-specific proof-of-source design layer.

Implemented boundary:

- Future M-15 may model a source-specific artifact fetch scaffold with network disabled.
- Source-specific proof design does not approve Stooq, Yahoo-style, FRED, or any licensed provider for live use.
- No live fetch is allowed until explicit approval.
- No records, prices, production writes, history writes, or calculations are introduced.

## 17. v28.0M-15 Source-Specific Artifact Fetch Scaffold Status

v28.0M-15 adds a source-specific scaffold for the first proof target while keeping the artifact-only boundary closed.

Implemented boundary:

- `scripts/market-pricing/source-specific-artifact-fetch-scaffold.mjs` writes only an ignored local scaffold report.
- The scaffold target is QQQ metadata and the source candidate is Stooq / public CSV metadata.
- Network remains disabled.
- `--allow-network` is parsed only so the request can be rejected in the report.
- No live fetch is implemented.
- No artifact records or prices are produced.
- No production data is written.
- No `data/market-pricing-history.json` records are written.
- No `data/radar-data.json` write is performed.
- No MA60, standard deviation, z-score, band, or market temperature calculation is performed.
- Future live proof requires a separate approval and must remain artifact-only until later sanitizer and history-write approvals exist.

## 18. v28.0M-15A Unified Data Pipeline Architecture Status

v28.0M-15A records how artifact-only fetch work connects to the unified data pipeline.

Implemented boundary:

- Artifact-only fetch outputs are not production data.
- Market-pricing artifact outputs belong to `artifact_sanitizer_layer`.
- The artifact sanitizer layer is required before any `daily_history_layer` write.
- Market-pricing-history writes require a separate approved writer.
- Backup validation may inspect status but must not bypass sanitizer.
- No standalone or ad hoc market-pricing pipeline is allowed.

## 19. v28.0M-16 Network Gate Design Status

v28.0M-16 keeps artifact-only live fetch disabled.

Implemented boundary:

- Network gate design does not implement fetch.
- Artifact-only live fetch remains disabled until a later network gate scaffold and explicit approval.
- `networkGateApproved=false`.
- `networkGateOpen=false`.
- `networkAllowed=false`.
- Any source-specific artifact remains non-production and sanitizer-bound.
- No records, prices, production writes, history writes, or calculations are introduced.
