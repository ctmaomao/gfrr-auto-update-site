import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBalticTicker, fetchBalticFreight, BALTIC_TICKER_URL } from '../../scripts/daily/baltic-freight.mjs';

const nowMs = Date.parse('2026-10-11T04:00:00Z');
const payload = () => ['BDTI', 'BCTI', 'BDI'].map((symbol, i) => ({
  indexName: symbol, indexDataSetName: symbol,
  indexDataSetTitle: ['Baltic Dirty Tanker Index', 'Baltic Clean Tanker Index', 'Baltic Dry Index'][i],
  current: { value: [7964, 2403, 2917][i], indexDate: '2026-10-09T16:02:47' },
  previous: { value: [7852, 2385, 2973][i], indexDate: '2026-10-08T16:04:36' },
}));
const options = { nowMs };

test('publisher-shaped snapshot binds all three exact indices to original observation days and changes', () => {
  const result = parseBalticTicker(payload(), options);
  assert(result.every(leg => leg.status === 'fulfilled'));
  assert.deepEqual(result.map(leg => leg.value.value), [7964, 2403, 2917]);
  assert.equal(result[0].value.dailyChangePct, 7964 / 7852 - 1);
  assert.equal(result[2].value.dailyChangePct, 2917 / 2973 - 1);
  for (const leg of result) {
    assert.equal(leg.value.updatedAt, '2026-10-09T00:00:00.000Z');
    assert.equal(leg.value.provider, 'BalticExchangePublicTicker');
  }
});

test('one missing, duplicated or invalid index never contaminates another leg', () => {
  for (const mutate of [p => p.shift(), p => p.push(p[0]), p => { p[0].indexName = 'TD3C'; },
    p => { p[0].indexDataSetTitle = 'Other'; }, p => { p[0].current.value = 0; },
    p => { p[0].current.value = '7964'; }, p => { p[0].current.value = 4.06; }]) {
    const p = payload(); mutate(p);
    const result = parseBalticTicker(p, options);
    assert.equal(result[0].status, 'rejected');
    assert.equal(result[1].status, 'fulfilled');
    assert.equal(result[2].status, 'fulfilled');
  }
});

test('stale/future/impossible observations reject; exact seven-day bound is retained', () => {
  for (const date of ['2026-10-12T16:00:00', '2026-09-30T16:00:00', '2026-02-30T16:00:00',
    '2026-10-09T25:00:00', '2026-10-09', 'not-a-date']) {
    const p = payload(); p[0].current.indexDate = date;
    assert.equal(parseBalticTicker(p, options)[0].status, 'rejected');
  }
  const boundary = Date.parse('2026-10-16T00:00:00Z');
  assert.equal(parseBalticTicker(payload(), { nowMs: boundary })[0].status, 'fulfilled');
  assert.equal(parseBalticTicker(payload(), { nowMs: boundary + 1 })[0].status, 'rejected');
  assert.throws(() => parseBalticTicker({}, options), /baltic_payload_invalid/u);
  assert.throws(() => parseBalticTicker(payload(), { nowMs: NaN }), /baltic_payload_invalid/u);
});

test('bad/missing/same-day/remote previous observations produce null, never stale changes', () => {
  for (const previous of [null, { value: 0, indexDate: '2026-10-08T16:00:00' },
    { value: 7852, indexDate: '2026-10-09T16:00:00' },
    { value: 7852, indexDate: '2026-10-10T16:00:00' },
    { value: 7852, indexDate: '2026-09-01T16:00:00' },
    { value: 7852, indexDate: '2026-02-30T16:00:00' },
    { value: 1, indexDate: '2026-10-08T16:00:00' }]) {
    const p = payload(); p[0].previous = previous;
    const leg = parseBalticTicker(p, options)[0];
    assert.equal(leg.status, 'fulfilled');
    assert.equal(leg.value.dailyChangePct, null);
  }
});

test('network uses one fixed public GET, redirect error, bounded response and no retry', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++; assert.equal(url, BALTIC_TICKER_URL); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Accept, 'application/json');
    return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } });
  };
  assert((await fetchBalticFreight({ fetchImpl, nowMs })).every(x => x.status === 'fulfilled'));
  assert.equal(calls, 1);
  for (const response of [new Response('private raw body', { status: 429 }),
    new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('[]', { headers: { 'content-type': 'application/json', 'content-length': '65537' } }),
    new Response(' '.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    new Response('bad-json', { headers: { 'content-type': 'application/json' } })]) {
    let attempt = 0;
    await assert.rejects(fetchBalticFreight({ fetchImpl: async () => { attempt++; return response; }, nowMs }),
      /^Error: baltic_(?:http_unavailable|content_invalid|response_too_large|fetch_invalid)$/u);
    assert.equal(attempt, 1);
  }
});

test('timeout cancels pending fetch; unknown errors are redacted', async () => {
  let calls = 0;
  await assert.rejects(fetchBalticFreight({ timeoutMs: 15, nowMs,
    fetchImpl: (_, { signal }) => { calls++; return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('private response')), { once: true });
    }); } }), /baltic_timeout/u);
  assert.equal(calls, 1);
  await assert.rejects(fetchBalticFreight({ fetchImpl: async () => { throw new Error('secret?q=private'); }, nowMs }),
    /^Error: baltic_fetch_invalid$/u);
});

test('timeout also cancels a stalled response body after headers arrive', async () => {
  let calls = 0;
  await assert.rejects(fetchBalticFreight({ timeoutMs: 15, nowMs,
    fetchImpl: async (_, { signal }) => {
      calls++;
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error('private body')), { once: true });
      } }), { headers: { 'content-type': 'application/json' } });
    } }), /^Error: baltic_timeout$/u);
  assert.equal(calls, 1);
});
