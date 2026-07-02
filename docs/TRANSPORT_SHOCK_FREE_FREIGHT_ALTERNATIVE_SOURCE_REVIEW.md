# Transport Shock Free Freight Alternative Source Review

Contract version: `transport-shock-free-freight-alternative-source-review-v1`  
Status: `source_review_free_alternatives_no_route_freight_confirmation`  
Scope: P-score-44 source-review only.

## Purpose

This review defines the legal free-source fallback path when licensed Baltic TD/TC route assessment values are unavailable.

It does not approve unauthorized scraping, route freight confirmation, production writes, frontend changes, workflow automation, or score writes. It only classifies which public sources can support a future low-weight free proxy review.

## Source Classification

### Automatable Or Already Connected Context

- IMF PortWatch Daily Chokepoints Data: usable as public AIS-derived chokepoint physical proxy, already aligned with `macroDrivers.energyTransport`; it is not route-level tanker freight pricing.
- StockQ BDTI/BCTI/BDI: usable as broad public freight context already displayed elsewhere; it is not route-level TD/TC confirmation.
- EIA / IEA chokepoint exposure pages: usable as static exposure and weighting context; they are not live route freight prices.

### Candidate After Separate Source-Terms Review

- NOAA MarineCadastre AIS: public AIS CSV data for U.S. waters; useful for U.S. Gulf tanker movement proxy, not Hormuz/Bab el-Mandeb route freight. Any use must be low-frequency and compact-derived, not raw AIS redistribution.
- Suez Canal Authority / Panama Canal Authority statistics: official canal transit statistics can support slow chokepoint context after parser/source-term review; they are not oil tanker freight prices.

### Link-Only / Manual Reference

- CME TD3C delayed product page: route-relevant public product page, but automated scraping/caching of delayed market values is not approved by this review.
- ICE TD3C product page: route-relevant product reference, but automated value capture is not approved by this review.
- Solactive Breakwave Wet Freight Futures Index: public index reference; automated value capture is not approved by this review without a separate terms review.

### Blocked Without Rights

- Baltic daily TD/TC route assessment values remain blocked without explicit source rights.
- Third-party pages that mirror TD/TC values remain blocked for automated scraping or value redistribution unless their terms explicitly allow it.

## Resulting Free Proxy Path

The only acceptable path is a `free_transport_pressure_proxy`, not a `route_freight_confirmation`.

Allowed future ingredients:

- PortWatch chokepoint freshness and deviation.
- StockQ broad tanker freight direction.
- Static EIA/IEA chokepoint exposure weights.
- Optional NOAA/Suez/Panama slow physical context after separate source-term review.
- CME/ICE/Solactive link-only manual references for operator review.

Hard limits:

- `routeFreightConfirmation` must remain `not_connected`.
- `eligibleForMainScore` remains `false`.
- Any future score design must stay capped by the existing free-proxy low-weight design.
- Unauthorized Baltic/TD/TC scraping is not approved.

## Current Decision

P-score-44 does not change:

- `values.*`
- `displayInputsBaseline`
- `effectiveDisplayInputs`
- production `macroDrivers.energyTransport`
- frontend
- workflow / Worker runtime
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is a separate artifact-only free-proxy policy or source-terms review for NOAA/Suez/Panama/CME/ICE/Solactive. It still cannot clear `route_freight_confirmation`.
