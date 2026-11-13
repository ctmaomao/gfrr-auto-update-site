import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineAgeDisclosure, discloseOilThermalBaselineAge } from '../../scripts/oil-directional/oil-thermal-baseline-age.mjs';
const now = '2026-11-13T11:02:53.327Z';
test('old baseline discloses exact cutoff and age separately from maturity', () => {
  const note = baselineAgeDisclosure('2026-09-05T04:33:15.490Z', now, 35.48);
  assert.match(note, /69.3 天/);
  assert.match(note, /参考较旧/);
  assert.match(note, /2026-09-05T04:33:15.490Z/);
  assert.match(note, /不会.*自动更新/);
});
test('age uses artifact generation, not wall clock or observation timestamp', () => {
  assert.doesNotMatch(baselineAgeDisclosure(now, now, 35), /参考较旧/);
  assert.match(baselineAgeDisclosure(now, now, 35), /0.0 天/);
});
test('invalid, missing, impossible dates and future cutoffs fail closed', () => {
  for (const value of [null, '', '2026-02-30T00:00:00Z', '2026-11-14T00:00:00Z', '2026-11-13', '2026-11-13T00:00:00+01:00']) {
    assert.match(baselineAgeDisclosure(value, now, 35), /无法核验/);
  }
  assert.match(baselineAgeDisclosure(now, null, 35), /无法核验/);
});
test('missing window does not silently coerce to zero or invent stale threshold', () => {
  for (const window of [null, undefined, '', 0, -1, '35']) {
    assert.doesNotMatch(baselineAgeDisclosure('2026-09-05T00:00:00Z', now, window), /参考较旧/);
  }
});
test('per facility date does not borrow aggregate date; math and status unchanged', () => {
  const artifact = { generatedAt: now, signalState: 'baseline_repeated_watch',
    baseline: { sourceReview: { lastSampleAt: now, sampleWindowDays: 35 } },
    facilities: [{ noteZh: '不确认事故。', baselineComparison: {
      status: 'established', lastSampleAt: '2026-09-05T00:00:00Z', windowDays: 35,
      repeatedObservation: true, elevatedRepeatedObservation: false } }] };
  const originalComparison = structuredClone(artifact.facilities[0].baselineComparison);
  discloseOilThermalBaselineAge(artifact);
  assert.doesNotMatch(artifact.limitationsZh[0], /参考较旧/);
  assert.match(artifact.facilities[0].noteZh, /参考较旧/);
  assert.match(artifact.facilities[0].noteZh, /不确认事故/);
  assert.deepEqual(artifact.facilities[0].baselineComparison, originalComparison);
  assert.equal(artifact.signalState, 'baseline_repeated_watch');
  const once = JSON.stringify(artifact);
  discloseOilThermalBaselineAge(artifact);
  assert.equal(JSON.stringify(artifact), once);
});
test('empty artifact is safe and absent baseline is not fabricated', () => {
  assert.equal(discloseOilThermalBaselineAge(null), null);
  assert.deepEqual(discloseOilThermalBaselineAge({}), {});
});
test('unqueried shell stays byte-stable without generated age text', () => {
  const artifact = { sourceStatus: { firms: 'not_queried' }, generatedAt: now,
    baseline: { sourceReview: { lastSampleAt: '2026-09-05T00:00:00Z' } } };
  const before = JSON.stringify(artifact);
  discloseOilThermalBaselineAge(artifact);
  assert.equal(JSON.stringify(artifact), before);
});
test('refresh replaces generated notes while preserving unrelated limitations', () => {
  const artifact = { generatedAt: now, limitationsZh: ['不确认事故。'],
    baseline: { sourceReview: { lastSampleAt: now, sampleWindowDays: 35 } },
    facilities: [{ noteZh: '仅供复核。', baselineComparison: { status: 'established', lastSampleAt: now, windowDays: 35 } }] };
  discloseOilThermalBaselineAge(artifact);
  artifact.generatedAt = '2026-11-14T11:02:53.327Z';
  discloseOilThermalBaselineAge(artifact);
  assert.equal(artifact.limitationsZh.length, 2);
  assert.equal(artifact.limitationsZh[0], '不确认事故。');
  assert.doesNotMatch(artifact.facilities[0].noteZh, /0.0 天/);
  assert.match(artifact.facilities[0].noteZh, /^仅供复核。.*1.0 天/);
});
