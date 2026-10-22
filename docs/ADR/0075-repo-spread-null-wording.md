# ADR-0075: Repo spread null wording contract

Status: Owner-authorized implementation (B design r2); pre-merge review: owner-selected Codex+DeepSeek cross-AI review on 2026-10-22, human review not performed; not Accepted. This ADR corrects one display wording and its checker marker; it does not authorize merge, deployment, production model replacement, provider addition or source-rights expansion.

## Context

`macroDrivers.fedLiquidity.bgcrSofrSpread === null` means the derived BGCR-SOFR spread is currently unavailable for the delivered data product. It does not establish that the BGCR/TGCR indicators are unconnected: the ingestion path and `sourceStatus.{bgcr,tgcr}` exist, so a null can come from an unavailable or insufficient print, or from a failed derivation. `scripts/modules/buildCrossValidationMatrix.js` nevertheless rendered the null bucket as `BGCR/TGCR 回购利差指标未接入`, and `scripts/check-fed-liquidity-repo-spread.mjs` hard-locked that sentence in its `matrixMarkers` list.

The null branch itself is correct and stays: it belongs to `missingEvidence`, keeps `value: null`, and must not fabricate a zero spread.

## Decision

Change only the null-branch detail text in `buildCrossValidationMatrix.js` from `BGCR/TGCR 回购利差指标未接入` to `BGCR/TGCR 回购利差证据不足，待核验`, and replace the single corresponding marker in `check-fed-liquidity-repo-spread.mjs`.

Preserved unchanged:

- `missingEvidence` bucket membership and `value: null` shape;
- no `repo_zero_stress` row and no `+0.0bp` for missing data; a real `0` value still classifies as normal;
- the 5/10/25bp tier thresholds, positive/negative symmetry and every other assertion in the checker (10 `runDailyMarkers`, the other 4 `matrixMarkers`, `contractMarkers`, data field guards);
- `check-null-zero-display-guards.mjs`, whose `repo_stress` / `missingEvidence` / null assertion continues to hold.

No date or eligibility rule is introduced: whether a stale-but-non-null spread should be suppressed remains in the date-consumption layer. This ADR does not extend the wording contract to other sources and does not change `buildMacroDrivers` or any renderer.

## Consequences and boundaries

Wording-only change inside the matrix `missingEvidence` path. It does not change scoring, decision, execution, position, `data/`, workflows, realtime output or dependencies, and adds no fetch or production write. The implementing PR's asset bump is mechanical, version-only, because the touched module is frontend. Null remains null: this fix does not establish source freshness, accuracy or completeness, and does not verify BGCR/TGCR upstream.

ADR-0074 (NFCI direction) is untouched by this ADR; ADRs are append-only records. The NFCI "方向反转" user-facing copy and the `nfciToneFromRegime` label coverage are independent display repairs registered as later follow-ups, not part of B.
