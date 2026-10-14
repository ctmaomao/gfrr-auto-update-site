// Fixed Core-23; uncertainty never removes a slot or assigns it a green light.
export const CORE_LAYOUT = Object.freeze([
  ['cape', 'stage', 'valuation'], ['top5_weight', 'stage', 'valuation'], ['nvda_fpe', 'stage', 'valuation'],
  ['hyperscaler_capex_yoy', 'stage', 'capital'], ['mag4_fcf_yoy', 'trigger', 'capital'],
  ['vc_ai_share', 'stage', 'capital'], ['nvda_invest_revenue', 'stage', 'capital'],
  ['breadth_50d', 'trigger', 'market_structure'], ['spy_vs_rsp_6m', 'trigger', 'market_structure'],
  ['insider_sell_buy', 'trigger', 'market_structure'], ['ai_ipo_pipeline', 'stage', 'market_structure'],
  ['hy_oas', 'trigger', 'credit'], ['dc_abs_spread', 'trigger', 'credit'],
  ['debt_capex_ratio', 'stage', 'credit'], ['neocloud_credit', 'trigger', 'credit'],
  ['token_volume_mom', 'trigger', 'fundamentals'], ['arr_2nd_deriv', 'trigger', 'fundamentals'],
  ['enterprise_deploy', 'stage', 'fundamentals'], ['cloud_rpo_growth', 'trigger', 'fundamentals'],
  ['accounting_events', 'trigger', 'macro'], ['fed_policy', 'trigger', 'macro'],
  ['capex_reaction', 'trigger', 'macro'], ['ceo_hedging', 'stage', 'macro']
].map(row => Object.freeze(row)));
export const SHADOW_IDS = Object.freeze(['private_secondary_marks', 'token_revenue_ratio', 'gpu_rental_price', 'frontier_progress']);
export const CATEGORIES = Object.freeze(['valuation', 'capital', 'market_structure', 'credit', 'fundamentals', 'macro']);
export const LIGHTS = Object.freeze(['green', 'yellow', 'red']);
export const GAP_REASONS = Object.freeze({
  dc_abs_spread: 'dc_abs_direct_spread_unavailable',
  insider_sell_buy: 'insider_window_coverage_unconfirmed',
  capex_reaction: 'capex_qualified_event_unavailable',
  fed_policy: 'fed_market_path_unavailable'
});
export const METHOD_ORDER = Object.freeze(['dc_abs_spread', 'insider_sell_buy', 'capex_reaction', 'fed_policy']);
export const TIER_LABELS = Object.freeze({ observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部', pending: '判读待确认' });
const RANK = { observation: 0, caution: 1, alert: 2, top: 3 };
const SCORE = { green: 0, yellow: 50, red: 100 };
const round = value => Number(value.toFixed(1));
export const evidenceModelVersion = revision => {
  if (!Number.isInteger(revision) || revision < 1 || revision > 4) throw new Error('Invalid evidence revision');
  return `bubble-watch-v3-core23-shadow4-r${revision}`;
};
export function modelRevision(version) {
  const match = /^bubble-watch-v3-core23-shadow4-r([1-4])$/u.exec(version || '');
  return match ? Number(match[1]) : null;
}
function realDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}
export function isRegisteredEvidenceGap(item, { revision, asOfDate } = {}) {
  if (!Number.isInteger(revision) || revision < 1 || revision > 4 || !realDay(asOfDate)) return false;
  const gap = item?.evidence_gap;
  const checked = item?.provenance?.checkedAt;
  const stamp = typeof checked === 'string' ? Date.parse(checked) : NaN;
  return item.score_role === 'core' && item.status === 'unknown'
    && METHOD_ORDER.slice(0, revision).includes(item.id)
    && gap?.policy === 'bubble-qualified-evidence-v1'
    && gap.reasonCode === GAP_REASONS[item.id] && gap.checkedDate === asOfDate
    && item.as_of === null && item.stale === false
    && item.provenance?.mode === 'auto'
    && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === asOfDate;
}
export function validateEvidenceLayout(indicators, revision) {
  evidenceModelVersion(revision);
  if (!Array.isArray(indicators) || indicators.length !== 27) throw new Error('Expected 27 evidence cards');
  const byId = new Map(indicators.map(item => [item.id, item]));
  if (byId.size !== 27) throw new Error('Duplicate evidence ID');
  const allowedGaps = METHOD_ORDER.slice(0, revision);
  for (const [id, axis, category] of CORE_LAYOUT) {
    const item = byId.get(id);
    if (!item || item.score_role !== 'core' || item.axis !== axis || item.category !== category) throw new Error(`Core layout mismatch: ${id}`);
    if (item.status === 'unknown') {
      if (!allowedGaps.includes(id) || item.evidence_gap?.reasonCode !== GAP_REASONS[id]) throw new Error(`Unregistered evidence gap: ${id}`);
    } else if (!LIGHTS.includes(item.status)) throw new Error(`Invalid evidence status: ${id}`);
  }
  for (const id of SHADOW_IDS) {
    const item = byId.get(id);
    if (!item || item.score_role !== 'shadow' || !LIGHTS.includes(item.status)) throw new Error(`Shadow layout mismatch: ${id}`);
  }
  return CORE_LAYOUT.map(([id]) => byId.get(id));
}
export function baseTier(percent) {
  return percent >= 60 ? 'top' : percent >= 40 ? 'alert' : percent >= 25 ? 'caution' : 'observation';
}
function completedScores(core, unknownStatus) {
  const rows = core.map(item => ({ ...item, status: item.status === 'unknown' ? unknownStatus : item.status }));
  const red = rows.filter(item => item.status === 'red').length;
  const yellow = rows.filter(item => item.status === 'yellow').length;
  const mean = items => items.reduce((sum, item) => sum + SCORE[item.status], 0) / items.length;
  const primary = 100 * red / 23;
  const stage = mean(rows.filter(item => item.axis === 'stage'));
  const trigger = mean(rows.filter(item => item.axis === 'trigger'));
  const categories = Object.fromEntries(CATEGORIES.map(category => [category, mean(rows.filter(item => item.category === category))]));
  const resonant = CATEGORIES.filter(category => {
    const items = rows.filter(item => item.category === category);
    return items.filter(item => item.status === 'red').length / items.length >= 0.5;
  });
  const base = baseTier(primary);
  let tier = base;
  if (resonant.length >= 2 && RANK[tier] < RANK.alert) tier = 'alert';
  const target = stage >= 60 && trigger >= 65 ? 'top' : stage >= 60 && trigger >= 50 ? 'alert' : null;
  const twoAxisUpgrade = target && RANK[target] > RANK[tier] ? target : null;
  if (twoAxisUpgrade) tier = twoAxisUpgrade;
  return { primary, pressure: 100 * (red + 0.5 * yellow) / 23, stage, trigger, categories, tier, base, twoAxisUpgrade };
}
export function replayEvidenceScores(indicators, revision = 1) {
  const core = validateEvidenceLayout(indicators, revision);
  // All upgrade rules are monotone in light severity. Endpoint completions give
  // exact score bounds and the minimum/maximum possible effective tier.
  const lower = completedScores(core, 'green');
  const upper = completedScores(core, 'red');
  const unknownIds = core.filter(item => item.status === 'unknown').map(item => item.id);
  const range = key => ({ lower: round(lower[key]), upper: round(upper[key]) });
  const point = (key, items) => items.some(item => item.status === 'unknown') ? null : round(lower[key]);
  return {
    modelVersion: evidenceModelVersion(revision),
    unknownIds,
    counts: Object.fromEntries([...LIGHTS, 'unknown'].map(status => [status, core.filter(item => item.status === status).length])),
    primary: point('primary', core), primaryRange: range('primary'),
    pressure: point('pressure', core), pressureRange: range('pressure'),
    stage: point('stage', core.filter(item => item.axis === 'stage')), stageRange: range('stage'),
    trigger: point('trigger', core.filter(item => item.axis === 'trigger')), triggerRange: range('trigger'),
    categories: Object.fromEntries(CATEGORIES.map(category => {
      const missing = core.some(item => item.category === category && item.status === 'unknown');
      return [category, { point: missing ? null : round(lower.categories[category]), lower: round(lower.categories[category]), upper: round(upper.categories[category]) }];
    })),
    tierRange: { lower: lower.tier, upper: upper.tier },
    effectiveTier: lower.tier === upper.tier ? lower.tier : 'pending',
    baseTier: unknownIds.length ? null : lower.base,
    overrideActive: unknownIds.length === 0 && lower.tier !== lower.base,
    twoAxisUpgrade: unknownIds.length ? null : lower.twoAxisUpgrade,
    verdictLabel: TIER_LABELS[lower.tier === upper.tier ? lower.tier : 'pending']
  };
}
export function validateEvidenceScoreFields(data) {
  const errors = [];
  const revision = modelRevision(data?.scoring?.model_version);
  if (data?.contractVersion !== 'bubble-watch-v3' || !revision) return ['Unregistered v3 contract/model'];
  let replay;
  try { replay = replayEvidenceScores(data.indicators, revision); } catch (error) { return [error.message]; }
  for (const item of data.indicators.filter(item => item.status === 'unknown')) {
    if (!isRegisteredEvidenceGap(item, { revision, asOfDate: data.as_of_date })) errors.push(`Invalid gap metadata: ${item.id}`);
  }
  const s = data.summary || {};
  const equal = (name, actual, expected) => {
    if (actual !== expected) errors.push(`${name} differs from evidence replay`);
  };
  const checkRange = (name, actual, expected) => {
    if (!actual || actual.lower !== expected.lower || actual.upper !== expected.upper || Object.keys(actual).some(key => !['lower', 'upper'].includes(key))) errors.push(`${name} differs from evidence bounds`);
  };
  equal('primary_score_pct', s.primary_score_pct, replay.primary);
  equal('red_pct', s.red_pct, replay.primary);
  equal('weighted_risk_score', s.weighted_risk_score, replay.pressure);
  equal('stage_score', s.stage_score, replay.stage);
  equal('trigger_score', s.trigger_score, replay.trigger);
  equal('scoring_unknown_count', s.scoring_unknown_count, replay.unknownIds.length);
  equal('scoring_total_indicators', s.scoring_total_indicators, 23);
  for (const status of LIGHTS) equal(`scoring_${status}_count`, s[`scoring_${status}_count`], replay.counts[status]);
  for (const [field, value] of [['primary_score_range_pct', replay.primaryRange], ['weighted_risk_score_range', replay.pressureRange], ['stage_score_range', replay.stageRange], ['trigger_score_range', replay.triggerRange]]) checkRange(field, s[field], value);
  for (const category of CATEGORIES) {
    equal(`category_scores.${category}`, s.category_scores?.[category], replay.categories[category].point);
    checkRange(`category_score_ranges.${category}`, s.category_score_ranges?.[category], replay.categories[category]);
  }
  equal('verdict_label', s.verdict_label, replay.verdictLabel);
  equal('effective_tier', data.scoring.effective_tier, replay.effectiveTier);
  equal('base_tier', data.scoring.base_tier, replay.baseTier);
  equal('override_active', data.scoring.override_active, replay.overrideActive);
  equal('two_axis_upgrade', data.scoring.two_axis_upgrade, replay.twoAxisUpgrade);
  equal('tier lower', data.scoring.tier_range?.lower, replay.tierRange.lower);
  equal('tier upper', data.scoring.tier_range?.upper, replay.tierRange.upper);
  if (JSON.stringify(data.scoring.unknown_core_ids) !== JSON.stringify(replay.unknownIds)) errors.push('Unknown IDs mismatch');
  return errors;
}
