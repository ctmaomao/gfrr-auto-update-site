# ADR-0096: One-time balance-shape diagnosis without admission changes

- Date: 2026-11-10.
- Status: single authorized read completed; temporary credential-bearing workflow retired.
- Baseline: main `512987e5`, composed with the separately reviewed news repair tree `8cbfd498` (commit `315abcf5`); [ADR-0090](0090-shared-editorial-budget-and-free-search.md) and [ADR-0094](0094-editorial-one-shot-additional-grant.md) remain unchanged.

## Problem and authorization

A Bubble editorial attempt stopped at the currency gate before reservation and generation. The actual balance response shape and mixed-currency deduction precedence remain unverified. The owner explicitly authorized a new manual diagnostic program to access the existing DeepSeek key for **one balance-structure read only**, without exposing the key or amounts and without generating an article. This narrow authorization does not allow a second real read after failure, unclear output or lost acknowledgement.

The existing `validateBalance` remains byte-for-byte unchanged, including `is_available === true`, its single-row requirement and decimal-string checks. No CNY-row selection, FX conversion or currency-gate relaxation is introduced. The additional CNY 4.33 grant, per-consumer single attempt, permanent reservations, price expiry and all article evidence/quality/freshness gates remain unchanged. A currently held article input is still held.

## Diagnostic projection and transport

A pure structural projection and explicit CLI can perform one GET to the fixed `https://api.deepseek.com/user/balance` endpoint. The GET has a 15-second total deadline, a 64-KiB response ceiling, redirect refusal and no retry. It never imports or calls a search, ledger, generation, writer or publication path.

Output contains only fixed schema labels, field-type enums, decimal-format booleans, the balance-array count and exact `CNY` / `USD` / `unknown` currency labels. At most 32 rows are inspected. It never prints amounts, zero/nonzero or affordability judgments, the actual `is_available` value, arbitrary currency/property strings, raw body, headers, provider errors, key, key hash or request identifiers. Missing/malformed/error/timeout results stay generic HOLD. Availability is checked by the unchanged paid gate; diagnosis exposes only its field type and never claims admission.

Every CLI result exits nonzero with `admission=hold`, including a valid structural report. No diagnostic files or artifacts are written. Failure alone is **not** the downstream isolation mechanism: the original article workflow would trigger a status-writing follow-up on failure, so that earlier local draft was withdrawn.

## Temporary, isolated credential access

The new uniquely named `DeepSeek Balance Shape Once 20261110` workflow has only `workflow_dispatch`, `contents: read`, non-persisting checkout credentials and one step-local reference to the existing DeepSeek secret in `external-ai-production-refresh`. This new entry point is the specifically authorized credential-access scope; no credential, environment, grant or account setting is created or modified. All ordinary production workflows and follow-up selectors remain byte-for-byte unchanged.

Both the workflow job and the CLI require main, the exact repository, explicit acknowledgement, `run_number=1` and `run_attempt=1`. The CLI also requires the exact new workflow path. GitHub's [official variable semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/variables) define run number as incrementing for each new workflow run, with reruns retaining that number and incrementing attempt. Thus a new second dispatch and a rerun both hold before the key is read or any GET is issued. This fresh filename has no record in the inspected Git history. Do not rename, recreate, reset or clone the workflow to obtain another first run.

The code expires at **2026-11-11T00:00:00.000Z**, with a 76-second early hold. A no-key step checks the same context/expiry before the secret step; the CLI checks again before reading the key. A first run that never reaches the GET still cannot be silently replaced. Expiry is an extra safeguard, not a renewal mechanism.

The coordinator must verify the exact reviewed code and workflow identity, dispatch once only, retain its run ID, and inspect the outcome without retry. After that single attempt, remove the temporary secret-bearing workflow through a separately reviewed cleanup PR; do not grant Actions write access for self-deletion or change security settings. Keep the diagnostic evidence and offline tests as appropriate, but never leave or recreate an unnecessary credential-bearing entry point. The scope does not permit changing the fixed expiry to get another attempt.

## No direct or delayed publication path

Every existing `workflow_run` subscriber names an explicit upstream allowlist; none contains this diagnostic name or a wildcard. In particular, neither Pages, EdgeOne nor Bubble Editorial Follow-up subscribes to it. The follow-up's scheduled/manual history query is scoped to the original `bubble-watch-weekly-editorial-refresh.yml` workflow ID/path, so it cannot later select this diagnostic as an article failure. The diagnostic itself has no Git writes, GitHub API operations, ledger mutations, artifact upload, dispatch or output-to-production path.

Tests enforce those subscriber and history constraints for success, failure and later history selection without changing normal article behavior. The reviewed code PR may undergo the repository's ordinary CI/publication process; that is distinct from the later diagnostic run, which cannot publish or update status.

## Verification

All implementation tests use synthetic responses and injected transports. They cover amount/availability non-disclosure, malformed/accessor/proxy inputs, immutable paid admission, bounded transport and no retry, first-run/attempt/expiry refusal before key access, no-network CLI defaults and full downstream isolation. All existing assertions remain unchanged. Full checks, coverage and independent review are required before coordinated publication/execution.

See [operations](../OPERATIONS.md#deepseek-balance-shape-diagnostic). A structural report cannot authorize generation, alter credentials, initialize a ledger or establish which currency a mixed account would debit.

## Retirement and sanitized execution record

Run `42738568668` (run number 1, attempt 1) completed the single authorized structure read. The sanitized result was `shape_only` with `admission=hold`: response object, boolean availability field type (value withheld), and a two-row balance array with CNY and USD currency labels. All three amount fields in each row were strings matching the decimal format; no amounts or availability value are recorded. The expected nonzero exit did not authorize another attempt.

The cleanup removes the sole temporary secret-bearing workflow. Tests now positively require its absence and reject diagnostic names, module/CLI invocations, opt-in flags or inline balance endpoint references in every active workflow, while retaining subscriber/history isolation and all pure privacy, deadline, no-retry and once-context tests. Normal workflows, paid currency admission and ledger logic remain unchanged. No further read is authorized; mixed-currency debit precedence and payable balance remain unknown.
