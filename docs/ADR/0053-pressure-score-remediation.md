# ADR-0053: Pressure baseline unit correction and response diagnostics

Status: Accepted for implementation under the owner's 2026-09-17 instruction to proceed with the score-audit recommendations and necessary authorization. Production replacement retains the evidence and independent-review requirements of [ADR-0044](0044-contemporaneous-pressure-research.md) and [ADR-0047](0047-pressure-evidence-continuity.md).

## Context

The renewed audit reproduced the published score of 71 as rounded base 56, tail-floor contribution 12 and authorized transport contribution 3. The floor masks some subsequent deterioration and can create a large boundary jump. A separate replay defect supplied percentage Brent changes where the production adapter supplies absolute USD/barrel differences. Correcting historical calculation parity must precede judging the candidate models against that baseline.

## Decision

Correct only the historical Brent-change adapter: subtract the previous available observation and round to four decimals, matching the production adapter's unit. Preserve observation dates across weekends and holidays. Missing or stale previous observations remain null inputs, with the production model's effective zero fallback explicitly disclosed in historical diagnostics. Scenario overrides retain scenario provenance. This is not full intraday/source-switch or point-in-time replay.

Retain the seven previously frozen candidates and all their coefficients, input transformations and promotion gates. Add a report diagnostic that independently replays every available candidate at its recorded calibration and weights, measures small and one-scale positive feature perturbations, and records single input ownership and exclusions. It is a local numerical-response test, not a global continuity proof, economic causal test or statistical validation. Missing candidates stay unevaluated; mismatched replay fails. ON RRP exclusion and disjoint oil ownership receive regression coverage.

The historical adapter and diagnostic participate in the implementation fingerprint. The corrected comparison starts a distinct prospective cohort; old records and hashes remain unchanged. Do not relabel old elapsed days as evidence for the corrected baseline. A local live record is a separate local artifact, not a restored GitHub Actions cohort. Existing scheduled workflow adoption occurs after reviewed integration without adding a schedule or a paid source.

## Consequences and acceptance

Research output identifies remaining production floors, overlapping inputs and ON RRP treatment as unresolved until migration. Lower current scores cannot select a winner. Rolling normalization, proxy scope, shared benchmark inputs, missing release vintages and the separate forecast/portfolio objectives remain explicit limitations.

Verification covers actual production-adapter units, signs, zero prices, rounding, stale/missing previous observations, weekend carry-forward, fixed-parameter candidate response, exclusion invariance, fingerprint sensitivity and the complete repository suite. Updating an erroneous percentage-based fixture expectation is justified by the actual production adapter; no validation threshold or promotion assertion is weakened. The [evidence report](../PRESSURE_SCORE_REMEDIATION_2026_09_17.md) records refreshed comparisons and remaining gates. Independent review is still required before integration, and independent model review before any production replacement.
