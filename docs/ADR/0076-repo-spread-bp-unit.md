# ADR-0076: Repo spread basis-point display unit correction

Status: Owner-authorized implementation (D0 unit-contract design); pre-merge review: owner-selected Codex+DeepSeek cross-AI review on 2026-10-23, human review not performed; not Accepted. This ADR corrects one display unit and its null-zero checker assertion inside this already-authorized remediation sequence; it does not authorize merge, deployment, model replacement, provider addition or source-rights expansion.

## Context

`macroDrivers.fedLiquidity.bgcrSofrSpread` is stored as a percentage-point difference: `-0.02` means `-2bp`. `renderMacroDriversPillars` formatted it with `signedFixedWithZero(asNumber(fed.bgcrSofrSpread), 0)`, which rounds `-0.02` to `-0bp`. `scripts/check-null-zero-display-guards.mjs` locked that buggy expression in `requiredSnippets`, so the unit fix and the checker assertion must change together as an independent contract PR (AGENTS §10).

The missing-versus-real-zero **contract requirement** is kept: a `null`/`undefined`/empty/`NaN` (or otherwise non-number) spread must render as `—`, never as `+0bp` or `-0bp`, while a real `0` is valid and stays `+0bp`. The old expression did **not** reliably satisfy this under `asNumber` coercion (`null`/empty become `0`); this patch fixes the field entry rather than changing the global helper, and does not claim the old implementation was free of the null-value bug.

## Decision

1. In `renderMacroDriversPillars`, replace the single formatting line with two lines:
   - `const repoSpread = Number.isFinite(fed.bgcrSofrSpread) ? fed.bgcrSofrSpread : undefined;`
   - `const repoBp = signedFixedWithZero(Number.isFinite(repoSpread) ? repoSpread * 100 : undefined, 0);`
   Strict numeric eligibility is deliberate: `DATA_CONTRACT` defines the field as `number | null`, so `Number.isFinite` accepts only real numbers and rejects `false`, arrays, objects and numeric strings, matching the later `classifyRepoEvidence` finite rule. The `undefined` sentinel is required because the shared `asNumber` coerces `null`/`''` to `0`, and `signedFixedWithZero(null)` would then render `+0bp`; passing `undefined` yields the missing `—bp`. Real `0` is a valid number and still renders `+0bp`. The global `asNumber` helper is not changed and no other indicator/branch is touched.
2. In `check-null-zero-display-guards.mjs`, replace the single old `requiredSnippets` entry with the null-safe bp-conversion snippet `signedFixedWithZero(Number.isFinite(repoSpread) ? repoSpread * 100 : undefined, 0)`, and add the old unconverted expression `signedFixedWithZero(asNumber(fed.bgcrSofrSpread), 0)` to `forbiddenSnippets` so the regression cannot return. Every other required/forbidden/dynamic assertion is preserved; no skip, ignore or ignore list is added.
3. Add a real-render regression test (`tests/unit/repo-spread-bp-display.test.mjs`) that VM-extracts the real render function and its real numeric helpers and asserts `-0.02→-2bp`, `0.02→+2bp`, `0→+0bp`, and missing cases `→—bp` without any 0bp.
4. One mechanical frontend asset bump (`repo-bp-unit-1`).

## Consequences and boundaries

Display-only unit correction. Stored values, `data/`, scoring, decision, execution, position, workflows, dependencies and source rights are unchanged; no new fetch or production write. `-0.02` now displays `-2bp` and the null guard remains intact.

This ADR introduces no date gate, source-selection rule, scoring change, four-lane change, NFCI change or other consumer refactor. The later D display package may reuse these two lines as the qualified spread value and gate only the final text with its own evidence classification; D must not change this checker again. This ADR does not by itself authorize merge or deployment.
