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

## Transport reviewer follow-up

The independent `review-transport-shock-path-boundaries.mjs` guard has the same
missing-target defect. Apply the same direct `lstat` rule to its two protected
roots and nested segments, retaining its existing loop/assertion structure.
Do not replace it with the shared JSON-only guard: this review CLI also permits
non-JSON output filenames. Tests execute the actual isolated guard with real
temporary links, covering both roots, nested/file links and ordinary `.txt` paths.
No other monitor, output authorization or report calculation changes.
