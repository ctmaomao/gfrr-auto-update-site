# PortWatch TOS Pin Review

> **Docs-only terms review.** This document evaluates whether the PortWatch `usageTermsPinned=partial` residual can be moved toward a more specific pinned-terms status. It does not change runtime code, validator enums, `data/radar-data.json`, Daily pipeline, frontend, workflow, scoring, decision, execution, position, or World Order weights.
> **Date**: 2026-06-09.

---

## 0. Decision

The prior `usageTermsPinned=partial` posture was correct for first implementation. After a dedicated review, the project can now pin the source to the IMF Copyright and Usage page, specifically the IMF Data Usage terms, because the exact ArcGIS item for `Daily_Chokepoints_Data` has `licenseInfo` pointing to IMF terms.

Recommended future runtime transition:

```json
{
  "usageTermsPinned": "imf_data_terms_pinned",
  "redistributionCaveat": true
}
```

This is not implemented in this docs PR. A future code PR must use expand-then-contract before changing the committed data shape.

Residual risk is improved but not zero:

- **Resolved enough to pin**: exact ArcGIS item license points to IMF terms; IMF Data Usage terms allow download / extract / derivative works / publish / distribute subject to conditions.
- **Still caveated**: PortWatch data attribution includes `UN Global Platform; IMF PortWatch`; AIS-derived products may include third-party data. IMF terms warn that some statistical products may include third-party information with separate terms.

Therefore, `usageTermsPinned` may move away from generic `partial`, but `redistributionCaveat` should remain `true`.

---

## 1. Evidence

### 1.1 Exact ArcGIS Item

Local probe:

```text
https://www.arcgis.com/sharing/rest/content/items/3da2b9ca97684916b75c4013f95d18ab?f=json
```

Observed metadata:

```json
{
  "id": "3da2b9ca97684916b75c4013f95d18ab",
  "title": "Daily_Chokepoints_Data",
  "owner": "IMF-portwatch_imf_dataviz",
  "access": "public",
  "licenseInfo": "https://www.imf.org/external/terms.htm",
  "url": "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer"
}
```

The layer is a queryable public table:

```text
https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0?f=pjson
```

Observed:

- `name = Daily_Chokepoints_Data`
- `type = Table`
- `capabilities = Query`
- fields include `date`, `portid`, `portname`, `n_tanker`, `n_total`, `capacity_tanker`, `capacity`
- supported export formats include CSV, GeoJSON, KML, Excel, and other GIS formats

### 1.2 PortWatch Catalog Surface

Local probe:

```text
https://portwatch.imf.org/api/feed/dcat-us/1.1.json
```

Observed chokepoint catalog entries point their `license` to:

```text
https://www.imf.org/external/terms.htm
```

The public PortWatch access-data surface describes chokepoint throughput as vessel counts and estimated cargo volumes for key maritime chokepoints and says users can download datasets / integrate data into workflows.

This supports public access, but the legal pin should rely on the exact ArcGIS item `licenseInfo` plus IMF terms, not the marketing/access page alone.

### 1.3 IMF Copyright And Usage

The IMF Copyright and Usage page has an effective date of 2024-10-11 and includes a dedicated "The Use of IMF Data" section.

Key policy implications for this project:

- General IMF content remains more restrictive, and systematic copying / substantial republication may require permission.
- Published statistical data produced or curated by IMF has special data-usage terms.
- IMF Data may be downloaded, extracted, copied, transformed into derivative works, published, distributed, and used subject to attribution, integrity, transformation disclosure, and compliance communication.
- IMF warns that some statistical products may incorporate third-party information and may have separate terms.
- IMF does not represent that it owns or controls all rights in all content.

This is enough to replace "no terms pinned" with "IMF Data Terms pinned", while retaining a third-party / redistribution caveat.

---

## 2. Current Runtime Posture

Current production `macroDrivers.energyTransport` keeps:

```json
{
  "usageTermsPinned": "partial",
  "redistributionCaveat": true
}
```

Current validator enforces this conservative posture.

Current data publication is already minimized:

- no raw 120-day AIS-derived row dump
- only compact derived summary
- latest
- 7d / 30d averages
- relative deviations
- rerouting proxy
- attribution and limitation copy

This compact-only implementation remains the correct posture even after terms pinning.

---

## 3. Recommended Runtime Follow-up

If owner approves a code follow-up, use the same staged discipline as OPEC and PortWatch first implementation.

### Phase A - Expand

- Add allowed enum value `imf_data_terms_pinned` next to `partial`.
- Update Daily `buildEnergyTransportNotes()` / layer builder to emit:
  - `usageTermsPinned: "imf_data_terms_pinned"`
  - `redistributionCaveat: true`
  - attribution note: `Sources: UN Global Platform; IMF PortWatch; IMF Data Terms pinned via ArcGIS licenseInfo`
- Keep all current forbidden-key checks.
- Keep compact-only output.
- Keep `limitationZh` AIS / spoofing / non-official / no-war-probability regex.
- Keep no raw data dump.

### Phase B - Daily Proof

- Manually trigger `Build Daily Radar Data`.
- Pull the workflow commit.
- Confirm `data/radar-data.json.macroDrivers.energyTransport` is live and has:
  - `usageTermsPinned = imf_data_terms_pinned`
  - `redistributionCaveat = true`
  - finite core chokepoints
  - no forbidden keys
  - only one `energyTransport` occurrence, under `macroDrivers`

### Phase C - Contract

Only after the Daily proof commit is live:

- narrow validator from dual enum to final enum if desired
- update `DATA_CONTRACT.md` and `DATA_SOURCES.md`
- run `check:all`

If the owner prefers maximum backwards compatibility, keep both enum values accepted but require the writer to emit `imf_data_terms_pinned`.

---

## 4. What Does Not Change

Terms pinning does not approve:

- publication of raw PortWatch / AIS-derived history
- browser-side PortWatch fetch
- commercial reuse decision
- investment, legal, or compliance advice
- official trade statistics wording
- actual tanker flow confirmation wording
- blockade confirmation
- war probability
- oil price prediction
- scoring / decision / execution / position impact
- World Order weight changes

---

## 5. Source Links

- IMF Copyright and Usage: `https://www.imf.org/en/about/copyright-and-terms`
- IMF terms URL used by ArcGIS licenseInfo: `https://www.imf.org/external/terms.htm`
- PortWatch DCAT feed: `https://portwatch.imf.org/api/feed/dcat-us/1.1.json`
- Exact ArcGIS item: `https://www.arcgis.com/sharing/rest/content/items/3da2b9ca97684916b75c4013f95d18ab?f=json`
- Exact ArcGIS layer: `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0?f=pjson`
- Public access-data surface: `https://www.portstraitwatch.com/access-data`
