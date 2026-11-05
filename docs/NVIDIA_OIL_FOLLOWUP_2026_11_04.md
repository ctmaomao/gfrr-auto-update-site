# NVIDIA evidence and oil-news publication follow-up — 2026-11-04

## Authorized scope and baseline

The owner requested completion of the NVIDIA comparable evidence and two-site oil-news synchronization work, plus daily Actions diagnosis. This follow-up authorizes local implementation, tests, commits and independent review. A new push, PR, merge or deployment needs confirmation of the concrete package. No paid/source-provider invocation, production refresh, permission expansion or evidence-gate relaxation is authorized here.

The clean task branch `codex/oil-news-publication-followup-20261104` starts at published main `f42a79cf8d7441df0bc11564252579beadfcb9f3` (PR #500). The original E: research workspace remains untouched. Recent project chat was checked: ABS/capex research and the earlier NVIDIA eligibility package are preserved; no later complete NVIDIA signed-commitment ledger was found.

## NVIDIA: evidence obtained and exact remaining gap

The [fixed primary-source pack](fixtures/nvda/primary-evidence-20261104.json) contains issuer, USD-million scale, exact fiscal dates, original URLs, publication dates, table locators and separate business definitions. These are manually reviewed original disclosures, not an automatically certified feed or an accepted production numerator.

| Fiscal quarter | Period end | Revenue, USD million | Original disclosure |
|---|---|---:|---|
| FY26 Q3 | 2025-10-26 | 57,006 | [NVIDIA release](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-third-quarter-fiscal-2026) |
| FY26 Q4 | 2026-01-25 | 68,127 | [NVIDIA release](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2026) |
| FY27 Q1 | 2026-04-26 | 81,615 | [NVIDIA release](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-first-quarter-fiscal-2027) |
| FY27 Q2 | 2026-07-26 | 96,221 | [SEC earnings exhibit](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27pr.htm) |

Four adjacent quarters cover 2025-07-28 through 2026-07-26. Their direct sum is **302,969 million USD**. A separate disclosed-period bridge is **215,938 + 177,837 − 90,805 = 302,970 million USD**. The **1 million USD difference remains unresolved**; the audit preserves both methods and does not patch a source value, invent precision or relax the active exact-conflict gate. The latest quarter is 101 days old on November 4. Re-reading it does not renew the existing 120-day limit; November 24 would be day 121 without a newer observation. [FY26 annual disclosure](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2026), [FY27 Q2 disclosure](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27pr.htm).

Original materials also establish actual financing exposure, but with distinct definitions:

| Disclosed amount | Actual basis | Why it cannot fill the current comparable numerator |
|---|---|---|
| 99B USD | Equity investments held at July 26 | Stock at a date; lacks complete same-period customer signing flows |
| 25B USD | Future equity investment commitments at July 26 | Outstanding future balance, not new commitments signed during the LTM |
| Up to 105B USD | Conditional SB Energy/OpenAI lease guarantee signed in August | Guarantee cap, not equity; after the revenue period |

These three amounts are separately disclosed in [NVIDIA FY27 Q2 10-Q, Note 10 and MD&A](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000075/nvda-20260726.htm). They are not added together.

Useful individual original announcements are [CoreWeave's reported 2B stock investment](https://nvidianews.nvidia.com/news/nvidia-and-coreweave-strengthen-collaboration-to-accelerate-buildout-of-ai-factories), [OpenAI's announced 30B NVIDIA participation](https://openai.com/index/scaling-ai-for-everyone/) and [Anthropic's up-to-10B NVIDIA investment](https://www.anthropic.com/news/microsoft-nvidia-anthropic-announce-strategic-partnerships). The [earlier up-to-100B OpenAI intention](https://nvidianews.nvidia.com/news/openai-and-nvidia-announce-strategic-partnership-to-deploy-10gw-of-nvidia-systems) is kept separately. Announcement dates, closed purchases, future ceilings and signed commitments cannot silently substitute for each other, and the OpenAI announcements cannot be presumed additive.

The missing item is a complete, reviewed, customer-only set of binding equity commitments signed during the same LTM, with original signed dates, USD amounts, conditions/cancellations, replacement treatment and deduplication across rounds. Individual transactions do not establish coverage completeness; missing coverage is not zero. The existing 30-day ledger policy also requires a current substantive review. The current curated text ledger remains unqualified, NVIDIA remains **待核验**, and Core-23/scoring are unchanged. This audit does not claim to have completed the requested reliable ratio.

Reproduce the offline arithmetic and gaps without any source request:

```powershell
node scripts/review-nvda-primary-evidence.mjs 2026-11-04
node --test tests/unit/nvda-primary-source-audit.test.mjs
```

The audit module is not imported by builders, validators or the frontend. Its report always has a null ratio, unknown numerator, `productionEligible=false`, `changesScore=false`, zero network calls and zero production writes. OpenAI/Anthropic pages are manual original-counterparty context here, not newly admitted runtime sources. An equal arithmetic bridge would still not admit a numerator.

## Oil-news: root cause and narrow fix

The November 3 publisher started before the producer committed: the earlier publisher checked `fa203a4a`, release `76a7c4a` was pushed at 19:55:18 UTC, and the new oil snapshot committed to main as `45cc3482` at 19:57:05 UTC. Custom-domain bytes matched the release; Pages bytes matched main. Thus a successful publisher could still leave the sites on different news snapshots. The later PR #500 publisher restored parity, while the omitted oil-news completion listener remained in main.

The patch adds exactly `Refresh Oil News Event Watch` to EdgeOne's completed-workflow listeners. It retains the other four listeners, main/success filtering, latest-main checkout, checked-SHA attribution, immutable validated source, three-hour backup, serialized publication, no-change skip, 400/32-day guard and separate release deploy key. It does not add a generic data-push trigger or invoke collection/search. [ADR-0085](ADR/0085-oil-news-publication-completion.md) exposes the exact checker/test admission changes.

Read-only acceptance includes the current two public files, release repository file and local main hashes/dates; that confirms the current recovery, not that this new patch has shipped. A local Git fixture reproduces the timing race and checks the post-completion latest-main checkout. Workflow tests also reject missing/renamed listeners, failed/non-main admission or removal of source/quota protections.

## Validation, review and proposed publication

The delivery receipt records actual commands, exits, tests, immutable commit/tree/patch hashes, independent Codex AI review and live readback. Required local validation is `npm run check:changed` (full check selection), workflow regression and the offline NVIDIA regressions. No UI or production payload changes are in this follow-up; source replay and workflow behavior are the targeted checks. No source/AI workflow is rerun to test a listener.

After separate owner approval: re-fetch current main, check for overlap, safely integrate only this reviewed package, rerun affected checks if the tree changes, push the named branch to `ctmaomao/gfrr-auto-update-site`, create a draft PR, and await CI plus independent fixed-tree review. Only then merge under the applicable rules and observe existing Pages/EdgeOne publication. Confirm checked-source SHA, release commit and both actual oil-news hashes/dates; do not dispatch the producer or any provider. A no-change publication can validly skip. This does not publish a numeric NVIDIA ratio.

Daily Actions inspection is already enabled in the parent conversation as `检查金融雷达 Actions` (`6aeb0349adc4819184a401e03d89da68`), daily around 09:00 Pacific/Auckland. It diagnoses/fixes within authority and keeps separate confirmation for remote publication, paid calls and production refreshes. This task does not create a duplicate schedule.
