# M-52 Risk Asset Mismatch Narrative Enhancement

M-52 enhances only the `risk_asset_mismatch` cross-validation narrative. It adds five cross-dimensional mismatch evidence types using existing committed/runtime fields and does not add FRED series, data acquisition, schema fields, scoring, decision, execution, position, workflow, Worker runtime, or data-file regeneration.

This follows the M-51 pattern: narrative density improves by reading richer existing data, while the underlying data pipeline remains unchanged.

## Evidence Types

| Evidence type | Primary signal | Secondary signal | Supporting condition | Contradicting condition |
|---|---|---|---|---|
| `nfci_hy_mismatch` | `macroDrivers.credit.nfci` | `displayInputsBaseline.hyOas` | NFCI >= 0.5 and HY < 3.0, or NFCI >= 0.1 and HY < 3.5 | NFCI <= -0.5 and HY > 5.0 |
| `curve_qqq_mismatch` | `macroDrivers.curve.t10y2y` | QQQ market-pricing z-score | T10Y2Y <= -0.5 and z >= 1.5, or T10Y2Y <= -0.2 and z >= 1.0 | T10Y2Y > 0.5 and z <= -1.0 |
| `dxy_qqq_mismatch` | `displayInputsBaseline.dxy` | QQQ market-pricing z-score | DXY > 108 and z >= 1.5, or DXY > 105 and z >= 1.0 | DXY < 95 and z <= -1.0 |
| `ighy_vix_mismatch` | `macroDrivers.credit.igHyRatio` | `displayInputsBaseline.vix` | IG/HY < 0.20 and VIX < 16, or IG/HY < 0.30 and VIX < 20 | IG/HY > 0.40 and VIX > 25 |
| `repo_vix_mismatch` | `macroDrivers.fedLiquidity.bgcrSofrSpread` | `displayInputsBaseline.vix` | abs(BGCR-SOFR) >= 15bp and VIX < 16, or abs(BGCR-SOFR) >= 5bp and VIX < 20 | abs(BGCR-SOFR) < 3bp and VIX > 25 |

## Threshold Reuse

M-52 does not introduce a new data source or a new derived field. The evidence conditions intentionally reuse the already merged risk bands from the M-series narrative upgrades:

| Threshold family | Reuse source |
|---|---|
| NFCI tight/loose bands: `0.5`, `0.1`, `-0.5` | M-48 NFCI bank stress classification |
| QQQ z-score hot/cold bands: `1.5`, `1.0`, `-1.0` | Existing market-pricing temperature / cross-validation usage carried through M-47/M-51 |
| IG/HY ratio and HY OAS calm/stressed bands | M-46 credit-layer display / audit semantics and existing risk-mismatch context |
| VIX calm/warning bands: `16`, `20`, `25` | Existing risk-asset mismatch and cross-validation calm/warning semantics |
| BGCR-SOFR repo-spread bands: `5bp`, `15bp`, normal zone | M-50 repo market spread classification; stored as percent, displayed as basis points |

## Unit Convention

`macroDrivers.fedLiquidity.bgcrSofrSpread` is stored as percent, not basis points.

Example:

```text
0.04 = 0.04% = 4bp
```

M-52 converts it to basis points inside `buildRiskAssetMismatchNarrative`:

```javascript
const bgcrSofrBp = bgcrSofrSpread !== null ? bgcrSofrSpread * 100 : null;
```

This matches the M-50 `liquidity_tightening` narrative convention.

## Bug Fixes

### `qqq_zscore` Missing Logic

Before M-52, `qqq_zscore` was marked as missing whenever `metric.zScore < 1.5`, even when the metric existed and was simply neutral.

M-52 fixes the logic:

```javascript
if (!metric) {
  missingEvidence.push(evidence('qqq_zscore', null, 'QQQ 市场温度不可用'));
} else if (metric.zScore >= 1.5) {
  supportingEvidence.push(...);
}
```

Neutral z-score is now a no-op, not missing evidence.

### `vix_hy_oas` Removal

The old `vix_hy_oas` contradicting evidence had an illogical `!metric` guard: a VIX/HY OAS relationship should not depend on QQQ metric availability.

M-52 removes `vix_hy_oas` and replaces it with `ighy_vix_mismatch`, which uses credit breadth (`igHyRatio`) plus VIX.

## Interpretation Levels

M-52 replaces the old binary interpretation with six levels:

| Condition | Interpretation |
|---|---|
| `supportingCount >= 4` | Multi-dimensional mismatch is significant |
| `supportingCount >= 2` | Multiple mismatch signals are present |
| `supportingCount === 1` | Single mismatch signal, observe for resonance |
| `contradictingCount > 0 && supportingCount === 0` | Signals are directionally consistent, not mismatched |
| `missingCount > 0 && supportingCount === 0 && contradictingCount === 0` | Key data unavailable or stale |
| fallback | Insufficient mismatch evidence |

## Boundaries

- No new FRED series
- No new `macroDrivers` fields
- No `data/*.json` regeneration
- No workflow changes
- No scoring, decision, execution, or position changes
- Other six narratives are unchanged
- M-51 `world_order_pressure_crossing` GDELT `ok` guard remains unchanged
