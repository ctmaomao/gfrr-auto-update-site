# M-92A Today Summary Card Reflow Source Review And Implementation Spec Draft

> **STATUS (2026-06):** Historical artifact — preserved as a pre-implementation source-review / spec record. The 2026-05 runtime path reviewed here (`#plain-summary-card` / `renderPlainSummary.js` / `check-plain-summary-card-contract.mjs`) shipped and was later retired by the M-94 V0 Path C frontend rebuild (deleted in `c8229574`, "stage 2: delete 13 legacy frontend files"); residual style/contract references are tracked as **M-94 cleanup debt, not evidence that this spec is pending**. Not a current behavior contract; retained as milestone background only. Current frontend authority: `docs/M94_V0_DATA_CONTRACT.md` + `DESIGN.md`.

## Status

- Phase: source review + contract design.
- Implementation status: not implemented.
- Owner approval status: approved as M-92A+ on 2026-05-23, with mobile-only compaction constraint (see Section 11).
- Frontend renderer status: unchanged.
- Data source status: no new source proposed.
- Scoring / decision / execution / position status: unchanged.

## Hard Boundary

M-92A does not implement a DOM reflow, CSS change, checker, cache-version bump, scoring change, data write, Worker change, workflow change, or dependency change.

Until owner approval of this source review and implementation spec, the current page must remain unchanged:

- `#homepage-today-judgment` remains rendered by `scripts/modules/renderMacroOverview.js`.
- `dailyBrief`, `divergenceLayer`, and `macroDrivers.*` remain display-only / audit-only interpretation layers.
- No summary text may affect scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, `displayInputsBaseline`, `effectiveDisplayInputs`, or cross-validation.
- No implementation should modify modules outside `#homepage-today-judgment` unless owner explicitly approves the scope expansion called out in Decision Point 3.

## 1. Background and Source Review Trigger

`docs/SUMMARY_VIEW_M92_GAP_ANALYSIS_V2.md` concluded that the correct direction is C: reflow the existing `#homepage-today-judgment` today summary card rather than adding a parallel M-92 view. The V2 finding is important: the production site already has a top summary entry point, but the six desired summary elements are not fully visible in the first viewport, especially on mobile.

The target design is a 30-second summary for a normal mobile investor:

1. One-line overall judgment.
2. Risk score + 1-day and 7-day trend.
3. Top 3 risk sources, each with concrete evidence.
4. Top 3 noise / divergence prompts.
5. Data health state and key update times.
6. One final state conclusion, expressed as display-only status text rather than trading or position guidance.

This review exists to decide how to implement that summary safely after owner approval.

## 2. Audit Baseline

- Git HEAD at review time: `eda2c49` on `feat/m-92a-source-review`.
- Upstream baseline: `origin/main = bd542e2`, M-91 Market Pricing NDX/IXIC implementation.
- Current frontend asset cache version in production and repository references: `28.0M-91V`.
- Production URL measured: `https://radar.gfrfinradar.uk`.
- Playwright measurement time: `2026-05-23T06:47:30.237Z`.
- Production measurement result: all relevant JSON / module requests returned HTTP 200; Playwright recorded no `requestfailed` events.
- Production frontend version observed by Playwright: `window.__GFRR_FRONTEND_VERSION__ = "28.0M-91V"`.

Read files:

- `docs/SUMMARY_VIEW_M92_GAP_ANALYSIS_V2.md`.
- `docs/PROJECT_BACKLOG.md`.
- `data/radar-data.json`.
- `scripts/modules/renderMacroOverview.js`.
- `index.html`.
- `assets/styles.css`.
- `docs/DATA_CONTRACT.md`.
- `DESIGN.md`.
- `AGENTS.md`.
- `scripts/check-suite.mjs`.
- `scripts/check-homepage-ia-contract.mjs`.
- `scripts/check-frontend-visual-m54.mjs`.
- `scripts/check-frontend-visual-m55a.mjs`.
- `scripts/check-frontend-visual-m55b.mjs`.

Relevant authority evidence:

- `dailyBrief` is display-only and must not affect scoring / decision / execution / position: `data/radar-data.json:92-98`, `docs/DATA_CONTRACT.md:161-175`, `AGENTS.md:55`.
- Current `scoreChange7d` exists in data but is not consumed by `buildTodayJudgment`: `data/radar-data.json:827-830`, `scripts/modules/renderMacroOverview.js:409,425`.
- Today card is dynamically injected as first child of `#macro-risk-overview-root`: `scripts/modules/renderMacroOverview.js:3051-3056`.
- Current card structure is score panel + verdict panel + meta grid + coverage / missing lists + threshold scale: `scripts/modules/renderMacroOverview.js:3056-3107`.
- Current static waiting state is `#homepage-market-temperature` before JS replaces root children: `index.html:557-572`.

## 3. Phase 1: Current State Quantification

### 3.1 Production Mobile Viewport Occupancy

Viewport: `375x667`.

| Segment | Top | Bottom | Height |
|---|---:|---:|---:|
| Page top to hero | 0 | 14 | 14 |
| Hero | 14 | 301 | 287 |
| Hero masthead | 36 | 186 | 150 |
| Runtime badge | 210 | 280 | 70 |
| Gap: hero to nav | 301 | 337 | 36 |
| Jump nav | 337 | 471 | 134 |
| Gap: nav to macro overview | 471 | 535 | 64 |
| Macro overview section header | 535 | 701 | 166 |
| Gap: section header to root | 701 | 725 | 24 |
| Dynamic `#homepage-today-judgment` top | 725 | n/a | n/a |

Current mobile result:

- `#homepage-today-judgment` starts at `top=725`, which is 58px below the 667px viewport bottom.
- With the current first-fold chrome unchanged, the maximum possible card height for a fully visible initial viewport is `667 - 725 = -58px`.
- Therefore, mobile first-viewport full visibility is physically impossible if implementation is limited to only shrinking content inside `#homepage-today-judgment`.

Static waiting state:

- With JavaScript disabled, `#homepage-market-temperature` is the only child of `#macro-risk-overview-root`.
- It starts at `top=705` and has height `454px`.
- After JS succeeds, `renderMacroRiskOverview()` replaces this waiting state with dynamic runtime sections; `#homepage-today-judgment` becomes root child index 0.

### 3.2 Production Desktop Viewport Occupancy

Viewport: `1440x900`.

| Segment | Top | Bottom | Height |
|---|---:|---:|---:|
| Hero | 20 | 252 | 232 |
| Jump nav | 288 | 341 | 53 |
| Macro overview section header | 405 | 545 | 140 |
| `#macro-risk-overview-root` / today card top | 569 | n/a | n/a |
| `#homepage-today-judgment` | 569 | 1447 | 877 |

Current desktop result:

- Score `59` is visible in the first viewport: `top=771,bottom=895`.
- One-line verdict title intersects / exceeds the first viewport: `top=725,bottom=958`.
- The full today section is not visible: it would need height <= `900 - 569 = 331px`; current height is `877px`.

### 3.3 Current Today Card Internal Height

Mobile `375x667` production:

| Today child / sub-element | Top | Bottom | Height |
|---|---:|---:|---:|
| Card total | 725 | 2415 | 1690 |
| `h2` | 751 | 773 | 22 |
| Overline | 789 | 819 | 30 |
| `.editorial-headline` | 835 | 1745 | 911 |
| `.editorial-big-number` | 835 | 1158 | 324 |
| Score value | 897 | 974 | 77 |
| Big-number breakdown | 994 | 1055 | 60 |
| Big-number footer | 1087 | 1121 | 35 |
| `.editorial-verdict` | 1180 | 1745 | 565 |
| Verdict title | 1235 | 1429 | 194 |
| Verdict body | 1443 | 1496 | 53 |
| Verdict meta | 1577 | 1722 | 146 |
| `.editorial-meta-grid` | 1761 | 2096 | 334 |
| Coverage note | 2124 | 2217 | 93 |
| Threshold scale | 2245 | 2392 | 148 |

Desktop `1440x900` production:

| Today child / sub-element | Top | Bottom | Height |
|---|---:|---:|---:|
| Card total | 569 | 1447 | 877 |
| `h2` | 595 | 617 | 22 |
| Overline | 633 | 648 | 15 |
| `.editorial-headline` | 664 | 1145 | 481 |
| `.editorial-big-number` | 664 | 1145 | 481 |
| Score value | 771 | 895 | 124 |
| Big-number breakdown | 954 | 1014 | 60 |
| Big-number footer | 1085 | 1102 | 17 |
| `.editorial-verdict` | 664 | 1145 | 481 |
| Verdict title | 725 | 958 | 233 |
| Verdict body | 972 | 998 | 26 |
| Verdict meta | 1053 | 1116 | 64 |
| `.editorial-meta-grid` | 1161 | 1244 | 83 |
| Coverage note | 1272 | 1291 | 19 |
| Threshold scale | 1319 | 1424 | 105 |

### 3.4 Six-Element Height Reality Check

Strict today-card-only scope:

- Mobile: impossible for initial viewport, because the card starts below the viewport.
- Desktop: feasible only if the whole card is compressed from `877px` to <= `331px`.

Estimated compact six-element card if reflowed:

- Desktop: feasible target `300-330px` using a 2-row / 3-column dense grid.
- Mobile after first-fold chrome compression: feasible target `360-420px` using a compact single-column stack.
- Mobile without first-fold chrome compression: impossible regardless of internal card height.

Conclusion: owner must decide whether M-92A may expand scope to mobile first-fold chrome compression. If not, the implementation must not promise "375x667 initial viewport complete 6 elements"; it can only improve the card itself and its anchored reading experience.

## 4. Phase 2: 7 Decision Points

### Decision Point 1: Six-Element Layout Inside Today Card

Recommendation: use a compact six-element card inside `#homepage-today-judgment`, with desktop as a 2-row / 3-column grid and mobile as a single-column stack. Do not create a parallel summary module.

Desktop target, `1440x900`:

```text
┌──────────────────┬──────────────────────────────┬──────────────────┐
│ Score + 1d/7d    │ One-line overall judgment     │ Data health      │
├──────────────────┼──────────────────────────────┼──────────────────┤
│ Top 3 risks      │ Top 3 noise / divergences     │ State conclusion │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

Recommended grid:

```css
grid-template-columns: minmax(150px, 0.7fr) minmax(360px, 1.8fr) minmax(210px, 1fr);
grid-auto-rows: minmax(112px, auto);
```

Mobile target, `375x667`, only feasible if owner approves first-fold chrome compression:

```text
┌─────────────────────────────────┐
│ Score 59 | 1d -1 | 7d +1 | Health│
├─────────────────────────────────┤
│ One-line overall judgment        │
├─────────────────────────────────┤
│ Top 3 risks: compact evidence    │
├─────────────────────────────────┤
│ Top 3 noise / divergences        │
├─────────────────────────────────┤
│ State conclusion                 │
└─────────────────────────────────┘
```

Visual weight:

- Highest: risk score + trend.
- Second: one-line overall judgment.
- Middle: Top 3 risks and Top 3 noise / divergences.
- Compact meta: data health and final state conclusion.

Do not hide any of the six elements behind collapses. Detailed long-form explanation should remain in existing lower sections, unchanged.

### Decision Point 2: Element 6 Wording Lexicon

Recommendation: rename the concept from "action advice" to "state conclusion" in implementation copy. The rendered phrase must be selected from a hard-coded display-only enum and must not contain trading / position guidance.

Allowed phrases:

| Condition | Phrase |
|---|---|
| Data degraded | `数据降级，维持观察` |
| Score >= 85 | `系统性风险观察` |
| Score 65-84 | `局部冲击观察` |
| Score 50-64 and 7d change > 0 | `压力上升观察` |
| Score 50-64 and 7d change < 0 | `压力边际缓和` |
| Score 50-64 and flat 7d change | `维持当前判断` |
| Score < 50 | `常态观察` |
| Insufficient score / trend | `证据不足，等待确认` |

Additional allowed neutral words for fallback composition:

- `保持观察`
- `等待确认`
- `风险趋稳`
- `主线未变`
- `边际缓和`
- `压力仍在`
- `数据降级`
- `维持当前判断`

Forbidden phrases and concepts:

- `建议减仓`
- `建议加仓`
- `应该卖出`
- `可以买入`
- `应当谨慎`
- `交易建议`
- `操作建议`
- `建仓`
- `平仓`
- `止损`
- `止盈`
- `做多`
- `做空`
- `提高仓位`
- `降低仓位`
- `配置建议`
- `对冲建议`

Implementation location:

- Hard-code the enum in `scripts/modules/renderMacroOverview.js` near `buildTodayJudgment()`, for example as `TODAY_SUMMARY_STATE_PHRASES` plus a small `selectTodayStateConclusion()` helper.
- Do not add a new data field unless owner opens a separate data-contract task.

### Decision Point 3: Whether To Compact Hero / Nav In M-92A

Production mobile measured height:

- Hero: `287px`.
- Jump nav: `134px`.
- Combined hero + nav: `421px`.
- Including top gap, hero-to-nav gap, nav-to-macro gap, macro header, and header-to-root gap, the today card starts at `725px`.

If not compacting hero / nav / macro header:

- Today card must fit in `-58px` on `375x667`, which is impossible.
- A today-card-only implementation can improve content density, but cannot satisfy "mobile initial first viewport shows complete six elements".

Recommendation: **partial compacting requires owner approval**.

Base M-92A should remain scoped to `#homepage-today-judgment`. However, if owner keeps the acceptance criterion "375x667 initial viewport complete six elements", implementation must be expanded to M-92A+ and include mobile-only first-fold chrome compaction. This is a scope expansion because it affects hero / nav / macro header visual occupancy outside the today card.

Expected savings if owner approves partial compaction:

| Area | Current mobile height / gap | Target cap | Approx. saving |
|---|---:|---:|---:|
| Hero | 287 | 120-150 | 137-167 |
| Jump nav | 134 | 56-72 | 62-78 |
| Nav-to-macro gap | 64 | 16-24 | 40-48 |
| Macro header | 166 | 56-76 | 90-110 |
| Header-to-root gap | 24 | 8-12 | 12-16 |

Even with compaction, the today card should target <= `360-420px`. If owner does not approve this expansion, the implementation must downgrade mobile acceptance to "first card is compact and complete after using the today anchor / first two screens".

### Decision Point 4: `scoreChange7d` And `scoreChange1d` Display

Recommendation: show score as the primary number, with two compact trend chips under or beside it:

- `1日 -1`
- `7日 +1`

Rejected:

- Two independent stat cards: too tall for mobile and duplicates the score panel.
- Large arrow-only UI: saves space but loses evidence and can be misread as action guidance.

Target dimensions:

- Desktop: score / trend cell `150-220px` wide, `96-120px` tall.
- Mobile: first row `56-76px` tall; score and two chips share the row.

Data source:

- `data.score`, `data.scoreChange1d`, and `data.scoreChange7d` from `data/radar-data.json:827-830`.
- Current renderer only uses 1-day change; M-92A should add 7-day display.

### Decision Point 5: Top 3 Risk / Top 3 Noise Data Source And Sorting

Top 3 risks recommendation: prefer `dailyBrief.dominantRiskChain.evidence`.

Reason:

- It already contains exactly three concise, concrete evidence entries in the current data: Brent, 10-year breakeven inflation, and US 10-year yield (`data/radar-data.json:22-44`).
- It is authored as the dominant chain for the daily brief, so it is more stable for first-fold summary than recomputing a top-three list from the detailed pressure-source cards.

Fallback:

- If `dailyBrief.dominantRiskChain.evidence` has fewer than three valid entries, take the first entries from `buildPressureSources(data, worldOrderStressData).slice(0, 3)`, using each card's `title`, `status`, and first finite `evidence` line.
- If still insufficient, render `数据不足，压力来源待确认` as a display-only fallback. Do not fabricate evidence.

Top 3 noise / divergence recommendation:

1. Start with `dailyBrief.largestDivergence.summaryZh`.
2. Append `divergenceLayer.checks`, sorted by numeric `score` descending, de-duplicated by `key`.
3. If fewer than three items remain, append existing hard-coded noise warnings from `buildSignalLayers()` such as `单一价格变化不足以形成强结论。`

Data source chain:

- `dailyBrief.largestDivergence`: `data/radar-data.json:46-67`.
- `divergenceLayer.primaryDivergence` and checks: `data/radar-data.json:137-230`.
- `buildSignalLayers()` current fallback wording: `scripts/modules/renderMacroOverview.js:615-630`, `671-683`.

### Decision Point 6: Data Health Thresholds

Recommendation: compute a display-only health pill from existing fields. Do not add a new data source.

Primary fields:

- `dailyRealtimeInput.healthScore`: `data/radar-data.json:4-10`.
- `dailyRealtimeInput.updatedAt`.
- `dailyRealtimeInput.capturedAt`.
- `dailyBrief.generatedAt`.
- Optional display source: market-pricing metrics update / latest week if already available in `marketPricingMetricsData`.

Threshold table:

| Display state | Rule |
|---|---|
| `良好` | `healthScore >= 90` and primary update age <= 36h |
| `一般` | `healthScore >= 70` and primary update age <= 72h |
| `降级` | `healthScore < 70`, missing health score, invalid timestamp, or primary update age > 72h |

Display form:

- Small pill with text and semantic color token.
- Show at most three update times:
  1. Realtime input updatedAt.
  2. Daily brief generatedAt.
  3. Market-pricing metrics latest week / updatedAt when present.

### Decision Point 7: New Contract Checker Design

Recommendation: add a new standalone checker and wire it into the frontend / market overview check surface. Do not relax existing checkers.

Suggested file:

- `scripts/check-today-summary-card-contract.mjs`

Suggested package script:

- `check:today-summary-card-contract`

Suggested suite wiring:

- Add to `scripts/check-suite.mjs` under the frontend visual / homepage contract area.
- Do not edit `check-frontend-visual-m54.mjs`, `check-frontend-visual-m55a.mjs`, or `check-frontend-visual-m55b.mjs` unless implementation evidence proves they directly lock the changed structure.

Assertions:

1. `scripts/modules/renderMacroOverview.js` must create all six summary selectors inside `#homepage-today-judgment`.
   - Suggested selectors:
     - `[data-today-summary-element="overall-judgment"]`
     - `[data-today-summary-element="score-trend"]`
     - `[data-today-summary-element="top-risks"]`
     - `[data-today-summary-element="noise-divergence"]`
     - `[data-today-summary-element="data-health"]`
     - `[data-today-summary-element="state-conclusion"]`
2. The checker must assert those selectors are appended to the `today` section, not to a new root-level section.
3. The checker must assert `scoreChange7d` is referenced by the today-summary builder and that a rendered label such as `7日变化` or `data-summary-metric="score-change-7d"` exists.
4. The checker must assert the final state-conclusion phrase is in the allowed enum.
5. The checker must grep the M-92A today-summary helper block for forbidden markers:
   - `decisionModel`
   - `executionLock`
   - `positionGuidance`
   - `Action Queue`
   - `Trigger Monitor`
   - `Invalidation Rules`
   - `操作建议`
   - `交易建议`
   - `建议减仓`
   - `建议加仓`
   - `买入`
   - `卖出`
   - `做多`
   - `做空`
6. The checker must include an explicit ignore-list comment. Preferred design: the ignore list is empty and the file header states why. If implementation must ignore legacy renderer text outside the M-92A helper block, each ignored range must be named and justified.

Existing checker interaction:

- `check-homepage-ia-contract.mjs` already locks the macro runtime IDs and forbids action-like copy such as `买入`, `卖出`, `加仓`, `做多`, `做空`, `长期反向 ETF`, and `操作建议`.
- Existing visual-history checkers appear to protect historical M-54 / M-55 IA and copy contracts rather than the internal today-card DOM. Baseline update is not expected, but implementation must verify.

## 5. Phase 3: Pitfall Analysis

### Pitfall 1: Mobile First-Viewport Physical Space

Finding: this pitfall is real.

The production mobile today card starts at `top=725`, below a `375x667` viewport. No reflow inside the card can make the full six-element card visible on initial load if the top chrome remains unchanged.

Spec response:

- Base M-92A remains local to `#homepage-today-judgment`.
- If owner requires the original mobile first-viewport acceptance, implementation must pause and obtain explicit approval to expand into mobile-only hero / nav / macro-header compaction.
- If owner declines that expansion, the mobile acceptance criterion must be downgraded in writing to "compact complete today card after jumping to / scrolling to the today anchor" or "first two screens".

### Pitfall 2: `dailyBrief` Boundaries vs "Action Advice"

Finding: "action advice" conflicts with the current display-only boundary if interpreted literally.

Spec response:

- Use `状态结论` or `今日状态结论`, not `行动建议`.
- The phrase must come from the allowed enum in Decision Point 2.
- The summary should not add a new first-fold disclaimer such as `不构成投资建议`; that consumes scarce height and may create copy-checker ambiguity. The boundary is enforced by enum wording and existing Method / Evidence sections.
- No new `dailyBrief.summaryGuidance` boundary is needed for M-92A. If owner wants free-form guidance text, pause for a separate data-contract review.

### Pitfall 3: Visual History Baseline Breakage

Finding: baseline breakage is possible but not currently expected.

Evidence:

- `check-homepage-ia-contract.mjs` locks runtime IDs and forbidden copy, not the internal arrangement of today-card sub-elements.
- M-54 / M-55 visual-history checkers appear focused on historical IA, realtime band, cache version, and copy safeguards, not the today-card six-element internal grid.

Spec response:

- Do not relax existing checkers.
- If a visual-history checker fails because of the intended today-card reflow, implementation should first verify whether the assertion is actually about today-card internal DOM. If more than one existing contract checker objects, pause for owner review.
- Do not update any baseline silently.

## 6. Phase 4: Implementation Spec Draft

This section is a draft for a later owner-approved implementation PR. It is not approval to implement.

### Expected File Change Scope

Base M-92A, today-card-only:

| File | Change size | Purpose |
|---|---:|---|
| `scripts/modules/renderMacroOverview.js` | `50-200` or `>200` | Add compact six-element today summary builder and render structure inside `#homepage-today-judgment`; consume `scoreChange7d`; keep all display-only boundaries. |
| `assets/styles.css` | `50-200` | Add compact editorial summary grid and mobile stack styles for the today card only. |
| `scripts/check-today-summary-card-contract.mjs` | `50-200` | New contract checker for selectors, 7-day trend, wording enum, and boundary grep. |
| `package.json` | `<50` | Add checker script and include in relevant aggregate if package scripts require direct wiring. |
| `scripts/check-suite.mjs` | `<50` | Add new checker to the frontend / homepage contract suite. |
| `docs/DATA_CONTRACT.md` | `<50` | Optional note that the M-92A summary card is a frontend display contract, not a new data field. |
| `index.html` | `<50` | Cache-version query update only via frontend asset bump helper, if JS/CSS changes are implemented. |

Scope expansion only if owner approves Decision Point 3:

| File | Change size | Purpose |
|---|---:|---|
| `assets/styles.css` | `50-200` additional | Mobile-only first-fold chrome compaction for hero / jump nav / macro section header. |
| `scripts/check-homepage-ia-contract.mjs` | `<50` only if necessary | Only if existing IA contract must assert the new mobile first-fold target; this would require explicit owner approval. |

No expected deletions.

### New Contract Checker

The new checker should be strict about the new card but narrow in scope.

Required checks:

- Confirm `homepage-today-judgment` still exists in `renderMacroOverview.js`.
- Confirm all six `[data-today-summary-element]` keys exist in renderer source.
- Confirm all six keys are appended under the today section variable returned by `appendSection(..., 'homepage-today-judgment')`.
- Confirm `scoreChange7d` is consumed in the today summary path.
- Confirm final state conclusion uses the allowed enum.
- Confirm forbidden action / position wording is absent from the M-92A helper block.
- Confirm no references to decision / execution / position fields are added to the M-92A helper block.
- Confirm the checker ignore list is explicitly documented. Preferred: empty ignore list with a header comment.

### Existing Contract Checker Changes

Recommendation: add a new checker rather than extending M-54 / M-55 visual history checkers.

Warning:

- If implementation needs to change `check-homepage-ia-contract.mjs` or relax any existing forbidden-copy assertion, that is a pause condition.
- If implementation needs to update a visual-history baseline, owner review is required before merging.

### Playwright DOM Verification Draft

Use production URL only:

```text
goto https://radar.gfrfinradar.uk
waitForLoadState('networkidle')
wait 2000ms
assert no requestfailed for radar-data.json / market-pricing-metrics.json / world-order-stress.json
```

Common assertions:

- `#homepage-today-judgment` exists.
- `#homepage-today-judgment` parent is `#macro-risk-overview-root`.
- `#homepage-today-judgment` index inside parent is `0`.
- The six `[data-today-summary-element]` selectors are all descendants of `#homepage-today-judgment`.
- `[data-summary-metric="score-change-7d"]` is visible and non-empty.
- The state-conclusion text is in the allowed enum.
- No state-conclusion text contains forbidden trading / position language.
- `#execution-risk-detail`, decision header, Action Queue, and position sections do not contain duplicated today-summary selectors.

Viewport assertions:

- Desktop `1440x900`: all six summary elements should be within viewport bounds if card target height <= `331px`.
- Mobile `375x667`: only assert all six summary elements within initial viewport if owner approves first-fold chrome compaction. Without that approval, the implementation cannot satisfy this physical constraint and must not fake the pass.

### Cache Version Bump

If implementation touches frontend JS / CSS / `index.html`, bump:

```text
28.0M-91V -> 28.0M-92AV
```

Use the existing asset version bump helper. The bump is a frontend cache contract only; it must not write `data/*.json`, `realtime/*.json`, Worker runtime, KV, or workflows.

### Implementation Pause Triggers

Pause and ask owner before proceeding if any of these happen:

1. Mobile `375x667` first-viewport acceptance requires hero / nav / macro-header changes and owner has not approved Decision Point 3 expansion.
2. More than one existing contract checker fails because of the reflow.
3. The compact card still cannot fit the measured viewport after approved compaction.
4. The allowed wording enum is insufficient and implementation would need action / position language.
5. Existing `dailyBrief.boundaries` fields are insufficient and implementation seems to require a new data boundary.
6. Implementation appears to require a new data source, data write, Worker change, workflow change, npm dependency, or scoring / decision / execution / position field.
7. Playwright shows the state conclusion rendered outside `#homepage-today-judgment` or duplicated in decision / execution / position areas.

### Implementation Non-Goals

- No new independent M-92 summary section.
- No new data source.
- No data file write.
- No Worker runtime change.
- No workflow change.
- No npm dependency.
- No scoring / decision / execution / position change.
- No `displayInputsBaseline` / `effectiveDisplayInputs` change.
- No cross-validation change.
- No free-form AI generated copy.
- No trading, position, execution, or portfolio guidance.
- No change to lower detailed modules except cache-version references required by frontend asset versioning.

## 7. Phase 5: Self-Audit

### 1. Scheme Consistency

The spec is based on production Playwright measurements, not a file-only assumption:

- Production `375x667`: today card `top=725,bottom=2415,height=1690`; hero `height=287`; nav `height=134`; macro header `height=166`; no request failures.
- Production `1440x900`: today card `top=569,bottom=1447,height=877`; score visible `top=771,bottom=895`; full card not visible.
- Static JS-disabled mobile: waiting state `#homepage-market-temperature` exists at `top=705,height=454`; dynamic today card is absent until JS succeeds.

### 2. Contract Checker Completeness

This review does not propose weakening any checker. It recommends adding a new checker and treating existing checker failures as pause conditions.

The main warning is `check-homepage-ia-contract.mjs`: it already forbids action-like copy. M-92A implementation must work within that constraint by using neutral state language, not by relaxing the checker.

### 3. Ignore List Explicitness

The proposed new checker should have an empty ignore list by default and a header comment explaining that it is empty because M-92A uses explicit selectors and a bounded helper block.

If implementation needs to ignore legacy renderer text outside the helper block, every ignored range must include a reason comment naming the legacy boundary and why it is outside M-92A scope.

### 4. Scope Expansion Transparency

This spec does identify a scope conflict:

- V2 recommended local `#homepage-today-judgment` reflow.
- Production geometry proves local reflow alone cannot satisfy mobile `375x667` initial first-viewport completeness, because the card starts at `top=725`.

Therefore, owner must explicitly choose:

1. Approve M-92A+ mobile first-fold chrome compaction.
2. Keep strict M-92A today-card-only scope and downgrade mobile acceptance to anchored / first-two-screen reading.

Implementation must not silently make this choice.

## 8. Non-Goals

- Do not implement before owner approval.
- Do not modify `index.html`, `renderMacroOverview.js`, `assets/styles.css`, checkers, or package scripts in this source-review PR.
- Do not change `#homepage-today-judgment` siblings.
- Do not change lower detailed modules.
- Do not change `dailyBrief`, `divergenceLayer`, `macroDrivers`, `brentPricingLayer`, market-pricing, world-order, realtime, Worker, scoring, decision, execution, position, or cross-validation semantics.
- Do not use AI-generated copy at runtime.

## 9. Risks and Limitations

- The mobile first-viewport requirement cannot be met under strict today-card-only scope.
- Hero / nav / macro-header compaction would touch first-fold UI outside the V2 "local today card" recommendation and needs owner approval.
- Hard-coded phrase enums are safe but may feel less natural; this is intentional to preserve display-only boundaries.
- Very long Chinese evidence strings may still pressure a 375px layout. Implementation should use concise existing summaries and avoid full detailed evidence in first-fold rows.
- Production Playwright acceptance can only be final after deployment; pre-merge local checks should still be run, but production is the authority for the requested viewport contract.

## 10. Next Steps

Owner review is required before implementation.

Decision required:

1. Approve the six-element compact layout.
2. Approve the display-only phrase enum.
3. Choose the mobile scope:
   - M-92A strict: today-card-only, with mobile first-viewport acceptance downgraded.
   - M-92A+: include mobile-only hero / nav / macro-header compaction to pursue initial viewport completeness.
4. Approve the new contract checker design.

If approved, the next implementation milestone should be:

```text
M-92A Today Summary Card Reflow
```

If owner approves first-fold chrome compaction too, name the implementation milestone:

```text
M-92A+ Today Summary Card Reflow + Mobile First-Fold Compaction
```

Owner approved the M-92A+ route on 2026-05-23: mobile-only compaction with desktop zero-change constraint. The next step is the implementation `/goal` phase, started by Robert at owner-controlled timing. The implementation `/goal` instruction will be drafted by Claude from this spec plus Section 11.

## 11. M-92A+ Mobile-Only Compaction Plan

### 11.1 Scope

- M-92A+ extends the M-92A base scope by adding mobile-only hero / jump nav / macro overview section header compaction.
- All compaction must be wrapped in `@media (max-width: 640px)`.
- Desktop `>=641px` DOM and visual output must have zero change.

### 11.2 Desktop Zero-Change Guarantee

- Any CSS change must live inside an `@media (max-width: 640px)` block.
- Do not change default selector styles for hero / nav / macro header.
- Do not change the HTML structure for hero / nav / macro header.
- Before implementation, capture a `1440x900` desktop baseline screenshot; after implementation, capture a comparison screenshot. Any pixel difference is a pause trigger.

### 11.3 Mobile Viewport Height Budget

Based on the production Playwright measurement in Section 3.1, the target budget is:

- Hero compact: `120-150px` currently `287px`.
- Jump nav compact: `56-72px` currently `134px`.
- Macro section header compact: `56-76px` currently `166px`.
- Total gaps: `<=40px` currently `124px`.
- Cumulative saving: `410-510px`.
- Expected today card start position: `top ~= 280-330px`.
- Today card target height: `360-420px`.
- Total occupancy: `~= 640-750px`.

Note: even if compaction lands as designed, `375x667` may still slightly exceed the first viewport. The implementation PR must report exact final numbers. If the total exceeds `667px`, Pause Trigger 8 applies.

### 11.4 Hero Compaction

Current mobile hero height is `287px`, including:

- Masthead: `h1`, eyebrow, subtitle, and version line.
- Runtime badge: floating status card.

Recommended compaction:

- Reduce mobile masthead font sizes by two steps from the current mobile default.
- Hide mobile subtitle with `display: none` inside the `@media` block.
- Hide mobile version line with `display: none` inside the `@media` block.
- Convert the mobile runtime badge into a small inline pill rather than a floating card.
- Tighten padding and margins.

Target height: `<=150px`.

### 11.5 Jump Nav Compaction

Current mobile nav height is `134px`, with 14 jump links.

Recommended compaction:

- Convert to a single-line horizontal scroller with `overflow-x: auto`.
- Reduce font size.
- Tighten padding.
- Do not delete any link; preserve full navigation capability.

Target height: `<=72px`.

### 11.6 Macro Section Header Compaction

Current mobile macro header height is `166px`, with kicker + title + note.

Recommended compaction:

- Reduce mobile kicker font size.
- Hide the mobile note or truncate it to one line.
- Tighten padding.

Target height: `<=76px`.

### 11.7 New Contract Checker Extensions

In addition to `check-today-summary-card-contract.mjs` from Decision Point 7, add a second independent checker:

```text
scripts/check-mobile-first-fold-compaction.mjs
```

Boundary assertions:

1. In `assets/styles.css`, all padding / margin / font-size / display changes targeting `.hero`, `.dashboard-jump-nav`, or `#macro-risk-overview .editorial-section-header` must appear inside an `@media (max-width: 640px)` block.
2. `index.html` hero / nav / macro section header HTML structure must remain unchanged.
3. The implementation PR must include `1440x900` desktop baseline screenshot comparison evidence, by hash or filename reference.
4. Ignore list is empty, with a header comment explaining that it is empty because M-92A+ uses bounded mobile-only selectors and desktop zero-change checks.

### 11.8 Updated Pause Triggers (M-92A+ Version)

Add these pause triggers to the existing Section 4 / Section 6 implementation triggers:

8. Even after applying the Section 11.3 budget, `375x667` first viewport still overflows, meaning the today card bottom is greater than `667px`.
9. Any CSS change unexpectedly affects desktop `>=641px` visual output; baseline screenshot evidence is required.
10. Hero / nav / macro header HTML structure must change, rather than CSS-only mobile compaction.
11. Existing `check-homepage-ia-contract.mjs` or another IA checker objects to mobile compaction.
12. The single-line horizontal jump nav is found to break existing accessibility or keyboard navigation.

### 11.9 Updated File Change Scope (M-92A+ Version)

Append these implementation files to the Section 6 Phase 4 file scope:

| File | Change size | Purpose |
|---|---:|---|
| `assets/styles.css` | `50-200 additional` | Mobile-only `@media (max-width: 640px)` block for hero / nav / macro header compaction. |
| `scripts/check-mobile-first-fold-compaction.mjs` | `50-200` | New checker locking desktop zero-change and mobile compaction boundaries. |
| `package.json` | `<50 additional` | Add the new checker npm script. |
| `scripts/check-suite.mjs` | `<50 additional` | Add the new checker to the frontend suite. |

### 11.10 Updated Playwright DOM Verification

Add these assertions to the Section 6 Playwright verification draft.

Desktop `1440x900`:

- Hero, jump nav, and macro section header pixel positions must exactly match baseline, using screenshot comparison plus `getBoundingClientRect()` checks.
- Desktop today card must remain visible in the first viewport, consistent with the existing Section 4 desktop assertion.

Mobile `375x667`:

- Hero height `<=150px`.
- Jump nav height `<=72px`.
- Macro section header height `<=76px`.
- Today card top `<=350px`.
- Today card bottom `<=667px`, meaning the full card is inside the first viewport.
- All six `[data-today-summary-element]` nodes are inside the viewport.
- If today card bottom is greater than `667px`, report `M-92A+ physical target not met; owner reassessment required`.

### 11.11 Updated Cache Version

M-92A+ touches more CSS than M-92A but remains the same milestone family. Use the same cache version bump:

```text
28.0M-91V -> 28.0M-92AV
```

If implementation finds a reason to use `28.0M-92A+V` or another naming form, pause for owner approval.
