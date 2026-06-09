# Energy Transport Chokepoint Source Review(source-review + implementation follow-up)

> **Source-review baseline.** 本文最初只登记咽喉转运 / 航运候选源;不写 fetcher、不接 runtime、不改 `data/*.json`、不改 frontend、不触发 workflow、不进 scoring / decision / execution / position。Owner 后续批准一个 source-specific implementation:只允许 IMF PortWatch `Daily_Chokepoints_Data` 写入 `macroDrivers.energyTransport`,仍保持 audit-only / display-only。
> **实现层命名**:`macroDrivers.energyTransport` / `Energy Transport Chokepoint Evidence Layer`。
> **调研日期**:2026-06-09。

---

## 0. Executive Decision

**结论:IMF PortWatch 可作为 display-only 咽喉转运源;BDI 不需要新增源。** First implementation has since landed as `macroDrivers.energyTransport`; frontend display and terms-enum refinement remain separate stages.

最有价值的免费候选:

- IMF PortWatch `Daily_Chokepoints_Data`
- public ArcGIS FeatureServer query endpoint
- fields include tanker counts and capacity by chokepoint
- official public/beta platform is confirmed;usage/attribution/redistribution terms should remain an implementation caveat before any automated production fetch

已有覆盖:

- `macroDrivers.shippingFreight` 已接 StockQ BDTI / BCTI / BDI,作为 freight pressure proxy。
- `worldOrderStress` 已有 `blockadeOrChokepointEvents` GDELT narrative count。

本文最初**不批准** live fetch。Owner later approved a separate implementation brief and runtime PR for the Daily `macroDrivers.energyTransport` data path only; no frontend surface or scoring connection was approved by that first runtime stage.

---

## 1. Grounding Evidence

IMF / Oxford PortWatch 官方说明:

- PortWatch 是公开 beta 平台。
- 使用 satellite-based vessel data + big data analytics。
- 目标是 monitor / simulate maritime trade disruptions。

IEA 的 Middle East Maritime Chokepoints Shipping Monitor 明确写明:

- data drawn from IMF PortWatch
- covers key Middle East chokepoints
- warns that GPS jamming, AIS spoofing, and vessels going dark are limitations in the region

IMF data-download page for chokepoints shows:

- `Transit Calls`
- `Transit Trade Volume`
- Sources: `UN Global Platform; PortWatch`

PortWatch API surface:

- official pages expose public dashboards / data-download views
- the working query endpoint is ArcGIS REST, not the general IMF SDMX API
- no dedicated PortWatch API TOS was pinned in this first review, so first implementation kept attribution and redistribution caveats explicit. A later TOS pin review found the exact ArcGIS item `licenseInfo` points to IMF terms; see `PORTWATCH_TOS_PIN_REVIEW.md`.

Local endpoint probe:

```text
https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0
```

metadata:

- name: `Daily_Chokepoints_Data`
- capabilities: `Query`
- lastEditDate: `2026-06-02T12:35:14.297Z`
- fields:
  - `date`
  - `portid`
  - `portname`
  - `n_tanker`
  - `n_total`
  - `capacity_tanker`
  - `capacity`
  - plus container / dry bulk / general cargo / RoRo fields

Latest sampled records(2026-05-31):

| portid | portname | n_tanker | n_total | capacity_tanker | capacity |
|---|---|---:|---:|---:|---:|
| `chokepoint1` | Suez Canal | 9 | 29 | 438288 | 1062270 |
| `chokepoint2` | Panama Canal | 10 | 29 | 351332 | 946555 |
| `chokepoint4` | Bab el-Mandeb Strait | 11 | 30 | 269422 | 792591 |
| `chokepoint5` | Malacca Strait | 67 | 203 | 1931352 | 6524939 |
| `chokepoint6` | Strait of Hormuz | 2 | 10 | 594 | 154946 |
| `chokepoint7` | Cape of Good Hope | 17 | 96 | 1466319 | 6560175 |
| `chokepoint8` | Gibraltar Strait | 46 | 145 | 1462711 | 3950079 |

Also present:

- `chokepoint3`: Bosporus Strait

---

## 2. Semantics

Allowed interpretation:

- vessel transit count proxy
- tanker transit count proxy
- tanker capacity proxy
- chokepoint throughput disruption evidence
- rerouting evidence when combined with Cape of Good Hope / Suez / Bab el-Mandeb deltas

Disallowed interpretation:

- war probability
- blockade probability
- final confirmation that a strait is open/closed
- real-time naval intelligence
- oil price prediction
- official customs trade statistic
- sanctioned cargo identification

The Hormuz sample shows why limitation language matters: low AIS-observed tanker counts may reflect disruption, routing, data lag, AIS jamming/spoofing, vessels going dark, or model coverage limits. A future renderer must say "PortWatch AIS-derived proxy", not "actual tanker flow".

---

## 3. Fit With Current Architecture

Allowed future landing:

- standalone `data/energy-transport-chokepoints.json`
- or a display-only `macroDrivers.energyTransport` evidence block
- optional frontend surfacing inside Energy Stress / World Order explanatory copy
- possible future bridge to World Order narrative evidence, **without changing score weights**

Potential derived metrics:

- 7d / 30d / 90d average by chokepoint
- latest vs 30d average for `n_tanker`
- latest vs 30d average for `capacity_tanker`
- Suez + Bab el-Mandeb down while Cape of Good Hope up = rerouting proxy
- Hormuz tanker proxy status with explicit AIS caveat

Disallowed:

- scoring / decision / execution / position
- World Order dimension weight changes
- `blockadeOrChokepointEvents` replacement or direct score injection
- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- Worker realtime payload
- Kpler/MarineTraffic/VesselFinder commercial token path without separate license review

---

## 4. BDI / Baltic Decision

Current repo already has:

```text
macroDrivers.shippingFreight = StockQ:BDTI; StockQ:BCTI; StockQ:BDI
```

This is enough for a freight-pressure proxy today.

Do **not** add an official Baltic Exchange automated source in this stage:

- official Baltic data access is a data-services / benchmark family and may be governed by license / redistribution terms
- current StockQ public proxy is already live and guarded as audit-only / display-only
- BDI is dry bulk, not a chokepoint tanker flow measure

Future PortWatch should complement BDI/BDTI/BCTI, not replace them.

---

## 5. Implementation Sketch(如果未来批准)

Minimum future implementation should be:

1. zero-dependency ArcGIS REST query helper
2. low-frequency scheduled/manual refresh, not realtime
3. query only the 6-8 whitelisted chokepoints
4. pull bounded recent windows, e.g. latest 120 days
5. compute simple deltas locally:
   - latest
   - 7d avg
   - 30d avg
   - latest vs 30d pct
6. metadata:
   - `source: IMFPortWatch:Daily_Chokepoints_Data`
   - `sourceUrl`
   - `sourceStatus`
   - `latestDate`
   - `lastEditDate`
   - `limitations`
7. fail closed if endpoint schema changes, latestDate is stale, or a chokepoint disappears

Suggested UI wording:

```text
PortWatch AIS-derived chokepoint proxy; vessel counts and capacity are observational and can be distorted by AIS spoofing, jamming, vessels going dark, or data lag.
```

---

## 6. Review Outcome + Follow-up Status

| Field | Decision |
|---|---|
| primaryCandidate | `IMFPortWatch:Daily_Chokepoints_Data` |
| sourceReachable | yes |
| publicEndpointReachable | yes |
| firstReviewUsageTermsPinned | partial;official public platform confirmed, dedicated API redistribution terms not pinned in this first review |
| tosPinFollowUp | exact ArcGIS item `licenseInfo` points to IMF terms;see [`PORTWATCH_TOS_PIN_REVIEW.md`](PORTWATCH_TOS_PIN_REVIEW.md). Runtime enum still remains `partial` until a separate code PR. |
| liveFetchApproved | originally no;later owner-approved via implementation brief for Daily `macroDrivers.energyTransport` only |
| productionDataWriteApproved | originally no;later owner-approved and production-live proven for compact `macroDrivers.energyTransport` only |
| frontendApproved | no implementation yet;docs-only display brief exists in [`ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md`](ENERGY_STRESS_FRONTEND_DISPLAY_BRIEF.md) |
| displayOnlyCandidate | yes |
| scoringAllowed | no |
| BDIAction | no new source; keep existing StockQ proxy |
| recommendedNextStep | future UI implementation or TOS enum code follow-up only after explicit owner approval |

---

## 7. Implementation Brief Follow-up(2026-06-09)

Owner approved opening a PortWatch source-specific implementation brief after OPEC spare capacity reached production-live status. The brief is tracked in [`ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md`](ENERGY_TRANSPORT_CHOKEPOINT_IMPLEMENTATION_BRIEF.md), and the owner subsequently approved a first runtime implementation limited to Daily `macroDrivers.energyTransport` data path + validator/check/docs. Production-live confirmation was completed by a post-commit Daily run and artifact verification.

This follow-up does **not** approve frontend rendering, World Order scoring changes, or oil/war probability language. Frontend display and TOS enum changes remain separate owner-approved stages.
