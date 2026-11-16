# ADR-0116 — Reject dangling links in manual artifact paths

- Date: 2026-11-17
- Scope: shared manual JSON output path guard; no collector or production writer change.

The guard previously used `existsSync` before `lstatSync`. Because existence checks
follow the target, a dangling file or directory link could pass the guard. A later
write could then create a file outside the intended manual-artifact directory.

Inspect each segment directly with `lstatSync` and `throwIfNoEntry: false`. Missing
ordinary segments remain allowed for subsequent directory creation, but existing
links are rejected regardless of their target's existence. Keep prefix, extension,
existing-link and no-write behavior. Do not change boolean contract helpers.

Real temporary-filesystem tests cover missing/existing file and directory targets,
ordinary new/existing paths and narrow prefixes; dangling-link cases fail before
the fix. Require full checks and independent review. This does not make the later
write atomic or protect against a hostile concurrent path replacement after the
check; no such stronger guarantee is claimed. Reverse this isolated patch to roll
back; no production data migration is involved.
