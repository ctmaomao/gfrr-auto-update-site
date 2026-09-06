# ADR-0025: Proportionate local validation with conservative routing

## Status

Owner authorized refinement/adoption on 2026-09-06. Implemented locally; independent governance review before merge remains required. This supersedes only the universal local full-check requirement for ordinary prose in AGENTS §§5–6; ADR-0024's assertion-preserving migration remains unchanged.

## Decision

Use `npm run check:changed` for local verification. It inspects the whole working tree against HEAD, including staged, unstaged and unignored untracked files; it never mutates Git. No explicit file-subset option can hide mixed changes. `-- --plan` is diagnostic only.

Ordinary Markdown can use `check:docs` plus whitespace/link/anchor validation. Non-Markdown, deleted files, governance/ADR/contract paths, documents referenced by code/configuration, command examples and detected normative language use `check:all`. These conservative heuristics do not certify meaning: a behavioral, authorization or contract change missed by the classifier still requires full verification. Review may always select more checks.

Documentation coverage includes root CLAUDE/DESIGN, recursive tracked/unignored Markdown, inline links, reference links, images, explicit ids, heading anchors and unchanged inbound links to changed targets. Fenced/inline code examples are not interpreted as navigation. Every detected local link/anchor defect fails, including on clean committed CI checkouts; there is no ignored historical debt. Existing `check-doc-links.mjs` assertions remain in force. This small parser handles the repository's Markdown conventions, not every CommonMark extension or remote website anchor.

The production CI/Pages entry remains `check:all`. No runtime assertion, source-rights check, financial threshold, cost approval, provider-call limit, human Git rule or merge review is removed. The full suite retains its documented ignored manual-artifact write; light checks read files only.

## Scope of increased discretion

Agents may now finish ordinary local prose edits without running the unrelated production suite. This is a validation-depth exception, not permission to deploy, commit, call providers or change approval rules. Automatic selection is assistance, not evidence that an unreviewed policy change is harmless.

## Official rationale

OpenAI recommends concise, practical agent instructions and verification proportional to actual risk. GPT-6 Astra's guidance specifically identifies excessive testing and sensitivity to skill instructions as areas to tune. The project retains domain safeguards while reducing universal process requirements. See [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model) and [Codex best practices](https://learn.chatgpt.com/guides/best-practices).

## Validation

Unit tests cover light/full classification, mixed edits, deletion, commands and approval language, recursive/root documents, references, images, encoded anchors and broken inbound links. The current implementation/checker changes require the full suite; results are recorded in [the phase-three receipt](../REVIEW_2026-09-06_INSTRUCTIONS_PHASE3.md).
