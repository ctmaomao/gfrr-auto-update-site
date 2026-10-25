# ADR-0077: Matrix repo-spread evidence qualification

Status: Owner-authorized implementation (H contract); pre-merge review by owner-selected Codex+DeepSeek cross-AI review, human review not performed; implementation in progress; not Accepted. This ADR is the independent H contract package for issue #483. It does not authorize merge, deployment, model replacement, source addition or production-data writes.

## Context

The three cross-validation consumers currently validate only `finite(bgcrSofrSpread)`:

- `risk_asset_mismatch` / `repo_vix_mismatch`;
- `overheat_confirmation` / `repo_zero_stress`;
- `liquidity_tightening` / `repo_stress`.

They can classify a stale or foreign-day BGCR/SOFR spread, an unknown producer regime, or a numeric-string/bool coercion as normal/stress. They also phrase a single spread as the whole repo market (“回购市场正常运行/零压力/流动性充裕/压力显著确认”).

D already introduced `classifyRepoEvidence` in `scripts/modules/macroOverviewNarrative.js`: raw `Number.isFinite` (true 0 valid), `repoSpreadDateStatus.bgcrSofr === 'same_day'`, known `repoSpreadRegime` in `正常/轻微偏离/压力/危机水平`; TGCR is independent. The helper's `spreadBp` is rounded for display and must not drive matrix classification.

## Decision

### 1. Matrix qualification

Import `classifyRepoEvidence` into `buildCrossValidationMatrix.js` with the actual page module cache query; the one mechanical bump unifies the queries. The import is one-way matrix→narrative; narrative has no imports and does not import matrix (no cycle). Do not modify the shared helper, producer, pipeline or D display code.

Add a local matrix-only consistency gate:

```js
repo = classifyRepoEvidence(fedLiquidity)
rawBp = Number.isFinite(fedLiquidity.bgcrSofrSpread)
  ? fedLiquidity.bgcrSofrSpread * 100
  : null
expectedRegime = abs(rawBp) < 5  ? '正常'
  : abs(rawBp) < 10 ? '轻微偏离'
  : abs(rawBp) < 25 ? '压力'
  : '危机水平'
qualified = repo.status !== 'pending'
  && rawBp !== null
  && repo.regime === expectedRegime
```

The 5/10/25 consistency bands are the existing producer mapping, not new scoring thresholds. Never use `repo.spreadBp` for a gate or threshold. `4.999bp` remains normal; `5.0` mild; `9.999` mild; `10.0` pressure; `24.999` pressure; `25.0` crisis. Negative spreads are symmetric. `finite()` remains unchanged for other matrix fields.

If `qualified === false` (missing/invalid spread, wrong date, unknown regime, raw-regime conflict), the consumer's key goes to its own `missingEvidence`; no support/contradict row is produced. TGCR mismatch never gates BGCR. Qualified records keep the original raw-bp thresholds:

| Consumer | Key | Original thresholds |
|---|---|---|
| risk_asset_mismatch | repo_vix_mismatch | abs>=15 & VIX<16 support; abs>=5 & VIX<20 support; abs<3 & VIX>25 contradict |
| overheat_confirmation | repo_zero_stress | abs<3 support; abs>=10 contradict; 3–10 no-op |
| liquidity_tightening | repo_stress | abs>=25 crisis support; abs>=10 pressure support; abs>=5 mild support; else normal contradiction |

### 2. Wording

Only describe the spread and its existing regime; do not infer a whole repo market from one spread. Exact forms:

- risk strong: `该回购利差处于既有「<regime>」档（BGCR-SOFR <bp>）但波动率市场极度平静 (VIX <vix>)，该利差与波动率读数明显背离`
- risk medium: `该回购利差处于既有「<regime>」档（BGCR-SOFR <bp>）但波动率市场平静 (VIX <vix>)，该利差与波动率读数出现背离`
- risk normal: `该回购利差处于既有正常档（BGCR-SOFR <bp>）且波动率市场已警觉 (VIX <vix>)，方向一致非错配`
- overheat low: `该回购利差处于既有正常档（BGCR-SOFR <bp>），为过热观察提供有限支持`
- overheat high: `该回购利差处于既有「<regime>」档（BGCR-SOFR <bp>），是过热叙事的反向证据`
- liquidity normal: `该回购利差处于既有正常档，不支持由该利差推断流动性收紧（BGCR-SOFR <bp>）`
- liquidity crisis: `该回购利差处于既有「危机水平」档，支持流动性收紧观察（BGCR-SOFR <bp>）`
- liquidity mild/pressure: `该回购利差处于既有「<regime>」档（BGCR-SOFR <bp>），仅描述该利差，支持流动性收紧观察`

The overheat comments describe limited spread evidence, not whole-market zero stress/abundant liquidity.

### 3. Checker contract changes (exactly four)

`scripts/check-fed-liquidity-repo-spread.mjs`, `matrixMarkers`: replace only these three, preserve every other marker/assertion:

| Existing | Replacement |
|---|---|
| `const bgcrSofrSpread = finite(fed.bgcrSofrSpread);` | `const bgcrSofrSpread = Number.isFinite(fed.bgcrSofrSpread) ? fed.bgcrSofrSpread : null;` |
| `回购市场压力显著确认流动性收紧` | `该回购利差处于既有「危机水平」档，支持流动性收紧观察` |
| `回购市场正常运行，不支持流动性收紧叙事` | `该回购利差处于既有正常档，不支持由该利差推断流动性收紧` |

`scripts/check-null-zero-display-guards.mjs`, in `assertRepoMissingStaysMissing`: replace only the old `!rows.some((row) => row.source === 'repo_zero_stress')` assertion with exact dynamic checks:

- three pairs: `risk_asset_mismatch/repo_vix_mismatch`, `overheat_confirmation/repo_zero_stress`, `liquidity_tightening/repo_stress`;
- each pair has exactly one row, `bucket === 'missingEvidence'`, `value === null`;
- those three keys appear in no `supportingEvidence`/`contradictingEvidence`;
- keep the no-`+0.0bp` assertions, `repo_stress` missing/null assertion, finite guards and every other checker assertion.

This fourth assertion is explicitly reviewed in `H-checker-addendum.md` and issue #483 comment 6391801684. No other checker assertion changes; no skip/fake/dead code.

### 4. Tests

- Update `tests/unit/repo-spread-null-semantics.test.mjs`: legal fixtures gain `same_day` and matching regime; keep all old missing/true-0/unit/threshold intent; update only text/marker expectations. A real zero remains normal, not missing.
- Add `tests/unit/repo-matrix-qualification.test.mjs`, appended to `check:pipeline-pure-helpers` so it runs in `check:all`. Load matrix/helper with the actual source query, not bare imports, to avoid duplicate config/coverage instances.
- Cases: current Oct25 sample, missing/undefined/empty/bool/array/object/numeric-string/NaN, wrong date, unknown regime, raw-regime conflicts, true 0, `0.02999→2.999bp`, `4.999`, `5`, `9.999`, `10`, `14.999`, `15`, `24.999`, `25`, VIX 16/20/25, ± symmetry, TGCR mismatch.
- Dynamic tests assert exactly one missing row per pending consumer, no support/contradict, no `+0.0bp` fabrication, and original thresholds/other evidence preserved.

### 5. Baseline and acceptance

Before baseline (frozen central): `0ec3dc5dcb4703ecaf7f4278bba4093107d26fa5`, snapshot `2026-10-25T00:26:37.771Z`, 17 JSON hashes. Sample facts: main 68, n6 35, matrix consistency 71 (5 strong/0 partial/2 contradiction); repo -2bp/正常/same_day; risk support/contradict/missing = 2/0/0 with no repo row; overheat = 6/0/0 with limited normal repo; liquidity = 3/1/0. These are current snapshot facts, not accuracy or historical proof.

Acceptance:
- Main score and matrix consistency reported separately; synthetic pending is not real occurrence/accuracy improvement.
- focused tests/syntax/checkers/diff first; then full `check:changed` (including check:all), measured coverage, independent review, CI and two-site acceptance. No Daily/network/production-data write.
- One bump `matrix-repo-qualification-1`; preserve E/F/G historical version strings.

## Consequences

Unqualified repo evidence can move to missing and change matrix consistency; main score/decision/scoring is untouched. **Known aggregate limitation:** Codex independent probe shows that synthetic removal of the liquidity repo contradiction can leave three supports and make `liquidity_tightening` strong, moving matrix consistency from 71 to 86. This 71→86 is synthetic-only, not risk/accuracy improvement, and H deliberately does not change the existing count/assessment/aggregate algorithm or thresholds. A later independent research task may evaluate confirmation-strength/coverage disclosure when evidence is missing; it must not be hidden inside H.

## Deferred I item

G N1 static Fed note wording (“委员预期”/1999 analogy) is a real residual semantic defect at absolute G source `index.html:369` and `renderMacroOverview.js:655`. It is deferred to a future I narrow copy task; this ADR does not touch it. N2 measurement evidence exists in the actual tool receipt; N3 preexisting static; N4 strict finite is the intended design; N5 aggregate independence is intended; N6 default merge-ref CI validates latest data integration without force/rebase.
