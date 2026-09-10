# ADR-0041: GDELT event and article counts are different quantities

Status: Owner-authorized eighth reliability item; bounded independent review and CI required before merge.

## Evidence and decision

The Cloud country query sums `event_count` into `totalEvents`, but previously copied it to `totalArticles` and query `articleCount`. The legacy Oil News display also fell back between article and event counts and labelled the result as articles. Those quantities are not interchangeable. Country bucket article counts do not by themselves establish a globally deduplicated article total.

Keep the event aggregation and its scoring inputs. Query diagnostics use additive `eventCount`; `articleCount` and summary `totalArticles` remain present but null. Add `countUnit=country_event_aggregate` and a Chinese reason explaining the unavailable deduplicated article count. Apply this projection to all exits and cache artifacts, including fresh/stale legacy caches and previous-source fallback. Preserve original observation times. Live input must contain an array of country buckets and explicit nonnegative safe-integer event counts (numeric integers or decimal digit strings); invalid structure enters the existing failure/fallback path. An actual empty array represents zero. Genuine zero-event cache is reusable; absent event totals remain null and article-only records cannot supply them. No API request, retry or refresh cadence is added.

Legacy Oil News rendering uses explicit nonnegative numeric event fields, displays country-aggregated events and an unknown deduplicated article count, and never uses articles as events. Missing counts remain unknown (including unavailable sanctions/chokepoint counts); they do not become zero or a green quiet state. This is display-only and does not alter ODP direction, primary radar scoring, source rights or discovery-only gates. DESIGN §2/3/4/5 remains unchanged; asset version follows the existing bump procedure.

## Reviewed validator transition

The existing World Order validator requires numeric `articleCount`. Retain that legacy assertion when the explicit `countUnit` discriminator is absent. For the new country-event contract, require null article counts, a nonempty Chinese reason, nonnegative safe-integer or null event totals, and explicit query `eventCount`; a successful query requires an observed numeric count. Article-only legacy summaries are not reusable event caches. This is a reviewed version-specific quantity transition, not a general nullable relaxation or checker bypass. The real validator CLI must accept valid old/new fixtures and reject unknown legacy nulls, missing/negative new event counts and resurrected article totals.

## Acceptance

Use offline mocked real fetcher paths for live, fresh/stale cache, previous-source fallback and observed zero. Verify totalEvents, query units, cache projections, original dates and input immutability. Exercise the real renderer with positive, zero, null and invalid counts. Compare the actual browser fallback before/after at 1440 and 390 pixels. Retain all unrelated assertions and run the full suite. Existing production JSON is not rewritten by this patch; the reader handles its legacy fields immediately, and future natural generation normalizes the source artifacts.
