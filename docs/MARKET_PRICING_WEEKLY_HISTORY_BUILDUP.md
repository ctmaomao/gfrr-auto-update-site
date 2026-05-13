# Market Pricing Weekly History Buildup (v28.0M-25)

## Purpose

This verifier confirms that the Market Pricing history file has enough validated weekly QQQ observations for the next statistical layer. The 60-week minimum is the precondition for M-26's MA60 / standard deviation / z-score calculations.

## What it validates

- `data/market-pricing-history.json` is already in `has_history` state.
- `assets.qqq.status` is `active`.
- `assets.qqq.records.length` is at least 60.
- `assets.qqq.coverage.hasAtLeast60Weeks` is `true`.
- `assets.qqq.coverage.weeklyRows` equals `assets.qqq.records.length`.
- The first record date matches `assets.qqq.coverage.oldestDate`.
- The last record date matches `assets.qqq.coverage.latestDate`.
- Records are strictly ascending by date, with no duplicates or out-of-order entries.
- Every record has a valid ISO date, valid ISO week, and finite positive `close`.

## What it does NOT do

- Does not perform MA60, standard deviation, or z-score calculation.
- Does not modify `data/market-pricing-history.json` or any other data file.
- Does not enable frontend display.
- Does not change scoring, decision, execution, or position logic.

Calculation remains gated by M-26. Frontend display activation remains gated by M-27.

## Relationship to M-24 and the upgraded history checker

M-24 committed real QQQ weekly records into `assets.qqq.records` under the existing multi-asset history schema.

The upgraded general history checker, `scripts/check-market-pricing-history.mjs`, validates structural integrity in both `waiting_for_history` and `has_history` states. This M-25 buildup verifier adds the calculation-prerequisite gate: enough validated weekly QQQ history must exist before M-26 can add MA60 / standard deviation / z-score calculations.
