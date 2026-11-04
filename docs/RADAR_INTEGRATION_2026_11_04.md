# Latest-main radar integration — 2026-11-04

Base: `a8bffc7e918660bd8aac248d1a809b80541d25a2`. Local branch: `codex/radar-integration-20261104`. Owner authorized implementation and validation only; remote push/PR/merge/deployment and production refresh await separate confirmation.

## Concrete package

- NVIDIA revenue-period qualification, newer-ledger protection and the narrow [ADR-0084](ADR/0084-nvda-period-qualified-ratio.md) r5 unknown path. No production evidence is manufactured. Current legacy ratio is visibly unqualified; existing published scores/lights remain recorded snapshots.
- Main-page World Order/tail dates and historical/invalid/missing state. Existing OFR qualification, four lanes, 13 navigation links and structural coverage gaps retained.
- Bubble issue/card age at viewing time, unknown age policy, long-open/foreground rechecks and expired AI retirement. Existing empty-trend coverage layout and all 27/Core-23/Shadow-4 cards retained.
- Required mechanical frontend asset bump to `radar-integration-20261104-r1`; query/version edits in otherwise unrelated modules and operational documents are cache synchronization only.

本 PR 符合 DESIGN.md 的所有规则。No design tokens, font stacks, hierarchy, layout primitives or scoring display thresholds changed. Before/after 1440px and 390px screenshots plus computed font/color/background and published score comparisons live under ignored `manual-artifacts/radar-integration-20261104/` in this checkout. Google font CSS was consistently replaced by an empty response for reproducible captures; the real fallback font stacks remain unchanged.

## Integration choices

The five earlier local commits were inspected, not cherry-picked. Only still-needed dated LTM qualification and page age/independent-warning logic were adapted from the reviewed work. The latest #495 numeric reference path, #496 GDELT bounded index/checkpoint recovery, #497 empty-trend UI and #498/#499 reviewed October capex/qualified-refresh contracts remain intact. Older overlapping GDELT changes were omitted. Unrelated Tavily budget diagnostics and offline published-readout comparison/prompt polish are deferred rather than reintroducing a stale branch or expanding this package.

## Source facts and limits

The official [NVIDIA FY2027 Q2 release](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/) identifies the quarter ending July 26, 2026 and revenue of $96.221B; this establishes that the old $10.918B field cannot be treated as a current LTM total. It does not certify a reconstructed full-year total or the local commitment ledger. The [NVIDIA/OpenAI announcement](https://openai.com/index/openai-nvidia-systems-partnership/) describes a letter of intent and progressive investment tied to deployment, illustrating why future intentions are not automatically same-period signed equity commitments. Only public read-only verification was used; no project search/AI/paid provider was invoked.

No comparable current structured NVIDIA numerator is present. Source truth/completeness must be independently reviewed before adding one. ABS still lacks eligible same-instrument comparable observations. OFR measures published financial-market stress, with publication lag; it is neither a broad structural-fragility score nor a crisis forecast. Structural leverage/debt-service/valuation gaps remain explicit. Research in other working trees remains separate.

## Validation and release handoff

Run `npm run check:changed` (selects full `check:all`) and `npm run test:e2e` after source freeze. Added tests are registered in existing Bubble and pure-helper checks. Full results, source/file hashes, patch SHA256, browser screenshots and immutable commit are recorded in `manual-artifacts/radar-integration-20261104/FINAL_RECEIPT.json`; that receipt is a local deliverable, not evidence of online deployment.

The initial release scope is code/display only to `ctmaomao/gfrr-auto-update-site` through one reviewed branch/PR based on current main. Before requesting authorization, recheck main divergence and CI/review evidence. Do not silently include a full Bubble rebuild, paid editorial/search call, or data refresh. The four-source free qualified refresh intentionally does not update NVIDIA. After a separately approved full input refresh with paid fallbacks disabled, verify the new unknown/qualified NVIDIA input, exact Core-23 ranges and both deployed site artifacts. Until then the page explicitly presents an audited legacy snapshot, not a recovered live ratio.


## Additional read-only online finding: oil-news publication gap

[Snapshot run 41750364375](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/41750364375) fails two-host parity. Direct bounded reads confirm Pages/main contain the November 3 19:53:28Z file, while custom-domain/release contain 07:17:58Z. [Publisher 41707136313](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/41707136313) checked source `fa203a4a` before publishing release `76a7c4a` at 19:55:18Z. The new oil-news commit `45cc3482` arrived at 19:57:05Z. Exact SHA256 matches locate this break between main and the release repository, rather than attributing it to CDN cache.

The EdgeOne completion list omits `Refresh Oil News Event Watch`; push paths omit data files. No later publisher appears in the returned latest 30 runs at this check. Minimal candidate: separately review a successful/main-only oil-news completion listener, keeping queued latest-main checkout, fixed checked revision, full checks, no-change and 400-release quota protections. Extend `tests/unit/edgeone-source-revision.test.mjs` and the workflow checker with listener/failure/branch and quota-boundary cases. This task only diagnoses and proposes: no workflow edit, refresh or publication was executed. Two-host online acceptance remains failed until a separately approved release and actual readback succeed. Evidence: local `oil-news-publication-diagnosis.json`.


## Independent-review correction of 4771ef09: trusted NVIDIA age policy

The review reproduced a P2: a 99-day numerator could supply `freshness.maxAgeDays=9000`, pass record replay and appear qualified on the page. The correction makes the existing 30-day numerator/120-day revenue limits shared trusted contract constants in `scripts/modules/nvdaEvidencePolicy.js`. Configuration and record policy declarations must match the contract; missing or expanded limits cannot select eligibility. Both backend replay and the single-file frontend recompute numerator age at their own audit/viewing clock using the trusted 30-day value. Stored age/status cannot renew the observation. The backend additionally checks stored freshness fields against the replayed issue clock.

Tests cover widened/missing policy, a forged 99-day fresh record, matching configured policy, 29/30-day acceptance and 31-day expiry, backend/module/inline parity and actual Chromium at 1440/390px. This enforces ADR-0084's existing policy; weights, thresholds, Core-23 and production data remain unchanged. Original 4771 evidence remains at the artifact root; correction logs, fixed patch and receipt are isolated in `manual-artifacts/radar-integration-20261104/review-r2/`. No push, PR, merge, deployment, provider or production refresh is authorized by this correction.


## Independent-review correction of e7aabf7a: original proof and current eligibility clocks

The review reproduced a second P2: a valid November 3 proof of a November 1 numerator remained current on November 4, but backend replay rebuilt its historical freshness at the new issue date and rejected its unchanged fields. The correction verifies the original numerator/revenue proof at its original shared clock, then separately recomputes both ages at the current issue/viewing clock under the unchanged trusted 30/120-day limits. No proof date, age, source or record is rewritten by carry.

The shared policy helper validates both stored freshness records, shared proof-clock identity, nonfuture clocks and exact policy declarations. Backend source/period/arithmetic/light replay uses the original proof date; current eligibility is checked only after that replay passes. The frontend uses the same current-age pair and original review-date boundary. Missing/widened policy, modified original ages/clocks or future proofs remain rejected. Source truth and completeness still require the separate review described in ADR-0084.

Regression coverage includes prior-day eligibility, unchanged proof bytes, numerator 30-to-31-day expiry, revenue 119-to-120-day eligibility and 120-to-121-day expiry, tampered/future proof rejection, module/inline/Chromium parity, and the actual four-source builder plus release guard. The original four-source scope, immutable non-target carry, unknown gates and fixed Core-23 denominator remain unchanged; expired evidence causes a release hold rather than changing a carried light or silently renewing a proof. Evidence for this correction is isolated in `manual-artifacts/radar-integration-20261104/review-r3/`; both prior receipts/patches remain intact. No push, deployment, production refresh or real provider call is included.
