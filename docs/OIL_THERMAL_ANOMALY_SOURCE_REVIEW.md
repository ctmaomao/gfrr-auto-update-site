# Oil Thermal Anomaly Source Review — NASA FIRMS / VIIRS candidate

Status: P19 source-review + manual diagnostic tooling only. No runtime fetch, no workflow,
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

## P12 Manual Diagnostic Scaffold

P12 adds a local/manual diagnostic command only:

```powershell
$env:FIRMS_MAP_KEY = "<your NASA FIRMS MAP_KEY>"
npm run diagnose:firms-thermal -- --bbox 47,23,58,31 --day-range 1
```

The command calls the bounded FIRMS Area API route and writes only an ignored
manual artifact:

```text
manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json
```

The default source is `VIIRS_SNPP_NRT`, the default bbox is `47,23,58,31`, and
the default day range is `1`. A header-only CSV response is valid and means the
API/key/path worked but there were no detections in that bounded area/window. The
diagnostic summarizes row count, latest acquisition time, max FRP and confidence
counts when detections exist.

Boundary:

- no committed MAP_KEY;
- no scheduled workflow;
- no browser-side FIRMS fetch;
- no `data/*.json` or `realtime/*.json` write;
- no facility whitelist yet;
- no production display, scoring, decision, execution, position, Brent promotion,
  ODP `finalBias`, Global Risk Heatmap or cross-validation impact.

Use the dry run for syntax/argument checks without network or a key:

```powershell
npm run diagnose:firms-thermal -- --dry-run
```

### Local Key Storage

For repeat local diagnostics, the script also supports an ignored local key file:

```text
manual-artifacts/oil-thermal/firms-map-key.txt
```

Resolution order:

1. `FIRMS_MAP_KEY` environment variable.
2. `--map-key-file <path>` when provided, otherwise the default
   `manual-artifacts/oil-thermal/firms-map-key.txt`.

The key file must stay under ignored `manual-artifacts/`. The script never prints
the key and only records `mapKeySource` such as `env:FIRMS_MAP_KEY` or
`file:manual-artifacts/oil-thermal/firms-map-key.txt`.

## P13 Facility-Level Manual Batch Diagnostic

P13 extends the same manual command with an operator-provided facility list:

```powershell
npm run diagnose:firms-thermal -- `
  --facilities manual-artifacts/oil-thermal/facilities.json `
  --sources VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT `
  --day-range 5
```

The facility list is intentionally ignored when placed under `manual-artifacts/`.
The committed schema example is:

```text
docs/fixtures/oil-thermal/facilities.example.json
```

Each facility must have:

- `id`
- `label`
- `bbox` as `west,south,east,north` string or `[west,south,east,north]` array
- `region` when using `--strict-facilities`
- `assetType` when using `--strict-facilities`
- `sourceNote` when using `--strict-facilities`

Guardrails:

- facility bbox max span is 1.5 degrees per axis;
- max 50 facilities per manual run;
- max 150 FIRMS requests per manual run;
- `--sources` is allowed only with `--facilities`;
- output still writes only the ignored manual artifact path.

The batch artifact uses schema `firms-facility-thermal-diagnosis-1` and reports
per-facility:

- source-level row count, latest acquisition time, max FRP, confidence counts and
  day/night counts;
- aggregate `sourceAgreement` such as `2/3`;
- `anomalyLevel` in `none_observed` / `low_signal` / `watch` /
  `elevated_watch`.

`anomalyLevel` is a manual diagnostic heuristic only. It is not a production signal,
not an incident confirmation, not an outage confirmation, and not an oil-price
forecast.

### Progress Logging

P15 adds default progress logs for non-dry-run diagnostics. Progress logs are written
to `stderr`, while the final machine-readable JSON remains on `stdout`. This keeps
long facility batches observable without changing the artifact contract.

The progress lines include facility id, source id, completed request count and row
count. They must not include the FIRMS MAP_KEY or raw request URLs. Use `--quiet`
to suppress progress logs:

```powershell
npm run diagnose:firms-thermal -- --facilities manual-artifacts/oil-thermal/facilities.json --quiet
```

### Facility List Bootstrap And Strict Validation

P16 adds a convenience initializer for the ignored local facility list:

```powershell
npm run init:firms-facilities
```

If `manual-artifacts/oil-thermal/facilities.json` does not exist, the command creates
it from the committed example. If it already exists, the command validates it and
does not overwrite operator edits. The generated/validated file remains ignored and
must be filled with operator-reviewed public facility coordinates before any live
facility diagnosis.

The same strict validation can be used with dry-run or live facility batches:

```powershell
npm run diagnose:firms-thermal -- `
  --dry-run `
  --strict-facilities `
  --facilities manual-artifacts/oil-thermal/facilities.json `
  --sources VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT `
  --day-range 5
```

Strict mode requires `region`, `assetType` and `sourceNote` for every facility. This
only improves manual review quality; it does not promote the facility list to a
production whitelist.

### Artifact Review Helper

P17 adds an offline review helper for the ignored diagnostic artifact:

```powershell
npm run review:firms-thermal
```

By default it reads:

```text
manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json
```

and writes another ignored manual artifact:

```text
manual-artifacts/oil-thermal/firms-thermal-review-latest.json
```

The review helper does not read the FIRMS key, does not call the network and does
not write production data. It checks:

- supported FIRMS diagnostic schema;
- artifact freshness;
- whether FIRMS URLs stayed redacted;
- whether the manual-only boundary is present;
- whether the facility list still contains example rows;
- whether facility metadata is missing;
- whether detections require manual review.

The review result always keeps `promotionEligible=false`. `WARN` means the artifact
is usable for human source review but not ready for any production display. `FAIL`
means the artifact should be rejected, usually because schema or redaction/boundary
guards failed.

The check suite uses a committed example artifact and does not depend on local keys:

```powershell
npm run check:firms-thermal-review
```

### Facility Coverage Review Helper

P18 adds an offline facility-list coverage review:

```powershell
npm run review:firms-facilities
```

By default it reads:

```text
manual-artifacts/oil-thermal/facilities.json
```

and writes:

```text
manual-artifacts/oil-thermal/firms-facilities-review-latest.json
```

The helper does not read the FIRMS key and does not call the network. It reviews
whether the facility list is suitable for a manual live batch:

- facility count and estimated request budget;
- duplicate or invalid facility ids;
- missing labels, invalid bbox values or oversized bbox spans;
- missing `region` / `assetType` / `sourceNote`;
- example facility rows that still need replacement;
- region and asset-type coverage counts;
- optional required region coverage via `--require-regions`.

Example:

```powershell
npm run review:firms-facilities -- `
  --min-facilities 10 `
  --require-regions "US Gulf,Mideast Gulf"
```

`WARN` means the list can still be used for manual experimentation but is not ready
as a credible facility watchlist. `FAIL` means the list should not be used for live
batch requests until blockers are fixed. This review also keeps `promotionEligible=false`.

### Thermal Baseline And Repeatability Review

P19 adds an offline baseline review helper:

```powershell
npm run review:firms-thermal-baseline
```

By default it reads:

```text
manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json
manual-artifacts/oil-thermal/firms-thermal-baseline.json
```

and writes:

```text
manual-artifacts/oil-thermal/firms-thermal-baseline-review-latest.json
```

The baseline file is still a manual/ignored artifact. The helper does not fetch FIRMS,
does not read the MAP_KEY and does not write production data. It compares each
facility's current diagnostic aggregate against a manual baseline such as:

- `sampleCount`
- `rowCountP95`
- `maxFrpP95`
- `highConfidenceCountP95`
- `sourcesWithDetectionsP95`
- `frpOver50CountP95`

The helper flags a repeated watch only when current detections show both:

- enough source repeatability, controlled by `--min-repeat-sources`;
- at least one strength metric above a sufficiently sampled baseline, controlled by
  `--min-baseline-samples`.

Missing baseline is explicit. Without `--require-baseline`, it is a `WARN`; with
`--require-baseline`, it is a `FAIL`. Even when the review reports
`elevated_manual_review_required`, it still means manual source review only. It is
not an outage confirmation, not a supply interruption confirmation and not an oil
price forecast.
