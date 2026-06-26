# ADR-0018 — M-94 Path C frontend consumes static daily snapshot

**Status**: Accepted (2026-06-26)

## Context

ADR-0002 defined the original Worker-first realtime user-facing path: the
frontend would strict-gate `/market.worker-preview.json` and use it as a
realtime overlay when fresh enough, falling back to GitHub `realtime-data`
when not.

M-94 V0 Path C later rewrote the frontend into an editorial daily snapshot
reader. The current homepage loads committed static JSON, primarily
`data/radar-data.json`, and does not run the old frontend worker strict gate.
The old `scripts/modules/realtime.js` module is intentionally retained as a
frozen historical/runtime module, but it is not imported by the current
frontend entrypoint.

At the same time, Worker-first remains the main realtime preview runtime for
Worker health, diagnostics, and explicit Worker preview endpoints:
`/market.worker-preview.json` and `/market.secondary-preview.json`.

## Decision

1. The current homepage frontend reads the static Daily snapshot
   `data/radar-data.json` as its primary display payload.
2. The current homepage frontend does not fetch or strict-gate
   `/market.worker-preview.json`.
3. `scripts/modules/realtime.js` remains frozen and unconnected unless a
   future reviewed stage explicitly reconnects a realtime overlay.
4. Worker-generated `/market.worker-preview.json` remains the main Worker
   realtime preview endpoint and continues to be monitored by Worker health
   checks.
5. Daily pipeline input remains the GitHub `realtime-data` baseline unless a
   separate reviewed ADR changes that relationship.

## Consequences

- ✅ Frontend display is consistent with the committed Daily snapshot and does
  not drift live in-browser.
- ✅ Worker health and secondary diagnostics remain isolated from the static
  frontend display path.
- ✅ M-94 editorial IA and loading-state behavior can be guarded without
  depending on live Worker availability.
- ❌ The homepage no longer provides a live realtime overlay by default.
- ❌ Reconnecting realtime overlay requires an explicit product/architecture
  review, including cache-version, loading-state, fallback, and display
  semantics.

## References

- `docs/M94_V0_DATA_CONTRACT.md`
- `docs/m94-v0/M94_V0_FRONTEND_REBUILD_PLAN.md`
- `scripts/check-realtime-js-frozen.mjs`
- `AGENTS.md`
