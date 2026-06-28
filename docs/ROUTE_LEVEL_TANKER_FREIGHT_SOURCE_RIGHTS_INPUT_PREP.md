# Route-Level Tanker Freight Source-Rights Input Prep - v1

> **Manual input prep only.** This helper creates a local source-rights input
> draft for later operator editing.
>
> Current result: it grants no approval and cannot update the source-rights
> gate.

---

## 1. Prep Contract

The prepared input schema is:

```text
route-level-tanker-freight-source-rights-input-v1
```

The local helper is:

```text
prepare:route-level-tanker-freight-source-rights-input
```

The read-only guide helper is:

```text
guide:route-level-tanker-freight-source-rights-input
```

It emits:

```text
route-level-tanker-freight-source-rights-input-guide-v1
```

The guide is read-only. It lists present/missing evidence fields and approval
claim status, but it does not edit the draft or approve source rights.

By default it writes only:

```text
manual-artifacts/route-level-tanker-freight/source-rights-input.json
```

That path is ignored local operator workspace. It is not production data.

---

## 2. What The Operator Must Fill

The generated draft keeps every approval claim blocked by default:

```text
sourceApproved=false
liveFetchApproved=false
productionWriteApproved=false
routeValueRedistributionApproved=false
sourceRightsStatus=manual_review_required
```

Before any later gate review, the operator must manually supply source-rights
evidence for:

- source owner
- delivery path
- permitted automated access
- permitted storage fields
- permitted redistribution or display
- raw response storage policy
- route definition rights
- freshness cadence
- attribution copy
- termination or revocation handling

---

## 3. Boundary

This helper does not approve:

- source rights
- live fetch
- API key reads
- route-value storage or redistribution
- production data write
- frontend implementation
- workflow automation
- route-level confirmation
- ODP `finalBias`
- Brent promotion
- scoring / decision / execution / position

Any output that treats the generated draft as approval is invalid.

---
