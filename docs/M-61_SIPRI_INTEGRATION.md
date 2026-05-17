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
5. Run `npm run build:world-order`.
6. Verify `externalSources.sipri.status === 'ok'` and the summary reflects the
   latest year.
7. Trigger `Refresh World Order Stress` via workflow_dispatch if a production
   refresh is needed immediately. Pages auto-deploys via the M-60 workflow_run
   listener.

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
