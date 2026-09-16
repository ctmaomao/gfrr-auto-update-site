# ADR-0050: Bubble editorial bounded midweek follow-up

## Status

Accepted by owner instruction on 2026-09-16; implementation requires independent review. Design discussion: [issue #369](https://github.com/ctmaomao/gfrr-auto-update-site/issues/369).

## Context

September 7 and 14 had healthy searches but zero official/cross-checked stories. The provider correctly skipped; there was no later scheduled opportunity and readers could not distinguish this from failure. EdgeOne did not subscribe to Bubble editorial completion.

## Decision

- Add Wednesday 05:45 UTC, at most one opportunity per UTC Monday week. Only current-week data and proven successful, attempt-1, zero-provider-call `no_credible_news` runs qualify. Inspect all editorial runs in the week. Pending, paid/failed/unknown attempts, existing current-period output and missing/expired evidence block it.
- Persist a reservation before dispatch to the existing sole AI workflow. Preserve reservations permanently; uncertain dispatch does not release the slot. Under the same `gfrr-main-writer-main` lock, the receiver revalidates week, data date, token, existing output and other attempts, then persists its admitted run ID before search/provider work. Duplicate deliveries and Actions reruns cannot reuse it.
- Original AI workflow retains no schedule, one provider invocation, no retry and production-write-free healthy-news skip. A separate follow-up workflow writes only `data/bubble-watch-editorial-status.json`, never AI prose, source values or scores.
- Completed-run and manual follow-up events only update status; only Wednesday schedule may reserve. Initial deployment verification is zero-provider-call. Search budget adds at most 30 requests/provider/month; preserve the 200 reserve and 1,000 cap (767 scheduled + 200 reserve).
- Status schema `bubble-watch-editorial-status-v1`: data date, check time, run ID, bounded reason, provider-called tri-state, credible count and reservation audit. No raw logs, snippets, secrets or model outputs. Unknown call evidence stays null. Browser status must match the data date, be at most seven days old and no more than one hour in the future.
- Pages and EdgeOne subscribe to follow-up completion; EdgeOne also directly subscribes to Bubble AI completion. Existing publisher checks, latest-main checkout and concurrency remain.

## Consequences

The extra opportunity reaches one paid call only after ordinary evidence gates pass; this cannot guarantee a report every week. Three-day artifact retention remains: missing evidence blocks recheck. Original Monday/manual refresh permissions and independent manual cost acknowledgement remain unchanged. This is not a universal budget for pre-existing refresh paths.

The new JSON is an additive read-only frontend input under DESIGN §4.4. The automation/contract PR is independently reviewed separately from the subsequent presentation PR. Its EdgeOne exact-trigger assertion expands from Macro only to Macro plus the two named Bubble workflows; it still requires Macro and does not accept arbitrary workflows. The shared search budget expression becomes stricter; no limit, skip or ignore is weakened.
