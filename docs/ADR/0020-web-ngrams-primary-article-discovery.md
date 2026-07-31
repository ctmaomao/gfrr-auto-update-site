# ADR-0020: Web NGrams as the primary Oil News article-discovery candidate

- Status: Accepted
- Date: 2026-07-31

## Context

The Oil News Event Watch currently uses GDELT DOC as a slow broad-query source
and Tavily / Brave as independent live sources. GDELT DOC is rate-limited and
can remain in a classified cooldown even while the downloadable GDELT Web
NGrams files are available.

The existing Web NGrams production integration stores aggregate source health
only. It intentionally does not read the paired TOC file and therefore cannot
produce article-level evidence, run the existing claim classifier, or replace
the DOC article-discovery role.

GDELT's 2026 v5 legacy publication provides a timestamp-matched
`ngrams.txt.gz` + `toc.json.gz` pair. The NGRAMS file maps quadgrams to a
per-file `DOCID`; the TOC maps that `DOCID` to article date, language, title,
and URL. GDELT describes this v5 publication as temporary while its search
infrastructure migrates.

## Decision

1. Introduce a replaceable Web NGrams article-discovery adapter inside the
   existing GitHub Actions backup/validation layer.
2. Treat a timestamp as usable only when both NGRAMS and TOC files are
   available. Probe and fetch them serially through the shared GDELT wrapper.
3. Keep raw NGRAMS rows, TOC rows, titles, URLs, snippets, and provider
   responses transient. Production artifacts may contain only the existing
   sanitized article/aggregate contract.
4. Normalize future v5 and Web NGrams 3.0 implementations behind one compact
   article-candidate boundary so the temporary v5 layout is not embedded in
   Oil News business logic.
5. Web NGrams may become the primary article-discovery source only after
   article joining, multilingual classification, deduplication, independent
   Tavily/Brave confirmation, and a reviewed shadow-quality gate are complete.
6. Until that gate passes, `usedForCurrentSignal=false` and
   `eligibleForScoring=false` remain mandatory.
7. Replacing DOC discovery does not authorize Oil News to affect ODP
   `finalBias`, values, scoring, decision, execution, position, Brent
   promotion, Global Risk Heatmap, or cross-validation.

## Consequences

- DOC API pressure can be removed from the normal Oil News discovery path after
  evidence-backed promotion.
- A missing half of a timestamp pair fails closed instead of producing partial
  article evidence.
- Tavily and Brave remain independent confirmation/fallback sources.
- The v5 adapter can later be replaced by Web NGrams 3.0 + Article List or a
  future GDELT search backend without changing the Oil News evidence contract.
- Promotion cannot be completed by code changes alone; it requires accumulated
  shadow observations and a reviewed quality decision.
