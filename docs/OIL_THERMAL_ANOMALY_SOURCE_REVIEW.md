# Oil Thermal Anomaly Source Review — NASA FIRMS / VIIRS candidate

Status: P11 source-review + frontend readiness slot only. No runtime fetch, no workflow,
no production data write.

## Candidate Source

NASA FIRMS provides active fire / thermal anomaly detections from MODIS and VIIRS.
The relevant candidate for ODP is the Area API CSV route:

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]
https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]
```

Official docs:

- https://firms.modaps.eosdis.nasa.gov/api/area/
- https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html

Relevant products:

- `VIIRS_SNPP_NRT`
- `VIIRS_NOAA20_NRT`
- `VIIRS_NOAA21_NRT`
- `MODIS_NRT` as lower-resolution fallback

NASA FIRMS requires a free `MAP_KEY` for API requests. The Area API accepts a bounding
box (`west,south,east,north`) or `world`, with `DAY_RANGE` limited to 1..5. The
official tutorial warns that a global VIIRS request can return tens of thousands of
records per day, so production use must query small facility boxes, not `world`.

Useful CSV fields for an oil-facility watch:

- `latitude`, `longitude`
- `acq_date`, `acq_time`
- `satellite`, `instrument`
- `confidence`
- `frp`
- `daynight`
- `bright_ti4` / `bright_ti5` for VIIRS

## Intended Role In ODP

This source is a near-real-time physical anomaly proxy. It can help observe abnormal
heat output around refineries, terminals, flaring areas or other pre-approved facility
polygons, but it cannot by itself confirm a refinery outage, terminal incident,
shipping disruption or oil-price direction.

Allowed first production role:

- `macroDrivers.energyThermalAnomaly` or a standalone ODP-side read-only artifact.
- Display-only / audit-only.
- Facility-level anomaly count, maximum FRP, and latest observation age.
- A confidence label based on source freshness, facility whitelist coverage and
  repeated detections.

Forbidden role:

- No direct input to `values.*`.
- No scoring / decision / execution / position impact.
- No Brent promotion or ODP `finalBias` mutation.
- No Global Risk Heatmap or World Order weight.
- No browser-side direct API fetch.
- No claim of confirmed incident, outage, supply interruption or oil-price forecast.

## Required Production Gates Before Runtime Fetch

1. Facility whitelist:
   - explicit refinery / terminal / flaring-area coordinates or polygons;
   - source attribution for each coordinate;
   - radius or bounding-box rule per facility;
   - region and asset type labels.

2. Query budget:
   - MAP_KEY stored only as GitHub secret or operator local secret;
   - no committed key;
   - no `world` request in scheduled workflow;
   - bounded number of facility boxes per run.

3. Signal filter:
   - minimum confidence rule;
   - FRP threshold or relative-to-history threshold;
   - day/night handling;
   - repeated-observation rule to reduce one-pass noise;
   - exclusion notes for wildfire/agriculture/urban false positives.

4. Freshness and fallback:
   - source status must degrade to `missing` / `stale` / `not_configured`;
   - no fabricated detections;
   - stale last-good may be displayed only with explicit age and stale status.

5. UI wording:
   - must say thermal anomaly / hotspot proxy;
   - must not say confirmed refinery accident, confirmed outage, supply interruption,
     war probability or oil-price forecast.

## Current P11 Scope

P11 only adds a visible ODP readiness slot: `SATELLITE THERMAL WATCH / 卫星热异常观察`.
It explains that FIRMS / VIIRS is the candidate high-frequency physical signal and
that the source is not yet connected. This is intentional: without facility
coordinates and baseline filtering, the signal would be noisy enough to mislead.

P11 does not add:

- a FIRMS MAP_KEY;
- API calls;
- workflow changes;
- data files;
- facility coordinates;
- model weights;
- ODP classifier changes.
