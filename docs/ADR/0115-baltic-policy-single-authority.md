# ADR-0115 — Baltic policy document ownership

- Date: 2026-11-16
- Scope: One checker and its documentation; no runtime, source, permission or scoring change.
- Status: Implementation for the owner's maintainability request; independent review and exact-head CI required before merge.

## Decision

The Baltic coexistence checker previously required identical policy identifiers in
multiple prose documents. The existing [policy](../ROUTE_LEVEL_TANKER_FREIGHT_BALTIC_CONTEXT_POLICY.md)
and its JSON fixture now own those identifiers. The six existing authority/history
entry points must link to that policy instead of repeating its version and enum names.
Only the repeated Baltic clauses in four current documents are shortened; the dated
implementation history and all adjacent route/source-rights clauses stay unchanged.

The original policy text checks remain, with moved identifiers and the fixture link
added. Fixture values, frontend DOM/count, production-data source and disconnected
confirmation, renderer, package and suite registration checks are unchanged. No
ignore list or skip is added. This is an explicit change to **documentation** acceptance,
not a claim that the full old and new checkers accept identical Markdown. Link-only
entry points intentionally fail the old duplication rule and pass the new rule;
missing links or canonical policy evidence fail the new checker.

## Verification and limits

`tests/unit/baltic-policy-authority.test.mjs` runs the real checker in isolated
copies, covering all six links, canonical evidence removal, unsafe fixture flags,
card count, route DOM/renderer/production connection and registration removal.
Before release, compare old/new implementations against the same runtime/fixture
mutations and their respective valid documentation baselines; require equal rejection.
Run the full suite and independent actual-diff review, including unchanged substantive
assertions. This is one policy, not permission to migrate the other Markdown checkers.

## Follow-up: required policy keys (2026-11-16)

The generic all-true/all-false helpers validate present values only. The actual
checker accepted omitted, empty or scalar approval/boundary records, and a partial
record could silently lose a required prohibition. This is a fixture-integrity gap,
not evidence that production access or scoring was bypassed.

The Baltic checker now requires non-array objects and all 11 approval / 17 boundary
keys explicitly, then retains the original strict boolean checks over **every** key.
Additional flags remain accepted only with the same restrictive value. No global
helper or other policy changes. Tests run the real checker against each missing key,
wrong values and malformed records; they fail on the previous implementation.
Full checks and independent review remain required. This strictly narrows fixture
acceptance, without changing runtime, documentation ownership or source rights.

The fixture
is an internal contract, not a license or approval from a data provider. Rollback is
this isolated PR's reverse patch; no production data migration is involved.
