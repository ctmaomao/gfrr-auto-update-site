# ARR independent-source integration review

## Scope and acceptance baseline

2026-09-07 owner explicitly approved ARR independent-source integration redesign.
This approves engineering and source review, not a supplier licence, paid calls, or
an unreviewed production switch. This change completes the offline candidate
ingestion/review stage. Automatic collection and runtime adoption remain blocked.

The current four-post SaaStr runtime, curated fallback, 45-day observation gate,
Bubble Watch thresholds and source-health error policy remain unchanged. ARR is a
Bubble Watch Core-23 input: future runtime adoption can change its score, even
though it must not change the GFRR main decision/execution/position contract.

## Source review (2026-09-07)

| Candidate | Finding | Current disposition |
|---|---|---|
| Anthropic official news | [Series H disclosure](https://www.anthropic.com/news/series-h), published 2026-05-28: company run-rate revenue crossed USD 47 billion earlier in May; USD 65 billion is financing and USD 965 billion is valuation. The revenue value is a lower bound with a May 1–28 observation interval, not an exact May 28 observation. | Minimal reviewed facts only; no article body archived. Automatic collection permission unresolved. |
| Sacra research | [Terms §8](https://sacra.com/terms/) require written permission for automated website access and restrict reuse/display. Public availability is not a licence. | Website automation blocked; a separately licensed API/export plus use/display rights would require review. No website scraper or paid request. |
| Bloomberg reporting | [Public preview](https://news.bloomberglaw.com/artificial-intelligence/anthropic-revenue-run-rate-surpasses-65-billion-ahead-of-ipo) reports July run-rate, not an August observation. A later report does not refresh the underlying date. | Discovery/reference only; no paywall access, collector, or production input. Repeated reports are not assumed independent. |

Anthropic's [consumer terms](https://www.anthropic.com/legal/consumer-terms) define
consumer Services and restrict automated collection from them; the applicability
to corporate news and permission for this scheduled use are not established by
that text. [Commercial terms](https://www.anthropic.com/legal/commercial-terms)
cover API offerings; a Claude API key is not a news-data licence. This is a
conservative engineering hold, not a legal determination that all news reading is
prohibited. Do not substitute robots.txt, search visibility or owner approval for
source-specific rights evidence.

## Unified architecture assignment

All three candidates are registered here before implementation, under the
[unified architecture](UNIFIED_DATA_PIPELINE_ARCHITECTURE.md):

| sourceKey | sourceDomain | sourceComplianceStatus |
|---|---|---|
| anthropic_official_news | anthropic.com | automatic_collection_rights_unresolved |
| sacra_research | sacra.com | written_permission_required |
| bloomberg_reporting | news.bloomberglaw.com | discovery_only_rights_unresolved |

Shared registration: `assignedLayer=artifact_sanitizer_layer`,
`primaryOwnerLayer=daily_history_layer`, `freshnessCadence=event_driven`,
`artifactOnlyBeforeProduction=true`, `sanitizerRequired=true`,
`productionWriterRequired=true`, `fallbackPolicy=preserve_existing_saastr_and_curated`,
`affectsScoring=false` for this offline stage only, `affectsDecisionModel=false`,
`affectsExecutionLock=false`, `affectsPositionGuidance=false`.

No standalone scheduled pipeline is created. A future approved adapter must feed
the existing Bubble Watch builder through validation, not write its own production
JSON or update curated snapshots. It needs short timeouts, bounded responses,
sanitized diagnostics and failure isolation before network activation.

## Implemented candidate boundary

- `config/bubble-watch-arr-evidence.json` contains reviewed scalar facts and source
  identifiers only. It is not read by the production builder.
- `scripts/bubble-watch/arr-independent-source-review.mjs` validates the exact
  schema, issuer, company-level run-rate metric, real dates, date ordering, amount
  bounds, value qualifier, source identity and provenance group. Unrecognized
  fields (including apparent approval flags) fail closed.
- Publication date, observation interval and review as-of date are separate.
  Freshness is conservative: the **oldest possible** observation must be within
  the existing 45 days. Monthly/interval dates never become exact dates.
- Lower bounds and estimates are retained as such, never converted to point
  measurements for a slope. Overlapping inconsistent claims and unverifiable
  independence are explicit holds. Four records are not four independent sources.
- The offline report has no lamp/score and always reports
  `productionEligible=false`; source rights and independent runtime review cannot
  be granted by input JSON. It does not modify the production audit's WARN policy.

Run from the repo root:

```powershell
npm run review:bubble-watch-arr -- --as-of=2026-09-07
node --test tests/unit/arr-independent-source-review.test.mjs
```

The review command reads the fixed versioned candidate file and writes only JSON
to stdout. It has no network, file writer, environment opt-in or paid fallback.
Exit 0 means the report was generated, **not** source/production approval; inspect
`productionEligible` and `holds`. Invalid input/options exit 1 with fixed diagnostics.
Without `--as-of`, it uses today's UTC date. The dated example is reproducible,
not a current-freshness claim.

## Remaining unlocks

1. Obtain documented source-specific automated access and intended-use/display
   rights (or an authorized export); do not acquire a subscription automatically.
2. Supply comparable company-level run-rate observations with attributable dates,
   qualifiers and lineage. The May 47B lower bound cannot silently replace or be
   spliced into the old SaaStr 44B series; review possible date/definition differences.
3. Review a source-specific bounded collector and comparable series, then review
   the runtime patch independently before merge/publication. Preserve the 45-day
   gate and stale fallback unless a separately reviewed model change is approved.

This stage does not claim ARR live freshness has recovered. As of 2026-09-07 the
official May interval is 102–129 days old. A July month-only observation would be
38–68 days old and still fail conservative 45-day freshness.
