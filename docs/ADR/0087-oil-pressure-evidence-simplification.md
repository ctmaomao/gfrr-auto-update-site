# ADR-0087 — Qualify and simplify oil-pressure observations

- Date: 2026-11-06 (UTC)
- Status: Owner-authorized local implementation; independent Codex AI patch review and complete local verification passed. No remote publication authorization.
- Scope: Existing ODP evidence and presentation only. No new source, indicator, score, forecast model, production snapshot or workflow.

## Context and acceptance baseline

The owner asked to focus on oil-price direction and pressure, stop unrealistic unfinished work, and reduce rather than expand the module. The local correction removes unsupported prediction and confirmation language. Current Brent 107.03 has a FRED/EIA observation date of November 3; November 6 is a capture date, not a new quote. No price-value error has been established.

The existing radar history stores publication dates without quote observation dates or comparable-source identity. Its four-week change therefore cannot qualify as a dated, same-source Brent movement. The legacy crack change is only ULSD change times 42, without subtracting Brent change; the retained current ULSD leg also lacks its observation date. These are not qualified two-leg spread evidence. STEO inventory and spare-capacity fields share one monthly estimate/forecast system, not three independent observations.

## Decision

1. Keep the existing US weekly physical classifier and thresholds. Describe its result as US weekly supply/demand pressure, not a validated global oil-price forecast. Historical enum values and replay artifacts remain readable. Neither historical backtest labels nor current checks establish future price-prediction performance.
2. Use a shared pure evidence adapter in the builder and renderer. An actual matching quote observation, source identity and existing fixed freshness limits are required. Browser rendering rechecks age. Null, blank, boolean and object values never become measured zero; future or unknown observations do not qualify.
3. Only explicitly dated, same-source Brent history may supply price divergence. Keep the existing four-week window tolerance; reject conflicting duplicate observations, mixed sources, unmatched or stale endpoints. Current legacy history has no such proof, so price direction is unavailable. A stale, future, missing-leg or non-live curve cannot supply divergence. This patch does not create new history or sources.
4. Withdraw crack level/change from ODP arguments until a separately reviewed producer can establish both dated, comparable legs. Preserve existing source snapshots as historical evidence. Do not repair missing evidence by inventing dates, carrying capture timestamps, or computing a new approximation.
5. Keep STEO values as explicitly labeled monthly estimate/forecast background. Preserve forecast flags, count no independent confirmations and do not raise directional confidence. Archived overlay replay vocabulary remains isolated from the live builder; no frontend fallback classifier remains.
6. Show one current pressure summary, qualification limits, existing weekly reasons, qualified counterevidence, dated evidence and monthly background. Retire satellite conclusions, unconnected route-freight placeholders, cross-confirmation and duplicate confirmation/readiness sections from active rendering. Keep compatible DOM IDs and archived evidence; do not add replacement indicators or delete user research. Existing independent news display is unchanged.

## Narrow display-contract supersession

The existing narrative checker asserted the visible labels “假跌/假涨” and market confirmation. For this task only, replace those exact expectations with objective price/US-weekly divergence wording and explicit non-predictive limits. Add strict prohibitions against old labels, unsafe legacy attribution and active retired render paths. The attribution checker’s required raw it.attribution marker is replaced by required qualified current-evidence/counterevidence entry points and an explicit prohibition on forwarding old prose. Structural, score-boundary, source-quality and historical replay assertions remain. This is an explicit contract change requiring independent review, not a hidden assertion deletion or skip.

The timing and Chinese-copy checkers also replace requirements for retired satellite/cross-confirmation/readiness implementations with strict inactive/absent-renderer assertions. The facility-window quality checker replaces only its two required satellite renderer markers with two explicit prohibitions on restoring that retired display. Every facility-window calculation, promotion/config/builder requirement and archived quality gate remains. Existing evidence timing schema, freshness thresholds, null guards and source boundaries remain. Removal of dead renderer implementations is required rather than lint suppression, fake exports or empty calls.

The frontend continues to satisfy DESIGN.md using existing layout, fonts, colors, DOM hooks and boundary copy. No new component or design-contract change is proposed. The cache token must be bumped with the repository tool.

## Isolation and verification

Work is based on latest main 4ae72b1146f9421ff943a791bc8fe012f139117e in its own local branch. Draft PR #503 and the original dirty workspace are preserved. This task does not stack on #503 or claim its collector fixes are merged; overlapping presentation changes must be reconciled before any later publication.

Required evidence: offline builder/display regressions for real source dates, null/zero, future/stale/mixed-week data, legacy artifact rejection, both qualified and rejected price windows, crack exclusion and STEO non-independence; existing ODP checks; complete check:changed/check:all; independent fixed-patch review. No local preview permission workaround, live collection, paid calls, data regeneration, push, merge or deployment is authorized by this ADR. Browser visual acceptance remains separate when not executed.

## Verification receipt

- New offline qualification/DOM regressions: 32 passed, zero skipped. The unchanged production contract/freshness/degradation checkers also accepted new adapter output across six valid/degraded scenarios.
- Complete check:changed/check:all: exit 0 after the explicit display-retirement contract migrations above. Modified source/test lint, app syntax and diff whitespace checks passed.
- Full unit coverage: 1,372 passed, zero failed, one pre-existing conditional local-original-sample test skipped. Coverage was 99.85% lines, 93.98% branches and 97.96% functions, above the unchanged 95/90/95 thresholds.
- Independent Codex AI review found no remaining blockers, including all five narrowly migrated display checkers. This is not human or browser visual acceptance.
- The original workspace’s 1,359 recorded files and the clean draft PR #503 worktree remained unchanged. No production data, config, workflow, source collection, remote push, merge or deployment occurred.

## PR #504 browser gate follow-up (2026-11-06)

The owner subsequently approved pushing this isolated change as draft PR #504 and checking CI. Run 42168118023 passed dependency audit, measured unit tests and the full check suite, but browser smoke passed 94 tests and failed one old assertion demanding the retired satellite request-health text. The following EdgeOne staging checks did not run. No production defect or permission bypass is inferred from that expected retirement mismatch.

The owner then explicitly approved replacing those old satellite assertions with checks that the area is hidden and cannot show old conclusions, preserving the other tests, and pushing the correction to the same draft PR. Merge, deployment and changes to draft #503 remain unapproved.

Only the three required satellite health-text assertions and their now-unused snapshot constant are replaced. After the unchanged news-health assertions prove the auxiliary data render has completed, and with the surrounding evidence fold explicitly open, the browser must find exactly one legacy satellite container, its hidden/inert attributes and computed display:none. All eight exact compatibility leaves must exist, remain hidden and contain only the neutral em-dash placeholder. This rejects both accidental un-hiding and silent writes of old conclusions. News-health assertions, other smoke assertions, timeouts, retries, test count and all source-quality/score gates are unchanged. There is no skip, ignore, continue-on-error or runtime/data change.

Independent review, local syntax/lint, existing offline regressions and complete checks are required for this test-contract correction. Browser execution uses the already approved CI workflow; the prior local preview socket denial is not retried or bypassed. Final acceptance is the exact revised PR head's CI result, including the previously skipped EdgeOne stage.

The correction passed independent Codex AI review, syntax, the existing 32 offline qualification/render regressions and complete check:changed/check:all (exit 0). ESLint with the two actual browser callback globals declared passed; default lint had the same ten pre-existing callback-global diagnostics in both baseline and revision, with no new diagnostics or rule/config changes. Revised-head CI remains the browser and EdgeOne acceptance gate.

## Endpoint provenance review follow-up (2026-11-07)

Independent integration review found that the curve producer's aggregate updatedAt is the newest observation among all contracts. It cannot prove freshness of both spread endpoints. The adapter now requires two actual endpoint rows, matching front/back prices and the producer-rounded spread, and individually valid dates under the unchanged four-day limit. It uses the older endpoint date for the evidence clock. Missing, malformed, future or stale endpoints fail closed; a newer middle contract cannot renew them. Browser divergence also rejects either endpoint observed after the pressure snapshot was built. No producer, source, scoring threshold, production snapshot or output schema is changed.

The existing positive fixtures now contain the actual producer's contract-row evidence; their assertions remain. Seven new tests cover bad endpoints, missing/mismatched rows, spread mismatch, a fresh middle quote, the four-day edge, build-time isolation, and repeated-render clearing of divergence and standalone curve counterevidence. The added endpoint cases fail on the previous helper; all 39 focused tests pass after correction. The superseded in-progress complete check was interrupted and is not counted as a pass. Final full verification, independent review and publication receipts remain separate.

The owner's later serial integration/publication authorization is recorded in PROJECT_BACKLOG.md. It does not replace the repository's human-review gate or authorize paid providers, production generation, history rewriting or changes to #503.
