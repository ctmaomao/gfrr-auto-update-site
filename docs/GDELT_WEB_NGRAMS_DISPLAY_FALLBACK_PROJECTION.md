# GDELT Web NGrams Display Fallback Projection

Contract version: `gdelt-web-ngrams-display-fallback-projection-p50`

Status: `display_only_fallback_projection_ready_no_production_write`

## Purpose

P50 projects the compact display-only fallback object that a later reviewed
writer could place under:

```text
data/oil-news-event-watch.json
sourceCaches.gdeltWebNgramsFallback
```

This step is a dry-run projection only. It does not write `data/*.json`, does
not implement a writer, does not render the field in the frontend, and does not
enhance the current Oil News signal.

## Projection Command

```powershell
npm run project:gdelt-web-ngrams-display-fallback-projection
npm run check:gdelt-web-ngrams-display-fallback-projection
```

The projector reads a P49 gate-review artifact and writes only:

```text
manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-latest.json
```

## Projected Field Shape

The projected future field is limited to aggregate source-health and phrase-heat
metadata:

- sample gate status and reviewed collector run id;
- usable sample count, selected timestamp count, and observation window;
- compact bucket counts;
- compact term counts;
- limitations explaining that this is background phrase heat only.

It must not contain article titles, URLs, snippets, article bodies, raw Web
NGrams rows, raw provider responses, request headers, cookies, API keys, or
secrets.

## Explicit Non-Approvals

P50 keeps these approvals false:

```text
productionWriteApproved=false
frontendApproved=false
workflowApproved=false
currentSignalEnhancementApproved=false
scoreApproved=false
```

The projected field is still absent from production data. It remains out of Oil
News current-signal logic, ODP build/classifier input, ODP `finalBias`,
`values.*`, scoring, decision, execution, position, Brent promotion, Global Risk
Heatmap, and cross-validation.

## Next Allowed Step

The next allowed step is
`p51_display_only_fallback_projection_review_no_production_write`, a separate
review of one or more projection artifacts. That review still may not write
production data unless a later writer contract explicitly approves it.
