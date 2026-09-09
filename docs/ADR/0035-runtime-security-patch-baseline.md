# ADR-0035: Runtime security patch baseline

- Status: Owner-authorized implementation; independent merge review retained.
- Date: 2026-09-09.
- Scope: Audit remediation step 2, committed separately from presentation changes.

## Decision

Require actual Node runtime `>=24.20.0 <25`, matching package engines and the lockfile. Keep `.nvmrc`, `.node-version` and Actions on major 24 so newer compatible LTS patches remain selectable. `check:node-runtime` checks `process.version` as well as declarations; prereleases and other majors fail closed.

Upgrade the existing Playwright development dependency from 1.61.1 to exactly 1.63.0, including its lockfile integrity and existing dependency allowlist assertion. The allowlist remains exact: Playwright plus official SheetJS 0.20.3, with zero production dependencies. No assertion is removed or bypassed.

The owner explicitly approved the audit's upgrade recommendation and sequential commit/push. This does not authorize production deployment or change independent merge review requirements.

## Evidence and verification

[Node 24.17.0](https://nodejs.org/en/blog/release/v24.17.0) includes security fixes newer than the audited local 24.15.0. [Node 24.20.0](https://nodejs.org/en/blog/release/v24.20.0) is the selected same-major LTS release. [Playwright release notes](https://playwright.dev/docs/release-notes) document the selected test-tool upgrade.

Validate actual installed runtime, old/current/future patch and major rejection cases, locked dependency audit, full checks, measured unit coverage and Chromium desktop/mobile smoke. Retain the old local Node installation as a reversible fallback; reverting the repository patch is separate from switching local runtimes.
