# GDELT Web NGrams Fallback Source Review

Contract version: `gdelt-web-ngrams-fallback-source-review-p45`
Status: `source_review_manual_fallback_candidate_no_production_display`
Scope: P45 source-review only.

## Purpose

This review defines what GDELT Web NGrams may become if GDELT DOC remains
rate-limited: a low-frequency background narrative-heat fallback candidate for
Oil News source health, not an event-confirmation feed.

It does not approve production display fallback, Oil News current-signal
enhancement, scheduled workflows, frontend rendering, score writes, ODP
direction changes, or any trading/position guidance.

## Source Character

GDELT Web NGrams files are downloadable ngram frequency files. They can reduce
pressure on the DOC search API because a single file can be downloaded and
classified locally. They are not article records, wire reports, verified
headlines, tanker-flow data, facility status data, or price-market structure.

Allowed interpretation:

- phrase/bucket heat for broad oil-news terms;
- source-health fallback context when DOC is rate-limited;
- manual stability sampling with P43/P44 artifacts.

Disallowed interpretation:

- confirmation of Hormuz closure or reopening;
- confirmation of tanker disruption, sanctions effect, refinery accident, or
  supply outage;
- oil-price direction, score, decision, execution, or position guidance;
- replacement for Tavily/Brave cross-source current news checks.

## Required Evidence Before Any Future Display Contract

P45 does not itself approve display. A later P46 display-only contract may be
considered only if all of these hold:

- P44 sample archive reports `stable_manual_review_ready`.
- At least 8 usable Web NGrams diagnosis samples are available.
- Samples span at least 24 hours of observation time.
- At least 2 independent selected Web NGrams timestamps are observed.
- The archived samples contain no article title, URL, snippet, body text, raw
  provider response, API key, header, cookie, or bearer-token material.
- Bucket coverage includes chokepoint, tanker shipping, market reaction, and
  either sanctions or supply/facility context.
- A future production artifact, if ever approved, stores only compact aggregate
  bucket/term counts and source-health state.

## Candidate Future Role

The only candidate future role is:

```text
oil_news_gdelt_web_ngrams_background_fallback_display_only
```

That future role would be limited to source-health/fallback wording such as
"GDELT DOC is rate-limited; Web NGrams background heat is available/stale/missing."
It must not increase current event confidence by itself.

## Current Decision

P45 classifies the source as a manual fallback candidate only:

- `fallbackCandidate = true`
- `productionDisplayFallbackApproved = false`
- `currentSignalEnhancementApproved = false`
- `workflowApproved = false`
- `frontendApproved = false`
- `scoreApproved = false`

The next allowed step is P46 contract design for production display-only
fallback, if enough P44 samples exist. P46 would still need a separate reviewed
contract and checker before any production JSON or frontend change.

## Boundaries

P45 does not change:

- `data/*.json`
- `realtime/*.json`
- Oil News production build behavior
- Oil News workflow cadence
- frontend
- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- ODP build input, classifier, or `finalBias`
- scoring / decision / execution / position
- Brent promotion
- Global Risk Heatmap
- cross-validation
