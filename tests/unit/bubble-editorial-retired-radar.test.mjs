import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { validateWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const bubble = read('docs/fixtures/bubble-watch/legacy-contract-bundle.json').files['data/bubble-watch.json'];
const discovery = read('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json').newsContext;
const generatedAt = '2026-11-07T08:00:00Z';
const legacy = () => ({ releaseVersion: 'v28.0.10', updatedAt: generatedAt,
  score: 68, scoreChange7d: 12345.6789, currentMacroRegime: 'OLD_MODEL_REGIME_SENTINEL',
  confidenceLevel: 'OLD_MODEL_CONFIDENCE_SENTINEL', topRisks: ['OLD_MODEL_RISK_SENTINEL'] });
const pack = radarData => buildWeeklyEditorialInput({ bubbleWatch: bubble, radarData, discovery, generatedAt });
function assertExcluded(input) {
  assert.equal(input.contextSnapshots.radar, null);
  assert.ok(!input.sourceRefs.some(ref => ref.id === 'context:radar'));
  assert.match(input.dataGaps[0], /旧模型已退役/u);
  assert.match(input.dataGaps[0], /OFR 压力读数未纳入/u);
  const serialized = JSON.stringify(input);
  for (const forbidden of ['OLD_MODEL_REGIME_SENTINEL', 'OLD_MODEL_CONFIDENCE_SENTINEL', 'OLD_MODEL_RISK_SENTINEL', '12345.6789']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
  assert.equal(validateWeeklyEditorialInput(input).ok, true);
}

test('each independent OFR/retirement marker suppresses the complete old radar context', () => {
  for (const marker of [
    { mainPressureReadout: { status: 'available', index: { value: -2.3 } } },
    { advicePolicy: { mode: 'retired' } },
    { scoreRole: 'legacy_model_audit_only' },
    { legacyModelAudit: { currentAdviceGenerated: false } }
  ]) {
    const radar = { ...legacy(), ...marker };
    const before = structuredClone({ radar, bubble, discovery });
    const input = pack(radar);
    assertExcluded(input);
    assert.deepEqual({ radar, bubble, discovery }, before);
  }
});

test('missing, cached, stale or malformed new pressure never restores retired context', () => {
  for (const component of [null, undefined, false, [], {}, { status: 'cached' }, { status: 'stale' }, { status: 'missing_current' }, { status: 'unavailable' }]) {
    assertExcluded(pack({ ...legacy(), mainPressureReadout: component }));
  }
  for (const value of [null, undefined, false, {}, { mode: 'unknown' }]) {
    assertExcluded(pack({ ...legacy(), advicePolicy: value }));
  }
});

test('retirement exclusion precedes the bounded data-gap list, without changing source facts or scoring', () => {
  const ordinary = pack(legacy());
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble,
    radarData: { ...legacy(), scoreRole: 'legacy_model_audit_only' },
    discovery: { ...discovery, dataGaps: Array.from({ length: 30 }, (_, i) => `既有缺口 ${i}`) }, generatedAt });
  assertExcluded(input);
  assert.equal(input.dataGaps.length, 12);
  assert.deepEqual(input.scoringSnapshot, ordinary.scoringSnapshot);
  assert.deepEqual(input.structuredFacts, ordinary.structuredFacts);
  assert.deepEqual(input.historicalContext, ordinary.historicalContext);
  assert.deepEqual(input.boundaries, ordinary.boundaries);
});

test('historical pre-retirement compact context keeps its existing zero and null behavior', () => {
  const radar = { ...legacy(), score: 0, scoreChange7d: 0 };
  const input = pack(radar);
  assert.equal(input.contextSnapshots.radar.score, 0);
  assert.equal(input.contextSnapshots.radar.scoreChange7d, 0);
  assert.equal(input.contextSnapshots.radar.currentMacroRegime, radar.currentMacroRegime);
  assert.ok(input.sourceRefs.some(ref => ref.id === 'context:radar'));
  const unknown = pack({ ...legacy(), score: null, scoreChange7d: undefined });
  assert.equal(unknown.contextSnapshots.radar.score, null);
  assert.equal(unknown.contextSnapshots.radar.scoreChange7d, null);
});

test('absent radar does not imply retirement and repeated calls cannot leak old context', () => {
  for (const radar of [null, undefined]) {
    const input = pack(radar);
    assert.equal(input.contextSnapshots.radar, null);
    assert.ok(!input.dataGaps.some(gap => gap.includes('全球雷达旧模型已退役')));
  }
  pack(legacy());
  assertExcluded(pack({ ...legacy(), scoreRole: 'legacy_model_audit_only' }));
  assert.equal(pack(legacy()).contextSnapshots.radar.score, 68);
});

test('current published OFR payload is excluded without mutating published data', () => {
  const radar = read('data/radar-data.json');
  const before = JSON.stringify(radar);
  assert.equal(radar.scoreRole, 'legacy_model_audit_only');
  assertExcluded(pack(radar));
  assert.equal(JSON.stringify(radar), before);
});
