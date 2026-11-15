# ADR-0108: ACLED common-window pair comparison

## Status and scope

2026-11-11 implementation under the owner's continuing GFRR audit and repair
request, based on main `51bebb2d90c3b21201bdbff1862bb58128ca71b2` in an isolated
checkout. Independent review, full checks and exact-head CI remain required.
No source login, acquisition, retry, claim reset or production-data rewrite is
part of this repair. Existing source rights and the 26/14/14 budget do not change.

## Evidence

Natural [run 42975462379](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42975462379)
confirmed login, six weekly downloads, logout and private validation/cleanup,
then held with `invalid_config_review_input`. Raw inputs and the candidate were
not retained, so the exact live payload cannot be replayed without reacquisition.

A source-free synthetic six-XLSX regression reproduces that hold through the real
private sanitizer and automatic orchestration: three files end one week later,
but all share the same twelve observed weekly slots. The sanitizer correctly
uses the earliest regional endpoint under [ADR-0040](0040-acled-common-week-window.md),
while the comparator incorrectly required the maximum endpoint and disallowed
newer source coverage. The existing production fixture had equal endpoints and
therefore hid this contract mismatch. This is a demonstrated defect consistent
with the live failure, not a claim to have recovered the original batch.

## Decision and explicit assertion change

- Preserve exact envelope/top-level shape, source/version/provenance, six unique
  identities, positive row counts, two valid ordered range dates, bounded sizes,
  immutable inputs, semantic hashes and exact-byte baseline pins.
- When `quality` has its own `weeklyWindow` field, require the existing
  `weeklyWindowProblem` checks to pass, and require `latestWeek` to equal the
  **minimum** source endpoint. The existing helper checks the continuous twelve-
  and four-week grids, matching date/version, all six regions and complete source
  range coverage. Requiring the minimum additionally rejects an arbitrarily old
  cutoff even if all sources cover it. Explicit null/false/malformed metadata
  cannot fall back to legacy handling.
- Only when that field is absent, retain the previous maximum-endpoint rule for
  historical comparison compatibility. Runtime continues to exclude unverified
  legacy weekly contributions; comparison does not grant production eligibility.
- Continue comparing all metadata and original source ranges. Do not alter dates,
  drop newer source observations, change totals or fabricate common coverage.

This deliberately replaces the incompatible comparator assertion only for the
already-defined common-grid format. It does not weaken or modify the sanitizer,
strict weekly/monthly publication checkers, runtime evidence guard, freshness,
CAS/lock, cleanup, source permission or budget gates. Date regression and changed
baseline holds retain their priorities; monthly bytes remain pinned in weekly-only
runs. No checker ignore/skip is added.

## Verification and limits

Regression coverage includes sync/staggered endpoints, legacy-to-common migration,
false cutoffs, malformed metadata on both baseline and candidate, missing or
reordered grids, duplicates, coverage gaps, dates, same-date revisions, regression,
byte pins and unchanged preparation timestamps. The real-XLSX integration injects
only synthetic collection/GitHub transports, runs the original sanitizer and
strict pair preparation, verifies large newer values stay outside the common
window, and preserves monthly bytes and workspaces.

The comparator still reports `contentValidated=false`, `productionEligible=false`
and zero network/file writes. It does not prove authenticity, row-level completeness
or freshness by itself. Full check and review receipts accompany delivery; merge
and site deployment do not prove a new source acquisition. Live recovery remains
to be verified at a subsequent authorized natural slot, without replaying the
spent November 11 slot.
