# ADR-0031: Web NGrams time provenance and publication qualification

## Status

Owner authorized implementation on 2026-09-08, followed by per-step commit/push.
Independent checker/merge review remains required. The one-off AI substitute
approvals for PR #307 and #308 do not apply to this PR.

## Evidence and problem

The [official GDELT dataset description](https://blog.gdeltproject.org/using-the-new-web-ngrams-dataset-to-find-relevant-coverage/)
(published 2026-06-30, checked 2026-09-08) describes minute-level monitored news
windows and file-local document IDs. It does not establish that TOC `date` is
the original article publication time. The adapter nevertheless assigned it to
`publishedAt`, and downstream quality counters used it as publication evidence.
ADR-0030 disclosed the uncertainty, but a label alone did not separate the counts.

## Decision

Keep the same backup-validation layer, source requests, production source routing
and all scoring boundaries. No original-publication resolver is introduced.

- `datasetObservedAt` is the strictly parsed pair filename time, not fetch time.
- `tocTimestamp` is a strictly parsed TOC `date`, with unverified semantics.
- Web `publishedAt` is always `null`, with the fixed basis
  `original_publication_time_unknown`. Ignore TOC extra publication fields and
  legacy/caller-supplied Web publication values; never borrow a reference date.
- `generatedAt` retains its local generation meaning. None of these clocks may
  fill another clock's missing value. Do not require TOC/file time equality.
- Only absolute ISO timestamps with explicit timezone and a real calendar are
  accepted. Reject relative dates, impossible days, timezone-free dates and
  invalid time/offset components. Retain the existing policy rejecting TOC rows
  without valid metadata dates; report invalid/missing joins, never echo raw dates.
  A syntactically valid future TOC time can remain a candidate but cannot match.
- The existing original-publication aggregate remains the ONLY public cache
  projection. With current Web inputs, support counts are zero, support rates
  are zero for nonempty candidate sets (null for empty sets), and all Web dates
  are missing. Existing exact-key, count/rate and comparison constraints remain;
  a v5-specific assertion prevents metadata aggregates posing as qualified data.
- Preserve same-event signatures, identity guards, syndication deduplication,
  sanitized reference table and links under ignored-only `metadataCandidateSupport`.
  It compares TOC metadata against reference-reported time under the unchanged
  36-hour window. `publicationFreshnessQualified=false` and `usedForQualityGates=false`.
  Reference reported time also does not prove verified original publication.
- Candidate v2 / classification v3 / telemetry v5 distinguish the new shapes and
  calculation semantics. Public cache container stays v1 with no added public
  fields. Old v2/v3/v4 telemetry stays strictly validated and historical, never
  relabelled or recomputed. Quality gates use only v5, with all 30-day/120-sample,
  rate, denominator and manual-cutover conditions unchanged.

## Checker migration for independent review

Previous same-event/date/domain/duplicate positives remain positive on the
metadata-candidate path, with additional zero-public-support assertions. No
synthetic verified publication dates are inserted to keep those positives.
The stub cache's former qualified support positive is now metadata-only. Mature
history still passes the same 30-day and 120-sample sub-gates but cannot pass the
overall gate without publication evidence; old maturity-only positives become
stronger negatives. No existing threshold, skip or ignore is relaxed.
Independent review caught two title-guard integration checks that only observed
the now-always-zero public counts. They additionally assert metadata rejection
counts for unrelated/disputed/hypothetical titles and denial on either side;
identical-story discovery remains distinct from metadata support. This prevents
the new publication gate from masking a lost title guard.

## Verification and operational consequences

Regress strict ISO/calendar parsing, distinct clock propagation, invalid-date
redaction, future/stale/missing metadata, no legacy/publication injection,
same-pair stub fetching, metadata-to-public projection rejection, strict old
cohorts, and maturity without publication qualification. Run focused checks then
`check:changed` / `check:all` without live queries or production writes.

Before first post-merge v5 refresh, production may still contain v3/v4 records.
Natural-refresh acceptance and real sample review are separate from local tests.
Merely waiting longer cannot resolve original-publication evidence: that needs
an independently reviewed source/resolver design before qualification can resume.
This is not a provider outage, a reason to lower thresholds, or source-cutover approval.
