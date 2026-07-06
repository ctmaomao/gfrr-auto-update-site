# GDELT Web NGrams Fallback Gate Review

Contract version: `gdelt-web-ngrams-fallback-gate-review-p49`

Status: `sample_gate_passed_ready_for_display_only_fallback_projection_no_production_write`

## Purpose

P49 is the formal review of the P46 Web NGrams sample gate. It reviews the
artifact-only sample set collected by the `GDELT Web NGrams Sample Collector`
and decides whether the sample evidence is sufficient for the next reviewed
display-only fallback projection.

This review only answers the sample-gate question. It does not approve a
production writer, frontend rendering, current Oil News signal enhancement, or
any scoring use.

## Reviewed Evidence

The reviewed artifact snapshot came from collector run `28743580007`.

The sample review artifact reported:

- sample count: `10`
- usable sample count: `9`
- live-hit sample count: `9`
- selected timestamp count: `9`
- first selected timestamp: `20260704094600`
- latest selected timestamp: `20260705140200`
- observation window: `28.27` hours
- blockers: `0`
- raw exposure markers: absent

The review still carried one warning because one restored sample was
`source_unavailable`. That warning is not a blocker for this gate because the
threshold is based on usable samples, selected timestamps, observation window,
bucket coverage, and raw-exposure absence.

## Gate Decision

The P46 sample gate is passed for display-only fallback projection review:

- at least 8 usable samples: passed
- at least 24 hours of observation: passed
- at least 2 selected timestamps: passed
- no blockers: passed
- no raw title, URL, body, raw row, or raw provider response exposure: passed
- required bucket coverage: passed

Bucket coverage includes `chokepoint`, `tanker_shipping`, and
`market_reaction`, plus `sanctions` and `supply_disruption`.

## Explicit Non-Approvals

P49 keeps these approvals false:

```text
productionWriteApproved=false
frontendApproved=false
workflowApproved=false
currentSignalEnhancementApproved=false
scoreApproved=false
```

It also keeps `sourceCaches.gdeltWebNgramsFallback` absent from production data.
Any later production field, workflow writer, or frontend copy must be a separate
reviewed change.

## Next Allowed Step

The next allowed step is a display-only fallback projection dry run. That step
may define the exact compact aggregate object that could later be written under
`sourceCaches.gdeltWebNgramsFallback`, but it must still keep production writes,
frontend rendering, current Oil News signal enhancement, and scoring disabled
unless another reviewed gate explicitly changes those approvals.
