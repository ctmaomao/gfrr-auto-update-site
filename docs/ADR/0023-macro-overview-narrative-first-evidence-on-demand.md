# ADR-0023: Macro overview uses a narrative-first, evidence-on-demand reading path

- **Status:** Accepted
- **Date:** 2026-08-11
- **Extends:** ADR-0014, ADR-0022
- **Related:** ADR-0008, ADR-0011

## Context

ADR-0022 integrated the valid DeepSeek `macroRiskEditorialLayer` immediately after the deterministic Hero. The new editorial already contains a six-module read and a cross-asset confirmation/divergence section. The older deterministic blocks remained fully expanded between that editorial and `#wow-key-changes`:

- `#homepage-pressure-sources`
- `#homepage-signal-layers`
- `#homepage-risk-engines`
- `#homepage-cross-validation`
- `#homepage-macro-coherence`

A production-page audit found that the four owner-nominated blocks alone occupied about 2.0 desktop viewports and 4.7 mobile viewports. The whole bridge from Pressure Sources to Week-over-Week occupied about 6.5 mobile viewports. The result was transparent but repetitive: readers had to pass multiple deterministic reformulations of the same module and cross-market evidence before reaching the concise weekly delta.

The owner approved a readability-first IA change on 2026-08-11. The requirement is to reduce default repetition without deleting deterministic calculations, audit evidence, stable DOM ids, or the non-AI fallback path.

## Decision

`#macro-risk-overview` adopts the following narrative-first order:

1. `#homepage-today-judgment`
2. `#macro-risk-editorial` when contract-valid
3. `#wow-key-changes`
4. `.threshold-block`
5. `.trend-block`
6. `#homepage-macro-drivers`
7. `#homepage-market-temperature`
8. `#macro-professional-evidence`

`#macro-professional-evidence` is a local `<details>` element inside the overview. It contains, unchanged in data meaning:

1. `#homepage-pressure-sources`
2. `#homepage-signal-layers`
3. `#homepage-risk-engines`
4. `#homepage-cross-validation`
5. `#homepage-macro-coherence`

The fold behavior is conditional:

- Valid and visible `macroRiskEditorialLayer`: professional evidence is collapsed by default.
- Missing, stale, mismatched, invalid, or render-failed editorial: professional evidence opens automatically so the deterministic explanation remains immediately available.
- A reader may manually open or close the fold after initial rendering.

The top jump navigation consolidates the five technical anchors into one `#macro-professional-evidence` entry. The nested ids remain stable for deep links, tests, and renderers.

## Boundaries

- This is a frontend information-architecture change only.
- No scoring, module, cross-validation, decision, execution, position, Worker, workflow, provider, or production-data logic changes.
- None of the deterministic render functions are removed or bypassed.
- The professional evidence must not use `display:none` as its normal eligible-editorial state; native `<details>` preserves user access and semantic disclosure.
- `#wow-key-changes` remains deterministic and must render whether or not the AI editorial is eligible.

## Consequences

### Positive

- The default reading path becomes Hero → editorial judgment → weekly change, matching editorial-news reading order.
- Repeated model diagnostics remain available on demand.
- AI failure restores the deterministic explanatory surface automatically instead of leaving a thin or opaque page.
- Mobile users avoid several screens of mandatory repeated reading.

### Negative

- Some deterministic evidence is no longer visible without one disclosure action when the editorial is valid.
- Tests must cover both collapsed eligible-editorial and expanded fallback states.
- DESIGN.md and the M-94 placement override must remain synchronized with this ADR.

## Rejected alternatives

1. **Delete the five blocks:** rejected because they retain audit, diagnosis, and fallback value.
2. **Use CSS `display:none`:** rejected because it removes reader-controlled access and creates a weaker transparency path.
3. **Always collapse, including AI failure:** rejected because the AI layer is explicitly fail-closed and cannot become the only detailed explanation.
4. **Leave Week-over-Week below all diagnostics:** rejected because it preserves the main readability problem.

