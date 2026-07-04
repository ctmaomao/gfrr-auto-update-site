# Oil News Event Source Review — ODP manual diagnosis

Status: P28 added a manual-only oil-news event diagnosis helper. P29 promotes the
same source set into a production read-only display artifact. P30 adds a
manual/local sample calibration review. P31 adds production title-risk and
headline-display readiness guards. P32 surfaces those guards in the frontend
without rendering article headlines. P33 surfaces source health/fallback wording
without adding sources or changing the artifact schema. P34 adds a local
source-health sample review so the fallback wording can be checked against
recent sanitized history. P36 moves ODP GDELT DOC requests behind the shared
`scripts/gdelt/fetch-gdelt.mjs` wrapper so rate limiting, `Retry-After`, timeout,
bounded retry, serial request discipline, and sanitized diagnostics are handled
outside the feature module. P37 changes the GDELT leg from four per-topic DOC
queries into one broad `gdelt_broad_oil_news` query plus local bucket
classification, and writes the compact cache artifact
`data/gdelt-news-cache.json`. P41 adds a manual-only GDELT Web NGrams live smoke
helper to evaluate the downloadable ngram path while DOC API is rate-limited.
P44 adds a manual/local Web NGrams sample archive so adjacent diagnosis artifacts
can be accumulated before any display-only fallback review. P45 adds a
source-review gate for a possible future Web NGrams fallback, while keeping it
out of production display and current Oil News signal enhancement.
P52 adds a manual claim-ledger review, and P53 adds a production `claimPolarity`
aggregate plus frontend aggregate display without exposing headlines or URLs.
All layers remain outside ODP scoring, `finalBias`, decision, execution,
position, Brent promotion, Global Risk Heatmap, and cross-validation.

## Candidate Sources

P28 reviews three public/news-search sources already aligned with project source
patterns:

| Source | Role | Key |
|---|---|---|
| GDELT DOC 2.0 public search | first-line public news search proxy | no key |
| GDELT Web NGrams v5 legacy files | manual-only downloadable ngram smoke/source-review | no key |
| Tavily Search API | free-credit news search cross-check/fallback | `TAVILY_API_KEYS` / `TAVILY_API_KEY` |
| Brave News Search API | independent news-index cross-check/fallback | `BRAVE_API_KEYS` / `BRAVE_API_KEY` |

Local optional key files are supported for manual runs:

```text
manual-artifacts/oil-news/tavily-api-key.txt
manual-artifacts/oil-news/brave-api-key.txt
manual-artifacts/local-secrets/tavily-api-key.txt
manual-artifacts/local-secrets/brave-api-key.txt
```

Keys are never printed and these paths remain ignored.

## Helper

```text
scripts/oil-directional/diagnose-oil-news-events.mjs
scripts/gdelt/fetch-gdelt.mjs
npm run diagnose:oil-news-events
npm run check:oil-news-events-diagnosis
```

P36 requires the diagnosis helper to call the shared GDELT wrapper instead of
containing a direct GDELT endpoint string. The wrapper is still source-access
plumbing only; it does not add cache artifacts, workflows, frontend fields, or
scoring authority.

P37 adds the GDELT compact cache:

```text
data/gdelt-news-cache.json
schemaVersion: gdelt-news-cache-p37
query.id: gdelt_broad_oil_news
```

The cache stores only compact `domain/publishedAt/buckets/queryIds` rows plus
sanitized request diagnostics and cache policy. It must not contain titles,
URLs, snippets, body text, raw provider responses, keys, headers, cookies, or
bearer tokens. The cache is a low-frequency source artifact for reuse and
fallback; it does not grant headline display, event confirmation, or scoring
authority.

P41 adds a Web NGrams manual live smoke:

```text
scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs
npm run diagnose:gdelt-web-ngrams
npm run check:gdelt-web-ngrams-diagnosis
```

Default mode is dry-run/no-network. Live smoke requires explicit opt-in:

```powershell
npm run diagnose:gdelt-web-ngrams -- --allow-network --no-output
```

This helper downloads only recent GDELT Web NGrams `ngrams.txt.gz` candidate
files through the shared wrapper, scans for Oil News term buckets, and writes
only ignored manual artifacts when `--no-output` is not used. P42 adds bounded
latest-file discovery: the helper HEAD-probes recent heartbeat-style timestamps
before downloading, so wider manual searches can use `--discovery-hours` and
`--max-probes` without downloading every missing candidate.

P43 adds a no-network sample review:

```text
scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs
npm run review:gdelt-web-ngrams-samples
npm run check:gdelt-web-ngrams-samples-review
```

It reads only ignored diagnosis artifacts or fixtures, validates the
`gdelt-web-ngrams-diagnosis-p41` boundary, and summarizes discovery stability,
hit/doc count ranges, bucket coverage, and term coverage. A passing review only
means the samples are ready for manual stability review; it does not approve
production display fallback or Oil News signal enhancement. It does not read TOC
titles/URLs, does not write production data, and does not enhance the current Oil
News signal.

P44 adds a manual sample archive:

```text
scripts/oil-directional/archive-gdelt-web-ngrams-samples.mjs
npm run archive:gdelt-web-ngrams-samples
npm run check:gdelt-web-ngrams-sample-archive
```

The archive reads only ignored diagnosis artifacts or fixtures, validates the
same `gdelt-web-ngrams-diagnosis-p41` boundary, copies valid samples into:

```text
manual-artifacts/oil-news/gdelt-web-ngrams-samples/
```

It writes only ignored sidecars and optionally invokes the P43 reviewer. The
readiness states are deliberately narrow:

- `insufficient_samples`
- `stable_manual_review_ready`
- `unstable_keep_manual_only`

`stable_manual_review_ready` only means the accumulated manual samples can move
to a separate fallback source-review discussion. It does not approve production
display fallback, current Oil News signal enhancement, scheduled workflows,
frontend rendering, ODP `finalBias`, scoring, decision, execution, position,
Brent promotion, Global Risk Heatmap, or cross-validation.

P45 adds the fallback source-review:

```text
docs/GDELT_WEB_NGRAMS_FALLBACK_SOURCE_REVIEW.md
docs/fixtures/oil-news/gdelt-web-ngrams-fallback-source-review-p45.json
npm run check:gdelt-web-ngrams-fallback-source-review
```

Contract version is `gdelt-web-ngrams-fallback-source-review-p45`; status is
`source_review_manual_fallback_candidate_no_production_display`. The only
candidate future role is:

```text
oil_news_gdelt_web_ngrams_background_fallback_display_only
```

That role is limited to source-health/background phrase-heat context if GDELT DOC
is rate-limited. P45 keeps `productionDisplayFallbackApproved=false`,
`currentSignalEnhancementApproved=false`, `workflowApproved=false`,
`frontendApproved=false`, and `scoreApproved=false`. A later P46 contract would
still be required before any production display-only fallback.

P46 adds the production display fallback contract design:

```text
docs/GDELT_WEB_NGRAMS_PRODUCTION_DISPLAY_FALLBACK_CONTRACT.md
docs/fixtures/oil-news/gdelt-web-ngrams-production-display-fallback-contract-p46.json
npm run check:gdelt-web-ngrams-production-display-fallback-contract
```

Contract version is `gdelt-web-ngrams-production-display-fallback-contract-p46`;
status is
`contract_design_only_waiting_for_sufficient_p44_samples_no_production_write`.
The only future production location under design is:

```text
sourceCaches.gdeltWebNgramsFallback
```

Its display mode is `aggregate_source_health_only_no_headlines`, meaning compact
source-health and aggregate phrase-heat metadata only. P46 requires P44
`stable_manual_review_ready`, at least 8 usable samples, at least 24 hours of
observation, at least 2 selected timestamps, and no raw titles/URLs/bodies/raw
responses before any later production writer can be reviewed. P46 keeps
`productionWriteApproved=false`, `frontendApproved=false`,
`workflowApproved=false`, `currentSignalEnhancementApproved=false`, and
`scoreApproved=false`; it does not write production JSON, wire a workflow, render
frontend UI, enhance current Oil News signal, or affect ODP direction/scoring.

P47 adds artifact-only sample collection:

```text
.github/workflows/gdelt-web-ngrams-sample-collector.yml
npm run check:gdelt-web-ngrams-sample-collector-workflow
```

Workflow name is `GDELT Web NGrams Sample Collector`. It runs every 3 hours at
`23 */3 * * *` UTC or by manual dispatch. Each run restores the previous
`gdelt-web-ngrams-samples` artifact when available, runs a live Web NGrams
diagnosis, archives the sample, and reruns the 8-sample gate review.

This is artifact-only sample collection. It does not write production data, does
not commit/push, does not run `build:oil-news-event-watch`, does not use
Tavily/Brave/GDELT Cloud/FIRMS secrets, and does not change frontend, current Oil
News signal, ODP direction/scoring, Brent promotion, or cross-validation.

Default mode is dry-run/no-network:

```powershell
npm run diagnose:oil-news-events -- --dry-run
```

Manual live diagnosis requires explicit network opt-in:

```powershell
npm run diagnose:oil-news-events -- --allow-network --sources gdelt_doc,tavily,brave --window-days 7 --max-results 12
```

The helper writes only:

```text
manual-artifacts/oil-news/oil-news-events-diagnosis-latest.json
```

## Production Display-Only Watch

P29 adds:

```text
scripts/oil-directional/build-oil-news-event-watch.mjs
scripts/check-oil-news-event-watch-contract.mjs
data/oil-news-event-watch.json
.github/workflows/refresh-oil-news-event-watch.yml
npm run build:oil-news-event-watch
npm run check:oil-news-event-watch
```

The workflow runs every 2 hours and by manual dispatch. It uses GDELT DOC public
search without a key through the shared wrapper and writes both
`data/oil-news-event-watch.json` and `data/gdelt-news-cache.json`. It injects
GitHub Secrets for:

```text
TAVILY_API_KEYS
BRAVE_API_KEYS
```

The production artifact is sanitized:

- no API keys, Authorization headers, raw provider response, snippets, body text,
  or full article text;
- compact source status, query status, bucket summaries, and top article
  title/url/domain/publishedAt/source ids only;
- `productionDisplayApproved=true`, `promotionEligible=false`, and all
  `productionImpact.*=false`.

Frontend ODP `NEWS EVENT WATCH` reads `data/oil-news-event-watch.json`. If that
file is unavailable, the renderer can fall back to the older P10 World Order
GDELT broad-event summary, but the production path is now the dedicated oil-news
artifact.

## Sample Calibration Review

P30 adds:

```text
scripts/oil-directional/review-oil-news-event-watch-samples.mjs
npm run review:oil-news-event-watch-samples
npm run check:oil-news-event-watch-samples-review
```

The helper is local/manual and no-network. By default it reads git history for
recent sanitized `data/oil-news-event-watch.json` samples. It may also read
tracked fixtures or ignored manual artifacts with repeated `--input` or
`--input-dir`.

The review writes only:

```text
manual-artifacts/oil-news/oil-news-event-watch-samples-review-latest.json
```

The current first two production workflow samples proved Tavily and Brave live
cross-checks are configured, while GDELT DOC was unstable across adjacent runs.
The sample review therefore marks source calibration ready for manual review but
keeps headline display not ready when high-claim title language appears.

## Production Title-Risk Guard

P31 extends `data/oil-news-event-watch.json` with:

```text
titleRisk
headlineDisplayReadiness
```

`titleRisk` counts compact titles that contain high-claim terms such as
blockade, closure, war, attack, mine, strike, shutdown, halt, or disruption.
`headlineDisplayReadiness.displayHeadlinesApproved` must remain `false`.
When any high-claim title is present, `headlineDisplayReadiness.state` must be
`not_ready_high_claim_title_noise`.

This does not remove sanitized compact titles from the audit artifact, but it
does make direct headline display a separate reviewed UI/copy decision. The
contract checker fails if the artifact claims title display is approved.

P32 lets the ODP `NEWS EVENT WATCH` frontend show only aggregate guard text:
headline readiness state, high-claim title count, evaluated title count, source
domain count, and an explicit "no original headline display" notice. The renderer
must not read `topArticles` or show article titles. `check:oil-directional-zh-copy`
guards this frontend boundary.

P33 adds frontend source-health/fallback wording. The ODP `NEWS EVENT WATCH`
surface may show only aggregate source health from existing fields:
`sourceStatus`, `queryCoverage`, and `aggregate.liveSourceCount`. It can say
whether GDELT / Tavily / Brave are available, degraded, missing, or in dry-run
mode, and it can show query success counts. It must not add provider calls, read
raw provider responses, display article titles, or treat a single news path as a
confirmed chokepoint closure, supply outage, tanker-flow fact, refinery accident,
sanctions effect, or oil-price direction. Legacy World Order GDELT fallback must
be labeled as not being the dedicated three-source oil-news layer.

P34 adds:

```text
scripts/oil-directional/review-oil-news-source-health-samples.mjs
npm run review:oil-news-source-health-samples
npm run check:oil-news-source-health-samples-review
```

The helper is local/manual and no-network. By default it reads git history for
recent sanitized `data/oil-news-event-watch.json` samples. It may also read
tracked fixtures or ignored manual artifacts with repeated `--input` or
`--input-dir`.

The review writes only:

```text
manual-artifacts/oil-news/oil-news-source-health-samples-review-latest.json
```

It focuses on source-health and fallback stability rather than bucket narrative:
per-source status counts, live/usable rates, query success-rate range, degraded
provider errors, fail-closed copy readiness, and headline-display guard status.
The output intentionally omits article title strings. Its current expected use
is to decide whether GDELT should remain a noisy backup while Tavily/Brave do the
cross-checking, and whether `NEWS EVENT WATCH` should keep the same source-health
and fallback wording.

## P52 Claim Ledger Review

P52 adds a manual/local no-network claim-ledger helper:

```text
scripts/oil-directional/review-oil-news-claim-ledger.mjs
npm run review:oil-news-claim-ledger
npm run check:oil-news-claim-ledger-review
```

The helper reads recent sanitized `data/oil-news-event-watch.json` samples from
git history by default, or tracked fixtures / ignored manual artifacts with
repeated `--input` or `--input-dir`. It uses the already-sanitized compact title
inside the review process only, then writes an ignored ledger artifact:

```text
manual-artifacts/oil-news/oil-news-claim-ledger-latest.json
```

The ledger output intentionally does not include original article titles or URLs.
Each compact claim is represented by `titleHash`, domain, source tier, event type,
claim polarity, bucket ids, query ids and trigger-term classes. This allows manual
review of the event structure without creating a new headline-display surface.

Claim polarity values:

- `risk_escalation`: closure, blockade, mine, attack, outage, sanction, explosion
  or similar high-risk language;
- `risk_deescalation`: reopening, resume, restart, return, lifted, waiver, truce
  or similar risk-premium easing language;
- `mixed_or_contested`: escalation and de-escalation language in the same claim;
- `market_reaction_only`: price / futures / spread / trader reaction without a
  direct event claim;
- `unclear_or_high_claim`: not enough structure to classify safely.

The review also reports event-type counts, source-tier counts, and whether the
same event family contains mixed escalation and de-escalation claims. That mixed
state is the key P52 behavior: a high bucket count no longer automatically means
"oil supply risk up"; it can instead mean "news claims conflict and require human
review."

P52 does not access network sources or read API keys. It does not write
`data/*.json`, `realtime/*.json`, production config files or frontend assets. It
does not approve headline display, confirm Hormuz closure/reopening, tanker-flow
facts, facility incidents, sanctions impact, supply interruptions or oil-price
direction. It does not change ODP classifier, `finalBias`, global overlay, values,
scoring, decision, execution, position, Brent promotion, Global Risk Heatmap or
cross-validation.

## P53 Frontend Claim Polarity Aggregate

P53 promotes only the aggregate shape of the P52 classification into the
production oil-news watch artifact:

```text
data/oil-news-event-watch.json.claimPolarity
ruleVersion = oil-news-claim-polarity-p53
displayMode = aggregate_only_no_headlines
```

The production field is intentionally more restrictive than the manual P52
ledger. It contains only:

- `polarityCounts`: `risk_escalation`, `risk_deescalation`,
  `mixed_or_contested`, `market_reaction_only`, `unclear_or_high_claim`;
- `eventTypeCounts`: chokepoint, shipping, sanctions, facility, supply,
  market-reaction, general-energy counts;
- `sourceTierCounts`: primary/wire, major financial, industry trade,
  aggregator/blog, low-confidence counts;
- `contradiction.state`: `mixed_claims`, `risk_escalation_dominant`,
  `risk_deescalation_dominant`, or `no_directional_claim_dominance`.

It must not contain article titles, URLs, title hashes, snippets, bodies, raw
responses, or headline-display approval. `check:oil-news-event-watch` rejects
those fields inside `claimPolarity`.

The frontend `NEWS EVENT WATCH` renders this as a single aggregate row:

```text
主张方向: 升温 N / 降温 N / 混合 N / 市场 N · 新闻升温主导/新闻降温主导/混合待核/未见方向冲突 · 不展示标题原文
```

The renderer still must not read `topArticles`; `check:oil-directional-zh-copy`
keeps that static guard. A mixed claim state means manual review is required. It
does not confirm a chokepoint closure/reopening, tanker-flow fact, facility
incident, sanctions impact, supply interruption, or oil-price direction, and it
does not feed ODP `finalBias`, scoring, decision, execution, position, Brent
promotion, Global Risk Heatmap, or cross-validation.

## Query Buckets

The initial query set intentionally focuses on ODP-relevant events:

- chokepoint / tanker shipping: Hormuz, Red Sea, Bab el-Mandeb, Suez, tanker
  shipping and disruption terms;
- sanctions / shadow fleet: sanctions, price cap, embargo, OFAC, shadow fleet;
- facility / supply disruption: refinery, pipeline, terminal, port, outage,
  fire, explosion, shutdown or attack;
- market reaction: Brent, WTI, crude prices, futures and risk-premium language.

The output summarizes bucket counts and cross-source availability. It can flag
`quiet`, `watch`, `elevated_manual_review`, or `source_unavailable`, but this is
a manual review state only.

## Boundaries

P28 does not:

- write `data/*.json` or `realtime/*.json`;
- add a scheduled workflow;
- modify frontend display;
- change ODP classifier, `finalBias`, global overlay, values, scoring, decision,
  execution, position, Brent promotion, Global Risk Heatmap, or cross-validation;
- confirm Hormuz closure, tanker-flow disruption, refinery outage, supply
  interruption, sanctions impact, or oil-price direction.

P29 does not:

- write `data/oil-directional-pressure.json`, `data/radar-data.json`, or
  `realtime/*.json`;
- change ODP classifier, `finalBias`, global overlay, values, scoring, decision,
  execution, position, Brent promotion, Global Risk Heatmap, or cross-validation;
- confirm Hormuz closure, tanker-flow disruption, refinery outage, supply
  interruption, sanctions impact, or oil-price direction.

P30 does not:

- access network sources or read API keys;
- write `data/*.json`, `realtime/*.json`, or production baseline/config files;
- modify frontend display or expose article headlines;
- change ODP classifier, `finalBias`, global overlay, values, scoring, decision,
  execution, position, Brent promotion, Global Risk Heatmap, or cross-validation;
- confirm Hormuz closure, tanker-flow disruption, refinery outage, supply
  interruption, sanctions impact, or oil-price direction.

P34 does not:

- access network sources or read API keys;
- write `data/*.json`, `realtime/*.json`, production baseline/config files, or
  frontend assets;
- add a workflow, change P29 cadence, or change the production artifact schema;
- expose article headlines in its review artifact;
- change ODP classifier, `finalBias`, global overlay, values, scoring, decision,
  execution, position, Brent promotion, Global Risk Heatmap, or cross-validation;
- confirm Hormuz closure, tanker-flow disruption, refinery outage, supply
  interruption, sanctions impact, or oil-price direction.

Any future production display-only layer must be a separate reviewed change. It
may read a sanitized production artifact only after manual diagnosis proves that
the source mix is stable enough and the UI copy keeps the same uncertainty
boundary.
