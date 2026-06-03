// check:oil-directional-score — PR3 model-output validity for data/oil-directional-pressure.json.
//
// Semantic gate for the productionized classifier (structural field/type checks live in
// check:oil-directional-contract). Asserts:
//   - finalBias is a known enum (FINAL_BIAS_VALUES, single source of truth in the classifier),
//   - interpretation mirrors finalBias,
//   - divergence consistency: a false_* finalBias <=> the matching divergence verdict;
//     divergence 'none' => finalBias == physicalBias (insufficient_data excepted),
//   - drivers are known signal groups,
//   - a price-divergence verdict requires a numeric price direction in signals.priceContext.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FINAL_BIAS_VALUES } from './oil-directional/odp-classifier.mjs';

const errors = [];
const fail = (m) => errors.push(m);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));

const SIGNAL_GROUPS = new Set([
  'inventoryDrawPressure', 'dieselProductStress', 'refineryConfirmation',
  'sprBufferEffectiveness', 'demandDestructionRisk', 'futuresCurveConfirmation',
]);
const DIVERGENCE_VALUES = new Set(['none', 'false_down_physical_stress', 'false_up_unconfirmed']);
const CONFIDENCE_VALUES = new Set(['low', 'moderate', 'high']);

if (!(data.finalBias === null || FINAL_BIAS_VALUES.includes(data.finalBias))) {
  fail(`finalBias must be null or one of [${FINAL_BIAS_VALUES.join(', ')}], got: ${data.finalBias}`);
}

if (data.finalBias !== null) {
  const it = data.interpretation;
  if (!it || typeof it !== 'object') {
    fail('finalBias is populated but interpretation is missing/invalid');
  } else {
    if (it.finalBias !== data.finalBias) fail(`interpretation.finalBias '${it.finalBias}' != top-level finalBias '${data.finalBias}'`);
    if (!FINAL_BIAS_VALUES.includes(it.physicalBias)) fail(`interpretation.physicalBias invalid: ${it.physicalBias}`);
    if (!DIVERGENCE_VALUES.has(it.divergence)) fail(`interpretation.divergence invalid: ${it.divergence}`);
    if (!CONFIDENCE_VALUES.has(it.confidence)) fail(`interpretation.confidence invalid: ${it.confidence}`);

    // consistency: a divergence verdict must equal finalBias; otherwise finalBias == physicalBias.
    if (it.divergence !== 'none') {
      if (data.finalBias !== it.divergence) fail(`divergence '${it.divergence}' but finalBias '${data.finalBias}' (must match the divergence verdict)`);
    } else if (data.finalBias !== 'insufficient_data' && data.finalBias !== it.physicalBias) {
      fail(`divergence 'none' but finalBias '${data.finalBias}' != physicalBias '${it.physicalBias}'`);
    }

    if (Array.isArray(it.drivers)) {
      for (const d of it.drivers) if (!SIGNAL_GROUPS.has(d)) fail(`interpretation.drivers has unknown signal group: ${d}`);
    } else {
      fail('interpretation.drivers must be an array');
    }
  }

  // price-divergence verdicts require a usable (numeric) price direction.
  if (data.finalBias === 'false_down_physical_stress' || data.finalBias === 'false_up_unconfirmed') {
    const pc = data.signals && data.signals.priceContext;
    if (!pc || !Number.isFinite(pc.brentChangePct4w)) {
      fail(`${data.finalBias} requires a numeric signals.priceContext.brentChangePct4w`);
    }
  }
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure score check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure score check: PASS (finalBias='${data.finalBias}', divergence/enum consistent)`);
