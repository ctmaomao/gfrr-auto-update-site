import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMacroOverviewRenderVm } from '../helpers/macro-overview-render-vm.mjs';

const { api, elementFor } = await createMacroOverviewRenderVm([
  'renderC4UsEconomyTemperature', 'employmentBasketDisplay',
]);

const fixture = {
  industryPayrollMethod: 'custom-overlapping-11-series-mom-v1',
  industryPayrollDiffusionPct: 63.6, industryPayrollPositiveCount: 7, industryPayrollSeriesCount: 11,
  industryPayrollUpdatedAt: '2026-10-01T00:00:00Z', industryDiffusionRegime: '温和扩张',
  sourceStatus: { industryPayroll: 'live' },
};
const now = Date.parse('2026-11-17T00:00:00Z');
const display = (patch = {}) => api.employmentBasketDisplay({ ...fixture, ...patch }, now);
test('complete basket shows positive-series share and actual observation month', () => {
  assert.equal(display().value, '63.6%（7/11 序列）');
  assert.equal(display().period, '2026-10 观察 · 本次获取');
  const fallback = display({ sourceStatus: { industryPayroll: 'fallback' }, updatedAt: '2026-11-17T00:00:00Z' });
  assert.equal(fallback.period, '2026-10 观察 · 沿用旧值');
  assert.equal(fallback.live, false);
});
test('zero is valid, unchanged is not half-weighted, and input is immutable', () => {
  assert.equal(display({ industryPayrollDiffusionPct: 0, industryPayrollPositiveCount: 0 }).value, '0.0%（0/11 序列）');
  assert.equal(display({ industryPayrollDiffusionPct: 100, industryPayrollPositiveCount: 11 }).value, '100.0%（11/11 序列）');
  const before = JSON.stringify(fixture); display(); assert.equal(JSON.stringify(fixture), before);
});
test('legacy, partial, mismatched, malformed and future baskets remain unverified', () => {
  const patches = [
    { industryPayrollMethod: undefined }, { industryPayrollMethod: 'other' },
    { industryPayrollSeriesCount: 10 }, { industryPayrollPositiveCount: 7.5 },
    { industryPayrollPositiveCount: -1 }, { industryPayrollPositiveCount: 12 },
    { industryPayrollDiffusionPct: 64 }, { industryPayrollDiffusionPct: null },
    { industryPayrollDiffusionPct: '63.6' }, { industryPayrollDiffusionPct: NaN },
    { industryPayrollUpdatedAt: null }, { industryPayrollUpdatedAt: '2026-02-30T00:00:00Z' },
    { industryPayrollUpdatedAt: '2026-10-02T00:00:00Z' }, { industryPayrollUpdatedAt: '2026-12-01T00:00:00Z' },
    { sourceStatus: { industryPayroll: 'missing' } }, { sourceStatus: {} },
  ];
  for (const patch of patches) { assert.equal(display(patch).value, '—'); assert.equal(display(patch).live, false); }
  assert.equal(display({ industryPayrollMethod: undefined }).period, '旧快照，周期未核验');
});
test('actual renderer clears a previous basket and never uses broad expansion labels', () => {
  const render = employment => api.renderC4UsEconomyTemperature({ radarData: { macroDrivers: { employment } } });
  render(fixture);
  assert.equal(elementFor('c4-employment-diffusion').textContent, '63.6%（7/11 序列）');
  assert.equal(elementFor('c4-employment-regime').textContent, '2026-10 观察 · 本次获取');
  render({ ...fixture, sourceStatus: { industryPayroll: 'fallback' } });
  assert.equal(elementFor('c4-employment-regime').textContent, '2026-10 观察 · 沿用旧值');
  assert.equal(elementFor('c4-employment-status').className, 'status-bar pending');
  render({ ...fixture, industryPayrollMethod: undefined });
  assert.equal(elementFor('c4-employment-diffusion').textContent, '—');
  assert.equal(elementFor('c4-employment-regime').textContent, '旧快照，周期未核验');
  api.renderC4UsEconomyTemperature({ radarData: null });
  assert.equal(elementFor('c4-employment-diffusion').textContent, '—');
});
test('static card explains nested equal-series proxy without fabricated values', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const card = html.slice(html.indexOf('id="card-c4-employment"'), html.indexOf('</article>', html.indexOf('id="card-c4-employment"')));
  assert.match(card, /自定义篮子上涨占比/);
  assert.match(card, /status-bar pending/);
  assert.match(card, /badge pending/);
  assert.match(card, /持平不计上涨/);
  assert.match(card, /零售嵌套于贸易、运输与公用事业/);
  assert.match(card, /并非独立行业广度或美国劳工统计局扩散指数/);
  assert.match(card, /id="c4-employment-diffusion">—/);
  assert.doesNotMatch(card, /11 行业扩张占比|行业扩散度/);
});
