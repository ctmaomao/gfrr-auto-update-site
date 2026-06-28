# Route-Level Tanker Freight Source-Rights Gate Update Proposal Review - v1

> **Manual proposal review only.** This document defines a local reviewer for
> source-rights gate update proposal artifacts.
>
> Current result: the reviewer can confirm whether a proposal is shaped for
> later human review, but it cannot apply the proposal or update the gate.

---

## 1. Review Contract

The review output schema is:

```text
route-level-tanker-freight-source-rights-gate-update-proposal-review-v1
```

The local helper is:

```text
review:route-level-tanker-freight-source-rights-gate-update-proposal
```

It may read only:

- proposal outputs under `manual-artifacts/`
- tracked fixtures under `docs/fixtures/`
- the current source-rights approval gate fixture

It may write only ignored artifacts under:

```text
manual-artifacts/route-level-tanker-freight/
```

---

## 2. What It Can Confirm

For a real non-fixture proposal marked `ready_for_human_gate_update_review`, the
reviewer may emit:

```text
humanGateUpdateReviewReady=true
```

That still means only that a later human-authored PR may be prepared. This
reviewer must keep:

```text
applyApprovedByThisReview=false
writesGateFixture=false
productionWriteApproved=false
routeFreightConfirmation=not_connected
sourceRightsStatus=manual_review_required
```

Fixture-only proposals must remain:

```text
fixture_only_review_keep_gate_blocked
```

---

## 3. Boundary

The reviewer does not approve:

- applying a gate update
- source-rights gate fixture edits
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

Any output that treats a proposal review as a source-rights approval is invalid.

---
