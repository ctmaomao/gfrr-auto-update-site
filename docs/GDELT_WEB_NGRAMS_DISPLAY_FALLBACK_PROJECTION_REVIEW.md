# GDELT Web NGrams Display Fallback Projection Review

Contract version: `gdelt-web-ngrams-display-fallback-projection-review-p51`

Status: `display_fallback_projection_review_passed_no_production_write`

## Purpose

P51 reviews one or more P50 display fallback projection artifacts and checks
whether they are internally consistent enough for a later writer-contract design
review.

This step is still non-production. It does not write
`data/oil-news-event-watch.json`, does not create
`sourceCaches.gdeltWebNgramsFallback`, does not render frontend UI, and does not
enhance the current Oil News signal.

## Review Command

```powershell
npm run review:gdelt-web-ngrams-display-fallback-projections -- --input docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-projection-p50.json --no-output --json --strict
npm run check:gdelt-web-ngrams-display-fallback-projection-review
```

Default review output, when not using `--no-output`, is ignored:

```text
manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-projection-review-latest.json
```

## Required Gates

The review requires each usable projection to keep:

- schema `gdelt-web-ngrams-display-fallback-projection-p50`;
- status `display_only_fallback_projection_ready_no_production_write`;
- future field `sourceCaches.gdeltWebNgramsFallback` absent from production;
- display mode `aggregate_source_health_only_no_headlines`;
- at least 8 usable samples, 2 selected timestamps, and 24 observation hours;
- no article title, URL, snippet, body, raw row, raw response, secret, or
  request header exposure;
- all production, frontend, workflow, current-signal, and score approvals false.

## Explicit Non-Approvals

P51 keeps:

```text
productionWriteApproved=false
frontendApproved=false
workflowApproved=false
currentSignalEnhancementApproved=false
scoreApproved=false
```

It remains outside Oil News current-signal logic, ODP build/classifier input,
ODP `finalBias`, `values.*`, scoring, decision, execution, position, Brent
promotion, Global Risk Heatmap, and cross-validation.

## Next Allowed Step

The next allowed step is
`p52_display_only_fallback_writer_contract_design_no_production_write`.

That next step may design a writer contract, but P51 itself grants no production
write, frontend, workflow, current-signal, or score approval.
