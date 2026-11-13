# ADR-0114 — Thermal completion publication tail

- Date: 2026-11-13 (UTC)
- Status: Authorized local implementation; independent review and release verification pending.
- Scope: Append the existing thermal producer to the existing EdgeOne completion list. No collection, credential, data, scoring, schedule or quota change.

## Context

`Refresh Oil Thermal Watch` already commits its checked snapshot to main and is
in the Pages completion list. EdgeOne listens to five other producers, while its
push filter intentionally excludes generic data updates. A scheduled publisher
can pin main before the thermal commit; without the completion tail, the custom
domain waits for another publication. This is the same ordering gap addressed
for oil news by [ADR-0085](0085-oil-news-publication-completion.md).

## Decision

Append exactly `Refresh Oil Thermal Watch` to `workflow_run.workflows`, keeping
all five prior names and the completed/main/success filters. Update the exact
checker and cross-workflow expectations to the six-name list, with explicit
thermal-producer name and admission regression coverage. This visible admission
change requires independent actual-diff review, not a weaker checker assertion.

Keep the existing upstream publication review: thermal completion is not a
Macro budget-skip event and proceeds to normal checked publication. Do not add a
new bypass or force-publish path. Retain latest-main checkout, immutable checked
source attribution, full checks, allowlisted artifact, serialized publisher,
no-change skip, 400 releases per 32 days guard, read-only source token and separate
release deploy key. Keep the three-hour backup and exclude broad data push
triggers; do not dispatch or rerun the producer or publisher for this change.

## Consequences and verification

An additional successful completion can run the publication check. Only changed
artifacts inside the existing quota produce a release commit, so a duplicate
completion with unchanged content does not trigger another EdgeOne build. It
adds no FIRMS request or paid call and does not change baseline quality or claim
that thermal observations confirm an incident.

Focused workflow/source-revision/admission tests and the full repository suite
are required before integration. CI must pass on the exact head. After merge,
verify a later natural thermal completion, the checked source/release commit and
both sites' JSON bytes/timestamps; trigger presence alone is not deployment
acceptance. Existing quota, upstream failure and hosting delays can still hold
publication. Reverting this one listener restores the earlier batching behavior.
