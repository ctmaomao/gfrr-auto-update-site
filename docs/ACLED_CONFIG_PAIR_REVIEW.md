# ACLED normalized pair revision review

This offline `artifact_sanitizer_layer` step compares a complete weekly/monthly
normalized candidate with a complete saved baseline. It does not download, retain
raw workbooks, write configurations, grant source rights or publish data.

## Interface

`node scripts/review-acled-config-pair.mjs` accepts one JSON envelope on stdin:

- `baseline`: exactly `weekly` and `monthly`, each the original configuration JSON text.
- `candidate`: the same two JSON text fields, produced by the existing sanitizers.
- `expectedBaselineSha256`: `null` for first review, or exactly `weekly` and
  `monthly` lowercase SHA256 values from the prior review's `baselineByteSha256`.

No flags or file paths are accepted. Stdin is limited to 5 MiB and five seconds;
each configuration is limited to 1 MiB. Errors never echo input or exceptions.
The library `reviewAcledConfigPair` uses the same envelope without file/network I/O.

## Comparison semantics

Only top-level `preparedAt` is excluded from semantic comparison. Object keys are
canonicalized; array order remains significant. Ranked lists, windows, filenames,
counts, metadata and all other fields still participate. Output contains fixed
section names, dates, file row-count change counts and hashes, not source rows,
country names or arbitrary input strings. Dates are calendar-validated.

- `unchanged`: both semantic configurations match, possibly with serialization or preparation-time changes.
- `review_required`: at least one date advances or a same-date revision exists.
- `date_regression_hold`: either candidate date precedes its baseline.
- `baseline_changed_hold`: either exact baseline byte hash differs from a supplied pin; takes precedence over other findings.
- `invalid`: missing pair member, unsupported shape/source/version, invalid identity/date/count, oversized or malformed input.

The CLI exits 1 for invalid/hold, 0 for a completed comparison. **Exit 0 is not
publication approval.** Every report has `productionEligible=false`.

## Remaining publication gates

This is a comparison-shape check, not a duplicate implementation of the full
sanitizers or production validators. It does not prove workbook authenticity,
freshness, row-level revision equivalence, source permission or complete country
coverage. The monthly input is six files: one monthly series and five annual
series. A corrected weekly calendar date can look like an advance and is not
automatically new source data.

A hash pin detects a changed baseline only at the instant supplied bytes were
read. It is **not a lock, transaction or protection against a later race**. A future
writer must re-read both configurations under its shared writer lock, revalidate
the candidate and pin, enforce source/publication gates, and commit both files
together against the expected repository revision. Never merge a new weekly
candidate with an unrelated old monthly candidate after a partial failure.

The spent once-only cloud acceptance remains run 35277723078. This tool adds no
request budget, schedule, workflow exception, source-cutover or writer authority.

The next [paired commit preparation](ACLED_PAIR_COMMIT_PREPARATION.md) component
now rechecks these pins under the shared local lock and creates an unreferenced
commit after the existing strict validators. It still does not publish or provide
a remote lease; production integration remains separate.
