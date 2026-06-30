# Transport Shock Confirmation Factor Free-Proxy Historical Replay Runner Design

Contract version: `transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1`
Status: `runner_design_only_no_replay_execution`
Scope: P-score-25 design-only contract for a future artifact-only replay runner.

## Purpose

P-score-24 can review a set of historical replay sample-review artifacts, but it does not execute replay math. P-score-25 defines the future runner contract that would consume only reviewed sample-set artifacts and produce a manual replay summary.

This step still does not implement a replay runner, does not run a historical backtest, does not write production data, and does not approve score integration.

## Future Runner Input Contract

A future runner may read only:

- `transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1`
- `transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1`
- ignored `manual-artifacts/transport-shock-confirmation-factor/` files
- committed `docs/fixtures/transport-shock-confirmation-factor/` fixtures

It must not read live APIs, secrets, `data/radar-data.json`, realtime previews, Worker output, or production ODP files.

## Required Replay Metrics

A future runner must report at least:

- usable sample count
- family coverage
- zero-control sample count
- known-disruption sample count
- zero-control aggregate contribution
- false-positive rate on control samples
- known-disruption directional hit rate
- maximum candidate contribution percentage
- blocker list for any sample that claims production write, score write, or raw citation storage

## Hard Fail Conditions

The future runner must fail closed if any of the following occurs:

- `headline_only_false_positive` contributes above zero.
- `single_chokepoint_noise` contributes above zero.
- `stale_physical_proxy` contributes above zero.
- news-only evidence contributes above zero.
- false-positive rate exceeds 20%.
- known-disruption directional hit rate is below 60%.
- candidate contribution exceeds the 3% cap.
- any input claims score write, production write, frontend display approval, Worker wiring, ODP `finalBias` change, Brent promotion, Global Risk Heatmap input, or cross-validation input.

## Current Decision

P-score-25 does not change:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is P-score-26: an artifact-only historical replay runner dry-run scaffold that writes only ignored manual artifacts.
