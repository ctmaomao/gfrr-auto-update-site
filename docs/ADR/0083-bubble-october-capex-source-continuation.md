# ADR-0083 — Bubble October 2026 quarterly evidence continuation

- Date: 2026-11-03 (Pacific/Auckland)
- Status: Owner-authorized repair; source/checker review and CI required before separate runtime activation
- Scope: continue ADR-0072's exact fixed-four quarterly association, using newly reviewed public material; no evidence/scoring threshold relaxation or paid source.

## Problem and actual evidence

The current July registry correctly rejects every newer catalog quarter. A read-only November 3 run made four requests, returned `latest_quarter_not_reviewed` four times and had zero source failures. This is an outdated reviewed event registry, not broken network access. The independent source research and remaining ABS limitation are recorded in [the source report](../BUBBLE_ABS_CAPEX_FREE_SOURCE_REVIEW_2026_11_03.md).

| Company | Reviewed latest event | Calendar-2026 guidance in USD billion | Treatment |
|---|---|---|---|
| MSFT | FY2027 Q1, October 28 | 170, compared with July's reported 175 | Decrease associated with third-party capacity timing; not a comparable raise. Re-fetch the official July document to bind the prior basis. Do not describe it as reduced economic investment or lease reclassification in this quarter. |
| META | Q3 2026, October 21 | 130–145 → 135–145, including finance-lease principal | Only the lower endpoint increased. |
| AMZN | Q3 2026, October 29 | Cash capex 220 maintained | Unchanged; no punished-raise count even if the stock falls. |
| GOOGL | Q3 2026, October 28 | Reported annual 195–205 maintained | Unchanged; fiscal-2027 spending commentary is not a calendar-2026 raise. |

MSFT's current transcript says “for the calendar year” in the reviewed October 2026 call; the current-calendar-year mapping is explicitly reviewed here, not inferred for arbitrary future calls. Both current and July official documents preserve finance-lease recognition. Stock Analysis provides the attributed transcript clauses; issuer material independently confirms the event and timing, and MSFT/META/AMZN amounts. The Alphabet CEO article supplies event identity and its actual publication timestamp; the CFO amounts remain attributed secondary-transcript facts, as in ADR-0072. This does not certify first disclosure or capex causality.

## Strict new proof, retained legacy path

Add a separate `bubble-quarterly-capex-panel-v2` proof with fixed `registryId=2026-10-reviewed`. The original v1 collector, replay, fixtures, r3/r4 hold branches and runtime builder selection stay intact. The new adapter is offline by default and is not imported by the runtime builder in this source PR. There is no config activation, workflow mutation or production write.

The new replay admits exactly these four catalog identities, quarters, event dates, reviewed current/prior ranges and accounting bases. Newer/ambiguous catalogs and changed clauses hold. It reconstructs the same complete regular-session windows using the unchanged 2026 calendar, matched adjusted prices, fixed-four decision and exact ±5pp comparisons. No smaller sample, time/date substitution, neutral-as-green inference or rolling-return fallback is admitted.

Catalog conference/AGM links are outside this quarterly-association scope, not additional eligible guidance events. Every earnings-call-labeled or quarter-shaped transcript link must parse, including single-quoted hrefs; an unfamiliar new-quarter ID must hold rather than silently falling back. This does not claim complete interim-guidance discovery.

Require 20 unique successful requests in a complete proof: the existing 19-source structure plus the official MSFT prior comparison. The original maximum stays **20 requests**, 12 seconds/request, 2MiB/response, 12MiB cumulative streaming limit, no redirects/application retries, host-wide 401/403/429 circuit. One QQQ response is shared by all four pairs. Sources use only the existing HTTPS host allowlist; Amazon uses its public newsroom and public press-center schedule. An `ir.aboutamazon.com` research request returned403 and was not retried or proxied; that host is not admitted or used as runtime fallback.

GOOGL's anchor is the actual official remarks publication `2026-10-28T21:05:00Z`, not July's20:45 timestamp or an invented first-disclosure clock. META's release metadata `2026-10-21T21:01:00+01:00` is the same instant as16:01EDT; require that instant and the official16:30EDT call. MSFT/AMZN anchors remain their officially announced calls. All selected sessions must already be complete and isolated. Original dates remain October21/28/29, not collection dates.

Strict allowed-key validation remains at panel/company/catalog/guidance/timing/window/price/request/budget levels. Add a bound MSFT comparison URL/digest in timing; reject arbitrary source approvals, raw bodies, credentials, changed budgets or unsupported registry IDs. Digests bind the stored material but do not independently prove publisher authenticity. Only freshly collected and replayed runtime output may publish; ignored research cannot be promoted.

The existing publication validator's v1 date assertion remains for v1; a v2 proof must pass the separate full replay and use the October registry's original observation date. This is an explicit source/checker admission PR, not a presentation patch. Existing negative assertions and unsupported-version behavior remain; no skip/ignore is added.

## Results and remaining boundaries

Actual free local collection:20 requests,4,832,033 bytes, no failures, four qualified rows, full replay pass. One raise (META), zero punished or rewarded raises, yellow under the **unchanged** ADR-0072 rule. META excess return was approximately−4.1191pp; Alphabet's approximately−11.2258pp decline does not count because its guidance was unchanged. These are descriptive latest-vintage historical daily-close associations, not a predictive validation or causal effect.

ABS admission/config/scoring is untouched. Public issuance spreads, sector annual changes, prices without matched yields and coupon/rating data cannot replace the required same-bond/same-tranche USD market observations with same-day tenor-matched benchmark and4/12-week baselines. No new ABS source is approved by this decision.

After this contract is reviewed, tested and merged, a separate runtime PR may explicitly select the new adapter and publish the existing qualified-only four-indicator freshly collected refresh while preserving the other23 cards and their original observations. Source/price failure must refuse that targeted publication. ABS, insider, capex and Fed evidence must retain the existing same-check-day proof; do not carry or relabel their old check clocks as a new date. Normal weekly operation may retain the canonical pending fallback, with failures disclosed. A changed scoring snapshot invalidates the old exact-current AI binding; do not relabel it or dispatch a paid replacement under this free-only task.

## Verification

Preserve all legacy tests, add actual-adapter offline tests and tampering checks for every proof layer, source circuits/budgets, latest-quarter holds, accounting/time semantics and unchanged decision boundaries. Run `check:changed`/`check:all`, fixed-head Codex review under the owner's designation, and CI. Runtime activation and two-site acceptance follow in the separate runtime PR. No production dependencies or paid/provider calls.

## Separate runtime implementation

Source PR #498 merged at`d7ceafdc` after CI41558518704 passed. The separate runtime continuation explicitly selects the October collector for snapshot dates from2026-10-30; older historical July fixtures keep the original adapter. The first eligible last-event session remains subject to the unchanged complete-session isolation; selecting the adapter does not make that day's material eligible automatically.

Use the existing `--refresh-qualified-only` path, default ignored candidate and explicit `--publish-qualified`, to freshly check ABS/insider/capex/Fed. Preserve23 other cards, their original observations, both carried chart panels, all older model/history rows and the immutable complete-refresh anchor. Only normal staleness aging of carried research cards may change. A separate publication guard requires full October proof, zero source failures/paid fallbacks, no loss of already-known insider/Fed evidence, current clocks and removal of old exact-bound AI. It seals the two working-tree outputs against HEAD and rejects any other tracked/staged/untracked writes before commit.

The new main-only manual `Refresh Bubble Qualified Evidence` uses the shared main-writer concurrency, injects no external provider/source secret and disables Wind. It freshly collects once, runs`check:all` and the release guard, commits only the two Bubble files and requests the existing guarded EdgeOne publisher. Its GitHub token has contents/write and actions/write solely for this authorized data/deployment path; GH_TOKEN is scoped to the final publisher-dispatch step. Pages registers the new producer by workflow_run. The existing EdgeOne trigger list, quota/no-change/validation gates and all editorial triggers are unchanged. There is no schedule, AI workflow dispatch, paid key or manual-artifact promotion.
