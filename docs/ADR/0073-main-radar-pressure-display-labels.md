# ADR-0073: Main radar contemporaneous-pressure display labels

Status: Owner-authorized on 2026-10-17 following [discussion #471](https://github.com/ctmaomao/gfrr-auto-update-site/issues/471). The ADR design was independently reviewed before implementation. This dedicated atomic label-contract PR is separate from score-attribution presentation; its complete implementation must receive independent review before integration and publication. It is not approval to replace the production scoring model.

## Context

The main radar names its >=60 band “系统性顶部”, although its production score is a heuristic measure of contemporaneous pressure, not a validated market-top forecast or calibrated crisis probability. The 2026-10-17 production score of71 comprises base57, tail-floor11 and transport3; the same oil input participates in several modules. Existing score transparency does not validate the name. The audit and owner's acceptance baseline are recorded in [the remediation plan](../SCORE_REMEDIATION_2026_10_17.md).

## Decision

For the main radar only, rename the highest display band to “高压力区”. Keep the score boundaries 25/40/60, numerical score, module colors, observation-reaction tones, internal systemic_top key and current World Order display-upgrade behavior unchanged. World Order remains an independent score and is not added to the main score.

The main-radar Hero heading, narrative band label, threshold highest-zone text and observation-reaction phrases must use the same exact band-to-label mapping after migration. A World Order display upgrade can still make the effective Hero band differ from the raw main-score marker; mapping consistency does not require equal bands. The threshold heading becomes “同期压力标尺”; the main marker becomes “综合分”. These describe the existing score and do not recalibrate it.

Bubble Watch's independent tiers, historical score records, scoring/decision/execution/position logic, backend enum keys and previously published AI prose are outside this migration. No blanket text replacement is permitted. No new provider, fetch, production JSON write or paid invocation is authorized.

## Dedicated atomic migration and review

After independent review of the ADR design, the dedicated migration PR atomically replaces the exact highest-band allowed label in check-macro-overview-narrative.mjs and exact source/behavior expectations in check-observation-reaction-layer.mjs, together with the minimum corresponding consumer labels and HTML text. Preserve all existing constraints and add boundary coverage, including lower tiers, thresholds, tones, missing-data behavior and World Order behavior; no accepting both labels, deleting assertions, skip or ignore additions. AGENTS §10 does not require a separate documentation-only PR to merge first. No checker change may be hidden in an unrelated presentation patch.

Add boundary regressions at 59/60/100 and missing scores, observe stress/benign reactions and verify no mutation of inputs. Check label mapping between Hero, threshold and observation phrases. Use the mandatory asset bump and complete checks, 1440px/390px visual evidence and independent review. This dedicated contract migration must not contain unrelated scoring changes or presentation work.

The new missing-score regression exposed an existing observation-layer conversion of null/empty scores to zero. At the changed display-band function, require a finite numeric producer score; missing/malformed scores remain unknown/background while a genuine zero remains an observation score. Add explicit null and zero relation cases without changing any existing case. This is a display guard correction, not a production scoring or execution change.

DESIGN.md §5.5 and DATA_CONTRACT.md are amended with the same exact label in this migration. The patch becomes effective only after independent review and integration. Atomic changes avoid a period in which incompatible runtime and checker changes are merged separately, without adding a permanent revision switch.

## Consequences and remaining evidence

A label correction does not remove the current tail floor, shared-input exposure, ON RRP assumptions or fixed scales. Continue ADR-0044/0047/0053 and the [final review standard](../PRESSURE_MODEL_FINAL_REVIEW_STANDARD.md); keep the frozen seven candidates and existing cohort. Production model replacement requires the original prospective gates and separate independent model acceptance and migration authorization. Do not treat lower candidate scores as accuracy, rename historical scores, promise crisis timing or declare portfolio validation.

This decision changes display semantics, not the paper/ink tokens, three font stacks, layout, navigation, score thresholds or model. The dedicated migration PR declares “本 PR 申请变更 DESIGN.md 的 §5.5 节”.
