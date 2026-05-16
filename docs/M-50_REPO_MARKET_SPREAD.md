# M-50 Repo Market Spread

M-50 adds NY Fed repo-market reference rates to `macroDrivers.fedLiquidity`:

- `FRED:BGCR` — Broad General Collateral Rate.
- `FRED:TGCR` — Tri-Party General Collateral Rate.

The new fields are audit-only / display-only. They do not change `values.*`, scoring, `decisionModel`, `executionLock`, or `positionGuidance`.

## Architecture

BGCR and TGCR are added directly inside `resolveFedLiquidity` because SOFR is already fetched in the same resolver. This keeps M-50 simpler than M-49:

- no new async resolver,
- no function signature changes,
- no build call-site changes,
- no `fetchMacroDrivers` shape change.

`resolveFedLiquidity` now fetches WALCL, RRPONTSYD, DFF, SOFR, WRESBAL, BGCR, and TGCR.

## Unit Convention

The NY Fed rates are stored as percentages:

```text
bgcr = 4.32
sofr = 4.30
bgcrSofrSpread = bgcr - sofr = 0.02
```

The spread is also stored as percentage points. Display converts it to basis points:

```text
bp = bgcrSofrSpread x 100
0.02 x 100 = 2bp
```

The pipeline stores spreads at 4 decimal places to avoid losing sub-basis-point precision.

## BGCR vs TGCR

- BGCR is broader general collateral repo activity.
- TGCR is tri-party treasury collateral activity and is narrower.
- Both begin in April 2018 and are published by the NY Fed alongside SOFR reference-rate infrastructure.

M-50 classifies the primary repo stress signal using `bgcrSofrSpread`, while still storing `tgcrSofrSpread` for display/audit expansion.

## Classification

`repoSpreadRegime` uses the absolute BGCR-SOFR spread in basis points:

- `< 5bp`: `正常`
- `5-10bp`: `轻微偏离`
- `10-25bp`: `压力`
- `>= 25bp`: `危机水平`

This is a mostly silent indicator. Long stretches of normal repo market behavior should produce no supporting evidence; instead it becomes contradicting evidence against a liquidity-tightening narrative.

## Cross-Validation

M-50 upgrades only the `liquidity_tightening` narrative:

- `|BGCR-SOFR| >= 25bp`: supporting evidence, crisis-level repo stress.
- `10bp <= |BGCR-SOFR| < 25bp`: supporting evidence, repo pressure.
- `5bp <= |BGCR-SOFR| < 10bp`: supporting evidence, mild repo friction.
- `|BGCR-SOFR| < 5bp`: contradicting evidence, repo market normal.
- `null`: missing evidence.

The M-46 SLOOS conditional logic in the same narrative is preserved.

## Deferred Items

- SOFR-EFFR spread is deferred.
- OBFR and other rate spreads are deferred.
- No additional repo or funding series are added in M-50.

## Related Milestones

- M-41 / M-42: Fed liquidity DFF, SOFR, and WRESBAL completion.
- M-46: SLOOS dual-series pattern and conditional liquidity narrative.
- M-48: NFCI sign/direction semantics.
- M-49: crack spread sibling-resolver contrast.
