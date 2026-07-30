# GDELT Web NGrams Frontend Aggregate Health and Sample Age

P63 approves one narrow read-only frontend projection from:

`data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback`

The frontend may show only aggregate source-health and sample-gate state. It
must not show or derive headlines, URLs, snippets, article bodies, raw provider
responses, event claims, oil direction, or a score.

## Contract

- Contract: `gdelt-web-ngrams-frontend-aggregate-health-p63`
- Status: `frontend_aggregate_source_health_approved`
- Cache contract: `gdelt-web-ngrams-display-fallback-cache-v1`
- Display mode: `aggregate_source_health_only_no_headlines`
- Approval: `frontendAggregateHealthApproved=true`
- Production cache marker: `frontendDisplayApproved=true`
- Check: `check:gdelt-web-ngrams-frontend-aggregate-health`

The exact allowlist lives in
`docs/fixtures/oil-news/gdelt-web-ngrams-frontend-aggregate-health-p63.json`.
The renderer is fail-closed: a missing approval marker, wrong contract, or wrong
display mode produces an unavailable message instead of consuming unreviewed
fields.

## P67 historical review sample age

P67 adds the narrow
`gdelt-web-ngrams-frontend-sample-age-p67` approval. The new
`frontendSampleAgeApproved=true` fixture authorizes two already-existing cache
fields:

- `sampleGate.latestSelectedTimestamp`;
- `staleAfterHours`.

The renderer parses `latestSelectedTimestamp` as UTC `yyyyMMddHHmmss`, displays
the historical review sample date and age, and compares it with
`staleAfterHours`. Invalid or more-than-one-hour future timestamps fail closed
to an unavailable message. This is historical review sample age only, not
current news freshness or event confirmation.

## Preserved boundaries

P63 does not change the P56 production-write authorization or the Oil News
signal. These fields remain false:

- `currentSignalEnhancement=false`
- `eventConfirmationSource=false`
- `headlineSource=false`
- `oilDirectionInput=false`
- `eligibleForScoring=false`
- `workflowAutomationApproved=false`
- `liveFetchApproved=false`
- `apiKeyReadApproved=false`

The cache remains display-only/audit-only. It does not affect `values.*`,
scoring, `decisionModel`, `executionLock`, `positionGuidance`, Brent promotion,
ODP `finalBias`, Global Risk Heatmap, or cross-validation.
