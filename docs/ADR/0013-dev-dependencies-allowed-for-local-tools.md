# ADR-0013: devDependencies allowed for local development tools

- **Status:** Accepted
- **Date:** 2026-05-19
- **Supersedes:** none (refines ADR-0001 scope)
- **Related:** ADR-0001 (zero-dependencies)

## Context

ADR-0001 established a strict zero-dependencies policy for the project: `package.json` must declare no `dependencies` or `devDependencies`. The rationale at the time was:

1. Dashboard and production runtime code (scripts running in GitHub Actions, frontend JS) must be auditable, reproducible, and free of supply-chain risk
2. Solo non-technical operator cannot reasonably audit complex dependency trees
3. The project's intended runtime surface (browser dashboard + GitHub Actions workflows) does not need a package ecosystem

This worked well as long as the project only consumed JSON/CSV from APIs (GDELT, OFAC) or manually-typed normalized data (SIPRI). It became a hard blocker when ACLED integration (M-63 series) required reading native Excel `.xlsx` files — a format ACLED publishes manually-downloaded aggregated data files in. ACLED does not offer CSV exports for these aggregated files (verified 2026-05-19 by operator). Hand-writing an `.xlsx` parser would require ~300-400 lines of ZIP+XML parsing code — adding non-trivial long-term maintenance debt for what is otherwise a solved problem in the JavaScript ecosystem.

## Decision

ADR-0001's zero-dependencies rule is **refined**, not overturned. The new policy is:

### ALLOWED (`devDependencies` only):
- **Sanitizer scripts** that read external data formats (xlsx, pdf, parquet, etc.) and emit derived JSON consumed by the production pipeline
- **Build helper tools** (schema validators, doc generators, migration scripts)
- **Test frameworks** (if/when the project adopts automated testing)
- **Development-time linters and formatters**

All `devDependencies` must be:
- Used **only** by scripts in `scripts/world-order/sanitize-*.mjs`, `scripts/market-pricing/sanitize-*.mjs`, or other clearly-marked dev-time entry points
- Not imported by any script that runs in GitHub Actions production paths
- Not imported by any code under `index.html` or similar dashboard runtime entry points
- Documented in PR descriptions with justification

### NOT ALLOWED (`dependencies` still forbidden):
- Runtime production code (GitHub Actions workflow scripts, build-world-order pipeline, dashboard frontend)
- Any code that writes to `data/` (production data path remains zero-dep)
- Any code that runs in the user's browser

### Approval process:
- A new `devDependency` may be added in any PR provided the PR description explicitly cites ADR-0013, justifies the choice, and confirms the dependency is only used by a development-time script
- No separate per-dependency ADR is required — ADR-0013 is the umbrella decision
- The PR reviewer (project owner) retains discretion to reject any `devDependency` for any reason

### Mandatory disclosures in any PR introducing a `devDependency`:
1. Library name + version/source (pinned exactly with lockfile integrity, e.g. the official SheetJS `0.20.3` tarball)
2. Why a hand-rolled implementation would be impractical or risky
3. The dev-time script(s) that consume the library
4. Confirmation that no runtime code paths import the library

## Consequences

**Positive:**
- ACLED `.xlsx` ingestion can use SheetJS, a 10+ year-old industry-standard library with broad adoption (GitHub 30k+ stars, used by major enterprises). M-63a unblocked.
- Future data-source integrations requiring native format readers (e.g., parquet, protobuf) have a sanctioned path
- Test framework adoption (if/when the project grows) is unblocked
- Reduces pressure to hand-roll fragile parsers for solved problems

**Negative:**
- The repo now has a `package.json` `devDependencies` section. Solo operator must remain vigilant in PR reviews to ensure new devDependencies are genuinely dev-only and not creeping into runtime paths
- `npm install` is now required as a development-environment setup step (operator does not need to run `npm install` to use the dashboard, only to run sanitizer scripts)

**Neutral:**
- `package-lock.json` will start being tracked (committed to git) once the first `devDependency` is added in M-63a
- This refines but does not invalidate ADR-0001 — runtime production code remains zero-dep

## Implementation notes

- M-63a will be the first PR to add a `devDependency` (`xlsx` / SheetJS) under this ADR
- M-63a PR description must reference this ADR (ADR-0013) and confirm all four mandatory disclosures
- M-63b (monthly), M-63c (workflows), and future similar PRs follow the same pattern
- The 2026-07-13 security refresh pins SheetJS Community Edition 0.20.3 from the official CDN with reviewed lockfile integrity, requires `npm audit --include=dev` to exit 0, and enforces file/path/sheet/row limits in both ACLED sanitizers.
- This ADR does NOT retroactively allow adding the dashboard's `package.json` "dependencies" array — that remains forbidden

## Alternatives considered

1. **Hand-roll xlsx parser** (rejected): ~300-400 lines of ZIP + XML parsing for a solved problem. High maintenance debt for a non-technical owner project.
2. **Switch ACLED ingestion to CSV** (rejected 2026-05-19): ACLED's aggregated download files are xlsx-only. Verified by operator inspecting the download page UI.
3. **Vendor a single source file inline** (rejected): Would require either copying SheetJS into the repo (license obligations, ~500KB) or extracting a minimal subset (still ~150 lines of dense code, no maintenance pipeline).
4. **Strict per-dependency ADR** (rejected): Imposes per-PR overhead for what is a recurring design pattern. ADR-0013 as umbrella decision is lower-friction.

## References

- ADR-0001: zero-dependencies (the policy this ADR refines)
- M-63a: ACLED weekly regional sanitizer + importer (the first PR exercising this ADR)
- ACLED EULA Section 3.3: forbids automation against acleddata.com (rules out API-based circumvention of the xlsx issue)
- SheetJS Community Edition Node installation: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
