# Market Pricing Network Open (Throttled) - v28.0M-21

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** today's state unless restated as current. Today: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

v28.0M-21 is the FIRST M-series step that can open the network. It remains
audit-only and manual-artifacts-only.

Default mode is dry-run, with the network closed. A real fetch requires the
explicit `--network=open-throttled` flag.

## Boundaries

- Max 1 fetch per invocation.
- 30-second timeout enforced with AbortController.
- Max 1 retry, with no exponential backoff.
- Source URL is read from
  `docs/fixtures/market-pricing/network-open-throttled-manifest-v28.0M-21.json`.
- The manifest contains exactly ONE entry: Stooq public CSV for QQQ.
- Response is written ONLY to
  `manual-artifacts/market-pricing/network-fetch-attempts/`.
- Response is NEVER written to `data/*` or any production data file.
- `records=[]` in all reports. M-22 is the first record-write step.
- M-20 source format validation runs BEFORE any disk write of fetched body.
- HTML masquerade is rejected when the body starts with `<`.
- Empty body is rejected.
- Non-`text/*` Content-Type is rejected.
- No `process.env`, no auth header, no cookie header.
- No redirect across hostnames.

Inherited M-17 through M-20 boundaries remain false:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `sourceComplianceReviewed=false`
- `symbolMappingVerified=false`
- `sourceFormatVerified=false`

Market Pricing Temperature remains waiting-for-history. M-21 does not calculate
MA60, standard deviation, z-score, bands, or temperature.

Future M-22 will define the contract for writing the first real record to
history.

## Usage

```bash
# Dry-run (default; safe; network closed)
node scripts/market-pricing/network-open-throttled-scaffold.mjs --dry-run

# Throttled open (manual; first real fetch; writes to manual-artifacts only)
node scripts/market-pricing/network-open-throttled-scaffold.mjs --network=open-throttled
```

Do not run the throttled-open command from CI. It is a manual review operation
only.
