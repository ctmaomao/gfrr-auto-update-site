# ADR-0078: ESLint minimatch security override

## Status

Proposed implementation for review, 2026-10-31. The owner authorized continuing failure repair and publishing necessary fixes. The owner subsequently explicitly instructed Codex to review on their behalf for this task. Record this as Codex AI review, not independent human review; other contract, budget and release gates remain unchanged.

## Context

PR #487 CI failed before repository checks at `npm audit --include=dev`: GHSA-g3hv-75wg-m249 affects minimatch below 11.0.1. The existing lockfile resolves 10.2.6 through ESLint 10.11.0 and @eslint/config-array 0.23.5. The same vulnerable lockfile existed on main; it was not introduced by the SEC repair. Current ESLint releases still request minimatch 10.x. `npm audit fix --force` proposes an unrelated breaking ESLint downgrade and is unsuitable.

Advisory: <https://github.com/advisories/GHSA-g3hv-75wg-m249>. Fixed release: <https://github.com/isaacs/minimatch/releases/tag/v11.0.1>.

## Decision

- Pin minimatch to 11.0.1 only within the ESLint dependency subtree using npm overrides. Keep the direct ESLint version and other direct dependencies unchanged.
- Regenerate the lockfile using npm. The patched minimatch adds its upstream @isaacs/nonrecursive-glob-match dependency and updates its existing brace-expansion range; these remain development-only transitive tooling, not site or Worker runtime dependencies.
- Retain `npm audit --include=dev` as a hard gate. No advisory ignore, lower audit level, force-fix, lint-rule relaxation or checker skip is authorized.
- Verify the actual ESLint integration via `check:syntax`, the full existing `check:changed`/`check:all` suite, a clean lockfile install and npm audit. Test success does not substitute for the owner-designated review or production acceptance.

## Consequences and recovery

This is a deliberate cross-major transitive override, so compatibility is assessed using the project's real lint/file selection and repository checks rather than assuming semver compatibility. It affects development/CI glob matching only. Remove the override after upstream ESLint/config-array adopt a fixed dependency and the lockfile plus all gates pass without it. If the override causes regression, hold publication and revise it; do not disable the audit gate.
