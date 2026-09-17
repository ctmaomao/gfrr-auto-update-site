import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyAgreement, errorEpisodes, candidateAccounting, historicalErrorDiagnostics, ledgerChangeDiagnostics } from '../../scripts/daily/pressure-evidence-diagnostics.mjs';
import { parseEvidenceArgs } from '../../scripts/analyze-pressure-evidence.mjs';
import { FEATURE_KEYS, pressureFeatures, scorePressure, digest, replayPressureInputs } from '../../scripts/daily/pressure-model.mjs';
import { appendShadowLedger } from '../../scripts/daily/pressure-evaluation.mjs';
import { implementationHash, evaluateResearch } from '../../scripts/research-pressure-model.mjs';

const protocol = JSON.parse(fs.readFileSync('config/pressure-model-research.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('config/rules.json', 'utf8'));
const date = '2026-09-11', end = Date.parse(date + 'T00:00:00Z'), DAY = 86400000;
function sourceFixture() {
  const series = Object.fromEntries([...Object.keys(protocol.sources), 'hyOas', 'igOas', 'real10y', 'walcl', 'onRrp', 't10y2y', 'stlfsi', 'nfci'].map(key => [key, []]));
  for (let i = 1500; i >= 0; i--) {
    const day = new Date(end - i * DAY).toISOString().slice(0, 10), wave = Math.sin(i / 70);
    const values = { baa10y: 2+wave, vix: 20+5*wave, spx: 5000-i, dxy: 110-i/100,
      brent: 80-i/100, us10y: 4-i/1000, breakeven10y: 2.5, hyOas: 3, igOas: 1,
      real10y: 1.5, walcl: 6000000, onRrp: 50, t10y2y: 0.2, stlfsi: wave, nfci: wave };
    for (const key of Object.keys(series)) if (!['stlfsi', 'nfci'].includes(key) || new Date(day).getUTCDay() === 5) {
      series[key].push({ date: day, value: values[key] });
    }
  }
  return series;
}
const inputs = pressureFeatures(sourceFixture(), date, protocol);
const history = Array.from({ length: 156 }, (_, i) => ({ date: new Date(end-(156-i)*7*DAY).toISOString().slice(0,10),
  features: Object.fromEntries(FEATURE_KEYS.map(key => [key, 1 + (i % 19)/10])) }));
function record(day, centerShift = 0, creditChange = 0) {
  const source = structuredClone(inputs); source.evidence.baa10y.value += creditChange; source.features.credit += creditChange;
  const scores = protocol.variants.map(v => scorePressure({ ...source, date: day },
    [...history, { date, features: inputs.features }], protocol, v));
  const parameters = Object.fromEntries(scores.map(row => {
    const calibration = structuredClone(row.calibration);
    for (const key of FEATURE_KEYS) calibration[key].center += centerShift;
    return [row.variant, { calibration, weights: row.weights }];
  }));
  const scoreInputs = { evidence: source.evidence, references: source.references, features: source.features, parameters };
  const variantScores = Object.fromEntries(protocol.variants.map(v => [v.id, replayPressureInputs(source.features, parameters[v.id], v)]));
  const variant = protocol.variants[0].id, now = day+'T12:00:00.000Z';
  return { date: day, recordedAt: now, sourceRetrievedAt: now, protocolHash: digest(protocol), implementationHash: implementationHash(),
    scoreInputs, inputHash: digest(scoreInputs), variant, score: variantScores[variant], variantScores,
    variantStatus: Object.fromEntries(scores.map(row => [row.variant, { status: row.status, trainingWeeks: row.trainingWeeks }])) };
}
function append(ledger, row) { return appendShadowLedger(ledger, row, protocol, row.recordedAt); }

test('threshold and zero benchmark are exact; missing values never become normal conditions', () => {
  assert.equal(classifyAgreement(70, 0, 70), 'fp');
  assert.equal(classifyAgreement(70, 0.01, 70), 'tp');
  assert.equal(classifyAgreement(69.99, 0.01, 70), 'fn');
  for (const value of [null, undefined, NaN, '0']) assert.equal(classifyAgreement(80, value, 70), 'unavailable');
});

test('episodes retain every error and break at missing, correct or nonconsecutive weeks', () => {
  const rows = ['fn', 'fn', 'tn', 'fn', 'unavailable', 'fn'].map((classification, i) => ({
    date: new Date(end+i*7*DAY).toISOString().slice(0,10), classification }));
  rows.push({ date: '2026-11-06', classification: 'fn' });
  const episodes = errorEpisodes(rows);
  assert.deepEqual(episodes.map(row => row.weeks), [2,1,1,1]);
  assert.equal(episodes.flatMap(row => row.dates).length, 5);
  assert.throws(() => errorEpisodes([rows[0],rows[0]]), /dates/);
});

test('weighted channels reconcile and cannot pass a tampered score', () => {
  const scored = scorePressure(inputs, history, protocol, protocol.variants[1]);
  const result = candidateAccounting(scored);
  assert.ok(Math.abs(result.linearTotal + result.smoothTailContribution - scored.score) < 1e-9);
  assert.equal(result.causalAttribution, false);
  assert.throws(() => candidateAccounting({ ...scored, score: scored.score+1 }), /mismatch/);
});

test('validated ledger exposes calibration-only decline, real gaps and two-order accounting without mutation', () => {
  let ledger = append(null, record(date));
  assert.equal(ledgerChangeDiagnostics(ledger, protocol).status, 'awaiting_second_distinct_date');
  ledger = append(ledger, record('2026-09-12', 1));
  ledger = append(ledger, record('2026-09-14', 2, 1));
  const before = JSON.stringify(ledger), result = ledgerChangeDiagnostics(ledger, protocol);
  assert.equal(JSON.stringify(ledger), before);
  assert.ok(result.transitions[0].variants.every(row => row.calibrationOnlyDecline && row.marketInputStep === 0));
  assert.equal(result.transitions[0].unchangedCurrentValues, true);
  assert.equal(result.transitions[1].unchangedCurrentValues, false);
  assert.equal(result.transitions[1].calendarGapDays, 2);
  assert.equal(result.transitions[1].consecutiveCalendarDays, false);
  assert.deepEqual(result.transitions[1].changedObservations, ['baa10y']);
  assert.ok(result.transitions[1].variants.some(row => Math.abs(row.orderSensitivity) > 1e-6));
  for (const transition of result.transitions) for (const row of transition.variants) {
    assert.ok(Math.abs(row.arithmeticResidual) < 1e-9);
    assert.ok(Math.abs(row.reverseMarketStep+row.reverseCalibrationStep-row.totalChange) < 1e-9);
  }
  const forged = structuredClone(ledger); forged.records[0].score++;
  assert.throws(() => ledgerChangeDiagnostics(forged, protocol), /integrity/);
  const other = structuredClone(ledger); other.implementationHash = 'other-cohort';
  assert.throws(() => ledgerChangeDiagnostics(other, protocol), /mismatch/);
});

test('unavailable adjacent variant has no fabricated zero change', () => {
  const first = record(date), second = record('2026-09-12');
  const id = protocol.variants.at(-1).id;
  second.variantScores[id] = null; second.scoreInputs.parameters[id] = null;
  second.variantStatus[id] = { status: 'warming_up', trainingWeeks: 103 };
  second.inputHash = digest(second.scoreInputs);
  const result = ledgerChangeDiagnostics(append(append(null,first),second), protocol);
  assert.equal(result.transitions[0].variants.at(-1).totalChange, null);
});

test('all historical errors reconcile with frozen report and wrong caches/reports fail', () => {
  const p = structuredClone(protocol); p.evaluation.startDate = '2023-09-01';
  const cache = { schemaVersion: 'pressure-source-cache-v1', retrievedAt: date+'T12:00:00.000Z', series: sourceFixture() };
  const report = { schemaVersion: 'pressure-model-research-report-v1', protocolHash: digest(p), implementationHash: implementationHash(),
    sourceRetrievedAt: cache.retrievedAt, ...evaluateResearch(cache,p,date,rules) };
  const result = historicalErrorDiagnostics(cache,report,p,rules);
  assert.ok(result.matchedWeeks > 0);
  for (const benchmarks of Object.values(result.comparisons)) for (const comparison of Object.values(benchmarks)) {
    assert.equal(comparison.errors.length, comparison.metrics.confusion.fp+comparison.metrics.confusion.fn);
    assert.equal(comparison.episodes.reduce((sum,row)=>sum+row.weeks,0),comparison.errors.length);
    assert.equal(comparison.byLegacyCreditOrigin.historical.n+comparison.byLegacyCreditOrigin.proxy.n,comparison.metrics.n);
  }
  for (const row of Object.values(result.evidenceByDate)) for (const item of Object.values(row.legacy.inputDiagnostics)) {
    assert.ok(!Object.hasOwn(item,'value') && !Object.hasOwn(item,'effectiveValue'));
  }
  assert.throws(() => historicalErrorDiagnostics({...cache,retrievedAt:'2026-09-12T12:00:00.000Z'},report,p,rules), /identity/);
  const invalid = structuredClone(report); invalid.weeklyScores.equal_156.at(-1).score++;
  assert.throws(() => historicalErrorDiagnostics(cache,invalid,p,rules), /replay mismatch/);
});

test('diagnostics are offline, isolated from model identity and run after ledger preservation', () => {
  assert.throws(() => parseEvidenceArgs(['--allow-network','true']), /arguments/);
  assert.throws(() => parseEvidenceArgs(['--output-dir','data']), /ignored/);
  assert.throws(() => parseEvidenceArgs(['--ledger','manual-artifacts/main-score-audit/pressure-model/diagnostics/diagnostics.json']), /overwrite/);
  const root = path.resolve('manual-artifacts/main-score-audit/pressure-model');
  fs.mkdirSync(root, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(root, 'diagnostic-path-test-'));
  try {
    const linked = path.join(temporary, 'linked');
    fs.symlinkSync(path.join(temporary, 'absent-target'), linked, 'junction');
    assert.throws(() => parseEvidenceArgs(['--output-dir', linked]), /Linked output/);
  } finally {
    // Delete only the unique directory created by this test, never a supplied input.
    assert.ok(temporary.startsWith(root + path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const files = []; implementationHash(file => { files.push(file); return file; }, 'fixed-score');
  assert.ok(!files.some(file => file.includes('evidence-diagnostics') || file.includes('analyze-pressure-evidence')));
  assert.ok(!fs.readFileSync('scripts/research-pressure-model.mjs','utf8').includes('pressure-evidence'));
  const workflow = fs.readFileSync('.github/workflows/pressure-model-shadow.yml','utf8');
  assert.ok(workflow.indexOf('Retain derived report and cumulative ledger') < workflow.indexOf('node scripts/analyze-pressure-evidence.mjs'));
  assert.ok(workflow.includes('name: pressure-evidence-${{ github.run_id }}'));
});
