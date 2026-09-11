import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deriveRisk } from '../../scripts/run-daily-pipeline.mjs';
import { calendarScoreChanges } from '../../scripts/daily/score-change.mjs';
import { scoreDecompositionText, buildMacroOverviewVerdictBody } from '../../scripts/modules/macroOverviewNarrative.js';

const { snapshots } = JSON.parse(readFileSync(new URL('../fixtures/score-transition/september-2026.json', import.meta.url), 'utf8'));

test('recorded production inputs replay 45 to base 53 plus tail floor 15, without changing the formula', () => {
  const before = JSON.stringify(snapshots);
  for (const item of snapshots) {
    const risk = deriveRisk(item.rt, item.macroDrivers);
    assert.equal(risk.score, item.expected.score);
    assert.deepEqual(risk.modules, item.expected.modules);
    assert.equal(risk.tailRiskOverlay.baseScore, item.expected.baseScore);
    assert.equal(risk.tailRiskOverlay.scoreAdd, item.expected.tailAdd);
  }
  assert.equal(JSON.stringify(snapshots), before);
});

test('the recorded current rate confirmation and oil threshold explain the discontinuity', () => {
  const item = snapshots[1];
  const scoreAt = price => deriveRisk({ ...item.rt, values: { ...item.rt.values, brent: price } }, item.macroDrivers);
  assert.equal(scoreAt(102.24).tailRiskOverlay.applied, false);
  assert.equal(scoreAt(102.25).tailRiskOverlay.applied, true);
  assert.equal(scoreAt(102.25).score, 68);
  const risk = scoreAt(109.51);
  assert.equal(risk.oilRisk, 99);
  assert.equal(risk.inflationRisk, 75);
  assert.equal(risk.rateRisk, 51);
  assert.equal(risk.vixRisk, 31);
  assert.equal(risk.transportShockScoringImpact.contributionPct, 0);
});

test('missing daily run cannot turn the previous published snapshot into a one-day change', () => {
  const history = [{ date: '2026-09-03', score: 47 }, { date: '2026-09-04', score: 48 },
    { date: '2026-09-09', score: 45 }, { date: '2026-09-11', score: 68 }];
  const before = JSON.stringify(history);
  assert.deepEqual(calendarScoreChanges(history, '2026-09-11', 68), {
    scoreChange1d: null, scoreChange7d: 20, scoreChange30d: null
  });
  assert.deepEqual(calendarScoreChanges(history.toReversed(), '2026-09-11', 68), calendarScoreChanges(history, '2026-09-11', 68));
  assert.equal(JSON.stringify(history), before);
});

test('calendar windows include leap-day, exact 30-day distance, real zero and unknown data', () => {
  const rows = [{ date: '2024-02-29', score: 0 }, { date: '2024-02-23', score: 40 }, { date: '2024-01-31', score: 30 }];
  assert.deepEqual(calendarScoreChanges(rows, '2024-03-01', 50), { scoreChange1d: 50, scoreChange7d: 10, scoreChange30d: 20 });
  assert.equal(calendarScoreChanges([...rows, rows[0]], '2024-03-01', 50).scoreChange1d, null);
  for (const score of [null, '', '45', NaN, 101]) assert.equal(calendarScoreChanges(rows, '2024-03-01', score).scoreChange1d, null);
  assert.equal(calendarScoreChanges([{ date: '2024-02-30', score: 0 }], '2024-03-02', 50).scoreChange1d, null);
  assert.equal(calendarScoreChanges(rows, 'invalid', 50).scoreChange7d, null);
  assert.equal(calendarScoreChanges([{ date: '2024-02-29', score: null }], '2024-03-01', 50).scoreChange1d, null);
});

function displayData() {
  const item = snapshots[1];
  const risk = deriveRisk(item.rt, item.macroDrivers);
  return { updatedAt: item.updatedAt, ...risk, displayInputsBaseline: item.rt.values,
    macroDrivers: item.macroDrivers, scoreChange7d: 20,
    brentPricingLayer: { selectedBrent: { source: 'fred:DCOILBRENTEU', value: 109.51 },
      publicSpotProxy: { value: 109.51, observedAt: '2026-09-09' } } };
}

test('verdict discloses base versus floor and the actual oil observation date; World Order is separate', () => {
  const data = displayData();
  const before = JSON.stringify(data);
  const body = buildMacroOverviewVerdictBody({ radarData: data, worldOrderStressData: { score: 68 } });
  assert.match(body, /模型综合分 68/u);
  assert.match(body, /六模块基础分 53/u);
  assert.match(body, /尾部风险规则升档 \+15 至 68/u);
  assert.match(body, /不代表市场已经见顶/u);
  assert.match(body, /世界秩序压力 68.*不加到综合分/u);
  assert.match(body, /现货观测日 2026-09-09/u);
  assert.doesNotMatch(body, /原始风险分/u);
  assert.equal(JSON.stringify(data), before);
});

test('display does not reconstruct missing or contradictory score breakdowns', () => {
  assert.equal(scoreDecompositionText({ score: 68 }), '分数组成待确认。');
  for (const mutate of [
    data => { data.tailRiskOverlay.baseScore = null; },
    data => { data.tailRiskOverlay.scoreAdd = 0; },
    data => { data.score = 70; },
    data => { data.transportShockScoringImpact.contributionPct = 9; }
  ]) {
    const data = displayData(); mutate(data);
    assert.equal(scoreDecompositionText(data), '分数组成待确认。');
  }
  const data = displayData(); data.scoreChange7d = null;
  assert.match(buildMacroOverviewVerdictBody({ radarData: data }), /周变化待确认/u);
});

test('spot date requires matching source and value, valid calendar date and no future observation', () => {
  for (const mutate of [
    data => { data.brentPricingLayer.selectedBrent.source = 'yahoo'; },
    data => { data.brentPricingLayer.selectedBrent.value = 100; },
    data => { data.brentPricingLayer.publicSpotProxy.value = 100; },
    data => { data.brentPricingLayer.publicSpotProxy.observedAt = '2026-02-30'; },
    data => { data.brentPricingLayer.publicSpotProxy.observedAt = '2099-01-01'; }
  ]) {
    const data = displayData(); mutate(data);
    assert.doesNotMatch(buildMacroOverviewVerdictBody({ radarData: data }), /现货观测日/u);
  }
});

test('Daily producer calls the calendar helper instead of positional score offsets', () => {
  const source = readFileSync('scripts/run-daily-pipeline.mjs', 'utf8');
  assert.match(source, /calendarScoreChanges\(history, isoNow\.slice\(0, 10\), risk\.score\)/u);
  assert.doesNotMatch(source, /risk\.score - history\[history\.length - (?:2|8)\]\.score/u);
});

test('existing production validator accepts unknown comparisons without weakening any assertion', () => {
  const originalBytes = readFileSync('data/radar-data.json');
  const data = JSON.parse(originalBytes);
  Object.assign(data, calendarScoreChanges([], data.updatedAt.slice(0, 10), data.score));
  data.timeDimension.scoreChange30d = null;
  const child = `
    import fs from 'node:fs'; import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    const payload = fs.readFileSync(0, 'utf8'); const read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      return typeof file === 'string' && path.resolve(file) === path.resolve('data/radar-data.json')
        ? payload : read.call(this, file, ...args);
    };
    syncBuiltinESMExports(); await import('./scripts/validate-data.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
    input: JSON.stringify(data), encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 5000000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(readFileSync('data/radar-data.json'), originalBytes);
});
