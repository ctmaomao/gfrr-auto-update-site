# Route-Level Tanker Freight Thematic Card Brief - v1

> **Docs-only thematic-card brief.** This document records the owner-requested
> final product target: a future route-level tanker freight card inside the
> `C1 通胀与能源 / INFLATION & ENERGY` thematic block.
>
> This brief does **not** implement the card. It does not change `index.html`,
> CSS, frontend JavaScript, thematic-card counts, DOM checkers, production data,
> Daily pipeline, Worker runtime, workflows, ODP `finalBias`, Brent promotion,
> scoring, decision, execution, position, Global Risk Heatmap, or
> cross-validation.

---

## 1. Decision

The final user-facing card target is:

```text
#macro-thematic-cards
  C1 通胀与能源 / INFLATION & ENERGY
    future card: 路线级油轮运费确认
```

This is a future thematic-card implementation target, not a current UI change.
The existing ODP folded-detail brief remains valid as a lower-density evidence
surface. The future C1 card is appropriate only after the route-level freight
chain has a production field to read and source-rights have been manually
reviewed.

The future card must not become:

- a new top-level section
- a new jump-nav item
- a Global Risk Heatmap cell
- a World Order weight
- a Brent promotion input
- an ODP `finalBias` input
- a scoring / decision / execution / position input

---

## 2. Current State

Current production remains:

```text
routeFreightConfirmation=not_connected
marketConfirmation=not_connected
eligibleForMainScore=false
productionWriteApproved=false
frontendImplementationApproved=false
```

The latest readiness gate may say:

```text
ready_for_separate_production_write_design_keep_non_production
```

That only means the next engineering step may design a production writer
contract. It does not authorize a thematic card.

---

## 3. Future Card Contract

Future implementation may add exactly one card to the existing C1 block.

Proposed card:

| Field | Value |
|---|---|
| Theme block | `C1 通胀与能源 / INFLATION & ENERGY` |
| Proposed DOM id | `c1-route-tanker-freight` |
| Chinese label | `路线级油轮运费` |
| English label | `Route Tanker Freight` |
| Primary role | route-level freight confirmation watch |
| Source | future `radarData.macroDrivers.energyTransport.routeFreightConfirmation` |
| Fallback context | `transportShockCandidate.routeFreightConfirmation=not_connected` |
| Display mode | compact indicator card, observation-only |

The card may show only aggregate state:

- confirmation state
- source-rights / sample-readiness status
- route bucket coverage count
- latest reviewed route buckets
- boundary copy

The card must not display raw source text, licensed route assessments, raw URLs,
or source excerpts.

Card-count contract for this brief:

```text
currentExpectedThematicCardCount=52
futureExpectedThematicCardCount=53
futureCardCountDelta=1
```

The current checker count must remain 52 until a separate route-level tanker
freight frontend implementation PR adds that route-level card.

---

## 4. Required Future Frontend Changes

A separate implementation PR must update all of these together:

- `index.html`: add the C1 card DOM.
- `scripts/modules/renderMacroOverview.js`: render the card from production
  data only.
- `scripts/check-thematic-card-ia.mjs`: update expected card count from 52 to
  53 and lock C1 count/order.
- DOM/render guards: include the new `c1-route-tanker-freight` id.
- Chinese-copy guards: ensure no trade-action or confirmation-overclaim copy.
- frontend asset version: run the repo bump workflow because frontend files
  changed.

This brief intentionally does none of the above.

---

## 5. Copy Contract

Allowed Chinese copy shape:

```text
路线级油轮运费: 观察中
人工复核/生产字段待接入;用于确认霍尔木兹、中东出口、红海/苏伊士/好望角
相关路线级运费是否与运输压力同向。不确认封锁、断供、油轮流向或油价方向。
```

Forbidden user-visible wording:

- "封锁已发生"
- "霍尔木兹已关闭"
- "断供确认"
- "官方油轮流量"
- "油价将上涨/下跌"
- "交易信号"
- "买入/卖出/加仓/减仓"
- "战争概率"
- "供应危机概率"

---

## 6. Entry Gates Before Implementation

Before a real C1 card can be implemented:

1. Production writer contract design exists and passes review.
2. Source-rights / redistribution review is manually approved.
3. Production field exists in `data/radar-data.json` and remains display-only.
4. The field has fail-closed stale/missing behavior.
5. Frontend implementation reads only production JSON, not ignored artifacts.
6. `check:thematic-card-ia`, `check:dom`, `check:frontend-live-contracts`,
   `check:frontend-zh-copy`, `check:data`, and `check:all` pass.

---

## 7. Boundary

This brief is a product/display contract only. It keeps:

- `productionDataWriteApproved=false`
- `productionWriteApproved=false`
- `frontendImplementationApproved=false`
- `workflowAutomationApproved=false`
- `liveFetchApproved=false`
- `mainScoreApproved=false`
- `odpFinalBiasApproved=false`
- `brentPromotionApproved=false`
- `globalRiskHeatmapApproved=false`
- `crossValidationApproved=false`

---
