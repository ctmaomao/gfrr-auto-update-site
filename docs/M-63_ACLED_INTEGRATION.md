# M-63 ACLED Integration

## 1. Overview

ACLED (Armed Conflict Location & Event Data) is the project's event-level conflict data source for the World Order Stress Overlay. It gives the overlay a more direct view of political violence, civilian targeting, fatalities, and hot zones than a media-volume proxy alone can provide.

This integration is intentionally manual. The owner applied for ACLED Research/Partner tier API access and was denied, so the prior API path is not reachable for this project. M-63a removes the old API adapter code and replaces it with a local manual-xlsx ingestion path.

The license model for this project is ACLED Open-license aggregated downloads:

- `sourceUrl`: `https://acleddata.com/conflict-data/download-data-files`
- `licenseLevel`: `open`
- `attribution`: `ACLED (Armed Conflict Location & Event Data) — https://acleddata.com`

Per ACLED EULA Section 3.3:

> "Scraping and crawling the Site is prohibited."

That quote is a hard architecture boundary. No workflow, script, fetcher, browser automation, or crawler may automatically access `acleddata.com`. The operator downloads the xlsx files manually in a browser; local scripts only read files already present in `manual-artifacts/`.

ACLED is a World Order overlay input. It is not a main decision model input and does not affect `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, or Invalidation Rules.

## 2. Architecture

M-63 uses 12 ACLED aggregated downloads across two refresh tracks:

- Weekly regional track: 6 regional files.
- Monthly global track: 6 global aggregation files.

M-63a implements only the weekly regional track. M-63b is reserved for monthly global aggregation. M-63c is reserved for reminder workflows.

The weekly trio is:

- Sanitizer: `scripts/world-order/sanitize-acled-weekly.mjs`
- Check: `scripts/check-world-order-acled-weekly.mjs`
- Importer: `scripts/world-order/fetch-acled.mjs`

The sanitizer reads operator-downloaded xlsx files and overwrites derived JSON:

```text
manual-artifacts/world-order/acled-input/weekly/*.xlsx
  -> npm run acled:sanitize:weekly
  -> config/world-order-acled-regional-weekly.json
```

The importer reads only the derived JSON. It does not import `xlsx`, does not read ACLED credentials, and does not call any ACLED network endpoint.

`xlsx@0.18.5` is authorized by ADR-0013 only for local development tools. In M-63a it is imported only by:

```text
scripts/world-order/sanitize-acled-weekly.mjs
```

Runtime production code remains zero-dep:

- `scripts/build-world-order-stress.mjs` does not import `xlsx`.
- `scripts/world-order/fetch-acled.mjs` does not import `xlsx`.
- `scripts/check-world-order-acled-weekly.mjs` does not import `xlsx`.
- Dashboard frontend code does not import `xlsx`.
- GitHub Actions workflows do not import `xlsx`.

The raw xlsx files are gitignored. The derived JSON is the only production-adjacent data artifact produced by the operator after manual download and local sanitization.

## 3. Weekly Refresh Procedure

M-63a covers weekly regional aggregation only.

The operator downloads these six regional aggregated files:

- Africa
- Middle-East
- Europe-and-Central-Asia
- United-States-and-Canada
- Latin-America-and-the-Caribbean
- Asia-Pacific

Expected filename pattern:

```text
<Region>_aggregated_data_up_to_week_of-YYYY-MM-DD_*.xlsx
```

The sanitizer is strict about region spelling and capitalization. Unknown regions are skipped with a warning. Missing expected regions are allowed, because the operator may be running a partial import, but the warning must be reviewed.

Weekly cadence follows ACLED's Monday/Tuesday regional release rhythm. If the latest week is 30-90 days old, the sanitizer and check warn. If it is more than 90 days old, they fail. Future-dated input fails immediately.

Monthly files are out of scope for M-63a. They are reserved for M-63b and must not be mixed into the weekly sanitizer.

## 4. Schema Reference

M-63a writes:

```text
config/world-order-acled-regional-weekly.json
```

Top-level fields:

- `version`: schema version, currently `1.0.0`.
- `source`: fixed literal `acled-aggregated-manual-normalized-weekly`.
- `sourceName`: human-readable source name.
- `preparedAt`: ISO timestamp when the sanitizer wrote the file.
- `preparedBy`: fixed literal `manual`.
- `latestWeek`: max `WEEK` date across all accepted input files.
- `filesIngested`: one entry per accepted regional file.
- `global`: cross-region aggregate metrics.
- `regionalLast4Weeks`: one entry per accepted region.
- `hotZonesLast4Weeks`: top country/admin1 combinations in the latest 4 global weeks.
- `quality`: source metadata and confidence.

`filesIngested[]` fields:

- `region`: canonical region name.
- `filename`: xlsx basename.
- `weekRange`: `[minWeek, maxWeek]` from that file.
- `rowCount`: number of data rows after the header.

`global` fields:

- `eventsLast4Weeks`: sum of regional latest-4-week events.
- `eventsLast12Weeks`: sum of regional latest-12-week events.
- `eventsDelta4Vs12`: `(eventsLast4Weeks / 4) / (eventsLast12Weeks / 12) - 1`, or `null` if 12-week events are zero.
- `fatalitiesLast4Weeks`: sum of regional latest-4-week fatalities.
- `fatalitiesLast12Weeks`: sum of regional latest-12-week fatalities.
- `civilianTargetingShareLast4Weeks`: civilian-targeting events divided by all latest-4-week events, clamped to `[0, 1]`, or `null` if latest-4-week events are zero.

`regionalLast4Weeks[]` fields:

- `region`: canonical region name.
- `events`: latest-4-week events.
- `fatalities`: latest-4-week fatalities.
- `civilianTargetingEvents`: latest-4-week events where `EVENT_TYPE === "Violence against civilians"`.
- `topCountriesByEvents`: up to 5 country names by latest-4-week event count.

`hotZonesLast4Weeks[]` fields:

- `country`
- `admin1`
- `events`
- `fatalities`

`quality` fields:

```jsonc
{
  "isRealData": true,
  "sourceUrl": "https://acleddata.com/conflict-data/download-data-files",
  "licenseLevel": "open",
  "attribution": "ACLED (Armed Conflict Location & Event Data) — https://acleddata.com",
  "methodologyNoteZh": "...",
  "confidence": 0.85
}
```

The three canonical metadata fields are owned by `docs/DATA_SOURCES.md`. Drift between this document, code, and derived JSON is a contract violation.

## 5. Aggregation Methodology

The sanitizer reads one sheet named `Sheet1` and validates exactly 13 columns:

```text
WEEK, REGION, COUNTRY, ADMIN1, EVENT_TYPE, SUB_EVENT_TYPE, EVENTS, FATALITIES, POPULATION_EXPOSURE, DISORDER_TYPE, ID, CENTROID_LATITUDE, CENTROID_LONGITUDE
```

Any header drift fails the sanitizer. This protects downstream schema expectations and prevents silent ACLED format changes from entering the overlay.

For each region:

- Distinct `WEEK` values are sorted descending.
- Latest 4 distinct weeks define the 4-week window.
- Latest 12 distinct weeks define the 12-week window.
- `EVENTS` and `FATALITIES` are summed within each window.
- Civilian-targeting events are summed from rows where `EVENT_TYPE` is exactly `Violence against civilians`.
- Top countries are ranked by latest-4-week event count.

For global metrics:

- Latest-4 and latest-12 metrics are sums of the accepted regional aggregates.
- `eventsDelta4Vs12` compares the latest 4-week weekly average against the latest 12-week weekly average.
- `civilianTargetingShareLast4Weeks` measures the share of latest-4-week events that were violence against civilians.

For hot zones:

- The latest 4 distinct weeks across all accepted files are selected.
- Rows are grouped by `(COUNTRY, ADMIN1)`.
- Groups are ranked by `EVENTS`, then `FATALITIES`.
- The top 10 are emitted.

This is a near-term conflict-density lens. SIPRI remains the annual military-expenditure slow variable. ACLED and SIPRI answer different questions and should not be collapsed into one source.

## 6. Status Semantics

`fetch-acled.mjs` emits statuses for `externalSources.acled`.

`ok` means a sanitized weekly JSON file exists, parses, and has `quality.isRealData === true`. In M-63a this means weekly data is available; M-63b will decide how weekly and monthly combine.

`manual_required` means no weekly data has been ingested, or the local JSON is not marked as real data. This is non-blocking and does not fail `check:all`.

`error` means the local JSON exists but cannot be parsed or validated by the importer/check path. This degrades confidence and should be investigated, but it remains a World Order overlay issue rather than a main decision gate.

`partial` is reserved for M-63b, when weekly or monthly data may be available without the other track.

`not_configured` is the pre-M-63a baseline state retained for compatibility with already-committed `data/world-order-stress.json` until the next build emits `manual_required`.

Scoring impact:

- `manual_required`: low placeholder score, not treated as evidence of conflict escalation.
- `error`: zero ACLED score.
- `partial`: reserved low-confidence value for M-63b.
- `ok`: formula uses event acceleration, fatalities, and civilian-targeting share.

## 7. Scoring Weight Change

Before M-63a, `peaceDividendRetreat` used:

```text
SIPRI 0.45 + GDELT 0.25 + existing module score 0.30
```

After M-63a, it uses:

```text
SIPRI 0.35 + GDELT 0.20 + ACLED 0.25 + existing module score 0.20
```

The weights sum to 1.00:

```text
0.35 + 0.20 + 0.25 + 0.20 = 1.00
```

Rationale:

- SIPRI remains the slow structural military-spending anchor.
- GDELT remains a media/event proxy and narrative support layer.
- ACLED adds direct event-density evidence from manually downloaded aggregated data.
- Existing risk modules still provide market and macro context.

ACLED only affects the `peaceDividendRetreat` World Order dimension in M-63a. It does not enter the main decision model and does not affect execution or position guidance.

## 8. Attribution

The attribution string is:

```text
ACLED (Armed Conflict Location & Event Data) — https://acleddata.com
```

The source of truth is `docs/DATA_SOURCES.md`; this document intentionally matches it verbatim.

Wherever ACLED-derived signals are displayed in the frontend dashboard, the attribution string must appear near the ACLED-derived signal or source list. M-63a does not change frontend display. A later frontend PR must preserve the exact attribution string.

The derived JSON also carries:

```jsonc
{
  "sourceUrl": "https://acleddata.com/conflict-data/download-data-files",
  "licenseLevel": "open",
  "attribution": "ACLED (Armed Conflict Location & Event Data) — https://acleddata.com"
}
```

## 9. Operator Runbook

Weekly refresh:

1. Open `https://acleddata.com/conflict-data/download-data-files` manually in a browser.
2. Download the 6 weekly regional aggregated xlsx files.
3. Place the files under `manual-artifacts/world-order/acled-input/weekly/`.
4. On first use after M-63a, run `npm install` so the `xlsx` devDependency is installed.
5. Run `npm run acled:sanitize:weekly`.
6. Run `npm run check:world-order-acled-weekly`.
7. Run `npm run check:all`; M-63a expects 68 items to pass.
8. Review `config/world-order-acled-regional-weekly.json`.
9. Commit the derived JSON with a focused operator refresh commit:

```text
git add config/world-order-acled-regional-weekly.json
git commit -m "data: refresh ACLED weekly regional aggregate"
git push
```

Raw xlsx files must remain untracked. Only the derived JSON should be committed during an operator refresh.

If the sanitizer reports missing regions, the operator may still commit a partial weekly import if that is intentional, but the PR/commit note should say which regions were missing.

If the sanitizer reports stale or expired latest week, download a newer batch before committing.

## 10. Known Limitations

Open-license access does not provide an API path for this project. The owner was denied Research/Partner tier API access, so M-63a removes the old API adapter and does not keep it as a fallback.

Raw xlsx files are not committed. This protects the repository from bulky manual artifacts and keeps provenance clear: the committed artifact is the normalized JSON emitted by the sanitizer.

The `xlsx` library is authorized by ADR-0013 only for local development tools. It must stay isolated to sanitizer entry points.

ACLED EULA Section 7 includes AI/ML restrictions. This project uses ACLED-derived aggregate metrics for a dashboard overlay and does not train a model on ACLED data.

Historical API adapter code is preserved by git history. If Research tier access is ever obtained, recover the previous implementation with:

```text
git show <commit-prior-to-m-63a-merge>:scripts/world-order/fetch-acled.mjs
```

Do not reintroduce any automated access to `acleddata.com` without a new reviewed ADR and an explicit license review.
