# ADR-0039: Frozen GDELT pressure reference scale

Status: Owner-authorized eight-item remediation; independent model review and CI required before merge.

## Evidence and decision

The legacy linear contribution clamps at 100 for every one of 30 distinct-day successful, non-cache historical GDELT Cloud snapshots. Applying the stale multiplier before that cap also leaves all those stale contributions at 100. This hides both variation and loss of freshness.

Keep the original event/category/region raw weights (1.4/1.2/1.8/5). Use `100 * pressure / (pressure + 1538.2)` and round only after the existing partial 0.75 / stale 0.35 multiplier. Unknown/error states contribute no GDELT evidence. The frozen scale is the median raw pressure of the sample roster in [calibration](../../config/gdelt-score-calibration.json). It is reproducible from the recorded commit and source summary for each day, selected from the last 60 data commits at de184bd0. These are 30 observed days between August 7 and September 10, not 30 consecutive days. Runtime does not query history or refit.

Historical fresh GDELT contributions change from 100 everywhere to approximately 37–53; stale contributions are capped at 35 even for extremely large counts. This is a transparent sensitivity repair, not a statistically validated risk probability. The narrow, overlapping seven-day sample windows are dependent, contain selection/provider biases and do not span all crisis regimes. No predictive accuracy claim or threshold optimization is made.

## Contract and interpretation

World Order remains an independent overlay. Its dimension weights, classifications, market confirmation and primary radar scoring are unchanged. Its numeric scale and possibly state nevertheless change: old/new scores must not be compared as evidence of improving real-world conditions. Newly generated artifacts include `scoringModel.version=gdelt-pressure-v2`, the frozen calibration ID and `comparableToLegacy=false`; existing artifacts without metadata remain legacy. A user-visible warning carries the same limitation. Schema envelope stays 1.0.0 with additive metadata; no existing production JSON is rewritten.

No existing checker assertions are relaxed. New tests reproduce the median, demonstrate historical range, monotonicity and effective extreme-count stale discount, and exercise the actual overlay with unchanged input objects. Full checks, independent review and CI precede merge. A future model replacement needs distinct evidence, frozen version and held-out evaluation; this historical normalization does not satisfy that requirement.
