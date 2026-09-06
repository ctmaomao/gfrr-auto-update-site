# ADR-0027: Resolve design-document contradictions without changing the UI

## Status and authorization

Accepted and merged in PR #304 after [owner-authorized AI review](../REVIEW_2026-09-06_CLOSEOUT.md#accepted-pr304). That reviewer exception applies only to PR #304; general review requirements remain unchanged. The owner's 2026-09-06 scoped correction supplied the pre-change design review for this documentation-only task; no external issue was posted. Future design/IA changes still follow DESIGN.md's issue and PR review procedure.

## Decision, defined before the DESIGN.md edit

- Literal color values are permitted in definitions of approved CSS tokens and in explanatory documentation. Consumers continue to use tokens. This does not grandfather every existing raw color in runtime code.
- Preserve exactly one existing legacy color exception: `.indicator-card .meta` in `assets/styles.css` may retain `border-top: 1px dashed #999`. This selector/declaration exception does not authorize using #999 in new components or replacing token-based borders elsewhere. A future token migration is a separate visual change.
- Literal font-family names are permitted inside the definitions of the three approved font tokens; consumers use `var(--font-*)`. Remove PingFang SC from the documented serif stack, consistent with the serif-only rule and the actual token definition. It does not become an allowed fallback.
- Replace nonexistent retired checker commands with the actual enforcement split: DESIGN.md plus human review for visual/IA and appendix-folding requirements; the existing frontend-live-contracts suite for live display contracts, including its macro-overview-evidence-fold check. Do not claim a script covers every visual rule.
- Preserve historical references as historical evidence, not executable prerequisites. Mark only the status of ADR-0011/0014 with this scoped supersession, preserving their immutable decision bodies. Their old checker references are historical; the current IA-change process is DESIGN.md §4.3. No assertions are removed or weakened.

## Evidence and scope

`assets/styles.css` defines `--font-serif` with Noto Serif SC, Source Han Serif SC, Songti SC and serif; `.indicator-card .meta` contains the single #999 dashed border. The retired checker files and package entries are absent. No CSS, HTML, renderer, scoring, data, workflow, dependency or asset version is changed.

Only the precisely named token-definition and legacy border exceptions are clarified. Existing unrelated visual drift, if any, is not approved by this ADR. Verification and preservation evidence are recorded in the [documentation consolidation receipt](../REVIEW_2026-09-06_DOC_CONSOLIDATION.md).
