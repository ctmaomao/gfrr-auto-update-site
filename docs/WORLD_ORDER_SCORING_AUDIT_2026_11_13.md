# World Order scoring audit — 2026-11-13

User requested accuracy and reliability improvements. Audit base: `328d5967`.

## Implemented scope

Daily fallback must have a valid, non-future input timestamp under the existing five-minute clock-skew policy. An explicitly invalid input timestamp cannot borrow the enclosing Daily publication clock. Missing/invalid/future clocks yield the existing unavailable path, not high market confirmation. No score weights, thresholds, sources, production JSON or frozen research files change.

## Remaining bounded findings

- Daily baseline has no maximum age gate. An offline synthetic 2020 baseline with six high values produces 88 points and confidence 1. The fix above prevents invalid/future clocks but deliberately does not invent a stale threshold. A follow-up should define per-series observation age, source frequency and weekend/holiday handling; wrapper age alone is not evidence freshness. Reject or qualify stale components before scoring, retaining dated history separately. This is an explicit scoring-contract change requiring independent review.
- The market dollar/gold criterion uses `dxyStrong=105` without source-family identity. Current input is the Fed broad dollar series, not ICE DXY. On the checked production snapshot, this condition contributes 12 of 36 market-confirmation points. This sensitivity result does not prove 105 was originally calibrated to ICE, nor justify replacing it with an invented broad-index threshold. Require source identity plus historical calibration or remove qualification under a separately reviewed model revision.
- World Order is a heuristic overlay, not a calibrated war/crisis probability. Missing-source handling and confidence do not form statistical confidence intervals. OFR remains the main published financial-stress readout; this patch does not change it.

## Verification

Existing 43 OFR/publication/market-input unit tests passed in a read-only audit. Added Daily invalid/future-clock regression coverage. Full-suite, independent-review and publication outcomes are reported separately; focused tests are not a full release pass. No external provider calls or production generation in this audit.
