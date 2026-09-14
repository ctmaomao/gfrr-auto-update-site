# ADR-0048: Bubble Watch source dates and evidence validation

Status: proposed; implementation authorized on 2026-09-14, independent review required before integration.

## Problem and decision

The September 14 comparison found four evidence defects: an April Crunchbase Q1 article was stamped with the current fetch date; old Neocloud financing pages without current company coverage produced a green zero; RPO table parsing removed missing cells and relied on positional year comparisons; Yahoo-calculated breadth retained a Barchart source label and lost quote dates.

Keep Core-23/Shadow-4, weights and thresholds unchanged. Apply source-specific observation gates and use the existing dated research fallback on failure. VC must have a recent, unambiguous completed quarter/half-year and global AI-sector denominator; Neocloud requires dated article evidence covering all four companies within its existing 21-day window. Index modification timestamps do not qualify. This remains a limited public monitor, not comprehensive ratings coverage. RPO pairs actual period-end dates, preserves missing values, compares the same company set across growth periods and discloses excluded companies. Oracle's quarterly page currently lacks comparable values and must remain excluded. Breadth uses one dated session with at least 70% constituent coverage and labels the actual source.

## Explicit checker revision

The existing Crunchbase assertion `aiFundingB >= 200 && sharePct >= 75` encodes Q1 2026 values rather than the intended protection against confusing mega-round funding with total AI-sector funding. Replace it with original-evidence replay, exact amount/share equality, positive values and a 0–100% bound. Retain the global venture denominator and v2 parser assertions. A valid future 70% reading must pass; a mega-round sentence without the sector denominator must fail. This assertion revision is declared in this separate source-contract PR and requires independent review; it is not an exception to review or a presentation patch.

## Execution and validation

The owner explicitly authorized fixing these confirmed issues before the official refresh, including that chain's existing paid Wind fallback and one downstream DeepSeek editorial call. Do not add retries or separately dispatch a second editorial call. After integration, run the official main workflow, verify its outputs and downstream publication, then compare the published scores with the contemporaneous upstream snapshot. Isolated free preview artifacts cannot be promoted into production.

Regression coverage includes old/future/mixed VC periods, lower valid sector shares, old/undated/partial credit coverage, aligned breadth denominators, absent RPO comparison cells and Oracle's mixed-period trap. Run `npm run check:changed` (full suite for this code/contract change) and an isolated free build. New provider integrations, dependency changes and GFRR main-score changes are outside scope.
