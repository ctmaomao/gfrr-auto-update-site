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
import {
  FINAL_BIAS_VALUES,
  GLOBAL_OVERLAY_EFFECT_VALUES,
  GLOBAL_OVERLAY_STATUS_VALUES,
  finalizeBias,
} from './oil-directional/odp-classifier.mjs';

const errors = [];
const fail = (m) => errors.push(m);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));

const SIGNAL_GROUPS = new Set([
  'inventoryDrawPressure', 'dieselProductStress', 'refineryConfirmation',
  'sprBufferEffectiveness', 'demandDestructionRisk', 'futuresCurveConfirmation',
]);
const DIVERGENCE_VALUES = new Set(['none', 'false_down_physical_stress', 'false_up_unconfirmed']);
const CONFIDENCE_VALUES = new Set(['low', 'moderate', 'high']);
const DATA_SUFFICIENCY_VALUES = new Set(['full', 'partial', 'insufficient']);

// finalBias is ALWAYS populated by the PR3 build (>= 'insufficient_data'); null = regression.
if (!FINAL_BIAS_VALUES.includes(data.finalBias)) {
  fail(`finalBias must be a non-null known enum [${FINAL_BIAS_VALUES.join(', ')}], got: ${data.finalBias}`);
}

// signals is null IFF the verdict is insufficient_data (no verdict from nothing; no nulls with a verdict).
if ((data.finalBias === 'insufficient_data') !== (data.signals === null)) {
  fail(`signals must be null iff finalBias is 'insufficient_data' (finalBias='${data.finalBias}', signals ${data.signals === null ? 'null' : 'present'})`);
}

const it = data.interpretation;
if (!it || typeof it !== 'object' || Array.isArray(it)) {
  fail('interpretation must be a non-null object');
} else {
  if (it.finalBias !== data.finalBias) fail(`interpretation.finalBias '${it.finalBias}' != top-level finalBias '${data.finalBias}'`);
  if (!FINAL_BIAS_VALUES.includes(it.physicalBias)) fail(`interpretation.physicalBias invalid: ${it.physicalBias}`);
  if (!DIVERGENCE_VALUES.has(it.divergence)) fail(`interpretation.divergence invalid: ${it.divergence}`);
  if (!CONFIDENCE_VALUES.has(it.confidence)) fail(`interpretation.confidence invalid: ${it.confidence}`);
  if (!DATA_SUFFICIENCY_VALUES.has(it.dataSufficiency)) fail(`interpretation.dataSufficiency invalid/missing: ${it.dataSufficiency}`);
  // structured "数据不足 -> 暂不判断": dataSufficiency 'insufficient' IFF finalBias 'insufficient_data'.
  if ((data.finalBias === 'insufficient_data') !== (it.dataSufficiency === 'insufficient')) {
    fail(`dataSufficiency '${it.dataSufficiency}' inconsistent with finalBias '${data.finalBias}' (insufficient <=> insufficient_data)`);
  }

  // a divergence verdict must equal finalBias; otherwise finalBias == physicalBias (insufficient excepted).
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
  const go = it.globalOverlay;
  if (go !== undefined && go !== null) {
    if (typeof go !== 'object' || Array.isArray(go)) {
      fail('interpretation.globalOverlay must be an object|null when present');
    } else {
      if (!GLOBAL_OVERLAY_STATUS_VALUES.includes(go.status)) fail(`interpretation.globalOverlay.status invalid: ${go.status}`);
      if (!GLOBAL_OVERLAY_EFFECT_VALUES.includes(go.effect)) fail(`interpretation.globalOverlay.effect invalid: ${go.effect}`);
      if (go.status === 'not_evaluated' && data.finalBias !== 'insufficient_data') {
        fail(`globalOverlay status not_evaluated is only valid with insufficient_data, got finalBias '${data.finalBias}'`);
      }
      if (go.effect === 'confirms_false_down' && data.finalBias !== 'false_down_physical_stress') {
        fail(`globalOverlay confirms_false_down requires false_down_physical_stress, got '${data.finalBias}'`);
      }
      if (!['flat', 'up', 'up_with_demand_cap', 'down'].includes(go.confidenceAdjustment)) {
        fail(`globalOverlay confidenceAdjustment invalid: ${go.confidenceAdjustment}`);
      }
      if (!CONFIDENCE_VALUES.has(go.confidence)) fail(`globalOverlay confidence invalid: ${go.confidence}`);
    }
  }

  // AUTHORITATIVE consistency: replay the LOCKED finalizeBias() over the stored physical
  // signals + price context and require it to reproduce finalBias. Catches any impossible
  // state (e.g. a false_down verdict whose stored priceContext is actually price-up / contango).
  if (data.finalBias !== 'insufficient_data' && data.signals && typeof data.signals === 'object') {
    const pc = data.signals.priceContext || {};
    const replay = finalizeBias(
      { bias: it.physicalBias, signals: data.signals },
      { changePct4w: Number.isFinite(pc.brentChangePct4w) ? pc.brentChangePct4w : null, curveSlopeRegime: pc.curveSlopeRegime || null },
    );
    if (replay.finalBias !== data.finalBias) {
      fail(`finalBias '${data.finalBias}' != finalizeBias() replay '${replay.finalBias}' — inconsistent with the locked reconciliation (price/curve/physical do not support this verdict)`);
    }
  }
}

// price-divergence verdicts require a usable (numeric) price direction.
if (data.finalBias === 'false_down_physical_stress' || data.finalBias === 'false_up_unconfirmed') {
  const pc = data.signals && data.signals.priceContext;
  if (!pc || !Number.isFinite(pc.brentChangePct4w)) {
    fail(`${data.finalBias} requires a numeric signals.priceContext.brentChangePct4w`);
  }
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure score check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure score check: PASS (finalBias='${data.finalBias}', divergence/enum consistent)`);
