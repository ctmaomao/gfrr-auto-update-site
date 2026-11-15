# ADR-0103: Conservative editorial normalization and private failure handling

- Date: 2026-11-10
- Status: Owner-authorized revised implementation; independent re-review and serial integration pending.
- Base: `16a6cea14b2fac25fc362b7d9d7724ed84e2737e`.

## Acceptance baseline

The owner approved OFR migration, advisory length/section/source-count targets, evidence-backed limited single-search Bubble generation, deterministic formatting repair, truthful publication states, and preserving facts, units, dates, snapshots, budgets and final writer checks. This follow-up implements normalization and safe diagnostics. The coordinator explicitly approved the narrow existing-workflow changes needed to stop raw rejected/unsaved artifact disclosure. No further provider call, no-news generation mode, budget initialization/reset, new access, credentials, private storage or permission change is authorized. Status and follow-up adaptation are separate ADR-0104 work.

## Review correction: pressure numbers remain prohibited

Independent review rejected the initial proposal to replace the pressure digit ban with numeric-token membership in cited text. A number appearing in a disclaimer is not evidence that it is the current reading: the unchanged fixture has index zero but includes `0–100` in a disclaimer, allowing a false reading of 100 after removing the ban. Parenthesized/bracketed amounts, percentages and durations could also borrow bare numbers when the parser lost their units. These were real regressions, not evidence that the original rule was merely cosmetic.

The revised implementation restores the backend and browser pressure numeric guard. Pressure readings remain program-injected. The same narrow detection-only list-marker view is used in both guards so `1. 关注融资条件。` does not count as a numeric pressure claim. Actual digits, financial expressions, dates and periods still fail even when their number appears elsewhere in cited evidence. The forged999 browser negative is restored. The earlier positive test accepting copied pressure readings and its corresponding policy claim are withdrawn.

The general prose parser still has inherited semantic limits, including wrapped units and some denominator forms. This patch does not claim to bind every number to the correct economic fact, redesign accounting syntax, remove parentheses/signs, or solve semantic correctness across all article sections.

## Existing protections retained

OFR-v2 already permits short prose, empty optional sections and fewer than twelve sources. Bubble already supports limited single-search coverage and warning-only short prose. Bubble's writer loads the saved projection and current target, revalidates original transient input/news/output, current source digest, timestamps, provenance, review and a fresh projection immediately before atomic write. Its failure does not mutate the target. These gates, scoring and budget settlement are unchanged.

Four recent runs show different causes: Bubble 42730102677 stopped at budget currency admission; 42753287944 stopped at unhealthy search with no credible evidence; 42761513954 passed generation/publication before later factual quarantine; Macro 42770057296 failed the output contract. Macro's rejected text was not retained, so the semantics of its rejected numeric atoms cannot be recovered from diagnostics.

## Narrow formatting and diagnostics

- Number detection masks only one/two-digit line-start list markers followed by whitespace and an explicit Chinese prose introducer. It never rewrites the article. Ambiguous markers, English/date/financial/unit starts, decimals, dates, quantities and unsupported durations remain checked. 一元化 followed by 解释/分析/理解/视角 is a lexical expression, while 一元/一元人民币 and 一元化为美元 remain financial tokens. No blanket whitelist for 1 or 7 exists.
- Only absent optional arrays become empty arrays and absent optional historical comparison becomes null. Wrong types remain untouched and fail validation; Bubble adds its missing primitive historical-comparison rejection. Required fields, unknown citations and unsupported facts are never repaired.
- Failure diagnostics expose fixed rule codes, schema-bound paths, bounded counts, canonical numeric keys with bounded grammar and registered source references. Arbitrary legacy errors, unknown keys/IDs, unparsed financial text, URLs and arbitrary provider metadata remain process-local. Credential-derived numeric keys are omitted. Merged root evidence diagnostics identify actual output fields. This is diagnostic information, not proof of claim truth.

## Artifact and log privacy

Removing `replayCandidate` alone was insufficient. Bubble can write a provider-accepted candidate which later quality review rejects, and the old workflow uploaded that entire file. Macro's old uploader ran before final writer validation. Both existing refresh workflows now upload only `safe-diagnostic-receipt.json`; there are no raw-success exceptions, raw failure bundles, wildcards or projection/input/news uploads. Artifact names remain `bubble-watch-weekly-editorial-<run_id>` and `macro-risk-editorial-refresh-<run_id>`, with three-day retention. Upload requires successful preparation of the exact receipt file.

The receipt helper reads only fixed known transient filenames, caps each read at 2 MiB and refuses symlinks/nonfiles. It emits byte counts, SHA256 hashes, fixed provider/review/writer/save step outcomes, bounded review counts and an explicitly sanitized provider diagnostic projection. It never copies candidate, news, input or review text. CLI terminal error logs in provider/review/projection/writer paths withhold arbitrary parser/validator exception text. The receipt schema is `editorial-safe-diagnostic-receipt-v1`; `repositorySaveVerified` and `livePublicationVerified` remain false. Save-step success is not independently verified remote save or live deployment.

Transient runner files remain available to validation/writing. Accepted articles are retained only through the ordinary protected production Git path. Previously preserved historical/private artifacts are untouched; explicit offline replay helpers still work on already-authorized originals but cannot promote them. No full rejected/unsaved generation text is retained by ordinary artifacts. Hashes cannot reconstruct that text. The loss of future replay/debug recovery is an intentional privacy tradeoff, not complete generation retention.

## Interim follow-up compatibility gap

The old Bubble follow-up downloads raw `news-discovery-latest.json` to prove a no-credible-news skip before reserving its once-weekly recheck. Receipt-only future artifacts no longer contain that evidence. The existing classifier will conservatively report unverified and cannot reserve that recheck until ADR-0104 adds independently reviewed safe evidence. This patch does not change any reservation history, predicate, budget guard or recheck admission. It does not claim monitoring/status work is complete or fabricate source counts.

## Assertion changes and verification

The old mocked-provider expectation of a full rejected replay candidate is replaced by an absence requirement. The old 30-day raw failure-evidence upload test is replaced by an exact three-day receipt-only artifact assertion. Both workflow checkers retain all prior call/budget/source/writer guards and add the receipt-only allowlist. No fact or provenance assertion is relaxed. The browser forged999 assertion remains in place.

Synthetic tests exercise wrong pressure labels already numerically present in cited evidence, wrapped financial/unit/date forms through validation/writer/browser, legitimate list formatting, absent-only defaults, final Bubble evidence revalidation and output privacy. Artifact tests cover provider rejection, later quality rejection, writer failure, push failure/cancellation and success; all retain only safe receipts. Real offline CLIs with malicious malformed payloads log fixed failure text, not payload fragments. Oversized files, symlinks and arbitrary metadata are covered.

The frontend change affects qualification only, with no layout/colors/fonts/class changes. It follows DESIGN.md and asset-version rules. No production data is changed. Full final checks, independent exact-tree re-review, serial integration and remote deployment remain distinct stages. Source-body eligibility/supplementation belongs to ADR-0102, not this patch.

### Local verification receipt (revision two)

Revision one's independent review failed and its policy was corrected; its frozen patch remains historical, not approved. Revision two `npm run check:changed` / nested `check:all` passed (exit 0). Final `npm run test:unit:coverage` passed (99.86% lines, 93.24% branches, 97.96% functions). The final affected Macro core suite passed 116 tests; focused privacy/default/grounding/writer/browser checks passed. Changed functional files passed ESLint, app syntax and whitespace checks. Full `npm run lint` still reports 222 errors with exactly identical file/line/message records to archived base.

No production data changed. Only the two existing editorial artifact workflows changed, without new secrets/permissions/provider calls. No live browser screenshots, remote CI or deployment was performed. Independent exact-tree re-review and serial integration remain pending; repository-save and live-publication truth are not inferred from these offline results.
