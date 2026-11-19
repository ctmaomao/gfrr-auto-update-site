# Oil Thermal Anomaly Source Review — NASA FIRMS / VIIRS candidate

## Current status and evidence boundary (2026-11-15)

This section supersedes the archived implementation and status statements. The
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

## Offline EIA refinery context audit

The [2026 EIA Table 1 audit fixture](fixtures/oil-thermal/eia-refinery-capacity-2026.audit.json) records published aggregate refinery counts for PAD District III, Texas and Louisiana, **as of January 1, 2026**, in the **June 26, 2026** release. These are historical survey counts, not present-day operation, satellite coverage, or a denominator for the selected, older U.S. watch boxes. To reproduce, save the versioned PDF from the fixture's `tableUrl` outside Git, then run `python3 scripts/oil-directional/check-eia-refinery-context-audit.py /path/to/table1.pdf` (Python 3 and Poppler `pdftotext`). The verifier uses only the local PDF and checks its pinned bytes before reading Table 1; there is no runtime, scoring, or workflow integration.

## Offline Norwegian fixed surface oil-producer catalogue audit

The [Norwegian Offshore Directorate aggregate fixture](fixtures/oil-thermal/nod-fixed-surface-oil-producers-2026-11.audit.json) filters and aggregates the Directorate's [open facility export](https://www.sodir.no/en/facts/data-and-analyses/open-data/) under [NLOD 2.0](https://data.norge.no/nlod/en/2.0). On November 19, 2026 UTC the downloaded ZIP had 1,229 records and 1,229 unique regulator IDs. Filtering for Norway **registration** (not a geographic assignment), fixed, surface, a nonblank kind other than `ONSHORE FACILITY`, then the exact `OIL PRODUCER` function token gave 183 and 27 records, respectively. Of the 27, 20 carry register phase `IN SERVICE`; 4 are removed, 1 shut down, 1 partly removed and 1 being installed. The 20 have a startup date and no recorded shutdown/removal date; that is not evidence of current physical operation or actual production volume.

In the [attribute dictionary](https://factpages.sodir.no/en/facility/attributes), `fclNpdidFacility` is the regulator's unique facility ID; `fclPhase` is its registered phase, while `fclStatus` is the facility's AOC status, not its operating phase. Startup records when the facility was set in production; `fclDateUpdated` records a registry change/insertion, not an observation. FactPages showed its internal-system sync as November 19, 2026 at 01:55 (timezone not stated on the page); the ZIP hash pins the retrieved contents. The archive’s HTTP modification timestamp is metadata, not a production-period or absolute as-of guarantee. The [facility API](https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer/6000) matched the aggregate counts and all 27 row phases with geometry disabled. The [phase history](https://factmaps.sodir.no/api/rest/services/DataService/Data/MapServer/6002) returned one matching open-ended phase per record. Both are the same regulator, not independent evidence of production.

Four parent field/transport group IDs are shared by ten of the 20 `IN SERVICE` rows. The Directorate's [facility history](https://factmaps.sodir.no/api/rest/services/DataService/Data/MapServer/6003) showed different historical names for 5 of 27 rows (3 of the 20). Names and parents are therefore not reliable one-to-one join keys. The existing OGIM adapter does not establish a matching regulator ID; no OGIM crosswalk was performed or status copied. A later crosswalk would require explicit source-ID evidence or a reviewed, time-bounded one-to-one mapping; ambiguous and unmatched records stay unknown. The catalogue is not a denominator for the 42 configured watch boxes, qualified satellite coverage, comparable history or independently established events.

If the identical ZIP is already available outside Git, run `python3 scripts/oil-directional/check-nod-facility-catalog-audit.py /path/to/fclPoint.zip`. The verifier checks the pinned size and SHA-256, reads the archive locally and compares only aggregates. The export URL is mutable, so a later download with a different digest cannot reproduce this historical fixture. No original, names, IDs or coordinates are retained in the repository; no collection, workflow, runtime, display, budget or score changes are made.

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
is nullable revision content, not identity; NASA documents [VIIRS satellite
codes and processing versions](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)
and [CSV version fields](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html).
The research capture and offline analyzer share the same bounded numeric
version format with optional uppercase `NRT`, `RT` or `URT` suffix, as
shown in NASA’s VIIRS and [MODIS attribute tables](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html).
A version-only change for the same capture is a content revision, not another
capture or evidence of coverage.
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

### Offline aggregate analysis of retained receipts

After checking the official GitHub Actions ZIP digest and exact `receipt.json`
member, pin each run ID, attempt and **actual checkout** from independent run
evidence. From the repository root:

```sh
node scripts/oil-directional/analyze-thermal-receipts.mjs RUN_ID:ATTEMPT:ACTUAL_CHECKOUT_SHA /local/path/receipt.json
```

Repeat the pin/path pair for up to 32 inputs. The analyzer never fetches or
writes receipts, and metadata equality alone proves neither authenticity nor
scheduling. It refuses partial receipts, duplicate run attempts, inconsistent
source/area matrices and mixed cohorts. Its totals describe only the supplied
complete receipts, not an uninterrupted run history. Aggregate HTTP bodies,
parsed zeros, parse failures, request failures and unattempted retired slots are
separate. Unique captures/revisions are counted **within each run and then
summed** in `bySource`; repeated identities across runs may count again there.
Separately, `suppliedReceiptCaptureOverlapBySource` counts stable capture IDs
once across the supplied receipts (`unionUniqueCaptures`) and counts how many
appear in at least two supplied receipts (`capturesInMultipleReceipts`).
A receipt is keyed by run ID plus attempt; retries of one run can overlap and
do not imply two independently scheduled runs. For two receipts this second
count is their intersection. For example, if 11
captures in one receipt all appear in a second receipt of 31, the union is 31
and the intersection is 11. The other 20 are present only in the second of
these two receipts, not historically first seen. This comparison is
order-independent, does not deduplicate the run-scoped revision totals, and
does not infer a distinct facility, an incident, or coverage. An ID with
conflicting visible identity fields across receipts is rejected. No
individual data or hashes are output. A parsed zero is not a clear view or evidence that an
incident did not happen; coverage, spatial coverage, overpass and cloud quality
remain unknown. The result is ineligible for evaluation or main scoring and
does not establish cross-run first seen.

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

## Maintainer navigation (read-only)

- [Watch artifact](../data/oil-thermal-watch.json), [refresh workflow](../.github/workflows/refresh-oil-thermal-watch.yml)
  and [publication decision](ADR/0114-thermal-publication-completion.md): inspect the
  existing producer and publication path without dispatching either.
  `npm run check:oil-thermal-watch` checks the committed snapshot and fixture contracts offline.
- [Source retirement](ADR/0086-oil-thermal-source-retirement.md) and
  [baseline history window and operator guide](OIL_THERMAL_HISTORY_WINDOW_CAPACITY.md):
  use `npm run monitor:oil-thermal-baseline-quality -- --dry-run --no-output` for
  a local no-write inspection. This does not materialize samples, establish a
  comparable cohort, or approve promotion.
- [Package commands](../package.json) and [data contract](DATA_CONTRACT.md)
  describe the remaining manual helpers. For a no-network diagnostic option
  check, use `npm run diagnose:firms-thermal -- --dry-run`; the historical
  diagnostic's default product is retired and is not live operating guidance.

## Historical source-review and implementation record

The [complete original review at commit `1561a529`](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1561a5294e52934d4b02895e6e808b0db8f87477/docs/OIL_THERMAL_ANOMALY_SOURCE_REVIEW.md#historical-source-review-and-implementation-record)
preserves the source assessment, P11–P27 and P47–P51 implementation and review
records, including their original headings, examples and references. Full file
SHA256: `28f7d5fddca160cfd9df44ad8c8a218a6938f20ef2e203bda38f2914edc3bdc5`.

Historical statuses, starter coverage, source defaults and commands, including
production build and baseline-writing examples, are not current guidance or
authorization. The current evidence boundaries above prevail.
