import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cartsCalendarComparisons } from '../../scripts/daily/carts-calendar.mjs';
import { parseObservationDate } from '../../scripts/daily/source-observation.mjs';

const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
function extract(name) {
  const expression = new RegExp(`(?:async )?function ${name}\\(`);
  const start = source.search(expression);
  const rest = source.slice(start + 10);
  const next = /\n(?:export )?(?:async )?function /.exec(rest);
  assert.ok(start >= 0 && next);
  return source.slice(start, start + 10 + next.index);
}
const isoNow = '2026-11-12T09:00:00Z';
const base = { isoNow, parseObservationDate, CONSUMER_RETAIL_SOURCE: 'test', CONSUMER_RETAIL_SEGMENT_SERIES: [],
  classifyRetailSegmentRegime: () => '未知', classifyRetailRegime: () => '未知' };
const normalize = vm.runInNewContext(`${extract('consumerRetailObservationIso')}\n${extract('buildMissingConsumerRetail')}\n${extract('normalizePreviousConsumerRetail')}\nnormalizePreviousConsumerRetail`, base);

test('legacy aggregate dates never become CARTS observation dates on fallback', () => {
  const result = normalize({ cartsNominal: 12, cartsReal: 10, updatedAt: '2026-11-07T00:00:00Z' });
  assert.equal(result.cartsNominal, 12);
  assert.equal(result.cartsNominalUpdatedAt, null);
  assert.equal(result.cartsRealUpdatedAt, null);
  assert.equal(result.sourceStatus.carts, 'fallback');
});
test('fallback preserves each valid source date, rejecting malformed or future observations', () => {
  const previous = { cartsNominal: 12, cartsReal: 10, cartsNominalUpdatedAt: '2026-10-21T00:00:00Z', cartsRealUpdatedAt: '2026-10-28T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z' };
  let result = normalize(previous);
  assert.equal(result.cartsNominalUpdatedAt, previous.cartsNominalUpdatedAt);
  assert.equal(result.cartsRealUpdatedAt, previous.cartsRealUpdatedAt);
  for (const invalid of ['2026-02-30T00:00:00Z', '2099-01-01T00:00:00Z', null, undefined]) {
    result = normalize({ ...previous, cartsNominalUpdatedAt: invalid });
    assert.equal(result.cartsNominalUpdatedAt, null);
    assert.equal(result.cartsRealUpdatedAt, previous.cartsRealUpdatedAt);
  }
});
function retailResolver(fetchFredSeries) {
  const context = { ...base, normalizePreviousConsumerRetail: normalize, fetchFredSeries, cartsCalendarComparisons,
    fetchBofaConsumerCheckpoint: async () => ({}),
    fetchTradingEconomicsRedbookIndex: async () => ({ redbookRetailSalesDate: '2026-11-07T00:00:00Z' }),
    calculateRetailSegmentSnapshot: () => ({ segments: [] }),
    latestIsoDate: (...dates) => dates.filter(Boolean).sort().at(-1) };
  const helpers = ['consumerRetailObservationIso', 'latestValue', 'latestDateIso', 'fredMillionsToBillions'];
  return vm.runInNewContext(`${helpers.map(extract).join('\n')}\n${extract('resolveConsumerRetail')}\nresolveConsumerRetail`, context);
}
const row = (date, value) => ({ date, value });
const nominalRows = [
  row('2025-10-07', 1250), row('2025-10-14', 500), row('2025-10-21', 800),
  row('2026-09-21', 4040), row('2026-09-28', 2000), row('2026-10-07', 3000), row('2026-10-14', 1000)
];

test('live collector retains distinct source dates, while failed source keeps its own old date and no unproved comparisons', async () => {
  for (const failedReal of [false, true]) {
    const resolve = retailResolver(async id => {
      if (id === 'CARTSR' && failedReal) throw new Error('source unavailable');
      return id === 'CARTS' ? nominalRows : [row('2026-10-21', 1100)];
    });
    const result = await resolve({ cartsReal: 0, cartsReal4wAverage: 55, cartsRealYoY: 0.9,
      cartsRealUpdatedAt: '2026-10-14T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' });
    assert.equal(result.cartsNominalUpdatedAt, '2026-10-14T00:00:00Z');
    assert.equal(result.cartsNominalYoY, 1);
    assert.equal(result.cartsNominal4wAverage, 2.51);
    assert.equal(result.cartsRealUpdatedAt, failedReal ? '2026-10-14T00:00:00Z' : '2026-10-21T00:00:00Z');
    assert.equal(result.cartsReal, failedReal ? 0 : 1.1);
    assert.equal(result.cartsRealYoY, null);
    assert.equal(result.cartsReal4wAverage, null);
    assert.equal(result.sourceStatus.cartsr, failedReal ? 'fallback' : 'live');
    assert.equal(result.updatedAt, '2026-11-07T00:00:00Z');
  }
});
test('missing CARTS calendar slots do not borrow adjacent observations for the mean or YoY', async () => {
  const tables = [
    nominalRows.filter(r => r.date !== '2025-10-14' && r.date !== '2026-09-28'),
    [...nominalRows.slice(0, 2), row('2025-10-14', 250), ...nominalRows.slice(2)],
    nominalRows.map(r => r.date === '2026-09-28' ? row(r.date, null) : r),
    nominalRows.map(r => r.date === '2026-10-14' ? row('2026-10-15', r.value) : r)
  ];
  for (const [i, rows] of tables.entries()) {
    const result = await retailResolver(async () => rows)(null);
    assert.equal(result.cartsNominal, 1);
    assert.equal(result.cartsNominalYoY, i === 2 ? 1 : null);
    assert.equal(result.cartsNominal4wAverage, i === 1 ? 2.51 : null);
  }
});

test('CARTS year boundary, legitimate zero, invalid current and ambiguous slots', () => {
  const rows = [row('2025-01-07', 4), row('2025-12-14', 10), row('2025-12-21', 20),
    row('2025-12-28', 30), row('2026-01-07', 0)];
  assert.deepEqual(cartsCalendarComparisons(rows, isoNow), { average: 15, yoy: -1 });
  assert.deepEqual(cartsCalendarComparisons([...rows, rows.at(-1)], isoNow), { average: null, yoy: null });
  assert.deepEqual(cartsCalendarComparisons([...rows.slice(0, -1), row('2026-01-07', -1)], isoNow), { average: null, yoy: null });
  assert.deepEqual(cartsCalendarComparisons(rows, '2026-01-06T23:59:59Z'), { average: null, yoy: null });
  assert.deepEqual(cartsCalendarComparisons([row('2025-01-07', 0), ...rows.slice(1)], isoNow), { average: 15, yoy: null });
  assert.deepEqual(cartsCalendarComparisons([], isoNow), { average: null, yoy: null });
});
