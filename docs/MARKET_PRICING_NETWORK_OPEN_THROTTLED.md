# Market Pricing Network Open (Throttled) - v28.0M-21

> **STATUS:** Historical phase record; current Market Pricing state and still-mandatory display-only/degradation boundaries: [shared status and authority](LEGACY_DOCUMENT_STATUS.md#market-pricing). Read that note before interpreting the phase-specific restrictions below.

v28.0M-21 is the FIRST M-series step that can open the network. It remains
audit-only and manual-artifacts-only.

Default mode is dry-run, with the network closed. A real fetch requires the
explicit `--network=open-throttled` flag.

## Boundaries

- Max 1 fetch per invocation.
- 30-second timeout enforced with AbortController.
- Max 1 retry, with no exponential backoff.
- Source URL is read from
  `docs/fixtures/market-pricing/network-open-throttled-manifest-v28.0M-21.json`.
- The manifest contains exactly ONE entry: Stooq public CSV for QQQ.
- Response is written ONLY to
  `manual-artifacts/market-pricing/network-fetch-attempts/`.
- Response is NEVER written to `data/*` or any production data file.
- `records=[]` in all reports. M-22 is the first record-write step.
- M-20 source format validation runs BEFORE any disk write of fetched body.
- HTML masquerade is rejected when the body starts with `<`.
- Empty body is rejected.
- Non-`text/*` Content-Type is rejected.
- No `process.env`, no auth header, no cookie header.
- No redirect across hostnames.

Inherited M-17 through M-20 boundaries remain false:

- `sourceApproved=false`
- `liveFetchApproved=false`
- `sourceComplianceReviewed=false`
- `symbolMappingVerified=false`
- `sourceFormatVerified=false`

Market Pricing Temperature remains waiting-for-history. M-21 does not calculate
MA60, standard deviation, z-score, bands, or temperature.

Future M-22 will define the contract for writing the first real record to
history.

## Usage

```bash
# Dry-run (default; safe; network closed)
node scripts/market-pricing/network-open-throttled-scaffold.mjs --dry-run

# Throttled open (manual; first real fetch; writes to manual-artifacts only)
node scripts/market-pricing/network-open-throttled-scaffold.mjs --network=open-throttled
```

Do not run the throttled-open command from CI. It is a manual review operation
only.
