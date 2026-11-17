# ADR-0121: Private budget store, offline integration only

- Date: 2026-11-17
- Status: Offline implementation; no production activation

## Decision

Reuse the existing DeepSeek accounting and Git transport, rather than fork a second ledger. The old public factory retains its fixed target and behavior. A separate `createPrivateGithubLedger` factory binds only the dedicated private repository identity; it requires an explicitly supplied transport and reads no environment configuration. No workflow, CLI, runtime selection, provider callback or initialization is added.

Before every private Git operation, including transmission of ledger bytes, verify repository ID, exact owner/full name and `private === true` using the same bounded, no-redirect, clock-checked transport. Missing identity, rename/transfer, visibility change or metadata failure stops the operation. Administrator changes after a successful check remain a race this client cannot prevent; private visibility does not exclude already-authorized Apps.

The internal shared transport retains pinned genesis, complete ancestry, single-parent transitions, rollback detection, authenticated snapshots, non-force CAS and response/dispatch clock checks. It cannot initialize or repair history. Private errors are reduced to a constant HOLD code. `verifyPrivateBudgetStatus` exposes only `eligible_snapshot_only` or `hold`; neither is a reservation or permission to dispatch. Store snapshots still contain private evidence and must not be logged, published or passed to the existing verbose CLI/report path.

## Boundaries and next gate

Tests inject a fake GitHub service; explicit injection is not a network sandbox. Production entry points do not reference the new APIs. No credentials, genesis, old debt, provider call or financial evidence is created or changed by this patch.

Before any separate activation: establish least-privilege access, reconcile all old one-shot/private-claim/monthly liabilities, bind both approved keys/environments to one ledger, explicitly restrict permitted invocation modes and replace verbose public reporting. Retain pending-request HOLD, full reservations, 31 days plus 152 seconds retirement and independently current price evidence. Do not infer these conditions from the existence of a private repository or a passing offline test.

## Verification

Synthetic tests cover fixed identity/visibility, changed privacy after read, failed metadata, redirection, constant errors/status, two-key same-head CAS, cross-key aggregate ceiling through fresh clients, 400-day unknown-debt HOLD after price-review renewal, unapproved-consumer/expired-price rejection, forged snapshots and missing refs. Existing ledger tests continue to exercise ancestry, clock drift, price expiry and debt retirement on the unchanged shared algorithm. Real remote permissions and private production wiring remain untested.

## Public-output hardening (still no private-store wiring)

The existing monthly CLI now prints only the snapshot admission projection, while retaining its original eligibility decisions and exit codes. Public preflight reasons use a finite allowlist; other exception strings become `deepseek_budget_status_unavailable`. Production monthly logs project internal reports to fixed status values without consumer, reservation ID or amount; internal callbacks and accounting are unchanged. Existing one-shot/receipt status JSON is outside this monthly-output change.

Actions refuses all three sensitive `--prepare-*` ledger-output modes before reading input files; explicit local offline preparation remains available. Static plan modes are unchanged. Tests capture stdout/stderr, step outputs and summaries, reject arbitrary error codes, preserve expected-skip semantics and verify zero provider/writer activity. This hardens existing output paths, not permission to use the private store or restore any budget.


## Offline lifecycle candidate (not activation)

The authorized follow-up narrowly supersedes the original no-initialization-API
boundary for the explicit offline-only factory below, not for existing stores or
production entry points. It adds explicit-injection factories in the same module;
no workflow, environment reader, CLI or `withDeepSeekBudget` route changes.
`createPrivateQuarantineInitializer` accepts only an independently pinned whole
ledger with full-cap quarantine, no entries and one current price review. Its
cutover must be at or after factory creation, no more than five minutes old, and
not in the future. Every operation revalidates the immutable candidate and price
expiry, including after repository metadata and before transmission. A digest
binds bytes, not truthful history: all-requests-finished and disabled-ungated-path
assertions still require independent evidence approval outside this helper.

The initializer checks absence, creates a parentless commit containing only
`usage.json`, authenticates commit/tree/blob readback against the approved bytes,
then uses create-ref POST and reads back the exact fixed ref. It never updates,
forces, deletes, repairs or retries. Every invocation consumes the local helper
instance even on failure. Concurrent create or lost acknowledgement is HOLD;
inspect remotely before any later operator action. Failed preparation can leave
unreachable trees/commits; failure after ref creation may leave the quarantined
ledger. This is not an atomic zero-write operation. No initializer has a provider
or balance callback. Privacy is checked before each operation, but administrator
changes between check and request remain an acknowledged external race.

`createPrivateBudgetRuntime` requires explicit transport and balance functions,
fixed private repository/genesis, independent config digest, price digest and
exact key-hash/environment/consumer/mode tuples. It snapshots config and context;
no allowlist Cartesian product, key rotation fallback, environment lookup,
logging or default network is added. Its errors are constant HOLD. Tuples identify
approved bindings, not authorization by themselves; future wiring must verify
the real environment rather than trust a caller-supplied label. Existing budget
reservation/CAS/unknown-debt/expiry logic remains unchanged. Full quarantine
blocks both balance and provider callbacks; passage of a new calendar month is
not a reset. The strengthened static test also excludes these new factories from
production imports. Synthetic lifecycle tests are not live permission or financial
evidence verification. Initialization, credentials, real wiring and activation
remain unperformed and require separately completed gates.
