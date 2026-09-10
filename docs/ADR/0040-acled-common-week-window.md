# ADR-0040: ACLED common weekly observation windows

Status: Owner-authorized fifth reliability item; independent contract review and CI required before merge.

## Problem and decision

The current weekly source has three regional files ending August 28 and three ending August 14. The sanitizer previously added each region's own latest four/twelve rows while publishing the latest date across all regions; hotspots used a third, global date selection. Those numbers do not describe a common global period.

The local-only sanitizer now selects the earliest of six regional latest observed weeks. It requires an observed row in every one of the trailing twelve consecutive seven-day slots for every canonical region. Global, regional and hotspot aggregates use that same grid; four weeks means its final four slots. Extra newer observations are retained in source provenance but excluded from aggregates. Missing weeks cause an error before writing, preserving the existing config; they are never inferred to be zero. A genuinely zero week must be explicitly represented in the source. This conservative gate may require operator clarification when source exports omit zero-event weeks.

Store the evidence under additive `quality.weeklyWindow`: version, common date, four/twelve grids and six regions. Existing source ranges/row counts remain source-file provenance. The checker adds grid, coverage and range assertions for this metadata; no existing structural assertion is removed. Legacy files without evidence remain structurally checkable with a warning, but runtime excludes their weekly metrics and contribution, returns partial with zero source confidence and an explicit Chinese explanation. This does not reinterpret missing evidence as peace. A valid future sanitizer import automatically restores eligibility; temporal gates from ADR-0038 still apply.

## Validation and scope

Test staggered windows, missing slots, exact totals in the real sanitizer builder, common hotspot dates, preserved provenance/input immutability, malformed metadata and actual scorer exclusion of legacy aggregates. Tests use parser stubs and temporary fixtures, so deployment checks need no XLSX dependency. Full checks and independent review remain mandatory. This PR does not regenerate production data, fetch ACLED or alter source rights. Restoring current weekly evidence requires re-sanitization of the original six manually acquired files through the existing approved operator publication flow.
