# ADR-0102: Administrative release evidence and bounded public excerpts

- Status: Proposed; authorized implementation, independent review pending
- Date: 2026-11-10

## Context

A discovered official Employment Situation archive can contain only embargo, publication and contact metadata plus a report title. An official URL does not turn that material into an employment result. Truncation can also remove the only usable observation after a longer excerpt passed its initial gate.

## Decision

Use one shared cleaning and compacting helper for both editorial pipelines. Only exact HTTPS BLS Employment Situation archive paths without query, fragment or nondefault port receive source-specific administrative handling. Remove an anchored administrative prefix only through a complete report heading; retain the supplied body wording. Missing body observations fail closed. Short observations remain eligible without a new large length threshold. Existing navigation, mixed-story and independence checks remain intact. Recheck the actual 360-character collection/Bubble and 280-character Macro text after truncation; rejected excerpts become discovery-only with no snippet. Existing classification, date, source, cost and snapshot checks still apply. These deterministic patterns are not semantic verification.

Macro collection alone may supplement one already discovered `https://bls.gov/news.release/archives/empsit_MMDDYYYY.htm` or identical path on `www.bls.gov` when its excerpt is administrative/title-only. No other URL family, query, fragment, credentials or nondefault port is allowed. Retain the exact discovered host; do not infer or switch aliases. Select only one candidate, never fall through to another after failure. URL date and original publication civil date must agree, lie inside the requested window, and be no older than seven days.

Perform at most two unauthenticated GETs: that origin's robots.txt (64 KiB, five seconds), then that exact archive (512 KiB, eight seconds). Use the existing fixed product user agent, `credentials: omit` and `redirect: error`. Honor matching robots restrictions, including unsupported restrictions conservatively. Reject access denial, rate limits, redirects, wrong content types, oversized or invalid UTF-8 bodies and explicit noarchive/noai restrictions. Never retry, change user agent, follow host hints or bypass restrictions.

Accept only an explicit release preformatted block or bodytext container with an anchored embargo header. A quote-aware tokenizer requires balanced markup, at most 20,000 tokens and depth 128; inactive/hidden descendants invalidate their enclosing candidate. Attribute angle brackets and encoded restriction metadata hold closed. Inline text is concatenated without inserting spaces into decimal numbers; explicit block tags provide separators. Unsupported robots encoding, agent patterns, multiple wildcards or rules over 2,048 characters hold closed rather than bypass restrictions. Remove markup/navigation; do not summarize or create numeric facts. Require header release date to equal URL and original publication date. Interpret the header's actual Eastern release time, including DST; a future embargo holds closed. Observation month is not a publication date. Preserve URL, publication date and provider identity; the body read is not another independent source. Reapply all compact gates to extracted text.

Diagnostics contain only fixed status/reason enums, request flags/counts, and on success a body digest and release timestamp. Do not persist full HTML, raw errors, contact blocks or original private run excerpts. Dry-run collection makes no request. Existing search count and free-search/provider budget gates do not change.

## Verification and consequences

Offline synthetic fixtures cover genuine short results, ordinary media prose, title/header-only rejection, final truncation, both projections, date/embargo/DST checks, robots rules, denied/redirected/oversized/slow responses, explicit layouts, no retries and unchanged source identity. Retained-run replay is private and must show zero usable news without new evidence. All public-body success claims are mocked until separately established; inaccessible BLS may remain unavailable. No paid attempt, ledger, production data, scoring or historical metadata contract changes are authorized by this ADR. Full checks and independent immutable-patch review are required before integration.
