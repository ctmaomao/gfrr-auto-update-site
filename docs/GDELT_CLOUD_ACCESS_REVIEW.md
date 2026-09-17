# GDELT Cloud access and evidence review

Review date: 2026-09-17. Status: account verification and bounded evaluation complete; no new production source promoted.

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

## Account and measured use

The signed-in subscription page showed an active Explore evaluation ending
September 23, 2026 at 16:38 (account UI display; timezone not independently
verified). API/MCP access was included by the evaluation, not the base Explore
plan. There was no active paid subscription and auto top-up was off.
The usage page moved from 15 to 19 direct API QU during this evaluation;
remaining bonus credit moved from 999 to 995 QU, with paid overage still zero.
No extra grant, extension, key, Monitor, Brief or subscription was activated.

## Four-request sample ledger

All four ordinary reads succeeded at 1 QU each through API Arena. Fixed date
window: September 10–16, 2026, inclusive; serial requests, limit 10, no retry.
The unused eight-request allowance was not spent.

| Read | Query / existing record | Result |
| --- | --- | --- |
| Events | Hormuz | 10 events; 7 event dates inferred from publication day; search explicitly reports incomplete coverage |
| Events | Nvidia | 10 events; links include investment talks and technology announcements |
| Existing Situation | story `650a95f675fb` | Curated regional grouping; 288 stories, membership capped at 250; narrative null |
| Existing Situation | story `42e395ca7f03` | Walked grouping with two stories; no ready narrative returned |

The geo Situation covers a broader regional cluster than the selected tanker
story. Its counts are not deduplicated original reporting, and membership and
chronology do not establish causation. These reads did not create Situations.

## Evidence quality and project comparison

- An event about a Turkish/Iranian foreign-minister call
  (`cameoplus_3c1c328c1e84180c`) linked its primary story to a Turkish judicial
  case (`35721ad714d4`); its top articles mixed those topics. This is an
  association defect in this sample, not proof that the call did not occur.
  The linked Anadolu original timed out during verification; it was not retried.
- The Nvidia/Anthropic investment-talk event linked
  [Taipei Times](https://www.taipeitimes.com/News/biz/archives/2026/09/14/2003864207)
  and [The Next Web](https://thenextweb.com/news/nvidia-anthropic-ipo-mistral-scale).
  Both attribute the core report to Reuters, so two domains do not provide two
  independent confirmations. Preserve the tentative talks wording. Taipei
  Times' headline says NT$10B while its body says US$10B: a currency inconsistency
  requiring original-body verification, not automatic numeric extraction.
- At repository baseline `a10f4dd9`, the published Bubble weekly editorial's
  source ledger contains one news item (September 15, AI stocks / Fed meeting).
  The two Nvidia URLs above are absent, so the sample adds discovery leads to
  that published ledger. This does not prove they were absent from all private
  discovery candidates, or measure same-window recall across providers.
- The oil watch snapshot is dated September 16 and includes media-domain and
  publication-date metadata; its top-article projection does not retain URLs.
  Exact original-URL overlap cannot be established from that projection.
  No recall or independent-source uplift percentage is claimed.

## Decision

Keep Cloud as a potentially useful manual discovery aid and keep the existing
country-summary integration with corrected access diagnostics. Do not add its
Stories/Situations to production Bubble evidence or scoring at this stage:
the small sample exposes association and independence limits, neither Situation
returned a ready weekly narrative, and continued API access after evaluation
is not established. A single official primary source can support a claim;
multiple syndicated domains cannot substitute for independent confirmation.

The trial does not fix public DOC throttling or guarantee future AI availability.
On access failure, retain dated evidence under the existing stale policy and
report the actual access error; never relabel retained data as fresh. No paid
AI call or production refresh was necessary for this evaluation.
