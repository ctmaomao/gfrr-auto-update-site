# M-45 Frontend Field Synchronization

M-45 completes a narrow frontend/data-description synchronization after the M-41, M-42, and M-43 rungs.

## Scope

- Surface the M-41 `macroDrivers.fedLiquidity.effectiveFedFundsRate` and `sofr` fields in the `driver-liquidity` evidence list.
- Surface the M-42 `reserveBalances` and `reserveBalances4wChange` fields in the `driver-liquidity` evidence list.
- Update the `driver-policy` copy so it distinguishes current official rate signals from a true forward policy path.
- Pass `fedLiquidity` into `buildCrossValidationMatrix` so the `stagflation_pressure` `policy_path` evidence can acknowledge current-rate availability.
- Correct two stale market-pricing metadata fields: `data/market-pricing-history.json.descriptionZh` and `data/market-pricing-metrics.json.boundaries.displayLayerActive`.
- Bump the frontend cache version to `28.0M-45V`; `28.0M-44V` is intentionally skipped because M-44 was cleanup-only and did not change frontend assets.

## Why

M-41 added DFF and SOFR to the Fed liquidity driver. M-42 added WRESBAL reserve balances and their 4-week change. Those fields are now present after the latest data refresh, but the macro-driver cards still described bank reserves as missing and framed policy entirely as proxy-only.

M-45 updates the frontend text layer so the visible evidence matches the live field state without changing any source fetch, FRED resolver, scoring, decision, execution, or position logic.

## Policy Path Semantics

`effectiveFedFundsRate` is the current official policy-rate signal. `sofr` is an overnight secured funding-rate signal. They are not a full forward policy path.

For that reason, M-45 lets `stagflation_pressure.policy_path` acknowledge the current rate when DFF is available, while keeping the forward-looking gap explicit through `policy_forward_path`: Fed dot plot, Fed funds futures, OIS forward rates, and policy communication analysis remain missing.

## Market Pricing Metadata

The market-pricing history and metrics files already reflect post-M-26/M-27 reality:

- M-26 completed MA60 / standard deviation / z-score metric calculation.
- M-27 activated frontend display.
- M-28 added first-fold and cross-validation integration.

M-45 updates only `descriptionZh` and `boundaries.displayLayerActive` so metadata matches that actual state. No market-pricing data file is regenerated.

## Related Rungs

- M-41: `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- M-42: `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- M-43: `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
