# ADR-0111: Brave shared provider-enforced free-only admission

## Status

Proposed, local implementation. Independent review, integration, key binding and explicit ledger activation remain separate. No real account identifiers, credentials or dashboard evidence are committed here.

## Context

The owner requested repair of Brave free-credit records and explicitly permits only free Brave/Tavily use. One account key does not establish repository-exclusive use. ADR-0090 v1 therefore remains unavailable when exclusivity is unproved. A plan-wide provider-enforced free-only limit can protect shared consumption without pretending the project can observe or reserve other applications' requests.

[Official FAQ](https://api-dashboard.search.brave.com/documentation/resources/help-feedback) distinguishes existing postpaid charging from prepaid credits and describes plan usage limits. Neither zero out-of-pocket usage nor a rate-limit header proves free-only enforcement. The actual account must show the enabled, saved free-only limit, its application to all keys on the identified Search plan, and provider refusal of usage beyond that limit. Do not infer a paid input's meaning from a dollar amount or migrate the account to another plan.

## Decision

Add a distinct `brave-budget-v2` ledger and `provider_enforced_free_only` grants. Preserve the exact v1 exclusive-key validation, fields and interpretation. No automatic conversion, mixed grants, overwritten history or alternate ledger branch is supported.

A v2 grant has exactly: `id`, `keyId`, `scope`, `source`, `evidenceSha256`, `accountPlanBindingSha256`, `verifiedAt`, `expiresAt`, `protectionEndsAt`, `requestLimit`, `freeOnlyEnabled`, `hardStopConfirmed`, `plan`, and `accountObservation`. The initial supported plan is `search_postpaid`; source is `owner_dashboard`. Both free-only and hard-stop assertions must be true. Hashes bind independently reviewed private evidence and account/plan/key association; syntactic hash validation is not a live provider check or proof that evidence is genuine. Do not prepare real hashes until evidence and key binding are verified. For `accountPlanBindingSha256`, hash UTF-8 `JSON.stringify([accountStableId, planStableId, keyId])` in that exact order; use verified service identifiers unchanged and the actual 16-hex key fingerprint. Keep the account/plan identifiers and canonical input private. This stable binding excludes observation time, usage and settings snapshots. `evidenceSha256` separately hashes the reviewed private evidence for this verification and may change on renewal.

The account observation has exactly `source`, `observedAt`, `requestsUsed`, `usageCostUsd`, `outOfPocketCostUsd`, and `monthlyFreeCreditUsd`. It must be contemporaneous with verification, show zero out-of-pocket cost and positive remaining observed free credit. USD observations are two-decimal strings, not exact billing totals or an exchange-rate conversion. Never infer project history from account usage or invert rounded dollars into request counts.

Each grant allows at most 950 recorded project reservations. The existing 950/31-day recorded-reservation counter spans all grants and all four consumers, including manual execution. The provider's plan-wide hard limit, not that project counter or an account snapshot, prevents shared applications from entering paid usage. Other applications may exhaust availability sooner. Summary exposes project remaining requests, dated account observation and `providerRemainingRequests=unknown`; v2 never claims `remainingVerifiedRequests` as an account balance. Expired/held grants are not current eligibility even if their numeric project remainder is positive.

`expiresAt` must be after verification, within 31 days, and no later than the independently reviewed `protectionEndsAt`. That boundary may be deliberately earlier than an ambiguous displayed billing date; it is not a fabricated billing timezone or exact period end. No clock or calendar inference renews evidence. Continue the monotonic 30-second dispatch deadline and trusted server-time expiry margin. Changes in the key, plan binding, evidence, free-only protection or an uncertain provider state require a new review or hold, not automatic refresh.

Initialization is explicit `--initialize-shared --grant-file <private-file>` and create-only on the existing `brave-usage-ledger` branch. It records `recordingStartedAt` from the authoritative initial GitHub 404 Date and `historyBeforeRecording=unknown`. Empty recorded entries mean only no entries since recording began. A 404 alone does not prove a ledger never existed: operators must establish first initialization, never recreate deleted history. Existing v1 or v2 state refuses initialization. Further grants use the existing append-only activation path; key/account-plan rotation is refused.

The narrow v2 supersession of ADR-0090 and the corresponding Operations/Data Sources wording is: exclusive repository ownership and known global remaining requests/history are not required for fee protection when the reviewed provider-enforced free-only plan protects every request. Unknown pre-recording history remains explicitly unknown and is not invented, imported or reset. All v1 requirements remain unchanged. Pending requests, unknown outcomes, invalid evidence, expiry, invalid/corrupt/missing state and quota rejection still hold. This exception does not weaken Tavily, paid budgets, consumer inventory, source quality, no-retry or publication rules.

## Key-binding diagnostic

The existing manual Tavily status workflow gains an explicit `operation` choice. Default remains `tavily-status`; the isolated `brave-key-fingerprint` job runs only on main with exact `github.sha`, read-only contents and non-persistent checkout credentials. Only its diagnostic step receives `BRAVE_API_KEYS` and `BRAVE_API_KEY`. This is an explicit new secret-consuming step requiring independent review; no provider, ledger, package installation or generation command is run.

The offline `review:brave-budget -- --key-fingerprints` mode splits newline/comma/semicolon, trims and deduplicates each variable, then emits only SHA-256 first-16 fingerprints, counts, missing flags and their combined set. Internal whitespace is refused because the CEO consumer splits additional whitespace; ambiguous production parsing must not be attested as equivalent. No raw key, prefix, suffix, length or exception object is logged. Workflow dispatch and private browser comparison are separate operational steps; code delivery does not perform them.

## Consequences and validation

The shared mode trades an impossible claim of account-wide local accounting for an explicit provider-enforcement dependency. Evidence is a dated reviewed snapshot, not permanent access to settings. Do not claim continuous revalidation without an actual supported mechanism; if protection changes or becomes unknown, stop. New months never clear reservations, pending debt or quota holds, and grant renewal never refunds history.

Offline regressions cover strict v1/v2 separation, missing evidence, unknown versus zero history, cross-grant caps, key/account binding, durable failures, CAS uncertainty/races, clock expiry, actual consumer transports, create-only initialization and isolated secret diagnostics. All test transports are synthetic; the free-search suite installs a rejecting default fetch guard. Full repository checks and independent actual-diff review remain mandatory. No new workflow, provider request, paid call, production-data edit or real evidence fixture is authorized by this ADR.
