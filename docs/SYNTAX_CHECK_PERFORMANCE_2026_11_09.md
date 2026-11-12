# Bounded syntax-check parallelism

## Scope and evidence

The owner's ongoing scientific, evidence-based maintenance request includes reviewing
workflow complexity without weakening data or release checks. This isolated change is
initially based on main `54e9fd16bbd39bfea764fb22014ac668c5afded7`, then integrated
with main `44b88e127ce0b189700630331f165b89514a5393` after the Bubble repair merged.
The next integration includes main `e95d4599546b8706867ae5c64e1bbcce62d2888f`
(PRs #519/#521), preserving their workflow, budget, test and production-data changes.
Existing Bubble, ACLED, budget and free-refresh task records are retained.

The [2026-11-09 EdgeOne run](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42615075024)
spent 216 seconds in `check:all`. Its `check:syntax` segment took approximately 13.27
seconds, measured between the adjacent npm script log headings. Five independent ACLED
timeout test groups account for roughly 75 seconds and retain their real deadlines.
The only duplicated npm-script entry found in the expanded suite was Macro editorial
frontend validation, costing approximately 0.5 seconds; it is not removed here.

Skipping complete checks merely because the published files are unchanged was rejected:
published bytes do not cover all validation inputs or current-time freshness checks.
Combining the three Transport monitors was also rejected: preserving their three
different times would reduce filenames but not runner starts and would add routing.

## Change and preserved boundaries

`scripts/check-syntax.mjs` still recursively discovers the same `.js`/`.mjs` regular
files under `scripts`, excludes only the existing `.git` and `node_modules`
directories, and sorts with the same `localeCompare` order. It runs a separate real
`node --check` for every file. Files are never imported or executed.

At most `min(4, availableParallelism())` child processes run concurrently. Results
are retained by input index and printed in the established order. Every file is
checked even if another fails. A nonzero exit, signal, spawn failure, or aggregate 1 MiB
child-output overflow across stdout and stderr remains a failed check, and any failed file makes the command
exit nonzero. A single available CPU stays serial. There is no persistent validation
cache, environment switch, new dependency, or new ignore rule.

No workflow, provider timeout, checker assertion, coverage threshold, production
data, source acquisition, paid-provider path, or deployment gate is changed.

## Verification and limits

- Two local comparisons checked the same 612 files: original 36.463/34.024 seconds,
  bounded parallel execution 9.467/9.354 seconds. All exited zero and each pair's
  complete stdout was byte-identical. These local timings are not a GitHub runner forecast.
- Nine new unit tests cover discovery, symlinks, ordering, bounded concurrency,
  real parse-only execution, all-file failure collection, and child error handling.
- Independent AI review of the actual implementation and tests found no P1/P2.
  Additional real-process SIGTERM, ENOENT and oversized-output cases failed closed.
- Full `check:changed` / nested `check:all` passed on the initial base. Measured unit
  coverage passed with 1,664 tests passed, one existing skip and zero failures;
  line/branch/function coverage remained 99.86% / 93.23% / 97.96%.
- Latest-main integration at `44b88e127ce0b189700630331f165b89514a5393` passed
  full `check:changed` / nested `check:all` in 262.618 seconds. Full unit coverage
  passed in 46.232 seconds: 1,669 passed, one existing skip, zero failures, with
  the same 99.86% / 93.23% / 97.96% coverage.
- The initial [PR #520 CI run](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42713681016)
  passed on head `74eb0d46177a1dcfcb21674c35fd97b511bfd14e`: 1,669 unit tests,
  104 browser cases and 67 EdgeOne regressions passed, with one existing unit skip.
  The syntax segment checked all 612 files in 6.123 seconds between npm headings.
  This single observation is not a controlled runner comparison or fixed savings claim.
- Integration with main `e95d4599546b8706867ae5c64e1bbcce62d2888f` passed full
  `check:changed` / nested `check:all` in 259.752 seconds. Unit coverage passed in
  45.477 seconds: 1,691 passed, one existing skip, zero failures, with unchanged
  99.86% / 93.23% / 97.96% coverage. All 613 scripts, including the new one-shot
  helper, remain covered. Independent integration review found no P1/P2.
- New exact-head CI is required before merging the integrated revision. No
  production refresh is triggered by this note.

The exact-head CI must still run all its checks. Compare the syntax segment on that
runner before claiming a remote speedup or a particular saving in Actions minutes.

## 2026-11-12 current-main integration

The existing PR #520 is integrated with main `70cac20c5a40d10e228663242adb1be3623232a8`,
including the Markdown cleanup, Brave budget repair, FRED parser extraction and
natural Oil Directional Pressure update. Only the same four task files differ.

Fresh independent review found that the old draft's `execFile` limit applied per
stream, unlike `spawnSync`'s combined stdout/stderr limit. The adapter now counts
raw Buffer bytes across both streams, terminates on aggregate overflow and reports
failure. A real dual-stream regression reproduces the old failure. A second test
preserves CLI execution through a symlink. Existing discovery, exclusions, source
parse-only behavior and all prior assertions remain; there are now 11 focused tests.

On Node 24.22.1 with 9 available CPUs (parallelism capped at 4), all 630 current
scripts passed. Serial runs took 36.751 / 37.778 seconds; the corrected parallel
adapter took 10.112 / 9.856 seconds. Complete stdout was byte-identical across the
serial and corrected runs, a local wall-time reduction of about 72–74%. This does
not reduce the number of checks, workflows or jobs, and is not a billing forecast.

Current-base `check:changed`, including complete `check:all`, passed in 277.202
seconds. Full unit coverage passed in 47.949 seconds: 1,875 passed, one existing
skip, zero failures; coverage remained 99.86% lines / 93.36% branches / 97.96%
functions. The checks ran sequentially with a private temporary directory to avoid
unrelated concurrent ACLED fixture-directory interference. Focused tests, changed-file
ESLint, documentation links and whitespace checks passed. Independent review also
verified combined-byte thresholds, invalid UTF-8, signals, spawn failures and symlink
invocation against the original parser, with no remaining P1/P2.

Exact-head CI and deployment verification still gate completion. Existing CI and
Pages continue running the full suite; no provider or production generation was run.
