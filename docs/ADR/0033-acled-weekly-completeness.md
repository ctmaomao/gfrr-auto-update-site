# ADR-0033: Complete regional coverage before ACLED weekly publication

- Status: Owner-authorized implementation; independent AI merge review required.
- Date: 2026-09-09.
- Scope: Weekly local sanitizer and committed-config guard only. Supersedes M-63 section 3's partial weekly import permission for the production-adjacent config.

## Context and acceptance baseline

Owner checked the official site today: some regions still end on 2026-08-14. This is upstream lag, not a local refresh failure. The published config already contains six regions, with other regions ending on 2026-08-28. A leftover local four-region import could pass the old 1–6-region checker and replace the complete cache. Owner authorized backup/reconciliation, completeness protection and subsequent monthly-methodology review, with separate commits, pushes and independent AI review/merge.

## Decision

1. Require all six canonical regions exactly once in selected inputs, `filesIngested` and `regionalLast4Weeks`. Missing, duplicate or unknown JSON region identities fail. Both JSON arrays therefore cover the same set, independently of ordering.
2. Reject an incomplete nonempty input batch before workbook parsing or output writes. Preserve the existing file on failure. A truly empty input directory remains a no-op; the existing config still passes through the normal checker before publication.
3. Preserve the existing newest-file-per-region selection and duplicate warnings. Accept browser copy suffixes without renaming the original file; validate the filename's calendar date. Unknown input files cannot satisfy a required region. Historical duplicates in the input folder are not duplicate JSON regions.
4. Do not require equal regional dates. Retain real `weekRange` values and the existing max-date `latestWeek` definition, rolling aggregation and freshness thresholds. Do not fabricate newer dates or classify verified upstream lag as failed local publication.
5. Replace only the permissive 1–6 cardinality assertions with stricter exact-coverage guards. Preserve all other assertions, dependencies, source rights, main-only publishing, scoring and runtime paths. This is a dedicated checker-change PR, not a presentation patch.

## Verification and recovery

Positive tests include all six regions with staggered dates and browser suffixes. Negative tests cover missing/duplicate/unknown regions, invalid filenames, actual checker CLI rejection and partial sanitizer input preserving the previous config bytes before parsing. Full project checks and exact-head independent review are required. No raw XLSX, production JSON, paid call or network refresh is changed by this patch.

The two original local configs were copied and SHA-256 verified under ignored `manual-artifacts/acled-reconcile-20260909-044904/` before the clean branch fast-forward. Keep those backups and original XLSX files. Recovery of a local intermediate is a manual copy from that backup for inspection, not authorization to publish its incomplete coverage. Code rollback requires a reviewed revert; do not disable the new guard simply to publish a partial batch.
