# Route-Level Tanker Freight Disabled Writer Scaffold - v1

> **Disabled writer scaffold only.** This document records the first disabled
> route-level tanker freight writer shape. It exists so the future production
> field can be reviewed before any production write is allowed.
>
> Current result: source rights are still not approved, so this scaffold may
> only emit an ignored manual projection with `status=not_connected`.

---

## 1. Decision

The scaffold contract is:

```text
route-level-tanker-freight-disabled-writer-scaffold-v1
```

The scaffold reads only reviewed local fixtures:

- `route-level-tanker-freight-production-writer-contract-design-v1`
- `route-level-tanker-freight-source-rights-approval-gate-v1`

It may emit only:

```text
manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-disabled-writer-projection-latest.json
```

The emitted candidate field must stay:

```text
macroDrivers.energyTransport.routeFreightConfirmation.status=not_connected
sourceRightsStatus=manual_review_required
productionWriteAttempted=false
productionWriteApproved=false
eligibleForMainScore=false
```

---

## 2. Why This Exists

This scaffold gives the next frontend/data-contract reviews a stable field
shape to inspect without pretending the source is connected. It is intentionally
boring: it projects the disabled state only.

It does not approve:

- source-rights use
- live fetch
- API key read
- production write
- frontend display
- workflow automation
- route-level confirmation
- ODP `finalBias`
- Brent promotion
- scoring / decision / execution / position

---

## 3. Required Failure State

Until source rights are approved, this scaffold must emit blockers:

```text
source_rights_and_redistribution_not_approved
no_approved_route_level_source
disabled_scaffold_no_production_write
```

Any output that claims `confirmed`, route-value redistribution, source approval,
production write, direct frontend display, or main-score eligibility is invalid.

---

## 4. Boundary

This is **not production data** and **not a production writer**. It:

- does not write production JSON
- does not read external sources
- does not read API keys
- does not read browser state
- does not add frontend DOM
- does not add workflow automation
- does not change existing `Baltic Freight`
- does not change route confirmation from `not_connected`

---
