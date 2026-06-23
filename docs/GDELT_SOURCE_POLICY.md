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
| World Order Stress | GDELT Cloud v2 `events/summary` | `scripts/world-order/fetch-gdelt-cloud.mjs` | daily workflow / explicit build | previous `data/world-order-stress.json` GDELT summary can be reused as `stale` |
| ODP Oil News Event Watch | GDELT DOC 2.0 `doc/doc` plus Tavily / Brave | `scripts/oil-directional/diagnose-oil-news-events.mjs`; production writer calls it through `scripts/oil-directional/build-oil-news-event-watch.mjs` | 2h workflow / manual dispatch | Tavily / Brave source health remains visible; source failure stays display-only |
| Bubble Watch `ceo_hedging` | GDELT DOC 2.0 `doc/doc` plus Tavily / Brave / Wind fallback | `scripts/build-bubble-watch.mjs` | weekly build plus source-health audit | Tavily / Brave free fallback first; Wind paid final fallback only when enabled |
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
scripts/build-bubble-watch.mjs
scripts/check-gdelt-cloud-fetcher-integration.mjs
scripts/check-gdelt-source-policy.mjs
scripts/check-workflows.mjs
scripts/oil-directional/diagnose-oil-news-events.mjs
scripts/world-order/fetch-gdelt-cloud.mjs
```

Documentation, committed production JSON, and source-candidate config may mention
GDELT for attribution or provenance, but they are not allowed to introduce new
runtime fetch paths.

## Migration Plan

P35, current phase:

- Document the site-wide policy.
- Add the static direct-endpoint guard.
- Do not change runtime behavior.

P36 candidate:

- Add a shared GDELT wrapper / adapter with serial request discipline,
  `Retry-After` handling, bounded retries, timeout, and sanitized diagnostics.
- Start moving ODP oil-news GDELT DOC calls behind that wrapper.

P37 candidate:

- Add a compact `data/gdelt-news-cache.json` or equivalent cache artifact.
- Change ODP oil-news from per-bucket GDELT queries to one broad GDELT query plus
  local bucket classification.

P38 candidate:

- Move Bubble Watch `ceo_hedging` to read the shared GDELT cache/wrapper before
  Tavily / Brave / Wind fallback.

P39 candidate:

- Move World Order GDELT Cloud fetcher to the shared GDELT wrapper while
  preserving its overlay-only scoring contract and stale-cache fallback.

Future source-review only:

- Evaluate GDELT Web NGrams 3.0 for high-frequency narrative heat.
- Evaluate BigQuery / raw data files for large-scale historical backtests or a
  news-factor research library.

## Verification

```powershell
npm run check:gdelt-source-policy
npm run check:all
```

This policy does not approve any GDELT signal for core scoring, execution,
position guidance, or oil-price direction by itself.
