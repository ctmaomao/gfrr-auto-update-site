# Route-Level Tanker Freight vs Baltic Freight Context Policy - v1

> **Docs/checker-only coexistence policy.** This document records how the future
> route-level tanker freight card should coexist with the existing
> `Baltic Freight` card.
>
> Current decision: do **not** delete `Baltic Freight` as part of the route-level
> tanker freight path. Keep it as broad freight context unless a separate
> reviewed deprecation/merge PR explicitly changes the IA contract.

---

## 1. Decision

The existing card:

```text
card-c1-shipping-freight
  label: Baltic Freight / 波罗的海运费
  source: macroDrivers.shippingFreight
  role: broad freight context
```

The future card candidate:

```text
c1-route-tanker-freight
  label: Route Tanker Freight / 路线级油轮运费
  future source: macroDrivers.energyTransport.routeFreightConfirmation
  role: route-level oil tanker freight confirmation watch
```

These are not equivalent.

`Baltic Freight` is broad context: BDTI/BCTI/BDI show tanker and dry-bulk
freight pressure, but cannot confirm Hormuz, Middle East Gulf crude/product
routes, Red Sea/Suez/Cape rerouting, route-level vessel flow, blockade, supply
outage, or oil price direction.

The future route-level card is narrower: it may eventually confirm whether
route-level tanker freight is moving consistently with an energy-transport
stress candidate. It still must remain display-only unless a separate reviewed
scoring/backtest path is approved later.

---

## 2. Current IA Rule

Current approved path:

```text
keep Baltic Freight as broad context
future route-level card is additive if implemented
current thematic card count remains 51
future additive thematic card count would be 52
```

Deletion or replacement is not approved in this policy.

A future merge/deprecation PR may be considered only after:

- source-rights approval exists
- production route-level field exists and is stable
- frontend route-level card is live and verified
- `Baltic Freight` broad-context value is intentionally re-homed into the new
  card or another clearly labeled context surface
- `check:thematic-card-ia`, DOM checks, Chinese-copy checks, and `check:all`
  are updated in the same PR

---

## 3. Copy Rules

Allowed `Baltic Freight` positioning:

```text
全球运费背景 / broad freight context
BDTI/BCTI oil tanker context + BDI dry-bulk context
仅作展示观察
不确认具体路线、通道中断、断供或油价方向
```

Forbidden `Baltic Freight` positioning:

- route-level confirmation
- Hormuz confirmation
- blockade confirmation
- vessel-flow confirmation
- source-rights approved route data
- oil price direction input
- main-score input

---

## 4. Boundary

This policy is not a frontend implementation and not a production writer. It
does not:

- remove `card-c1-shipping-freight`
- add `c1-route-tanker-freight`
- change thematic card count
- write production data
- change `macroDrivers.shippingFreight`
- write `macroDrivers.energyTransport.routeFreightConfirmation`
- change ODP `finalBias`
- change Brent promotion
- change scoring, decision, execution, position, Global Risk Heatmap, World
  Order weights, or cross-validation

---
