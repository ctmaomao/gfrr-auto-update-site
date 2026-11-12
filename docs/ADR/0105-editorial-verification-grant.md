# ADR-0105: A separately approved two-page verification grant

- Date: 2026-11-11
- Status: Implementation under independent review; activation and live verification pending
- Scope: Existing Macro Risk and Bubble Watch production editorial workflows only

## Decision and acceptance baseline

The owner approved one new DeepSeek attempt for each page, with a combined maximum of CNY 4.33. The two attempts authorized under ADR-0094 are already consumed. This approval does not reset them, permit retries, expand recurring spending, or prove generation/publication successful.

Add the fixed selection `editorial-verification-20261111-cny433-v1`, fixed branch `deepseek-editorial-verification-20261111`, and separate `DEEPSEEK_VERIFY_20261111_{GENESIS_SHA,GRANT_SHA256,PRICE_REVIEW_SHA256}` pins. It expires at 2026-11-13T00:00:00.000Z. Old exports, grant, branch, pins and history stay valid and unchanged. Automatic/default selection remains `monthly`; unknown selections cannot fall back.

The existing reviewed model/request/price policy is reused without modification. One permanent reservation is 2,161,152 micro-CNY, conservatively accounting for the entire 1,048,576-token input context at CNY 2 per million plus 8,000 output tokens at CNY 8 per million. Two reservations total CNY 4.322304, below CNY 4.33. This is a ceiling under the freshly reviewed vendor contract, not an assertion of actual cost or a guarantee against a vendor changing its contract. If the exact official price/model/limit contract differs, hold before activation; do not invent an override.

## Isolation and safeguards

- A fixed descriptor binds the selection to its policy, branch and variable prefix. Runtime input cannot choose arbitrary branches, prefixes, amounts, expiry or models.
- Every store read, including genesis and intervening history, and every transition validates against the selected grant. A new selection cannot accept an old ledger, even with matching external pins. Authorization evidence and the exact initialization parent are separately approved in the grant digest.
- A process pins its complete runtime identity. Changing grant, consumer, anchor, review, approval, run or token cannot reuse a cached gate or start another after failure.
- Both existing workflows receive the new three non-secret pins only at budget preflight and provider steps. Main, exact workflow, explicit first-attempt manual dispatch, normal acknowledgements, bounded CNY-only balance read, CAS reservation, one call and no retry remain mandatory.
- A failed or uncertain attempt permanently consumes its slot. Missing/failed receipts hold the other consumer. No refund, ledger replacement, spent-slot migration or automatic fallback exists.
- Shared free-search limits, Macro per-day/per-input deduplication, source qualification, output/fact/quality/freshness checks, data-only writers and production publication controls are unchanged. No standalone balance probe or manual artifact promotion is added.

## Activation and verification

Follow [the one-shot runbook](../OPERATIONS.md#one-shot-verification-editorial-grant). Deploying the code and preparing a ledger do not call the provider or activate the grant. Independently review new authorization and current official-price evidence, create the separate genesis only if absent, verify its parent/tree and pin the exact approved digests through existing authorized access. Never copy old pins or recreate a grant that exists.

At the initial 2026-11-11 inspection, Macro's 2026-11-10 Daily input was already claimed. Wait for a legitimate fresh unclaimed Daily input; do not delete tags, edit clocks or rerun a consumed input. Inspect the current state again before each dispatch. If UI/variable/dispatch access remains unavailable, stop that action and report it; code publication is not live validation.

Offline tests cover old spent history remaining spent, two independent new slots, cross-grant approvals/transitions/genesis/history, exact runtime selection, cached-gate mutation, races, uncertain writes, lost receipts, failure holds, currency/funding, request mutation, clock/expiry, CLI plans and four workflow pin blocks. Existing tests and validators are preserved. Independent review, complete checks, exact-head CI and normal deployment remain required. Final delivery must distinguish provider attempt, factual quality, publication on each site and verified cost from reserved cost.
