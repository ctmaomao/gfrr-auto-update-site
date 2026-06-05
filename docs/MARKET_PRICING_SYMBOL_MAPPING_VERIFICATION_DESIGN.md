# Market Pricing Symbol Mapping Verification Design

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

v28.0M-19 adds a design layer for future Market Pricing symbol mapping
verification. It documents the intended QQQ candidate mapping and guardrails,
but it does not verify or approve the mapping.

This is design layer only. There is no executable scaffold script for M-19.
Symbol mapping verification remains `not_verified`, no source is approved,
network remains disabled, and Market Pricing Temperature remains
waiting-for-history.

## Design State

The M-19 design fixture records:

- `symbolMappingVerified=false`
- `symbolMappingVerificationStatus="not_verified"`
- `symbolMappingApproved=false`
- `candidateSymbolRecorded=true`
- `symbolMappingDesignReviewed=true`
- `designLayerOnly=true`
- `scaffoldExecutableExists=false`

The candidate symbol is QQQ on NASDAQ. This records a candidate only; it does
not approve the symbol for use.

## Verification Checklist

The following checklist items require manual verification after a later approved
network-opening stage:

- `tickerCaseMatched`
- `marketIdentifierMatched`
- `exchangeIdentifierMatched`
- `assetClassMatched`
- `isinOrFigiCrossChecked`
- `timezoneAlignmentVerified`

All six remain false in M-19.

## Hard Substitution Rule

`noSpxSubstitution=true` is enforced as a hard rule. SPX must never substitute
for Nasdaq / QQQ temperature, even temporarily.

Fallback candidates NDX and IXIC are documented as indices, not tradable ETFs.
Rejected substitutes include SPX with an explicit Nasdaq / QQQ mismatch reason.

## Inherited Boundaries

M-19 inherits the M-17 and M-18 closed states:

- `networkGateApproved=false`
- `networkGateOpen=false`
- `networkAllowed=false`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `sourceComplianceReviewed=false`
- `sourceComplianceReviewStatus="not_reviewed"`
- `sourceFormatVerified=false`
- `sourceSelectionFinalized=false`
- `sourceUrlPersistenceAllowed=false`
- `secretsAllowed=false`
- `productionDataWriteApproved=false`
- `historyWriteApproved=false`
- `marketTemperatureCalculationApproved=false`
- `readyForProductionWrite=false`

Reports must also keep:

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

## Unified Pipeline Assignment

Source-specific artifacts remain in the artifact sanitizer layer, and
market-pricing history remains in the daily history layer:

```json
{
  "sourceArtifactsLayer": "artifact_sanitizer_layer",
  "historyLayer": "daily_history_layer",
  "realtimeWorkerPrimaryWeeklyHistoryBuilder": false,
  "backupValidationMayBypassSanitizer": false
}
```

The Cloudflare Worker / realtime layer is not a weekly history builder. GitHub
Actions backup validation cannot bypass sanitizer review.

## Local Check

Validate the design fixture:

```bash
npm run check:market-pricing-symbol-mapping-verification-design
```

## Non-Goals

M-19 does not:

- add an executable scaffold script
- approve symbol mapping
- approve source compliance
- approve any source
- enable network access
- add live fetch
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

The next planned M-20 step may add source format verification design only; it
still must not approve source use or enable network access.
