# GDELT Web NGrams Display Fallback Production Display Write

P56 writes one scoped production display-only cache field:

`data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback`

The field contract is `gdelt-web-ngrams-display-fallback-cache-v1`, with display
mode `aggregate_source_health_only_no_headlines`.

## Status

- Phase: `p56_display_only_fallback_production_display_write`
- Writer command:
  `write:gdelt-web-ngrams-display-fallback-production-cache`
- Check command:
  `check:gdelt-web-ngrams-display-fallback-production-display-write`
- Production field path:
  `sourceCaches.gdeltWebNgramsFallback`
- Production write approval: `productionDataWriteApproved=true`

## Scope

P56 only attaches a compact cache derived from the P55-reviewed candidate:

- sample gate counts;
- selected timestamp count and observation window;
- source health state;
- GDELT DOC relief role;
- cache limitation text.

The writer preserves all existing Oil News fields and only replaces the
`sourceCaches.gdeltWebNgramsFallback` object.

## Boundaries

The production field keeps:

- `frontendDisplayApproved=false`
- `workflowAutomationApproved=false`
- `liveFetchApproved=false`
- `apiKeyReadApproved=false`
- `currentSignalEnhancement=false`
- `eventConfirmationSource=false`
- `headlineSource=false`
- `oilDirectionInput=false`
- `eligibleForScoring=false`

It must not contain raw article titles, URLs, snippets, bodies, raw responses,
title hashes, provider payloads, credentials, request headers, or source URLs.

It does not confirm a chokepoint closure/reopening, tanker-flow fact, facility
incident, sanctions impact, supply interruption, oil direction, or oil-price
forecast. It does not feed ODP `finalBias`, values, scoring, decision,
execution, position, Brent promotion, Global Risk Heatmap, or cross-validation.

## Future Work

Frontend rendering and workflow automation remain separate reviewed changes.
Until those changes exist, this cache is production data only for source-health
fallback provenance and audit visibility.
