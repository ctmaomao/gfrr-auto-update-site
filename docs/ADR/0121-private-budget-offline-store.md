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

Synthetic tests cover fixed identity/visibility, changed privacy after read, failed metadata, redirection, constant errors/status, two-key same-head CAS, forged snapshots and missing refs. Existing ledger tests continue to exercise ancestry, clock drift, price expiry and debt retirement on the unchanged shared algorithm. Real remote permissions and private production wiring remain untested.
