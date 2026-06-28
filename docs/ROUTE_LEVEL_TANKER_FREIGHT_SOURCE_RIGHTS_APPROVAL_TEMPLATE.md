# Route-Level Tanker Freight Source-Rights Approval Template - v1

> **Manual source-rights approval template only.** This document records the
> minimum operator-supplied evidence that a future route-level tanker freight
> source-rights approval artifact would need before any production writer can be
> reconsidered.
>
> Current result: this template grants no approval. Production writes remain
> blocked.

---

## 1. Template Contract

The template contract is:

```text
route-level-tanker-freight-source-rights-approval-template-v1
```

The fixture status must stay:

```text
template_only_no_approval
```

The future production field remains:

```text
macroDrivers.energyTransport.routeFreightConfirmation
```

This template only defines review inputs. It does not approve:

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

---

## 2. Required Human Evidence

A future approval artifact must explicitly supply and review:

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

Until those fields are supplied in a separate reviewed artifact and the source
rights gate changes, the block reason remains:

```text
template_only_no_source_rights_approved
```

---

## 3. Current Boundary

This is not an approval artifact. It is not production data and not a writer.

The current production state must remain:

```text
routeFreightConfirmation=not_connected
sourceRightsStatus=manual_review_required
approvalGrantedByThisTemplate=false
productionWriteBlocked=true
```

Any output that treats this template as source approval, route-value
redistribution approval, frontend approval, production write approval, or
main-score eligibility is invalid.

---
