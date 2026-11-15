# ADR-0099: Shared editorial excerpt hygiene and syndicated-release handling

## Status

Local implementation under the owner's ongoing accuracy-review authorization; independent exact-tree review and coordinator-controlled serial publication remain required. No provider/search/account call, budget change or production regeneration is authorized by this record. The existing Bubble article correction is a separate workstream.

## Context

Search snippets can contain related-content headings, account/navigation menus, video introductions followed by other video titles, or syndicated company releases hosted by multiple publishers. Domain reputation, publication date and title similarity do not make such text article evidence or independent corroboration. Bubble had a bounded hygiene filter; Macro did not share it. Both Brave collectors concatenated supplemental fragments without establishing their relationship to the article.

## Decision

- Use the pure shared `scripts/lib/editorial-news-hygiene.mjs` helper at normalization, clustering, readiness and compact projection. Bubble's existing helper export remains compatible. Reject entire ambiguous excerpts rather than guessing a cleaned article or fetching a body.
- Retain existing subscription, navigation and newsletter-agenda checks. Add explicit related-content headings, combined navigation/account markers and video-page introduction/listing shapes. A generic script title or programme name alone is not a rejection; coherent attributed analysis remains usable under the original publisher/date/length rules.
- Known wire-distribution hosts/paths and the existing FT announcements endpoint identify distributed releases, not independent reporting by their hosting publishers. These rows remain discovery-only and cannot donate corroborating domains, official status or provider excerpts. Issuer-owned official releases retain their existing primary-source path; merely mentioning a wire service in prose is not a rejection.
- Collapse identical substantial normalized excerpts when counting supporting domains. The 80-character identity check uses the existing media-excerpt length boundary; short generic phrases are not sufficient to infer common authorship. Distinct text is not proof of independent sourcing, and the existing cross-checked label remains a bounded discovery classification, not factual verification.
- Keep Brave request count, parameters, limits and budget reservations unchanged; use its primary description without concatenating unrelated supplemental snippets.
- Add input-validator assertions rejecting contaminated snippets and credible labels without eligible excerpts. Do not remove or relax previous assertions. Bubble's explicit historical metadata-only validation remains separate; historical artifacts are not rewritten. Macro's original input and output review paths remain required.
- Programme names, article titles and publication dates cannot supply measured economic observations or event dates. Preserve existing numeric, quotation, financial, scoring, freshness, cost and writer gates.

## Consequences and verification

The filter is conservative and can reduce available evidence or hold a generation. It does not semantically verify every excerpt or establish the truth of article claims. No source allowlist is expanded, missing facts/dates are never supplied, and no search retry is introduced.

Use synthetic benign fixtures for marker shapes, substantive positive controls, duplicated/syndicated negatives, forged metadata, both pipelines and mocked collectors. Existing synthetic corroboration examples now use separately worded excerpts; missing-excerpt domain fixtures gain explicit synthetic context rather than weakening runtime checks. Private retained-run replay reports only source IDs, fixed reasons, hashes and invariant results, never rejected source prose. Full repository gates, unit coverage and independent review are mandatory before integration.
