# ADR-0043: Preserve score input provenance and continuity

Status: Implemented and verified locally under the 2026-09-11 comprehensive scoring audit request. Full checks and independent AI review passed. Not deployed; no new remote integration authorization.

## Context

The current 68 score is reproducible but is not a calibrated probability or evidence of a market top. The audit also found implementation defects in configuration consumption, missing values, date comparisons, source eligibility and execution guidance. Correcting input eligibility alone could remove pressure when a source fails, creating an apparent improvement.

## Decision

Keep current numerical weights, module thresholds and tail floors. Read the existing configuration instead of duplicate constants; reject malformed supplied numbers and invalid weight groups. Missing/null core values retain the existing explicit rules-default policy in the pure calculator; this is not proof of an observation. Production source arbitration and source disclosures remain separate.

Only `live`/`fallback` structural evidence is usable at runtime. The historical adapter's explicit `historical` status is accepted only by the score replay, not live execution gates. MOVE's existing five-day gate additionally rejects future timestamps on both success and fallback paths.

For WALCL, ON RRP, T10Y2Y and IG OAS, retain the original FRED observation date in additive `sourceObservedAt`. Adopt operational maximum ages of 14 calendar days for weekly WALCL and 7 for the three daily sources, measured from UTC observation midnight; these are conservative data-availability limits, not statistically optimized risk parameters. Reject invalid/future dates and do not use the radar generation date to renew a cached observation. Old snapshots without provenance remain historical; they are not silently migrated to fresh caches.

Scored WALCL four-week comparisons need a reference within seven days of their target; daily seven-day comparisons need a reference within three days. A short series cannot substitute its latest row and manufacture a zero change. A previously available scoring value or scored change becoming unavailable holds Daily publication before source arbitration, score calculation or production replacement. This includes MOVE. If all structural evidence is unavailable, hold as well. The realtime-unavailable path also holds publication instead of relabelling yesterday's score and interpretation as generated today. This supersedes that narrow automatic `buildFallback` call; the function is retained without an active build call. Normal valid realtime, fresh caches and genuinely improving measured values are unaffected.

The hold is an explicit failure with `structural_input_publication_hold` or `main_score_input_publication_hold`. Retain the previous files and their original age; never lower the score or relax execution protection merely because evidence disappeared. This trades availability for truthful data. The first build after migration requires fresh source responses when the previous cache lacks original dates. A transient source error can reuse a dated cache within its limit; an expired cache cannot.

Reconcile the execution target with the existing structurally reduced exposure interval by lowering an out-of-band target. Do not widen the interval. Thirty-day statistics use actual UTC calendar dates with missing/duplicate days excluded. The frozen frontend decision fallback uses dated contiguous history and retains unknown three-day changes as unknown; it remains disconnected from the homepage runtime.

ON RRP's real zero comparison balance makes percentage change mathematically undefined, not missing. Preserve null and record `onRrpWeekChangeStatus=undefined_zero_baseline`; only this explicit case may pass the derived-change continuity check. Missing historical comparisons remain held when previously used. Valid measured changes use `observed`; unavailable comparisons use `missing`. Caches retain the recorded reason. Reject nonpositive WALCL and negative ON RRP/IG observations; preserve real zero ON RRP/IG and negative curve spreads.

Use largest-remainder integer allocation for the six relative regime weights. Independent rounding followed by clamping one residual could sum to 101; the new allocation totals exactly 100 with each share within one percentage point of its unrounded fraction. This may change a displayed weight or a tied dominant label, but not the six-module risk score. It does not make the percentages calibrated event probabilities.

## Verification and model boundaries

Add regression tests without weakening existing checkers or changing the eight immutable production score-output fixtures. Cover live/cache future dates, stale and absent provenance, lost derived inputs, unchanged-score days, missing values, configuration variation, exposure targets and monotone input stress. Run full checks and independent review.

No source, paid call, production dependency, production data rewrite or remote publication is added. The source freshness and publication policy are engineering safeguards. Tail discontinuity/saturation, correlated proxies, absolute price scales, regime probability terminology and predictive calibration remain separate model limitations documented in the [audit](../SCORE_SYSTEM_AUDIT_2026_09_11.md). Resolving those requires explicit outcome definitions, point-in-time data and frozen out-of-sample evaluation, not an arbitrary lower score.
