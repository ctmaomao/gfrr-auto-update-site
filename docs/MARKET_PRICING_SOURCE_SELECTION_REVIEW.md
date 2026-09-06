# Market Pricing Source Selection Review - v28.0M-13

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

- Review only.
- No live fetch.
- No production source approval.
- No production data write.
- No history record write.
- No `data/market-pricing-history.json` modification.
- No MA60 / standard deviation / z-score calculation.
- No frontend change.
- Market Pricing Temperature remains waiting-for-history.

## 2. Purpose

M-13 reviews source candidates before any artifact-only live fetch is implemented.

This review evaluates asset priority, source reliability, source compliance, adjustedClose availability, weekly coverage, field stability, and fallback behavior.

This review does not approve live fetch, does not approve production data write, and does not select a final production source.

## 3. Asset Priority Review

1. QQQ

- Preferred primary candidate if adjusted close is available and source is approved.
- Best aligns with Nasdaq 100 ETF market pricing temperature.
- Requires adjustedClose or clearly labeled unadjusted limitation.

2. NDX

- Index candidate if QQQ adjusted close is unavailable or unsuitable.
- Adjusted close is not applicable in the same way as an ETF.
- Must be labeled as index-level, not ETF adjusted close.

3. IXIC

- Nasdaq Composite candidate.
- Broader than Nasdaq 100.
- Must not be mislabeled as QQQ / Nasdaq 100 ETF temperature.

4. SPX

- SPX fallback only.
- Useful if Nasdaq candidates fail.
- Must never be labeled as Nasdaq / QQQ temperature.

M-13 selects no production asset. QQQ remains the preferred review target, and SPX remains fallback only.

## 4. Candidate Source Review

### A. Yahoo-Style Candidate

Potential strengths:

- May expose ETF historical data and adjusted close fields.
- Useful candidate for QQQ if compliance and stability pass.

Risks / limits:

- Historical data download availability may depend on subscription or data licensing.
- Some instruments may not show a download option.
- Automated endpoint use requires compliance review.
- Field formats and access behavior may change.
- Not approved for live fetch in this PR.

Review status:

- `candidate_requires_compliance_review`
- `liveFetchApproved=false`
- `productionWriteApproved=false`

### B. Stooq / Public CSV-Style Candidate

Potential strengths:

- Public CSV-style historical data may be easier to artifact-fetch.
- May be useful for ETF / index history if symbol and field format are stable.

Risks / limits:

- Symbol mapping must be verified.
- Field names and adjusted-close availability must be verified.
- Source stability and allowed use must be reviewed.
- Not approved for live fetch in this PR.

Review status:

- `candidate_requires_format_and_stability_review`
- `liveFetchApproved=false`
- `productionWriteApproved=false`

### C. FRED Candidate

Potential strengths:

- Official API for supported economic / financial series observations.
- Supports frequency aggregation for observations.

Risks / limits:

- Not automatically a QQQ adjusted-close source.
- More suitable for official series such as macro / index observations than ETF adjusted close.
- Requires exact series availability review.
- Not approved for live fetch in this PR.

Review status:

- `candidate_for_official_series_only`
- `liveFetchApproved=false`
- `productionWriteApproved=false`

### D. Future Licensed Source

Potential strengths:

- Best long-term option for reliable adjusted close, field stability, and licensing clarity.
- Can support broad assets if contractually approved.

Risks / limits:

- Requires vendor selection and contractual approval.
- Not available in the current repository.
- Not approved for live fetch in this PR.

Review status:

- `future_option`
- `liveFetchApproved=false`
- `productionWriteApproved=false`

## 5. Review Criteria

Required criteria before future source approval:

- source compliance reviewed
- allowed use documented
- no secret leakage
- no cookie / header / auth token persistence
- stable symbol mapping
- stable field names
- adjustedClose availability for ETF assets, especially QQQ
- close fallback clearly labeled if adjustedClose is unavailable
- weekly conversion policy reviewed
- at least 60 weekly observations available before calculation review
- artifact-only output supported
- sanitizer compatibility
- failure behavior defined
- no production write in source implementation PR
- no market temperature calculation in source implementation PR

## 6. Preliminary Review Outcome

- No final production source selected.
- QQQ remains the preferred asset target.
- Yahoo-style and Stooq / public CSV remain primary candidates for future artifact-only proof-of-source.
- FRED remains a candidate for official series only, not QQQ adjusted close.
- Future licensed source remains the long-term ideal.
- SPX remains fallback only.
- The next step should be source-specific artifact-only proof-of-source design / scaffold, not production fetch / write.

Outcome fields:

- `sourceSelectionFinalized=false`
- `liveFetchApproved=false`
- `productionDataWriteApproved=false`
- `marketTemperatureCalculationApproved=false`
- `nextAllowedStep=source_specific_artifact_only_proof_of_source_design`

## 7. Failure and Fallback Behavior

- If source compliance is not reviewed, no live fetch.
- If source fields are unstable, no production write.
- If adjustedClose is unavailable for QQQ, fallback must be labeled.
- If only SPX is available, label SPX fallback only and do not claim Nasdaq / QQQ temperature.
- If artifact contains source URLs, secrets, headers, cookies, or auth tokens, sanitizer must reject.
- If fewer than 60 weekly observations are validated, Market Pricing Temperature remains waiting.
- If any record fails sanitizer, no production write.
- No automatic retries or schedules in source selection review.

## 8. No-Go Rules

- No live fetch.
- No production source approval.
- No production data write.
- No history record write.
- No source URL persistence.
- No secrets / headers / cookies.
- No fake QQQ / NDX / IXIC / SPX records.
- No MA60 / z-score calculation.
- No trading advice.
- No SPX-as-Nasdaq-temperature.
- No frontend change.
- No workflow automation.

## 9. Current Decision

M-13 completes source selection review only.

Recommended next step:

```text
v28.0M-14 Market Pricing Source-Specific Proof-of-Source Design - No Live Fetch / No Production Data Write
```

## 10. v28.0M-14 Proof-of-Source Design Status

v28.0M-14 adds source-specific proof-of-source design before any network-enabled source scaffold.

Implemented boundary:

- Primary proof target is QQQ.
- Primary proof source candidate is Stooq/public CSV for design only.
- Yahoo-style remains a comparison candidate.
- FRED remains an official-series comparison candidate.
- Future licensed source remains the long-term option.
- No source is approved.
- `sourceApproved=false`.
- `liveFetchApproved=false`.
- `productionDataWriteApproved=false`.
- No live fetch is implemented.
- No production data write is approved.
- No MA60, standard deviation, z-score, band, or market temperature calculation is performed.

## 11. v28.0M-15 Source-Specific Artifact Fetch Scaffold Status

v28.0M-15 adds a network-disabled source-specific scaffold after the proof-of-source design step.

Implemented boundary:

- The scaffold does not approve Stooq / public CSV.
- `sourceSelectionFinalized=false`.
- `sourceApproved=false`.
- `liveFetchApproved=false`.
- `productionDataWriteApproved=false`.
- `historyWriteApproved=false`.
- QQQ remains target metadata only.
- No live fetch, source URL persistence, production data write, history write, records, prices, or calculation is introduced.

## 12. v28.0M-16 Network Gate Design Status

v28.0M-16 does not finalize source selection.

Implemented boundary:

- Source selection remains unfinalized.
- Stooq / public CSV remains a design candidate only.
- `sourceSelectionFinalized=false`.
- `sourceApproved=false`.
- `liveFetchApproved=false`.
- `networkGateApproved=false`.
- No source URL, endpoint, source approval, live fetch, production write, history write, workflow change, or calculation is introduced.
