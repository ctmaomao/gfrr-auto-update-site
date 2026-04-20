# Global Financial Risk Radar — Cursor Execution Rules

This repository must follow strict release discipline.

## Hard constraints
1. Only full-package upgrades are allowed.
2. No partial patching.
3. No line-based edits for the user.
4. No diff-only delivery.
5. No manual conflict resolution workflow for the user.
6. scripts/app.js is a high-risk core file.
7. If scripts/app.js is changed, the final package must pass:
   node --check scripts/app.js
8. Never rewrite this project into a demo or simplified site.
9. Preserve the full project structure and all existing major modules.
10. Do not remove:
   - realtime
   - health
   - decision
   - action queue
   - trigger monitor
   - invalidation rules
   - heatmap
   - six risk modules
11. Do not change data structure unless explicitly requested.
12. Prefer Chinese for user-facing copy, but do not do mass language cleanup unless explicitly requested.
13. Work from the current repository files only. Do not invent a replacement project.

## Delivery format
- Always modify the real repository in place.
- Final output must remain a complete runnable package.
- When task is complete, summarize:
  - files changed
  - what was preserved
  - validation result

## Default workflow
1. Read the real files first.
2. Produce a short plan.
3. Make only the requested change.
4. Run validation.
5. Stop.