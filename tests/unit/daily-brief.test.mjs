import assert from 'node:assert/strict';
import test from 'node:test';

import {
  briefEvidence,
  buildDailyBrief,
  buildUnavailableDailyBrief,
} from '../../scripts/daily/daily-brief.mjs';

const GENERATED_AT = '2000-01-01T00:00:00.000Z';
const BASE_RISK = {
  score: 52,
  modules: { geopolitical: 40, energy: 40, inflation: 40, liquidity: 40, debt: 40, banking: 40 },
  brent: 80,
  breakeven: 2.2,
  us10y: 4,
  real10y: 1.8,
  spx: 4900,
  dxy: 100,
  hy: 3,
  vix: 18,
};
const REALTIME = { criticalMissing: 0, fallbackCount: 0, healthScore: 100, sourceMode: 'live' };

function build(risk = BASE_RISK, realtimePayload = REALTIME, overrides = {}) {
  return buildDailyBrief({
    risk,
    realtimePayload,
    macroState: '固定宏观状态',
    phase: '固定阶段',
    displayInputsBaseline: {
      brent: risk.brent,
      breakeven10y: risk.breakeven,
      us10y: risk.us10y,
      real10y: risk.real10y,
      spx: risk.spx,
      dxy: risk.dxy,
      hyOas: risk.hy,
      vix: risk.vix,
    },
    topRisks: ['固定风险一', '固定风险二'],
    activeSignals: [{ label: '固定结构信号' }],
    allMacroMissing: false,
    confidenceScore: 90,
    generatedAt: GENERATED_AT,
    ...overrides,
  });
}

test('daily brief evidence and unavailable fallback preserve their contracts', () => {
  assert.deepEqual(briefEvidence('source', 'key', '标签', 1, '摘要'), {
    source: 'source', key: 'key', labelZh: '标签', value: 1, summaryZh: '摘要',
  });
  assert.deepEqual(buildUnavailableDailyBrief(GENERATED_AT), {
    contractVersion: 'v28.0I-1',
    generatedAt: GENERATED_AT,
    macroState: '数据不足',
    oneLineConclusion: '实时快变量暂不可用，今日总判断层只能保留低置信观察。',
    dominantRiskChain: {
      key: 'baseline_observation', labelZh: '基线观察状态', stageZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断今日主导风险链。', evidence: [],
    },
    largestDivergence: {
      key: 'no_clear_divergence', labelZh: '暂无明确主背离', statusZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断最大背离。', evidence: [],
    },
    keyTriggers: ['数据健康状态恢复后重新生成今日触发器。'],
    invalidationSignals: ['数据健康恢复且风险判断不再获得交叉验证。'],
    dataGaps: ['实时快变量暂不可用。', '消费者信心、Brent 实物价格与期限结构等仍未纳入。'],
    confidence: { level: 'low', score: 0, reasonZh: '实时快变量暂不可用，今日总判断只能作为低置信观察。' },
    boundaries: {
      displayOnly: true, affectsScoring: false, affectsDecisionModel: false,
      affectsExecutionLock: false, affectsPositionGuidance: false,
    },
  });
});

test('daily brief selects each dominant risk chain without changing score inputs', () => {
  const broad = build({
    ...BASE_RISK,
    modules: { geopolitical: 75, energy: 72, inflation: 71, liquidity: 40, debt: 40, banking: 40 },
  });
  assert.equal(broad.dominantRiskChain.key, 'broad_risk_resonance');
  assert.equal(broad.keyTriggers[3], '多个底层模块同时升至高风险区。');
  assert.equal(broad.confidence.level, 'high');
  assert.equal(broad.generatedAt, GENERATED_AT);

  const energy = build({ ...BASE_RISK, brent: 96, modules: { ...BASE_RISK.modules, energy: 66 } });
  assert.equal(energy.dominantRiskChain.key, 'energy_inflation_rates');

  const liquidity = build({ ...BASE_RISK, dxy: 106, modules: { ...BASE_RISK.modules, liquidity: 66 } });
  assert.equal(liquidity.dominantRiskChain.key, 'liquidity_credit_stress');

  const rates = build({ ...BASE_RISK, us10y: 4.45, real10y: 2.1, spx: 5100 });
  assert.equal(rates.dominantRiskChain.key, 'rates_asset_repricing');

  const baseline = build(BASE_RISK, REALTIME, { activeSignals: [] });
  assert.equal(baseline.dominantRiskChain.key, 'baseline_observation');
  assert.match(baseline.confidence.reasonZh, /结构信号未形成/u);
});

test('daily brief selects every divergence branch', () => {
  const energy = build(
    { ...BASE_RISK, brent: 96 },
    { ...REALTIME, brentValidation: { promotion: { reason: 'confirmed yahoo', applied: true } } },
  );
  assert.equal(energy.largestDivergence.key, 'energy_pricing_gap_watch');

  const rates = build({ ...BASE_RISK, us10y: 4.45, real10y: 2.1, spx: 5100 });
  assert.equal(rates.largestDivergence.key, 'rates_vs_risk_assets');

  const liquidity = build({ ...BASE_RISK, dxy: 106, hy: 3, vix: 18 });
  assert.equal(liquidity.largestDivergence.key, 'liquidity_vs_credit');
  assert.equal(build().largestDivergence.key, 'no_clear_divergence');
});

test('daily brief confidence fails closed across data-quality conditions', () => {
  for (const [realtime, overrides] of [
    [REALTIME, { allMacroMissing: true }],
    [{ ...REALTIME, cacheOnly: true }, {}],
    [{ ...REALTIME, criticalMissing: 2 }, {}],
    [REALTIME, { confidenceScore: 54 }],
  ]) {
    assert.equal(build(BASE_RISK, realtime, overrides).confidence.level, 'low');
  }
  for (const [realtime, score] of [
    [{ ...REALTIME, degradedMode: true }, 90],
    [{ ...REALTIME, fallbackCount: 1 }, 90],
    [REALTIME, 79],
  ]) {
    assert.equal(build(BASE_RISK, realtime, { confidenceScore: score }).confidence.level, 'medium');
  }
  const macroMissing = build(BASE_RISK, REALTIME, { allMacroMissing: true, confidenceScore: 40 });
  assert.match(macroMissing.dataGaps[0], /结构性宏观驱动源当前不可用/u);
});
