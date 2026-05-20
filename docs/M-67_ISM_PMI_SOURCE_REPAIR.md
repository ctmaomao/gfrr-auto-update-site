# M-67 ISM PMI Source Repair

## Context

M-47 added `macroDrivers.consumer.ismManufacturingPmi` as an audit-only growth-cycle field. Its selected FRED source (`FRED:NAPM`) now returns HTTP 404 through the same FRED CSV path used by the Daily pipeline, while `FRED:UMCSENT` still returns CSV normally. As a result, committed data kept `ismManufacturingPmi` and `ismManufacturingPmi3mChange` as `null`, with `sourceStatus.pmi` stuck on the old missing state.

Independent verification before M-67:

- FRED CSV for `FRED:NAPM` returns a 404 HTML error page, not data.
- FRED CSV for `FRED:UMCSENT` returns valid CSV.
- `scripts/run-daily-pipeline.mjs` still called `fetchFredSeries('NAPM', 420)`.
- The old catch branch swallowed the fetch error and only attempted previous-value fallback.

## Decision

M-67 replaces the broken FRED PMI source path with a parser for ISM's official public Manufacturing PMI report pages:

- Landing page: `https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/`
- Current report link: parsed from the landing page
- Report fields: headline Manufacturing PMI value and the last-12-month table
- Source label: `FRED:UMCSENT; ISM:ManufacturingPMI`

Field names and semantics remain unchanged: `ismManufacturingPmi`, `ismManufacturingPmi3mChange`, and `ismPmiRegime` still represent true ISM Manufacturing PMI data. No substitute manufacturing indicator is allowed to masquerade as PMI.

## Source Policy Disclosure

> M-67 reads the publicly served HTML of `https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/` and its linked current monthly report page. The fetcher identifies itself as `User-Agent: GFRRBot/1.0`. Cadence is monthly (driven by the Daily pipeline; ISM publishes new reports on the first business day of each month, so practical fetch yield is ~30 attempts per month, of which only one produces a new value). The parser extracts the headline PMI value and the last-12-month table only. No full HTML is stored; only the report URL, HTTP status, latency, and parse step diagnostics are persisted. No SSO / login / captcha bypass is attempted; any non-publicly-served content path is treated as `parse_error`. PMI remains audit-only / display-only in the project and never affects scoring, decision, execution, or position.

## Diagnostics Schema

`macroDrivers.consumer.diagnostics.pmi` is a small object. All fields are optional and emitted only when available:

| Field | Meaning |
|---|---|
| `httpStatus` | HTTP status for the current report page fetch |
| `landingHttpStatus` | HTTP status for the report landing page fetch |
| `latencyMs` | Combined landing + report latency, or failing fetch latency |
| `parsedAt` | ISO timestamp when the parser ran |
| `reportUrl` | Current report URL or failing URL |
| `reportMonthLabel` | Parsed report month, e.g. `April` |
| `errorReason` | Short fetch/network/HTTP failure reason |
| `parseStep` | Parser stage that failed |
| `snippetSample` | At most 200 characters of local context; never full HTML |

No raw HTML is written to `data/`, `realtime/`, `manual-artifacts/`, or docs.

## Fallback Ladder

1. `live`: ISM landing and report fetch succeed, headline PMI and last-12-month table parse successfully.
2. `fallback`: ISM fetch or parse fails, but the previous committed `prevConsumer.ismManufacturingPmi` is finite.
3. `source_unavailable`: network, timeout, or non-200 failure and no previous PMI value is available.
4. `parse_error`: public HTML was fetched, but expected report markers were missing, SSO/captcha/login content appeared, or table parsing failed and no previous PMI value is available.

The fallback ladder never fabricates PMI values and never substitutes a different manufacturing indicator.

## Operator Runbook

If PMI is missing for more than two monthly cycles:

1. Inspect `data/radar-data.json.macroDrivers.consumer.sourceStatus.pmi`.
2. Inspect `data/radar-data.json.macroDrivers.consumer.diagnostics.pmi`.
3. If status is `source_unavailable`, test the landing URL and current report URL from the runner environment.
4. If status is `parse_error`, compare `parseStep` and `snippetSample` with the current ISM page structure.
5. If ISM blocks public bot access or changes terms materially, open a new source-review PR; do not patch in a substitute indicator.

## Boundary

PMI remains audit-only / display-only. M-67 does not alter scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, workflows, frontend display logic, or production data files.
