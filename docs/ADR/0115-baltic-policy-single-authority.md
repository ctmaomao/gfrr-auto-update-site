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

The pre-existing generic all-true/all-false helpers do not prove required key presence;
that separate hardening remains open and is not disguised as solved here. The fixture
is an internal contract, not a license or approval from a data provider. Rollback is
this isolated PR's reverse patch; no production data migration is involved.
