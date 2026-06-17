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

M-63a implements the weekly regional track. M-63b implements the monthly global aggregation track (evidence-only; no `peaceDividendRetreat` weight change). M-63c is reserved for reminder workflows.

The weekly trio is:

- Sanitizer: `scripts/world-order/sanitize-acled-weekly.mjs`
- Check: `scripts/check-world-order-acled-weekly.mjs`
- Importer: `scripts/world-order/fetch-acled.mjs` (also reads monthly)

The monthly trio is:

- Sanitizer: `scripts/world-order/sanitize-acled-monthly.mjs`
- Check: `scripts/check-world-order-acled-monthly.mjs`
- Importer: `scripts/world-order/fetch-acled.mjs` (shared with weekly; combines both tracks)

The sanitizer reads operator-downloaded xlsx files and overwrites derived JSON:

```text
manual-artifacts/world-order/acled-input/weekly/*.xlsx
  -> npm run acled:sanitize:weekly
  -> config/world-order-acled-regional-weekly.json
```

The importer reads only the derived JSON. It does not import `xlsx`, does not read ACLED credentials, and does not call any ACLED network endpoint.

`xlsx@0.18.5` is authorized by ADR-0013 only for local development tools. In M-63a/M-63b it is imported only by:

```text
scripts/world-order/sanitize-acled-weekly.mjs
scripts/world-order/sanitize-acled-monthly.mjs
```

Runtime production code remains zero-dep:

- `scripts/build-world-order-stress.mjs` does not import `xlsx`.
- `scripts/world-order/fetch-acled.mjs` does not import `xlsx`.
- `scripts/check-world-order-acled-weekly.mjs` does not import `xlsx`.
- `scripts/check-world-order-acled-monthly.mjs` does not import `xlsx`.
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

Monthly files are out of scope for M-63a's weekly sanitizer. The weekly sanitizer must not be made to read monthly files; the dedicated monthly sanitizer (`sanitize-acled-monthly.mjs`, M-63b) handles them.

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

`ok` (M-63b semantics) means **both** weekly and monthly sanitized JSON files exist, parse, and have `quality.isRealData === true`. Confidence caps at 0.90 when both tracks are present.

`partial` (live since M-63b) means exactly one of weekly / monthly is `ok` and the other is missing, marked as not-real, or had a parse error. Weekly remains the priority signal; monthly errors degrade to `partial` rather than escalate to `error`.

`manual_required` means neither weekly nor monthly data has been ingested. This is non-blocking and does not fail `check:all`.

`error` means the weekly JSON exists but cannot be parsed. Monthly parse errors do not escalate to `error` (soft-degradation per M-63b decision).

`not_configured` is the pre-M-63a baseline state retained for compatibility with already-committed `data/world-order-stress.json` until the next build emits a current status.

Scoring impact:

- `manual_required`: low placeholder score, not treated as evidence of conflict escalation.
- `error`: zero ACLED score.
- `partial`: low-confidence value; whichever track is `ok` provides evidence; the missing track does not contribute.
- `ok`: scoring formula still uses weekly event acceleration, fatalities, and civilian-targeting share; monthly YoY vs prior-3y average and last-12m vs prior-12m trend surface only as summary/evidence.

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

ACLED only affects the `peaceDividendRetreat` World Order dimension in M-63a/M-63b. M-63b is **evidence-only**: monthly metrics surface as evidence and summary fields via `fetch-acled.mjs` but do not change the M-63a weights above. Any future weight rebalance that includes monthly must come from a separate M-63d source-review/backtest PR. ACLED does not enter the main decision model and does not affect execution or position guidance.

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
5. Run `npm run acled:status` — the one-command helper that runs `acled:sanitize:weekly` + `check:world-order-acled-weekly` and then reports a config-vs-data verdict (expect `data_current`; a fresh local refresh that has not yet propagated to data reports `sanitized_not_refreshed`). `npm run acled:status:weekly` is an explicit alias. To run the steps individually instead: `npm run acled:sanitize:weekly` then `npm run check:world-order-acled-weekly`. If the verdict is `sanitized_not_refreshed`, `npm run acled:publish` is the explicit opt-in full-chain helper (checks weekly + monthly, commits any changed derived config, pushes, dispatches "Refresh World Order Stress", watches CI, pulls, then re-verifies both tracks; requires authenticated `gh` CLI) — it replaces manual steps 7-8 below; `acled:status` itself stays read-only.
6. Run `npm run check:all`; M-63b expects 69 items to pass.
7. Review `config/world-order-acled-regional-weekly.json`.
8. Commit the derived JSON with a focused operator refresh commit:

```text
git add config/world-order-acled-regional-weekly.json
git commit -m "data: refresh ACLED weekly regional aggregate"
git push
```

Raw xlsx files must remain untracked. Only the derived JSON should be committed during an operator refresh.

If the sanitizer reports missing regions, the operator may still commit a partial weekly import if that is intentional, but the PR/commit note should say which regions were missing.

If the sanitizer reports stale or expired latest week, download a newer batch before committing.

## Dependency CVE Disclosure & Risk Acceptance

### Known CVEs in `xlsx@0.18.5`

The `xlsx` (SheetJS Community Edition) library added in M-63a under ADR-0013 has two publicly disclosed high-severity vulnerabilities with **no fix available** in the Community Edition npm package. Fixes are only provided in SheetJS Pro (commercial license, $5k-$50k/year), which is out of scope for this project.

| Advisory | Type | Severity | Status |
|---|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Prototype Pollution | High | No fix in Community Edition |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS (Regular Expression DoS) | High | No fix in Community Edition |

`npm audit` will report these as `1 high severity vulnerability` indefinitely on this repository.

### Threat model

**Attacker capability required:** A malicious actor would need to craft a specifically-poisoned `.xlsx` file and arrange for the operator to download and process it.

**Realistic source of malicious xlsx:** The only xlsx files this project processes come from manual downloads at `https://acleddata.com/conflict-data/download-data-files`, performed by the operator while logged into a personal myACLED account. ACLED is a Wisconsin-registered research organization (ACLED Analysis, Incorporated) used by the UN, World Bank, and Carnegie Endowment. For an attack to succeed, ACLED itself would need to deliberately poison its publicly-published aggregated data files — an effectively zero-probability scenario given their institutional model.

**Worst-case impact if exploit triggered:**
- Local Node process running the sanitizer becomes unresponsive (ReDoS) or has its global object prototypes polluted (Prototype Pollution)
- Operator kills the process (Ctrl+C) and the issue is resolved
- **No data exfiltration** — sanitizer reads xlsx, writes derived JSON, has no network access
- **No persistence** — sanitizer is a one-shot script, no resident process
- **No lateral movement** — sanitizer does not access files outside `manual-artifacts/world-order/acled-input/` and `config/world-order-acled-regional-weekly.json`

### Why ADR-0013 makes this acceptable

ADR-0013 was designed exactly for this scenario. The vulnerable library is structurally prevented from reaching production paths:

| Path | Imports xlsx? | Verified by |
|---|---|---|
| Dashboard frontend (`index.html`, dashboard JS) | No | Zero-dep policy (ADR-0001) |
| GitHub Actions workflows (`refresh-world-order-stress.yml`, etc.) | No | `grep -r "from ['\"]xlsx" .github/` returns 0 |
| `build:world-order` pipeline | No | `grep -r "from ['\"]xlsx" scripts/build-*` returns 0 |
| `check:all` chain (69 items) | No | `grep -r "from ['\"]xlsx" scripts/check-*` returns 0 |
| `scripts/world-order/fetch-acled.mjs` (importer) | No | M-63a/b explicitly forbade; verified by grep at merge time |
| `scripts/world-order/sanitize-acled-weekly.mjs` (weekly sanitizer) | Yes | Runs manually on operator's local PowerShell |
| `scripts/world-order/sanitize-acled-monthly.mjs` (monthly sanitizer, M-63b) | Yes | Runs manually on operator's local PowerShell |

The vulnerable code path executes only when the operator manually runs `npm run acled:sanitize:weekly` against trusted xlsx files in `manual-artifacts/`. No production runtime path is exposed.

`npm audit --omit=dev` (production-only audit) returns **0 vulnerabilities**, confirming the runtime surface is unaffected.

### Risk acceptance decision

**Date:** 2026-05-19
**Decided by:** Project owner
**Decision:** Accept the CVE risk.

**Rationale:**
1. Actual exploitation requires ACLED-as-attacker, which is implausible
2. Worst-case impact (local process crash) has no data or persistence consequences
3. Runtime production surface is structurally unaffected (ADR-0013 isolation)
4. Alternatives evaluated:
   - **Switch to `exceljs`** — viable but requires re-implementing the sanitizer's xlsx reading logic (~30-50 LoC); deferred unless circumstances change
   - **SheetJS Pro** — $5k-$50k/year commercial license; not justified for a personal project

### Monitoring and re-evaluation triggers

This decision should be re-evaluated if any of the following occur:
- `xlsx` is ever imported by code outside `scripts/world-order/sanitize-acled-weekly.mjs` and `scripts/world-order/sanitize-acled-monthly.mjs` — would violate ADR-0013 isolation
- A new CVE in `xlsx` allows remote exploitation without a crafted file (extremely unlikely given the architecture)
- The project pivots to processing untrusted xlsx files (e.g., user uploads) — this would invalidate the threat model entirely
- ACLED experiences a compromise affecting their data distribution

### Operator runbook for future `npm install`

When the operator runs `npm install` (e.g., on a new machine clone or after dependency changes), `npm audit` will display:

```
1 high severity vulnerability
Some issues need review, and may require choosing a different dependency.
Run `npm audit` for details.
```

**This is expected.** Refer to this section to confirm the issue is known and accepted. Do not treat this as a regression.

To verify nothing has changed in the threat model, run:

```powershell
npm audit --omit=dev    # Should return: 0 vulnerabilities
grep -r "from ['\"]xlsx" scripts/    # Should return only sanitize-acled-weekly.mjs and sanitize-acled-monthly.mjs
```

Both checks passing means the CVE acceptance still holds.

## 9B. M-63b Monthly Refresh Procedure

M-63b adds the monthly global aggregation track. The operator downloads exactly six aggregated xlsx files from `https://acleddata.com/conflict-data/download-data-files` (the "Aggregated data files" panel, monthly section):

- `number_of_demonstration_events_by_country-year_as-of-<DD><Mmm><YYYY>.xlsx`
- `number_of_events_targeting_civilians_by_country-year_as-of-<DD><Mmm><YYYY>.xlsx`
- `number_of_political_violence_events_by_country-month-year_as-of-<DD><Mmm><YYYY>.xlsx`
- `number_of_political_violence_events_by_country-year_as-of-<DD><Mmm><YYYY>.xlsx`
- `number_of_reported_civilian_fatalities_by_country-year_as-of-<DD><Mmm><YYYY>.xlsx`
- `number_of_reported_fatalities_by_country-year_as-of-<DD><Mmm><YYYY>.xlsx`

The six files share the same `as-of-<DD><Mmm><YYYY>` date stamp (e.g. `08May2026`). Five files are yearly cadence; the `country-month-year` file is the only monthly-cadence file. The sanitizer is strict: **all 6 files must be present**. Missing any file fails the sanitizer (committed JSON must always reflect a complete monthly snapshot — partial monthly imports are not allowed because `fetch-acled.mjs` treats a present monthly JSON as authoritative evidence).

Monthly refresh:

1. Open `https://acleddata.com/conflict-data/download-data-files` manually in a browser.
2. Download the 6 monthly aggregated xlsx files (one batch per refresh; all 6 must share the same `as-of` date).
3. Place the files under `manual-artifacts/world-order/acled-input/monthly/`.
4. On first use after M-63a, run `npm install` so the `xlsx` devDependency is installed.
5. Run `npm run acled:status:monthly`. This one-command helper runs `acled:sanitize:monthly` + `check:world-order-acled-monthly` and then reports a config-vs-data verdict (it is the monthly sibling of `npm run acled:status`; see Section 9 for weekly). Expect `data_current`; a fresh local refresh that has not yet propagated to data reports `sanitized_not_refreshed`. If the verdict is `sanitized_not_refreshed`, `npm run acled:publish` is the explicit opt-in full-chain helper (checks weekly + monthly, commits any changed derived config, pushes, dispatches "Refresh World Order Stress", watches CI, pulls, then re-verifies both tracks; requires authenticated `gh` CLI).
6. Run `npm run check:all`; M-63b expects 69 items to pass.
7. Review `config/world-order-acled-global-monthly.json`.
8. Commit the derived JSON with a focused operator refresh commit:

```text
git add config/world-order-acled-global-monthly.json
git commit -m "data: refresh ACLED monthly global aggregate"
git push
```

Raw xlsx files must remain untracked. Only the derived JSON should be committed during an operator refresh.

Monthly freshness thresholds (based on `asOfDate`):

- `≤ 35` days: `fresh`, no message
- `≤ 60` days: `aging` warning
- `≤ 120` days: `stale` warning
- `≤ 180` days: approaching-expiration warning
- `> 180` days: fail

### Monthly schema reference

M-63b writes:

```text
config/world-order-acled-global-monthly.json
```

Top-level fields:

- `version`: schema version, currently `1.0.0`.
- `source`: fixed literal `acled-aggregated-manual-normalized-monthly`.
- `sourceName`: human-readable source name.
- `preparedAt`: ISO timestamp when the sanitizer wrote the file.
- `preparedBy`: fixed literal `manual`.
- `asOfDate`: latest `as-of` date across the 6 input files (YYYY-MM-DD).
- `latestFullYear`: most recent fully-complete year (typically `asOfDate.year - 1`).
- `filesIngested`: 6 entries, one per file (exactly 6 required).
- `global`: cross-country annual aggregates for `latestFullYear`.
- `monthlyTrend`: last-12m vs prior-12m window derived from the country-month-year file.
- `topEscalatingCountries`: up to 10 entries, sorted by YoY vs prior-3y average; noise floor `latestFullYearEvents >= 50`.
- `topFatalitiesCountries`: up to 10 entries, sorted by latest-full-year fatalities.
- `quality`: source metadata and confidence (same canonical strings as weekly).

`global` fields:

- `politicalViolenceEventsLatestFullYear`
- `politicalViolenceEventsPrior3YearAverage`
- `politicalViolenceYoyDelta` — `latest / prior3yAvg - 1`, or `null` if `prior3yAvg <= 0`
- `demonstrationsLatestFullYear`
- `civilianTargetingEventsLatestFullYear`
- `civilianTargetingShareLatestFullYear` — civilian-targeting / political-violence in `latestFullYear`, clamped `[0, 1]` or `null`
- `fatalitiesLatestFullYear`
- `civilianFatalitiesLatestFullYear`
- `civilianFatalitiesShareLatestFullYear` — civilian / total fatalities in `latestFullYear`, clamped `[0, 1]` or `null`

`monthlyTrend` fields:

- `latest12mWindow`: `[startYYYY-MM, endYYYY-MM]` or `null`
- `prior12mWindow`: `[startYYYY-MM, endYYYY-MM]` or `null`
- `latest12mEvents`, `prior12mEvents`: non-negative integers
- `latest12mVsPrior12mDelta`: `latest12m / prior12m - 1`, or `null` if `prior12m === 0`

`topEscalatingCountries[]` fields:

- `country`
- `latestFullYearEvents` — integer `>= 50` (noise floor; enforced by check)
- `prior3YearAverageEvents`
- `yoyDelta`

`topFatalitiesCountries[]` fields:

- `country`
- `fatalities`

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
