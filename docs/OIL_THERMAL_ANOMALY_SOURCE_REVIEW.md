# Oil Thermal Anomaly Source Review — NASA FIRMS / VIIRS candidate

## Current status and evidence boundary (2026-11-15)

This section supersedes historical implementation/status statements below. The
current system produces a **backend thermal observation artifact**, not an oil-price
predictor. The independent Oil Market page also exposes its raw observations and
limitations read-only. The legacy thermal card remains retired; the research
primitives below are not connected to that page or scoring. This review does not
approve scoring, a new data source, paid access, or a new baseline cohort.

Verified artifact: [`c773c6c3`](https://github.com/ctmaomao/gfrr-auto-update-site/blob/c773c6c318bf997df77b7cd137a37a00a7464912/data/oil-thermal-watch.json),
generated `2026-11-15T22:51:10.199Z` by natural scheduled run
[43771552778](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43771552778).
It contains 42 watched areas, 79 detections in 17 areas, and a latest acquisition
at `11:29Z`, unchanged from the previous snapshot, not a new event. All 25 empty
areas retain null FRP and acquisition time. Both public sites matched SHA256
`21806fc3ed5ad566eb75932808a8496ed31dc1163d240177adc2fbc879e83c73` at verification.
These are area proxies, not confirmed facility incidents or complete coverage.
The configured +/-0.05 degree boxes are not verified asset polygons.

- S-NPP retirement is enforced before network access: 42 logical retired requests,
  zero attempts or retries; the remaining NOAA-20/21 made 84 actual attempts with
  zero retries. See [ADR-0086](ADR/0086-oil-thermal-source-retirement.md).
- All 42 comparisons with the old three-source baseline are suspended. That
  baseline ends `2026-09-05T04:33:15.490Z`; its historical 30-day maturity does not
  establish present comparability. Current post-retirement samples remain excluded
  by the existing health gate; simply waiting 30 days cannot promote them.
- [PR #579](https://github.com/ctmaomao/gfrr-auto-update-site/pull/579) fixes missing
  FRP becoming zero and malformed acquisition clocks in watch/diagnostic parsing.
  Full local checks, independent review and exact CI passed. The natural run above
  used checkout `97a23bf7`, containing #579 and #581; its observed output preserves
  the missing-value and paused-comparison boundaries. Baseline sample review also
  preserves unknown FRP and reports measured/missing counts. Available-only FRP
  statistics are diagnostic: any facility cohort containing missing FRP is held
  from candidate promotion, avoiding an implicit switch to a conditional estimator.
  This does not establish or activate a new comparable cohort.
- Git snapshots retain cross-source facility aggregates, not unique observation
  identities or valid-overpass/cloud denominators. Repeated snapshots cannot be
  counted as independent events or used to reconstruct unavailable raw history.
  For example, the Yanbu summaries generated on November 14 at 18:06 and 22:27
  both refer to the same latest 10:51 acquisition, two rows and maximum FRP 65.76.

## Prospective evidence pilot (design only, no runtime activation)

The first useful target is **an energy-facility event worth investigating**, not
Brent direction. An upstream/export interruption may reduce crude supply; a
refinery interruption can reduce crude demand while constraining products. Thermal
intensity alone cannot identify which mechanism applies. Normal flaring,
startups/shutdowns and nearby unrelated fires are competing explanations.

The research target is global, stratified by production, refining, export ports,
transport bottlenecks and inventories. Keep those physical mechanisms separate
from market confirmation and the non-satellite baseline. A 3–5 asset development
validation group is an initial test set, not the final coverage target or evidence
of global capability. Verify boundaries, asset types, normal flare locations and
source attribution before interpreting observations; preserve existing broad boxes
as area proxies until then. This design does not expand the live query budget or
approve another satellite product to fill an evidence gap.

Minimum prospective contract, to implement and test offline before collection:

| Record | Required evidence and invariant |
|---|---|
| Scope | Facility/area ID, asset type, geometry revision and provenance; verified asset versus area-proxy status remain distinct. |
| Observation | Product/satellite, acquisition UTC, processing/version identity where supplied, stable dedup identity, FRP with units and null preserved, confidence and day/night. A missing identity cannot become a new event. |
| Availability | First locally received UTC and fetch UTC, request window, code/config/source-cohort version. `firstSeen` must never be backdated to acquisition time; revised source values remain separate revisions. |
| Request outcome | Retired, error, invalid response, successful zero rows and successful detections remain distinct. An HTTP success is not a valid-overpass/cloud-free denominator. Unavailable coverage evidence stays unknown. |
| Privacy/storage | No MAP_KEY, credential-bearing URLs or unreviewed raw CSV publication. Derive bounded sanitized identities from in-memory records; any retained spatial evidence/storage or redistribution change needs its own reviewed contract. Existing aggregates cannot supply missing identities retrospectively. |
| Independent event | Operator/government/port evidence, first-publication time, event time/uncertainty, planned versus unplanned activity, recovery and affected asset. A satellite alert cannot label itself as a confirmed outage. |

Keep the old three-source cohort separate. Any new NOAA-20/21 baseline needs its
own source/geometry/day-night definitions and missing-value handling, not a
relaxed old health gate. Without observation opportunity data, no-detection or
falling counts must not be interpreted as normal operation or declining production.

Validation proceeds in order: (A) event identification, (B) useful lead time beyond
existing information, (C) incremental market-risk value beyond the existing
non-satellite baseline. Passing A does not pass B or C. Freeze event grouping,
features, evaluation horizons and acceptance thresholds before examining test
outcomes; use chronological holdouts and held-out facilities, keeping overlapping
windows and the same event together. Measure event precision/recall where a
credible event inventory exists, false alerts per facility-month, data gaps and
lead time using actual availability clocks. For any later Brent test, align
contract/roll and trading calendars, control repeated model trials, and report
uncertainty rather than direction hit-rate alone.

Review progress monthly, but require enough independent labeled events rather than
promising a calendar date for success. Missing labels, missing coverage, excessive
false alerts or no sample-out-of-time increment are stop/hold results, not reasons
to lower gates. A defensible conclusion of no useful increment also completes the
research. No frontend restoration or score promotion follows automatically.

Source constraints and scientific context:

- [NASA FIRMS limitations](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php):
  clouds, smoke and observation timing can hide events; zero detections is not safety.
- [NASA LANCE](https://lance.modaps.eosdis.nasa.gov/index.php): near-real-time
  processing latency follows an observation, not continuous site surveillance.
- [EOG VIIRS Nightfire](https://eogdata.mines.edu/products/vnf/): current access is
  through a Data Use License; personal/noncommercial use does not establish free
  access or republication permission. It is not an activated fallback here.
- [Brandt 2020 flaring validation](https://smartfields.stanford.edu/publications/journal-articles/accuracy-satellite-derived-estimates-flaring-volume-offshore-oil-and)
  validates annual flaring estimates, not daily crude production or Brent forecasts.
- [IMF PortWatch research](https://www.imf.org/en/publications/wp/issues/2025/05/16/nowcasting-global-trade-from-space-566957)
  supports transport-activity proxies, not observed oil cargo barrels; reuse of
  existing GFRR transport data can provide corroborating/conflicting/unknown context.

## Implemented offline receipt primitive (fixture-only)

`scripts/oil-directional/thermal-shadow-ledger.mjs` implements
`appendThermalReceipt` and `validateThermalLedger`, exercised by the corresponding
unit test. This is a bounded synthetic receipt/deduplication primitive, **not** the
complete prospective contract, a real collector, verified asset registry or global
coverage. It has no network, filesystem, system clock, workflow, frontend or score
connection. The fixed manifest is scope-neutral rather than a hardcoded refinery
list; a real global scope/geometry registry is a separate requirement.

It preserves receipt-derived first-seen clocks, unique observation identities and
content revisions; duplicate observations do not become independent events. Source
sets, geometry/configuration and cohort identities cannot silently mix. Null FRP
and real zero remain distinct, request outcomes remain explicit, and coverage stays
`unknown`. Labels are deliberately empty, never inferred from thermal records.

Deterministic replay checks internal consistency, not authenticity or tamper-proof
storage. A caller can replace both receipts and derived state consistently; this
module cannot authenticate claimed arrival times, upstream identity construction
or data provenance. Outputs therefore remain `synthetic_fixture_only` and
`eligibleForEvaluation=false`, even when validation passes. Real collection,
independent event labels and globally stratified evaluation must be separately
implemented and verified; no first-seen history may be backfilled from old snapshots.

## Verified global catalog subset, not operational monitoring

`scripts/oil-directional/ogim_catalog.py` provides the manual, offline
`import_verified_local(path, version='OGIM_v3.0')` entry (Python 3.11+ standard
library). It returns bounded JSON bytes and does not write files, fetch sources,
activate collection, or feed production/frontend/scoring. The original GPKG and
any returned catalog belong outside Git or in ignored manual artifacts, never in
`data/`. The input is pinned to the complete official file size, MD5 and SHA256;
unknown versions, changed schemas or integrity failures are rejected, not silently
remapped. Tests use small synthetic databases, never a live download or the 3.42 GB
file in CI.

The [official OGIM v3 record](https://zenodo.org/records/22835235) is CC-BY-4.0,
published September 18, 2026, with underlying information from 2025 and earlier.
Source attribution and a modification notice are retained in each output. Its
`SRC_DATE` is the original source's publication/last-update date, not the facility
observation date, and is not inferred from the OGIM release date. No independent
complete v3 capacity dictionary was found, so capacity/throughput are not read or
interpreted. `FAC_STATUS` and `OGIM_STATUS` remain raw labels, not verified operation.

An independently reproduced local import of the verified file produced **8,256
source records**: 692 refinery, 3,661 petroleum-terminal and 3,903 offshore-platform
records. These are three directory tables, not all OGIM, unique physical sites,
confirmed crude-export terminals, producing platforms or global oil coverage.
The source-version/table/ID key is not promised stable across future releases.
All 8,256 points passed GPKG/WKB/SRID/attribute consistency checks; this establishes
internal geometric consistency, **not accurate site attribution or asset boundaries**.
7,672 single and 584 composite source references matched the current `Data_Catalog`
structurally; underlying source pages were not thereby reverified.

The deterministic research output is 9,630,651 bytes, SHA256
`7a52e8f90c8c4a5d1f00106d5a76e7c892523f8e4fe23e47a32be318a66fa49b`.
All verified-operating values are null. The five layers remain separate:
directory presence only; verified operation, qualified observation, comparable
history and independent event truth are unknown. No coverage percentage or global
capacity denominator is manufactured. For example, 548 of 692 refinery records
have both status labels `N/A`, and 670 have source publication/update dates before
2025. This static seed cannot serve as a real-time operating assessment.

The adapter is bounded to the three allowlisted tables, 10,000 rows and 20 MB of
output, using read-only immutable SQLite, disabled extensions/trusted schema,
pinned schema hashes and fixed queries. It never executes SQL supplied by the
source database. Missing/sentinel dates and mismatched coordinates stay unresolved;
true zero coordinates remain valid. Incorporating these records into a scope
registry, verifying current operation, joining event/routes without double-counting,
obtaining observations, and validating incremental forecast value remain separate
reviewed work. This import expands the research inventory, not the live FIRMS budget.

The separate `thermal-research-acceptance.mjs` primitive now tests fixture-case
semantics only: HTTP success, overpass opportunity, spatial coverage and cloud
quality are distinct; independently labeled asset/episode/window-bound events
with no qualified observation remain unassessable. It retains planned/unplanned/
unknown strata and both all-known-event and qualified-observation counts without
claiming real recall, false negatives, lead time, price skill or inventory
completeness. Source-publication and thermal first-known clocks are as-of gates,
not authenticated timestamps. Physical mechanisms stay separate, price prediction
is unimplemented/unknown, and evaluation/main-score eligibility remain false.

## Prospective research receipt sidecar (2026-11-16 implementation)

`thermal-receipt-capture.mjs` reuses the same already-parsed response rows; it
never makes another FIRMS request. The CLI defaults off; `--research-receipt`
opts the existing thermal refresh into the fixed ignored research file, with
strict run/attempt/actual-checkout/config/geometry identity. Invalid metadata
skips research only. A run has separate expected request count, finalized status,
and capture completeness; none proves source/spatial/cloud/overpass coverage.
Body receipt time is recorded after the existing response finishes, not copied
from run-start `generatedAt`. Successful-body parse failure retains that clock;
retired/network failures have null body time and separate classification time.
Strict research-only CSV/product/calendar/coordinate checks can reject research
rows without changing production aggregates/errors/retries. Raw coordinates are
used only inside observation identity hashes, not exported. Processing version
is nullable revision content, not identity; NASA documents [N/N20/N21 satellite
codes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)
and [CSV version fields](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html).
Per-run deduplication/revisions and `firstReceivedInRun` are not physical events;
`crossRunFirstSeen` stays null. All evaluation/main-score eligibility stays false.
The 256 KiB / 150 request / 1,000 observation caps mark research truncation
incomplete. These are **post-response research limits**, not network body caps.
No raw CSV, coordinates, key, URL or exception body is retained. The workflow
checks current run/attempt/checkout and size before uploading one exact file
with seven-day retention. Upload/write/quota failure does not fail production;
missing/expired artifacts remain evidence gaps, not zero detections or persistent
history. Natural collection/upload was subsequently checked in the bounded audit below;
that does not establish authenticated provenance, price prediction, complete
coverage, or an end-to-end evaluation result.

## Natural-run evidence retained before artifact expiry (2026-11-16)

This is a metadata-only audit record, not a retained observation dataset. The authorized scope is to preserve necessary, bounded evidence from already completed runs without provider requests, raw-response storage, production changes, or predictive claims. Source: [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms), part of NASA ESDIS; retain the [FIRMS detection limitations](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php). NASA's [indexed FIRMS use guidance](https://forum.earthdata.nasa.gov/viewtopic.php?t=5184) does not substitute for a completed field-specific redistribution review here. No raw CSV, coordinates, FRP values, individual observation IDs, request URLs, credentials, or full receipts are committed by this record.

[PR #587](https://github.com/ctmaomao/gfrr-auto-update-site/pull/587) merged at 2026-11-16T00:39:20Z. Read-only Actions history spanning that merge identified the first subsequent scheduled run below. Job checkout/capture logs and receipt manifests agree on the actual checkout; event-head SHA alone was not used as proof. Downloaded ZIP digests matched the upload/API digests. These are observed runtime artifacts, unlike synthetic test fixtures, but retain `provenance=unverified_runtime_assertion`.

| Natural scheduled run | Actual checkout | Body-receipt range UTC, 2026-11-16 | Receipt-check / upload completion UTC | Saved artifact / expiration UTC |
|---|---|---|---|---|
| [43817570075](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43817570075), attempt 1 | `10e031de581789c9036e23f522284922df8639b1` | 06:34:00.795–06:34:46.316 | 06:38:13 / 06:38:15 | 14203387138 / 2026-11-23T06:38:13Z |
| [43941319139](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/43941319139), attempt 1 | `94d80a59f8d18d51e6d1683dbe74e9433229e090` | 19:38:09.049–19:38:29.449 | 19:41:56 / 19:41:58 | 14261649674 / 2026-11-23T19:41:56Z |

Both receipts are finalized, with all 126 expected logical request slots recorded and unique source/area pairs and ordinals. In each run S-NPP contributes 42 retired records, **zero network attempts**, null body/HTTP status, and no retries; NOAA20 and NOAA21 each contribute 42 HTTP-200 attempts, with no retries. Per-record start ≤ body reception ≤ classification ≤ validation was checked where applicable. Retired-record validation is not HTTP-body reception. `complete=true` means captured requests, not source/spatial/cloud/overpass coverage.

The first run has 84 zero-row NOAA responses and zero observation objects: it does **not** exercise detection deduplication or first-received observation branches and does not prove absence of physical events. The second run has NOAA20 18 rows across nine detecting responses and NOAA21 24 rows across eight; 42 unique observation IDs, 42 references, zero unresolved references, and one revision each. Earliest in-run receipt times agree with their referring responses. There were no duplicate observations in these two runs, so actual duplicate/revision merging is still not naturally demonstrated. All `crossRunFirstSeen` values remain null; coverage/cloud fields remain unknown; evaluation/main-score eligibility remains false.

| Run | JSON bytes / SHA256 | ZIP bytes / SHA256 |
|---|---|---|
| 43817570075 | 78604 / `2702e0ed72b5e3922785b768e31886fa4b673ea118659f27f8f47b475cc7a97b` | 7204 / `313eec3bc7638db461f0a566e83af3b6a96155f87c5767b551ef4fcd0f1cffad` |
| 43941319139 | 101589 / `2a97efda0de7a147d73cfde0a85ea7f9b0cef4c87571a11458b9f135b9112cdb` | 12386 / `a9e23c1756a6e33f9902b4fd93117fc210234b1b387f848f3498564e503a3f9f` |

JSON sizes are below the 262144-byte cap; uploaded ZIP sizes are not that cap's measurement. Both artifacts contained only `receipt.json`; inspection found no forbidden raw-location/request/credential/body fields. At audit time the [primary](https://radar.gfrfinradar.uk/data/oil-thermal-watch.json) and [backup](https://ctmaomao.github.io/gfrr-auto-update-site/data/oil-thermal-watch.json) public products matched commit `487bddb6`, 104904 bytes, SHA256 `8ad4507ef271d6a115a8817fe5480fca829989ef56a8a0fd4b1e01d7a90a20ac`, generated 19:38:08.490Z: partial/source-unavailable with S-NPP retired and baseline comparison paused. This is a point-in-time comparison, not continued publication assurance.

Seven-day expiry removes the detailed artifact evidence; these hashes/counts cannot reconstruct receipt rows, observation histories or original response bytes. Re-fetching later cannot recreate earlier availability clocks. A durable prospective ledger would need a separately reviewed minimal schema, authorized storage and source-use scope, explicit missing-run/expiry markers, immutable receipt identities and append-only revisions, and no backfilled first-seen claims. This summary neither implements that ledger nor authorizes continuous retention; it preserves only this bounded collection/upload audit. No prices, event labels, model fitting, physical-output inference or forecast validation were produced.

## Historical source-review and implementation record

The sections below preserve earlier design and implementation history. References
to an allowed display role or starter coverage are historical, not current frontend
or promotion permission. Current status and the stricter boundaries above prevail.

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

The original P24 baseline file intentionally started with `status=not_established`
and an empty `facilities[]` list. It defined the minimum evidence policy for
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

P24 introduced possible future signal states such as `baseline_repeated_watch` and
`baseline_elevated_repeated_watch`. P48 later promotes reviewed starter rows, so
current production output can move into `baseline_established_*` states while still
keeping all incident, outage and oil-price language out of the signal.

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

At P25 introduction time, a single committed production sample correctly returned
`warn` / `collect_more_samples_before_baseline_candidate_review`. After later P47
history recovery and P48 promotion, the same helper can review the ignored sample
archive and produce established starter candidate rows. The committed synthetic
fixtures only prove the math and contract path for the checker; they are not
production thermal evidence.

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

## P47 Baseline Readiness Preparation

P47 adds a local preparation wrapper:

```text
scripts/oil-directional/prepare-oil-thermal-baseline-review.mjs
npm run prepare:oil-thermal-baseline-review
npm run check:oil-thermal-baseline-readiness-prep
```

The helper chains the P27 git-history archive and the P25 baseline sample review.
It writes only ignored artifacts under:

```text
manual-artifacts/oil-thermal/watch-samples/
manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json
manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json
```

The P47 readiness artifact reported 15 valid unique production-watch samples and
12/12 starter facilities ready for baseline review. It still kept
`promotionEligible=false` and `productionBaselineWriteApproved=false`; readiness
only means a separate reviewed production-config promotion can be considered.

## P48 Starter Production Baseline Promotion

P48 adds the reviewed production-config promotion path:

```text
scripts/oil-directional/promote-oil-thermal-baseline-candidate.mjs
npm run promote:oil-thermal-baseline-candidate -- --write-production-baseline
npm run check:oil-thermal-baseline-config
```

The promotion reads the P25/P47 ignored review artifacts and writes:

```text
config/oil-thermal-watch-baseline.json
```

only when `--write-production-baseline` is explicitly provided. The committed
baseline now has:

- `status=established`;
- 12 U.S. Gulf Coast refinery rows matching the production whitelist;
- 15 sanitized production-watch samples per facility;
- `sampleWindowDays=2.36`;
- `sourceReview.baselineQuality=starter_short_window`.

This is a starter p95 baseline. It is enough to move the production watch from
baseline-building copy into established-baseline copy, but it is not a mature
seasonal or long-history operating baseline. The short-window caveat must remain
visible in the config review metadata, and the frontend wording must continue to
say manual-review thermal proxy only.

P48 also allows `build:oil-thermal-watch` to refresh `data/oil-thermal-watch.json`
with `baseline.status=established`. In the local P48 refresh, the live FIRMS result
was `baseline_established_no_detections`: 36 requests completed, 12/12 facilities
had established baselines, and no current detections were returned in the 1-day
window.

P48 still does not add or allow:

- incident confirmation;
- outage or supply-disruption confirmation;
- oil-price direction;
- ODP `finalBias` mutation;
- scoring, decision, execution, position, Brent promotion, Global Risk Heatmap or
  cross-validation impact.

## P49 Baseline Quality Aging / Rolling Refresh

P49 turns the P47 + P48 manual sequence into a reusable rolling refresh wrapper:

```text
scripts/oil-directional/refresh-oil-thermal-baseline-candidate.mjs
npm run refresh:oil-thermal-baseline-candidate
npm run refresh:oil-thermal-baseline-candidate -- --write-production-baseline
npm run check:oil-thermal-baseline-rolling-refresh
```

The wrapper first runs the git-history sample archive and P25 baseline sample
review, then calls the P49 promotion helper. By default it does not write the
production baseline config; `--write-production-baseline` is still required for
`config/oil-thermal-watch-baseline.json` to change.

Baseline quality now ages by sample window:

- `<7 days` -> `starter_short_window`;
- `7-30 days` -> `starter_observation_window`;
- `>=30 days` -> `established_observation_window`.

The production config records `qualityPolicy`, `qualityTransition` and
`previousBaseline` in `sourceReview`. This makes later refreshes auditable: a
larger sample set can improve the label only when the observed window actually
ages far enough, not merely because the script was rerun.

The local P49 refresh advanced the committed baseline from:

- 15 samples / `sampleWindowDays=2.36` / `starter_short_window`

to:

- 16 samples / `sampleWindowDays=2.48` / `starter_short_window`;
- `qualityTransition=unchanged`.

`build:oil-thermal-watch` now exposes a compact
`data/oil-thermal-watch.json.baseline.sourceReview` summary so the display layer
can explain that the current baseline is established but still short-window.

P49 still does not add or allow:

- incident confirmation;
- outage or supply-disruption confirmation;
- oil-price direction;
- ODP `finalBias` mutation;
- scoring, decision, execution, position, Brent promotion, Global Risk Heatmap or
  cross-validation impact.

## P50 Baseline Quality Frontend Display

P50 adds one display row to the ODP `SATELLITE THERMAL WATCH` panel:

```text
基线质量
```

The row reads only:

```text
data/oil-thermal-watch.json.baseline.sourceReview
```

and displays the current `baselineQuality`, `sampleCount`, `sampleWindowDays` and
`qualityTransition`. For the current P49 artifact this means the user sees that
the facility baseline is established, but still `starter_short_window` because
the observed sample window is below 7 days.

P50 also updates the renderer note and watch-ladder copy so the short-window
starter caveat is visible where the thermal watch is summarized. The copy must
continue to say this is not a mature seasonal or long-history operating
baseline.

P50 does not add or allow:

- new FIRMS requests;
- production data writes;
- baseline-config changes;
- incident confirmation;
- outage or supply-disruption confirmation;
- oil-price direction;
- ODP `finalBias` mutation;
- scoring, decision, execution, position, Brent promotion, Global Risk Heatmap or
  cross-validation impact.

## P51 Baseline Quality Reminder / Artifact-Only Monitor

P51 adds an artifact-only quality monitor for the rolling baseline:

```text
scripts/oil-directional/monitor-oil-thermal-baseline-quality.mjs
npm run monitor:oil-thermal-baseline-quality
npm run check:oil-thermal-baseline-quality-monitor
.github/workflows/oil-thermal-baseline-quality-reminder.yml
```

The workflow runs every 12 hours and can also be manually dispatched. It checks
recent git history for committed `data/oil-thermal-watch.json` samples by reusing
the P47 preparation path, compares the candidate sample window against the current
production baseline quality, and uploads only an ignored monitor artifact:

```text
manual-artifacts/oil-thermal/oil-thermal-baseline-quality-monitor-latest.json
```

If the candidate crosses the 7-day or 30-day quality threshold, the monitor reports
`baseline_quality_threshold_ready` and prints the manual promotion command. It does
not run that command, does not open a PR, does not commit, and does not write
`config/oil-thermal-watch-baseline.json`.

The workflow is intentionally read-only:

- `permissions.contents=read`;
- checkout uses `fetch-depth: 0` only so git-history samples are available;
- no `FIRMS_MAP_KEY` secret is injected;
- no FIRMS API request is made;
- no `data/*.json`, `realtime/*.json`, or production config file is committed.

P51 is a reminder surface only. It does not confirm incidents, outages, supply
disruptions or oil-price direction, and it still does not affect ODP build inputs,
ODP `finalBias`, scoring, decision, execution, position, Brent promotion, Global
Risk Heatmap or cross-validation.

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
