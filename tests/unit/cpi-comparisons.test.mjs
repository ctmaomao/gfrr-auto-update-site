import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cpiComparisons, cachedCpiComparisons } from '../../scripts/daily/cpi-comparisons.mjs';
const row = (date, value) => ({ date, value });
const config = { indexField: 'headlineIndex', yoyField: 'headlineYoY', momField: 'headlineMoM' };
const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
const names = ['normalizePreviousInflationCpiSeries', 'buildMissingInflationCpiSeries', 'buildInflationCpiSeries',
  'buildInflationCpi', 'latestIsoDate', 'pickInflationEnergyStatus'];
const bodies = names.map(name => { const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0); return source.slice(start, source.indexOf('\n}', start) + 2); });
const pipeline = vm.runInNewContext(`${bodies.join('\n')}\n({${names.join(',')}})`, {
  cpiComparisons, cachedCpiComparisons, INFLATION_CPI_SOURCE: 'FRED:CPIAUCSL; FRED:CPILFESL',
  INFLATION_ENERGY_STATUS_RANK: { live: 0, fallback: 1, stale: 2, missing: 3 }
});
const live = rows => pipeline.buildInflationCpiSeries({ status: 'fulfilled', value: rows }, null, config);
const good = [row('2025-09-01', 100), row('2026-08-01', 110), row('2026-09-01', 120)];
const previous = result => pipeline.buildInflationCpi(result, result);
test('CPI missing annual calendar month does not borrow either adjacent month', () => {
  const result = live([row('2025-08-01', 100), row('2025-10-01', 110), row('2026-09-01', 120)]);
  assert.equal(result.index, 120); assert.equal(result.yoy, null); assert.equal(result.mom, null);
  assert.equal(result.status, 'live');
});
test('normal CPI calculations retain rounding and independent monthly comparison', () => {
  const result = live(good); assert.equal(result.yoy, .2); assert.equal(result.mom, .0909);
  const missingYear = live(good.slice(1)); assert.equal(missingYear.yoy, null); assert.equal(missingYear.mom, .0909);
  const missingMonth = live([good[0], good[2]]); assert.equal(missingMonth.yoy, .2); assert.equal(missingMonth.mom, null);
});
test('leap and year boundaries use calendar months; true zero growth is retained', () => {
  const leap = live([row('2023-03-01', 100), row('2024-02-01', 100), row('2024-03-01', 100)]);
  assert.equal(leap.yoy, 0); assert.equal(leap.mom, 0);
  assert.equal(live([row('2025-12-01', 100), row('2026-01-01', 110)]).mom, .1);
  const zeroBase = live([row('2025-09-01', 0), row('2026-08-01', 0), row('2026-09-01', 0)]);
  assert.equal(zeroBase.index, 0); assert.equal(zeroBase.yoy, null); assert.equal(zeroBase.mom, null);
  assert.equal(live([row('2026-08-01', 100), row('2026-09-01', 0)]).mom, -1);
});
test('ambiguous, invalid and out-of-order source periods cannot produce comparisons', () => {
  for (const rows of [[], null, [...good, row('2026-09-15', 125)], [good[2], good[0]],
    [row('2026-02-30', 100)], [row('bad', 100)], [row('2026-09-01', null)]]) {
    assert.equal(cpiComparisons(rows), null);
  }
  for (const value of [null, false, '', '100', [], {}]) {
    assert.equal(live([row('2025-09-01', value), good[2]]).yoy, null);
  }
});
test('verified cached ratios recompute and retain their own observation date', () => {
  const old = live(good); const newer = live([row('2025-10-01', 100), row('2026-09-01', 110), row('2026-10-01', 120)]);
  const combined = pipeline.buildInflationCpi(old, newer);
  assert.equal(combined.updatedAt, '2026-10-01T00:00:00Z');
  const result = pipeline.buildInflationCpiSeries({ status: 'rejected' }, combined, config);
  assert.equal(result.updatedAt, '2026-09-01T00:00:00Z'); assert.equal(result.status, 'fallback');
  assert.equal(result.yoy, .2); assert.equal(result.mom, .0909);
});
test('legacy cache keeps index only, without reviving unproven comparison or combined date', () => {
  const result = pipeline.buildInflationCpiSeries({ status: 'rejected' }, {
    headlineIndex: 120, headlineYoY: .0909, headlineMoM: .1, updatedAt: '2026-10-01T00:00:00Z'
  }, config);
  assert.equal(result.index, 120); assert.equal(result.yoy, null); assert.equal(result.mom, null);
  assert.equal(result.updatedAt, null); assert.equal(result.status, 'fallback');
  assert.equal(pipeline.buildInflationCpiSeries({ status: 'rejected' }, {}, config).status, 'missing');
});
test('modified or nonmatching cached comparison proof does not survive fallback', () => {
  for (const mutate of [p => { p.headlineYoY = .9; }, p => { p.headlineIndex = 121; },
    p => { p.headlineMoM = .5; }, p => { p.comparisonEvidence.headlineIndex.method = 'old'; },
    p => { p.comparisonEvidence.headlineIndex.yoyBase.date = '2025-08-01'; }]) {
    const p = structuredClone(previous(live(good))); mutate(p);
    assert.equal(cachedCpiComparisons(p, config), null);
    const result = pipeline.buildInflationCpiSeries({ status: 'rejected' }, p, config);
    assert.equal(result.yoy, null); assert.equal(result.mom, null);
  }
});
test('real CPI display block renders producer missing comparisons as unavailable, not zero or a false tone', () => {
  const render = fs.readFileSync(new URL('../../scripts/modules/renderMacroOverview.js', import.meta.url), 'utf8');
  const toneStart = render.indexOf('function cpiYoYTone(');
  const tone = render.slice(toneStart, render.indexOf('\n}', toneStart) + 2);
  const start = render.indexOf('      const cpiYoY = asNumber(inflationEnergy.cpi?.headlineYoY);');
  const end = render.indexOf('\n      const wtiPrice', start);
  assert.ok(start > 0 && end > start);
  const elements = {}, statuses = {};
  const context = vm.createContext({
    inflationEnergy: { cpi: previous(live([row('2025-10-01', 110), row('2026-09-01', 120)])) },
    asNumber: value => typeof value === 'number' && Number.isFinite(value) ? value : null,
    signedFixed: (value, decimals) => `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`,
    setLeafText: (id, value) => { elements[id] = value; },
    setIndicatorStatus: (id, badge, value) => { statuses[id] = value; }
  });
  vm.runInContext(tone + '\n' + render.slice(start, end), context);
  assert.equal(elements['c1-cpi-number'], '—');
  assert.equal(elements['c1-cpi-aux'], 'Core — · MoM —');
  assert.equal(statuses['c1-cpi-status'], 'pending');
});
