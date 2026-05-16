# M-53 Overheat Confirmation Narrative Enhancement

M-53 enhances the `overheat_confirmation` cross-validation narrative. It adds macro evidence density without adding any new FRED series, changing acquisition, regenerating `data/radar-data.json`, or touching scoring / decision / execution / position logic.

This PR completes the 7/7 cross-validation narrative upgrade framework that began in M-46:

| Milestone | Narrative |
|---|---|
| M-46 | `liquidity_tightening` SLOOS evidence |
| M-47 | `stagflation_pressure` PMI evidence |
| M-48 | `credit_spread_warning` NFCI evidence |
| M-49 | `energy_shock` crack spread evidence |
| M-50 | `liquidity_tightening` repo spread evidence |
| M-51 | `world_order_pressure_crossing` structured world-order evidence |
| M-52 | `risk_asset_mismatch` cross-dimensional mismatch evidence |
| M-53 | `overheat_confirmation` macro confirmation evidence |

## Scope

M-53 modifies only the narrative interpretation layer and supporting contract checks:

- `buildOverheatNarrative(metric, data)` keeps the existing metric-first signature.
- No new data sources are added.
- No new macroDrivers fields are added.
- No committed data file is regenerated.
- The narrative reads existing fields defensively with `finite()`.

## New Evidence Types

| Evidence id | Source fields | Supporting branch | Contradicting branch | Notes |
|---|---|---|---|---|
| `pmi_overheat` | `macroDrivers.consumer.ismManufacturingPmi` | PMI > 55, with PMI > 60 as stricter deep expansion | PMI < 50, with PMI < 45 as deep contraction | M-47 PMI expansion / contraction logic reused; PMI > 60 is a stricter overheat threshold |
| `sloos_easing` | `macroDrivers.credit.sloosTighteningLargeFirms` | SLOOS < 0, with SLOOS < -15 as stricter easing | SLOOS > 20 | M-46 SLOOS tightening threshold reused; negative SLOOS captures easing |
| `hyoas_complacency` | `displayInputsBaseline.hyOas` | HY OAS < 3.5, with HY OAS < 3.0 as stricter complacency | HY OAS > 5.0 | M-48 / M-52 HY calm and warning thresholds reused; 3.0 is a stricter calm threshold |
| `nfci_easing` | `macroDrivers.credit.nfci` | NFCI <= -0.1, with NFCI <= -0.5 as significant easing | NFCI >= 0.5 | M-48 NFCI regime boundaries reused |
| `umich_improving` | `macroDrivers.consumer.threeMonthChange` | UMCSENT 3m change > +6 | UMCSENT 3m change < -8 | Existing UMCSENT slow-variable change thresholds reused from consumer regime context |
| `repo_zero_stress` | `macroDrivers.fedLiquidity.bgcrSofrSpread` | `|BGCR-SOFR| < 3bp` as zero stress | `|BGCR-SOFR| >= 10bp` as repo stress | M-50 unit convention reused; <3bp is a stricter normal-zone threshold |
| `hyOas_qqq_complacency` | `displayInputsBaseline.hyOas` + QQQ z-score | n/a | HY OAS < 3.5 while QQQ z-score >= 2 | Replaces old `credit_confirmation` missing evidence |

## Threshold Provenance

M-53 mostly reuses reviewed threshold families from earlier milestones:

| Threshold | Provenance |
|---|---|
| PMI > 55 / < 50 / < 45 | M-47 PMI regime logic |
| PMI > 60 | New stricter version of the M-47 expansion threshold |
| SLOOS < 0 / > 20 | M-46 SLOOS easing / tightening interpretation |
| SLOOS < -15 | New stricter version for significant easing |
| HY OAS < 3.5 / > 5.0 | M-48 and M-52 credit calm / warning thresholds |
| HY OAS < 3.0 | New stricter version for extreme complacency |
| NFCI <= -0.5 / <= -0.1 / >= 0.5 | M-48 NFCI five-tier regime |
| BGCR-SOFR >= 10bp | M-50 repo pressure threshold |
| BGCR-SOFR < 3bp | New stricter zero-stress threshold inside the M-50 normal zone |

The four declared stricter thresholds are PMI > 60, SLOOS < -15, HY OAS < 3.0, and BGCR-SOFR < 3bp.

## Bug Fixes

### contradictingEvidence Was Always Empty

Pre-M-53, `buildOverheatNarrative` allocated `contradictingEvidence` but never pushed into it. M-53 adds reverse branches for macro evidence, so the narrative can now actively reject overheat when growth, credit, financial conditions, consumer sentiment, or repo funding contradict it.

### assessment Null Fallback

Pre-M-53:

```javascript
assessment: metric?.zScore >= 2 ? 'strong_confirmation' : null
```

The explicit `null` prevented the narrative helper from falling back to evidence-based assessment. M-53 changes this to an explicit variable:

```javascript
const explicitAssessment = metric?.zScore >= 2 ? 'strong_confirmation' : undefined;
```

This preserves the pre-M-53 rule that QQQ z-score >= 2 forces `strong_confirmation`, while allowing `assessEvidence(...)` fallback when that condition is not met.

### credit_confirmation Replacement

The old `credit_confirmation` item was semantically misplaced because it marked calm HY credit as missing evidence. M-53 replaces it with `hyOas_qqq_complacency` as contradicting evidence: QQQ is hot, but credit spreads remain calm, so the overheat spread into credit is not confirmed.

## Unit Notes

`bgcrSofrSpread` is stored internally as percent, matching M-50:

```javascript
const bgcrSofrBp = bgcrSofrSpread !== null ? bgcrSofrSpread * 100 : null;
```

Display and thresholds use basis points.

UMCSENT is a monthly slow variable. The current committed data can lag by roughly 2.5 months, so `umich_improving` is treated as contextual macro confirmation, not a fast market signal.

## Boundaries

- No new FRED series.
- No data file regeneration.
- No changes to `run-daily-pipeline.mjs`.
- No scoring / decision / execution / position impact.
- No changes to the other six narratives.
- M-51 GDELT status guard and M-52 mismatch evidence remain unchanged.
