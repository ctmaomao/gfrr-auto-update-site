# ADR-0071 — Bubble editorial essentials and advisory quality checks

- Date: 2026-10-16
- Status: Owner-authorized simplification; independent contract PR review before merge
- Acceptance: owner explicitly requests fixing quotation failures and simplifying excessive DeepSeek gates. Existing task authorization covers independent AI review, push/merge/release. The prior one-call cost approval is spent; this PR makes no paid call.
- Narrow supersession: ADR-0062 attribution wording and ADR-0068 §5 literal punctuation blocking, plus editorial presentation/count/minimum-length admission requirements, only for Bubble weekly editorial. Macro Risk and generic external-AI validators are unchanged.

## Evidence

Run38842647919 completed one HTTP200 provider response. Its sole blocker was the terminology quotation “七巨头” absent verbatim from a bounded CNBC excerpt. The actual failure candidate and exact original input are available for digest-bound, read-only replay. A quotation-mark regex cannot establish whether a term is a direct quotation, a translation or rhetoric. Required repeated English publisher names and fixed Chinese verbs also confuse writing form with source identity. Rigid minimum item/indicator/character counts encourage padding when evidence is thin.

## Decision

1. Hard gates remain: valid bounded JSON/schema and field types; registered/eligible source identities and per-claim references; no title-only or discovery-only sole factual support; at least one usable news reference; unsupported financial amount/currency/rate blockers; exact deterministic v3 score disclosure, model/unknown/range boundaries; unsafe wording; freshness, source ledger, production writer and cost/no-retry controls. SourceAttribution identities and all source references remain checked. This is not semantic fact verification.
2. Missing repeated publisher name or fixed attribution verb becomes a Chinese warning. Correct structured sources and the displayed source ledger remain required. This does not certify the prose's attribution or permit expanding unseen article details; readers must consult the cited source.
3. Unmatched terminology, translated or rhetorical quotation marks become a Chinese warning, with no alteration/deletion of prose. Explicit claims of verbatim wording remain blocked when an immediately preceding “原话/原文/逐字引用/逐字引述/verbatim/direct quote” marker and the quoted words cannot be found in that item's approved evidence. This narrow syntax is not a comprehensive quotation-intent classifier; ordinary speech attribution cannot be verified automatically. Prompts discourage unsupported direct quotations.
4. Short supported commentary, fewer than five indicators, incomplete category coverage, fewer timeline/tension/category items, and non-literal coverage-limit wording become quality warnings. Arrays, registered categories, maxima and reference checks remain; headline/lead/score text remain nonempty bounded strings, watchNextWeek and dataGaps each retain at least one item. The 6,500-character total maximum and existing field maxima remain hard budgets. Limited-evidence confidence remains low/medium and <=70. No quotas may force invented events or filler.
5. Prompt guidance uses one overall writing target and budget, no exact item counts or per-paragraph character quotas. Existing financial grounding and source identity instructions remain. Diagnostics separately count blocking financial/verbatim defects and presentation warnings; no full prose, excerpts or credentials are added to diagnostic metadata.
6. Warnings must survive provider → review → projection → metadata revalidation and remain eligible for display. A replay-only failed candidate stays replay-only/non-production even if the amended contract accepts it; no manual promotion or paid retry is authorized by this change.

## Independent assertion changes and verification

This is a standalone contract/checker PR. Old tests expecting absent publisher wording, all unmatched punctuation, missing lexical gap phrases or low presentation coverage to reject are explicitly changed to warnings. Financial inequality/currency/rate, unknown or missing refs, title-only/discovery-only support, unsafe prose, exact v3 score, max-length and one-call failure negatives remain. The provider-path failure fixture changes a one-character headline (now permitted form) to a null headline (still invalid type), preserving failure classification/no retry diagnostics. Prompt assertions replace exact-six/field quotas with the overall safety budget and no-quota rule.

Add terminology/explicit-verbatim and short-format roundtrip tests. Run real failure replay without editing the candidate, paying or writing production, targeted suites and full check:changed/check:all. Independently review actual assertion diff and immutable commit before CI/merge. Do not claim the current production AI has refreshed; a future separately cost-authorized workflow call is still required.
