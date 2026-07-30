# Oil Thermal History Window Capacity (P65)

## Problem

The P51 quality monitor requires at least 30 healthy calendar days before a
candidate can reach `established_observation_window`. The previous
`--max-samples` ceiling was 100. At the observed collection cadence, the latest
100 committed watch artifacts covered only about 14.46 healthy days, while 240
commits covered about 36 days of raw history. The ceiling therefore prevented
the monitor from ever observing its existing 30-day gate.

## Change

`scripts/oil-directional/oil-thermal-history-window.mjs` now owns the shared
history-window capacity contract:

- baseline preparation, rolling refresh, and quality monitoring default to 240
  commits and 240 samples;
- archive/preparation/refresh/monitor CLI options accept integers from 1 to 500;
- the established quality threshold remains exactly 30 calendar days;
- P60 sample-health filtering and post-policy diagnostics gating remain
  unchanged.

`npm run check:oil-thermal-history-window-capacity` verifies the shared
defaults, bounds, imports, and no-write smoke paths for all four consumers.

## Operator use

Validate the capacity contract without writing even ignored artifacts:

```bash
npm run monitor:oil-thermal-baseline-quality -- --dry-run --no-output
```

In dry-run mode the archive reports newly discoverable samples, but the review
stage can only read samples already materialized in `--output-dir`. It must not
be interpreted as a review of the newly discovered, unmaterialized samples.

Run the artifact-only monitor to materialize the expanded ignored archive and
review the same sample set:

```bash
npm run monitor:oil-thermal-baseline-quality
```

This writes only ignored `manual-artifacts/` outputs. It does not write the
production baseline. To build a separate current ignored review packet before a
human promotion decision:

```bash
npm run prepare:oil-thermal-baseline-review -- --max-commits 240 --max-samples 240 --json
```

Crossing 30 days does not approve or perform production promotion. Review
quarantined samples, facility p95 changes, request health, and the P60 health
gate before any separate explicit `--write-production-baseline` command.

## P68 facility-window quality correction

P65 made the global history horizon long enough to observe 30 days. It also
revealed that a mixed-vintage facility whitelist cannot safely use that global
horizon as the quality label for every row. The 2026-07-30 packet spans 36.20
healthy days globally, while the minimum facility window is 27.74 days and only
12 of 42 facilities have reached 30 days.

P68 therefore preserves `sampleWindowDays` as an audit horizon and uses
`effectiveQualityWindowDays=min(facilities[].windowDays)` for quality aging.
The production promoter, reminder monitor, config checker, watch projection,
and frontend display share this rule. A new P68 promotion must carry the
minimum/maximum/effective window and target counts; legacy P60 configs remain
read-compatible. `npm run check:oil-thermal-facility-window-quality` guards the
mixed-window case.

The current candidate remains `starter_observation_window`; this change does
not write the production baseline. Only a later healthy packet with every
promoted facility at 30+ days may enter a separate human promotion review.

## Boundary

This is history-window capacity only. It does not fetch FIRMS, change the
request policy, alter repeated-observation thresholds, write production data,
or affect `values.*`, ODP `finalBias`, scoring, decision, execution, position,
Brent promotion, Global Risk Heatmap, or cross-validation.
