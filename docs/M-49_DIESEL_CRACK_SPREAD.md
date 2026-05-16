# M-49 Diesel Crack Spread

M-49 adds NY Harbor ULSD spot price (`FRED:DHOILNYH`) as a downstream energy-chain input for `brentPricingLayer`. The new fields are audit-only / display-only and do not change `values.brent`, Brent promotion, scoring, `decisionModel`, `executionLock`, or `positionGuidance`.

## Data Source

- `DHOILNYH`: NY Harbor Ultra-Low Sulfur No. 2 Diesel Fuel Spot Price.
- Frequency: daily.
- Unit: dollars per gallon.
- Pipeline resolver: `resolveUlsd(prevBrentPricingLayer)`.

DHOILNYH is used because diesel crack spread is a direct refining-margin proxy for downstream petroleum tightness. Higher crack spread can indicate supply tightness and inflation pressure; very low crack spread can indicate weak demand and growth pressure.

## Unit Conversion

The conversion is mandatory:

```text
Crack Spread ($/barrel) = DHOILNYH ($/gallon) x 42 - Brent ($/barrel)
```

One barrel contains 42 gallons. Without the `x 42` conversion, the calculation would produce obviously wrong negative values such as `2.85 - 80 = -77.15`.

M-49 keeps a defensive sanity guard:

- If computed crack spread is `< -30`, set `crackSpread = null`.
- If computed crack spread is `> 120`, set `crackSpread = null`.

These bounds are designed to catch unit conversion or stale-input errors rather than to classify the market.

## Architecture

`buildBrentPricingLayer` is intentionally synchronous. It does not fetch FRED data.

M-49 therefore adds a sibling resolver:

1. `resolveUlsd(prevData?.brentPricingLayer)` fetches `FRED:DHOILNYH`.
2. The daily pipeline awaits this resolver before output assembly.
3. `buildBrentPricingLayer({ ..., ulsdData })` receives the prefetched data.
4. Crack spread is computed inside `buildBrentPricingLayer` using the selected Brent value.

`resolveUlsd` is not part of `fetchMacroDrivers()` because this is a `brentPricingLayer` extension, not a `macroDrivers` extension.

## New Fields

`brentPricingLayer` gains:

- `ulsdPrice`
- `ulsd4wChange`
- `crackSpread`
- `crackSpread4wChange`
- `crackSpreadRegime`
- `ulsdSourceStatus`

`crackSpread4wChange` is an approximation using `ulsd4wChange x 42`. It does not subtract Brent 4-week change because that value is not available inside the synchronous Brent layer.

## Cross-Validation

M-49 upgrades only the `energy_shock` narrative:

- `crackSpread >= 45`: supporting evidence, supply tightness confirms energy shock.
- `25 <= crackSpread < 45`: supporting evidence, elevated downstream pressure.
- `10 <= crackSpread < 25`: neutral, no evidence added.
- `crackSpread < 10`: contradicting evidence, weak demand argues against energy shock.
- `crackSpread === null`: missing evidence.

Other cross-validation narratives are unchanged.

## Boundaries

- No data file regeneration in the PR.
- No workflow changes.
- No Worker runtime changes.
- No external AI changes.
- No scoring / decision / execution / position change.
- No gasoline crack spread or other oil/gas series in M-49.

## Related Milestones

- M-41 / M-42: Fed liquidity triplet (`DFF`, `SOFR`, `WRESBAL`).
- M-43: external AI provenance metadata.
- M-46: SLOOS bank loan standards.
- M-47: ISM Manufacturing PMI.
- M-48: Chicago Fed NFCI bank stress index.
