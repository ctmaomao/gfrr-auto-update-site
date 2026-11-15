# Bubble budget-first integration verification

## Scope and baseline

Based on main 719792ea7d517b03614ec90c59cfa6796dc47602 after budget PR #508 and Macro PR #507. Only the final Bubble delta from 37e4a3cb to 64fe6d9b was transplanted. The shared paid-provider request function remains identical to main; CEO paid Wind fallback remains retired. Macro OFR numeric validation, data, realtime, config, workflows and budget libraries have no changes. Cache version: bubble-budget-reliability-20261108.

## Final-source validation

- check:changed executed full check:all: exit 0.
- test:unit:coverage: exit 0; 1,594 pass, one existing conditional skip, zero failures. Lines 99.86%, branches 93.23%, functions 97.96%; thresholds unchanged.
- Standard test:e2e: exit 0; 98/98 first-run pass, 4.6 minutes, no rerun or timeout/assertion changes.
- Focused reliability/history/score/budget-wiring: 34/34; DeepSeek budget 54/54; free-search budget and complete Bubble suite pass.
- app syntax and diff whitespace pass. Changed-file lint exits 1 on 60 pre-existing errors; comparison with main finds zero added errors (and two removed unused bindings). See [comparison](lint-baseline-comparison.json). No lint rules were weakened.
- Independent AI review: no P1/P2; 26 independent reliability/history/followup regressions pass. This is AI review, not a human GitHub approval.

Raw local logs remain in manual-artifacts/bubble-budget-integration, with [SHA-256 digests](log-digests.json). These are offline checks; no real provider/search call, ledger initialization, production data write or deployment occurred.

## Actual installed Chrome visual acceptance

Chrome 156.0.8078.81, isolated headless Chrome channel, 1440x1000 and 390x1000 viewports. External requests blocked; synthetic qualified-builder data and a frozen fixture clock used. The original fixture article retains data date 2026-10-12 and its original 2026-10-13 generation time; this is not a new live article.

Seven states at both sizes pass: current, invalid current plus qualified history, tampered history, future history, missing history, restored history, restored current. Delayed digest checks and repeated overlapping loads cannot replace the newer current issue. All states retain 27 cards, unchanged current score, no horizontal overflow and no page JavaScript errors. History retains original headline, lead, score and dates; rejected current content does not replace the deterministic current Hero. Computed font/color samples and results are in [browser report](browser-report.json).

Before screenshots use unchanged main HTML with the same fixture; the baseline hides history. After screenshots show the original-date history in the existing article area. Screenshots were visually inspected.

- Before: [1440](before-baseline-1440.png), [390](before-baseline-390.png).
- Current: [1440](current-1440.png), [390](current-390.png).
- Original historical article: [1440](history-section-1440.png), [390](history-section-390.png).
- Deterministic fallback: [1440](no-history-1440.png), [390](no-history-390.png).

## Contract self-audit and limits

DESIGN section 4.4 applies the reviewed ADR-0089 exception. No new colors, fonts, page sections or scoring inputs. This PR applies the existing paper styles; the DESIGN section 4.4 change is explicitly documented. Existing current-only negative assertions remain intact, with only their optional-history fixture isolated; three independent companion cases exercise historical preservation. No checker assertion was removed or skipped, and no ignore-list entry was added.

Original candidates are preserved. Real generation remains held by the shared CNY 5 monthly budget and free-search account-evidence gates; unknown/over-limit/unresolved evidence stays fail-closed. Commit/push, exact-head CI, serial merge and two-site production static acceptance must be reported separately. Offline validation does not establish a successful live generation.
