# ACLED manual input

This directory holds raw ACLED xlsx downloads. The xlsx files themselves are gitignored — only this README and the `.gitkeep` files are tracked.

## Subdirectories
- `weekly/` — 6 regional aggregated data files, refreshed weekly per ACLED's Monday/Tuesday cadence
- `monthly/` — 6 global aggregated data files, refreshed monthly (reserved for M-63b)

## Source
Operator manually downloads from https://acleddata.com/conflict-data/download-data-files. Per ACLED EULA Section 3.3, **no automation may scrape or crawl the ACLED site**.

Sanitizers consume these xlsx files and emit derived JSON to `config/world-order-acled-*-normalized.json` in overwrite mode.
