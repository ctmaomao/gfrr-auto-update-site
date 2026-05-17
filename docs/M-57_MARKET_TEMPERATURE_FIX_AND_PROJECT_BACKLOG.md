# M-57 Market Temperature Fix and Project Backlog Contract

M-57 is a focused frontend judgment-layer and documentation-contract update.
It fixes the `buildMarketTemperature` stub so the macro overview judgment
matches the already-active market-temperature renderer, then creates a durable
project backlog file and wires that backlog into `check:all`.

## Scope

- Frontend renderer judgment fix only:
  `scripts/modules/renderMacroOverview.js::buildMarketTemperature`
- New first-class project backlog:
  `docs/PROJECT_BACKLOG.md`
- New deterministic checker:
  `scripts/check-project-backlog-format.mjs`
- `package.json::check:all` grows from 62 to 63 checks
- Frontend asset cache version bumps from `28.0M-55bV` to `28.0M-57V`

M-57 does not change data files, workflows, backend pipeline scripts,
validation logic, narrative builders, scoring, decision, execution, or
position logic.

## buildMarketTemperature Fix

Before M-57, `buildMarketTemperature()` always returned a waiting
`createDataGapJudgment`, even though `renderMarketTemperatureCard()` already
rendered the active state from `data/market-pricing-metrics.json`.

After M-57, `buildMarketTemperature(marketPricingMetricsData)`:

- Reads validated market-pricing metric records through the existing
  `getMetricRecords()` helper
- Uses the latest QQQ weekly `zScore`
- Reuses `getMarketTemperatureBucketInfo()` for bucket semantics
- Returns an active `createJudgment()` when records exist
- Keeps the existing waiting `createDataGapJudgment()` fallback when records
  are missing or invalid

This aligns the judgment layer with the render layer. With the current
metrics file, the latest record is `2026-05-11 / 2026-W20` with `zScore =
2.2456`, so the market temperature judgment reports the active "极度过热"
bucket instead of "等待历史周线数据接入".

## PROJECT_BACKLOG.md

`docs/PROJECT_BACKLOG.md` is project self-memory across sessions. It tracks:

1. Current maintenance state
2. Open backlog items
3. Completed milestones
4. Future considerations
5. Audit history
6. Backlog workflow rules

The file records M-56 and Build #74 as completed, moves the prior P0 daily
refresh task into completed history, and keeps remaining world-order and
visual-completeness items as open backlog.

## check:project-backlog-format

The new checker validates only stable structure:

- `docs/PROJECT_BACKLOG.md` exists
- Six expected section headers exist
- Each section contains content
- The file is not a stub

It intentionally does not validate item IDs, PR numbers, or exact section
order. This keeps the check useful as a contract guard without making backlog
maintenance brittle.

## Validation Contract

M-57 must pass:

- `npm run check:project-backlog-format`
- `npm run check:all`
- Browser spot-check confirming the market-temperature judgment and card are
  active, while M-54/M-55 visual behavior remains intact

## Boundary Statement

M-57 fixes `buildMarketTemperature` stub behavior, creates
`docs/PROJECT_BACKLOG.md` as persistent project memory, and promotes the
backlog to a first-class contract through `check:project-backlog-format`.
It does not modify `data/*.json`, workflows, `scripts/run-daily-pipeline.mjs`,
`scripts/validate-data.mjs`, `DESIGN.md`, nav anchors, DOM ids, scoring,
decision, execution, position, or any cross-validation narrative builder.
