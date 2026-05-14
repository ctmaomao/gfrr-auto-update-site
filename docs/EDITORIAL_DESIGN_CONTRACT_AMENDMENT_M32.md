# Editorial Design Contract Amendment M-32

Effective date: 2026-05-14

This document records the first direct amendment to `DESIGN.md`. It is scoped to
v28.0M-32 and documents why the visual contract changed after real-use feedback
from the maintainer.

## Purpose

M-32 amends the editorial design contract while keeping the underlying
Bubble Watch paper-report identity intact. The amendment addresses three
observed visual issues:

- Folded appendix sub-modules needed more breathing room without becoming
  rounded card UI.
- The Global Risk Heatmap canvas needed a dedicated paper-adjacent background
  to separate it from the page surface.
- The M-31 strict ban on decorative gradients made the WoW section accent feel
  flatter than the original fade overlay.

## Amendment 1: New Canvas Background Token

`DESIGN.md` §2.1 now defines:

```css
--paper-bg-canvas: #F5F0E5;
```

The token is reserved for chart and canvas containers. It stays within the same
warm paper family as `--paper-bg: #FBF7F0`, but is slightly darker so a canvas
container can be seen without using shadows, rounded cards, cool colors, or a
heavy decorative treatment.

## Amendment 2: Color Usage Rule

`DESIGN.md` §2.2 now distinguishes:

- `section / card` main backgrounds: must continue to use `--paper-bg`.
- chart / canvas container backgrounds: may use `--paper-bg-canvas`.

This keeps ordinary editorial modules on the primary paper background while
allowing data visualization containers to read as bounded surfaces.

## Amendment 3: Gradient Rule Revision

`DESIGN.md` §8.1 #4 now distinguishes primary surfaces from decorative layers.
Gradients remain forbidden as primary `section`, `card`, or `body` backgrounds.
Decorative `::before` / `::after` fade overlays are allowed, and functional data
visualization gradients such as legend color scales remain allowed.

This supersedes the M-31 strict interpretation that disallowed every inline
`linear-gradient`, including decorative pseudo-element fades.

## Maintainer Reasoning

The maintainer's post-M-31 visual review concluded that:

- A dedicated canvas tint improves heatmap readability while preserving the
  paper theme.
- Folded sub-modules need whitespace, not stronger card decoration.
- The original WoW fade overlay gave the section a more refined editorial
  surface than the M-31 solid tint.

Decision principle: real-use visual judgment can refine the contract when the
result is documented, checked, and kept inside the project's hard boundaries.

## Boundaries

M-32 does not change data, scoring, decision, execution, position logic,
workflows, External AI behavior, market-pricing calculations, or any production
JSON files. It changes only the frontend design contract, its matching checker,
and CSS/HTML presentation details required by the amendment.

## Future Maintenance

Future visual work should treat `--paper-bg-canvas` as a narrow token for chart
and canvas containers only. Decorative gradients remain limited to pseudo-element
overlays or functional data visualization scales; they must not return as primary
surface backgrounds.
