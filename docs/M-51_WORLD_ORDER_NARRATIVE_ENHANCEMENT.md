# M-51 World Order Narrative Enhancement

M-51 improves the `world_order_pressure_crossing` cross-validation narrative by
using structured fields that already exist in `data/world-order-stress.json`.

This is a narrative-density upgrade only:

- no new external source,
- no new FRED series,
- no schema change,
- no world-order data regeneration,
- no scoring, decision, execution, or position change.

## Why This Exists

Before M-51, `buildWorldOrderNarrative` only used a small subset of the World
Order Stress payload: top-level score, freshness, confidence, market confirmation
input source, and a few source status gaps. The JSON already carries richer
context that can explain *why* the world-order layer matters.

M-51 connects that existing structure to the cross-validation card.

## Fields Used

M-51 reads the following existing fields:

- `state` and `labelZh`
- `dominantDrivers[0]`
- `dimensions.economicWeaponization.score`
- `dimensions.capitalControlRisk.score`
- `dimensions.blocFormation.score`
- `dimensions.multiTheaterConflict.score`
- `dimensions.marketConfirmation.state`
- `externalSources.gdelt.summary.toneProxy`
- `externalSources.ofac.summary.recentActionsCount`
- `decisionModifier.riskBias`

## Evidence Rules

The narrative now adds supporting evidence when:

- world-order state is not `normal_globalization`
- top dominant driver score is above 50
- a dimension score is above 50
- market confirmation is `confirmed` or `partial_confirmed`
- GDELT tone proxy is negative enough to indicate pressure
- OFAC recent action count is non-zero
- decision modifier risk bias is `upward`

When `decisionModifier.riskBias` is `neutral`, the narrative records that as
boundary evidence in `missingEvidence` instead of turning the whole narrative
into contradiction. This preserves the project rule that World Order Stress is
a structural interpretation layer and does not directly modify the existing
decision model.

Existing missing-evidence behavior is preserved for:

- `gdelt` stale
- `acled` not configured
- `sipri` manual required

## Boundary

M-51 does not modify:

- `data/world-order-stress.json`
- `scripts/build-world-order-stress.mjs`
- any `scripts/world-order/*` source, classifier, normalizer, or scoring file
- `.github/workflows/*`
- scoring / decision / execution / position logic
- other six cross-validation narratives

## Related Milestones

- M-46 to M-50 upgraded individual narratives by adding new data sources.
- M-51 starts the next trilogy: richer narratives from already available data.
- M-52 and M-53 are reserved for the remaining low-density narratives.
