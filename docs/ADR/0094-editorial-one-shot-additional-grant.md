# ADR-0094: Bounded additional editorial generation grant

- Status: local implementation; independent review and activation pending.
- Date: 2026-11-09.
- Baseline: [ADR-0090](0090-shared-editorial-budget-and-free-search.md).

## Decision and authorization

The owner authorized one additional Macro Risk attempt and one additional Bubble Watch attempt, together at most CNY 4.33, without retries. Historical project spending is unknown. This is additional authorization, not proof that earlier spending was zero or within the original CNY 5 monthly cap.

The separate fixed grant `editorial-additional-20261109-cny433-v1` expires at **2026-11-30T00:00:00.000Z**. It uses a separate create-only genesis on `deepseek-editorial-one-shot-20261109`, with independently pinned genesis SHA and grant digest. Its grant also binds one exact `initializationParentSha`; genesis must have exactly that single parent, empty entries and one review. The parent identifies initialization only, not prior spending. Traversal still stops at the pinned genesis. This narrow exception permits initialization through the existing connector without new credentials; the ordinary monthly ledger still requires parentless genesis. A new month, rotated key, new run, new price review or successful/failed response cannot reset either consumer's single slot. No settlement, refund, deletion, or automatic reinitialization exists. Administrative rewriting of anchors/code/history remains outside the cooperating-client guarantee, as in ADR-0090; operators must never replace those anchors to reuse this grant.

The unchanged price/request policy reserves CNY 2.161152 for each attempt, CNY 4.322304 for both. Rates are peak CNY 2/input-million and CNY 8/output-million; model alias `deepseek-v4-flash`, response alias `deepseek-flash`, output maximum 8000 and disabled thinking remain. Current independently reviewed official-price evidence, matching the exact policy digest, expires within 24 hours; balance, request and receipt checks are shared with the ordinary gate. The generic response alias does not pin the underlying model version. A balance proves currency only, never historical spend.

The two existing production workflows expose a manual `budget_selection` choice defaulting to `monthly`. Only explicit selection of this exact grant, in the matching main-branch workflow's first `workflow_dispatch` attempt, activates it. Workflow-run/scheduled events always retain the ordinary budget path. Missing, malformed or unknown selection/configuration never falls back to a more permissive path. The manual-artifact test is not an eligible consumer or production path.

Before searches, read-only preflight verifies grant, history, consumer, price and expiry. Before the sole generation POST, the same gate rechecks those conditions, checks currency, then appends a full reservation using the existing bounded-clock non-force GitHub CAS transport. Contention or an uncertain acknowledgement sends nothing. Expiry or changed request between reservation and dispatch sends nothing and retains the reservation. Success retains the full amount forever for this grant. Unknown/failed outcomes also hold the other consumer; a successful output with an uncertain outcome write is not returned for promotion. There is no retry or refund. Timestamp admission includes the existing 76-second clock/transport margin.

## Narrow relationship to existing contracts

ADR-0090's ordinary monthly gate, historic bootstrap requirements and assertions remain unchanged. This ADR permits only an explicit, separately funded one-shot path in the existing Macro/Bubble production workflows. It does not allow automated November calls, initialize the ordinary ledger with zero history, or change source/freshness/fact/quality/scoring/data-only-writer rules. The shared GitHub transport extraction keeps its normal default validator and branch; one-shot selects its own strict validator and branch. No existing test assertion is removed or weakened.

Free-only Tavily/Brave admission, Macro day/input deduplication, Bubble input readiness, validator and production writer gates remain. A generation may fail these later gates and produce no publishable article; its attempt still cannot be repeated. PR #517 is included in the integration baseline; Bubble input freshness remains an independent prerequisite, not bypassed here.

## Verification and activation

Offline tests are included in `check:deepseek-budget`, which remains reachable from the full suite. They cover separate accounting, per-consumer limits, races, lost writes, failures, expiry, invalid configuration and request/receipt protection. The original monthly tests remain intact. Local passes do not authorize a live call or prove production configuration.

See the [activation runbook](../OPERATIONS.md#one-shot-additional-editorial-grant) for offline preparation and the separately controlled activation sequence. This implementation does not initialize a remote ledger, configure credentials, trigger searches/provider calls, run CI, or change production data.
