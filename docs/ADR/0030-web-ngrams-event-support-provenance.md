# ADR-0030: Web shadow event-candidate matching and sanitized support links

## Status

Merged as PR #308 on 2026-09-08 (ac52ddda), after owner explicitly approved an
independent AI substitute ONLY for #308. The independent review's quoted-vessel
P2 was fixed and re-reviewed; exact-head CI and Pages 34176008763 passed. These
one-PR exceptions do not authorize later PRs. Time semantics are refined by
[ADR-0031](0031-web-ngrams-time-provenance.md); v4 remains historical evidence.

## Context

Same-axis/polarity/bucket/time comparison could count geographically different
events as support. Identical syndicated titles multiplied supported candidates
or domains. Aggregate counts did not expose the supporting pairs for review.

## Decision

- Add a title-only event signature in the existing backup validation layer:
  one recognized place, target family and mechanism must co-occur in a clause.
  Places: Hormuz, Suez, Red Sea, Bab el-Mandeb, Fujairah, Kharg, Ras Tanura.
  Unknown or multiple places/targets/physical causes abstain. One physical cause
  may have an operational consequence (attack closes traffic). Explicit quoted
  vessel names / IMO identifiers are hashed; mismatched, missing counterpart or
  multiple named identities abstain. No raw entity names are persisted.
  PR #308 independent AI review identified curved-single-quote omission and
  apostrophe prefix collisions. Paired quote delimiters now retain complete
  names; malformed/ambiguous quoted hints abstain. This technical review does
  not reuse PR #307's one-off substitute-for-human authorization.
- Require matching signatures in addition to ALL previous direction, axis,
  bucket, metadata-time and distinct-non-parent/child-host checks. This is a
  same-event candidate filter, never proof of event identity or factual truth.
- Same canonical URL or normalized title hash is discovery overlap, not support.
  Per reference story choose one deterministic canonical publication; retain only
  its actual provider labels. Cross-provider support requires different story
  hashes and independent host families from different providers. Sibling-domain
  ownership remains unverified; do not transfer provider labels across copies.
- Per identical Web story select one deterministic representative for support
  counts; retain all candidate rows and the original all-candidate denominator.
  Reference input counts remain unchanged; duplicate IDs have one table row/link.
- Ignored observations contain a reference table (hash ID, provider, normalized
  domain, URL/title hashes, validated timestamp/date-state, signature), support
  links and fixed-enum rejection counts. No raw title, URL, body, snippet, name
  or invalid date text is emitted. Production cache remains aggregate-only with
  no new fields, article IDs, reference table or signatures.
- Reference inputs are bounded at 256; retain the candidate builder's 2000-row
  maximum. Over-limit input fails the isolated shadow processing path, not a
  partial graph presented as complete. No new fetch, dependency or workflow.
- Telemetry v4 is a new calculation cohort. Old v2/v3 keep strict diagnostics;
  preserve all history, 30 days/120 samples, thresholds and denominators. Only
  v4 participates in current quality gates. No scoring or source cutover change.

## Checker migration requiring independent review

Date/domain fixtures now supply Web identities and a different reference headline:
identical text is no longer an independent-support positive. Multilingual positives
include explicit locations; former no-place cases remain negative tests. The old
two-index identical-headline positive becomes a stronger expected-zero assertion;
distinct-story positives are in `tests/unit/oil-news-event-support-links.test.mjs`.
The cohort assertion names v4 and new tests verify strict v2 AND v3 compatibility.
No safety threshold, skip or ignore list is relaxed.

## Consequences and limits

The small vocabulary deliberately lowers recall. Same place/family/mechanism in
36 hours can still describe separate events, especially without named identities.
Paraphrased syndication and common publisher ownership are unresolved by exact
title deduplication. Labels mean unconfirmed candidate support, not verified news.
TOC date semantics remain unverified as original publication time: the audit
explicitly labels its time evidence a metadata window, without inventing dates.
No precision estimate or cutover approval follows from passing tests or elapsed time.

## Verification

Keep the existing checks and 56 title-guard tests. Add 32 regressions for
cross-event mismatches, multilingual locations, named assets, duplicates, provider
reuse, deterministic links, host families, malformed dates, input bounds, a
single-pair stub builder, public-cache privacy and historical-version isolation.
Four review regressions cover different curved-quoted names, internal apostrophes,
same-vessel quote-style equivalence and malformed/ambiguous quoted hints.
All run through the existing `check:all` path, without live queries.
