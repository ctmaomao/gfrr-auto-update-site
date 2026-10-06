# ADR-0061: Optional CSP report-uri with one exact receiver endpoint

## Status

Local implementation authorized on 2026-10-05 by owner requesting the next step after the C preparation draft. Independent contract review remains required; this is a proposed capability change, not approved production activation. No push, PR, merge, deployment, receiver request or paid operation is authorized by this record. The earlier #430/#431 review exceptions do not apply.

## Context

The existing EdgeOne Report-Only policy has no report destination. Its shared production policy validator rejects every directive outside the required fixed inventory. The C preparation draft on preserved local branch `codex/csp-c-preparation` (commit `3d64d491`) proposed adding only `report-uri`, but that configuration cannot pass the existing validator. Support must be independently reviewable before any destination is enabled.

The owner continuation is scoped to implementing that support locally. The production JSON stays without reporting, so this change does not activate collection. Public ingress abuse, URL/query transmission, account plan/usage/logs, alarm behavior and bounded C acceptance remain separate unresolved activation decisions.

## Decision

- Retain schema version 1 and every existing required directive in `POLICY_DIRECTIVE_ORDER`. Introduce one optional directive, `report-uri`, outside that required inventory. Its absence preserves the exact legacy policy text and document. Present-but-empty/null/undefined is invalid, not an implicit disable.
- Only the exact string `https://gfrr-csp-report-receiver.gfrrriskradar2026.workers.dev/csp-report` is representable. Do not trim or normalize input. This rejects other hosts/paths, lists, HTTP, credentials, query/fragment, encoded alternatives, trailing slash, case variants, whitespace and separator/header injection. Changing the permitted destination requires another reviewed contract change.
- Serialize the optional directive once, at the end, only when explicitly present in a valid configuration. Never insert it automatically. The only emitted header remains the constant `Content-Security-Policy-Report-Only`; `report-to`, `Reporting-Endpoints` and unknown directives remain rejected. No change to enforced CSP or connect-src.
- Validate both enabled and disabled configurations. `enabled:false` continues to emit the valid `{ "headers": [] }` document, while invalid present reporting values still fail. Removing only `report-uri` restores the previous Report-Only text.
- Preserve literal-hash and placeholder placement/cardinality guards, empty hash rejection, exact hash equality, the 1000-character policy limit, whole-document comparison, directory/content anchors and all staging safety rules. No checker or existing test assertion is removed, widened or skipped.
- Add a manual-only test under `tests/csp/`, outside the CI unit-test glob. Do not modify package scripts, check suites or workflows. The existing staging generator consumes the validated optional directive without an interface change.

## Consequences and review boundary

The only deliberate validation-contract extension is recognizing one optional directive whose value has exact-byte allowlisting. Required directives are not made optional. This is why the change has its own ADR and independent review scope, instead of being hidden in a presentation or activation patch.

Support can be tested offline using temporary candidate JSON and staged page copies; the checked-in production config is untouched. A future merge of this module may wake the existing EdgeOne workflow because the module path is already in its trigger set. With the current production configuration, emitted policy/document stay unchanged; publication outcomes are still subject to real artifact differences, quota, build and readback. No merge/publication is executed in this local task.

Exact destination validation is not authentication, rate limiting, client URL sanitization or a platform spending cap. The public receiver and all privacy/cost gaps remain unchanged. C still requires explicit activation scope, independent human review, privacy acceptance, account/traffic boundaries, bounded verification and rollback permission. Neither this ADR nor local green checks authorizes those actions.

## Verification

Manual command: `node --test tests/csp/report-uri-support.test.mjs tests/csp/edgeone-staging.test.mjs tests/csp/edgeone-staging-review.test.mjs tests/csp/generation-gate.test.mjs`.

Coverage includes exact legacy policy/document bytes derived from real page hashes, the single approved endpoint, enabled/disabled rejection of malformed alternatives, every required directive, unknown/report-to rejection, existing hash/length gates, candidate staging and anchored validation, tampered destination rejection and restoration by removal. All candidate files are temporary; no browser loads or network requests occur. Full `npm run check:changed` (including `check:all`) and whitespace/contract diff review remain required before local commit. Actual receipts live under ignored `test-results/csp-report-uri-support-20261005/` and the latest backlog handoff.
