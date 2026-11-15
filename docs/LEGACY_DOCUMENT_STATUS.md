# Legacy document status and current authority

This is the shared status note for the linked phase documents. Their in-body historical no-go/rollout statements retain their original scope; this note neither grants new operations nor replaces current source/data/production contracts. Snapshot statements below retain their stated dates; verify current artifacts for freshness.

<a id="market-pricing"></a>

## Market Pricing

> **STATUS (2026-06):** Preserved as a phase / scope record. In-body "waiting-for-history / scaffold-only / records empty / not currently present / waiting_for_source / no MA60 / z-score" statements describe the phase named in their section and are **not** a current health assertion. At that historical milestone: `data/market-pricing-history.json` is `status=has_history` with 60+ weekly records for QQQ (primary) plus NDX / IXIC (auxiliary, landed via M-91), `sourceMode=manual_weekly_input_committed`; `data/market-pricing-metrics.json` carries computed MA60 / StdDev60 / z-score metrics for all three (`metrics_active_display_only`) via M-26 calculation + M-91; the homepage Market Pricing Temperature card is **live** (M-27). **Still mandatory:** display-only / audit-only — `affectsScoring=false` / `affectsDecisionModel=false` / `affectsExecutionLock=false` / `affectsPositionGuidance=false`; NDX / IXIC remain absent from `displayInputsBaseline` / `effectiveDisplayInputs` / `values` / Brent promotion / scoring / decision / execution / position. The conditional degradation rule still holds: any asset with <60 validated weekly records stays `insufficient_history` and its card falls back to the waiting-state placeholder (M-27 graceful degradation). Current authority: `docs/MARKET_PRICING_TEMPERATURE_DISPLAY.md` + `docs/MARKET_PRICING_METRICS_CALCULATION.md` + `docs/OPERATIONS.md` + the live `data/market-pricing-*.json`.

Current contract navigation: [temperature display](MARKET_PRICING_TEMPERATURE_DISPLAY.md), [metrics](MARKET_PRICING_METRICS_CALCULATION.md), [operations](OPERATIONS.md).

<a id="external-ai"></a>

## External AI

> **STATUS (2026-08-11):** This document is preserved as a historical phase / scope record. The former `externalAiInterpretationLayer` visible panel and `External AI Production Refresh` workflow have been retired; that field now remains only for data compatibility and manual diagnostics. The separately contracted replacement homepage DeepSeek layer is `macroRiskEditorialLayer`, designed for `MACRO RISK OVERVIEW` and governed by `docs/MACRO_RISK_EDITORIAL_DESIGN.md`, `docs/DATA_CONTRACT.md`, `docs/OPERATIONS.md`, and ADR-0022. Historical disabled/visible rollout wording below describes its named phase only. The rule-based `aiInterpretationLayer` remains separate, and no AI layer may affect scoring / decision / execution / position.

Current contract navigation: [Macro Risk](MACRO_RISK_EDITORIAL_DESIGN.md), [ADR-0022](ADR/0022-macro-risk-editorial-integrated-overview.md), [data contract](DATA_CONTRACT.md), [operations](OPERATIONS.md).

Layer availability, quarantine and budget activation are separate from this historical replacement: see [current backlog](PROJECT_BACKLOG.md). A contract or former successful run does not prove a current article is published.

### Archived L-3D / L-3E planning and audit trail

The former readiness checklist and implementation plan repeated L-3 rollout status and “next PR” gates. They are retained as immutable historical records, not current task queues:

| Original record | Recoverable snapshot / SHA256 |
|---|---|
| `EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md` (1,043 lines; 38,478 bytes) | [L-3E original](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_IMPLEMENTATION_PLAN.md); `ca2ec297bd8acf94ea26226d1252b5e4f19c76585356b727c13fa93e4d417af3` |
| `EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md` (422 lines; 29,942 bytes) | [L-3D original](https://github.com/ctmaomao/gfrr-auto-update-site/blob/1d1db6093a4109c99b04c9458a41e0a11562d155/docs/EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_READINESS_CHECKLIST.md); `f1693c23f7ecb5db201394707d81229e3c8c9bb2bd15fa7ddace5fe8dcd50c3a` |

Preserved scope and unresolved authority:

- The manual dry-run/provider-test workflows are distinct from the retired scheduled production refresh. Archiving these plans neither enables a provider call nor removes manual gates. Use [provider workflow design](EXTERNAL_AI_PROVIDER_CALL_WORKFLOW_DESIGN.md), [secret/first-call gate](EXTERNAL_AI_SECRET_AND_FIRST_PROVIDER_CALL_GATE.md), current workflow/checkers and [operations](OPERATIONS.md) for the matching manual path. Keep dry-run no-network/no-secret, environment-gated step-only secret injection (never CLI/log/artifact), `max_attempts=1`, no automatic retry, fail-closed validator/quality/sanitizer checks, short artifact retention and no production/Worker/Daily/scoring/decision/execution/position side effects. Historical 120000/180000 ms timeout, 3-day retention and concurrency decisions remain in the original records; archiving does not change their applicable implementation.
- Original provider-safety history remains distinguishable: `25583503038` and `25591115649` were no-call dry-run successes; `25591202053` was the expected missing-secret failure, not a provider attempt. `25592238444` executed one fixture call but failed quality and blocked artifact upload because the diagnostic contained the secret **name**, not a confirmed leaked value; `25593082968` passed the fixture path. `25598085025` stopped before any local-compact call because of a read-only source-path sanitizer false positive; its exception did not permit actual production-data upload. `25598379612` executed a call but failed execution-language quality (`执行灯`); `25598887574` later passed local-compact validation/quality/sanitization with `promotionEligible=false`. Successful transport was never sufficient promotion approval, and past calls/retries confer no new quota or permission.
- L-3P/P-1 recorded the first controlled data-only write from `25598887574`; L-3T through U-1 later enabled and audited the old visible panel. L-4A/A-1 recorded the former single `23:50 UTC` production-refresh schedule and manual run `25611392014` / commit `c32af65` / artifact `6898516584` (3-day retention), not current workflow availability or a recoverable live artifact promise. That scheduled path and panel are now retired; do not restore them from this history. Compatibility/manual contracts and current Macro/Bubble budgets remain separate.
- L-4C monitoring was design-only, with GitHub-native failed-run notification recommended; it added no issue/Slack/email/webhook automation, retry or extra schedule. Its proposed L-4D successor is not certified completed by this consolidation and is not an instruction to start. Earlier invalid-`max_attempts` remote test proposals likewise must not be relabeled as executed merely because later stages exist. Original plans, failure records and unverified proposals remain accessible at the fixed snapshots.
