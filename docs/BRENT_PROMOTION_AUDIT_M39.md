# Brent Promotion Audit Completeness M-39

M-39 records a narrow Brent audit-field completion fix authorized by the local diagnostic for `brentPricingLayer.promotionAudit`.

## Scope

This PR fills only two fields when existing in-memory realtime data already contains enough information:

- `promotionAudit.promotionReason`: keeps `promotion.reason` first, keeps `validation.reason` second, and adds `validation.consensus.reason` as the third fallback.
- `promotionAudit.anchorAgeHours`: keeps existing Worker-path `sourceDetails.ageHours`, `sourceDetails.observedAgeHours`, and `validation.anchorAgeHours` first, then derives fallback hours from `sourceDetails.ageSeconds / 3600` or the `fred-anchor` candidate `observedAt`.

The change does not add a new Brent source, fetch path, promotion engine, scoring rule, decision rule, execution rule, or position rule.

## Preserved Nulls

M-39 deliberately preserves these nulls:

- `promotionAudit.promotionApplied`: remains tied to explicit upstream Worker promotion semantics.
- `promotionAudit.moveStatus`: remains null when the current realtime source has no move-vs-previous engine.
- `confirmationSources[0].value` and `confirmationSources[0].observedAt`: remain null for the `ice` source when upstream fetch data is missing.

Filling those fields would hide architecture gaps or real data-health issues. They require separate reviewed work if the project chooses to define new semantics later.

## Data Boundary

`data/radar-data.json` is not regenerated in M-39. The updated reading logic will populate the two target fields on the next scheduled `daily-pipeline.yml` run when a production-style realtime payload includes `brentValidation.consensus.reason`, `sourceDetails.brent.ageSeconds`, or a `fred-anchor` candidate `observedAt`.

The new `check:brent-promotion-audit-fields` command validates that `brentPricingLayer.promotionAudit` exists and keeps the expected keys. It emits soft warnings for null `promotionReason` or `anchorAgeHours` because the current committed data can remain stale until the next pipeline refresh.

## Validation Boundary

Required M-39 validation:

- `npm run check:brent-promotion-audit-fields`
- `npm run check:data`
- `npm run check:all`
- `git diff --name-only -- data .github/workflows` must remain empty.

M-39 is backend reading logic plus contract documentation only. Frontend asset cache version is bumped mechanically because `scripts/app.js` module query strings are synchronized by the frontend asset helper.
