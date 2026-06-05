# Market Pricing Source Format Verification Design

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

v28.0M-20 is a design layer only for future Market Pricing source format verification.
It adds no executable scaffold script and does not verify or approve any source format.

## Status

- Source format verification status remains `not_verified`.
- `sourceFormatVerified=false`.
- `sourceFormatApproved=false`.
- `sourceFormatDesignReviewed=true` only records that this design layer is complete.
- No source approval.
- Network remains disabled.
- No live fetch.
- No production data write.
- No history record write.
- No Market Pricing Temperature activation.
- No MA60, standard deviation, or z-score calculation.
- No workflow change.
- No frontend change.
- No scoring, decision, execution, or position logic change.

## Verification Checklist Design

The following checklist items require manual verification after a later network-opening step:

- `contentTypeMatched`
- `headerRowPresent`
- `columnSchemaMatched`
- `dateColumnFormatMatched`
- `priceColumnNumericityVerified`
- `priceRangePlausibilityChecked`
- `rowCadenceClassified`

All checklist items remain false in v28.0M-20.

## Hard Rules

- `noPriceFabrication=true`: missing prices must remain missing; never interpolate, extrapolate, or copy forward.
- `noHtmlErrorPageMasquerade=true`: HTML error pages must never be parsed as CSV.

## Expected Source Format Design

The future candidate source format is CSV.

Required columns:

- `Date`: ISO `YYYY-MM-DD`.
- `Close`: positive decimal price.

Optional columns:

- `Open`
- `High`
- `Low`
- `Volume`

Expected QQQ plausible close range is 10 to 2000. Values outside that range require manual review and must never be auto-accepted.

## Rejected Format Scenarios

The design fixture documents these rejected scenarios:

- HTML error page returned with 200 status.
- Empty body with 200 status.
- CSV with `NaN`, `null`, `-`, or empty `Close` values.
- CSV with US `M/D/YYYY` date format.
- CSV with Excel serial date numbers.
- `Close` value outside the expected QQQ plausible range.

## Inherited Boundaries

M-20 inherits the M-17, M-18, and M-19 gates:

- `networkGateApproved=false`.
- `networkGateOpen=false`.
- `networkAllowed=false`.
- `sourceComplianceReviewed=false`.
- `symbolMappingVerified=false`.
- source-specific artifacts remain assigned to `artifact_sanitizer_layer`.
- market-pricing history remains assigned to `daily_history_layer`.
- Cloudflare Worker / realtime layer is not a weekly history builder.
- GitHub Actions backup validation cannot bypass the sanitizer.
- Market Pricing Temperature remains waiting-for-history.

## Future Step

M-21 may open network in throttled mode for the first time. Source format verification can only become true under separate manual approval after actual CSV samples can be inspected.

No URLs. No provider endpoints.
