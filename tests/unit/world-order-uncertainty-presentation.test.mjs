import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldOrderUncertaintyPresentation as view } from '../../scripts/world-order/uncertainty-presentation.mjs';
import { normalizeWorldOrderStressHistorySnapshot } from '../../scripts/daily/world-order-history.mjs';
const options = { allowV2: true, nowMs: Date.parse('2026-11-13T12:00:00Z') };
const fixture = () => ({ contractVersion: 'world-order-stress-v2', status: 'incomplete', score: null, confidence: null, state: 'incomplete', labelZh: '证据不足，暂不分档', updatedAt: '2026-11-13T11:00:00Z', freshness: 'unverified', scoreRange: { lower: 0, upper: 88, kind: 'conditional_v1_formula_outer_bound' }, missingReasons: ['美元判据未校准'] });
test('legacy remains untouched and every explicit version is inactive by default', () => {
  assert.equal(view({ score: 42, state: 'bloc_fragmentation' }), null);
  for (const contractVersion of ['world-order-stress-v2', 'unknown', null, '']) assert.throws(() => view({ ...fixture(), contractVersion }), /not_activated/);
});
test('source and history incomplete views show bounds, never a point or neutral recommendation', () => {
  const source = fixture(), before = JSON.stringify(source);
  const actual = view(source, options);
  assert.deepEqual(actual, view(normalizeWorldOrderStressHistorySnapshot(source, options), options));
  assert.equal(JSON.stringify(source), before);
  assert.equal(actual.score, null); assert.equal(actual.scoreText, '—'); assert.equal(actual.tone, null);
  assert.equal(actual.decisionModifier, null); assert.equal(actual.productionEligible, false);
  assert.match(actual.rangeText, /0～88/); assert.match(actual.boundaryText, /不是当前点估计、概率区间/);
  assert.match(actual.boundaryText, /不代表风险解除/);
  actual.missingReasons.push('mutation'); assert.equal(source.missingReasons.length, 1);
});
test('even a collapsed range is not promoted to a current score or eligibility', () => {
  const source = fixture(); source.scoreRange.lower = source.scoreRange.upper = 24;
  const actual = view(source, options);
  assert.equal(actual.score, null); assert.equal(actual.productionEligible, false); assert.match(actual.rangeText, /24～24/);
});
test('lastKnown is explicitly dated and separated from the current absent score', () => {
  const source = fixture(); source.lastKnown = { score: 54, state: 'bloc_fragmentation', observedAt: '2026-11-12T10:00:00Z' };
  const actual = view(source, options);
  assert.match(actual.lastKnownText, /2026-11-12T10:00:00Z.*54\/100.*不是当前评分/); assert.equal(actual.score, null);
});
test('malformed, future, falsely complete or unknown-version input cannot yield a presentation', () => {
  for (const patch of [{ score: 0 }, { score: '0' }, { confidence: 0 }, { status: 'complete' }, { state: 'stable' }, { freshness: 'fresh' }, { decisionModifier: { riskBias: 'neutral' } }, { updatedAt: '2099-01-01T00:00:00Z' }, { updatedAt: 'bad' }, { missingReasons: [] }, { contractVersion: 'unknown' }, { contractVersion: null }, { scoreRange: { lower: 2, upper: 1, kind: 'conditional_v1_formula_outer_bound' } }, { lastKnown: { score: 54, state: 'stable', observedAt: '2099-01-01' } }]) assert.throws(() => view({ ...fixture(), ...patch }, options));
});
