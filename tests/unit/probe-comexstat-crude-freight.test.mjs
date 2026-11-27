import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchComexFreight, normalizeComexFreight } from '../../tools/oil-directional/probe-comexstat-crude-freight.mjs';

const month = '2026-10';
const row = {
  coNcm: '27090010', year: '2026', monthNumber: '10', via: 'MARITIMA',
  country: 'United States', metricKG: '377946898', metricFreight: '17210143', metricInsurance: '52626',
};
const payload = (...list) => ({ success: true, data: { list } });
const normalize = (...list) => normalizeComexFreight(payload(...list), month);

test('October receipts use net mass and exclude insurance; missing origin is not a zero', () => {
  const output = normalize(row, { ...row, country: 'Nigeria', metricKG: '216034000', metricFreight: '12337158' });
  assert.equal(output.month, month);
  assert.equal(output.destination, 'Brazil');
  assert.deepEqual(output.rows.map(({ origin, usdPerNetTonne }) => [origin, usdPerNetTonne]), [['Nigeria', 57.11], ['United States', 45.54]]);
});

test('reported zero total is preserved but is not a confirmed zero unit rate', () => {
  assert.deepEqual(normalize({ ...row, metricFreight: '0' }).rows[0], {
    origin: 'United States', netKg: 377946898, freightUsd: 0, usdPerNetTonne: null,
  });
});

for (const [key, bad] of [
  ['monthNumber', '09'], ['coNcm', '27090090'], ['via', 'AEREA'], ['country', ' '],
  ['metricKG', '0'], ['metricFreight', '17,210,143'], ['metricFreight', undefined], ['metricFreight', '9007199254740992'],
]) {
  test(`rejects wrong ${key}: ${String(bad)}`, () => assert.throws(() => normalize({ ...row, [key]: bad })));
}

test('rejects duplicate origins and absent rows or source failure', () => {
  assert.throws(() => normalize(row, { ...row, country: ' United States ' }));
  assert.throws(() => normalize());
  assert.throws(() => normalizeComexFreight({ ...payload(row), success: false }, month));
});

test('a single query has exact monthly filter and no auth or redirect', async () => {
  let calls = 0;
  const output = await fetchComexFreight(month, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api-comexstat.mdic.gov.br/general?language=en');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.keys(options.headers).sort(), ['accept', 'content-type']);
    assert.deepEqual(JSON.parse(options.body), {
      flow: 'import', monthDetail: true, period: { from: month, to: month },
      filters: [{ filter: 'ncm', values: ['27090010'] }, { filter: 'via', values: ['01'] }],
      details: ['country', 'via', 'ncm'], metrics: ['metricKG', 'metricFreight'],
    });
    return Response.json(payload(row));
  });
  assert.equal(calls, 1);
  assert.equal(output.rows[0].usdPerNetTonne, 45.54);
});

test('invalid month causes zero requests; HTTP failures are not retried', async () => {
  let calls = 0;
  const respond = async () => { calls++; return new Response('unavailable', { status: 503 }); };
  await assert.rejects(fetchComexFreight('2026-13', respond), /Expected YYYY-MM/);
  assert.equal(calls, 0);
  await assert.rejects(fetchComexFreight(month, respond), /unavailable/);
  assert.equal(calls, 1);
});

test('wrong content type and oversized payload are refused', async () => {
  await assert.rejects(fetchComexFreight(month, async () => new Response('<html>')), /unavailable/);
  await assert.rejects(fetchComexFreight(month, async () => new Response(new Uint8Array(128_001), {
    headers: { 'content-type': 'application/json' },
  })), /exceeds/);
});
