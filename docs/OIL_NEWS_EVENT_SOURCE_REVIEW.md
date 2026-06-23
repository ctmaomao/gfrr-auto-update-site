# Oil News Event Source Review — ODP manual diagnosis

Status: P28 added a manual-only oil-news event diagnosis helper. P29 promotes the
same source set into a production read-only display artifact. P30 adds a
manual/local sample calibration review. P31 adds production title-risk and
headline-display readiness guards. P32 surfaces those guards in the frontend
without rendering article headlines. All layers remain outside ODP scoring,
`finalBias`, decision, execution, position, Brent promotion, Global Risk Heatmap,
and cross-validation.

## Candidate Sources

P28 reviews three public/news-search sources already aligned with project source
patterns:

| Source | Role | Key |
|---|---|---|
| GDELT DOC 2.0 public search | first-line public news search proxy | no key |
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
npm run diagnose:oil-news-events
npm run check:oil-news-events-diagnosis
```

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
search without a key and injects GitHub Secrets for:

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

Any future production display-only layer must be a separate reviewed change. It
may read a sanitized production artifact only after manual diagnosis proves that
the source mix is stable enough and the UI copy keeps the same uncertainty
boundary.
