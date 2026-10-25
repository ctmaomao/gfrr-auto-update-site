# Matrix Repo-Spread Qualification · H implementation · 2026-10-25

> Independent H contract package. Owner authorized this remediation sequence's issue, ADR, implementation and cross-AI review. Implementation: DeepSeek; pre-merge review: owner-selected Codex+DeepSeek cross-AI review (not human review); no merge/deploy authorization is implied. Matrix-only; does not touch the main score/decision/scoring.

## 1. Baseline and current facts

- Base/branch worktree: `c2-c3-null-display`, HEAD `0ec3dc5dcb4703ecaf7f4278bba4093107d26fa5` (G merged); existing G ignored receipts retained.
- Frozen before: `manual-artifacts/matrix-repo-review/before-baseline.json` / `before-matrix.json`; snapshot `2026-10-25T00:26:37.771Z`; 17 JSON hashes are listed there.
- Actual sample: **main 68**, n6 **35**, matrix consistency **71** (5 strong / 0 partial / 2 contradiction), repo `-2bp / 正常 / same_day`.
- Consumer counts before: risk support/contradict/missing **2/0/0** (no repo row); overheat **6/0/0** (repo limited normal); liquidity **3/1/0** (repo normal contradiction).
- **Known aggregate limitation (probe):** current valid snapshot stays matrix **71**, main **68**; removing the liquidity repo contradiction synthetically can leave three supports and make liquidity `strong_confirmation`, raising matrix consistency to **86**. Other evidence is unchanged. This is a synthetic-only aggregate behavior, not risk/accuracy improvement, and H does not change aggregation/count/threshold or hide a fix here. Follow-up independent research may examine missing-evidence confirmation strength/coverage disclosure; it is not H.
- Evidence registered: `docs/review-evidence/matrix-repo-20261025/` with before/after **4 actual JPEGs** + README (captured 2026-10-25; target `#homepage-cross-validation` top 0.34375≈0; 390 scroll 375; both widths no horizontal overflow; main 68/n6 35/nav13/matrix 71). Normal valid before/after images are pixel-identical; matrix `detail` is not rendered, so they do not prove detail text. Screenshots verify matrix/cross-market section layout, consistency 71/5-0-2 and no horizontal overflow; Hero main 68/nav13/n6 35 are verified by before/after facts/data and DOM, not in these screenshots. Matrix JSON comparison is the text evidence.

## 2. Contract change

- Only three matrix consumers: `risk_asset_mismatch` (`repo_vix_mismatch`), `overheat_confirmation` (`repo_zero_stress`), `liquidity_tightening` (`repo_stress`).
- Reuse D `classifyRepoEvidence` (raw finite incl. true 0 + BGCR same_day + known regime; TGCR independent); local matrix consistency validates raw unrounded `abs(spread)*100` against producer `<5/正常`, `[5,10)/轻微偏离`, `[10,25)/压力`, `>=25/危机水平`.
- No `repo.spreadBp` (rounded) for any gate. `finite()` remains unchanged for other matrix fields.
- Pending/invalid/foreign-day/unknown/raw-regime conflict -> own `missingEvidence` only; no support/contradict. TGCR mismatch never gates BGCR.
- Original thresholds preserved: risk 15/5/<3 (VIX 16/20/25 boundaries), overheat <3/≥10, liquidity 25/10/5.
- Wording limited to the spread/regime; no whole-market claim. Overheat low says “为过热观察提供有限支持”; high says “是过热叙事的反向证据”; comments say limited spread evidence, not zero stress/abundant liquidity.

## 3. Checker contract (exactly four, independently scoped)

`scripts/check-fed-liquidity-repo-spread.mjs` — exactly three markers:

1. strict `bgcrSofrSpread` read replaces coercive `finite`;
2. crisis sentence replaces `回购市场压力显著确认流动性收紧`;
3. normal sentence replaces `回购市场正常运行，不支持流动性收紧叙事`.

`scripts/check-null-zero-display-guards.mjs` — one authorized fourth assertion (`H-checker-addendum.md`, issue #483 comment 6391801684): replace the old “no `repo_zero_stress` at all” assertion with three exact pending-pair checks:

- risk_asset_mismatch/repo_vix_mismatch;
- overheat_confirmation/repo_zero_stress;
- liquidity_tightening/repo_stress;

each exactly one row, `bucket=missingEvidence`, `value=null`; none in support/contradict. Keep the no-`+0.0bp` checks, `repo_stress` missing/null check, finite guards and all other assertions. No other checker changes, no skip/fake/dead code.

## 4. Tests

- Updated `tests/unit/repo-spread-null-semantics.test.mjs`: legal fixtures now same-day/matching regime; all four old tests preserve missing/true-0/unit/threshold intent; real 0 remains normal.
- New `tests/unit/repo-matrix-qualification.test.mjs`, appended to `check:pipeline-pure-helpers` so it runs through `check:all`; loads matrix through actual source query.
- Coverage: missing/malformed/date/unknown/conflict, true 0, `0.02999→2.999bp`, `4.999`, `5`, `9.999`, `10`, `14.999`, `15`, `24.999`, `25`, VIX 16/20/25, ± symmetry, TGCR mismatch; exactly one missing row/no support for pending.
- Focused result: matrix new **6/6**, old **4/4**, check-fed/null-zero/risk/overheat PASS. Full `check:changed`/coverage/independent review/CI pending Codex; no full claim.
- One `matrix-repo-qualification-1` bump; E/F/G historical version strings preserved; current cache table new.

## 5. Boundary and deferred

- No D helper/producer/pipeline/score/decision/data/workflow/frozen realtime/dependency/F/G display/other matrix consumer changes.
- Matrix consistency may change for unqualified evidence; report separately from main score; synthetic pending is not real occurrence or accuracy proof.
- G N1 static Fed note (“委员预期”/1999 analogy) is a real residual semantic defect left to a future I copy task; not touched here.

## 6. Evidence paths

- `scripts/modules/buildCrossValidationMatrix.js`
- `scripts/check-fed-liquidity-repo-spread.mjs`
- `scripts/check-null-zero-display-guards.mjs`
- `tests/unit/repo-spread-null-semantics.test.mjs`
- `tests/unit/repo-matrix-qualification.test.mjs`
- `package.json`
- `docs/ADR/0077-matrix-repo-evidence-qualification.md`, `docs/ADR/README.md`
- This report, `docs/INDEX.md`, `docs/PROJECT_BACKLOG.md`, one mechanical bump.
