# Energy Transport Chokepoint Implementation Brief(owner-approved · docs-only)

> **Implementation design contract.** This document was first landed as docs-only; owner subsequently approved the first runtime implementation to follow this brief. Scope remains limited to the Daily `macroDrivers.energyTransport` data path + validator/check/docs; no frontend surface, workflow change, standalone data snapshot, raw AIS-derived history dump, or scoring connection is approved here.
>
> Target source: IMF PortWatch `Daily_Chokepoints_Data` via public ArcGIS FeatureServer query.
>
> Target landing: `macroDrivers.energyTransport` as a compact display-only evidence block.

---

## 0. Decision

Proceed with a narrow implementation PR for an Energy Transport / Chokepoint Evidence Layer, following the same staged pattern as OPEC spare capacity:

1. **Expand**: add optional `macroDrivers.energyTransport` schema + resolver + validator/checker/docs.
2. **No frontend in first knife**: first implementation proves Daily data path only.
3. **Contract**: after a successful manual Daily run commits live data, verify the layer is `live` and appears only under `macroDrivers`.
4. **Then decide UI**: any frontend Energy Stress / World Order explanatory surface is a separate owner-approved brief.

The source remains an AIS-derived public proxy. It must never be written as actual tanker flow, official trade statistics, blockade confirmation, war probability, or oil price prediction.

---

## 1. Source Grounding

Primary endpoint:

```text
https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query
```

Implementation query shape:

```text
f=json
where=portid IN ('chokepoint1','chokepoint2','chokepoint3','chokepoint4','chokepoint5','chokepoint6','chokepoint7','chokepoint8')
outFields=date,portid,portname,n_tanker,n_total,capacity_tanker,capacity
orderByFields=date DESC
returnGeometry=false
resultRecordCount=<bounded>
```

Verified fields on the layer metadata:

- `date`
- `portid`
- `portname`
- `n_tanker`
- `n_total`
- `capacity_tanker`
- `capacity`

Local probe on 2026-06-09 returned latest rows dated `2026-05-31` for the expected chokepoints, including Suez, Bab el-Mandeb, Malacca, Hormuz, Cape of Good Hope, and Gibraltar.

Source / limitation references that implementation docs and data notes must preserve:

- IMF data-download page attribution: `Sources: UN Global Platform; PortWatch`.
- ArcGIS layer is public and queryable, with `Daily_Chokepoints_Data` fields above.
- IEA's Middle East chokepoint monitor says it draws on IMF PortWatch and warns about GPS jamming, AIS spoofing, and vessels going dark.
- No dedicated PortWatch API redistribution terms were pinned in source-review; implementation must keep `usageTermsPinned: partial` and avoid committing raw 120-day record dumps.

---

## 2. Landing

Use `macroDrivers.energyTransport`, not a standalone production JSON, for the first implementation.

Reasons:

- This is a low-frequency evidence layer, similar to `macroDrivers.energySpareCapacity`.
- It lets Daily validation and post-run verification use the existing `data/radar-data.json` path.
- A compact summary avoids redistributing full raw AIS-derived history.
- It keeps PortWatch separate from `worldOrderStress.blockadeOrChokepointEvents`, which remains a GDELT narrative count.

Do not write:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- `decisionModel`
- `executionLock`
- `positionGuidance`
- `activeSignals`
- `gatingEvaluation`
- `brentPricingLayer`
- `worldOrderStress`
- `data/world-order-stress.json`
- Worker realtime payloads
- frontend DOM / renderer code in the first implementation PR

---

## 3. Proposed Schema

```json
{
  "source": "IMFPortWatch:Daily_Chokepoints_Data",
  "sourceUrl": "https://portwatch.imf.org/",
  "queryUrl": "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query",
  "sourceStatus": {
    "chokepoints": "live"
  },
  "usageTermsPinned": "partial",
  "redistributionCaveat": true,
  "latestDate": "YYYY-MM-DD",
  "latestAgeDays": 0,
  "windowDays": 120,
  "fetchedAt": "ISO-8601",
  "lastEditDate": "ISO-8601 or null",
  "chokepoints": {
    "hormuz": {
      "portid": "chokepoint6",
      "portname": "Strait of Hormuz",
      "latest": {
        "date": "YYYY-MM-DD",
        "nTanker": 0,
        "nTotal": 0,
        "capacityTanker": 0,
        "capacityTotal": 0
      },
      "avg7d": {
        "nTanker": 0,
        "capacityTanker": 0
      },
      "avg30d": {
        "nTanker": 0,
        "capacityTanker": 0
      },
      "latestVs30dPct": null,
      "capacityTankerVs30dPct": null,
      "sourceStatus": "live"
    }
  },
  "reroutingProxy": {
    "redSeaToCapeRegime": "unknown",
    "suezBabTankerVs30dPct": null,
    "capeTankerVs30dPct": null,
    "notes": []
  },
  "limitationZh": "PortWatch AIS-derived chokepoint proxy; vessel counts and capacity are observational proxies and may be distorted by GPS jamming, AIS spoofing, vessels going dark, routing changes, or data lag. Not official trade statistics, blockade confirmation, war probability, or oil price prediction.",
  "notes": []
}
```

Allowed `sourceStatus.chokepoints`:

- `live`
- `fallback`
- `missing`
- `stale`

Allowed per-chokepoint `sourceStatus`:

- `live`
- `missing`
- `insufficient_window`

Whitelisted chokepoints:

| Key | portid | portname |
|---|---|---|
| `suez` | `chokepoint1` | Suez Canal |
| `panama` | `chokepoint2` | Panama Canal |
| `bosporus` | `chokepoint3` | Bosporus Strait |
| `babElMandeb` | `chokepoint4` | Bab el-Mandeb Strait |
| `malacca` | `chokepoint5` | Malacca Strait |
| `hormuz` | `chokepoint6` | Strait of Hormuz |
| `capeGoodHope` | `chokepoint7` | Cape of Good Hope |
| `gibraltar` | `chokepoint8` | Gibraltar Strait |

---

## 4. Resolver Plan

Add to `scripts/run-daily-pipeline.mjs`:

- constants:
  - `ENERGY_TRANSPORT_SOURCE = 'IMFPortWatch:Daily_Chokepoints_Data'`
  - `ENERGY_TRANSPORT_QUERY_URL`
  - `ENERGY_TRANSPORT_FETCH_TIMEOUT_MS = 10000`
  - `ENERGY_TRANSPORT_WINDOW_DAYS = 120`
  - `ENERGY_TRANSPORT_STALE_DAYS = 21`
- helpers:
  - `buildEnergyTransportQueryUrl()`
  - `parseEnergyTransportRows(payload)`
  - `groupEnergyTransportByChokepoint(rows)`
  - `averageWindow(rows, days, field)`
  - `pctChange(latest, base)`
  - `classifyRedSeaToCapeRerouting(...)`
  - `buildMissingEnergyTransport(reason)`
  - `normalizePreviousEnergyTransport(prev, reason)`
  - `resolveEnergyTransport(prevMd.energyTransport)`

Fetch rules:

- zero dependencies
- no API key / no secret
- User-Agent `GFRRBot/1.0`
- short timeout + try/catch
- query only whitelisted `portid`
- fetch bounded latest window only; do not commit raw record arrays
- parent `live` only if the latest date is not stale and core chokepoints are present
- if endpoint schema changes, required fields are missing, or all rows are stale, fail closed to `missing` / `stale`
- carry previous value only if the previous `latestDate` is not stale

Suggested core chokepoints for parent `live`:

- Suez
- Bab el-Mandeb
- Malacca
- Hormuz
- Cape of Good Hope
- Gibraltar

Panama and Bosporus may be included as observed routes but should not be required for the first parent live gate.

---

## 5. Derived Metrics

Per chokepoint:

- latest `n_tanker`
- latest `n_total`
- latest `capacity_tanker`
- latest `capacity`
- 7-day average `n_tanker`
- 30-day average `n_tanker`
- 30-day average `capacity_tanker`
- latest tanker count vs 30-day average percent
- latest tanker capacity vs 30-day average percent

Rerouting proxy:

- `suezBabTankerVs30dPct`: average of Suez + Bab el-Mandeb latest-vs-30d where both are live
- `capeTankerVs30dPct`: Cape of Good Hope latest-vs-30d
- `redSeaToCapeRegime`:
  - `rerouting_watch` when Suez/Bab are down materially while Cape is up materially
  - `normal` when both sides are near 30-day averages
  - `unknown` when windows are insufficient

This is a transport-pressure proxy only. It must not say a route is blocked, open, closed, safe, unsafe, or likely to move oil prices.

---

## 6. Validation / Checks

Update `scripts/validate-data.mjs`:

- add optional `validateMacroDriversEnergyTransport(data)`
- expand-then-contract: current committed snapshots may omit the field until the first Daily run
- if present, assert:
  - source exact string
  - sourceStatus enum
  - `usageTermsPinned === 'partial'`
  - `redistributionCaveat === true`
  - date fields are ISO / `YYYY-MM-DD`
  - numeric fields are finite or null
  - chokepoint keys are whitelisted only
  - `limitationZh` contains AIS-derived / spoofing-or-jamming / not official / not war-or-price language
  - no `warProbability`, `blockadeProbability`, `oilPricePrediction`, or `officialTradeStatistic` fields exist

Update `scripts/check-macro-drivers-expanded-auto-ingestion.mjs`:

- require resolver markers in `run-daily-pipeline.mjs`
- require validator marker
- require docs markers in `DATA_CONTRACT`, `DATA_SOURCES`, `AGENTS`, and this brief
- assert live data shape once `macroDrivers.energyTransport` appears in committed `data/radar-data.json`

Do not add `build:world-order`; do not change `check:world-order`; do not change World Order weights.

---

## 7. Docs / Contracts

Implementation PR should update:

- `docs/DATA_CONTRACT.md`
- `docs/DATA_SOURCES.md`
- `docs/PROJECT_BACKLOG.md`
- `AGENTS.md`
- `docs/ENERGY_TRANSPORT_CHOKEPOINT_SOURCE_REVIEW.md` with an implementation follow-up section

Do not update frontend design docs in the first implementation PR unless frontend is explicitly added later.

---

## 8. First Implementation Acceptance

Before commit:

```text
node --check scripts/run-daily-pipeline.mjs
node --check scripts/validate-data.mjs
node --check scripts/check-macro-drivers-expanded-auto-ingestion.mjs
npm run check:macro-drivers
npm run check:data
npm run check:docs
npm run check:all
git diff --check
```

Smoke test:

1. Run a local endpoint probe that does not write files.
2. Optionally run `npm run build:data` locally.
3. If `build:data` changes `data/*.json`, inspect `macroDrivers.energyTransport`, then restore generated `data/*.json` before committing code.

After push:

1. Manually trigger `Build Daily Radar Data`.
2. Confirm `Generate radar data`, `Validate output`, and `Commit updated data files` are green.
3. Pull the Actions commit.
4. Assert committed `data/radar-data.json` contains:
   - `macroDrivers.energyTransport.sourceStatus.chokepoints === 'live'`
   - finite latest tanker/capacity values for core chokepoints
   - `usageTermsPinned === 'partial'`
   - `redistributionCaveat === true`
5. Assert `energyTransport` appears only under `macroDrivers`, not in protected scoring/display-input surfaces.

---

## 9. Explicit Non-Goals

Do not implement in this first code knife:

- frontend card / chart
- World Order score or dimension weight changes
- replacement of `blockadeOrChokepointEvents`
- oil price prediction
- war / blockade / closure probability
- real-time naval intelligence wording
- Kpler / MarineTraffic / VesselFinder / Baltic official licensed integration
- raw AIS history committed to repo
- Worker runtime fetch
- Action Queue / Trigger Monitor / Invalidation Rules behavior

---

## 10. Rollback

If the endpoint becomes unavailable, schema changes, terms become unsuitable, or the Daily run cannot validate:

- remove resolver call from `fetchMacroDrivers` / degraded display-only path
- keep validator optional so existing committed data can pass during rollback
- leave source-review and this brief as historical docs
- do not delete unrelated OPEC spare capacity or StockQ shipping freight layers
