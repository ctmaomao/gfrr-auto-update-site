# GDELT Web NGrams Display Fallback Writer Contract Design

Contract version: `gdelt-web-ngrams-display-fallback-writer-contract-design-p52`

Status: `display_only_fallback_writer_contract_design_no_production_write`

## Purpose

P52 designs the future writer contract for a possible display-only GDELT Web
NGrams fallback cache in Oil News.

This is contract design only. P52 does not create a writer, does not write
`data/oil-news-event-watch.json`, does not create
`sourceCaches.gdeltWebNgramsFallback`, does not wire frontend display, does not
add workflow automation, and does not enhance the current Oil News signal.

## Future Field

The future production field is:

```text
data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback
```

The field remains absent in production until a later reviewed implementation
explicitly changes the approval state. The P52 checker fails if this field or
the P52 contract marker appears in runtime/frontend/production data files.

## Future Shape

The future field may only be compact, aggregate, and display-only:

```text
contractVersion=gdelt-web-ngrams-display-fallback-cache-v1
displayMode=aggregate_source_health_only_no_headlines
fallbackContextOnly=true
currentSignalEnhancement=false
eventConfirmationSource=false
headlineSource=false
oilDirectionInput=false
eligibleForScoring=false
```

Allowed future statuses are:

```text
not_connected
sample_gate_passed_projection_only
stale
unavailable
contradicted
```

`confirmed` is intentionally not an allowed status. The fallback can describe
background phrase heat and source health only; it cannot confirm Hormuz closure,
tanker flow, sanctions impact, facility accidents, oil price direction, or any
ODP score input.

## Required Pre-Write Inputs

Any later writer implementation must be separately reviewed and must start from
these existing non-production gates:

```text
gdelt-web-ngrams-production-display-fallback-contract-p46
gdelt-web-ngrams-fallback-gate-review-p49
gdelt-web-ngrams-display-fallback-projection-p50
gdelt-web-ngrams-display-fallback-projection-review-p51
```

The writer must preserve the P49/P50/P51 sample gate: at least 8 usable samples,
at least 2 selected timestamps, at least 24 observation hours, no blockers, no
raw title/URL/body/raw-response exposure, and the required aggregate bucket
coverage.

## Explicit Non-Approvals

P52 keeps:

```text
productionWriteApproved=false
writerImplementationApproved=false
frontendImplementationApproved=false
workflowAutomationApproved=false
liveFetchApproved=false
apiKeyReadApproved=false
currentSignalEnhancementApproved=false
scoreApproved=false
```

It remains outside Oil News current-signal logic, ODP build/classifier input,
ODP `finalBias`, `values.*`, scoring, decision, execution, position, Brent
promotion, Global Risk Heatmap, and cross-validation.

## Verification

```powershell
npm run check:gdelt-web-ngrams-display-fallback-writer-contract-design
```

The checker validates the design document, fixture contract, authority docs,
package script registration, and runtime non-wiring.

## Next Allowed Step

The next allowed step is
`p53_display_only_fallback_disabled_writer_scaffold_no_production_write`.

That next step may create a disabled writer scaffold, but P52 itself grants no
production write, frontend, workflow, current-signal, live-fetch, API-key, or
score approval.
