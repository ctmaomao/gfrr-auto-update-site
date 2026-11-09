# ADR-0093: Preserve NVIDIA proof through the editorial projection

- Date: 2026-11-09
- Status: Locally validated and independently AI-reviewed; exact-head CI and serial merge pending.
- Scope: Bubble editorial compact score evidence and its offline regressions only.

## Context

[Refresh Bubble Watch run 42631412749](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42631412749) completed the data builder, then failed `check:bubble-watch` with 13 failing tests. Twelve failures came from the first normal r5 NVIDIA evidence gap: the full source record passed its strict validator, but `buildEditorialScoringSnapshot` stripped `provenance.detail` before validating the compact proof. That removed the mandatory unavailable/current-ineligible/null-ratio markers. The disclosure also lacked a name for this registered gap. A future qualified record would lose its arithmetic/period proof through the same projection.

The thirteenth failure read freshly synced curated configuration using a fixed 2026-11-04 test clock. A newer ledger then correctly returned `ledger_date_invalid`, whereas the test expected the different historical newer-ledger protection case. This is not grounds to relax date validation.

The run skipped its data commit and retained no artifact. The later `4ce78149` commit changed only editorial status, not the failed Bubble data. The builder logged Big5 capex/OCF auto success near 95%, but this is insufficient to inspect each company's periods and amounts or certify the Amazon correction on either published site.

## Decision

1. Keep the existing source and compact validators unchanged. For a registered NVIDIA contract, retain an explicit compact projection of the proof they require. A gap carries only contract, qualification status, null ratio, false current eligibility, mode and original checking clock. A qualified record carries signed-record evidence, period identities, amount arithmetic, source identity and both original freshness proofs. Do not copy raw collector responses or unrelated metadata.
2. Name the NVIDIA gap in the existing deterministic Chinese disclosure. Preserve the fixed Core-23 denominator, unknown points, exact mathematical ranges, unchanged verdict rules and all legacy v2/r1-r4 compatibility.
3. Replace only the ledger unit test's moving production input with explicit synthetic historical dates. Keep every protection/no-mutation assertion and add future-ledger rejection and later-clock protection. The separate production-config age-policy assertion remains. This is a deterministic test-input correction, not a new exemption or weaker assertion.
4. Add offline regression coverage for r5 gap and qualified projection, tampering, original clocks, collector-extra exclusion, 60 KiB size, JSON-compatible proof, and the actual input/review/guarded-writer path. No new skip or ignore list.

## Boundaries and acceptance

No scoring, live source, workflow, production JSON, curated configuration, provider/search call, retry or budget change. No manual full refresh or failed-run retry. The patch must pass `check:changed`/`check:all`, full measured unit tests, independent AI review and exact-head CI before serial merge. Existing workflow deployment rules remain unchanged.

Natural refresh completion and a data commit, followed by inspection of the actual Amazon/Big5 provenance on the published sites, remain separate acceptance steps. A status-only commit, synthetic fixture or successful code CI cannot substitute for them. Rollback is a normal revert of this isolated code/test repair, not data replacement.

## Local validation receipt

`check:changed` including `check:all` exited 0. Measured unit tests passed 1,654 tests with one existing conditional skip and no failures (coverage 99.86% lines / 93.23% branches / 97.96% functions). Changed JavaScript lint, syntax and whitespace checks passed. Independent AI review inspected all six files and ran 29 targeted tests without unresolved P1/P2 findings; it is not a human approval.

An additional in-memory replay substituted only reads of a synthetic November 9 full-refresh shape and a later ledger. Original base code reproduced exactly the 12 missing-gap-proof errors and one future-ledger assertion failure; the repaired three affected suites passed 38/38. The two source files' SHA-256 hashes remained unchanged. This reproduces the incident shape, not the unavailable original run artifact. All 55 allowlisted Pages source files are byte-identical to base `4ce78149`. Local browser E2E was not run because locked Chromium is absent; exact-head CI retains its browser and EdgeOne checks.
