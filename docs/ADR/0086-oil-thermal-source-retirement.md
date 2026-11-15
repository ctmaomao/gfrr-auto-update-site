# ADR-0086: FIRMS source retirement and historical cohort guard

## Status

2026-11-15 narrowed reuse of PR #503 under the owner’s continuing end-to-end accuracy repair authorization. Backend-only implementation; independent patch review, 11 offline regressions, scoped ESLint and check:changed (full check:all) passed locally. Exact remote CI and natural production acceptance remain pending. The original draft remains historical evidence; its frontend/freight changes are not restored. No provider call, production snapshot edit, baseline promotion or scoring change.

## Evidence and decision

[NASA FIRMS coverage](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html) ends S-NPP on November 2, 2026; NOAA-20/21 remain listed. [NOAA cessation notice](https://www.nesdis.noaa.gov/news/update-4-cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-november-02-2026-1540-utc-and-decommissioning-issued-november-2-2026-1800-utc) gives 15:40 UTC. HTTP-success empty responses cannot prove current sensor coverage.

1. Add the explicit diagnostic category `source_retired` to the existing request and artifact contracts. All prior assertions remain. Current S-NPP requests stop before network/retry; explicit historical windows ending before retirement remain readable.
2. Keep actual NOAA-20/21 observations. Incomplete or changed source coverage pauses all comparisons against the historical three-source baseline, including repeated/elevated classifications. Empty results do not prove normal operations or resolve a previous observation.
3. Missing/duplicate/changed source declarations and artifacts generated after retirement are ineligible for the old three-source baseline cohort, even if HTTP diagnostics reported success. Synthetic health fixtures explicitly declare their original three sources; no assertion is removed.
4. Preserve existing baseline values, thresholds, maturity and dated-age disclosure. A two-source baseline needs separately reviewed cohort migration; no automatic promotion.
5. Preserve the current retired thermal frontend and cross-confirmation state. The lifecycle helper is backend-only. No new source, credentials, schedule, UI, production data edit or score effect.

## Verification

Offline tests cover the retirement boundary, zero calls/retries, historical windows, actual NOAA records, empty/partial results, source changes, full production-shaped synthetic output and old-artifact quarantine. Full check:all and independent exact-patch review are required before integration. Natural future production output must be verified separately; tests are not evidence that an upstream API currently returns data.
