import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEATURE_KEYS, pressureFeatures, scorePressure } from '../../scripts/daily/pressure-model.mjs';
import { pressureRemediationDiagnostics } from '../../scripts/daily/pressure-remediation.mjs';
import { implementationHash } from '../../scripts/research-pressure-model.mjs';

const protocol = JSON.parse(fs.readFileSync('config/pressure-model-research.json', 'utf8'));
const date = '2026-09-11', end = Date.parse(`${date}T00:00:00Z`), DAY = 86400000;
const history = Array.from({ length: 260 }, (_, i) => ({
  date: new Date(end - (260 - i) * 7 * DAY).toISOString().slice(0, 10),
  features: Object.fromEntries(FEATURE_KEYS.map((key, k) => [key, 1 + (i % (17 + k)) / 10]))
}));
function packet(features = Object.fromEntries(FEATURE_KEYS.map(key => [key, 2]))) {
  const current = { date, features };
  return { ...current, candidates: protocol.variants.map(v => scorePressure(current, history, protocol, v)) };
}

test('all frozen candidates replay and respond locally without granting model promotion', () => {
  const current = packet(), before = JSON.stringify(current);
  const result = pressureRemediationDiagnostics(current, protocol);
  assert.equal(result.allVariantsResponsive, true);
  assert.equal(result.variants.length, protocol.variants.length);
  assert.equal(result.productionReplacementEnabled, false);
  assert.equal(result.candidateSelection, null);
  for (const row of result.variants) {
    assert.equal(row.parametersHeldFixed, true);
    assert.deepEqual(Object.keys(row.sensitivities), FEATURE_KEYS);
  }
  assert.equal(JSON.stringify(current), before);
});

test('missing observations or candidate scores remain unevaluated and mismatched replay fails', () => {
  const current = packet();
  current.candidates[0] = { variant: protocol.variants[0].id, score: null, status: 'warming_up' };
  const result = pressureRemediationDiagnostics(current, protocol);
  assert.equal(result.allVariantsResponsive, false);
  assert.equal(result.variants[0].responsive, null);
  assert.equal(result.variants[0].sensitivities, null);
  assert.ok(result.variants.slice(1).every(row => row.responsive));
  assert.ok(pressureRemediationDiagnostics({}, protocol).variants.every(row => row.status === 'unavailable'));
  const invalid = packet(); invalid.candidates[0].score += 1;
  assert.throws(() => pressureRemediationDiagnostics(invalid, protocol), /replay mismatch/);
});

test('RRP and excluded overlays cannot alter candidate features or scores; ownership is disjoint', () => {
  const series = Object.fromEntries(Object.keys(protocol.sources).map(key => [key, []]));
  for (let i = 500; i >= 0; i--) {
    const observationDate = new Date(end - i * DAY).toISOString().slice(0, 10);
    const values = { baa10y: 2, vix: 20, spx: 5000-i, dxy: 110-i/100,
      brent: 80-i/100, us10y: 4-i/1000, breakeven10y: 2.5 };
    for (const key of Object.keys(series)) series[key].push({ date: observationDate, value: values[key] });
  }
  const original = pressureFeatures(series, date, protocol);
  assert.ok(original.features);
  for (const value of [0, 5, 500, 1e6]) {
    const changed = pressureFeatures({ ...series, onRrp: [{ date, value }],
      worldOrderStress: [{ date, value: 100 }] }, date, protocol);
    assert.deepEqual(changed, original);
    assert.deepEqual(packet(changed.features), packet(original.features));
  }
  const ownership = pressureRemediationDiagnostics(packet(), protocol).inputOwnership;
  const inputs = Object.values(ownership).flat();
  assert.equal(new Set(inputs).size, inputs.length);
  assert.deepEqual(Object.keys(ownership).filter(key => ownership[key].includes('brent')), ['energyInflation']);
});

test('remediation implementation changes invalidate the prospective cohort fingerprint', () => {
  const baseline = implementationHash(file => file, 'fixed-score-implementation');
  const changed = implementationHash(file => file.endsWith('/pressure-remediation.mjs') ? `${file}:changed` : file,
    'fixed-score-implementation');
  assert.notEqual(changed, baseline);
});
