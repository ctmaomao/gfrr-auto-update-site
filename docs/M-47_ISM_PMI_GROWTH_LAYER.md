# M-47 ISM PMI Growth Layer

## STATUS: superseded by M-67 (2026-05-20). FRED:NAPM source was 404 from the start; M-67 replaces it with ISM official report HTML parser. Field names and semantics unchanged.

M-47 added the `macroDrivers.consumer` PMI fields and the display/cross-validation branches that consume them:

- `ismManufacturingPmi`
- `ismManufacturingPmi3mChange`
- `ismPmiRegime`
- conditional PMI evidence in `pressure-consumer`, `driver-growth`, `stagflation_pressure`, and later overheat confirmation narrative checks
- `check:consumer-pmi`

The M-47 implementation shape is retained, but the original data-source assumption was invalid. M-67 repairs the source path while keeping the same field names and audit-only/display-only contract.

## Current Boundary

`macroDrivers.consumer` remains audit-only / display-only. PMI does not enter `values.*`, scoring, `decisionModel`, `executionLock`, `positionGuidance`, Action Queue, Trigger Monitor, or Invalidation Rules.

## Current Source

See `docs/M-67_ISM_PMI_SOURCE_REPAIR.md` for the active source contract. The live source label is:

```text
FRED:UMCSENT; ISM:ManufacturingPMI
```

## Related Rungs

- M-41: `docs/M-41_FED_LIQUIDITY_EXTENDED_DRIVERS.md`
- M-42: `docs/M-42_FED_LIQUIDITY_RESERVE_BALANCES.md`
- M-43: `docs/EXTERNAL_AI_PROVENANCE_TRACKING_M43.md`
- M-46: `docs/M-46_SLOOS_BANK_LOAN_STANDARDS.md`
- M-67: `docs/M-67_ISM_PMI_SOURCE_REPAIR.md`
