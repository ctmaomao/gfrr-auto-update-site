# Route-Level Tanker Freight Source-Rights Artifact Review - v1

> **Manual source-rights artifact review helper only.** This document defines a
> local review helper for operator-supplied source-rights evidence. It exists so
> a future licensed route-level tanker freight source can be reviewed in a
> structured way before any gate update is considered.
>
> Current result: the helper can only write ignored manual review artifacts. It
> does not approve the source-rights gate and does not write production data.

---

## 1. Review Contract

The review output schema is:

```text
route-level-tanker-freight-source-rights-artifact-review-v1
```

The local helper is:

```text
review:route-level-tanker-freight-source-rights-artifact
```

It may read only:

- `manual-artifacts/route-level-tanker-freight/*.json`
- tracked fixtures under `docs/fixtures/`
- the source-rights approval template fixture
- the current blocked source-rights gate fixture

It may write only ignored artifacts under:

```text
manual-artifacts/route-level-tanker-freight/
```

---

## 2. What It Can Decide

The helper can say whether an operator-supplied artifact is structurally
reviewable:

```text
claimsReadyForSeparateGateReview=true
```

That means only that the evidence can be brought into a later separate reviewed
gate update. The current helper must keep:

```text
gateUpdateApproved=false
productionWriteApproved=false
routeFreightConfirmation=not_connected
sourceRightsStatus=manual_review_required
```

Fixture inputs are never usable for a gate update, even if they contain complete
example fields.

---

## 3. Boundaries

This helper does not approve:

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

Any output that treats a review artifact as production approval is invalid.

---
