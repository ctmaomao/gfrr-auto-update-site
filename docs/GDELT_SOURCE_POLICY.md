# GDELT Source Policy

This policy is the site-wide contract for GDELT usage. It exists because GDELT
is useful for broad global news coverage, but it should not be treated as a
high-frequency realtime API.

Official GDELT references:

- GDELT DOC / Context APIs are rate-limited to protect the underlying search
  clusters; high-volume keyword querying should move to Web NGrams 3.0:
  <https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/>
- GDELT data is available through BigQuery and raw data files, with live
  datasets documented as updating around a 15-minute cadence:
  <https://www.gdeltproject.org/data.html>

## Current Registered Consumers

| Consumer | Current source | Runtime path | Cadence | Current fallback |
|---|---|---|---|---|
| World Order Stress | GDELT Cloud v2 `events/summary` low-frequency cache | `scripts/world-order/fetch-gdelt-cloud.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-world-order-cache.json` | daily workflow / explicit build; manual reruns use 12h fresh cache before any live Cloud attempt | fresh/stale GDELT cache first; previous `data/world-order-stress.json` GDELT summary remains final fallback |
| ODP Oil News Event Watch | GDELT DOC 2.0 broad cache query plus Tavily / Brave | `scripts/oil-directional/diagnose-oil-news-events.mjs` calls shared wrapper `scripts/gdelt/fetch-gdelt.mjs`; production writer also writes `data/gdelt-news-cache.json` | 2h workflow / manual dispatch; GDELT DOC live attempt only after the 6h fresh-cache or 6h error-cooldown window expires | Tavily / Brave source health remains visible; GDELT cache can be `ok` / `stale` / `error` / `not_initialized` |
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
- Keep ODP GDELT DOC as a slow background source: 6h fresh cache, 24h stale
  fallback, 6h error cooldown, and no second retry inside an Oil News refresh.
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

Future source-review only:

- Evaluate GDELT Web NGrams 3.0 for high-frequency narrative heat.
- Evaluate BigQuery / raw data files for large-scale historical backtests or a
  news-factor research library.

## Verification

```powershell
npm run check:gdelt-source-policy
npm run review:gdelt-cache-health -- --no-output
npm run check:gdelt-cache-health
npm run check:all
```

This policy does not approve any GDELT signal for core scoring, execution,
position guidance, or oil-price direction by itself.
