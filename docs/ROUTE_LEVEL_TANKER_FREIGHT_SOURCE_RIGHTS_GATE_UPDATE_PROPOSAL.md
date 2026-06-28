# Route-Level Tanker Freight Source-Rights Gate Update Proposal - v1

> **Dry-run gate update proposal only.** This document defines a local helper
> that can turn a reviewed source-rights artifact into a proposed gate-update
> summary for human review.
>
> Current result: the helper writes only ignored manual artifacts. It does not
> update the source-rights gate fixture and does not approve production writes.

---

## 1. Proposal Contract

The proposal output schema is:

```text
route-level-tanker-freight-source-rights-gate-update-proposal-v1
```

The local helper is:

```text
project:route-level-tanker-freight-source-rights-gate-update
```

It may read only:

- source-rights artifact review outputs under `manual-artifacts/`
- tracked fixtures under `docs/fixtures/`
- the current source-rights approval gate fixture

It may write only ignored artifacts under:

```text
manual-artifacts/route-level-tanker-freight/
```

---

## 2. What It Can Propose

For a real non-fixture artifact that is already marked
`reviewable_pending_separate_gate_update`, the helper may emit:

```text
proposalReadyForHumanGateReview=true
```

That means a human can review whether to edit the source-rights gate in a later,
separate PR. This helper itself must keep:

```text
gateUpdateApproved=false
writesGateFixture=false
productionWriteApproved=false
routeFreightConfirmation=not_connected
sourceRightsStatus=manual_review_required
```

Fixture-only reviews must remain blocked as:

```text
fixture_only_proposal_keep_gate_blocked
```

---

## 3. Boundary

The helper does not approve:

- source-rights gate updates
- live fetch
- API key reads
- route-value redistribution
- production data write
- frontend implementation
- workflow automation
- Worker runtime
- route-level confirmation
- ODP `finalBias`
- Brent promotion
- scoring / decision / execution / position

Any output that mutates the gate fixture or treats a proposal as approval is
invalid.

---
