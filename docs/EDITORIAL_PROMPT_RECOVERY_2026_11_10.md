# Editorial prompt recovery · 2026-11-10

## Acceptance and baseline

The owner asked to continue fixing the unsuccessful AI generation. This isolated change starts from main `602d8b35108d1e227029615c76f460986b4166ea`, after #532 and #533. It improves generation instructions, not output admission. It does not consume or restore the already-used per-page paid attempts, change grants, run search/provider requests, edit production JSON, or promote a historical artifact. ADR-0104 status work and the separate Bubble correction candidate are not included.

## Observed failure, not an API outage

[Macro run 42770057296](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42770057296), job 129675497140, passed cost admission, discovery and input preparation. Its original diagnostic artifact reports HTTP 200, `finishReason=stop`, complete JSON, 1,279 completion tokens and five output-contract errors: unsupported `day:7e0`, two unsupported `number:1e0` atoms, numeric pressure prose and no actual credible-news citation. Review and writer were skipped. The rejected text was not retained, so those numeric atoms cannot be assigned to exact sentences or proved to be innocent formatting.

The archived input has a sole official BLS excerpt consisting of release administration/contact text, and coverage metadata containing a seven-day window and one-news count. This confirms inputs that could encourage unsupported prose, not the exact rejected sentences. #532 now addresses substantive release-body eligibility; this patch does not undo that gate or make the old input eligible. #533 provides narrow formatting repair and safe future diagnostics. No newer Macro generation was present in the latest run listing checked for this task.

[Bubble run 42761513954](https://github.com/ctmaomao/gfrr-auto-update-site/actions/runs/42761513954) completed generation, review, writer and repository save before later factual quarantine. A successful provider call is not proof that the article remains publishable. Neither earlier output is reinstated here.

## Changes

- The active OFR user prompt explicitly lists credible-news IDs separately from discovery-only IDs, requires relevant citations in actual claims, and rejects citation padding. It differentiates cited fact text/news from collection metadata and program-displayed snapshots/history. Coverage gaps should be explained qualitatively rather than copying ungrounded counts or durations.
- Pressure prose is explicitly qualitative, without readings, dates, durations, numeric lists or Chinese-numeral evasion. The prompt now supplies the exact optional-section object shapes and existing local string/array limits. Suggested length remains advisory. Confidence is clearly distinguished from retired risk scores.
- Bubble's sparse-news timeline instruction now requires actual dated evidence and explicitly forbids filling slots. The fixed v3 scorecard disclosure is exempt from the instruction not to repeat the narrative and is explicitly identified in the template.
- New offline tests check prompt inventories and optional schemas, request wiring, one-call/no-retry behavior, and rejection of ungrounded coverage numbers, pressure readings, missing credible citations, wrong fields and exceeded bounds. The existing sparse-timeline checker assertion is preserved and still checks routing to structured facts, now with stricter dated-evidence instructions.

No validator, checker, writer, production schema, workflow, provider configuration, budget, dependency, frontend, or production-data file changes. There is no new source or numeric whitelist and no post-response deletion/rewrite of invalid facts.

## Limitations and verification

These are prompt-risk reductions, not proof that a model will comply or that generation is restored. Deterministic token membership is not full semantic fact verification. An existing Chinese-duration gap (`未来七天`) was reproduced during this investigation; the original numeric parser does not reject every Chinese count or duration. This patch instructs against such evasion but does not modify the parser or claim that gap is closed. Existing financial/pressure negative cases remain enforced.

Focused prompt tests (6/6), changed-file lint and the existing Bubble provider/quality/writer regression pass using injected offline responses, with no network calls. Full `npm run check:changed` / nested `check:all` passed (exit 0). Unit coverage passed with 1,804 tests passed, one existing skip and zero failures (99.86% lines, 93.24% branches, 97.96% functions in the configured scope). Independent review of the actual five-file patch found no P1/P2; its separately repeated focused tests and whitespace check passed. No contract-checker assertion or ignore list changed.

This prompt-only change does not require a new frontend asset version; all 56 allowlisted static source files are unchanged. Local browser execution previously denied by the environment is not retried or bypassed. Exact-head CI, merge/deployment and actual paid generation are distinct later stages; offline success does not prove publication or model compliance.
