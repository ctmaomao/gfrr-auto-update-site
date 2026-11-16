# ADR-0117 — One owner for oil detail, one renderer for the verdict

- Date: 2026-11-16
- Scope: owner-requested ODP detail relocation, DOM ownership and browser contracts.

Keep the radar ODP anchor, verdict, headline and link. Move the existing 01 and
folded 02–04 markup intact to the oil page, including retired hidden/inert nodes.
Reuse `renderOilDirectional` with the same five published snapshot inputs across
the oil page; no upstream collection, score, source qualification or verdict logic
changes. The radar retains its existing loader. Remove the oil page's duplicate
verdict rendering and eight-row weekly table; the detailed evidence matrix owns
those same statistics, their clocks, changes and source boundaries. The old
conclusion anchor remains, and the physical anchor opens the evidence fold.

Move detail guards and browser assertions to their new owner, not to a permissive
union of page IDs. Require both pages to contain the shared verdict/headline, and
keep hero-only writes on radar. Existing reading-order, source-health, display,
retirement and responsive assertions remain in force. Browser checks cover equal
verdicts, missing data, anchor/back navigation and desktop/mobile screenshots.
Full checks, links, exact-head CI and independent review precede publication.
Rollback this isolated presentation patch; production artifacts are untouched.
