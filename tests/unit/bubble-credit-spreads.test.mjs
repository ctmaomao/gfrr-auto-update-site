import test from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_SERIES, parseCreditCsv, validateCreditPoints, collectCreditSpreads, creditPublicationEnabled } from '../../scripts/bubble-watch/credit-spreads.mjs';

test('Publication requires explicit enablement and recorded owner decision', () => {
  for (const publicationRights of ['owner_confirmed', 'owner_risk_accepted']) {
    assert.equal(creditPublicationEnabled({ enabled: true, publicationRights }), true);
    assert.equal(creditPublicationEnabled({ enabled: false, publicationRights }), false);
  }
  for (const config of [undefined, {}, { enabled: true }, { enabled: true, publicationRights: 'pending_owner_confirmation' }]) assert.equal(creditPublicationEnabled(config), false);
});

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
  const result = await collectCreditSpreads({ now, fetchImpl: async (url, options) => { calls++; assert.ok(options.signal); assert.equal(options.redirect, 'error'); return new Response(csv(new URL(url).searchParams.get('id'))); } });
  assert.equal(calls, 3); assert.equal(result.boundary, 'display_only_no_score_impact');
  assert.deepEqual(result.series.hy, points); assert.equal(result.sources.ig.status, 'fresh');
  assert.equal(result.summary, undefined); assert.equal(result.indicators, undefined);
});
test('One outage preserves that series and original fetch timestamp; others update', async () => {
  const result = await collectCreditSpreads({ previous, now, fetchImpl: async url => {
    const id = new URL(url).searchParams.get('id'); if (id === CREDIT_SERIES.ccc) throw Error('private response must not escape');
    return new Response(csv(id));
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
  const stale = await collectCreditSpreads({ now: new Date('2026-10-01'), fetchImpl: async url => new Response(csv(new URL(url).searchParams.get('id'))) });
  assert.equal(stale.sources.hy.status, 'stale');
  const newer = structuredClone(previous); newer.series.hy.at(-1).date = '2026-09-14';
  const result = await collectCreditSpreads({ previous: newer, now, fetchImpl: async url => new Response(csv(new URL(url).searchParams.get('id'))) });
  assert.equal(result.sources.hy.status, 'fallback'); assert.equal(result.series.hy.at(-1).date, '2026-09-14');
});

test('FRED accepts DATE, CRLF and BOM variants but rejects extra or missing columns', () => {
  const id = CREDIT_SERIES.hy;
  const valid = '\uFEFF' + csv(id).replace('observation_date', 'DATE').replaceAll('\n', '\r\n') + '\r\n';
  assert.deepEqual(parseCreditCsv(valid, id, now), points);
  const genuineZero = csv(id).replace('2.70', '0.00');
  assert.equal(parseCreditCsv(genuineZero, id, now)[0].bps, 0);
  for (const malformed of [
    csv(id).replace(id + '\n', id + ',unknown\n'),
    csv(id).replace(',2.70', ',2.70,999'),
    csv(id) + '\n2026-09-13',
    csv(id) + '\n2026-09-13,.,private'
  ]) assert.throws(() => parseCreditCsv(malformed, id, now), /credit_csv_(?:header|row)_invalid/u);
});


test('Oversized, redirected and malformed UTF-8 responses never become fresh; no retries', async () => {
  const badBuffers = [
    () => new Response(csv(CREDIT_SERIES.hy), { headers: { 'content-length': '65537' } }),
    () => new Response(new Uint8Array(65537), { headers: { 'content-length': '1' } }),
    () => new Response(Uint8Array.of(0xff)),
    () => Response.redirect('https://example.invalid/'),
    () => {
      const response = new Response(csv(CREDIT_SERIES.hy));
      Object.defineProperty(response, 'url', { value: 'https://example.invalid/' });
      return response;
    },
    () => new Response(csv(CREDIT_SERIES.hy).replace('2.70', '2.70,999'))
  ];
  for (const badBody of badBuffers) {
    const hits = [];
    const result = await collectCreditSpreads({ previous, now, fetchImpl: async (url, options) => {
      const id = new URL(url).searchParams.get('id');
      hits.push(id);
      assert.equal(options.redirect, 'error');
      return id === CREDIT_SERIES.hy ? badBody() : new Response(csv(id));
    } });
    assert.deepEqual(hits.sort(), Object.values(CREDIT_SERIES).sort());
    assert.equal(result.sources.hy.status, 'fallback');
    assert.equal(result.sources.hy.fetchedAt, previous.sources.hy.fetchedAt);
    assert.deepEqual(result.series.hy, points);
    assert.equal(result.sources.ccc.status, 'fresh');
    assert.equal(result.sources.ig.status, 'fresh');
    assert.ok(!JSON.stringify(result).includes('example.invalid'));
  }
});

test('Per-series deadline includes both headers and a stalled body; cancels and preserves source clocks', async () => {
  let bodyCancelled = false;
  const signals = [];
  const result = await collectCreditSpreads({ now, previous, timeoutMs: 50, fetchImpl: async (url, { signal }) => {
    signals.push(signal);
    const id = new URL(url).searchParams.get('id');
    if (id === CREDIT_SERIES.hy) return new Promise(() => {});
    if (id === CREDIT_SERIES.ccc) return new Response(new ReadableStream({
      cancel() { bodyCancelled = true; }
    }));
    return new Response(csv(id));
  } });
  assert.equal(signals.length, 3);
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(bodyCancelled, true);
  for (const key of ['hy', 'ccc']) {
    assert.equal(result.sources[key].status, 'fallback');
    assert.equal(result.sources[key].fetchedAt, previous.sources[key].fetchedAt);
    assert.equal(result.sources[key].observationDate, points.at(-1).date);
  }
  assert.equal(result.sources.ig.status, 'fresh');
});

test('Byte cap accepts exactly 64 KiB and refuses excess bytes across chunks', async () => {
  let cancelled = false;
  const fetchImpl = async (url) => {
    const id = new URL(url).searchParams.get('id');
    const body = Buffer.from(csv(id));
    const padding = new Uint8Array(65536 - body.length).fill(10);
    return new Response(new ReadableStream({
      start(c) {
        c.enqueue(body);
        c.enqueue(padding);
        if (id === CREDIT_SERIES.ccc) c.enqueue(Uint8Array.of(10));
        else c.close();
      },
      cancel() { cancelled = true; }
    }));
  };
  const result = await collectCreditSpreads({ now, previous, fetchImpl });
  assert.equal(result.sources.hy.status, 'fresh');
  assert.equal(result.sources.ccc.status, 'fallback');
  assert.equal(result.sources.ig.status, 'fresh');
  assert.equal(cancelled, true);
  let calls = 0;
  const invalid = await collectCreditSpreads({ now, previous, timeoutMs: 12001, fetchImpl: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.ok(Object.values(invalid.sources).every(source => source.status === 'fallback'));
});

test('Credit display serialization follows registry order, not delivery order', async () => {
  const keys = Object.keys(CREDIT_SERIES);
  const run = order => {
    const pending = {};
    const result = collectCreditSpreads({ previous, now, fetchImpl: url => {
      const id = new URL(url).searchParams.get('id');
      return new Promise((resolve, reject) => {
        pending[id] = () => id === CREDIT_SERIES.ccc ? reject(new Error('fixture refusal')) : resolve(new Response(csv(id)));
      });
    } });
    return (async () => {
      for (const key of order) {
        pending[CREDIT_SERIES[key]]();
        await new Promise(resolve => setImmediate(resolve));
      }
      return result;
    })();
  };
  const a = await run(keys);
  const b = await run([...keys].reverse());
  assert.equal(a.sources.ccc.status, 'fallback');
  assert.equal(b.sources.ig.status, 'fresh');
  for (const data of [a, b]) {
    assert.deepEqual(Object.keys(data.series), keys);
    assert.deepEqual(Object.keys(data.sources), keys);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
