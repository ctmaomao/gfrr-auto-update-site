# Editorial Design Contract Compliance M-31

## Purpose

v28.0M-31 is a narrow compliance pass for the frontend editorial design contract. It fixes four audited findings and strengthens `scripts/check-editorial-redesign-contract.mjs` so the same violations are caught locally.

This PR does not amend `DESIGN.md`. It applies the existing contract and records the maintainer interpretation for one previously ambiguous rule.

## Findings Fixed

### Finding 1: Method-card border radius

`assets/styles.css` used `border-radius: 8px` on `.editorial-method-card`.

This violated:

- `DESIGN.md` §6.2: 全站默认 `border-radius: 0`
- `DESIGN.md` §8.1 #1: no rounded cards outside the listed exceptions

M-31 changes method cards to `border-radius: 0`.

### Finding 2: Inconsistent method-card left stripes

Only the DATA BOUNDARY card used a left accent stripe. The other five method cards had no matching structural accent.

M-31 gives all six method sub-cards the same 4px left stripe pattern using `--method-card-accent`, with locked token assignments:

- READING PATH: `var(--paper-ink)`
- EVIDENCE LAYERS: `var(--paper-ink)`
- DATA BOUNDARY: `var(--editorial-orange)`
- AI BOUNDARY: `var(--paper-muted)`
- NOT ADVICE: `var(--risk-red)`
- GOVERNANCE: `var(--paper-ink)`

### Finding 3: Weak heatmap canvas frame

`.heatmap-frame` used `border: 1px solid var(--paper-line)`, which is visually weak on the paper background.

M-31 changes it to `border: 1px solid var(--paper-line-strong)`, aligning with `DESIGN.md` §6.1's indicator-card border rule.

### Finding 4: Decorative inline gradient

The inline `.editorial-section-wow::before` rule used a `linear-gradient(...)` decorative fade.

Maintainer interpretation of `DESIGN.md` §8.1 #4: ALL gradients, including decorative fade overlays, are disallowed. This is the strict reading.

M-31 replaces the gradient with a solid token-compatible tint.

## Checker Strengthening

M-31 adds four assertion groups to `scripts/check-editorial-redesign-contract.mjs`:

- `.editorial-method-card` must not use positive border radius.
- All six method sub-cards must have consistent `--method-card-accent` inline styles.
- `.heatmap-frame` must use `var(--paper-line-strong)`.
- Inline `<head><style>` blocks must not contain `linear-gradient(...)`.

These checks are additive. No existing assertion is removed or weakened.

## Future Contract Note

A future `DESIGN.md` revision may amend §8.1 #4 to make the strict gradient interpretation unambiguous. Until then, the M-31 interpretation is the project rule for inline decorative gradients.
