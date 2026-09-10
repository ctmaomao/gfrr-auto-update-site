# ADR-0038: ACLED runtime freshness and retained historical inputs

Status: Owner-authorized implementation; bounded independent contract review and CI required before merge.

## Problem

The loader reports readable real-data files as ok even after their weekly/monthly observation dates expire. Confidence remains 0.9 and the overlay continues using them. Separately, the default full suite eventually rejects those same files for age alone, preventing unrelated publication. Neither behavior supports safe unattended operation.

## Decision and scope

Owner authorized the eight-item reliability remediation on 2026-09-10. This independent contract PR changes the ACLED lifecycle and related World Order reliability calculations; it does not change primary radar scoring or introduce data acquisition.

Keep existing observation-age bands: weekly fresh below 14 days, aging through 30, stale through 90; monthly fresh through 35, aging through 60, stale through 120. Future or invalid dates are unusable. Preserve original data and dates. A non-fresh source is partial with warnings, never silently ok. Source/evidence confidence is reduced by the worst dated component. Reliability multipliers are 1 / 0.75 / 0.35 / 0, using the existing GDELT partial/stale scale as a conservative policy, not empirical probabilities or a claim of calibrated accuracy.

Apply the weekly multiplier after clamping the ACLED contribution; expired weekly data contributes zero as excluded evidence, not as an observation of peace. Available dated weekly evidence uses its actual metrics even when monthly data is missing or old; monthly-only aging cannot substitute the old partial placeholder score. Existing placeholders with no weekly date are not redesigned here. World Order gives freshness bonus only to ok sources and caps overall confidence by the fraction of sources with positive confidence; a wholly unusable source cannot be offset to certainty by bonuses. Its aggregate partial state and source warnings remain visible. Fresh complete inputs retain their existing results.

## Reviewed checker transition

The ordinary `check:world-order-acled-weekly` and `check:world-order-acled-monthly` commands retain strict expiry checks, including weekly >90 days and monthly >180 days. Sanitizer/operator gates remain strict.

The full runtime suite uses explicit `-runtime` commands invoking the same structural checkers with `--runtime-history`. Only the upper observation-age rejection becomes a warning, so already stored history can coexist with current healthy sources. Invalid/future dates, provenance, six-region coverage, numerical relationships, source rights and all other assertions remain enforced. Existing weekly/monthly tests remain included. The runtime command additionally requires real scorer time-advance tests proving partial status, reduced confidence and expired weekly zero contribution. There is no ignore list, blanket skip or validator weakening hidden in a presentation patch.

## Acceptance and limits

Test fresh, aging, stale, expired, future and malformed dates; original input immutability; actual source contribution and confidence; strict operator versus retained runtime history. Run full checks and independent review. Do not refresh source/provider data merely to validate this change. Natural World Order generation and deployment remain a separate runtime receipt.

Monthly >120-day runtime exclusion remains intentionally more conservative than the existing >180-day import rejection. Regional window alignment is the separately authorized fifth item. Future calibration must use recorded vintages and held-out observations rather than tune these multipliers to current scores.
