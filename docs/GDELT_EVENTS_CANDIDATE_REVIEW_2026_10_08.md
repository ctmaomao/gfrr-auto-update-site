# GDELT Events 免费候选：采样、统计与迁移审阅

## Owner acceptance baseline

2026-10-08 owner 同意“原始 Events 做统计，DOC / Web NGrams 做辅助观察”的
免费路线。先独立采样核对覆盖、去重、运行成本与分类质量，再替换 World Order
输入。当前阶段允许免费公开文件采集、ignored 候选报告和离线测试；不恢复 Cloud，
不付费、不改生产评分/校准、不写生产 JSON、不新增自动工作流或发布。
本候选属于既有 World Order 来源评估，不是新的独立生产管线。

## Source registration

| Field | Assignment |
|---|---|
| sourceKey | `world_order_gdelt_events_candidate` |
| sourceDomain | `data.gdeltproject.org/gdeltv2` |
| assignedLayer / primaryOwnerLayer | `artifact_sanitizer_layer` |
| future approved owner layer | `daily_history_layer` |
| freshnessCadence | manual source review; upstream quarter-hour exports |
| artifactOnlyBeforeProduction | true |
| sanitizerRequired | bounded single-member ZIP + strict 61-column TSV projection |
| productionWriterRequired | future separately reviewed World Order writer; none enabled |
| fallbackPolicy | incomplete/stale/invalid means unavailable; never manufactured zero |
| sourceComplianceStatus | public download, no credentials; aggregate-only ignored report, no article redistribution |
| affectsScoring / affectsDecisionModel / affectsExecutionLock / affectsPositionGuidance | false / false / false / false |

## Statistical definition

- Seven complete UTC days, 96 quarter-hour exports per day, 672 expected files.
- `GlobalEventID` is the deduplication key; contradictory duplicates invalidate
  qualification. ID deduplication does not merge multiple coded representations
  of one real incident. Count is not a verified physical incident count.
- Files define a `DATEADDED` ingestion window. Only records whose `SQLDATE`
  occurrence day falls in the same calendar window enter conflict counts.
  Older occurrences are disclosed separately. This does not recover old records
  first ingested before the window and does not claim all incidents in the week.
- QuadClass 4 is material conflict; QuadClass 3 is verbal conflict and reported
  separately. Material conflict is broader than confirmed armed violence. Keep
  CAMEO root-code distributions for reviewing the selected definition.
- Country is `ActionGeo_CountryCode` (FIPS), never the actor nationality or media
  country. Blank locations remain unallocated; codes are not assumed to be ISO.
- Separate ingestion-day and occurrence-day summaries. No death counts, article
  totals, conflict probability, trading recommendation or production score.
- Every downloaded file must pass size/ZIP CRC/filename/UTF-8/schema/date checks.
  A 404, parser failure or unattempted interval is missing, not zero. The top-level
  qualified count stays null unless all files pass, there are no conflicting IDs,
  the window is the latest seven complete UTC days and source latest time is neither future nor
  older than three hours. Partial observed counts are labelled as a subset.

## Tool and budgets

```powershell
npm run diagnose:gdelt-events -- --no-output
npm run diagnose:gdelt-events -- --allow-network --max-files 4
npm run diagnose:gdelt-events -- --allow-network --max-files 672
```

Default is no-network/no-write. Live default is four files, not a full week;
`--max-files 672` explicitly selects the full bounded weekly download. Optional
`--end YYYYMMDDHHMMSS` supports historical windows, with stale disclosure.
Output is fixed to ignored
`manual-artifacts/world-order/gdelt-events/candidate-latest.json`; arbitrary
production output paths are rejected. `--no-output` suppresses artifact writes.
Raw compressed files/TSV, URLs, names, coordinates and per-event rows are not
persisted. SHA256/byte metadata and aggregates retain audit evidence; reproducing
the counts requires redownloading the public files, and provider revisions can
be identified by digest differences.

Transport uses a dedicated shared `scripts/gdelt/events-download.mjs` wrapper:
fixed public host, HTTPS, no redirect/key/Cloud, serial requests, 15-second
request/body deadline, 2 MiB compressed / 16 MiB expanded per file, 128 MiB
overall downloaded bytes and a 20-minute run budget (plus one bounded request).
The sanitized row collection is capped at two million before retaining another
file, in addition to the 100,000-row per-file cap; compressed byte limits alone
are not used as a memory budget.
No retries; stop after three consecutive failed files or a total-byte overrun.
HTTP/body/parse errors remain local to the candidate and cannot change production.
No new dependency. The offline tests are included in `check:gdelt-source-policy`;
no existing assertions, skip gates or endpoint allowlists are loosened.

## Calibration and integration gate

The existing Cloud `gdelt-pressure-v2` scale 1538.2 was fitted to a different
event classification and country aggregation. Do not rescale it by a hand-chosen
ratio or substitute these raw counts into legacy `conflictEvents`.

Before integration, collect at least 30 complete daily candidate observations
with the same versioned definition, validate country/missingness and root-code
composition, and preserve a subsequent chronological holdout. This is a proposed
minimum observation gate, not evidence that 30 points guarantee validity. Review
unique-window counts and rates against coverage, language/media shifts, historical
Cloud snapshots only where dates overlap, and existing ACLED evidence with their
different scope/time windows explicitly disclosed. Never call non-overlapping
data a same-day validation.

Choose and freeze a new Events-specific pressure scale only after that review;
document the calibration cohort, window/version and holdout behavior. Keep
World Order dimension weights and main risk/decision/execution/position unchanged.
Mark the new model as not comparable with Cloud history. DOC/Web NGrams can
support narrative/coverage evidence but do not fill missing event counts or
create fatalities. Existing Oil News/Bubble consumers keep their current budgets.

Runtime adapter, cache/resume design, retention, scheduling, production writer,
data-contract transition, display labels, score migration and independent review
must be made concrete before production promotion. Collector success alone
does not grant that promotion. Cloud remains `free_only` throughout.

## Official references

- [GDELT V2 codebook](https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf)
- [GDELT 2.0 exports and update cadence](https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/)
- [DOC article-count semantics](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [Web NGrams temporary dataset and per-file scope](https://blog.gdeltproject.org/using-the-new-web-ngrams-dataset-to-find-relevant-coverage/)

## Live evidence

Four public exports for 2026-10-06 23:00–23:45 UTC were successfully read and
sanitized. This establishes format viability only: four out of 672 intervals
cannot qualify a seven-day count. Full-window evidence is recorded below after
the bounded collection finishes; no sample is production-approved.

Full collection attempted UTC 2026-09-30 00:00 through 2026-10-06 23:45:

- 673 requests (one index plus 672 files), 44,247,857 downloaded bytes, 189,056 ms.
- 671 files valid, 1 invalid, coverage 99.851%; zero conflicting duplicate IDs.
- Valid-file subset: 92,023 material-conflict records, 88,921 verbal-conflict
  records; 3,056 material-conflict records have no action-country allocation.
  11,740 unique records have occurrence dates outside the selected week and are
  excluded from conflict counts. These figures are not a qualified seven-day total.
- `20261006033000` contains two upstream rows with CAMEO root `--` (both QuadClass
  3). A bounded re-read confirmed the malformed field without storing article
  URLs/text or names. Strict parsing rejects the entire file. No assertion was
  relaxed and no missing-file count was imputed from DOC/Web NGrams or neighbors.
- `qualifiedSevenDayMaterialConflictCount=null`, `score=null`, calibration and
  production approval false. This particular sample does not pass the promotion
  gate despite viable transport and small file volume.
- The initial collection sampled the clock at start, when the index timestamp
  `20261007213000` was briefly ahead of the local UTC clock. Source freshness was
  therefore held rather than treating a future timestamp as current. The final
  implementation evaluates freshness at collection completion; original evidence
  is preserved, not re-dated or relabelled complete. The malformed file alone
  independently blocks this cohort.
- Final four-file `--no-output` smoke passed transport/parser checks with the
  completion-clock implementation. The live index now returned `20261008041500`,
  ahead of this run's local UTC clock; `sourceFresh=false` remained correctly
  held. This timestamp discrepancy needs resolution before runtime promotion;
  do not move the local clock, relabel historical artifacts or treat it as fresh
  to make the candidate pass. It does not affect the historical file-format smoke.

The valid subset spans 216 FIPS location codes. Its leading code `US` contains
31,186 of the 92,023 material-conflict records (about 34%); root-code totals are
15=2,511, 16=5,032, 17=33,351, 18=12,007, 19=38,852, 20=270. This broad distribution
is a concrete reason to review geographic/category definitions before interpreting
the count as global war pressure. No selected count was fed to the Cloud scale.

This is one local-machine sample, not a GitHub Actions benchmark or a guarantee
of future bandwidth, runtime or source stability. Future production should use
reviewed incremental caching; this manual probe intentionally retains no raw
files/cache and re-downloads its explicit window. The strict missing-row/root-code
treatment needs review using broader observations before selecting calibration
and a runtime contract. A desired pass rate is not grounds to weaken these gates.

## Phase 2: research archive and calibration preparation

Owner's “请开始下一阶段” continues local source review and calibration preparation.
The original strict candidate parser, freshness gate and tests are unchanged.
A separate `gdelt-events-research-v2-roots18-20-global` research contract records
malformed rows as quarantined, never guesses their category, and never labels a
quarantined window statistically qualified. Production eligibility and calibration
approval remain false, even for a complete clean historical cohort.

Official definitions: [GDELT V2 codebook](https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf)
and [GDELT 2.0 announcement](https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/).
The primary candidate counts roots 18–20 (assault, fighting, unconventional mass
violence), with roots 15–20 broad material conflict and QuadClass 3 verbal conflict
as separate sensitivity series. Global ActionGeo FIPS geography is retained;
US/domestic events are not silently excluded. Both actor-country codes present
and different define an exploratory cross-actor-country series, not verified
interstate war. All series count coded records, not confirmed physical incidents.

```powershell
npm run research:gdelt-events
npm run research:gdelt-events -- --allow-network --end 20261007 --days 7
```

Default mode reads sanitized local archives, performs offline review and writes
nothing. Live mode downloads at most seven complete UTC source days, 672 files;
serial/no retry/15-second timeout/128 MiB/20-minute/two-million selected-record
limits apply per invocation. Each day retains at most 200,000 selected IDs.
Previously validated days are reused without a request. Missing/failed files do
not become archived complete days. Daily filenames are immutable (`wx`); invalid
existing caches stop execution, rather than being overwritten or deleted.
Output paths are fixed beneath ignored
`manual-artifacts/world-order/gdelt-events/research-v2/`; no workflow is added.

Daily archives contain aggregate groups and hashed event-ID membership for exact
cross-day deduplication. They contain no raw IDs, names, actor-country strings,
URLs, coordinates, articles, ZIP or TSV. Hashes are deterministic identifiers,
not an anonymization guarantee against someone with the public source. Each file
has source SHA256/byte provenance; each archive has a payload digest and semantic
validation. The digest detects accidental corruption, not independent authenticity.
Quarantine reason counts and hashed IDs preserve ambiguity evidence. If a valid ID
also appears among quarantined rows, or duplicates contradict, qualification holds.
A completed historical day need not pass today's freshness check; historical
qualification cannot claim current live freshness or authorize production.

The calibration plan requires 49 consecutive source days: 30 rolling seven-day
training windows, six embargo end dates, then seven held-out window end dates.
For an end of 2026-10-07, source days are 2026-08-20–10-07; training end dates are
08-26–09-24; holdout end dates are 10-01–10-07. Training and holdout underlying
source dates do not overlap. Training windows overlap internally, so this is not
30 independent samples or a predictive backtest. A proposed reference scale is
the training median; it stays null unless all 30 training and seven holdout windows
are complete, clean and nonambiguous. A nonpositive median also holds the scale.
The existing saturation formula is replayed only as an offline descriptive
candidate, not a forecast or production score. Cloud comparisons explicitly mark
count-unit/window equivalence unverified; historical date overlap proves neither.
No old Cloud scale is reused. DOC/Web NGrams cannot fill missing Events counts.

The source review has also recorded a later clock observation: local receipt
2026-10-08T04:17:39.404Z, HTTP Date 04:17:57Z, export index 04:15:00Z. At that
observation the index was no longer future. This does not establish the reason
for earlier future labels; the strict production-candidate future-time hold remains.

### Second-stage live evidence: latest completed week

UTC 2026-10-01–10-07: 672/672 files downloaded, 44,421,232 compressed bytes,
213,493 ms, no transport failures/retries. Seven daily research archives retain
697,966 source rows; two rows on 10-06 are quarantined as `event_code` failures.
The valid subset has broad material=93,057; roots 18–20 violence=51,817;
cross-actor-country violence=9,307; verbal=89,964; violence with unknown
ActionGeo country=1,748. No contradictory or cross-day duplicate selected IDs
were observed. These figures are valid-subset coded-record counts, not qualified
whole-week counts or real incident totals. `qualifiedViolenceCount=null`;
`statisticallyQualified=false`; production eligibility remains false.

### Complete historical replay and handoff

All 49 UTC days (2026-08-20–10-07) are archived: 4,704 files,
304,305,977 compressed bytes, 4,818,952 rows. No missing day/file or transport
failure was observed across the seven bounded collection invocations. Three rows
are quarantined: one `event_code` failure on 09-08 and two on 10-06.
Training end dates 09-08–09-14 are held; 23/30 training windows qualify.
Holdout end dates 10-06–10-07 are held; 5/7 holdout windows qualify.
The descriptive valid-subset training median is 49,529, not an approved reference
scale. The proposed scale and all normalized replay scores remain null.
Eleven Cloud dates overlap; no claim of matching count units/window semantics is
made. Latest-week violence locations are led by FIPS US=16,620 of 51,817, showing
that roots 18–20 still include substantial domestic coverage. Do not relabel this
series as a count of wars or silently remove US to create a desired result.

Final complete report is ignored
`manual-artifacts/world-order/gdelt-events/research-v2/review-20261007-1791451103532.json`.
The final replay reused 49 validated caches with requests=0 and bytes=0. The
source byte count above is historical acquisition volume, not final replay traffic.
All collection commands exited 0: this means download/archive success, not source
qualification or model approval. Original strict candidate quality gates hold.

Validation: `check:changed` selected full and `check:all` exited 0. After the final
research coverage-summary/type guards and ambiguity regression were added,
research tests 5/5 and `check:gdelt-source-policy` 16/16 were rechecked, exit 0.
Existing assertions/checker/ignore lists and production config/data/workflows
have no changes. New research flags cannot authorize runtime writes or scoring.

Recommended next review: agree whether the product should show a precisely
labelled classified-news-record proxy with unknown-row disclosure; separately
review the statistical policy for unknown categories and a new fitted scale if
scoring is desired. The observed three malformed records are evidence for that
review, not permission to weaken any existing gate. Until then, source sampling
is usable and reproducible, but World Order production replacement remains held.
No push, merge, deployment, scheduled sampling or production writes occurred.
