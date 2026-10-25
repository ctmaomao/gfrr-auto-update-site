# 政策价差展示语义修复 · I · 2026-10-25

> Display-only follow-up from G N1. Owner authorized this remediation sequence's implementation/AI review. Implementation DeepSeek; pre-merge review Codex+DeepSeek cross-AI (not human). Based on H merged `f71a3e12d4e1a12a39abd567a5f9b4dd51d61825`; no score/decision/data/pipeline/checker assertion change.

## 1. Scope and semantic correction

- `futureMinusTargetMid` is the near-month fed funds futures implied rate minus the current target-range midpoint. Pipeline read-only confirms:
  - `scripts/run-daily-pipeline.mjs:6060-6064`: targetMid = (targetLower + targetUpper) / 2;
  - `scripts/run-daily-pipeline.mjs:6094-6098`: futureMinusTargetMid = implied − targetMid.
- Removed the unsupported “委员预期/分歧” and “1999-2000 / 2022 顶部前同构” claims. The card now describes policy pricing vs target-range midpoint only. No historical-top claim.

## 2. Changes

- C2 Fed Path card (`index.html:369`): title `美联储政策定价差(Fed Path)`; static aux `市场定价与目标中值差 · 待核验`; target label `目标区间中值`; note exactly `以近月联邦基金期货隐含利率与当前目标区间中值比较，结合合约期限、月内政策时点与数据日期观察。`; meta `现行观察阈值 |价差|≥50bp 红`; this card's stale static values are neutral `—`/pending (unit `bp` remains). Dynamic aux remains G `市场定价与目标中值差 · +0.7bp`.
- WoW item 4 (`index.html:100`, `renderMacroOverview.js:456-457`): existing `wow-tag is-flat` `政策价差观察`; source `美联储(Fed)政策定价差`; valid text `美联储(Fed)政策定价差 +0.7bp（近月期货隐含利率与目标区间中值差）。`; missing/invalid `... 待核验（...）。`; always rewritten.
- Pillar-2 (`renderMacroOverview.js:652-655`): strict `Number.isFinite` raw; preserves the required `policySpread !== null ? policySpread * 100 : null` real intermediate; valid `近月联邦基金期货隐含利率与目标区间中值差 +0.7bp,政策基调: ...`; missing/invalid `... 待核验,政策基调: ...`; no null → `signedFixedWithZero`/`asNumber` zero fabrication.
- Existing `fedPathTone` rule unchanged (`>=50 red`, `>20 yellow`, else green); only meta text corrected from `>50` to `>=50`. No new id/CSS/IA/source/algorithm/checker assertion.

## 3. Baseline and boundaries

- Absolute worktree `.../release-worktrees/c2-c3-null-display`, HEAD `f71a3e12`, branch `codex/policy-spread-display-20261025`, clean before changes; root 75/other worktrees untouched.
- Snapshot `2026-10-25T00:26:37.771Z`, 17 JSON hashes in `manual-artifacts/policy-spread-review/before-baseline.json`; main 68, n6 35, nav 13, matrix 71; policy `+0.7bp`.
- Evidence registered at `docs/review-evidence/policy-spread-20261025/` in **r2**: 4 actual JPEGs + two facts JSON, recaptured 2026-10-25 UTC (before desktop/mobile `07:30:14.683Z`/`07:30:29.554Z`; after `07:30:30.651Z`/`07:30:45.452Z`). Before is a git-archive f71 baseline replay (local 8775, same 17 JSON); after is current I (local 8774). Target `#card-c2-fed-path`; desktop/mobile top `0.125`/`0.375`; scrollWidth `1425`/`375`; no overflow. Main68/n635/nav13/matrix71, policy +0.7bp. Images prove policy card/layout only; WoW4/pillar2 and Hero main/nav/n6 are verified by facts/DOM. The prior 14:46 set is not r2 evidence; its six image/facts files are retained only in ignored `manual-artifacts/policy-spread-review/evidence-r1/`.
- No data/pipeline/score/decision/matrix H/D helper/NFCI/other WoW/HY/cards/global helper changes. Mechanical frontend cache bump only.

## 4. Verification

- New `tests/unit/policy-spread-display.test.mjs`: real renderer through actual source query, DOM stub only, `console.error` throws, document restored; C2/WoW/pillar valid ±/0/missing/undefined/empty/bool/array/object/numeric string/NaN/repeated clear; precision +0.7/-0.7, true zero; input/main 68/n1–n7/matrix unchanged.
- Focused tests: I 5/5, old G/F/D0/H intent preserved; node --check, null-zero, dom, zh-copy, asset version, doc-links, diff; BOM clean. One `policy-spread-display-1` bump; E/F/G/H/D historical version strings preserved.
- Full `check:changed` exit 0; coverage 1202 tests/1201 pass/0 fail/1 existing skip, funcs 97.96/lines 99.85/branches 94.10, run on the same 21 code paths before these evidence-only r2 changes. CI/two-site deployment still pending. The r1 independent review’s B1 screenshot timing/framing finding is fixed by the r2 recapture; r2 evidence review is still pending. N2 real-zero plus sign and N3 static no-subject style are unchanged non-blocking items.

## 5. Files

- `index.html`, `scripts/modules/renderMacroOverview.js`
- `tests/unit/policy-spread-display.test.mjs`, `package.json`
- `docs/POLICY_SPREAD_DISPLAY_2026_10_25.md`, `docs/INDEX.md`, `docs/PROJECT_BACKLOG.md`, one bump mechanical paths.
- C2/WoW/pillar only; no checker/ADR changes.
