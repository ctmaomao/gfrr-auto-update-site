# Route-Level Tanker Freight Frontend Display Brief - v1

> **Docs-only frontend display brief.** This document defines the product and
> UI contract for a possible future route-level tanker freight confirmation
> watch, but this change does not implement frontend rendering.
>
> **No frontend implementation is approved in this brief.** This brief does not
> change `index.html`, CSS, frontend JavaScript, production data files, Daily
> pipeline, validators that write data, Worker runtime, workflows, scoring,
> decision, execution, position, Brent promotion, ODP `finalBias`, World Order
> weights, Global Risk Heatmap, or cross-validation.
>
> **Date**: 2026-06-28.

---

## 0. Decision

If route-level tanker freight confirmation is ever surfaced to users, it should
be rendered only inside the existing `#oil-directional-pressure` section as a
folded detail addendum. It must not become a new top-level page section, a new
jump-nav item, a Global Risk Heatmap cell, a World Order weight, or a visible
ODP reason row without separate owner approval.

Rationale:

- `DESIGN.md` already defines `#oil-directional-pressure` as the Energy theme
  in the primary reader path.
- Route-level freight is a confirmation layer for the existing
  `transportShockCandidate`, not a new risk engine.
- The current ODP surface already keeps verdict content visible while evidence
  and caveats live in folded details.
- A standalone card could make a dry-run/manual confirmation candidate look
  like a live directional signal, which is not yet justified.

Preferred product shape:

```text
ODP current visible layer
  - 01 verdict / headline remains primary
  - 02 / 03 / 04 folded details remain peer-level details
  - folded energy evidence detail may later gain a compact route freight watch
    - route-level tanker freight state
    - usable manual sample count and route bucket coverage
    - explicit not-connected / display-only / non-scoring boundary
```

---

## 1. Current State

Current production remains:

```text
routeFreightConfirmation=not_connected
marketConfirmation=not_connected
eligibleForMainScore=false
```

The current implementation chain is still manual/local or contract-only:

| Step | Script / contract | Status |
|---|---|---|
| Source review | `ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md` | source-review only |
| Proof-of-source design | `ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md` | design only |
| Manual artifact review | `review:route-level-tanker-freight-manual-artifact` | dry-run/local/manual only |
| Manual samples review | `review:route-level-tanker-freight-manual-samples` | dry-run/local/manual only |
| Display candidate contract | `route-level-tanker-freight-display-contract-v1` | contract-only/no production write |
| Production display projection | `project:route-level-tanker-freight-production-display` | dry-run/manual artifact only |
| Projection review | `review:route-level-tanker-freight-production-display-projections` | dry-run/manual artifact only |

This brief is `route-level-tanker-freight-frontend-display-brief-v1`. It only
decides how the future UI should be shaped if a separate implementation PR is
approved after source rights, repeated samples, and production display review.

---

## 2. Future Inputs

Future frontend implementation may read only already-produced site data:

| Source field | Role |
|---|---|
| `radarData.macroDrivers.energyTransport.transportShockCandidate` | Current PortWatch-derived transport shock candidate; fixed non-scoring candidate |
| `radarData.macroDrivers.energyTransport.routeFreightConfirmation` | Future field candidate only after a separate production-write PR |
| `data/oil-directional-pressure.json` | Existing ODP verdict/evidence surface |

Manual projection artifacts under `manual-artifacts/route-level-tanker-freight/`
may be read only by local/manual review tools. Browser code and production data
must not read ignored manual artifacts.

The renderer must not fetch Baltic Exchange, ICE, CME, Vortexa, Kpler, LSEG,
Argus, Platts, Clarksons, Signal Ocean, PortWatch, or any other route-level
freight source from the browser.

---

## 3. IA And Visual Contract

Relevant constraints from `DESIGN.md` and the current ODP UI:

- Keep `#oil-directional-pressure` as the only Energy top-level entry.
- Keep route-level freight in folded detail by default.
- Keep `02`, `03`, and `04` detail blocks as peer-level folded sections.
- Do not nest the route freight watch under an unrelated second-level accordion.
- Reuse existing ODP/editorial rows and compact evidence patterns.
- Avoid a new color palette, standalone dashboard card, or hero-scale typography.
- Show route freight as confirmation context, not as a forecast.

No IA change is approved:

- no new jump-nav item
- no new first-level section
- no new Global Risk Heatmap cell
- no World Order panel injection
- no ODP visible reason row

---

## 4. Proposed DOM Surface

Future implementation may add a compact route freight block inside the existing
ODP `<details>` body, preferably near the Energy transport addendum and before
the final ODP boundary note.

Proposed IDs for a future implementation:

| ID | Purpose |
|---|---|
| `odp-route-freight-watch` | Container for the folded route freight confirmation watch |
| `odp-route-freight-status` | Live/manual/stale/unavailable state for the candidate |
| `odp-route-freight-state` | `routeFreightConfirmation` display state |
| `odp-route-freight-samples` | Usable manual sample count and repeated observation state |
| `odp-route-freight-routes` | Compact route bucket coverage such as TD3C / TD8 / TC5 |
| `odp-route-freight-boundary` | One-line source/firewall note |

Because these are new DOM IDs, a separate frontend implementation PR must update:

- `index.html`
- `scripts/modules/renderOilDirectional.js`
- DOM/checker expectations
- frontend asset cache version
- Chinese-copy guards

This brief intentionally adds none of those DOM IDs to runtime/frontend files.

---

## 5. Copy Contract

Allowed Chinese copy shape:

```text
路线级油轮运费确认观察: 数据累积中,当前仅为人工复核/展示候选层,用于观察
霍尔木兹、中东出口、红海/苏伊士/好望角绕行等路线级运费是否与运输压力同向。

当前状态: routeFreightConfirmation=not_connected;市场确认未接入;不参与 ODP
方向判断、Brent promotion、主分数或仓位建议。

边界: 路线级运费不是官方贸易统计,不确认封锁、断供、油轮流向或油价方向。
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

Future implementation must continue to pass `check:oil-directional-zh-copy`.

---

## 6. Renderer Requirements

Future implementation should extend `scripts/modules/renderOilDirectional.js`
only after a separate frontend implementation approval:

- Use `textContent` / existing setter helpers, not `innerHTML`.
- Show `数据累积中` / `人工复核中` / `暂未接入` when confirmation is absent.
- Clear stale text when input data is missing or stale.
- Do not derive a new score, oil bull score, route closure probability, war
  probability, blockade probability, or directional forecast.
- Do not mutate `radarData`, `oilDirectionalData.signals`, `values.*`,
  `effectiveDisplayInputs`, `displayInputsBaseline`, `decisionModel`, or
  `worldOrderStress`.

Recommended display transformations:

- `routeFreightConfirmation`: render as `未接入` / `观察` / `矛盾` only if the
  future production contract allows those values.
- usable sample count: render as a quality/freshness hint, not severity.
- route buckets: show a short coverage list, not raw source text or URLs.
- source rights: display as a boundary state; never display raw licensed text.

---

## 7. Boundary And Firewall

Allowed in a future implementation:

- Read production `radarData.macroDrivers.energyTransport` fields.
- Render conservative explanatory text inside the existing ODP folded detail.
- Show aggregate route bucket/sample readiness if production data exists.

Disallowed in this brief and any future implementation without separate review:

- Any change to `values.*`.
- Any change to `displayInputsBaseline` or `effectiveDisplayInputs`.
- Any change to scoring, `decisionModel`, `executionLock`,
  `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, or
  Global Risk Heatmap.
- Any change to Brent promotion or ODP `finalBias`.
- Any change to World Order weights or `blockadeOrChokepointEvents`.
- Any browser-side live fetch.
- Any workflow automation or secret.
- Any production data write.
- Any raw route-level source text storage in frontend or production JSON.

---

## 8. Future Implementation Checklist

Before editing frontend code:

1. Read `DESIGN.md` in full.
2. Inventory the current ODP DOM and renderer IDs.
3. Confirm owner approval for a folded-detail-only route freight watch.
4. Confirm there is a production data field to render; ignored manual artifacts
   are not browser inputs.
5. Confirm `routeFreightConfirmation` remains display-only and non-scoring.

Implementation PR must run:

```powershell
npm run check:dom
npm run check:frontend-live-contracts
npm run check:oil-directional-zh-copy
npm run check:all
git diff --check
```

Boundary proof must include:

- no `data/*.json` production-write change unless separately approved
- no `.github/workflows/*` change unless separately approved
- no scoring/decision/worker/runtime change
- asset version bump if `index.html` or frontend JavaScript changes

---
