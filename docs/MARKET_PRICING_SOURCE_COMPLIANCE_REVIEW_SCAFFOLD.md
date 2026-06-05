# Market Pricing Source Compliance Review Scaffold

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

v28.0M-18 adds a Market Pricing source compliance review scaffold for the
unapproved QQQ candidate source. It makes the future review path explicit while
keeping every review item and approval flag in the initial not-reviewed state.

This is scaffold and guard layer only. It does not approve compliance, does not
approve a source, does not enable network access, does not add live fetch, does
not write production data, and does not activate Market Pricing Temperature.
Market Pricing Temperature remains waiting-for-history.

## Required Not-Reviewed State

Every M-18 report must keep:

- `sourceComplianceReviewed=false`
- `sourceComplianceReviewStatus="not_reviewed"`
- `sourceComplianceApproved=false`

The seven compliance checklist items must remain false:

- `tosAcceptableUseReviewed`
- `robotsTxtReviewed`
- `rateLimitReviewed`
- `attributionRequirementReviewed`
- `redistributionRightsReviewed`
- `dataAccuracyDisclaimerReviewed`
- `sourceJurisdictionReviewed`

The checklist note fields are placeholders only. Actual compliance answers must
not be written by this scaffold.

## Rejected Requests

If a caller passes `--mark-reviewed`, the report must still keep
`sourceComplianceReviewed=false` and return
`complianceReviewRequestRejected=true`.

The rejection reasons must include:

- `compliance_review_requires_manual_human_review`
- `scaffold_cannot_auto_approve_compliance`
- `source_not_approved`

## Inherited M-17 Boundaries

M-18 inherits the closed network gate state:

- `networkGateApproved=false`
- `networkGateOpen=false`
- `networkAllowed=false`
- `sourceApproved=false`
- `liveFetchApproved=false`
- `sourceFormatVerified=false`
- `symbolMappingVerified=false`
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

## Local Commands

Generate a local manual artifact:

```bash
npm run market-pricing:source-compliance-review:scaffold
```

Validate the scaffold:

```bash
npm run check:market-pricing-source-compliance-review-scaffold
```

Generated reports are local/manual artifacts only and must stay out of git.

## Non-Goals

M-18 does not:

- approve any compliance item
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

The next planned M-19 step may add symbol mapping verification design only; it
still must not approve source use or enable network access.
