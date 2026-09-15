# ADR-0049: Bubble source evidence gaps versus source failures

Status: owner-requested incident repair; independent AI contract review passed on 2026-09-16 after fixing the initial source-content validation finding. Local full verification passed; remote audit and CI must pass before integration.

## Incident

Audit run 34957868183 at 6732e894 passed its builder and seven data-contract leaves, then failed on VC and Neocloud fallback classification. ADR-0048 intentionally rejects ambiguous/old VC periods and incomplete dated Neocloud coverage. The audit only recognized the older ARR evidence fallback, so the new policy rejections were indistinguishable from broken source access. The preceding September 11 run used pre-0048 source logic; its green result does not justify restoring the old date/coverage behavior.

## Decision and explicit audit classification revision

Add two narrow WARN cases: `vc_ai_share` with `vc_current_period_unconfirmed`, and `neocloud_credit` with `neocloud_current_coverage_unconfirmed`. Require `auto_fallback`, explicit non-stale state, a valid dated research snapshot with independently replayed age within its existing limit, and structured `bubble-evidence-gap-v1` diagnostics from the current audit date. VC requires its successful nonempty WordPress response; Neocloud requires all five registered pages to be fetched with recognizable company content. Every requested source must appear exactly once with `status=ok`.

VC health checks the unfiltered API rows: actual body or excerpt text, valid article timestamp/calendar date, article ID/title and an HTTPS Crunchbase article URL. A title alone cannot substitute for content. Neocloud checks the corresponding registered company for each page, not any company in the basket; common HTTP-200 challenge pages are invalid content. Old valid article dates remain healthy source access but cannot satisfy the unchanged current-observation gates.

Any timeout, HTTP error, invalid content, missing/duplicate source, unknown reason, missing diagnostics, invalid/future/mismatched snapshot date, expired fallback or mismatched audit date remains FAIL. Historical reports without this evidence cannot be retroactively reclassified. The matched fetch-failure entry must have the same indicator and exact semantic reason prefix. WARN remains explicit in the JSON report and Actions summary; it does not claim live evidence exists.

This is an explicit extension of audit policy, not a presentation patch or blanket fallback allowlist. Existing ARR and insider rules, checker assertions, source validity gates, scoring, source URLs and workflow failure exit logic remain intact. No skip or ignore entry is added.

## Validation and boundaries

Unit tests cover both eligible cases and transport/content/metadata/date negative cases. Run the actual free-only audit, inspect its artifact and verify that all four snapshot files are byte-identical afterward; then run the full required check suite. The audit remains artifact-only, does not commit generated data, invoke Wind, write AI output or deploy. Production status/value/date decisions are unchanged; the builder only retains additional diagnostic evidence on the fallback provenance.
