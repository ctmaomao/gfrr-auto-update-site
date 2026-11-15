import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
test('live collector retains distinct source dates, while failed source keeps its own old date', async () => {
  for (const failedReal of [false, true]) {
    const context = { ...base, normalizePreviousConsumerRetail: normalize,
      fetchFredSeries: async id => {
        if (id === 'CARTSR' && failedReal) throw new Error('source unavailable');
        return [{ value: 1000, date: id === 'CARTS' ? '2026-10-28' : '2026-10-21' }];
      },
      fetchBofaConsumerCheckpoint: async () => ({}), fetchTradingEconomicsRedbookIndex: async () => ({ redbookRetailSalesDate: '2026-11-07T00:00:00Z' }),
      latestValue: rows => rows.at(-1).value, averageRecentValues: () => 1000, calculateWeeklyYoY: () => 0,
      latestDateIso: rows => `${rows.at(-1).date}T00:00:00Z`, fredMillionsToBillions: x => x / 1000,
      calculateRetailSegmentSnapshot: () => ({ segments: [] }), latestIsoDate: (...dates) => dates.filter(Boolean).sort().at(-1) };
    const resolve = vm.runInNewContext(`${extract('consumerRetailObservationIso')}\n${extract('resolveConsumerRetail')}\nresolveConsumerRetail`, context);
    const result = await resolve({ cartsReal: 0, cartsRealUpdatedAt: '2026-10-14T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' });
    assert.equal(result.cartsNominalUpdatedAt, '2026-10-28T00:00:00Z');
    assert.equal(result.cartsRealUpdatedAt, failedReal ? '2026-10-14T00:00:00Z' : '2026-10-21T00:00:00Z');
    assert.equal(result.sourceStatus.cartsr, failedReal ? 'fallback' : 'live');
    assert.equal(result.updatedAt, '2026-11-07T00:00:00Z');
  }
});
