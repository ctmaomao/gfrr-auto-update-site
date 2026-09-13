# ADR-0047: Pressure research evidence continuity and vintage audit

Status: Owner authorized work that can be completed now under the existing pressure-model task, including implementation, independent AI review and remote integration. This decision changes only the research record contract, not production score policy. ADR-0046 is reserved by the separate editorial PR; this decision does not integrate that work.

## Evidence and decision

Two defects were independently reproduced after [ADR-0044](0044-contemporaneous-pressure-research.md): hashing the entire Daily script reset the research cohort after unrelated editorial/fetch changes, while one missing calibration week made the 104-week variant unavailable and prevented all six other variants from being recorded.

Use an audit-only `describeRiskImplementation()` manifest containing the existing score function, its calibration/tail/transport helpers, source-validation functions and transport constants. The research fingerprint includes this manifest, the historical adapter, score input contract, actual CSV parser, historical number/date validation, research implementation and full rules. It no longer hashes unrelated Daily code. The explicit transitive dependency list must be reviewed whenever score dependencies change; this is not a general automatic JavaScript dependency analyser. Changes to research code or rules remain conservatively cohort-breaking. No scoring arithmetic is modified.

Ledger v2 records each variant's status, training coverage, null score and null parameters during warm-up. Available variants retain complete replay validation. Valid current observations can be preserved even when every candidate is warming up; this cannot pass benchmark-coverage gates. Missing current observations still fail closed and preserve the last successful artifact. Comparison keeps an all-variants common window and adds per-variant candidate/legacy comparisons on the same dates, explicitly disclosing unavailable records. Pairwise results with different sample counts must not be ranked as though they share one window.

This PR explicitly revises the research validator's former all-variants-required assertion. It is a separate research contract change, independently reviewed with positive and negative regression coverage, not a hidden relaxation of production validation. Production checkers and score thresholds remain unchanged.

## Cohort transition

The v1 cohort `pressure-shadow-40f8017b10a1360d` contains two verified observations, September 11 and 12. Preserve its original artifact and hashes; never relabel those records as v2. New code/ledger identity starts a new v2 cohort. Its elapsed-time gate starts at its actual first successful recording, not September 11. There is no automatic migration, retrospective backfill or automatic promotion. Both the one-time restart and the old cohort remain visible in the handoff.

## Research extensions

`audit:pressure-vintages` uses seven fixed historical case dates and seven existing inputs. Each historical request goes to ALFRED with an exact vintage date and must return the matching series/date header, ordered finite observations and no observations after that date. Current revised FRED data is a separate comparison panel; it never fills an archived-panel gap. Full execution permits at most 56 requests with 15-second timeouts, no retries or paid credentials. A latest-only refresh needs seven requests; default execution is offline and reuses the recorded retrieval date. Raw CSV and caches remain ignored local research artifacts; no new scheduled fetch or production source is introduced.

A fixed-input/moving-calibration counterfactual and a two-step observed-score decomposition distinguish input changes from normalization changes. Both are diagnostic and order-dependent, not causal attribution or alternative production scores. Bootstrap output calls its blocks paired observations and reports calendar gaps, rather than claiming that 13 available rows always equal 13 consecutive weeks.

## Acceptance and remaining limits

The [September 13 evidence report](../PRESSURE_MODEL_FOLLOWUP_2026_09_13.md) records actual Daily updates, original cohort continuity, missing-vintage results and calibration drift. The original 84-day/40-input/12-benchmark-week collection gates and independent model review remain mandatory; this work does not establish complete historical point-in-time coverage, probability calibration or portfolio utility.

Validation includes unavailable-variant preservation/rejection, unchanged score outputs, hash dependency sensitivity, old-schema rejection, calendar-gap disclosure, strict vintage parsing and counterfactual accounting, followed by the full suite and independent review. Real v2 workflow recording/restoration must be checked after integration.
