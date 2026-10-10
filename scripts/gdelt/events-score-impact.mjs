import { scoreWorldOrderStress } from '../world-order/score-world-order-stress.mjs';
import { scoreGdeltPressure } from '../world-order/gdelt-score.mjs';
import { classifyWorldOrderState } from '../world-order/classify-world-order-state.mjs';
import { clampScore, DIMENSION_KEYS } from '../world-order/normalize-world-order-inputs.mjs';
import cloudCalibration from '../../config/gdelt-score-calibration.json' with { type: 'json' };
import { parseTimestamp } from './events-candidate.mjs';

export const IMPACT_DEFINITION = 'gdelt-events-conflict-channel-impact-research-v1';
const median = x => {
  const a = [...x].sort((u, v) => u - v), n = a.length;
  return n ? (a[Math.floor((n - 1) / 2)] + a[Math.floor(n / 2)]) / 2 : null;
};
export function violenceBounds(w) {
  if (w?.downloadedFiles !== 672 || w.conflictingIds !== 0 || w.ambiguousIds !== 0) return null;
  const lower = w.validSubsetCounts?.violence, unknown = w.quarantinedRows;
  if (!Number.isSafeInteger(lower) || lower < 0 || !Number.isSafeInteger(unknown) || unknown < 0) return null;
  if (!Number.isSafeInteger(lower + unknown)) return null;
  return { lower, upper: lower + unknown, unknownRows: unknown,
    strictQualification: w.statisticallyQualified === true };
}
// Interval fitting does NOT certify a point scale or change the strict research gate.
export function fitImpactBounds(windows) {
  if (windows.length !== 30) return null;
  const a = windows.map(violenceBounds);
  if (a.some(x => !x)) return null;
  const lower = median(a.map(x => x.lower)), upper = median(a.map(x => x.upper));
  return lower > 0 ? { lower, upper, pointScaleApproved: false } : null;
}
export function normalizedBounds(count, scale, factor = 1) {
  if (!count || !scale || !Number.isFinite(factor) || factor <= 0) return null;
  return { lower: 100 * count.lower / (count.lower + scale.upper * factor),
    upper: 100 * count.upper / (count.upper + scale.lower * factor) };
}
export function buildImpactContext({ sources, market, data, rules, published }) {
  // Historical Cloud comparison deliberately excludes the new runtime source.
  rules = { ...rules, gdeltEvents: { enabled: false } };
  const baseline = scoreWorldOrderStress({ externalSources: sources, marketConfirmation: market, dataPayload: data, rules });
  if (baseline.score !== published.score || baseline.state !== published.state
    || [...DIMENSION_KEYS, 'marketConfirmation'].some(k => baseline.dimensions[k].score !== published.dimensions?.[k]?.score)) {
    throw new Error('events_impact_baseline_parity');
  }
  const inputs = { externalSources: sources, marketConfirmation: market, dataPayload: data, rules };
  const oldGdeltScore = scoreGdeltPressure(sources.gdelt);
  // Inverse old normalization is a synthetic test harness, not a fabricated source.
  // It injects an INTEGER channel score through the unchanged production composer.
  const compose = desired => {
    const rounded = clampScore(desired);
    const pressure = rounded === 100 ? cloudCalibration.pressureScale * 1000
      : rounded === 0 ? 0 : cloudCalibration.pressureScale * rounded / (100 - rounded);
    const synthetic = { status: 'ok', summary: { conflictEvents: pressure / 1.4 } };
    if (scoreGdeltPressure(synthetic) !== rounded) throw new Error('events_impact_harness_parity');
    return scoreWorldOrderStress({ ...inputs, externalSources: { ...sources, gdelt: synthetic } });
  };
  // Mirror only the small existing module-weight equation for composition;
  // baseline parity below guards against drift. No runtime helper is edited.
  const modules = data?.modules || {};
  const moduleScore = clampScore(['geopolitical', 'energy', 'inflation', 'liquidity', 'debt', 'banking']
    .reduce((sum, k, i) => sum + (Number(modules[k]) || 0) * [0.28, 0.2, 0.14, 0.16, 0.12, 0.1][i], 0));
  const summarize = result => ({ score: result.score, state: result.state,
    dimensions: Object.fromEntries(DIMENSION_KEYS.map(k => [k, result.dimensions[k].score])) });
  function targeted(channelScore) {
    if (Math.round(channelScore) === oldGdeltScore) return summarize(baseline);
    const replacement = compose(channelScore);
    const dimensions = Object.fromEntries(DIMENSION_KEYS.map(k => [k,
      ['peaceDividendRetreat', 'multiTheaterConflict'].includes(k) ? replacement.dimensions[k].score : baseline.dimensions[k].score]));
    const structural = clampScore(DIMENSION_KEYS.reduce((sum, k) => sum + dimensions[k] * (Number(rules.dimensionWeights?.[k]) || 0.2), 0));
    const score = clampScore(structural * (Number(rules.scoreWeights?.externalStructural) || 0.6)
      + baseline.dimensions.marketConfirmation.score * (Number(rules.scoreWeights?.marketConfirmation) || 0.3)
      + moduleScore * (Number(rules.scoreWeights?.existingRiskModules) || 0.1));
    return { score, state: classifyWorldOrderState(score).state, dimensions };
  }
  // Parity at the historical channel score covers the duplicated module-weight
  // equation through an independent reconstruction (not the fast-path above).
  const structural = clampScore(DIMENSION_KEYS.reduce((s, k) => s + baseline.dimensions[k].score * (Number(rules.dimensionWeights?.[k]) || 0.2), 0));
  const reconstructed = clampScore(structural * (Number(rules.scoreWeights?.externalStructural) || 0.6)
    + baseline.dimensions.marketConfirmation.score * (Number(rules.scoreWeights?.marketConfirmation) || 0.3)
    + moduleScore * (Number(rules.scoreWeights?.existingRiskModules) || 0.1));
  if (reconstructed !== baseline.score) throw new Error('events_impact_composition_parity');
  return { baseline: summarize(baseline), oldGdeltScore, evaluate: channel => ({ targeted: targeted(channel), blanket: summarize(compose(channel)) }),
    naive: count => summarize(scoreWorldOrderStress({ ...inputs, externalSources: { ...sources,
      gdelt: { status: 'ok', summary: { conflictEvents: count } } } })) };
}
export function replayScoreImpact(calibration, context) {
  const training = calibration.windows.slice(0, 30), holdout = calibration.windows.slice(36, 43);
  if (calibration.windows.length !== 43 || holdout.length !== 7 || !calibration.cohort.sourcePeriodsDisjoint) throw new Error('events_impact_split');
  const ends = calibration.windows.map(w => parseTimestamp(`${w.endDay}000000`));
  if (ends.some((ms, i) => i > 0 && ms - ends[i - 1] !== 86400000)
    || ends[29] >= ends[36] - 6 * 86400000) throw new Error('events_impact_split');
  const scaleBounds = fitImpactBounds(training);
  const scenarios = [0.5, 0.75, 1, 1.25, 1.5].map(factor => ({ factor,
    windows: holdout.map(w => {
      const countBounds = violenceBounds(w), channel = normalizedBounds(countBounds, scaleBounds, factor);
      const lo = channel && context.evaluate(channel.lower), hi = channel && context.evaluate(channel.upper);
      const weekAgo = calibration.windows.find(x => parseTimestamp(`${x.endDay}000000`) === parseTimestamp(`${w.endDay}000000`) - 7 * 86400000);
      const prev = weekAgo && violenceBounds(weekAgo);
      return { endDay: w.endDay, countBounds, channelScoreBounds: channel,
        weekChangeCountBounds: countBounds && prev ? { lower: countBounds.lower - prev.upper, upper: countBounds.upper - prev.lower } : null,
        targeted: lo ? { lower: lo.targeted, upper: hi.targeted,
          classificationRobustToUnknownRows: lo.targeted.state === hi.targeted.state } : null,
        blanket: lo ? { lower: lo.blanket, upper: hi.blanket } : null,
        naiveOldScale: countBounds ? context.naive(countBounds.lower) : null };
    }) }));
  return { definitionId: IMPACT_DEFINITION, productionEligible: false, scoringConnected: false,
    approvedPointScale: null, researchScaleBounds: scaleBounds, baseline: context.baseline,
    oldGdeltScore: context.oldGdeltScore, scenarios,
    recommendedCandidateScope: ['peaceDividendRetreat', 'multiTheaterConflict'],
    remainingLegacyChannels: ['blocFormation', 'economicWeaponization', 'capitalControlRisk'],
    limitations: ['固定现有市场/OFAC/SIPRI/ACLED/模块背景的反事实敏感性回放，不是历史预测或收益回测。',
      '未知分类逐行取最坏上界，区间拟合不是批准单点尺度；旧严格资格规则不变。',
      '该冲突候选不认证制裁、阵营或资本管制；其它旧 Cloud 通道尚未迁移。',
      '训练/检验底层日期隔离，但训练内重叠，且方案基于已看过的数据，不是盲测。'] };
}
