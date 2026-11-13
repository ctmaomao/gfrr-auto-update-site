# World Order market qualification v2

Status: prepared-only Stage 1, not activated (2026-11-13).

Evidence and impact
- dxyStrong=105 introduced d01fa439; no source-family or historical calibration supplied. Current DTWEXBGS broad index differs from ICE DXY. Existing main-model percentile table is a separate model, not authority for a World Order threshold.
- Daily displayInputsBaseline has computed values and generation asOf; dailyRealtimeInput retains aggregate acquisition time only. mainScoreSourcePolicy is a fallback audit, not observation freshness certification. Worker/local selection also checks aggregate timestamps, not all observations.
- Fixed local production snapshot (2026-11-12): current-code replay produces market36, total54; omitting dollar market24,total51; all market unavailable market0,total43. All classify bloc_fragmentation. This is a counterfactual, not refreshed production or calibrated improvement. Current-code replay confidence0.2 differs from stored0.55; do not claim confidence parity or rewrite snapshot.
- Current code's market unavailable maps0/not_confirmed, weighted at30%; clampScore(null) also0. Simply suppressing input can lower risk and is not a missing-data-safe fix.

Proposed v2 contract
1. Keep raw input/reference and historical output immutable. Add per-leaf source/instrument/observedAt/valueOrigin. Only explicit actual observation metadata certifies freshness, never capturedAt or wrapper updatedAt. Fallback/default is not a quote. Do not activate until per-source cadence/publication-lag policies are reviewed.
2. Evaluate each existing criterion into qualified_true, qualified_false, or unknown with reason. Positive joint contribution needs both inputs qualified; a certified false leg may establish zero without qualifying the other leg. Dollar/gold remains unknown until source-specific rule calibration established; no invented threshold. Display '美元判据未校准', not weak dollar.
3. Compute available evidence lower bound and unknown maximum contribution upper bound under existing formula. Six criteria maximum contributions18+16+18+12+18+6=88. This is a model-completion bound, NOT a probability/confidence interval or a guarantee about future price; ranges can be loose due shared gold dependency. Do not renormalize weights, fill unknown with zero, or use midpoint.
4. Market score null when incomplete, with scoreRange and status incomplete. Overall score null/status incomplete when required contribution unknown, with weighted bounds for audit. No ordinary regime class or neutral decisionModifier under incomplete data. Only display a conditional range, missing reasons and no-risk-resolution wording. Unknown confidence must not be inferred from count of finite values.
5. Preserve previous dated score only as explicitly lastKnown; current missing snapshot must supersede history instead of mergeWorldOrderStress inheriting previous status. v1 history remains labeled v1, not recomputed.

Migration surface / release blockers
- Producer: build-market-confirmation, build-world-order-stress, score-world-order-stress, normalization/clamp, model version and config.
- Validators: check-world-order-stress finite score/state whitelist, validate-data history schema, model/check fixtures; add v2 branch rather than weakening v1 assertions.
- Consumers: renderMacroOverview (detail cards, tone, marker/summary), renderMacroTrend, macroOverviewNarrative, buildCrossValidationMatrix, renderOilDirectional and renderOfrPrimary references, review-world-order-stress, verify-acled-refresh; audit editorial/external-AI input serializers and source-layers for zero coercion.
- Legacy Daily history coerces explicit null score/confidence to zero; undefined or other invalid snapshots may be rejected and same-day mergeWorldOrderStress then keeps the previous snapshot. Must explicitly persist incomplete marker with dated lastKnown, not silent carry-forward.
- Tests: all known unchanged, each unknown criterion bounds, all missing0..88 not green, shared-input combination, fresh wrapper+old leaf, date missing/invalid/future, partial failure, v1 history compatibility, valid→incomplete UI clearing, no stale green/neutral marker, default and unknown-dollar isolation.
- Desktop/mobile visual acceptance and exact-head browser CI required before activation. Present session's local preview capability is blocked; remote CI alone is not claimed as completed visual acceptance.

Decision
Do not deploy naive zero suppression. A safe implementation is cross-cutting versioned data-product migration, not another timestamp-only patch. Stage schema+consumer support first with v1 behavior unchanged, then activate v2 only after independent review and observation metadata qualification. Stage 1 adds only the pure `scripts/world-order/market-completion-range.mjs` contract and offline unit tests. No production importer, writer, frontend, source, budget, workflow or current scoring rule is changed. The helper accepts already-qualified criterion contributions; it does not certify evidenceRef, validate source freshness or perform threshold calibration. Those remain mandatory future integration steps.

Independent design review addendum
- Approved direction, not implementation/release approval; no immediately safe narrow patch identified.
- Each criterion carries exact contribution for known observations (including tiered18/11 etc.), otherwise allowed contribution interval. Three-state boolean alone cannot encode tiers.
- 0..88 is conditional on fixed v1 rule weights/structure; a newly calibrated dollar model requires new bound validation. Overall bound covers only market-input uncertainty with other components fixed, not all data/model uncertainty.
- Use logical short-circuit for joint criteria when possible: known gold below threshold makes dollar/gold false even if dollar unknown. Any deliberately conservative interval must be named outer bound, not tight interval. Test this case.
- Confidence replay discrepancy traced: published gdelt/ofac/sipri/acled entries omit confidence; serialized replay defaults them0. Total54 reproduces but confidence cannot. No claim that production confidence should be0.2.


## Release stages and acceptance

- Stage 1 (this patch): prepared-only completion contract, fixed v1 contribution bounds, malformed-input rejection and 324 combination fixtures. These are algebraic contribution fixtures, not 324 historically valid market states. Helper outputs remain productionEligible=false even when complete.
- Stage 2: review and implement per-observation provenance and all v2 consumer/history/validator branches while retaining current v1 production behavior; no provider calls needed for offline testing.
- Stage 3: separate exact-tree activation review with before/after evidence, incomplete-state desktop/mobile acceptance, all consumers migrated, and source qualification policy established. No unconditional current-score publication from prepared output.

The range helper intentionally does not expose an overall score function or regime classifier: other components, weights and unknown-source behavior are not yet migrated. A complete contribution set is not proof that any observation was actually fresh. No statistical accuracy claim or newly calibrated dollar threshold is made.

## Stage 2a history preparation (inactive)

The history normalizer and merge helper are extracted with legacy behavior preserved, including its historical null coercion (not endorsed for v2). Explicit v2 inputs are rejected by default before legacy coercion. Offline opt-in supports strictly typed incomplete snapshots and dated lastKnown; it never interprets a conditional bound as a point estimate. The production Daily caller does not enable v2. Unknown versions fail rather than fall into v1. UI consumers, production validators and producer remain v1, so activation is still blocked.

## Stage 2b presentation preparation (inactive)

`uncertainty-presentation.mjs` is an unimported pure adapter for explicit offline opt-in. It reuses the Stage 2a validator, accepts source/history incomplete snapshots, emits no point score/tone/recommendation, names the conditional outer bound and distinguishes dated lastKnown from current data. Invalid inputs throw; future integration must render an unavailable state, never retain the previous view. Legacy unversioned inputs return null for the unchanged V1 path. This is not completed frontend support or activation.

Consumer audit / still-required work:
- `renderMacroTrend.mergeCurrentTrendSnapshot`: when current overlay score is null it can retain the previous history overlay. V2 must replace that record, break the current point/line, and never imply unchanged risk. Test valid → incomplete → invalid → V1 across current and history inputs.
- `renderMacroOverview`: C8, detail state, market confirmation, dimension tones, risk-bias, warnings and summary must all switch together; a conditional range must not occupy a point-score field. Clear old tone and recommendation, show missing reasons and dated lastKnown separately.
- `macroOverviewNarrative`, `buildCrossValidationMatrix`, `independentWarningView`/OFR and oil references: explicit incomplete branch with version validation, no null-to-zero, ordinary regime, neutral modifier, or old state retained. Source evidence may still be shown with its own timestamps and qualifications.
- The adapter deliberately has no runtime importer. No asset-version bump or CSS change accompanies this prepared-only addition. Before wiring it, migrate all consumers, test transitions with real DOM, perform desktop/mobile visual acceptance, bump loaded assets, and independently review the exact runtime tree. Provider eligibility, production validators and activation remain separate blockers.

## Stage 2c provenance audit

The existing V1 input selector now preserves matched per-leaf sourceDetails as optional `observationProvenance`, retaining a reported timestamp and fallback marker only for exact selected-value matches. Metadata remains explicitly unqualified, not a freshness gate. Daily unavailable metadata is unknown, not borrowed from an acquisition timestamp. The production checker validates this optional audit field; no scoring policy or V2 activation changes. Verified observation semantics, DTWEXBGS publication cadence/holidays, instrument matching and source-specific qualification remain unresolved activation gates.
