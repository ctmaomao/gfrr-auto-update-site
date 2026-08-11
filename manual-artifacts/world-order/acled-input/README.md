# ACLED manual input

This directory holds raw ACLED xlsx downloads. The xlsx files themselves are gitignored — only this README and the `.gitkeep` files are tracked.

## Subdirectories
- `weekly/` — 6 regional aggregated data files, refreshed weekly per ACLED's Monday/Tuesday cadence
- `monthly/` — 6 global aggregated data files, refreshed monthly (reserved for M-63b)

Monthly filenames may keep common browser duplicate suffixes after the date, such as
`_0`, ` (1)`, or `-copy`. The sanitizer still requires the canonical dataset slug,
an `as-of-DDMmmYYYY` date, all six datasets on one date, and valid workbook headers.

## Source
Operator manually downloads from https://acleddata.com/conflict-data/download-data-files. Per ACLED EULA Section 3.3, **no automation may scrape or crawl the ACLED site**.

Sanitizers consume these xlsx files and emit derived JSON to
`config/world-order-acled-regional-weekly.json` and
`config/world-order-acled-global-monthly.json` in overwrite mode.

`npm run acled:publish` is main-only. It refuses to publish from a feature branch or
from a stale/dirty `main`, pushes explicitly to `main`, and dispatches the World Order
workflow explicitly with `--ref main`.
