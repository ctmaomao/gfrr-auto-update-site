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

## Boundary

This is history-window capacity only. It does not fetch FIRMS, change the
request policy, alter repeated-observation thresholds, write production data,
or affect `values.*`, ODP `finalBias`, scoring, decision, execution, position,
Brent promotion, Global Risk Heatmap, or cross-validation.
