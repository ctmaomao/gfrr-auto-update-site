# GDELT Source Policy

This policy is the site-wide contract for GDELT usage. It exists because GDELT
is useful for broad global news coverage, but it should not be treated as a
high-frequency realtime API.

Official GDELT references:

- GDELT DOC / Context APIs are rate-limited to protect the underlying search
  clusters; high-volume keyword querying should move to Web NGrams 3.0:
  <https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/>
- GDELT Web NGrams v5 legacy files were published as a temporary
  non-consumptive keyword-search path while legacy search/API infrastructure is
  under pressure:
  <https://blog.gdeltproject.org/using-the-new-web-ngrams-dataset-to-find-relevant-coverage/>
- GDELT data is available through BigQuery and raw data files, with live
  datasets documented as updating around a 15-minute cadence:
  <https://www.gdeltproject.org/data.html>

## Current Registered Consumers

| Consumer | Current source | Runtime path | Cadence | Current fallback |
|---|---|---|---|---|
| World Order Stress | GDELT Cloud v2 `events/summary` low-frequency cache | `scripts/world-order/fetch-gdelt-cloud.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-world-order-cache.json` | daily workflow / explicit build; manual reruns use 12h fresh cache before any live Cloud attempt | fresh/stale GDELT cache first; previous `data/world-order-stress.json` GDELT summary remains final fallback |
| ODP Oil News Event Watch | GDELT DOC 2.0 broad cache query plus Tavily / Brave | `scripts/oil-directional/diagnose-oil-news-events.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-news-cache.json` | 2h workflow / manual dispatch; GDELT DOC live attempt only after the 24h fresh-cache or 24h error-cooldown window expires | Tavily / Brave source health remains visible; GDELT cache can be `ok` / `stale` / `error` / `not_initialized`; 429 keeps `lastUsableCache` for audit only |
| ODP Oil News Web NGrams diagnostic | GDELT Web NGrams v5 legacy `ngrams.txt.gz` files | `scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs` calls shared wrapper `fetchGdeltWebNgramsText`; output is ignored `manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json` only; P44 sample archive/review remains ignored under `manual-artifacts/oil-news/gdelt-web-ngrams-samples/` | manual dry-run by default; `--allow-network` live smoke tries recent candidate files; archive/review is no-network | source-review/manual diagnosis only; not production data and not a current Oil News signal enhancer |
| Bubble Watch `ceo_hedging` | GDELT DOC 2.0 compact cache plus Tavily / Brave / Wind fallback | `scripts/build-bubble-watch.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-bubble-watch-cache.json` | weekly build plus source-health audit | fresh/stale GDELT cache first; Tavily / Brave free fallback; Wind paid final fallback only when enabled |
| API secret diagnostic | GDELT Cloud v2 smoke checks | `.github/workflows/test-api-secrets.yml` | manual diagnostic | diagnostic-only; not production data |

## Rules

1. New GDELT calls must not be added directly to feature modules. They must first
   update this policy and pass `npm run check:gdelt-source-policy`.
2. GDELT DOC / Cloud endpoints are low-frequency, cacheable sources. They must
   not be used as tick-level or minute-level market feeds.
3. Queries should be broad and locally classified where possible. Prefer one
   wider GDELT request plus local bucket classification over one API request per
   keyword or bucket.
4. GDELT calls must be serial or centrally throttled. New concurrent GDELT
   `Promise.all` fan-out is not allowed.
5. 429 / 403 / 5xx responses must not make unrelated builds fail hard. They must
   degrade to `partial`, `stale`, `source_unavailable`, or an explicit fallback
   path.
6. Any retry must read `Retry-After` where available, use bounded retries, and
   stop after a small finite number of attempts.
7. Production artifacts must remain sanitized: no API keys, Authorization
   headers, raw provider responses, snippets, full article bodies, cookies, or
   bearer tokens.
8. GDELT-derived text must not confirm war, chokepoint closure, supply outage,
   tanker flow, refinery accident, sanctions impact, oil direction, or trading
   action by itself.

## Static Guard

`npm run check:gdelt-source-policy` enforces the current allowlist for endpoint
strings under runtime/check paths. The guard intentionally allows existing
registered paths during the migration, but blocks any new direct GDELT endpoint
reference outside the allowlist.

Allowed endpoint-reference files for this phase:

```text
.github/workflows/test-api-secrets.yml
scripts/check-gdelt-cloud-fetcher-integration.mjs
scripts/check-gdelt-source-policy.mjs
scripts/gdelt/fetch-gdelt.mjs
```

Documentation, committed production JSON, and source-candidate config may mention
GDELT for attribution or provenance, but they are not allowed to introduce new
runtime fetch paths.

## Migration Plan

P35, current phase:

- Document the site-wide policy.
- Add the static direct-endpoint guard.
- Do not change runtime behavior.

P36, current phase:

- Add a shared GDELT wrapper / adapter with serial request discipline,
  `Retry-After` handling, bounded retries, timeout, and sanitized diagnostics.
- Move ODP oil-news GDELT DOC calls behind that wrapper.
- Keep any remaining GDELT consumer migrations behind this policy and checker.

P37, current phase:

- Add a compact `data/gdelt-news-cache.json` or equivalent cache artifact.
- Change ODP oil-news from per-bucket GDELT queries to one broad GDELT query plus
  local bucket classification.
- Keep ODP GDELT DOC as a slow background source: 24h fresh cache, 72h stale
  fallback, 24h error cooldown, and no second retry inside an Oil News refresh.
- Preserve `lastUsableCache` on 429/error for audit context only; it must set
  `usedForCurrentSignal=false` and must not enhance the current Oil News signal.
- Keep Tavily / Brave per-topic cross-checks unchanged.
- Keep the cache display-only/audit-only and out of ODP `finalBias`, scoring,
  decision, execution, position, Brent promotion, Global Risk Heatmap, and
  cross-validation.

P38, current phase:

- Move Bubble Watch `ceo_hedging` to the shared GDELT wrapper.
- Add `data/gdelt-bubble-watch-cache.json` as a compact cache artifact for
  Bubble Watch CEO hedging evidence.
- Keep Refresh Bubble Watch as the only writer that commits the Bubble cache;
  source-health audit snapshots and restores it to remain read-only.
- Keep Tavily / Brave / Wind fallback behavior and the red-requires-two-sources
  rule unchanged.

P39, current phase:

- Move World Order GDELT Cloud fetcher to the shared GDELT wrapper.
- Add `data/gdelt-world-order-cache.json` as a compact cache artifact for the
  Cloud `events/summary` country/conflict query.
- Keep World Order Cloud low-frequency: 12h fresh cache, 72h stale fallback,
  6h error cooldown, and a single live attempt after cache expiry.
- Keep the public `data/world-order-stress.json` contract unchanged except for
  the normal source summary values; build-only `cacheArtifact` must be stripped
  before writing the public World Order artifact.
- Keep World Order overlay-only boundaries unchanged: the GDELT Cloud cache
  must not affect `values.*`, main scoring, decision, execution, position, ODP
  oil direction, Brent promotion, Global Risk Heatmap, or cross-validation.

P40, current phase:

- Add `npm run review:gdelt-cache-health` and `npm run check:gdelt-cache-health`
  as read-only post-migration cache health review commands.
- The review reads `data/gdelt-news-cache.json`,
  `data/gdelt-bubble-watch-cache.json`, `data/gdelt-world-order-cache.json`,
  and their production artifacts to distinguish true cache/schema failures from
  expected post-migration refresh lag.
- Default review/check mode does not fetch external sources, does not write
  production data, and treats post-migration placeholder/seed/old-query states
  as `WATCH` rather than hard failure. Operators may use `--strict` for manual
  hard review after scheduled refreshes have had time to run.

P41, current phase:

- Add `fetchGdeltWebNgramsText` to the shared wrapper for GDELT Web NGrams v5
  legacy gzip files.
- Add `diagnose:gdelt-web-ngrams` as a manual Oil News source-review smoke
  test. It is dry-run/no-network by default and only downloads files with
  `--allow-network`.
- P42 adds bounded latest-file discovery: the helper HEAD-probes recent
  heartbeat-style candidate timestamps with `probeGdeltWebNgramsFile`, then
  downloads only the first available `ngrams.txt.gz` file.
- Keep Web NGrams output ignored under `manual-artifacts/`; do not write
  `data/*.json`, `realtime/*.json`, workflows, frontend fields, Oil News
  production artifacts, ODP `finalBias`, scoring, decision, execution,
  position, Brent promotion, Global Risk Heatmap, or cross-validation.

P43, current phase:

- Add `review:gdelt-web-ngrams-samples` as a no-network manual sample reviewer
  for ignored Web NGrams diagnosis artifacts.
- The review reads only `manual-artifacts/` or `docs/fixtures/`, validates the
  `gdelt-web-ngrams-diagnosis-p41` boundary, and summarizes discovery stability,
  hit/doc ranges, bucket coverage, and term coverage.
- Even a `pass` review only means `ready_for_manual_web_ngrams_stability_review`;
  it does not approve production display fallback, Oil News signal enhancement,
  scoring, ODP direction, or any workflow/frontend wiring.

P44, current phase:

- Add `archive:gdelt-web-ngrams-samples` as a manual/local sample collector for
  ignored Web NGrams diagnosis artifacts.
- The archive tool reads only `manual-artifacts/` or `docs/fixtures/`, copies
  valid `gdelt-web-ngrams-diagnosis-p41` samples into
  `manual-artifacts/oil-news/gdelt-web-ngrams-samples/`, writes sidecars there,
  and invokes the P43 reviewer for a stability status.
- Readiness states are limited to `insufficient_samples`,
  `stable_manual_review_ready`, or `unstable_keep_manual_only`; even stable
  review does not approve production display fallback, Oil News signal
  enhancement, scoring, ODP direction, workflows, or frontend wiring.

P45, current phase:

- Add `gdelt-web-ngrams-fallback-source-review-p45` as the source-review gate
  for a possible future Web NGrams fallback. Its status is
  `source_review_manual_fallback_candidate_no_production_display`.
- The reviewed candidate role is
  `oil_news_gdelt_web_ngrams_background_fallback_display_only`: source-health
  and background phrase-heat context only.
- P45 explicitly keeps `productionDisplayFallbackApproved=false`,
  `currentSignalEnhancementApproved=false`, `workflowApproved=false`,
  `frontendApproved=false`, and `scoreApproved=false`.
- A later P46 production display-only fallback contract may be considered only
  after sufficient P44 samples exist; P45 itself does not approve production
  JSON, workflow, frontend, current Oil News signal enhancement, scoring, ODP
  direction, or cross-validation.

P46, current phase:

- Add `gdelt-web-ngrams-production-display-fallback-contract-p46` as a contract
  design for the possible future production display fallback field
  `sourceCaches.gdeltWebNgramsFallback`.
- The future display mode is fixed to
  `aggregate_source_health_only_no_headlines`: compact source-health and
  aggregate phrase-heat metadata only, with no titles, URLs, snippets, bodies,
  raw Web NGrams rows, raw provider responses, secrets, or request headers.
- P46 status remains
  `contract_design_only_waiting_for_sufficient_p44_samples_no_production_write`.
  It requires a P44 `stable_manual_review_ready` archive, at least 8 usable
  samples, at least 24 hours of observation, at least 2 selected timestamps, and
  required bucket coverage before any later writer can be reviewed.
- P46 keeps `productionWriteApproved=false`, `frontendApproved=false`,
  `workflowApproved=false`, `currentSignalEnhancementApproved=false`, and
  `scoreApproved=false`. It does not add a production JSON field, frontend
  rendering, workflow wiring, current Oil News signal enhancement, scoring, ODP
  direction, or cross-validation.

P47, current phase:

- Add `GDELT Web NGrams Sample Collector`
  (`.github/workflows/gdelt-web-ngrams-sample-collector.yml`) as
  artifact-only sample collection. It runs every 3 hours at `23 */3 * * *` UTC
  or by manual dispatch.
- The collector restores the previous `gdelt-web-ngrams-samples` artifact when
  available, runs `diagnose:gdelt-web-ngrams -- --allow-network`, archives the
  latest diagnosis, then runs the 8-sample gate review. It uploads the diagnosis,
  archived samples, and latest review as a GitHub artifact.
- The collector does not write production data, does not commit or push, does
  not run Oil News production build, does not use Tavily/Brave/GDELT Cloud/FIRMS
  secrets, and does not modify frontend, current Oil News signal, ODP direction,
  scoring, decision, execution, position, Brent promotion, Global Risk Heatmap,
  or cross-validation.

Future source-review only:

- Evaluate BigQuery / raw data files for large-scale historical backtests or a
  news-factor research library.

## Verification

```powershell
npm run check:gdelt-source-policy
npm run check:gdelt-web-ngrams-diagnosis
npm run check:gdelt-web-ngrams-sample-archive
npm run check:gdelt-web-ngrams-samples-review
npm run check:gdelt-web-ngrams-fallback-source-review
npm run check:gdelt-web-ngrams-production-display-fallback-contract
npm run check:gdelt-web-ngrams-sample-collector-workflow
npm run review:gdelt-cache-health -- --no-output
npm run check:gdelt-cache-health
npm run check:all
```

This policy does not approve any GDELT signal for core scoring, execution,
position guidance, or oil-price direction by itself.
