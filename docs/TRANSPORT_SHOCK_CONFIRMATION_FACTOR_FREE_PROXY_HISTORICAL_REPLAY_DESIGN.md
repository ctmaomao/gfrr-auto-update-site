# Transport Shock Confirmation Factor Free-Proxy Historical Replay Design

Contract version: `transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1`  
Status: `design_only_no_replay_execution`  
Scope: P-score-22 historical replay sample design for the free-proxy low-weight score path.

## Purpose

P-score-21 proved only hard-cap controls: news-only, single-chokepoint-only, stale-PortWatch, and blocked-candidate cases must contribute zero.

P-score-22 defines the next historical replay sample design. It still does not run a historical backtest, write production data, or approve scoring. The purpose is to specify the minimum sample shape and pass/fail rules required before a later artifact-only replay runner can exist.

## Required Sample Families

The replay sample set must cover at least these families:

- `known_disruption_tightening`: event windows where chokepoint or transport stress should have tightened oil risk.
- `headline_only_false_positive`: geopolitical or shipping headlines without physical or market confirmation.
- `single_chokepoint_noise`: PortWatch or chokepoint proxy movement without non-news confirmation.
- `stale_physical_proxy`: stale PortWatch or stale transport candidate data.
- `market_confirmation_divergence`: market structure fails to confirm the physical/news transport signal.
- `benign_baseline`: normal windows where the factor should stay zero.

## Minimum Gates For A Future Replay Runner

A future replay runner must prove all of the following:

- At least 24 production-history samples.
- At least 6 false-positive control samples.
- At least 3 known-disruption samples.
- No contribution from news-only samples.
- No contribution from single-chokepoint-only samples.
- No contribution from stale PortWatch samples.
- False-positive rate no higher than 20% on control samples.
- Directional hit rate at least 60% on known-disruption samples.
- No score write, production write, workflow, Worker, frontend, ODP `finalBias`, Brent promotion, Global Risk Heatmap, or cross-validation change.

## Current Decision

P-score-22 does not change:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is P-score-23: an artifact-only historical replay sample scaffold or runner design that reads only ignored manual artifacts or committed fixtures.
