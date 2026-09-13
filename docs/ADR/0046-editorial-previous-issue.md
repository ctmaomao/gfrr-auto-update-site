# ADR-0046: Preserve a dated previous Macro Risk editorial during update gaps

- Date: 2026-09-12
- Status: Owner selected daily updates with previous-issue display; implementation pending integration review
- Scope: Daily preservation and the existing Macro Risk article slot only

## Context and accepted behavior

On 2026-09-12, Daily published its snapshot at 00:27 UTC; editorial admission waited for upstream snapshots at 00:29 and 00:55, then the qualified AI was generated at 01:38. This was a Saturday, but there is no weekend suspension. The matching-input gate correctly hides yesterday's AI as current commentary. Daily also rebuilds the radar payload without that current editorial field, leaving an avoidable gap.

The owner explicitly selected “保留每日更新，间隙展示上一期 AI”. Keep existing daily admission and cost budgets. Display a dated previous qualified production issue during a gap; expand today's deterministic evidence. Current qualified AI takes priority on the next page load. This change adds no polling or provider calls.

## Decision

Add optional root `macroRiskEditorialPreviousIssue`, containing one unchanged production envelope. Daily selects the latest qualified issue from the preceding production snapshot's current layer (only when it matches that snapshot's updatedAt) and its previously retained issue. Select by original source time, then original generation time. Preserve through weekends, skips and failures; retain as explicitly dated history without a wall-clock expiry. Never copy manual artifacts, rewrite dates, relabel old scores as current or populate `macroRiskEditorialLayer` with history.

Preservation checks recorded Actions provenance, finite non-future source/output/projection dates, ordering, original input/output metadata, display boundaries and all existing production-envelope assertions, including recomputed output digest and source references. Envelope validation is replayed at the later of the two unchanged generation clocks against the issue's original source timestamp. This proves retained structural qualification, not current freshness. Invalid candidates are rejected; a failed candidate cannot erase an older qualified issue. No valid candidate means no archive, with current deterministic content remaining available.

The browser distinguishes `current`, `previous` and `unavailable`. The current predicate, strict live acceptance, writer and provider contracts remain unchanged. Previous mode uses the separate historical field with its original date and an explicit notice that its prose, scores and conditions describe the old issue. It has no live indicator; deterministic evidence stays expanded. The browser trusts the checked static artifact for output hashing, as the existing current renderer does; publication checks verify the digest. No historical output enters scoring, admission, decisions, execution or positions.

This extends DESIGN sections 4.1 and 5.4 in the existing article location, with corresponding section 10.2 labels. No section or navigation order changes. ADR-0023's evidence fallback still applies when current AI is unavailable, even if history is visible. ADR-0042 still governs the retained **current field** and its `expired_hidden` result; its assertions are not relaxed. The new historical field has a separate validation command added to the required editorial suite.

## Validation and release boundaries

Tests cover unchanged preservation, consecutive gaps, weekend retention, newest-issue selection, bad candidate fallback, future/invalid timestamps, manual provenance, digest/source/review/boundary rejection and unchanged current-layer gates. Browser cases at 1440 and 390 pixels cover dated history, expanded current evidence, no overflow and current-issue replacement after reload.

There is no production JSON patch, workflow change, dependency addition or new paid run. Initial archive population occurs on the next successful Daily publication after integration; existing current AI remains visible meanwhile. Independent integration review and production acceptance remain required. An already open browser page still needs reload to obtain a newly published snapshot.
