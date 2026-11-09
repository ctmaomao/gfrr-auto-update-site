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
checked even if another fails. A nonzero exit, signal, spawn failure, or 1 MiB
child-output overflow remains a failed check, and any failed file makes the command
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
