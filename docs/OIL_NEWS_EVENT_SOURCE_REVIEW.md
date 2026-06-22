# Oil News Event Source Review — ODP manual diagnosis

Status: P28 adds a manual-only oil-news event diagnosis helper. It is a research
and source-health artifact, not a production ODP input and not a market forecast.

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

Any future production display-only layer must be a separate reviewed change. It
may read a sanitized production artifact only after manual diagnosis proves that
the source mix is stable enough and the UI copy keeps the same uncertainty
boundary.
