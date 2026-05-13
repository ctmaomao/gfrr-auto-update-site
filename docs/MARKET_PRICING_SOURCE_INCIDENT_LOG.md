# Market Pricing Source Incident Log

## 2026-05-12 — Stooq Public CSV Endpoint Deprecation

### What Happened

PR #171 M-21 successfully fetched from the Stooq URL. The response body was 7
lines of text instructing the user to obtain an API key. The response was not
CSV data.

### How It Was Caught

M-20 source format verification caused the M-21 fetch validation to fail. The
header row check did not match the expected CSV schema, and the
noHtmlErrorPageMasquerade boundary kept non-market-data responses out of the
history path. The response was written to
`manual-artifacts/market-pricing/network-fetch-attempts/<timestamp>-failed/`,
and zero data was contaminated.

### Why The Governance Contract Worked

- M-17 kept network access behind an explicit gate.
- M-18 kept source compliance unapproved.
- M-19 kept symbol mapping unverified.
- M-20 defined source format checks before any history use.
- M-21 allowed only throttled, manual, artifact-only fetch attempts.

### Route Fork Decision

Short term: manual weekly download from NASDAQ official historical data.

Long term, post-M-27: research alternative truly-free auto-fetch sources.

### M-21 Status

The M-21 script is retained. The manifest entry is retained. Its status field is
set to `deprecated_2026-05-12`. The path may be reactivated if a different
source is approved.

### Future Incident Protocol

Any time a source changes its policy, contract, or format unexpectedly, the
affected sanitizer or fetcher must fail gracefully and zero data must be written
to `data/`. The next step is always to update this log and re-evaluate the
source.
