# ADR-0036: Final editorial write revalidation

- Status: Owner-authorized audit remediation; independent merge review retained.
- Date: 2026-09-09.
- Scope: Audit step 3, separate from presentation and runtime upgrades.

## Decision

The Macro Risk writer requires the original compact input via `--source-input`. It recomputes the input/output SHA-256 digests, reruns the existing full output validator and quality review, and compares the compact production ledger and review against a fresh projection. Missing input, fixture input, content or ledger changes, unsafe wording, unsupported discovery-only claims and failed review remain fail closed. This reuses original evidence; it never invents source IDs or reconstructs lost news facts from production metadata.

Read-only production validation additionally verifies output digest agreement, model/source metadata, cited ledger IDs and both projection/output freshness. Both clocks keep the 30-hour maximum and existing shared 5-minute future-clock tolerance. The workflow records the actual checked-out `git rev-parse HEAD`, not the event's potentially older SHA.

The existing single-field writer and schema stay unchanged. No provider retry, paid refresh, new evidence source, manual-artifact promotion, production-data edit or scoring change is authorized by these checks.

## Network reliability

The fixed GitHub Worker mirror gets a 4-second deadline covering fetch and response body, returning the existing heartbeat status on failure. API secret diagnostics retain their two manual endpoints with 5-second connect, 20-second total and 1 MiB response limits. Diagnostic JSON passes through stdin to a bounded status/count-only parser; raw bodies and parser excerpts are not logged. Worker deployment and diagnostic workflow dispatch are separate operations and are not performed in this remediation.

## Verification

Add negative writer cases with recomputed attacker-controlled output digests, original-input mismatch, ledger/review changes and stale/future clocks. Verify pending requests and bodies, HTTP/JSON errors, sentinel-secret redaction and CLI stdin failures offline. Existing workflow, provider, cost, source-quality and non-scoring assertions remain intact; only required input/SHA wiring assertions are added.
