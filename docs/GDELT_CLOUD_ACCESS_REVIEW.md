# GDELT Cloud access and evidence review

Review date: 2026-09-16. Status: account verification and live sample pending.

## Verified evidence

- The owner's product email advertises a renewed 7-day / 1,000 QU evaluation,
  without activation, including API/MCP, three daily Monitors and two Briefs.
  This is not an account-specific expiry receipt.
- [Public pricing](https://gdeltcloud.com/pricing) distinguishes free web/API
  Arena access (50 QU/month after evaluation) from API-key access. Continued
  API access requires a paid plan, active evaluation, claimed offer or explicit
  entitlement. Ordinary API reads cost 1 QU; Situation creation/expansion can
  cost 5 QU. Verify account terms before consuming the evaluation.
- Production `data/gdelt-world-order-cache.json` was independently read from
  the custom domain: successful live fetch at 2026-09-16T01:04:22.994Z,
  1,494 country-aggregated conflict events. This proves that request succeeded,
  not future access or a globally deduplicated article count.
- The runtime uses a daily country/conflict summary, a 12-hour cache, one
  live attempt, and degraded retained evidence on failure. Normal daily use is
  approximately 28–31 ordinary requests/month, excluding manual diagnostics.
  QU sufficiency alone does not establish API entitlement.
- [Product documentation](https://docs.gdeltcloud.com/) describes linked events,
  stories and article evidence. [Coverage](https://gdeltcloud.com/data) documents
  source-specific freshness and gaps. Product descriptions are not independent
  evidence of extraction accuracy or the incremental value for this project.

## Narrow correction

Remove the obsolete 100-units free API statement, including when normalizing
legacy cache summaries. Classify only HTTP 429 as rate limited; explain 401,
402 and 403 without asserting that all denied requests mean trial expiry.
Keep original evidence timestamps, low confidence and the no-retry policy.
No score weights, data schema, production source or frontend is changed.

## Bounded evaluation acceptance plan

Owner authorized proceeding with the previous assessment's steps on 2026-09-16.
Before any live sample, verify account entitlement, expiry and free QU balance
in the existing account. Credentials stay user-entered and out of reports.

Use at most 12 serial ordinary read requests / 12 QU from confirmed free credit,
with no retries, Situation creation, research-agent calls, Briefs, recurring
Monitors, overage or subscription. Stop on denied access or uncertain metering.
Record consumed requests even when a request fails. Do not use production
refresh as a sample collector or publish raw provider responses.

Allocate up to six reads each to a relevant geopolitical situation and an AI
company development: discover existing records, inspect their events/stories,
then original article links. Choose concrete records from returned results;
do not invent IDs. Compare against existing project evidence for the same
reporting window and note event dates separately from publication dates.

Record incremental original URLs, usable publication dates, geographic/entity
matches, duplicate/syndicated coverage, factual support and QU cost. Two domains
reprinting the same story do not establish independent confirmation. Cloud is
an aggregator, not automatically an official primary source. No events or no
usable evidence is a valid negative result, not permission to increase budget.

Promotion requires useful new evidence and a sustainable access path. Changed
event coverage requires separate calibration review before any score changes.
Public DOC rate limiting is a separate problem and is not fixed by this trial.

## Pending outcome

The browser is at the existing-account sign-in screen. Account expiry, continued
API entitlement and actual sample quality remain unverified. No trial queries,
new credentials, subscription or recurring monitoring have been created by this
review. Do not mark the evaluation complete until the account and sample steps
have actual evidence.
