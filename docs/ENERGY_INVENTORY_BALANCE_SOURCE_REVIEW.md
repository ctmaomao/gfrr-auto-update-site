# Energy Inventory Balance Source Review(P6A implementation follow-up)

> **Source-review baseline.** 本文登记并约束 P6A 的 EIA STEO OECD commercial inventory / global net inventory change 数据源。2026-06-15 owner 批准窄口径实现:只允许写入 `macroDrivers.energyInventoryBalance`,供 ODP 折叠详情解释 Pulse 的 OECD 库存、全球需求与库存缺口叙事边界。仍保持 audit-only / display-only。
> **候选层命名**:`Energy Inventory Balance Slow Variable`。
> **调研日期**:2026-06-15。

---

## 0. Executive Decision

**结论:可作为 P6A monthly display-only 慢变量接入。**

最干净来源是 EIA Short-Term Energy Outlook(STEO) Open Data API:

- EIA API v2: `https://api.eia.gov/v2/steo/data/`
- Source report: `https://www.eia.gov/outlooks/steo/report/global_oil.php`
- primary series:
  - `PASC_OECD_T3`: OECD End-of-period Commercial Crude Oil and Other Liquids Inventory
  - `T3_STCHANGE_WORLD`: Net Inventory Withdrawals, Total World Crude Oil and Other Liquids
  - `PATC_WORLD`: Total World Consumption of Crude Oil and Other Liquids
  - `PATC_OECD`: OECD Consumption of Crude Oil and Other Liquids
- frequency: monthly
- inventory unit: `million barrels, end-of-period`
- flow unit: `million barrels per day`

This source **does not provide a live observed global commercial inventory total**. GFRR must display it as OECD commercial inventory plus global net draw/build proxy, not as complete global commercial stocks.

---

## 1. Grounding Evidence

EIA STEO global oil report discusses OECD commercial inventories, global inventory changes and global liquids consumption in the same monthly outlook product. The Open Data API exposes the required series through:

```text
GET /v2/steo/data/?api_key=<EIA_API_KEY>&data[0]=value&facets[seriesId][]=PASC_OECD_T3&facets[seriesId][]=T3_STCHANGE_WORLD&facets[seriesId][]=PATC_WORLD&facets[seriesId][]=PATC_OECD
```

API rows return:

```json
{
  "frequency": "monthly",
  "dateFormat": "YYYY-MM",
  "seriesId": "PASC_OECD_T3",
  "seriesDescription": "OECD End-of-period Commercial Crude Oil and Other Liquids Inventory",
  "unit": "million barrels, end-of-period"
}
```

The implementation also reads component/supporting series:

| Series ID | Meaning | Unit | Consumption |
|---|---|---|---|
| `PASC_OECD_T3` | OECD commercial crude oil and other liquids inventory, end-of-period | million barrels | core inventory level |
| `PASC_US` | U.S. commercial crude oil and other liquids inventory, end-of-period | million barrels | OECD component context |
| `PASC_OOECD_T3` | Other OECD commercial crude oil and other liquids inventory, end-of-period | million barrels | OECD component context |
| `T3_STCHANGE_WORLD` | Total world net inventory withdrawals | million barrels per day | global draw/build proxy |
| `T3_STCHANGE_US` | U.S. net inventory withdrawals | million barrels per day | component context |
| `T3_STCHANGE_OOECD` | Other OECD net inventory withdrawals | million barrels per day | component context |
| `T3_STCHANGE_NOECD` | Non-OECD net inventory withdrawals | million barrels per day | component context |
| `PATC_WORLD` | Total world consumption | million barrels per day | global demand slow variable |
| `PATC_OECD` | OECD consumption | million barrels per day | days-of-supply denominator |

---

## 2. Semantics

GFRR display wording must distinguish three things:

- `PASC_OECD_T3` is OECD commercial inventory, not world inventory.
- `T3_STCHANGE_WORLD` is global net inventory withdrawals. Positive means draw; negative means build.
- `PATC_WORLD` is monthly STEO consumption estimate/forecast, not high-frequency demand nowcast.

Allowed user-visible wording:

```text
EIA STEO OECD commercial inventory + global net inventory draw/build proxy
```

Disallowed wording:

- global commercial inventory total
- real-time global stockpile
- Kpler / AIS oil-on-water confirmation
- OPEC monthly report forecast
- price forecast
- trading signal

---

## 3. Fit With Current Architecture

Allowed landing:

- `macroDrivers.energyInventoryBalance`
- ODP folded details under the existing `全球库存/需求缺口` and timestamp/QC surfaces

Disallowed:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- scoring
- `decisionModel`
- `executionLock`
- `positionGuidance`
- Action Queue / Trigger Monitor / Invalidation Rules
- Brent promotion
- Worker realtime payload
- World Order score weights
- Global Risk Heatmap
- cross-validation matrix

Preferred cadence:

- Daily pipeline may refresh it, but the underlying source is monthly STEO.
- Use short timeout and `EIA_API_KEY`.
- Carry last-good only while not stale; otherwise fail closed to null/stale.

---

## 4. Implementation Contract

The P6A runtime implementation must:

1. query only EIA STEO Open Data API series listed above
2. store only compact derived fields under `macroDrivers.energyInventoryBalance`
3. preserve metadata:
   - `source: EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD`
   - `frequency: monthly`
   - `units.inventory: million barrels, end-of-period`
   - `units.flow: million barrels per day`
   - `sourceStatus.inventoryBalance`
   - `limitationZh`
4. compute only simple transparent derivatives:
   - YoY level / consumption changes
   - same-month five-year OECD inventory comparison
   - OECD days of supply
   - three-month average global net withdrawals
   - six-month and twelve-month OECD inventory forecast checkpoints
5. keep all output display-only and validator-gated

Do not derive an Oil Bull Score or portfolio action from this source.

---

## 5. Risk / Limits

- STEO is an estimate / forecast product, not an observed daily feed.
- Current-month and forward rows may be model projections.
- OECD commercial stocks are a useful buffer proxy, but not a complete global stockpile.
- Global net inventory withdrawals can show direction and speed of draw/build, but not the physical location, ownership, quality, or shipping risk of barrels.
- This source does not detect dark AIS, tanker-level movements, Kuwait storage changes, sanctions evasion, or chokepoint closure.
- Low inventory and strong draws can raise sensitivity to shocks, but they are not a standalone oil-price prediction.

---

## 6. Review Outcome

| Field | Decision |
|---|---|
| sourceCandidate | `EIA:STEO:PASC_OECD_T3/T3_STCHANGE_WORLD/PATC_WORLD` |
| sourceReachable | yes |
| freePublicSource | yes, with EIA API key |
| liveFetchApproved | yes, only for P6A Daily `macroDrivers.energyInventoryBalance` |
| productionDataWriteApproved | yes, only through normal `build-daily-radar-data.yml` / `data/radar-data.json` generation;manual JSON edits remain disallowed |
| displayOnlyCandidate | yes |
| scoringAllowed | no |
| recommendedNextStep | implemented as narrow Daily macroDriver layer and surfaced inside existing ODP details |
