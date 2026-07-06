# GDELT Web NGrams Display Fallback Disabled Writer Scaffold

Contract version: `gdelt-web-ngrams-display-fallback-disabled-writer-p53`

Status: `disabled_no_production_write`

## Purpose

P53 creates a disabled writer scaffold for the future Oil News GDELT Web NGrams
display fallback cache. It exists to prove the writer shape can be assembled
from the P52 contract, P50 projection, and P51 projection review before any
production write is allowed.

This step is still non-production. It does not write
`data/oil-news-event-watch.json`, does not create
`sourceCaches.gdeltWebNgramsFallback`, does not wire frontend display, does not
add workflow automation, and does not enhance the current Oil News signal.

## Command

```powershell
npm run project:gdelt-web-ngrams-display-fallback-disabled-writer -- --strict
npm run check:gdelt-web-ngrams-display-fallback-disabled-writer-scaffold
```

The default output is ignored:

```text
manual-artifacts/oil-news/gdelt-web-ngrams-display-fallback-disabled-writer-latest.json
```

## Disabled Output

The scaffold emits only:

```text
schemaVersion=gdelt-web-ngrams-display-fallback-disabled-writer-p53
status=disabled_no_production_write
writerState=disabled_scaffold_no_production_write
writeMode=manual_artifact_only
productionWriteAttempted=false
productionWriteApproved=false
```

The candidate cache shape remains display-only:

```text
sourceCaches.gdeltWebNgramsFallback
contractVersion=gdelt-web-ngrams-display-fallback-cache-v1
displayMode=aggregate_source_health_only_no_headlines
currentSignalEnhancement=false
eventConfirmationSource=false
headlineSource=false
oilDirectionInput=false
eligibleForScoring=false
```

The scaffold may carry P50/P51 sample-gate aggregate metadata, but it must not
carry article titles, URLs, snippets, bodies, raw rows, raw provider responses,
secrets, request headers, event confirmation, or oil direction input.

## Explicit Non-Approvals

P53 keeps:

```text
productionDataWriteApproved=false
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

## Next Allowed Step

The next allowed step is
`p54_display_only_fallback_disabled_writer_scaffold_review_no_production_write`.
