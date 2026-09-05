# Transport free-proxy reviewed evidence handoff

This is reviewed audit metadata, not production data, a synthetic fixture, or a
model backtest. The owner authorized this narrow handoff on 2026-09-05 after
local and scheduled reviews disagreed solely because ignored archives do not
exist in a clean checkout.

## Input and boundary

The only tracked input is `free-proxy-real-event-review-manifest.json` here.
It projects six existing operator-intake reviews: three disruption cases and
three zero controls. Original archives and source materials remain ignored
under `manual-artifacts/transport-shock-confirmation-factor/`.

The projection retains sample IDs, event windows, manual candidate contribution,
compact source enums/domain hints/citation hashes, and each review's byte-level
SHA-256. It drops original paths, confirmations prose, citations, URLs, titles
and raw source data. Hashes allow an operator with the original archives to
reconcile the handoff; the cloud does **not** have or independently revalidate
those originals. This handoff grants no new source or redistribution rights.

`contributionBasis=manual_review_not_model_backtest` is mandatory. The nominal
zero-control and directional-hit rates describe manually annotated candidate
contributions, not measured out-of-sample model performance. Three cases in
each class are a small curated sample, not evidence of predictive reliability.
All production, scoring and frontend approvals remain false, route/market
confirmation stays `not_connected`, and `historicalBacktestPerformed=false`.

## Workflow

1. Review original local intake artifacts with the existing P30 local mode.
2. Project only validated reviews with `createEvidenceManifest` in
   `scripts/lib/free-proxy-evidence-manifest.mjs`, then review the diff before a
   separate explicit commit. The helper has no file writer or network access.
3. Reconcile each projected row and byte hash against the original. Run the
   manifest unit checks, P30/P31/P32 checks and the full repository suite.
4. P33 reads the one tracked manifest explicitly, recomputes sample targets and
   writes only ignored review/monitor artifacts. It never reads local originals,
   fetches sources, uses secrets, commits, triggers Daily or changes scoring.

```powershell
npm run review:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples -- --manifest docs/evidence/transport-shock/free-proxy-real-event-review-manifest.json --min-samples 6 --min-known-disruption-samples 3 --min-zero-control-samples 3 --strict
npm run monitor:transport-shock-confirmation-factor-free-proxy-score-readiness-gate
```

Manifest mode cannot be combined with local input options or `--allow-empty`.
Missing manifests, malformed or extra fields, duplicate sample IDs/hashes,
invalid dates, raw URLs and approval claims are rejected. Ordinary local empty
reviews retain full no-approval boundaries and null unavailable rates; missing
samples are not described as claimed approvals or connected confirmations.

Passing this gate only requests a separate reviewed design decision. It does
not expand the existing capped runtime path or unlock the higher-confidence
transport path, source rights, licensed freight evidence or production writes.
