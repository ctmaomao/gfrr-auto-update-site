import { isDeepStrictEqual } from 'node:util';
import { buildMarketCompletionRange } from './market-completion-range.mjs';
import { clampScore, DIMENSION_KEYS } from './normalize-world-order-inputs.mjs';
import { normalizeWorldOrderStressHistorySnapshot } from '../daily/world-order-history.mjs';
import { timestampAgeMinutes, isFutureTimestampAge } from '../health/timestamp-policy.mjs';

export const PREPARED_V2_FORMULA = 'world-order-v1-conditional-market-range-v1';
const MODULE_WEIGHTS = { geopolitical: .28, energy: .20, inflation: .14, liquidity: .16, debt: .12, banking: .10 };
const DIMENSION_WEIGHTS = { peaceDividendRetreat: .16, blocFormation: .20, multiTheaterConflict: .24, economicWeaponization: .22, capitalControlRisk: .18 };
const validScore = value => Number.isFinite(value) && value >= 0 && value <= 100;
function fixedComponent(score, snapshot, sourcePath, modelVersion, referenceMs) {
  const age = timestampAgeMinutes(snapshot?.data?.updatedAt, referenceMs);
  if (!validScore(score) || age === null || isFutureTimestampAge(age)
    || typeof modelVersion !== 'string' || !modelVersion.trim()
    || !/^[a-f0-9]{64}$/.test(snapshot?.sha256 ?? '')) throw new Error('prepared_v2_fixed_component_invalid');
  return { score, sourcePath, snapshotSha256: snapshot.sha256, asOf: snapshot.data.updatedAt, modelVersion, qualification: 'fixed_assumption_not_revalidated' };
}

// Context must be assembled from fixed local baseline files by the caller, not
// from claimed provenance in the candidate. No source or freshness certification.
export function buildPreparedWorldOrderV2(context, updatedAt, { nowMs = Date.now() } = {}) {
  const age = timestampAgeMinutes(updatedAt, nowMs);
  if (age === null || isFutureTimestampAge(age)) throw new Error('prepared_v2_clock_invalid');
  const { world, radar, rules } = context || {};
  const weights = rules?.scoreWeights;
  if (!weights || weights.externalStructural !== .6 || weights.marketConfirmation !== .3 || weights.existingRiskModules !== .1
    || !DIMENSION_KEYS.every(key => rules?.dimensionWeights?.[key] === DIMENSION_WEIGHTS[key])) throw new Error('prepared_v2_formula_changed');
  if (!DIMENSION_KEYS.every(key => validScore(world?.data?.dimensions?.[key]?.score))
    || !Object.keys(MODULE_WEIGHTS).every(key => validScore(radar?.data?.modules?.[key]))) throw new Error('prepared_v2_baseline_scores_invalid');
  const external = clampScore(DIMENSION_KEYS.reduce((sum, key) => sum + world.data.dimensions[key].score * DIMENSION_WEIGHTS[key], 0));
  const modules = clampScore(Object.entries(MODULE_WEIGHTS).reduce((sum, [key, weight]) => sum + radar.data.modules[key] * weight, 0));
  const referenceMs = Date.parse(updatedAt);
  const fixedComponents = {
    externalStructural: fixedComponent(external, world, 'data/world-order-stress.json', world.data.scoringModel?.version, referenceMs),
    existingRiskModules: fixedComponent(modules, radar, 'data/radar-data.json', radar.data.version, referenceMs)
  };
  // All unknown is deliberate. Nonempty evidenceRef strings are not qualification.
  const marketCompletion = buildMarketCompletionRange();
  const total = market => clampScore(external * .6 + market * .3 + modules * .1);
  const candidate = {
    contractVersion: 'world-order-stress-v2',
    lifecycle: 'prepared_not_activated',
    productionEligible: false,
    formulaVersion: PREPARED_V2_FORMULA,
    updatedAt,
    status: 'incomplete', state: 'incomplete', labelZh: '证据不足，暂不分档',
    score: null, confidence: null, freshness: 'unverified',
    scoreRange: { lower: total(marketCompletion.scoreRange.lower), upper: total(marketCompletion.scoreRange.upper), kind: 'conditional_v1_formula_outer_bound' },
    uncertaintyScope: 'market_qualification_only_other_model_components_fixed_not_revalidated',
    missingReasons: ['market_observations_not_qualified', 'dollar_series_calibration_missing'],
    fixedComponents,
    marketCompletion
  };
  normalizeWorldOrderStressHistorySnapshot(candidate, { allowV2: true, nowMs });
  return candidate;
}

export function validatePreparedWorldOrderV2(candidate, context, options) {
  const expected = buildPreparedWorldOrderV2(context, candidate?.updatedAt, options);
  if (!isDeepStrictEqual(candidate, expected)) throw new Error('prepared_v2_candidate_mismatch');
  return true;
}

export function assertWorldOrderProductionVersion(payload) {
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'contractVersion')) {
    throw new Error('world_order_version_not_activated');
  }
}
