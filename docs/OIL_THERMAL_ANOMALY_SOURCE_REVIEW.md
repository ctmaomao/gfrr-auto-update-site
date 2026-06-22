# Oil Thermal Anomaly Source Review — NASA FIRMS / VIIRS candidate

Status: P25 production read-only observation artifact is implemented with a
conservative U.S. Gulf Coast refinery starter whitelist plus a manual baseline
sample review helper. Facility coverage is active for a small EIA/HIFLD-derived
refinery set, but historical baseline remains `not_established`, so any detection
is still a manual-review thermal proxy only.

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

- Standalone ODP-side read-only artifact: `data/oil-thermal-watch.json`.
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

## P22 Production Read-Only Artifact

P22 adds the first production shell:

```text
config/oil-thermal-watch-facilities.json
data/oil-thermal-watch.json
.github/workflows/refresh-oil-thermal-watch.yml
npm run build:oil-thermal-watch
npm run check:oil-thermal-watch
```

The workflow reads `FIRMS_MAP_KEY` from GitHub Secrets and commits only the compact
production artifact. It never commits the key, raw FIRMS URLs, or raw fire-point
rows. The initial committed facility whitelist is intentionally empty, so the
valid production state is `facility_whitelist_missing`: the API key may be present,
but no facility boxes are queried until a later reviewed PR adds public, small-box
facility rows with `region`, `assetType`, and `sourceNote`.

P22 is assigned to the GitHub Actions backup/validation layer plus frontend display
layer. It does not modify ODP build inputs, ODP `finalBias`, scoring, decision,
execution, position, Brent promotion, Global Risk Heatmap, or cross-validation.
Historical baseline remains `not_established`; any future detections must be shown
as manual-review thermal proxy only until repeated-observation and baseline rules
are approved.

## P23 Starter Facility Whitelist Source Review

P23 adds the first committed production whitelist rows in
`config/oil-thermal-watch-facilities.json`. The selected source is the directly
downloadable EIA/HIFLD petroleum refineries GIS package:

```text
https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip
```

The package contains `Petroleum_Refineries_US_2021.shp` with 130 refinery point
rows and fields including `Company`, `Site`, `State`, `PADD`, `AD_Mbpd`,
`Latitude`, `Longitude`, `Source`, and `Period_`. The starter scope uses only
large PADD 3 Texas/Louisiana refinery rows and converts each point to a small
`+/-0.05 degree` FIRMS Area API watch box.

Researched but not selected for this first production whitelist:

- EIA refinery capacity reports / XLSX: authoritative for capacity, ownership and
  location, but the EIA/HIFLD GIS package is more directly usable for coordinates.
- Data.gov / DataLumos / Data Rescue HIFLD refinery pages: useful public
  metadata and attribution, but the EIA map-data zip is the simplest reproducible
  fetch path for this repo.
- EIA petroleum product terminal GIS: directly downloadable and promising, but
  terminal points are much noisier for thermal anomaly work, so they remain a
  later reviewed expansion.
- Global Energy Monitor oil infrastructure trackers: useful global infrastructure
  research context, but current public pages focus on pipeline / project tracking,
  not a ready refinery thermal-watch whitelist for this P23 cut.
- University / paper projects such as OGNet / OGInfra: useful methodology context
  for facility detection and satellite-fire modeling, not an operator-reviewed
  refinery coordinate whitelist for this repo.

Starter facilities:

- 12 U.S. Gulf Coast refinery watch boxes.
- Asset type: `refinery` only.
- Regions: `US Gulf Coast / Texas`, `US Gulf Coast / Louisiana`.
- Request budget: 12 facilities x 3 VIIRS NRT sources = 36 requests per run,
  below the production limit of 150.

P23 still does not add terminals, global facility coverage, exact refinery
polygons, incident confirmation, outage confirmation, supply-disruption
confirmation, oil-price prediction, scoring, `decisionModel`, `executionLock`,
`positionGuidance`, Brent promotion, ODP `finalBias`, Global Risk Heatmap, or
cross-validation impact.

## P24 Baseline / Repeated Observation Rule

P24 adds the production baseline policy file:

```text
config/oil-thermal-watch-baseline.json
```

The committed baseline file intentionally starts with `status=not_established`
and an empty `facilities[]` list. It defines only the minimum evidence policy for
future facility baselines:

- at least 8 valid samples per facility before a baseline is established;
- at least 2 FIRMS sources with detections for repeatability;
- above-baseline strength must exceed facility-specific p95 fields;
- elevated repeated watch additionally requires stronger FRP / confidence
  thresholds.

`build-oil-thermal-watch.mjs` now writes baseline metadata and per-facility
`baselineComparison` into `data/oil-thermal-watch.json`. The rule is intentionally
two-gated:

1. established facility baseline;
2. multi-source repeatability plus above-baseline strength.

Without both gates, a FIRMS detection remains a baseline-building or low-signal
thermal proxy. This prevents a refinery's normal heat output, flare stack activity
or single satellite pass from being promoted into an incident interpretation.

P24 introduces possible future signal states such as `baseline_repeated_watch` and
`baseline_elevated_repeated_watch`, but the current committed baseline has no
established facility rows. Therefore current production output remains
`baseline_building_*` until enough samples are reviewed and committed in a later
baseline refresh.

## P25 Baseline Sample Accumulation Review

P25 adds a manual/offline helper for reviewing multiple sanitized production watch
artifacts:

```text
scripts/oil-directional/review-oil-thermal-baseline-samples.mjs
npm run review:oil-thermal-baseline-samples
npm run check:oil-thermal-baseline-samples-review
```

The helper reads one or more `oil-thermal-watch-1` artifacts, or a directory of
such artifacts, and computes facility-level candidate p95 fields:

- `rowCountP95`
- `maxFrpP95`
- `highConfidenceCountP95`
- `frpOver50CountP95`
- `frpOver100CountP95`
- `sourcesWithDetectionsP95`

Default output is ignored:

```text
manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json
```

The output contains `candidateBaseline.candidateOnly=true`,
`promotionEligible=false`, and `productionBaselineWriteApproved=false`. It is a
review packet only; it does not update `config/oil-thermal-watch-baseline.json`
and does not approve a production baseline. A later reviewed change must still
decide whether any candidate rows are mature enough to commit.

With the current single committed production sample, the helper correctly returns
`warn` / `collect_more_samples_before_baseline_candidate_review`: all 12 starter
facilities need more samples before a baseline can be established. The committed
synthetic fixtures only prove the math and contract path for the checker; they
are not production thermal evidence.

P25 does not read `FIRMS_MAP_KEY`, does not access the network, does not write
`data/*.json` or `realtime/*.json`, and does not affect ODP build inputs, ODP
`finalBias`, scoring, decision, execution, position, Brent promotion, Global Risk
Heatmap, or cross-validation.

## P26 Local Watch Sample Archive

P26 adds a local/manual archive helper:

```text
scripts/oil-directional/archive-oil-thermal-watch-sample.mjs
npm run archive:oil-thermal-watch-sample
npm run check:oil-thermal-watch-sample-archive
```

The helper validates a sanitized `oil-thermal-watch-1` artifact and copies it into
an ignored sample archive:

```text
manual-artifacts/oil-thermal/watch-samples/
```

It also writes an ignored sidecar metadata file beside the archived sample. The
sidecar records source path, generated time, summary counts, `productionImpact`
false boundaries, and the next review command. P25's `--input-dir` reader now
skips `*.archive-meta.json`, so the archive directory can be passed directly to:

```powershell
npm run review:oil-thermal-baseline-samples -- --input-dir manual-artifacts/oil-thermal/watch-samples
```

The archive helper refuses raw FIRMS Area API URLs, refuses missing or truthy
`productionImpact`, refuses unsafe input paths, and refuses to write outside
`manual-artifacts/`. It does not read `FIRMS_MAP_KEY`, does not access the
network, does not write production data, and does not approve a production
baseline. P26 by itself only archives the current local production artifact;
P27's git-history helper can recover additional committed samples when they are
available.

## P27 Git-History Watch Sample Archive

P27 adds a read-only git history archive helper:

```text
scripts/oil-directional/archive-oil-thermal-watch-history-samples.mjs
npm run archive:oil-thermal-watch-history-samples
npm run check:oil-thermal-watch-history-sample-archive
```

The helper inspects recent commits that touched `data/oil-thermal-watch.json`,
extracts each commit's sanitized `oil-thermal-watch-1` artifact via `git show`,
skips early watch shells with no facility rows, deduplicates by `generatedAt` and
content hash, and writes valid samples into the same ignored archive directory
used by P26:

```text
manual-artifacts/oil-thermal/watch-samples/
```

This lets an operator recover the latest committed production watch samples
without manually running `archive:oil-thermal-watch-sample` after every scheduled
refresh. Existing sample files are treated as `already_archived` instead of a
fatal error, so the command is safe to repeat:

```powershell
npm run archive:oil-thermal-watch-history-samples -- --max-commits 40 --max-samples 8
npm run review:oil-thermal-baseline-samples -- --input-dir manual-artifacts/oil-thermal/watch-samples
```

The helper uses local git history only. It does not read `FIRMS_MAP_KEY`, does
not access the network, does not run FIRMS requests, does not write `data/*.json`
or `realtime/*.json`, and does not approve production baseline rows. Every sidecar
keeps `productionImpact` false and records the source commit hash for audit.

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

### Combined Manual Watch Review

P20 adds a final offline aggregation helper:

```powershell
npm run review:firms-thermal-watch
```

By default it reads the three ignored review artifacts produced by P17-P19:

```text
manual-artifacts/oil-thermal/firms-facilities-review-latest.json
manual-artifacts/oil-thermal/firms-thermal-review-latest.json
manual-artifacts/oil-thermal/firms-thermal-baseline-review-latest.json
```

and writes:

```text
manual-artifacts/oil-thermal/firms-thermal-watch-review-latest.json
```

The combined helper is the operator-facing watch-pack review. It does not fetch
FIRMS, does not read the MAP_KEY, does not call other providers and does not write
production data. It verifies that each upstream review keeps:

- the expected review schema version;
- `promotionEligible=false`;
- all production-impact fields false;
- the manual-only ODP boundary language;
- no FAIL status before the pack is used for human analysis.

It then summarizes facility coverage, current thermal detections, repeated/baseline
signals and the next human steps. A `WARN` result can still mean the watch pack is
usable for human review, but it never approves a production display, scheduled
workflow, ODP build input or oil-price signal. Any future production display or
workflow must still be a separate reviewed PR with a data contract, UI wording,
stale/missing fallback and facility whitelist decision.
