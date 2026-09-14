import test from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_SERIES, parseCreditCsv, validateCreditPoints, collectCreditSpreads } from '../../scripts/bubble-watch/credit-spreads.mjs';

const now = new Date('2026-09-14T10:00:00Z');
const points = Array.from({ length: 260 }, (_, i) => ({ date: new Date(Date.UTC(2025, 8, 16) + Math.floor(i * 360 / 259) * 86400000).toISOString().slice(0, 10), bps: 270 + i % 5 }));
const csv = id => `observation_date,${id}\n${points.map(p => `${p.date},${(p.bps / 100).toFixed(2)}`).join('\n')}`;
const previous = { series: Object.fromEntries(Object.keys(CREDIT_SERIES).map(k => [k, points])), sources: Object.fromEntries(Object.keys(CREDIT_SERIES).map(k => [k, { fetchedAt: '2026-09-13T10:00:00Z' }])) };

test('FRED percent converts to bp; blank/missing observations never become zero', () => {
  assert.deepEqual(parseCreditCsv(csv(CREDIT_SERIES.hy) + '\n2026-09-12,\n2026-09-13,.', CREDIT_SERIES.hy, now), points);
  assert.throws(() => parseCreditCsv(csv(CREDIT_SERIES.hy).replace('2.70', 'oops'), CREDIT_SERIES.hy, now));
  assert.throws(() => parseCreditCsv(csv(CREDIT_SERIES.hy), CREDIT_SERIES.ig, now));
});
test('Reject future, impossible, duplicate, descending dates and null/non-finite values', () => {
  for (const patch of [{ date: '2026-09-15' }, { date: '2026-02-30' }, { date: points[1].date }, { bps: null }, { bps: NaN }, { bps: -1 }]) {
    const bad = structuredClone(points); bad[0] = { ...bad[0], ...patch };
    assert.throws(() => validateCreditPoints(bad, now));
  }
  assert.throws(() => validateCreditPoints([...points].reverse(), now));
  assert.throws(() => parseCreditCsv(`observation_date,${CREDIT_SERIES.hy}\n${points.slice(-10).map(p => `${p.date},2.7`).join('\n')}`, CREDIT_SERIES.hy, now));
});
test('Collect independent series without scoring fields, use bounded requests', async () => {
  let calls = 0;
  const result = await collectCreditSpreads({ now, fetchImpl: async (url, options) => { calls++; assert.ok(options.signal); return { ok: true, text: async () => csv(new URL(url).searchParams.get('id')) }; } });
  assert.equal(calls, 3); assert.equal(result.boundary, 'display_only_no_score_impact');
  assert.deepEqual(result.series.hy, points); assert.equal(result.sources.ig.status, 'fresh');
  assert.equal(result.summary, undefined); assert.equal(result.indicators, undefined);
});
test('One outage preserves that series and original fetch timestamp; others update', async () => {
  const result = await collectCreditSpreads({ previous, now, fetchImpl: async url => {
    const id = new URL(url).searchParams.get('id'); if (id === CREDIT_SERIES.ccc) throw Error('private response must not escape');
    return { ok: true, text: async () => csv(id) };
  } });
  assert.equal(result.sources.ccc.status, 'fallback'); assert.equal(result.sources.hy.status, 'fresh');
  assert.equal(result.sources.ccc.fetchedAt, previous.sources.ccc.fetchedAt); assert.deepEqual(result.series.ccc, points);
  assert.ok(!JSON.stringify(result).includes('private response'));
});
test('Absent or invalid historical data stays missing on outage', async () => {
  const result = await collectCreditSpreads({ previous: { series: { hy: [{ date: 'bad', bps: 0 }] } }, now, fetchImpl: async () => ({ ok: false }) });
  for (const key of Object.keys(CREDIT_SERIES)) { assert.equal(result.sources[key].status, 'missing'); assert.deepEqual(result.series[key], []); }
});
test('Successful HTTP cannot hide stale observations or regress newer cached dates', async () => {
  const stale = await collectCreditSpreads({ now: new Date('2026-10-01'), fetchImpl: async url => ({ ok: true, text: async () => csv(new URL(url).searchParams.get('id')) }) });
  assert.equal(stale.sources.hy.status, 'stale');
  const newer = structuredClone(previous); newer.series.hy.at(-1).date = '2026-09-14';
  const result = await collectCreditSpreads({ previous: newer, now, fetchImpl: async url => ({ ok: true, text: async () => csv(new URL(url).searchParams.get('id')) }) });
  assert.equal(result.sources.hy.status, 'fallback'); assert.equal(result.series.hy.at(-1).date, '2026-09-14');
});
