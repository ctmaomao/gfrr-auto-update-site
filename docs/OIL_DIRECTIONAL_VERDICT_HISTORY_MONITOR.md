# ODP Verdict History Monitor

P64 adds a read-only history and drift monitor for the committed
`data/oil-directional-pressure.json` verdict stream.

## Contract

- Monitor: `oil-directional-verdict-history-monitor-p64`
- Command: `npm run monitor:oil-directional-verdict-history`
- Check: `npm run check:oil-directional-verdict-history-monitor`
- Input: committed `data/oil-directional-pressure.json` git history only
- Output:
  `manual-artifacts/oil-directional/oil-directional-verdict-history-monitor-latest.json`
- Workflow: `Oil Directional Verdict History Monitor`
- Schedule: daily at `01:29 UTC`, after the normal ODP refresh window

The monitor records existing verdict state; it does not replay or alter the
classifier. It summarizes:

- `finalBias` and physical-bias distributions;
- verdict transitions and broader verdict-family transitions;
- the current verdict streak and the latest seven-sample transition count;
- physical/final divergence frequency;
- confidence and data-sufficiency counts;
- maximum committed evidence age and degraded-evidence count;
- existing global-overlay effect and confidence-adjustment state.

## Status

- `stable_current_verdict`: latest evidence is complete, no active divergence,
  and the recent verdict stream is not churning.
- `watch_active_price_physical_divergence`: the latest committed artifact
  already reports price/physical divergence.
- `watch_recent_verdict_churn`: at least three exact verdict transitions, or
  two verdict-family transitions, occur in the latest seven samples.
- `watch_latest_evidence_degraded`: at least one latest evidence row is
  non-live, missing age metadata, or beyond its committed maximum age.
- `watch_latest_data_insufficient`: the latest verdict or data-sufficiency
  field is insufficient.
- `awaiting_verdict_history` / `no_valid_verdict_history`: valid post-PR3
  history is absent.

These are monitor labels, not new ODP verdicts or trading signals.

## Boundaries

- `productionDataWriteApproved=false`
- `calculatesNewVerdict=false`
- `calculatesNewScore=false`
- no network or API-key access;
- no ODP/Daily/Worker refresh trigger;
- no production JSON, frontend, workflow writer, baseline, or config mutation;
- no effect on `values.*`, scoring, `decisionModel`, `executionLock`,
  `positionGuidance`, Brent promotion, ODP `finalBias`, Global Risk Heatmap, or
  cross-validation.

The scheduled workflow has `contents: read` only. It checks out full history,
writes one ignored artifact, appends GitHub Summary, and uploads the artifact.
It cannot commit or push.
