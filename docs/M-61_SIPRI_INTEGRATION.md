# M-61 SIPRI Manual-Normalized Integration

M-61 closes PROJECT_BACKLOG P1-3 by adding real SIPRI 2024 military
expenditure data to the already-built world-order SIPRI importer path and by
surfacing SIPRI as supporting evidence in the world-order cross-validation
narrative.

## Motivation

After M-59 moved GDELT to Cloud v2 and M-60 centralized Pages deploy triggers,
SIPRI was the remaining `manual_required` world-order external source.

The project infrastructure was already ready:

- `scripts/world-order/import-sipri.mjs` validates and imports normalized SIPRI
  data.
- `config/world-order-sipri-normalized.example.json` defines the manual schema.
- `scripts/check-world-order-stress.mjs` validates the SIPRI summary schema.
- `scripts/world-order/score-world-order-stress.mjs` already weights
  `peaceDividendRetreat` with SIPRI evidence.

M-61 therefore adds the real normalized file and the narrative branches, without
changing importer, scoring, workflow, or validation logic.

## Data Source

Source: SIPRI Fact Sheet "Trends in World Military Expenditure, 2024", April
2025.

- Fact Sheet PDF: https://www.sipri.org/sites/default/files/2025-04/2504_fs_milex_2024.pdf
- SIPRI database: https://www.sipri.org/databases/milex
- Tables used: Table 1 and Table 2
- Coverage in this PR: top 10 major powers, 5 regions, and global aggregates
- Use note: open SIPRI public fact sheet / database material, free for
  non-commercial use with citation; citation is embedded in the normalized
  config metadata.

The normalized file records current-US-dollar 2024 spending and SIPRI real-term
growth percentages. SIPRI is cited directly inside
`config/world-order-sipri-normalized.json` via `quality.sourceUrl`,
`quality.databaseUrl`, and `quality.methodologyNoteZh`.

## Why SIPRI Is A Slow Variable

SIPRI military expenditure data is annual. It normally becomes available around
April for the prior year. This means "stale" by daily-refresh standards is not a
bug; it is the intended cadence of the source.

The operating expectation is a small manual refresh once per year, usually in
April or May after SIPRI publishes the latest fact sheet or database update.

## Trend Classification

The trend classifier already lives in `scripts/world-order/import-sipri.mjs`:

- 5-year growth `>= 8%` -> `rising`
- 5-year growth `<= -3%` -> `falling`
- otherwise -> `stable`

The importer also applies `majorityTrend()` over major powers to determine
`majorPowerMilitarySpendTrend`.

> Note: the importer applies `classifyGrowthTrend` to
> `militarySpendShareOfGdpPct`, which is a *level* (percent of GDP), not a
> *delta*. As a result, `militarySpendShareOfGDPTrend` evaluates to `'stable'`
> for any plausible level (since 2.5% < 8% threshold). The
> `sipri_gdp_share_rising` narrative branch therefore fires only via its
> OR-fallback condition (`sipriGlobalTrend === 'rising' && sipriGdpShare >= 2.5`),
> never via the trend field directly. This is pre-existing importer behavior and
> not introduced by M-61; flagged here so future reviewers do not interpret it
> as a bug.

## Narrative Supporting Branches

M-61 adds three SIPRI supporting branches to
`world_order_pressure_crossing`, all gated on `sipriStatus === 'ok'`:

- `sipri_global_arms_race`: global 5-year military spending trend is rising.
- `sipri_major_powers_rising`: a majority of tracked major powers are rising.
- `sipri_gdp_share_rising`: global military burden / GDP-share pressure is
  rising. For the 2024 fact sheet this is anchored on the SIPRI table's world
  military burden moving from 2.3% in 2015 to 2.5% in 2024.

The narrative also distinguishes `manual_required`, `error`, and `disabled`
SIPRI states in missing evidence rather than treating all non-ok states as the
same gap.

## Annual Refresh Procedure

1. Each April-May, visit https://www.sipri.org/databases/milex.
2. Download the latest SIPRI military expenditure data or fact sheet.
3. Update `config/world-order-sipri-normalized.json` with the latest global,
   top-10 major-power, and five-region data.
4. Update `updatedYear`, `preparedAt`, `quality.publicationDate`, and `notesZh`
   if methodology or table coverage changes.
5. Run validation:
   - `npm run build:world-order`
   - `npm run check:world-order` — schema validation for
     `data/world-order-stress.json`
   - `npm run check:world-order-narrative-density` — narrative density floor
     check
   - `npm run check:all` — full battery; must still PASS 66 items after refresh
6. Verify `externalSources.sipri.status === 'ok'` and the summary reflects the
   latest year.
7. Trigger `Refresh World Order Stress` via workflow_dispatch if a production
   refresh is needed immediately. Pages auto-deploys via the M-60 workflow_run
   listener.

> An automated reminder issue is opened each May 1 by `.github/workflows/sipri-annual-refresh-reminder.yml`. The issue body contains the full action checklist and links back to this document.

### Computing fiveYearGrowthPct (not published in Fact Sheet)

The SIPRI Fact Sheet PDF publishes 1-year and 10-year deltas only. The
`fiveYearGrowthPct` field (on `global`, on each majorPower, and on each region)
must be computed manually from the SIPRI Excel database. Use this procedure:

1. Download the SIPRI Military Expenditure Database Excel from
   https://www.sipri.org/research/armaments/milex/milex_database. The current
   workbook (as of M-61) is `SIPRI-Milex-data-1949-2024.xlsx`.
2. Use the "constant USD" sheet for country values, the regional totals sheet
   for regions, and the world total sheet for `global`. Real terms (constant
   2023 USD) is the correct basis for growth comparison — NOT current USD, NOT
   local currency.
3. For each entity, compute:
   `((spending_{updatedYear} / spending_{updatedYear - 5}) - 1) * 100`,
   rounded to 1 decimal place.
4. Worked example for the M-61 refresh (2024 data): global computed as 26.0%
   from constant-USD world totals; Russia 128.9% (post-Crimea baseline 2019
   ~$65B vs 2024 ~$149B); Ukraine 896.7% (pre-war 2019 baseline ~$6.5B vs 2024
   $64.7B); Saudi Arabia 8.0% (just crossed the `>=8% -> rising` trend threshold
   from prior years).
5. If an entity's `updatedYear - 5` baseline is unavailable or anomalous (e.g.
   Ukraine pre-war data inconsistencies), document the substitution in the
   JSON's `notesZh` field and use the closest stable baseline.
6. Sanity-check guardrail: after computing all 16 values, the M-61 commit
   `cb64cf2` found that an earlier round of values (committed before
   verification against the Excel) was systematically wrong by 5-50pp per
   entity. Always verify against the Excel before committing — Fact Sheet PDF
   approximations and rough estimates are NOT acceptable.

### Cross-file synchronization required

When `militarySpendShareOfGdpPct` or related global burden values change in the
JSON, the following hardcoded literals in
`scripts/modules/buildCrossValidationMatrix.js` (within
`buildWorldOrderNarrative`) must be reviewed:

- The narrative text `"（2015 年为 2.3%）"` — the `2.3` is the baseline year's
  burden value, hardcoded as a string literal. Update if the baseline year
  shifts (e.g. next decade's Fact Sheet uses 2016 as the baseline) or if SIPRI
  revises the 2015 historical value.
- The fallback threshold `sipriGdpShare >= 2.5` in branch
  `sipri_gdp_share_rising` — this is a defensive trigger so the branch can fire
  even when the importer's `militarySpendShareOfGDPTrend` returns `'stable'`
  (which it does for any reasonable GDP-share level — see footnote in
  `## Trend Classification`). Adjust the threshold if SIPRI's global burden
  drifts substantially.

These literals are intentionally co-located with the narrative rendering in
`buildCrossValidationMatrix.js`, not in the JSON, because they encode display
copy rather than source data. They must be tracked as part of the annual refresh
checklist.

### Commit message convention

Commit format: `chore(world-order): refresh SIPRI to <YEAR> Fact Sheet`

The commit body should include: the source Fact Sheet PDF URL, the Excel
database URL and filename, the Fact Sheet publication date, and a verification
table showing old -> new values for all 16 entities (even unchanged ones, as
audit evidence — see the `cb64cf2` commit for an example).

Estimated annual effort: 20-30 minutes.

## Data Verification

`import-sipri.mjs` enforces the key guardrails:

- `source === "sipri-milex-manual-normalized"`
- `updatedYear` finite
- `preparedAt` parseable
- `global` object present
- `majorPowers` array present
- `regions` array present
- `quality.isRealData === true`

The importer also has a triple safety lock: `exampleOnly: true`,
`notForScoring: true`, or `quality.isRealData !== true` forces
`manual_required` and prevents example data from entering scoring.

## Boundaries

M-61 does not modify `scripts/world-order/import-sipri.mjs`,
`scripts/world-order/score-world-order-stress.mjs`,
`scripts/check-world-order-stress.mjs`, `scripts/build-world-order-stress.mjs`,
workers, workflows, frontend cache, nav anchors, DOM ids, scoring weights,
decision, execution, position logic, `scripts/run-daily-pipeline.mjs`,
`scripts/validate-data.mjs`, or `DESIGN.md`.
