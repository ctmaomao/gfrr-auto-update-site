# ADR-0029: Guard Web NGrams shadow title claims and requalify their cohort

## Status

Owner authorized implementation and task-branch commit/push on 2026-09-07 after
the read-only news v2 review. Pending independent checker/merge review; this
record does not approve source cutover, production scoring, paid calls or merge.

## Context

Eight audited v2 batches contained 316 candidates, only 26 with a directional
label. A real pond-restoration headline was labelled transport de-escalation;
a headline explicitly reporting both an attack claim and a denial was labelled
escalation. Offline negative controls reproduced negation and hypothetical-event
false positives. The cross-source checker also explicitly required the plural
`Hormuz tanker attacks` to remain unsupported, encoding a word-form omission.

## Decision

- Scope this change to the Web shadow classifier used on both Web candidates
  and existing Tavily/Brave comparison results. Production Oil News classification,
  discovery queries, provider budgets, workflows and source routing stay unchanged.
- Require a local title topic anchor and topic/direction in the same clause.
  Body buckets alone cannot confer headline relevance. Negation, uncertainty,
  threats and hypothetical/future cues abstain; an explicit claim plus denial
  remains mixed/contested and cannot supply directional support. Guards are
  conservative five-language rules, not general language understanding.
- Add explicit English directional inflections only in the shadow classifier.
  In `check-gdelt-web-ngrams-cross-source-telemetry.mjs`, move the affirmative
  `Hormuz tanker attacks` case from expected support 0 to expected support 1,
  and add `attacked` to the positive set. Retain the mixed and context negatives;
  add dedicated negation, uncertainty, topic, privacy and end-to-end tests.
  This is a disclosed semantic assertion correction, not a skipped assertion
  or a weakened promotion gate. Review this checker diff independently before merge.
- Identify the changed classification as classification v2 / telemetry v3.
  Existing cache fields carry the version; no production fields are added.
  Validate v2 and v3 with the same strict diagnostics/count/rate checks; retain
  v1 and missing-version historical compatibility. Only v3 participates in new
  readiness quality metrics. Never rewrite/relabel/recompute old aggregate history.
- Preserve 30 days / 120 usable samples, all quality thresholds, candidate-rate
  denominators, `automaticCutoverApproved=false` and all no-signal/scoring flags.

## Consequences

False positives covered by these rules abstain, at a cost of lower recall:
whole-title uncertainty vetoes deliberately do not guess complex negation scope.
Topic anchors and same-clause co-occurrence still do not establish the event's
subject, geography or factual truth. Supported-language coverage is not a claim
of exhaustive morphology, dialect or linguistic accuracy.

Newly merged code must collect its own same-definition observation history.
Passing unit tests or eventually accumulating 30 days does not approve cutover.
Same-event matching, syndication/ownership checks, traceable supporting-reference
identities and TOC timestamp semantics remain separate follow-up work. No sample
precision estimate is inferred from the synthetic tests.

## Verification

The existing classifier, cross-source, cache and history checks are retained.
`tests/unit/oil-news-shadow-claim-guards.test.mjs` adds real-title regressions and
synthetic controls, a stubbed single-pair build (no network), checks both comparison
sides, privacy/production isolation and strict v2/v3 validation/cohort separation.
It runs through the existing classifier check in `check:all`. No dependencies,
coverage ignores, live refresh or production artifact edits are required.
