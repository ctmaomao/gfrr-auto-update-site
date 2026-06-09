# OPEC Spare Capacity Source Review(source-review + owner-approved implementation follow-up)

> **Source-review baseline.** 本文最初只登记 OPEC 闲置产能候选源;不写 fetcher、不接 runtime、不改 `data/*.json`、不改 frontend、不触发 workflow、不进 scoring / decision / execution / position。2026-06-09 owner 后续批准一个 source-specific implementation:只允许 EIA STEO `COPS_OPEC` 写入 `macroDrivers.energySpareCapacity`,仍保持 audit-only / display-only。
> **候选层命名**:`Energy Spare Capacity Slow Variable`(proposed,未实现)。
> **调研日期**:2026-06-09。

---

## 0. Executive Decision

**结论:可作为未来 monthly display-only 慢变量候选。**

最干净来源是 EIA Short-Term Energy Outlook(STEO) 的 OPEC surplus crude oil production capacity:

- STEO 图表数据: `https://www.eia.gov/outlooks/steo/xls/Fig6.xlsx`
- EIA API v2: `https://api.eia.gov/v2/steo/data/`
- 实测 seriesId: `COPS_OPEC`
- seriesDescription: `OPEC Total Spare Crude Oil Production Capacity`
- frequency: monthly
- unit: `million barrels per day`

本文**不批准** live fetch。若未来实现,必须另开 stage,并保持 audit-only / display-only。

---

## 1. Grounding Evidence

EIA STEO data page 的 `All Figures and Data` 明列:

- `OPEC surplus crude oil production capacity`
- 提供 `XLSX` 与 `PNG`

本地实测 `Fig6.xlsx`:

- workbook sheet: `6`
- chart series name: `OPEC surplus crude oil production capacity`
- chart series code: `COPS_OPEC`
- unit: `million barrels/day`
- May 2026 workbook contained annual values including:
  - 2024: `3.56`
  - 2025: `3.43`
  - 2026: `0.46`
  - 2027: `2.49`

本地实测 EIA API v2:

```text
GET /v2/steo/data/?api_key=<EIA_API_KEY>&data[0]=value&facets[seriesId][]=COPS_OPEC
```

返回:

```json
{
  "frequency": "monthly",
  "dateFormat": "YYYY-MM",
  "seriesId": "COPS_OPEC",
  "seriesDescription": "OPEC Total Spare Crude Oil Production Capacity",
  "unit": "million barrels per day"
}
```

无 `api_key` 时 API 返回 `API_KEY_MISSING`,这与仓库已有 `EIA_API_KEY` discipline 一致。

---

## 2. Semantics

EIA 定义:

- effective crude oil production capacity = maximum sustainable capacity minus disruptions。
- surplus crude oil production capacity = effective production capacity minus actual production。
- voluntary OPEC/OPEC+ cuts are not treated as disruptions, because they can be reversed.

GFRR 显示时必须写成:

```text
EIA STEO estimate / forecast of OPEC spare crude capacity
```

不得写成:

- real-time physical spare barrels
- OPEC official quota compliance
- Saudi-only spare capacity
- proprietary supply-chain intelligence
- price forecast

---

## 3. Fit With Current Architecture

Allowed future landing:

- standalone display-only slow variable file, e.g. `data/energy-spare-capacity.json`
- or `macroDrivers.energySpareCapacity` if owner wants it grouped with macro evidence
- frontend display can sit inside the existing ODP / Energy Stress explanatory surface

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

Preferred cadence:

- monthly, after STEO release
- fail closed if API missing / stale / schema changed
- no daily retry pressure

---

## 4. Implementation Sketch(如果未来批准)

Minimum future implementation should be:

1. zero-dependency fetcher using `fetch`, short timeout, `User-Agent: GFRRBot/1.0`
2. use `process.env.EIA_API_KEY`, matching ODP
3. query `seriesId=COPS_OPEC`
4. parse latest historical/current estimate and forward 12-18 month forecast separately
5. write explicit metadata:
   - `source: EIA:STEO:COPS_OPEC`
   - `unit: million barrels per day`
   - `frequency: monthly`
   - `isForecast: true/false`
   - `sourceStatus: live/stale/missing`
6. validator must enforce finite numbers, unit, frequency, source string, and display-only boundary

Do not derive an "Oil Bull Score" from this series.

---

## 5. Risk / Limits

- STEO is an estimate / forecast product, not an observed daily feed.
- Current-month and future-month rows are model projections.
- EIA definitions were updated in late 2025; historical comparisons must preserve source version context.
- Low spare capacity can indicate reduced supply buffer, but it is not itself a price prediction.

---

## 6. Review Outcome

| Field | Decision |
|---|---|
| sourceCandidate | `EIA:STEO:COPS_OPEC` |
| sourceReachable | yes |
| freePublicSource | yes, with EIA API key |
| liveFetchApproved | yes, only for the 2026-06-09 owner-approved `macroDrivers.energySpareCapacity` Daily implementation |
| productionDataWriteApproved | yes, only through normal `build-daily-radar-data.yml` / `data/radar-data.json` generation;manual JSON edits remain disallowed |
| displayOnlyCandidate | yes |
| scoringAllowed | no |
| recommendedNextStep | implemented as a narrow Daily macroDriver layer;frontend surfacing remains a separate decision |

---

## 7. Implementation Follow-up(2026-06-09)

Owner approved connecting OPEC spare capacity after the source-review phase. The approved scope is intentionally narrow:

- Fetch only EIA STEO `COPS_OPEC` through the existing Daily radar-data generation path.
- Store only under `macroDrivers.energySpareCapacity`.
- Use `EIA_API_KEY` only in the `Generate radar data` step;do not print or persist the key.
- Keep stale/missing behavior fail-closed:carry last-good only while the latest period is not stale;otherwise render null + stale/missing status.
- Preserve source wording as EIA STEO estimate / forecast;never present as real-time physical barrels, OPEC official quota execution, blockade probability, or oil price prediction.
- Do not touch frontend, Worker runtime, `values.*`, `displayInputsBaseline`, `effectiveDisplayInputs`, scoring, decision, execution, position, Brent promotion, World Order weights, Action Queue, Trigger Monitor, Invalidation Rules, or Global Risk Heatmap.

The chokepoint transport source-review remains separate and is not approved by this OPEC implementation.
