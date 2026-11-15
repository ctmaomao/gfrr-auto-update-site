# ADR-0109: Distinguish intentional Macro budget pause from failure

## Status and context

Proposed, 2026-11-12 implementation for the owner's request to investigate repeated
GitHub Actions errors, based on main `cbce451b6b15e1ad7bfac433e33ee3137af27a31`.
Independent actual-diff review, full checks and exact-head CI remain required.

Macro runs [42943910276](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42943910276),
[42946982770](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42946982770)
and [42950855573](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42950855573)
stopped at the read-only DeepSeek preflight with `deepseek_budget_uninitialized`.
The monthly budget is intentionally uninitialized. An automatic trigger should
record that pause without reporting an operational failure or publishing content.
The additional one-shot grants remain consumed; this change grants no new call.

## Decision

- Only Macro explicitly opts into `--allow-uninitialized-monthly-skip`, alongside
  `--require-eligible`. A skip requires the exact production repository/workflow
  on main, Actions `workflow_run`, explicit monthly selection, Macro consumer,
  a present GitHub token and **both** monthly genesis and review variables empty.
  The decision is local and precedes any GitHub/provider request. It is not an
  exception handler that turns a broad set of budget failures green.
- Missing credentials, malformed/partial configuration, manual or one-shot runs,
  budget/store/clock/history/price failures, exhausted allowances and unknown
  errors remain failures. Budget libraries, all ledgers, reservations, amounts,
  source, provider, review, writer and fact-checking gates are unchanged.
- Emit explicit budget eligibility, disposition and reason to Actions output and
  summary. Day/input admission runs only when eligibility is true. Its existing
  downstream conditions still gate discovery, provider, review, writing and push.
- An intentional skip verifies admission/provider/save were skipped, no transient
  Macro artifact directory exists, and both tracked/index diffs are clean. Only
  the existing bounded safe diagnostic receipt is uploaded. Its expected-skip
  claim requires successful skip verification, all downstream outcomes skipped
  and all inspected content artifacts absent. Unknown is never skip proof.
- Pages and EdgeOne reuse the existing bounded read-only publication-review code.
  A successful Macro `workflow_run` is suppressed only after two authenticated
  GETs verify the exact repository, workflow path/ID, main head SHA, run ID and
  attempt, one successful Macro job, successful budget/skip-verification/receipt
  steps, and every expense/write step skipped. No artifact/summary text is used
  as authority. Missing, duplicate, failed or untrusted evidence preserves the
  existing checked publication behavior. No arbitrary URL is fetched and no raw
  error, body or token is logged. EdgeOne's new inspection job has only contents
  and actions read permissions; its publisher permissions do not change.

## Contract review and consequences

This deliberately changes only automatic Macro's dual-empty monthly configuration
from failure to an audited no-op. Default CLI and other consumers retain strict
failure semantics. The workflow checker gains additive assertions; no existing
assertion is deleted, relaxed or ignored. The budget-wiring check adds the new
regression file so `check:all` reaches it. These are explicit contract changes
requiring independent review, not a presentation-only patch.

No notification setting is disabled. Real failures continue to notify. GitHub can
still create downstream workflow runs, but verified no-op runs skip build/deploy
jobs rather than treating a green editorial pause as new published content.
If GitHub metadata is unavailable, the existing publication checks remain active;
this optimization does not hide unknown state or suppress unrelated source/code
publication. Manual force, schedule and other upstream triggers are unchanged.

## Verification and limits

Offline real-CLI tests replace fetch before import and verify zero provider/write
requests, exact skip/failure outputs and secret-free diagnostics. Synthetic GitHub
metadata tests cover run/attempt/head mismatch, all side-effect steps, malformed
and duplicate evidence, bounded errors and both publication routes. Safe-receipt
checks distinguish intentional pause from unknown, failure and produced artifacts.
`check:changed` and `check:all` are required, with final results recorded by the
coordinator. No production JSON, source collection, account balance, provider call,
workflow rerun, ledger initialization or remote mutation is part of local tests.
Future natural runs provide runtime acceptance; no paid refresh is used to test
notification behavior.
