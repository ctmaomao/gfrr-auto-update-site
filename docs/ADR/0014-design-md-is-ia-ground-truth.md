# ADR-0014: DESIGN.md §4.1 is the IA ground truth; appendix sections have content boundaries

- **Status:** Accepted; historical checker enforcement references and the process-section pointer superseded by [ADR-0027](0027-design-document-consistency.md). IA and appendix boundaries remain accepted.
- **Date:** 2026-05-20
- **Supersedes:** none (extends ADR-0004 with general IA contract framework)
- **Related:** ADR-0004 (World Order is overlay), ADR-0011 (paper not dashboard design)

## Context

The M-64 audit (2026-05-20) discovered three-way drift between the project's IA (information architecture) sources of truth:

- **DESIGN.md §4.1** declared a 9-position top-level section order
- **`scripts/check-homepage-ia-contract.mjs`** enforced a different 13-position nav contract, treated `#external-ai-auxiliary` as position 9 and `#homepage-realtime-band` as a top-level concern
- **`index.html`** physically placed `#external-ai-auxiliary` at position 2 (immediately after the macro overview), which contradicted both DESIGN.md and the "read-only auxiliary" intent

Additionally, `#world-order-stress-section` was nested inside `#method-evidence` as a `details.editorial-subsection`, violating ADR-0004 line 24 ("前端独立 section,不与 6 大模块并列展示"). Several other misplaced subsections (data layers and system info) had accumulated in `#method-evidence` over multiple milestones.

The root cause was not the placement itself but the **absence of an explicit authority hierarchy**. Each milestone author tacitly assumed a different source was ground truth:

- Some treated `check:all` passing as proof of correctness (it isn't — the checker only enforces what it was told to enforce)
- Some treated existing HTML as ground truth (drift becomes permanent if not actively reconciled)
- DESIGN.md §4.1 was assumed to be a "soft guideline" rather than a contract

M-64 / M-65 / M-66 reconciled the three sources, but without a higher-order rule about which source wins in future conflicts, the same drift will recur.

## Decision

The project adopts an explicit **IA contract authority hierarchy** for all future information-architecture work.

### Authority order (highest to lowest)

1. **ADRs** (this directory) — Permanent architectural decisions. Cannot be overridden by lower layers.
2. **DESIGN.md §4.1** — Canonical top-level section order and runtime-block declarations. The only place that defines what is a top-level section vs a runtime-injected block vs a supporting strip.
3. **`scripts/check-*.mjs`** — Enforcement layer. Reflects (1) and (2); must not invent rules not present in upstream.
4. **`index.html`** — Implementation. Must match (1)-(3). When drift is found, HTML is what gets corrected, not the upstream contracts.

### Direction of change

All IA modifications proceed **top-down**:

1. Update the relevant ADR (if the architectural decision is changing)
2. Update DESIGN.md §4.1 (section order, runtime-block declarations)
3. Update check scripts to enforce the new contract
4. Update `index.html` to match
5. Bump frontend asset cache version (per CLAUDE.md rule #5)

**Reverse-direction drift correction is forbidden.** Specifically: if HTML and DESIGN.md disagree, DESIGN.md does not get edited to match HTML — HTML gets edited to match DESIGN.md. The only exception is when an ADR explicitly overrides DESIGN.md, in which case both DESIGN.md and HTML follow the ADR.

### Appendix content boundaries

The four foldable appendix sections (positions 5-9 in DESIGN.md §4.1) carry **content semantics** that must be respected. Each section's `section-kicker` declares its scope:

| Section | Allowed content | Forbidden content |
|---|---|---|
| `#detail-data` (DATA APPENDIX) | Data tables, charts, raw inputs, time series, data health, system overview / runtime summary | Methodology explanation, decision policy |
| `#world-order-stress-section` (REGIME OVERLAY) | World Order Stress overlay UI per ADR-0004 | Risk module scoring, decision modifiers, execution logic |
| `#method-evidence` (METHOD / EVIDENCE / BOUNDARY) | Methodology, evidence-trail audits, rule explanations, data audits (audit-adjacent) | Data layers, runtime dashboards, system info, regime overlays |
| `#external-ai-auxiliary` (READ-ONLY AUXILIARY INTERPRETATION) | External AI read-only display per ADR-0008 | Anything that affects scoring / decision / execution / position |
| `#execution-risk-detail` (EXECUTION / RISK CONTROL) | Decision overview, execution lights, triggers, position policy, behavioral discipline | Data exposition, methodology explanation |

### Subsection consistency mandate

All top-level `<details class="editorial-subsection">` elements within the four appendix sections must carry a `<span class="subsection-meta">` kicker child. Nested second-level details are exempt. This is enforced by `scripts/check-editorial-redesign-contract.mjs` (M-66).

## Consequences

**Positive:**

- New milestones touching IA have a clear procedure (top-down) and a clear question to ask ("which contract layer am I changing?")
- Future audits can mechanically diff layers against each other; drift becomes a fixable bug rather than a debatable opinion
- Section content boundaries are explicit, so future "where do I put this new subsection?" decisions have a reference to consult
- The "grab-bag drift" pattern (random content accumulating in `#method-evidence`) is now contract-prevented

**Negative:**

- DESIGN.md §4.1 carries more weight; modifying it requires PR justification and downstream sync
- Adding a new top-level section now requires touching at least three files (ADR if architectural, DESIGN.md, check scripts) before HTML can be edited

**Neutral:**

- The four sections' content boundaries codify what was already implicit in the section kickers; this ADR makes the boundaries searchable and enforceable rather than relying on milestone author judgment

## Implementation notes

### Already enforced by check scripts (M-66 baseline)

- `scripts/check-homepage-ia-contract.mjs` enforces the 9-position top-level order from DESIGN.md §4.1 and asserts `#world-order-stress-section` is top-level, not nested in `#method-evidence`
- `scripts/check-homepage-ia-contract.mjs` enforces the M-65 assertion that `#method-evidence` must not contain "站内总览" or "恢复状态" patterns
- `scripts/check-editorial-redesign-contract.mjs` enforces subsection-meta kicker presence on all top-level editorial-subsection elements

### Future work that should cite this ADR

- Any PR that reorders top-level sections
- Any PR that adds a new top-level section (must update DESIGN.md §4.1 first)
- Any PR that introduces a new overlay-style data layer (e.g., Brent overlay, regime overlay) — follow the ADR-0004 + ADR-0014 pattern: top-level section between `#detail-data` and `#method-evidence`
- Any PR that adds a new subsection inside an appendix section (must respect content boundaries above)

## NEVER

- ⚠️ NEVER let HTML drift become the de-facto contract. DESIGN.md §4.1 is ground truth.
- ⚠️ NEVER let check scripts enforce rules that are not in DESIGN.md or an ADR. Check scripts mirror upstream contracts; they do not author them.
- ⚠️ NEVER put data layers, runtime dashboards, system info, or overlays inside `#method-evidence`. It is methodology/evidence/audit-adjacent only.
- ⚠️ NEVER bury an overlay (per ADR-0004) inside another section. Overlays are top-level.
- ⚠️ NEVER modify IA without bumping frontend asset cache version (CLAUDE.md rule #5).
- ⚠️ NEVER edit DESIGN.md §4.1 to match HTML after drift. Direction is always top-down.

## Alternatives considered

1. **Leave DESIGN.md §4.1 as soft guideline, treat check scripts as ground truth** (rejected): This was the implicit pre-M-64 state and it produced the exact drift this ADR is preventing. Check scripts can encode arbitrary rules; without an upstream contract, there is no answer to "is this rule correct?"

2. **One ADR per IA decision (3-4 separate ADRs)** (rejected): The four decisions in M-64/M-65/M-66 are tightly coupled — they all flow from the single upstream principle that DESIGN.md is ground truth. Splitting them would force future readers to cross-reference, and the ADR index would bloat.

3. **Move all IA contract content into ADRs, remove DESIGN.md §4.1** (rejected): DESIGN.md §4.1 has a different purpose — it is the operational contract (concrete section order). ADR-0014 is the meta-contract (which layer wins in conflicts). They serve different audiences and have different update cadences.

## References

- ADR-0004: World Order is regime overlay, not 7th risk module (the original "World Order must be independent section" decision, extended here to general overlay placement rules)
- ADR-0008: External AI is read-only display layer (basis for `#external-ai-auxiliary` content boundary)
- ADR-0011: UI is editorial paper aesthetic (informs why section kickers carry semantic meaning)
- M-64: IA contract reconciliation + top-level section restructure (the audit that exposed three-way drift)
- M-65: `#method-evidence` content cleanup (migrated misplaced data/system subsections)
- M-66: Subsection kicker consistency + risk-explainer legacy id cleanup (codified subsection-meta requirement in check scripts)
- DESIGN.md §4.1: Canonical top-level section order (the operational contract this ADR designates as ground truth)
- DESIGN.md §4.2: Process for modifying IA order (the procedural complement to this ADR)
