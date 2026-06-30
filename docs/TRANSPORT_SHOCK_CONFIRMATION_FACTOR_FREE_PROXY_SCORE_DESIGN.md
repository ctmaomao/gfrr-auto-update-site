# Transport Shock Confirmation Factor Free-Proxy Score Design

Contract version: `transport-shock-confirmation-factor-free-proxy-score-design-v1`  
Status: `design_only_no_score_write`  
Scope: P-score-19 design contract for a future low-weight score-review path.

## Purpose

This document defines a conservative score-design path for Transport Shock Confirmation Factor when paid or licensed route-level tanker freight values are not available.

It does not approve scoring. It only defines the minimum design constraints for a later reviewed score integration PR. There is no scoring write in P-score-19.

## Free-Proxy-Only Principle

The future factor may use only already connected or publicly reviewable proxy families:

- IMF PortWatch chokepoint proxy from `macroDrivers.energyTransport`.
- StockQ BDTI/BCTI broad tanker freight context.
- Oil News market-reaction and claim-ledger aggregates.
- Oil Thermal facility watch / repeated anomaly confirmation.
- ODP Brent / crack / curve / EIA physical anchor context.

Baltic TD/TC route assessment values, vendor route values, or scraped route-level freight values remain excluded unless a separate source-rights approval is completed.

## Low-Weight Cap

The free-proxy-only path must be capped below a true route-level freight confirmation factor:

- Maximum future main-score contribution: `3%`.
- News-only contribution: `0%`.
- Single chokepoint-only contribution: `0%`.
- Stale PortWatch contribution: `0%`.

The cap exists because the free proxy path has weaker route specificity than licensed TD/TC route assessments.

## Minimum Conditions Before A Separate Score PR

A future reviewed score PR must prove all of the following before any score write:

- Production `transportShockCandidate` is present and still `candidateOnly=true`.
- PortWatch chokepoint source is live and no older than 7 days.
- At least one non-news physical confirmation exists.
- Market confirmation review is present; marketConfirmation may not be inferred from headlines alone.
- Oil Thermal repeated facility anomaly or EIA/ODP physical anchor confirms the same direction.
- History sample review has enough production samples for stability review.
- Backtest or replay review shows the proxy does not create obvious false positives.
- Route-level freight source-rights remain explicit: absent source rights must cap confidence and score size.

## Current Decision

P-score-19 does not change:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is a local/manual score-candidate projection or backtest scaffold. It must remain artifact-only until a separate reviewed score integration PR is approved.
