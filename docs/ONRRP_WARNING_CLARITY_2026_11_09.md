# ON RRP independent warning clarity

## Acceptance baseline

2026-11-09: bounded follow-up to the authorized financial-evidence audit, based on main `508bd665d5cb647dd8fe531c8cee605552942dc4`. Correct the current independent warning to **隔夜逆回购余额偏低** and explain: **余额偏低不等于银行准备金短缺，需结合银行准备金余额与货币市场利差判断。** This is an interpretation correction, not evidence of better crisis forecasting.

## Evidence and scope

The coordinator independently verified these official sources before implementation:

- [New York Fed RRP FAQ](https://www.newyorkfed.org/markets/rrp_faq.html): an outstanding RRP shifts Fed liabilities “from deposits held by depository institutions (also known as bank reserves) to reverse repos while the transaction is outstanding.” These are distinct liability categories.
- [Williams, 2025-11-07](https://www.newyorkfed.org/newsevents/speeches/2025/wil251107): “By contrast, it has very limited usage when repo rates are well above the ON RRP rate, as is the case today.” The quote describes that speech's date, not a new observation today.
- [Perli, 2024-05-08](https://www.newyorkfed.org/newsevents/speeches/2024/per240508): when ON RRP is zero or stable at low levels, reserves absorb subsequent balance-sheet runoff roughly one-for-one, all else equal. This concerns future runoff mechanics, not a diagnosis of present reserve scarcity.

The Chinese boundary is a careful synthesis, not an official direct quote. No new source fetching, source qualification, threshold, key, count, scoring, calibration or cohort change. The Daily producer changes only the label. The current detail renderer maps `onRrpCritical` by stable key so old dated JSON need not be rewritten; unknown and other labels/details retain existing behavior. Three current static labels and the nearby Fed explanation match. Historical reports, retired execution text and `onRrpLevel` enums remain unchanged.

本 PR 符合 DESIGN.md 的所有规则。This text-only change retains the existing appendix structure, typography, classes and colors (§§2–6); no CSS, IA or component is introduced. The required frontend cache bump is `onrrp-wording-20261109`; other frontend changes are only generated import/version synchronization, including decision and matrix imports. Frozen realtime is unchanged.

## Validation and limits

- `cmp package-lock.json ../gfrr-radar-accuracy-20261109/package-lock.json` exit 0 before copying existing node_modules; no dependency installation.
- Focused generator/real-renderer tests: 10/10 pass. Synthetic fixtures cover strict threshold, accepted/rejected source status, real zero vs absent values, unchanged other signal/count/detail, old-label key override, unknown labels, repeated signal/no-signal visibility, current independentWarnings precedence and an empty current array suppressing legacy signals. Dated fixtures are not current observations; renderer does not mutate them.
- Syntax for app, renderer and pipeline: exit 0. Full unit coverage: 1,649 pass / 1 existing skip / 0 fail; lines 99.86%, branches 93.23%, functions 97.96%, exit 0. Final `check:pipeline-pure-helpers`: 247/247 pass after the independent-review test addition. `npm run check:changed` including the complete `check:all`: exit 0. The added independentWarnings test landed after its pipeline phase; the final 247-test rerun and full coverage above cover that test-only delta. Final receipt edits were checked for document links and whitespace.
- Independent review, exact-head CI, desktop/mobile before/after screenshots and computed-style verification remain pending with the coordinator. Cloud Chromium socket launch was denied in prior work; this patch does not retry or bypass it.
- No production generation, provider calls, production JSON/history edits, commit, push, merge or deployment performed here. Passing local tests does not substitute for the remaining review/visual/CI gates.

## Implementation self-audit

The semantic diff matches the acceptance baseline. Nineteen other tracked files were compared after normalizing only the cache token and match HEAD byte-for-byte; no checker assertion changed, no ignore/skip added, and the production/config/workflow/history/frozen-realtime diff is empty. `git diff --check` passes. This self-audit does not replace independent review.
