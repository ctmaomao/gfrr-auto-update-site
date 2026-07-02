# Transport Shock Free-Proxy Score Bridge Review

Contract version: `transport-shock-free-proxy-score-bridge-review-v1`  
Status: `bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write`  
Scope: P-score-46 bridge-review only.

## Purpose

P44 confirmed that legal free/public sources can support a `free_transport_pressure_proxy`, but they do not provide licensed route-level tanker freight confirmation.

P45 confirmed that absent or non-repeated satellite thermal observations cannot be solved by lowering Oil Thermal thresholds or bypassing the high-frequency physical blocker.

This bridge review defines how those two decisions interact with the existing free-proxy score design:

- `routeFreightConfirmation` remains `not_connected`.
- `route_freight_confirmation` can be treated as not required for the separate low-weight free-proxy path.
- That reclassification does not clear true route freight confirmation.
- `high_frequency_physical_confirmation` remains a hard blocker before any score-write review.

## Bridge Decision

The low-weight free-proxy path is not the same as route-level tanker freight confirmation.

Maximum future main-score contribution: `3%`.

Therefore, future artifact-only preflight may classify `route_freight_confirmation` as `not_applicable_to_free_proxy_low_weight_path` when all of the following are true:

- P44 source-review is present and still blocks unauthorized TD/TC scraping.
- P19 free-proxy score design cap remains at or below `3%`.
- Free-proxy readiness gate has enough real-event and zero-control samples.
- No single source can score alone.
- News-only, single-chokepoint-only, and stale-PortWatch contributions remain `0%`.

This does not approve scoring, production writes, frontend changes, workflow automation, Worker changes, ODP `finalBias`, Brent promotion, Global Risk Heatmap, or cross-validation.

## Remaining Hard Blocker

The bridge does not reclassify `high_frequency_physical_confirmation`.

That blocker can only clear through one of:

- Repeated elevated Oil Thermal / facility observation under the existing baseline rules.
- A separate reviewed thermal bypass policy with false-positive controls.

P45 does not approve the second path, so the current path remains blocked until real high-frequency physical evidence appears or a separate reviewed policy changes the rule.

## Current Consequence

After this bridge review, the project can build a new artifact-only free-proxy preflight that:

- Leaves `routeFreightConfirmation=not_connected`.
- Treats route-level freight values as unavailable rather than required.
- Keeps `high_frequency_physical_confirmation` as the blocking external-evidence gate.
- Emits no score and writes no production data.

The next allowed step is `P-score-47 artifact-only free-proxy bridge preflight`.
