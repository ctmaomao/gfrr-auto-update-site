# M-58 Realtime Band Field Completion

M-58 completes `P1-6` from `docs/PROJECT_BACKLOG.md`: the realtime band already used the M-55b main-module 7-card structure, but six non-Brent cards still lacked the same delta/source treatment as Brent.

## Scope

- Frontend display only.
- No new data sources.
- No worker, pipeline, workflow, data-file, scoring, decision, execution, or position logic changes.
- Existing Brent source and move-label logic is preserved.
- Existing 7 realtime sub-card count is preserved.

## Added DOM IDs

M-58 adds 9 DOM ids and locks them with `check:realtime-band-completeness`:

| ID | Purpose |
|---|---|
| `rt-dxy-source` | DXY source label |
| `rt-vix-source` | VIX source label |
| `rt-hy-source` | HY OAS source label |
| `rt-us10y-delta` | US10Y delta |
| `rt-us10y-source` | US10Y source label |
| `rt-gold-delta` | Gold delta |
| `rt-gold-source` | Gold source label |
| `rt-spx-delta` | SPX delta |
| `rt-spx-source` | SPX source label |

## Delta Formatting

`scripts/modules/render.js` now uses `fmtDeltaWithUnit(delta, options)` for realtime-card deltas.

Behavior:

- `null`, `undefined`, or non-finite values render as `--`.
- Positive values render with a `+` sign.
- Currency deltas use `$`.
- Percentage-point deltas use `%`.
- SPX index-point deltas use ` 点`.

| Variable | Unit | Format |
|---|---|---|
| Brent | USD/barrel | `+$0.32` |
| DXY | index | `+0.05` |
| VIX | volatility index | `+0.45` |
| HY OAS | percentage points | `+0.05%` |
| US10Y | percentage points | `+0.03%` |
| Gold | USD/oz | `+$12.4` |
| SPX | index points | `-42 点` |

## Brent Null-Check Bug Fix

Before M-58, Brent delta used:

```js
fmtSigned(realtime.changes?.brent1d || 0)
```

That coerced missing delta data to `0`, displaying `+0` or `+0.00` instead of the missing-data placeholder.

M-58 changes Brent to:

```js
fmtDeltaWithUnit(realtime.changes?.brent1d, { prefix: '$', digits: 2 })
```

Missing Brent delta now renders as `--`.

## Source Labels

M-58 adds `buildGenericSourceLabel(displayName, key, realtime)` for the six non-Brent cards. It reads `realtime.sourceDetails[key].source` and maps common source strings into short labels:

- `fred` -> `FRED <series>`
- `yahoo` -> `Yahoo`
- `stooq` -> `Stooq`
- `gold-api` / `gold` -> `Gold API`
- `worker` -> `Worker`
- `trading` -> `TradingEconomics`

Brent continues to use `buildBrentSourceLabel(realtime)` because its display is promotion-aware.

## Check Contract

New command:

```bash
npm run check:realtime-band-completeness
```

The check verifies:

- All 9 new DOM ids exist in `index.html`.
- `render.js` writes all 9 ids.
- `fmtDeltaWithUnit`, `buildGenericSourceLabel`, and `FRED_SERIES_CN` exist.
- Brent delta no longer uses the `|| 0` fallback.
- `index.html` uses `?v=28.0M-58V`.

`check:all` increases from 63 to 64 items.
