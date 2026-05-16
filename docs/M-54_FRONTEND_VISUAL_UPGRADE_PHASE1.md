# M-54 Frontend Visual Upgrade Phase 1

M-54 is a frontend-only visual polish milestone. It addresses the first four findings from the M-54+ UI diagnostic report and deliberately defers the `#detail-data` IA restructure to M-55.

## Scope

- Fix cross-validation evidence color semantics.
- Add visual emoji prefixes for the seven cross-validation risk narratives.
- Reorder structured evidence lists into a symmetric narrative flow.
- Add typography type-scale CSS variables for future migration.

M-54 does not change data acquisition, scoring, decision, execution, position logic, backend pipelines, workflows, or any `data/*.json` file.

## Evidence Color Semantics

All seven cross-validation narratives are risk narratives. Supporting evidence means the risk narrative is more credible, while contradicting evidence lowers that narrative's credibility.

| Evidence group | Meaning | M-54 color |
|---|---|---|
| supporting | supports risk narrative / risk up | `--risk-red` |
| contradicting | contradicts risk narrative / risk down | `--risk-green` |
| missing | unavailable / neutral | `--paper-muted` |

This fixes the pre-M-54 cognitive conflict where supporting evidence appeared green while accumulated supporting evidence could produce a red strong-confirmation card.

## Narrative Emoji Mapping

| Narrative ID | Emoji | Theme |
|---|---|---|
| `energy_shock` | ⚡ | Energy / electricity |
| `stagflation_pressure` | ⚖️ | Balance / scales |
| `risk_asset_mismatch` | 📉 | Declining chart |
| `overheat_confirmation` | 🔥 | Fire / heat |
| `credit_spread_warning` | 💰 | Money / credit |
| `liquidity_tightening` | 💧 | Water / liquidity |
| `world_order_pressure_crossing` | 🌐 | Globe / geopolitics |

The mapping is applied only at render time in `appendEditorialValidationCard`. Narrative IDs, labels, evidence IDs, and cross-validation builder logic remain unchanged.

## Evidence Order

M-54 renders structured evidence in this order:

1. 支持证据
2. 矛盾证据
3. 缺失证据

The order creates a clearer risk-up / risk-down / neutral reading path. It does not change evidence generation, assessment, confidence, or interpretation logic.

## Typography Scale

M-54 adds these CSS variables to `:root`:

| Token | Value |
|---|---|
| `--font-size-xs` | `11px` |
| `--font-size-sm` | `13px` |
| `--font-size-base` | `15px` |
| `--font-size-md` | `17px` |
| `--font-size-lg` | `20px` |
| `--font-size-xl` | `24px` |
| `--font-size-2xl` | `28px` |
| `--font-size-3xl` | `32px` |

Existing hardcoded font sizes are intentionally not refactored in M-54 to reduce visual regression risk. Future visual phases can migrate component styles to these tokens incrementally.

## Validation

M-54 adds `npm run check:frontend-visual-m54`, which verifies:

- supporting evidence uses `--risk-red`
- contradicting evidence uses `--risk-green`
- typography scale variables exist
- all seven narrative emoji mappings exist
- structured evidence order is supporting → contradicting → missing

`npm run check:all` increases from 59 to 60 items.
