# Market Pricing Source-Specific Network Gate Design - v28.0M-16

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

## 1. Status

- Design only.
- Network remains disabled.
- No live fetch.
- No source approval.
- No production data write.
- No history record write.
- No workflow change.
- No calculation.
- No frontend change.
- Market Pricing Temperature remains waiting-for-history.

## 2. Purpose

M-16 defines the future network gate that must be satisfied before any source-specific artifact fetch can make an external request.

This round:

- does not enable the gate.
- does not implement live fetch.
- does not approve Stooq / Yahoo / FRED / licensed source.
- does not write data.
- does not calculate market temperature.

## 3. Network Gate Principle

Network access for market-pricing source-specific artifact fetch must require all of these future conditions:

- `sourceApproved=true`
- `liveFetchApproved=true`
- `sourceComplianceReviewed=true`
- `sourceFormatVerified=true`
- `symbolMappingVerified=true`
- `networkGateApproved=true`
- `artifactOnly=true`
- `productionDataWriteApproved=false`
- `historyWriteApproved=false`
- `marketTemperatureCalculationApproved=false`
- `sanitizerRequired=true`
- `sourceUrlPersistenceAllowed=false`
- `secretsAllowed=false`
- workflow schedule change approved separately if workflows are involved

In M-16 all approval flags remain false:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `sourceComplianceReviewed=false`
- `sourceFormatVerified=false`
- `symbolMappingVerified=false`
- `networkGateApproved=false`
- `networkGateOpen=false`
- `networkAllowed=false`

## 4. Current Source-Specific Candidate

Current target:

- `targetAsset=qqq`
- `targetSymbol=QQQ`
- `sourceCandidate=stooq_public_csv_candidate`
- candidate only
- not production source
- no live fetch
- no source URL
- no endpoint
- no price records

## 5. Future Gate Inputs

Future gate inputs should use this shape:

```json
{
  "sourceKey": "stooq_public_csv_candidate",
  "targetAsset": "qqq",
  "targetSymbol": "QQQ",
  "sourceApproved": false,
  "liveFetchApproved": false,
  "networkGateApproved": false,
  "sourceComplianceReviewed": false,
  "sourceFormatVerified": false,
  "symbolMappingVerified": false,
  "artifactOnly": true,
  "productionDataWriteApproved": false,
  "historyWriteApproved": false,
  "marketTemperatureCalculationApproved": false
}
```

This PR does not create enabled gate input. This PR does not add secrets. This PR does not add URLs.

## 6. Future Gate Output

Future network gate decisions should use this output shape:

```json
{
  "contractVersion": "v28.0M-16-network-gate-design-1",
  "kind": "market_pricing_network_gate_decision",
  "status": "network_gate_design_only",
  "networkGateOpen": false,
  "networkAllowed": false,
  "networkRequestRejected": true,
  "rejectionReasons": [
    "source_not_approved",
    "live_fetch_not_approved",
    "network_gate_not_approved"
  ],
  "productionDataWritten": false,
  "historyFileModified": false,
  "calculationPerformed": false
}
```

In M-16, `networkGateOpen=false`, `networkAllowed=false`, and any allow-network request must still be rejected.

## 7. Required Future Rejection Reasons

Future network gate rejection reasons must include:

- `source_not_approved`
- `live_fetch_not_approved`
- `network_gate_not_approved`
- `source_compliance_not_reviewed`
- `source_format_not_verified`
- `symbol_mapping_not_verified`
- `production_write_not_allowed`
- `history_write_not_allowed`
- `calculation_not_allowed`
- `source_url_persistence_not_allowed`
- `secrets_not_allowed`
- `unsupported_source_candidate`
- `unsupported_target_asset`

## 8. Relationship to Unified Pipeline

- Gate belongs to artifact_sanitizer_layer / source-specific artifact layer.
- It does not write daily_history_layer directly.
- It does not touch realtime_worker_layer.
- It does not change github_actions_backup_validation_layer.
- Future live artifact fetch may produce manual-artifacts only.
- Future history writer must be a separate Daily/history PR.
- Future calculation must be separate after sufficient validated weekly observations.

## 9. Future Operator Rules

- Operators must not enable network by editing JSON flags manually.
- Operators must not add source URLs to fixtures.
- Operators must not use network gate to bypass sanitizer.
- Operators must not write `data/market-pricing-history.json` from source-specific fetch.
- Operators must not add workflow schedules in network-gate design.
- Operators must not use Cloudflare Worker as weekly-history builder.

## 10. No-Go Rules

- No live fetch.
- No source approval.
- No network enabled.
- No source URL persistence.
- No secrets.
- No production data write.
- No history write.
- No QQQ / NDX / IXIC / SPX price records.
- No MA60 / z-score calculation.
- No trading advice.
- No SPX-as-Nasdaq-temperature.
- No workflow automation.
- No frontend change.

## 11. Current Decision

- M-16 completes network gate design only.
- No gate is opened.

Recommended next step:

```text
v28.0M-17 Market Pricing Network Gate Scaffold - Network Still Disabled / No Production Data Write
```
