# M-59 GDELT Cloud v2 Integration

## Motivation

M-59 resolves `docs/PROJECT_BACKLOG.md` P1-5. The legacy GDELT DOC API adapter queried `api.gdeltproject.org/api/v2/doc/doc` with several composite boolean article searches. Recent refresh attempts hit the practical limit of that path: two timeouts and two rate limits in one build attempt, leaving `data/world-order-stress.json::externalSources.gdelt` stale for about 10 days.

The project now has a live-verified GDELT Cloud v2 key. PR #210/#211 confirmed GitHub Actions can read `GDELT_CLOUD_API_KEY`, authenticate with `Authorization: Bearer ...`, and call `https://gdeltcloud.com/api/v2/events/summary` successfully.

## What Changed

- Replaced `scripts/world-order/fetch-gdelt.mjs` with `scripts/world-order/fetch-gdelt-cloud.mjs`.
- Deleted the old diagnostic script `scripts/world-order/diagnose-gdelt-source.mjs`; Git history preserves the legacy implementation.
- Kept the `externalSources.gdelt.summary` legacy schema fields that scoring and narratives already read:
  - `totalEvents`
  - `totalArticles`
  - `conflictEvents`
  - `sanctionsEvents`
  - `blockadeOrChokepointEvents`
  - `regionsCovered`
  - `topThemes`
  - `averageTone`
  - `toneProxy`
  - `successCount`
  - `failureCount`
  - `rateLimitedCount`
  - `usedCachedSummary`
  - `cacheReason`
  - `queriesRun`
- Added Cloud v2 summary fields:
  - `topCountries`
  - `countryCount`
  - `fatalityEventCount`
  - `fatalities`
  - `keyConflictRegions`
  - `requestsUsed`
  - `apiBudget`
- Added the daily workflow `.github/workflows/refresh-world-order-stress.yml`.
- Added `check:gdelt-cloud-fetcher-integration` and wired it into `check:all`.

## Fetch Shape

The fetcher makes one request per refresh:

```text
GET https://gdeltcloud.com/api/v2/events/summary?group_by=country&event_family=conflict&date_start=<7-days-ago>&date_end=<today>
```

Headers:

```text
Authorization: Bearer ${GDELT_CLOUD_API_KEY}
Accept: application/json
User-Agent: gfrr-world-order-stress/1.0
```

The free tier is 100 query units per month. The scheduled workflow uses one query per day, about 30 per month.

## Failure Behavior

Missing `GDELT_CLOUD_API_KEY` returns `status: "not_configured"` and does not throw. Network failures, timeouts, 403/429, and 5xx responses reuse the previous summary when available and mark the source `stale`. Invalid keys or other non-recoverable 4xx responses return `error` without pretending that stale data is fresh.

## Narrative Additions

`buildWorldOrderNarrative` keeps all existing M-51 logic and adds four supporting evidence branches when `externalSources.gdelt.status === "ok"`:

- `gdelt_event_density`
- `gdelt_multi_country`
- `gdelt_fatalities`
- `gdelt_key_regions`

These are supporting evidence only. They do not alter scoring, decision, execution, position, nav, DOM, frontend cache, or the seven-narrative framework.

## Workflow

`Refresh World Order Stress` runs:

- `workflow_dispatch`
- Daily cron `0 23 * * *`, 30 minutes after Build Daily Radar Data

The workflow runs `npm run build:world-order`, then `npm run check:world-order`, and commits only `data/world-order-stress.json` if the data changed.

## Secret Setup

GitHub repository secret:

```text
GDELT_CLOUD_API_KEY
```

The value must never be committed or printed. It is consumed only by `scripts/world-order/fetch-gdelt-cloud.mjs` through `process.env` and by the workflow through `${{ secrets.GDELT_CLOUD_API_KEY }}`.

## ACLED Deferral

ACLED is deferred to M-60. The diagnostic workflow showed ACLED OAuth can work, but the current Open-tier account returns 403 for API access. The user is requesting a Research/Partner tier upgrade separately.

## Expected Post-Merge Action

After merge, manually trigger `Refresh World Order Stress` once. Expected outcome:

- `externalSources.gdelt.status === "ok"`
- `externalSources.gdelt.summary.totalEvents > 0`
- world-order cross-validation can show the four new GDELT Cloud supporting branches when thresholds are met
