# ODP Verdict History Monitor

P64 adds a read-only history and drift monitor for the committed
`data/oil-directional-pressure.json` verdict stream. P66 adds an orthogonal
persistent-low-confidence observation without changing the primary status.

## Contract

- Monitor: `oil-directional-verdict-history-monitor-p66`
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
- the latest seven-sample low-confidence count and
  `persistentLowConfidence` observation;
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

## Persistent low confidence

When all seven latest valid samples have `confidence=low`, the monitor records:

- `trend.recentLowConfidenceCount=7`;
- `trend.persistentLowConfidence=true`;
- `observations.persistentLowConfidence.active=true`;
- `manualAction.suggestedNow=true`;
- recommendation
  `review_existing_confidence_caps_without_changing_classifier`.

This observation does not replace `stable_current_verdict`, does not set
`manualAction.requiredNow=true` by itself, and does not change the classifier.
It asks the operator to review why existing evidence-quality caps remain active
without weakening those caps merely to remove the observation.

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
