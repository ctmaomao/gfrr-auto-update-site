# Market Pricing Network Gate Scaffold

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

v28.0M-17 adds a closed market-pricing network gate scaffold. It makes the
future approval path explicit while keeping network access, source approval,
live fetch, production writes, history writes, and Market Pricing Temperature
calculations disabled.

This is a scaffold and guard layer only. It does not add a provider URL, does
not call a provider, does not read secrets, and does not write production data.
Market Pricing Temperature remains waiting-for-history.

## Relationship to M-16

v28.0M-16 documented the network gate design and fixture under
`docs/fixtures/market-pricing/network-gate-design-v28.0M-16.json`.

v28.0M-17 adds a runnable local scaffold report and checker:

- `scripts/market-pricing/network-gate-scaffold.mjs`
- `scripts/check-market-pricing-network-gate-scaffold.mjs`
- `docs/fixtures/market-pricing/network-gate-scaffold-v28.0M-17.json`

## Required Closed State

Every M-17 scaffold report must keep these fields false:

- `networkGateApproved`
- `networkGateOpen`
- `networkAllowed`
- `sourceApproved`
- `liveFetchApproved`
- `sourceComplianceReviewed`
- `sourceFormatVerified`
- `symbolMappingVerified`
- `sourceUrlPersistenceAllowed`
- `secretsAllowed`
- `productionDataWriteApproved`
- `historyWriteApproved`
- `marketTemperatureCalculationApproved`
- `readyForProductionWrite`

The scaffold report must also keep:

- `records=[]`
- `apiCalled=false`
- `secretsRead=false`
- `productionDataWritten=false`
- `historyFileModified=false`
- `frontendChanged=false`
- `workflowChanged=false`
- `affectsScoring=false`
- `affectsDecisionModel=false`
- `affectsExecutionLock=false`
- `affectsPositionGuidance=false`

## Network Request Rejection

The default report returns `networkAllowed=false`. If a caller passes
`--allow-network`, the scaffold still returns `networkAllowed=false` and marks
the request rejected.

The rejection reasons must include:

- `source_not_approved`
- `live_fetch_not_approved`
- `network_gate_not_approved`

## Unified Pipeline Assignment

M-17 keeps the network gate assigned to the artifact sanitizer layer:

```json
{
  "sourceArtifactsLayer": "artifact_sanitizer_layer",
  "historyLayer": "daily_history_layer",
  "realtimeWorkerPrimaryWeeklyHistoryBuilder": false,
  "backupValidationMayBypassSanitizer": false
}
```

The realtime Worker must not become a weekly history builder, and backup
validation must not bypass sanitizer review.

## Local Commands

Generate a local manual artifact:

```bash
npm run market-pricing:network-gate:scaffold
```

Validate the scaffold:

```bash
npm run check:market-pricing-network-gate-scaffold
```

Generated reports are local/manual artifacts only and must stay out of git.

## Non-Goals

M-17 does not:

- add live fetch
- add source approval
- add provider or endpoint URLs
- read secrets
- write `data/radar-data.json`
- write `data/market-pricing-history.json`
- add market-pricing records
- calculate MA60, standard deviation, or z-score
- activate Market Pricing Temperature
- change scoring, decision, execution, or position logic
- change workflows
- change frontend rendering
