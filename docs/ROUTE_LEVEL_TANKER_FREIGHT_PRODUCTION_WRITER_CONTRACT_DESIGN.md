# Route-Level Tanker Freight Production Writer Contract Design - v1

> **Production writer contract design only.** This document defines the future
> production-field contract for
> `macroDrivers.energyTransport.routeFreightConfirmation`.
>
> This design does not add a writer, does not write `data/radar-data.json`, does
> not add frontend UI, does not add workflow automation, does not live fetch,
> does not read API keys, and does not change scoring, decision, execution,
> position, ODP `finalBias`, Brent promotion, Global Risk Heatmap, World Order
> weights, or cross-validation.

---

## 1. Decision

The future production field, if separately approved, is:

```text
macroDrivers.energyTransport.routeFreightConfirmation
```

The contract version for this design is:

```text
route-level-tanker-freight-production-writer-contract-design-v1
```

The current status is:

```text
contract_design_only_no_writer
```

This means the field shape is now reviewable, but no production writer exists.
The current production state remains:

```text
routeFreightConfirmation=not_connected
marketConfirmation=not_connected
eligibleForMainScore=false
productionWriteApproved=false
sourceRightsStatus=manual_review_required
```

---

## 2. Required Inputs Before Any Future Write

A future production writer may only be considered after all of these have
separate review artifacts:

| Requirement | Current status |
|---|---|
| `route-level-tanker-freight-production-write-readiness-v1` | pass required |
| `route-level-tanker-freight-display-contract-v1` | pass required |
| `route-level-tanker-freight-thematic-card-brief-v1` | pass required |
| `route-level-tanker-freight-source-rights-approval-v1` | not present |
| live-source usage and redistribution approval | not approved |
| production writer implementation | not started |
| workflow automation | not approved |
| frontend card implementation | not approved |

The source-rights approval is an explicit blocker. A passing readiness artifact
does not imply source-rights approval.

---

## 3. Future Field Shape

Future field candidate:

```json
{
  "contractVersion": "route-level-tanker-freight-confirmation-v1",
  "status": "not_connected",
  "sourceMode": "manual_review_projection",
  "displayOnly": true,
  "auditOnly": true,
  "eligibleForMainScore": false,
  "sourceRightsStatus": "manual_review_required",
  "sampleReadiness": "manual_review_required",
  "routeBuckets": [],
  "routeCoverage": {
    "observedBucketCount": 0,
    "requiredBucketCount": 0,
    "repeatedObservationCount": 0
  },
  "latestReviewedAt": null,
  "staleAfterHours": 72,
  "limitationZh": "路线级油轮运费仍需人工来源权利与样本复核;本层只做展示观察,不确认封锁、断供、油轮流向或油价方向。"
}
```

Allowed `status` values for the first production writer contract:

- `not_connected`
- `watch`
- `contradicted`
- `stale`
- `unavailable`

confirmed is intentionally excluded. Route-level freight can only be a
display-only confirmation watch until source-rights, sample quality, live
refresh behavior, and cross-source interpretation are reviewed in a later
version.

---

## 4. Writer Safety Rules

A future writer must:

- fail closed to `unavailable` or `stale`
- preserve `displayOnly=true`
- preserve `auditOnly=true`
- preserve `eligibleForMainScore=false`
- preserve `productionWriteApproved=false` until a separate approval changes it
- store only compact aggregate state, not raw licensed route assessments
- read only approved production inputs, not ignored `manual-artifacts/` files
- keep source citation hints hashed or domain-level unless redistribution is
  explicitly approved
- avoid route-level conclusions when sample coverage is below the approved
  threshold
- avoid market-direction language

A future writer must not:

- live fetch Baltic/ICE/CME/vendor pages without a separate approved source
  adapter and source-rights review
- read API keys in the contract-design phase
- write raw source text or licensed route tables into production JSON
- create browser-side fetches
- change `transportShockCandidate` eligibility
- change ODP `finalBias`
- change Brent promotion
- change main scoring, decision, execution, or position fields

---

## 5. Display Boundary

If the future field is later written, the frontend may only display aggregate
state such as:

```text
路线级油轮运费: 观察中
来源权利: 人工复核中
覆盖路线: 2/4
样本状态: 重复观测不足
```

The frontend must not display:

- raw route prices
- raw source titles
- raw source snippets
- licensed route assessment tables
- "封锁确认"
- "断供确认"
- "油价方向确认"
- buy/sell/trading language

---

## 6. Boundary

This contract design keeps:

- `productionDataWriteApproved=false`
- `productionWriteApproved=false`
- `frontendImplementationApproved=false`
- `workflowAutomationApproved=false`
- `liveFetchApproved=false`
- `apiKeyReadApproved=false`
- `mainScoreApproved=false`
- `odpFinalBiasApproved=false`
- `brentPromotionApproved=false`
- `globalRiskHeatmapApproved=false`
- `crossValidationApproved=false`

It is explicitly **no production data write** and **no frontend implementation**.

---
