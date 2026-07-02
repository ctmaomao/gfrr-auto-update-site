# Transport Shock Satellite Handling Policy

Contract version: `transport-shock-satellite-handling-policy-v1`  
Status: `policy_review_no_thermal_blocker_bypass`  
Scope: P-score-45 policy-review only.

## Purpose

This policy defines how Transport Shock should treat Oil Thermal / FIRMS satellite observations when the current watch does not show repeated elevated facility heat anomalies.

It does not lower thermal thresholds, confirm facility accidents, clear `high_frequency_physical_confirmation`, approve production writes, or approve score writes.

## Current Handling Rules

### 1. Do Not Downgrade Thresholds

Missing thermal detections must not be solved by lowering FRP, confidence, facility radius, or repeated-observation thresholds just to clear a blocker.

The thermal layer remains a high-frequency physical confirmation layer, not a narrative confirmation layer.

### 2. Baseline Quality Comes First

Thermal evidence quality must be separated by baseline window:

- `<7 days`: starter baseline; no score or confirmation implication.
- `7-13 days`: minimum baseline quality for watch review.
- `14-29 days`: stronger short-history baseline.
- `>=30 days`: preferred stable baseline.

Before the 7-day gate, no thermal no-detection or detection should be treated as strong confirmation.

### 3. Targeted Probe From News Or Facility Mentions

When Oil News or an operator review mentions a specific facility, terminal, refinery, export port, LNG plant, or chokepoint-adjacent facility, the allowed next step is an artifact-only targeted FIRMS probe:

- Query the facility whitelist bbox or reviewed temporary bbox.
- Use 1 / 3 / 5 day windows.
- Store only ignored `manual-artifacts/` diagnostics.
- Do not write production data.
- Do not confirm accident, outage, closure, or price direction.

### 4. No-Detection Is Negative Evidence

If targeted probe finds no repeated elevated thermal anomaly, the result may reduce confidence in facility-accident claims.

No-detection can support copy such as `未见卫星热异常确认`, but it cannot prove that no operational issue exists and cannot clear route freight or market confirmation blockers.

### 5. When Thermal Can Support High-Frequency Confirmation

Thermal support requires all of:

- Source status is live or reviewed recent artifact.
- Facility list contains no example rows.
- Baseline quality is at least the 7-day gate.
- Repeated observation is present.
- Elevated repeated observation is present.
- The facility/region overlaps the news or transport shock axis under review.

Only then can a separate cross-confirmation review consider clearing the thermal part of `high_frequency_physical_confirmation`.

### 6. Bypass Requires Separate Policy Review

This policy does not allow bypassing the thermal blocker.

If future operators want to allow PortWatch + market structure + route proxy + news to compensate for absent thermal evidence, that must be a separate reviewed policy change with fixtures and false-positive controls. P-score-45 does not approve that path.

## Current Decision

P-score-45 does not change:

- FIRMS source thresholds
- facility whitelist
- production Oil Thermal data
- cross-confirmation status
- `high_frequency_physical_confirmation`
- `routeFreightConfirmation`
- frontend
- workflow / Worker runtime
- scoring / decision / execution / position
- ODP `finalBias`
- Brent promotion
- Global Risk Heatmap
- cross-validation

The next allowed step is either continued baseline accumulation or an artifact-only targeted probe policy/checker that remains outside production scoring.
