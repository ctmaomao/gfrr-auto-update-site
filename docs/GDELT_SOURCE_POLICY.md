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
| ODP Oil News Event Watch | GDELT DOC 2.0 broad cache query plus Tavily / Brave | `scripts/oil-directional/diagnose-oil-news-events.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-news-cache.json` | 2h workflow / manual dispatch; GDELT DOC live attempt only after the 24h fresh-cache or classified error-cooldown window expires; one bounded retry with `Retry-After` + jitter | Tavily / Brave source health remains visible; 429 cools down 24h, timeout/network 4h, 5xx 6h, other errors 12h; stale cache may remain current only for non-rate-limit failures, while 429 keeps `lastUsableCache` for audit only |
| ODP Oil News Web NGrams fallback | GDELT Web NGrams v5 legacy `ngrams.txt.gz` files | integrated Oil News build performs one shared pair fetch and derives `sourceCaches.gdeltWebNgramsFallback` from its sanitized diagnosis | existing sample collector remains artifact-only every 3h; `Refresh Oil News Event Watch` writes `gdelt-web-ngrams-display-fallback-cache-v2` from the integrated fetch | automated display-only aggregate source health; not a current Oil News signal, no headlines/URLs, no scoring |
| ODP Oil News Web NGrams article-discovery shadow | Timestamp-matched GDELT Web NGrams v5 legacy `ngrams.txt.gz` + `toc.json.gz` pair plus existing Tavily/Brave results | integrated Oil News build joins/dedupes/classifies in memory, writes aggregate-only `sourceCaches.gdeltWebNgramsArticleShadow`, and uploads a sanitized ignored observation | same Oil News refresh; no second Web download and no additional Tavily/Brave calls | 30-day shadow observation only; frontend/current signal/event confirmation/scoring all disabled |
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
  fallback, classified error cooldown (429 24h; timeout/network 4h; 5xx 6h;
  other 12h), and exactly one bounded retry inside an Oil News refresh.
- Preserve `lastUsableCache` on 429/error for audit context only; it must set
  `usedForCurrentSignal=false` and must not enhance the current Oil News signal.
- Persist only a bounded 64-row sanitized DOC availability history and derived
  7/30-day success rates; never store request URLs, article text, headers, or
  secrets in availability telemetry.
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

P48, current phase:

- Add `sanitize:gdelt-web-ngrams-artifacts` with sanitizer version
  `gdelt-web-ngrams-artifact-sanitizer-p48`.
- The sanitizer removes legacy `selectedFile.url`, URL-bearing fields, raw title,
  body, snippet, raw response, and raw row markers from ignored Web NGrams
  diagnosis/sample artifacts.
- The collector now sanitizes restored `gdelt-web-ngrams-samples` artifacts and
  the latest diagnosis before archive/review, so pre-P48 artifacts cannot block
  the later 8-sample gate only because they carried a file URL.
- The archive tool writes sanitized sample files instead of copying raw input,
  and the reviewer blocks any remaining URL/title/body/raw-response marker.
- P48 does not write production data, does not add production display fallback,
  does not enhance the current Oil News signal, and does not affect frontend,
  scoring, ODP direction, decision, execution, position, Brent promotion,
  Global Risk Heatmap, or cross-validation.

P49, current phase:

- Add `gdelt-web-ngrams-fallback-gate-review-p49` as the formal sample-gate
  review after the collector accumulated enough sanitized Web NGrams samples.
- The reviewed artifact passed the P46 gate: at least 8 usable samples, at
  least 24 hours of observation, at least 2 selected timestamps, no blockers,
  required bucket coverage, and no raw title/URL/body/raw-response exposure.
- P49 status is
  `sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write`.
  It allows only the next dry-run projection step
  `p50_display_only_fallback_projection_dry_run_no_production_write`.
- P49 keeps production writes, frontend display, workflow wiring, current Oil
  News signal enhancement, scoring, ODP direction, decision, execution,
  position, Brent promotion, Global Risk Heatmap, and cross-validation disabled.

P50, current phase:

- Add `gdelt-web-ngrams-display-fallback-projection-p50` as a dry-run-only
  projection from the P49 sample gate into a possible future
  `sourceCaches.gdeltWebNgramsFallback` compact display field.
- P50 status is
  `display_only_fallback_projection_ready_no_production_write`, and the only
  generated output is the ignored manual artifact
  `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json`.
- The projected display mode remains
  `aggregate_source_health_only_no_headlines`: source-health, sample gate, and
  aggregate phrase-heat metadata only, with no titles, URLs, snippets, bodies,
  raw rows, raw responses, secrets, or request headers.
- P50 keeps `productionWriteApproved=false`, `frontendApproved=false`,
  `workflowApproved=false`, `currentSignalEnhancementApproved=false`, and
  `scoreApproved=false`. It does not write production data, does not add
  frontend or workflow wiring, and does not affect current Oil News signal,
  ODP direction, scoring, decision, execution, position, Brent promotion,
  Global Risk Heatmap, or cross-validation.
- The next allowed step is
  `p51_display_only_fallback_projection_review_no_production_write`.

P51, current phase:

- Add `gdelt-web-ngrams-display-fallback-projection-review-p51` as a
  manual/local review of one or more P50 projection artifacts.
- P51 status is `display_fallback_projection_review_passed_no_production_write`
  when at least one projection passes the sample, no-raw-content, absent-field,
  and all-approvals-false checks.
- The review command is `review:gdelt-web-ngrams-display-fallback-projections`;
  the check command is
  `check:gdelt-web-ngrams-display-fallback-projection-review`.
- P51 keeps `productionWriteApproved=false`, `frontendApproved=false`,
  `workflowApproved=false`, `currentSignalEnhancementApproved=false`, and
  `scoreApproved=false`. It does not write production data, does not add
  frontend or workflow wiring, and does not affect current Oil News signal,
  ODP direction, scoring, decision, execution, position, Brent promotion,
  Global Risk Heatmap, or cross-validation.
- The next allowed step is
  `p52_display_only_fallback_writer_contract_design_no_production_write`.

P52, current phase:

- Add `gdelt-web-ngrams-display-fallback-writer-contract-design-p52` as a
  contract-design-only step for a possible future
  `sourceCaches.gdeltWebNgramsFallback` compact display cache.
- P52 status is
  `display_only_fallback_writer_contract_design_no_production_write`; it only
  defines the future `gdelt-web-ngrams-display-fallback-cache-v1` field shape.
- The future display mode remains
  `aggregate_source_health_only_no_headlines`: source-health, sample gate, and
  aggregate phrase-heat metadata only, with no titles, URLs, snippets, bodies,
  raw rows, raw responses, secrets, request headers, event confirmation, or oil
  direction input.
- P52 keeps `productionWriteApproved=false`,
  `writerImplementationApproved=false`, `frontendImplementationApproved=false`,
  `workflowAutomationApproved=false`, `liveFetchApproved=false`,
  `apiKeyReadApproved=false`, `currentSignalEnhancementApproved=false`, and
  `scoreApproved=false`. It does not create a writer, write production data,
  add frontend or workflow wiring, or affect current Oil News signal, ODP
  direction, scoring, decision, execution, position, Brent promotion, Global
  Risk Heatmap, or cross-validation.
- The next allowed step is
  `p53_display_only_fallback_disabled_writer_scaffold_no_production_write`.

P53, current phase:

- Add `gdelt-web-ngrams-display-fallback-disabled-writer-p53` as a disabled
  writer scaffold for the future `sourceCaches.gdeltWebNgramsFallback` compact
  display cache.
- P53 status is `disabled_no_production_write`; writer state is
  `disabled_scaffold_no_production_write`; generated output is ignored under
  `manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-latest.json`.
- The project command is
  `project:gdelt-web-ngrams-display-fallback-disabled-writer`; the check command
  is `check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold`.
- P53 keeps `productionDataWriteApproved=false`,
  `productionWriteApproved=false`, `writerImplementationApproved=false`,
  `frontendImplementationApproved=false`, `workflowAutomationApproved=false`,
  `liveFetchApproved=false`, `apiKeyReadApproved=false`,
  `currentSignalEnhancementApproved=false`, and `scoreApproved=false`. It does
  not write production data, add frontend or workflow wiring, or affect current
  Oil News signal, ODP direction, scoring, decision, execution, position, Brent
  promotion, Global Risk Heatmap, or cross-validation.
- The next allowed step is
  `p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write`.

P54, current phase:

- Add `gdelt-web-ngrams-display-fallback-disabled-writer-review-p54` as a
  manual/local review of one or more P53 disabled writer scaffold artifacts.
- P54 passing state is
  `disabled_writer_scaffold_review_passed_no_production_write`; it only confirms
  the disabled scaffold remains no-production-write, future-field-absent,
  aggregate-only, raw-content-free, sample-gated, and all approvals false.
- The review command is
  `review:gdelt-web-ngrams-display-fallback-disabled-writer`; the check command
  is `check:gdelt-web-ngrams-display-fallback-disabled-writer-review`.
- P54 keeps `productionDataWriteApproved=false`,
  `productionWriteApproved=false`, `writerImplementationApproved=false`,
  `frontendImplementationApproved=false`, `workflowAutomationApproved=false`,
  `currentSignalEnhancementApproved=false`, and `scoreApproved=false`. It does
  not write production data, add frontend or workflow wiring, or affect current
  Oil News signal, ODP direction, scoring, decision, execution, position, Brent
  promotion, Global Risk Heatmap, or cross-validation.
- The next allowed step is
  `p55_display_only_fallback_production_write_readiness_gate_no_production_write`.

P55, current phase:

- Add `gdelt-web-ngrams-display-fallback-production-write-readiness-p55` as a
  production-write readiness gate. P55 itself does not write production data.
- P55 status is `production_display_only_write_ready_no_production_write`; it
  grants only `p56ProductionDataWriteApproved=true`,
  `p56ProductionWriteApproved=true`, and `p56WriterImplementationApproved=true`
  for the single future field
  `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback`.
- The review command is
  `review:gdelt-web-ngrams-display-fallback-production-write-readiness`; the
  check command is
  `check:gdelt-web-ngrams-display-fallback-production-write-readiness`.
- The allowed P56 write scope is compact display-only cache
  `gdelt-web-ngrams-display-fallback-cache-v1` with display mode
  `aggregate_source_health_only_no_headlines`; it must keep
  `currentSignalEnhancement=false`, `eventConfirmationSource=false`,
  `headlineSource=false`, `oilDirectionInput=false`, and
  `eligibleForScoring=false`.
- P55 keeps `frontendImplementationApproved=false`,
  `workflowAutomationApproved=false`, `liveFetchApproved=false`,
  `apiKeyReadApproved=false`, `currentSignalEnhancementApproved=false`, and
  `scoreApproved=false`. It does not approve frontend display, workflow changes,
  current Oil News signal enhancement, ODP direction, scoring, decision,
  execution, position, Brent promotion, Global Risk Heatmap, or cross-validation.
- The next allowed step is `p56_display_only_fallback_production_display_write`.

P56, current phase:

- Add `gdelt-web-ngrams-display-fallback-cache-v1` as a scoped production
  display-only cache at
  `data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback`.
- The writer command is
  `write:gdelt-web-ngrams-display-fallback-production-cache`; the check command
  is `check:gdelt-web-ngrams-display-fallback-production-display-write`.
- The field is created from P55-reviewed fixture data only: no network, no
  environment variables, no provider headers, no raw article title, no URL, no
  snippet, no body, and no raw response.
- P56 sets `productionDataWriteApproved=true` for that single field, while
  preserving `frontendDisplayApproved=false`, `workflowAutomationApproved=false`,
  `liveFetchApproved=false`, `apiKeyReadApproved=false`,
  `currentSignalEnhancement=false`, `eventConfirmationSource=false`,
  `headlineSource=false`, `oilDirectionInput=false`, and
  `eligibleForScoring=false`.
- It does not change current Oil News signal, frontend rendering, workflows,
  ODP direction, scoring, decision, execution, position, Brent promotion, Global
  Risk Heatmap, or cross-validation.

P63, current frontend phase:

- `gdelt-web-ngrams-frontend-aggregate-health-p63` approves only the sanitized
  aggregate source-health/sample-gate row and sets
  `frontendDisplayApproved=true` on the production cache.
- No headline, URL, snippet, article body, raw response, or event claim is
  allowed in the frontend projection.
- The row remains background provenance only and explicitly reports that it is
  not used for the current Oil News signal.
- Workflow automation, live fetch, API-key reads, signal enhancement, ODP
  direction, scoring, decision, execution, position, Brent promotion, Global
  Risk Heatmap, and cross-validation remain unapproved.

Future source-review only:

- Evaluate BigQuery / raw data files for large-scale historical backtests or a
  news-factor research library.

2026-07-31 automated display-only phase:

- `Refresh Oil News Event Watch` performs one bounded pair fetch inside the
  existing Oil News build and updates `sourceCaches.gdeltWebNgramsFallback`
  from the same in-memory diagnosis.
- The production contract is `gdelt-web-ngrams-display-fallback-cache-v2`; it
  stores source-file timestamp, source availability, and compact aggregate
  counts only. It stores no headline, URL, snippet, article body, raw row, or
  provider response.
- `workflowAutomationApproved=true` and `liveFetchApproved=true` apply only to
  this keyless aggregate source-health write. The cache is not a current Oil
  News signal and keeps `currentSignalEnhancement=false`,
  `oilDirectionInput=false`, and `eligibleForScoring=false`.
- A failed latest-file attempt may preserve a prior v2 observation for at most
  12 hours as `stale`; after that it fails closed to `source_unavailable`.

P69A article-pair adapter foundation:

- ADR-0020 defines Web NGrams as a candidate replacement for the GDELT DOC
  article-discovery role, not as a direct ODP or oil-price signal.
- `scripts/gdelt/gdelt-web-ngrams-pair.mjs` probes and fetches a timestamp only
  as an atomic `ngrams.txt.gz` + `toc.json.gz` pair through the shared wrapper.
  A missing half fails closed and the adapter does not expose provider URLs.
- Raw NGRAMS/TOC text is transient in-memory data. P69A has no workflow,
  production writer, current-signal, frontend, scoring, decision, execution,
  position, Brent-promotion, ODP-finalBias, Heatmap, or cross-validation
  approval.
- Later stages must add sanitized article joining, multilingual
  classification, deduplication, independent-source confirmation, and a
  reviewed shadow gate before DOC discovery can be retired.

P69B sanitized article candidates:

- `scripts/oil-directional/oil-news-query-taxonomy.mjs` is the single
  query-taxonomy authority for the existing diagnosis and the new candidate
  join path.
- `scripts/oil-directional/gdelt-web-ngrams-article-candidates.mjs` joins
  NGRAMS document IDs to the timestamp-matched TOC and deduplicates canonical
  URLs. Invalid counts, TOC rows, dates, and URLs fail closed.
- Raw titles and URLs remain transient in memory. The sanitized shadow shape
  contains compact metadata and irreversible hashes only, and is not approved
  for a production data write.
- P69B has no workflow, production writer, frontend, current-signal, scoring,
  decision, execution, position, Brent-promotion, ODP-finalBias, Heatmap, or
  cross-validation approval.

P69C multilingual shadow classification:

- Taxonomy v2 supports explicit `en`, `zh`, `ar`, `ru`, and `es` term/rule
  families while keeping topic context separate from directional rules.
- A context-only match must remain `market_reaction_only` or
  `unclear_or_high_claim`; it cannot become an escalation claim solely because
  an article mentions a tanker, crude oil, or a chokepoint.
- Sanitized classification may retain rule IDs and compact language/polarity/
  event/axis counts, but not matched source text, titles, or URLs.
- P69C remains ignored shadow-only with no workflow, production writer,
  frontend, current-signal, event-confirmation, or scoring approval.

P69D cross-source shadow telemetry:

- Exact canonical-URL or normalized-title overlap with Tavily/Brave measures
  discovery coverage only; it is not independent editorial confirmation.
- Independent support requires a different editorial domain, no more than 36
  hours of timestamp separation, matching claim axis and explicit directional
  polarity, and at least one shared bucket. Cross-provider support additionally
  requires both Tavily and Brave and at least two supporting domains.
- Telemetry stores only compact identities/classifications/counts. Titles,
  URLs, snippets, bodies, matched text, raw responses, headers, and secrets are
  forbidden.
- Independent support is still a noisy shadow quality measure, not a confirmed
  event and not a current Oil News signal or scoring input.

P69E automated article shadow observation:

- The Oil News build reuses the current Tavily/Brave transient results and one
  Web NGrams pair fetch. A second Web download or additional provider query for
  shadow comparison is forbidden.
- Production may contain only aggregate
  `sourceCaches.gdeltWebNgramsArticleShadow`; per-article hashes/domains remain
  in an ignored sanitized artifact uploaded for 35 days.
- The production cache records a 30-day / 120-sample minimum observation policy
  but keeps `promotionEligible=false` until a separate history reviewer passes.
- The new cache has no frontend/current-signal/event-confirmation/scoring
  approval and does not change DOC fallback behavior.

P69F discovery cutover readiness gate:

- `config/oil-news-discovery-policy.json` is the fail-closed routing authority.
  It keeps GDELT DOC primary and Web NGrams shadow-only; the target ordering is
  recorded but inactive.
- The history reviewer reads only committed aggregate shadow caches from git
  history. It requires zero invalid samples, at least 30 observation days and
  120 usable samples, then checks pair availability, usable rate, candidate
  volume, supported-language coverage, and independent/cross-provider support.
- The daily readiness workflow uses full git history and emits only an ignored
  artifact plus GitHub Summary. It does not query GDELT, Tavily, or Brave, read
  secrets, write production data, commit, or push.
- Passing all numeric gates means only `ready_for_manual_cutover_review`.
  `promotionEligible=false` and `automaticCutoverApproved=false` remain fixed;
  changing source order requires a separate reviewed cutover PR.

## Verification

```powershell
npm run check:gdelt-source-policy
npm run check:gdelt-web-ngrams-diagnosis
npm run check:gdelt-web-ngrams-artifact-sanitizer
npm run check:gdelt-web-ngrams-sample-archive
npm run check:gdelt-web-ngrams-samples-review
npm run check:gdelt-web-ngrams-fallback-source-review
npm run check:gdelt-web-ngrams-production-display-fallback-contract
npm run check:gdelt-web-ngrams-sample-collector-workflow
npm run check:gdelt-web-ngrams-fallback-gate-review
npm run check:gdelt-web-ngrams-display-fallback-projection
npm run check:gdelt-web-ngrams-display-fallback-projection-review
npm run check:gdelt-web-ngrams-display-fallback-writer-contract-design
npm run check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold
npm run check:gdelt-web-ngrams-display-fallback-disabled-writer-review
npm run check:gdelt-web-ngrams-display-fallback-production-write-readiness
npm run check:gdelt-web-ngrams-display-fallback-production-display-write
npm run check:gdelt-web-ngrams-frontend-aggregate-health
npm run check:gdelt-web-ngrams-automated-display-cache
npm run check:gdelt-web-ngrams-pair
npm run check:gdelt-web-ngrams-article-candidates
npm run check:gdelt-web-ngrams-shadow-classifier
npm run check:gdelt-web-ngrams-cross-source-telemetry
npm run check:gdelt-web-ngrams-article-shadow-cache
npm run check:gdelt-web-ngrams-article-shadow-history-review
npm run review:gdelt-web-ngrams-article-shadow-history -- --no-output
npm run review:gdelt-cache-health -- --no-output
npm run check:gdelt-cache-health
npm run check:all
```

This policy does not approve any GDELT signal for core scoring, execution,
position guidance, or oil-price direction by itself.
