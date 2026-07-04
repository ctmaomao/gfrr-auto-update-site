# GDELT Web NGrams Production Display Fallback Contract

Contract version: `gdelt-web-ngrams-production-display-fallback-contract-p46`

Status: `contract_design_only_waiting_for_sufficient_p44_samples_no_production_write`

## Purpose

P46 defines the future display-only shape for a GDELT Web NGrams fallback inside
Oil News source health. It does not connect the fallback to production data.

The intended future role remains:

```text
oil_news_gdelt_web_ngrams_background_fallback_display_only
```

The fallback is only allowed to provide aggregate background phrase heat and
source-health context when GDELT DOC is rate-limited or unavailable. It is not an
event-confirmation source, not a headline source, and not an oil direction input.

## Future Field Shape

If a later reviewed implementation is approved, the only eligible production
location is:

```text
data/oil-news-event-watch.json
sourceCaches.gdeltWebNgramsFallback
```

The display mode must be:

```text
aggregate_source_health_only_no_headlines
```

The field may contain only compact aggregate data:

- source health state and freshness metadata;
- sample gate state and reason;
- selected timestamp count;
- usable sample count;
- observation window hours;
- bucket counts and compact term counts;
- limitations and stale/fallback explanation.

The field must not contain article titles, URLs, snippets, article bodies, raw
Web NGrams rows, raw provider responses, secrets, request headers, or API keys.

## Required Gate Before Any Future Write

P46 does not approve a production write. A later implementation may only be
reviewed after all of these are true:

- P44 sample archive reports `stable_manual_review_ready`.
- At least 8 usable Web NGrams diagnosis samples exist.
- Samples span at least 24 hours.
- At least 2 selected timestamps are represented.
- No raw title, URL, body, snippet, raw provider response, secret, or request
  header is present in samples or derived artifacts.
- Bucket coverage includes `chokepoint`, `tanker_shipping`, and
  `market_reaction`, plus at least one of `sanctions`, `supply_disruption`, or
  `facility_event`.

If the gate fails, the future field must stay absent from production data or
must show only a disabled/pending status in a separately reviewed writer.

## Explicit Non-Approvals

P46 keeps these approvals false:

```text
productionWriteApproved=false
frontendApproved=false
workflowApproved=false
currentSignalEnhancementApproved=false
scoreApproved=false
```

This contract does not approve frontend rendering, a workflow writer, current
Oil News signal enhancement, ODP build/classifier input, ODP `finalBias`,
`values.*`, scoring, decision, execution, position, Brent promotion, Global Risk
Heatmap, or cross-validation.

## Next Allowed Step

The next allowed step is P47 artifact-only projection after the P44 sample gate
is reviewed. P47 must stay local/manual or fixture-backed unless a separate
review explicitly authorizes a production writer.

