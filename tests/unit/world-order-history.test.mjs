import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWorldOrderStressHistorySnapshot as normalize, mergeWorldOrderStress as merge, validateV2HistorySnapshot } from '../../scripts/daily/world-order-history.mjs';
const v1 = () => ({ score: 54, confidence: .55, state: 'bloc_fragmentation', labelZh: '阵营化', updatedAt: '2026-11-12T03:00:00Z', freshness: 'fresh' });
const v2 = () => ({ contractVersion: 'world-order-stress-v2', status: 'incomplete', score: null, confidence: null, state: 'incomplete', labelZh: '证据不足，暂不分档', updatedAt: '2026-11-13T03:00:00Z', freshness: 'unverified', scoreRange: { lower: 43, upper: 70, kind: 'conditional_v1_formula_outer_bound' }, missingReasons: ['observation_qualification_missing'] });

test('legacy normalizer and same-day carry-forward behavior remain unchanged', () => {
  const original = v1(); const result = normalize(original);
  assert.deepEqual(result, { score: 54, confidence: .55, state: 'bloc_fragmentation', labelZh: '阵营化', observedAt: original.updatedAt, freshness: 'fresh' });
  assert.equal(normalize({ ...original, score: null }).score, 0); // legacy only
  for (const score of [undefined, NaN, 'invalid', -1, 101]) assert.equal(normalize({ ...original, score }), null);
  const previous = { worldOrderStress: result };
  assert.equal(merge({}, null, previous).worldOrderStress, result);
  assert.deepEqual(merge({}, null), {}); // cross-day caller supplies no previous entry
  assert.deepEqual(original, v1());
});

test('v2 opt-in incomplete marker supersedes old current state without zero coercion', () => {
  assert.throws(() => normalize(v2()), /not_activated/);
  const input = v2(); const current = normalize(input, { allowV2: true });
  const old = normalize(v1());
  const entry = { worldOrderStress: old, date: '2026-11-13' };
  const merged = merge(entry, current, { worldOrderStress: old });
  assert.equal(merged.worldOrderStress.score, null);
  assert.equal(merged.worldOrderStress.state, 'incomplete');
  assert.equal(entry.worldOrderStress, old);
  assert.equal(current.lastKnown, undefined); // never silently carry forward
  assert.deepEqual(validateV2HistorySnapshot(JSON.parse(JSON.stringify(current))), current);
  current.scoreRange.lower = 40;
  current.missingReasons.push('extra');
  assert.deepEqual(input, v2());
});

test('dated lastKnown is explicit reference only, never current score', () => {
  const input = { ...v2(), lastKnown: { score: 54, state: 'bloc_fragmentation', observedAt: v1().updatedAt } };
  const current = normalize(input, { allowV2: true });
  assert.equal(current.score, null);
  assert.equal(current.lastKnown.score, 54);
  current.lastKnown.score = 1;
  assert.equal(input.lastKnown.score, 54);
});

test('invalid/unknown v2 cannot fall through to legacy or carry-forward', () => {
  for (const patch of [
    { score: 0 }, { confidence: 0 }, { state: 'normal_globalization' }, { status: 'complete' },
    { freshness: 'fresh' }, { updatedAt: 'invalid' }, { updatedAt: '2099-01-01T00:00:00Z' }, { missingReasons: [] },
    { scoreRange: { lower: '43', upper: 70, kind: 'conditional_v1_formula_outer_bound' } },
    { scoreRange: { lower: 71, upper: 70, kind: 'conditional_v1_formula_outer_bound' } },
    { scoreRange: { lower: 0, upper: 101, kind: 'conditional_v1_formula_outer_bound' } },
    { decisionModifier: { riskBias: 'neutral' } },
    { lastKnown: { score: null, state: 'bloc_fragmentation', observedAt: v1().updatedAt } },
    { lastKnown: { score: 54, state: 'bloc_fragmentation', observedAt: '2099-01-01' } }
  ]) assert.throws(() => normalize({ ...v2(), ...patch }, { allowV2: true }));
  for (const contractVersion of ['world-order-stress-v3', null, '', false, 0, undefined]) {
    assert.throws(() => normalize({ ...v2(), contractVersion }, { allowV2: true }), /version_unknown/);
  }
});
