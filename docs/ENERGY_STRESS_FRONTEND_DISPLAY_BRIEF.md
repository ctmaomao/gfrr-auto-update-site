# Energy Stress Frontend Display Brief(OPEC + PortWatch)

> **Docs-only frontend display brief.** This document approves the design shape for a future frontend implementation, but this PR does not change `index.html`, CSS, frontend JS, data files, Daily pipeline, validator, Worker, workflow, scoring, decision, execution, position, World Order weights, or Global Risk Heatmap.
> **Owner request**: surface the already-live OPEC spare-capacity and PortWatch chokepoint evidence inside the existing Energy / ODP product surface.
> **Date**: 2026-06-09.

---

## 0. Decision

Implement the future UI as an extension of the existing `#oil-directional-pressure` section, not as a new top-level section.

Rationale:

- `DESIGN.md` already defines `#oil-directional-pressure` as the Energy theme in the primary reader path.
- The two new production data layers are Energy Stress evidence, not a new risk engine:
  - `macroDrivers.energySpareCapacity`
  - `macroDrivers.energyTransport`
- The current ODP section already has a visible summary plus folded evidence detail, which is the right density for slow-variable / proxy explanation.
- Adding a new jump-nav item or standalone section would make the Energy layer look like a new scoring module, which is explicitly not allowed.

Preferred product shape:

```text
ODP current visible layer
  - verdict / headline / six physical-chain reasons stay primary
  - folded evidence detail gains a compact "energy stress addendum"
    - OPEC spare-capacity slow variable
    - PortWatch chokepoint transport proxy
    - strict source/limitation copy
```

---

## 1. Current Live Inputs

The future renderer may read only already-produced site data:

| Source field | Current producer | UI role |
|---|---|---|
| `data/oil-directional-pressure.json` | ODP weekly model | Existing verdict, headline, six physical-chain reasons, evidence cards |
| `radarData.macroDrivers.energySpareCapacity` | Daily `resolveEnergySpareCapacity` | OPEC spare-capacity slow-variable addendum |
| `radarData.macroDrivers.energyTransport` | Daily `resolveEnergyTransport` | PortWatch chokepoint transport / rerouting proxy addendum |

The renderer must not fetch EIA, IMF, ArcGIS, PortWatch, or any other external source from the browser.

Current production proof at the time of this brief:

- `energySpareCapacity.sourceStatus.spareCapacity = live`
- `energySpareCapacity.spareCapacityMbpd = 0.04`
- `energySpareCapacity.bufferRegime = 极低缓冲`
- `energyTransport.sourceStatus.chokepoints = live`
- `energyTransport.latestDate = 2026-05-31`
- `energyTransport.usageTermsPinned = partial`
- `energyTransport.redistributionCaveat = true`

These values are examples, not static copy. The frontend must render live JSON values with missing/stale/fallback guards.

---

## 2. IA And Visual Contract

Relevant `DESIGN.md` constraints:

- §4.1: `#oil-directional-pressure` is the Energy theme, after `#global-risk-heatmap` and before appendix details.
- §4.2: jump nav order is fixed unless a separate IA change is approved.
- §5.1 / §5.6: the ODP section reuses the editorial section and folded detail patterns.
- `AGENTS.md`: any frontend change must read `DESIGN.md` first and include the required DESIGN acknowledgment.

Future implementation must:

- Keep `#oil-directional-pressure` as the only Energy top-level entry.
- Keep folded detail default closed.
- Reuse existing editorial / ODP CSS patterns.
- Avoid nested cards and avoid a new decorative visual language.
- Avoid a new color palette or new accent family.
- Use compact text/data rows, not hero-scale typography.

No IA change is approved in this brief:

- no new jump-nav item
- no new first-level section
- no new Global Risk Heatmap cell
- no World Order panel injection

---

## 3. Proposed DOM Surface

Future implementation may add a small addendum block inside the existing ODP `<details>` body, after `#odp-evidence-list` and before `.odp-boundary-note`.

Proposed IDs:

| ID | Purpose |
|---|---|
| `odp-energy-addendum` | Container for the two Energy Stress addendum groups |
| `odp-energy-spare-status` | Live/fallback/missing state for OPEC spare capacity |
| `odp-energy-spare-value` | `spareCapacityMbpd` + unit |
| `odp-energy-spare-regime` | `bufferRegime` with conservative tone |
| `odp-energy-spare-period` | `latestPeriod` / forecast marker |
| `odp-energy-spare-note` | EIA STEO estimate/forecast limitation |
| `odp-energy-transport-status` | PortWatch live/fallback/missing state |
| `odp-energy-transport-date` | `latestDate` / `latestAgeDays` |
| `odp-energy-transport-rerouting` | `reroutingProxy.redSeaToCapeRegime` and bounded ratios if available |
| `odp-energy-transport-core` | Compact list of core chokepoints and tanker/capacity deltas |
| `odp-energy-transport-note` | AIS-derived proxy / non-official / no-war-probability limitation |
| `odp-energy-source-boundary` | One-line source/firewall note for both layers |

Because these are new DOM IDs, the implementation PR must update:

- `index.html`
- the ODP renderer module
- `check:dom` expectations if needed
- frontend asset cache version via the repo bump workflow

Do not add a new `odp-reason-*` row unless owner explicitly wants the addendum visible before expanding details. The default recommendation keeps the six ODP physical-chain reasons unchanged and places OPEC/PortWatch in the folded evidence area.

---

## 4. Copy Contract

Allowed Chinese copy shape:

```text
OPEC 闲置产能: EIA STEO 月度估算/预测,用于观察全球供应缓冲厚薄,不是实时物理桶数、OPEC 配额执行或油价预测。

咽喉转运: PortWatch AIS-derived proxy,展示主要咽喉的船舶计数与 capacity 派生摘要;可能受 GPS jamming、AIS spoofing、vessels going dark、绕行或数据延迟影响;不是官方贸易统计、封锁确认、战争概率或油价预测。

边界: 以上均为 audit-only / display-only 能源证据层,不进入 scoring、decision、execution、position、World Order weights 或 Global Risk Heatmap。
```

Forbidden user-visible wording:

- "油价将上涨/下跌"
- "供应危机概率"
- "战争概率"
- "封锁概率"
- "霍尔木兹已封锁"
- "官方油轮流量"
- "OPEC 官方配额执行"
- "实时闲置桶数"
- "交易信号"
- "买入/卖出/加仓/减仓"

The future implementation must continue to pass `check:oil-directional-zh-copy`.

---

## 5. Renderer Requirements

Future implementation should extend `scripts/modules/renderOilDirectional.js` and keep all rendering presentation-only:

- Use `textContent` / existing setter helpers, not `innerHTML`.
- Clear stale text on missing/stale/fallback data.
- Show `暂不显示` / `数据累积中` / `源暂不可用` style copy when the macroDriver node is absent.
- Do not derive or mutate `radarData`.
- Do not infer a new score, oil bull score, war probability, or blockage probability.
- Do not write back into `oilDirectionalData.signals`, `radarData.values`, `effectiveDisplayInputs`, `displayInputsBaseline`, `decisionModel`, or `worldOrderStress`.

Recommended transformations:

- `spareCapacityMbpd`: render one decimal or two decimals depending magnitude; preserve `null` as unavailable.
- `latestIsForecast`: append "预测期" / "历史期" without making it actionable.
- `latestAgeDays`: show only as freshness, not severity.
- `reroutingProxy`: render `redSeaToCapeRegime` as descriptive text; if ratios are missing, say "窗口不足".
- Core chokepoints: show a compact list of 4-6 priority entries, with all 8 available only if layout remains clean.

---

## 6. Boundary And Firewall

Allowed:

- Read `radarData.macroDrivers.energySpareCapacity`.
- Read `radarData.macroDrivers.energyTransport`.
- Render conservative explanatory text inside the existing ODP surface.
- Link to evidence detail within the same section.

Disallowed:

- Any change to `values.*`.
- Any change to `displayInputsBaseline` or `effectiveDisplayInputs`.
- Any change to scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, Invalidation Rules, or Global Risk Heatmap.
- Any change to Brent promotion.
- Any change to World Order weights or `blockadeOrChokepointEvents`.
- Any browser-side live fetch.
- Any PortWatch raw AIS-derived history dump.
- Any new workflow or secret.

---

## 7. Future Implementation Checklist

Before editing frontend code:

1. Read `DESIGN.md` in full.
2. Inventory the current ODP DOM and renderer IDs.
3. Confirm whether the addendum remains folded-detail-only or owner wants a visible reason row.

Implementation PR must run:

```powershell
npm run check:dom
npm run check:frontend-live-contracts
npm run check:oil-directional-zh-copy
npm run check:all
git diff --check
```

If actual visual code changes are made, also verify in browser with the live site or local dev server and capture a screenshot for review.

Boundary proof must include:

- `git diff --name-only`
- no `data/*.json` change unless a separate data refresh is explicitly authorized
- no `.github/workflows/*` change
- no scoring/decision/worker/runtime change
- asset version bump if `index.html` or frontend JS changes

---

## 8. Non-goals

This brief does not approve:

- a new "Oil Bull Score"
- a new seventh risk module
- a new World Order subscore
- a Heatmap energy cell
- external live fetch from frontend
- commercial Kpler / MarineTraffic / Platts / LSEG / Planet integration
- PortWatch TOS runtime enum change
- PortWatch raw data publication

PortWatch terms pinning is tracked separately in `PORTWATCH_TOS_PIN_REVIEW.md`.
