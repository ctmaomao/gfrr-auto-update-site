# ADR-0118 — Missing divergence evidence is not zero

- Date: 2026-11-17
- Scope: audit/display-only divergence input semantics and regression expectations.

Reject missing, blank, boolean, container and nonfinite numeric inputs locally.
Keep genuine zero, numeric strings, thresholds and the finite score=0 plus
insufficient_data schema. Missing VIX/HY cannot confirm calm pricing; incomplete
credit evidence without observed stress cannot establish absence of expansion.
No main scoring, production snapshot, collection or frontend changes.

The pre-extraction aggregate golden included the erroneous null-to-zero result.
Retain all four fixtures and pin each output's bytes/hash separately. Fixtures
0/1/3 are byte-identical to base 7ec60ead; fixture 2 intentionally changes from
5176 to 3090 bytes, with explicit insufficient state and empty-evidence assertions.
This reviewed expectation change does not remove a fixture, skip or loosen a gate.
Run both measured unit coverage and the full suite: check:all alone does not run
all unit fixtures. Independent review and exact-head CI remain required.
