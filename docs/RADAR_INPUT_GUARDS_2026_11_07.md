# OFR publication and weekly-input safeguards · 2026-11-07

## Scope and baseline

Isolated branch `codex/ofr-editorial-guards-20261107`, based on main `aa1eefa46f79124b77c1f76e092ddc63a178dd66`. This restores two previously blocked reliability tasks. The original NVIDIA research worktree and separate draft #503/#504/#505 worktrees are not changed. No push, merge, deployment, paid provider call, production generation or production-data edit is performed.

## Changes

- The existing two-site publication monitor now validates the published OFR component, records its actual observation date separately from receipt/publication clocks, recalculates its seven-calendar-day age at check time, and explicitly warns on cached or missing values. Historical pre-migration snapshots retain their original path.
- A non-null weekly change must match the available dated endpoints, current index value and seven-day target date. Endpoints legitimately trimmed by the existing 63-day retention policy are marked unverifiable, using the component publication day rather than the later check day; missing retained endpoints and available numerical contradictions remain errors. This is internal published consistency, not a claim that a later revised source is the original source. The monitor retains its twelve-request limit and never fetches the OFR source.
- Bubble weekly compact input excludes the complete old radar context and its source reference whenever any OFR/retirement marker is present, including a null or damaged new component. The old score, old weekly change and derived regime/confidence/risk text cannot enter current evidence. A data gap explicitly states that OFR has not been included in this weekly evidence pack. This does not relabel OFR as a risk score or implement a new editorial model.
- Existing validators, provider limits, output/review/writer gates, scoring and historical fixture behavior are unchanged. The new regressions are added to the existing workflow and weekly-editorial contract test commands.

## Direct source verification

At 2026-11-07 08:15:35 UTC, three bounded, read-only requests returned HTTP 200:

- [OFR published CSV](https://www.financialresearch.gov/financial-stress-index/data/fsi.csv)
- [GitHub Pages radar data](https://ctmaomao.github.io/gfrr-auto-update-site/data/radar-data.json)
- [Custom-domain radar data](https://radar.gfrfinradar.uk/data/radar-data.json)

Both radar payloads have the same normalized JSON SHA-256: `28c75f12cf120a72ddb40f88716f1dfab4c6f071c98a31d95d4f32918a859002`.
The downloaded CSV SHA-256, `43b6c9be5893db4928748ed41d61ec32a65b461e4dec2ca59dbb921f87da294c`, exactly matches each published component's original CSV hash. The index is -2.162 on 2026-11-04, age three calendar days, available, not cached or missing. The official endpoints are 2026-10-28/-1.829 and 2026-11-04/-2.162; the difference -0.333 matches both sites. The new diagnostic found no errors. This proves the state at that check, not future immutability or forecast accuracy.

## Validation receipts

- New retirement regressions: 6/6 passed, no skips.
- Combined editorial retirement/score/media tests: 48/48 passed, no skips, exit 0 from the repository root. An earlier invocation from the user home directory produced one ENOENT in an existing workflow-file test; rerunning with the correct working directory resolved it without code/assertion changes.
- New and existing OFR/publication tests after the retention-boundary correction: 36/36 passed, no skips, exit 0.
- Independent Codex review found a P2 false hard error for legitimately trimmed old weekly endpoints. The bounded retention correction and new 62/63/64/91-day, delayed-probe and contradiction regressions closed it. Final independent incremental review passed 25/25 publication tests, no skips; no remaining P1/P2 was found. This is AI review, not human approval. Final-tree `npm run check:changed`, selecting the complete `check:all` suite, passed with exit 0 after the correction and code freeze. An earlier full run also passed but is retained separately; the final receipt is `manual-artifacts/ofr-editorial-guards-20261107/final-check-changed.log` and its `.exit` file. Provider-path tests use mocked transport; there was no real provider invocation. Passing checks does not authorize release.

## Self-audit and remaining boundary

The implementation follows the bounded restoration scope. No existing assertion is deleted, widened or skipped, and no ignore is added. There are no frontend rendering changes; browser visual sign-off is not claimed for this code-only input/monitor package. The old satellite draft and unrelated research are not restarted. Deployment remains outside this local delivery.

## Publication preparation after owner approval

The local-only receipts above remain historical facts. The owner subsequently approved continuing the stated plan through baseline/integration acceptance, pushing repairs, merging changes that pass checks and deploying the website. This package will first be pushed as its own draft PR with exact-head CI, preserving serial integration and the repository's review/release gates. No GitHub approval is impersonated, and no paid data, AI provider or production refresh is dispatched. At preparation time, latest main is still `aa1eefa46f79124b77c1f76e092ddc63a178dd66`; the nine-file fix has no main drift or conflict. Final remote PR/check/deployment receipts must be verified separately and are not implied by the local tests.
