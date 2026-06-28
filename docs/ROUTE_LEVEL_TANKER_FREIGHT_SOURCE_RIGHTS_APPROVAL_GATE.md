# Route-Level Tanker Freight Source-Rights Approval Gate - v1

> **Manual source-rights gate only.** This document records the current source
> approval state for future route-level tanker freight production use.
>
> Current result: source rights and redistribution remain **not approved**.
> Therefore any production write to
> `macroDrivers.energyTransport.routeFreightConfirmation` remains blocked.

---

## 1. Decision

The gate contract version is:

```text
route-level-tanker-freight-source-rights-approval-gate-v1
```

The current status is:

```text
manual_review_required_no_source_rights_approved
```

This gate does not approve:

- live fetch
- API key use
- route-value storage
- route-value redistribution
- production data write
- frontend implementation
- workflow automation
- ODP `finalBias`
- Brent promotion
- scoring / decision / execution / position

---

## 2. Current Source-Rights State

Current route-level source families remain candidates only:

| Source family | Current approval |
|---|---|
| Baltic Exchange tanker route assessments | not approved |
| ICE wet freight derivatives | not approved |
| CME Baltic wet freight futures | not approved |
| Vortexa / Kpler / LSEG / Argus / Platts / Clarksons / Signal Ocean | not approved |
| Existing StockQ BDTI/BCTI/BDI aggregate context | aggregate context only, not route-level confirmation |

The public source-review identified useful route families, but it did not grant
automated fetch, storage, redistribution, production write, or frontend display
rights for route-level values.

---

## 3. Approval Requirements

Before a future writer can write production route-level tanker freight data, a
separate manual approval artifact must prove:

- exact source owner and delivery path
- permitted automated access mode
- permitted storage fields
- permitted redistribution/display terms
- raw response storage prohibition
- route symbols and route definition rights
- freshness cadence and stale behavior
- attribution copy
- no licensed raw route-value leakage

The minimum approval artifact must set:

```text
sourceApproved=true
liveFetchApproved=true
productionWriteApproved=true
routeValueRedistributionApproved=true
sourceRightsStatus=approved
```

No such artifact exists in the current repository.

---

## 4. Current Gate Output

The current gate output is:

```text
sourceRightsStatus=manual_review_required
productionWriteBlocked=true
routeFreightConfirmation=not_connected
eligibleForMainScore=false
```

This blocks:

- writing `macroDrivers.energyTransport.routeFreightConfirmation`
- changing `transportShockCandidate.routeFreightConfirmation`
- adding a C1 thematic card that implies route-level freight is connected
- using route-level tanker freight in ODP direction, Brent promotion, main
  scoring, Global Risk Heatmap, World Order weights, or cross-validation

---

## 5. Boundary

This gate is a source-rights control, not a data source and not a production
writer. It has:

- no production data write
- no frontend implementation
- no workflow automation
- no live fetch
- no API key read
- no browser-side source access
- no raw licensed route values
- no route confirmation

---
