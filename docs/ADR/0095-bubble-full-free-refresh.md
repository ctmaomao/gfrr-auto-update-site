# ADR-0095: Isolated full free-only Bubble refresh

## Status

Local implementation authorized for independent review. Remote publication and live
activation remain coordinated separately. Integration base `95951a0a` preserves the newer Oil News data and contains
the merged Bubble proof fix, ACLED diagnostics and separate one-shot budget grant.
No provider call, refresh, credential change or production data edit was performed
while preparing this change.

## Context

Current Bubble inputs must be refreshed before a separately authorized, bounded
DeepSeek attempt. The original `Refresh Bubble Watch` workflow includes optional
paid Wind fallbacks and its success triggers the paid weekly editorial workflow.
Adding only a disable-Wind input would therefore not isolate the free refresh.
The existing qualified-only workflow refreshes four indicators, not the full pack.

## Decision

- Add manual/main-only `Refresh Bubble Watch Free`, with no schedule, paid opt-in,
  Wind secret or DeepSeek secret. Bind `BUBBLE_WATCH_DISABLE_WIND='1'` directly in
  the full builder step. The builder returns before reading the Wind environment
  key or local configuration, and all three Wind MCP services reject without it.
- Run the unchanged full builder. Preserve its individual source dates, curated
  and failed-source fallback provenance, freshness checks and missing evidence.
  A new package date is not a claim that every source has a fresh observation.
  Actions Summary lists source dates/modes/staleness and aggregate failures.
- Existing Tavily and Brave durable free-allowance gates remain mandatory. Tavily
  verifies the free Researcher plan and zero PAYGO; Brave requires an unexpired
  verified free request grant. Unknown quota or accounting holds cause missing
  search evidence, never permission to purchase search. No budget override.
- Preserve shared writer concurrency, latest-main checkout/sync, pinned actions,
  Node 24, `npm ci`, Bubble/GDELT checks and full `check:all` before committing the
  existing four outputs. Preserve the recognized commit subject for GDELT history
  auditing. No manual artifact promotion or validator change.
- Keep the original weekly workflow byte-for-byte unchanged. The new workflow
  name is absent from both paid editorial upstream lists. Its GITHUB_TOKEN push
  cannot trigger ordinary push workflows. Pages receives one exact upstream name
  in its existing successful-main workflow-run allowlist. Custom-domain publication
  uses the existing qualified-refresh dispatch of the guarded EdgeOne publisher;
  publisher validation, revision pinning, no-change and release-cap guards remain.
- Add offline workflow tests to `check:workflows`; retain every prior assertion.
  Any future change to these boundaries requires review rather than a free-only
  label alone.

## Consequences and activation

After independent review, exact-head CI and serial merge, dispatch
`refresh-bubble-watch-free.yml` on main once. Inspect the run, committed four-file
output diff and every source's freshness/fallback diagnostics. Verify Pages and
EdgeOne checked revisions. A failed source is not repaired by changing its date.
Only after accepted current data may the coordinator request the separately
bounded paid Bubble attempt. This workflow never authorizes that attempt.

There are no paid research/provider calls in this route. Existing free quotas and
GitHub Actions/platform resource usage still apply. Network failures can preserve
stale/missing evidence or fail publication gates; a successful run alone is not
proof all observations are current. Publication/refresh has not been exercised by
local tests. See [project handoff](../PROJECT_BACKLOG.md).
