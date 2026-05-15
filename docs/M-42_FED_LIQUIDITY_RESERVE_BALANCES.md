# M-42 Fed Liquidity Reserve Balances

M-42 completes the Fed liquidity triplet by adding FRED:WRESBAL to the existing M-41 DFF / SOFR extension.

## Scope

- Add FRED:WRESBAL to `resolveFedLiquidity`.
- Store `reserveBalances` in FRED native units: millions of U.S. dollars.
- Compute `reserveBalances4wChange` using the same 28-day / 4-week pattern as WALCL.
- Surface bank reserves as one additional B4 financial-fragility evidence line.
- Extend the formal `macroDrivers.fedLiquidity` contract.

No data files are regenerated in this PR. Values populate on the next scheduled `daily-pipeline.yml` run.

## Series Choice

WRESBAL is used instead of RESBALNS because the diagnostic verified it as active on FRED, with a longer history and the standard H.4.1 weekly Wednesday cadence:

- Series: FRED:WRESBAL
- Name: Reserve Balances with Federal Reserve Banks: Week Average
- Unit: Millions of U.S. Dollars, not seasonally adjusted
- Frequency: Weekly, ending Wednesday
- Source: H.4.1 Factors Affecting Reserve Balances

The pipeline preserves FRED native units for cross-reference and backtesting. The render layer divides by `1_000_000` before using `formatUsdTrillions`.

## Triplet Boundary

The completed Fed liquidity triplet is:

- M-41 DFF: target policy-rate signal.
- M-41 SOFR: actual secured overnight funding-rate signal.
- M-42 WRESBAL: reserve-buffer quantity signal.

WRESBAL is intentionally a quantity signal. It is complementary to rate-based evidence because reserves can deteriorate before funding rates spike, as seen around the 2019-09 repo-stress episode.

## Non-Goals

- WRESBAL does not enter `computeFedLiquidityPressure`.
- WRESBAL does not alter `classifyFedAssetTrend` or `classifyOnRrpLevel`.
- No 1-day / 7-day / 30-day change calculation is added.
- No RESBALNS source is added.
- No scoring, decision, execution, position, Worker runtime, workflow, or data-file behavior changes.

## Validation Boundary

`scripts/check-macro-drivers-fed-liquidity-extended.mjs` remains the single fed-liquidity extension guard. M-42 extends it to check WRESBAL source, render, and contract wiring while keeping committed-data WRESBAL fields as soft warnings until the next daily pipeline refresh.
