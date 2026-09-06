# Market Pricing Source-Specific Proof-of-Source Design - v28.0M-14

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

- Design only.
- Source-specific proof-of-source only.
- No live fetch.
- No source approval.
- No production data write.
- No history record write.
- No `data/market-pricing-history.json` modification.
- No MA60 / standard deviation / z-score calculation.
- No frontend change.
- Market Pricing Temperature remains waiting-for-history.

## 2. Purpose

M-14 defines how a future source-specific proof-of-source would be evaluated before any live artifact-only fetch implementation.

It does not approve a source, does not implement source calls, does not write data, and does not calculate market temperature.

It creates review criteria, expected artifact shape, source-specific gating, and failure behavior.

## 3. First Proof-of-Source Target

- primary proof target: QQQ
- primary proof source candidate: stooq_public_csv_candidate
- secondary comparison candidate: yahoo_style_candidate
- official-series comparison candidate: fred_candidate
- future option: future_licensed_candidate

Reasoning:

- QQQ remains preferred because Market Pricing Temperature is intended to reflect Nasdaq 100 ETF-style risk-asset pricing if adjusted close is available and compliant.
- Stooq/public CSV is selected only as the first proof-of-source design target because it may be easier to reason about artifact shape and field mapping without approving live use.
- Yahoo-style remains important for adjusted close review but requires stronger compliance / subscription / licensing review.
- FRED remains official-series candidate only and is not automatically a QQQ adjusted-close source.
- No source is approved in M-14.

Important:

- Do not say Stooq is selected as production source.
- Do not say Yahoo is rejected permanently.
- Do not say FRED cannot ever be used.
- Do not approve live fetch.
- Do not include source URLs.

## 4. Source-Specific Proof Criteria

Criteria for any future proof-of-source artifact:

- source identity must be declared
- source compliance must be reviewed or marked pending
- allowed use must be documented
- no source URL persistence
- no cookies / headers / auth tokens / API keys
- symbol mapping must be declared
- field mapping must be declared
- frequency conversion policy must be declared
- adjustedClose availability must be declared
- close fallback must be labeled if adjustedClose is unavailable
- weekly observation date policy must be declared
- minimum coverage target must be declared
- artifact must be sanitizer-compatible
- artifact must remain artifact-only
- no production write in proof-of-source phase
- no calculation in proof-of-source phase

## 5. Stooq / Public CSV Proof Design

Design only.

Required review items:

- `proofRole=first_public_csv_shape_review_candidate`
- `targetAsset=qqq`
- `targetSymbol=QQQ`
- `sourceKey=stooq_public_csv_candidate`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionWriteApproved=false`
- `sourceComplianceReviewed=false`
- `sourceFormatVerified=false`
- `symbolMappingVerified=false`
- `adjustedCloseAvailable=unknown`
- `weeklyAggregationPolicy=not_implemented`
- `expectedFields=date, close, maybe adjustedClose if available`
- `artifactRecordsAllowed=false` in this PR
- `proofRecordsAllowed=false` in this PR
- `nextAllowedStep=source_specific_artifact_fetch_scaffold_with_network_disabled`

Risks:

- symbol mapping may differ by source
- adjusted close may be unavailable
- field names may differ
- public CSV format may change
- allowed use must be reviewed
- no live fetch until approved

## 6. Yahoo-Style Comparison Design

Design only.

Required review items:

- `sourceKey=yahoo_style_candidate`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionWriteApproved=false`
- `sourceComplianceReviewed=false`
- `adjustedClosePotential=true`
- `downloadAvailabilityUncertain=true`
- `licensingRestrictionRisk=true`
- `endpointStabilityRisk=true`
- no endpoint URLs persisted

Risks:

- download availability can depend on subscription or data licensing
- some instruments may not expose download option
- automated access needs compliance review
- field format can change

## 7. FRED Comparison Design

Design only.

Required review items:

- `sourceKey=fred_candidate`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionWriteApproved=false`
- `officialSeriesCandidate=true`
- `qqqAdjustedCloseCandidate=false`
- `frequencyAggregationSupportedForSomeSeries=true`
- `exactSeriesAvailabilityReviewRequired=true`
- no API call in this PR

Risks:

- not automatically a QQQ adjusted-close source
- exact series availability must be reviewed
- API key / credential handling must be separately designed if ever used

## 8. Future Licensed Source Comparison Design

Design only.

Required review items:

- `sourceKey=future_licensed_candidate`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `productionWriteApproved=false`
- `contractualApprovalRequired=true`
- `preferredLongTermForReliability=true`
- no implementation in this PR

## 9. Future Proof Artifact Contract

Future proof-of-source artifacts should use this structure. M-14 does not create real records.

```json
{
  "contractVersion": "v28.0M-14-proof-of-source-design-1",
  "kind": "market_pricing_source_specific_proof_of_source_design",
  "status": "design_only_no_live_fetch",
  "sourceSelectionFinalized": false,
  "sourceApproved": false,
  "liveFetchApproved": false,
  "productionDataWriteApproved": false,
  "historyWriteApproved": false,
  "marketTemperatureCalculationApproved": false,
  "targetAsset": "qqq",
  "targetSymbol": "QQQ",
  "primarySourceCandidate": "stooq_public_csv_candidate",
  "records": [],
  "expectedRecordContract": {
    "date": "YYYY-MM-DD",
    "priceFields": ["adjustedClose", "close"],
    "frequency": "weekly",
    "currency": "USD"
  },
  "boundaries": {
    "designOnly": true,
    "noLiveFetch": true,
    "noProductionWrite": true,
    "noHistoryWrite": true,
    "noCalculation": true
  }
}
```

Important:

- `records` must remain empty.
- This fixture may mention QQQ symbol as target metadata, but it must not contain QQQ prices.
- No source URL.
- No endpoint.
- No live fetch command.
- No approval flags true.

Outcome fields remain `sourceSelectionFinalized=false`, `sourceApproved=false`, `liveFetchApproved=false`, `productionDataWriteApproved=false`, and `marketTemperatureCalculationApproved=false`.

## 10. Failure Behavior

- If source compliance remains pending, no live fetch.
- If allowed use is unclear, no live fetch.
- If field mapping is unclear, no proof implementation.
- If adjustedClose is unavailable, close fallback must be explicitly labeled.
- If fewer than 60 weekly observations can be validated later, market temperature remains waiting.
- If source artifact contains URLs, headers, cookies, secrets, or auth tokens, sanitizer rejects it.
- If source artifact includes calculation or trading advice fields, sanitizer rejects it.
- If SPX is used later as fallback, it must be labeled fallback-only and not Nasdaq / QQQ temperature.
- No automatic retry or schedule.

## 11. No-Go Rules

- No live fetch.
- No source approval.
- No production source selection.
- No source URL persistence.
- No production write.
- No history write.
- No QQQ / NDX / IXIC / SPX price records.
- No MA60 / z-score calculation.
- No trading advice.
- No SPX-as-Nasdaq-temperature.
- No workflow automation.

## 12. Current Decision

- M-14 completes source-specific proof-of-source design only.
- No source is approved.
- Primary proof target is QQQ.
- Primary proof source candidate for design is Stooq/public CSV.
- Yahoo-style remains comparison candidate.
- FRED remains official-series comparison candidate.
- Future licensed source remains long-term option.

Recommended next step:

```text
v28.0M-15 Market Pricing Source-Specific Artifact Fetch Scaffold - Network Disabled / No Production Data Write
```

## 13. v28.0M-15 Source-Specific Artifact Fetch Scaffold Status

v28.0M-15 adds a source-specific artifact fetch scaffold while keeping network disabled.

Implemented boundary:

- The scaffold uses QQQ as target metadata only.
- The source candidate is Stooq / public CSV for design continuity only.
- Stooq / public CSV is not approved as a production source.
- `sourceSelectionFinalized=false`, `sourceApproved=false`, `liveFetchApproved=false`, and `productionDataWriteApproved=false`.
- Network remains disabled.
- If `--allow-network` is supplied, the scaffold records and rejects the request.
- No source URL or endpoint is persisted.
- No records, prices, production writes, history writes, or calculations are introduced.

Recommended next step:

```text
v28.0M-16 Market Pricing Source-Specific Network Gate Design - No Live Fetch / No Production Data Write
```

## 14. v28.0M-15A Unified Data Pipeline Architecture Status

v28.0M-15A records that proof-of-source design must integrate with the unified data architecture.

Implemented boundary:

- Source-specific artifacts remain assigned to `artifact_sanitizer_layer` until an approved writer exists.
- Future market-pricing-history writes belong to `daily_history_layer`.
- Proof-of-source work must not create a standalone or ad hoc pipeline.
- Backup validation must not bypass sanitizer.
- Realtime Worker context must not become the primary weekly-history builder.
- No fetch, production write, history write, workflow change, or calculation is introduced.

## 15. v28.0M-16 Network Gate Design Status

v28.0M-16 defines network gate design only.

Implemented boundary:

- The source-specific proof target remains metadata.
- Stooq / public CSV remains a design candidate only.
- `sourceApproved=false`.
- `liveFetchApproved=false`.
- `networkGateApproved=false`.
- `networkGateOpen=false`.
- `networkAllowed=false`.
- No source approval, live fetch, production write, history write, workflow change, or calculation is introduced.
