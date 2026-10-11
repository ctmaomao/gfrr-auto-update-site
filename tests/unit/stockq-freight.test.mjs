import test from 'node:test';
import assert from 'node:assert/strict';
import { isUsableFreightCache, parseStockqFreight } from '../../scripts/daily/stockq-freight.mjs';
import { normalizePreviousShippingFreight, combineShippingFreightResults, resolveShippingFreight } from '../../scripts/run-daily-pipeline.mjs';

const options = { nowMs: Date.parse('2026-09-05T07:00:00Z') };
const row = (date, value, change = '4.06%') => `<tr><td>${date}</td><td>${value}</td><td>${change}</td></tr>`;
const page = (rows, header = '<tr><td>Date</td><td>Index</td><td>Change%</td></tr>') => `<title>Baltic Dry index - StockQ.org</title><table>${header}${rows}</table>`;

test('StockQ dated quote binds value, percentage and date without dropping empty cells', () => {
  assert.deepEqual(parseStockqFreight(page(row('2026/09/04', '2,841.00')), 'BDI', options), {
    value: 2841, dailyChangePct: 0.0406, updatedAt: '2026-09-04T00:00:00.000Z'
  });
  const latest = parseStockqFreight(page(row('2026/09/03', '2700') + row('2026/09/04', '2841', '')), 'BDI', options);
  assert.equal(latest.value, 2841);
  assert.equal(latest.dailyChangePct, null);
});

test('StockQ rejects return tables, hidden latest cells and invalid identities/dates', () => {
  const returns = '<tr><td>4.06%</td><td>5.45%</td><td>4.06%</td></tr>';
  for (const rows of [returns, returns + row('2026/09/04', '<span class="sq-obfuscated" data-sq="redacted"></span>'),
    row('2026/09/04', '<span hidden>2800</span>'), row('2026/09/04', '<span data-sq="redacted">2800</span>'),
    row('2026/09/04', '4.06%'), row('2026/09/04', '') + row('2026/09/03', '2800'),
    row('2026/08/01', '2800'), row('2026/09/06', '2800'), row('2026/02/30', '2800'),
    row('2026/09/04', '0'), row('2026/09/04', '4.06'), row('2026/09/04', '1,23'),
    row('2026/09/04', '2800') + row('2026/09/04', '2900')]) {
    assert.throws(() => parseStockqFreight(page(rows), 'BDI', options));
  }
  assert.throws(() => parseStockqFreight(page(row('2026/09/04', '2800')), 'BDTI', options));
  assert.throws(() => parseStockqFreight(page('<tr><td>2026/09/04</td><td hidden>2841</td><td>4.06%</td></tr>'), 'BDI', options));
  assert.throws(() => parseStockqFreight(page(row('2026/09/04', '12345'), '<tr><td>Date</td><td>Volume</td><td>Return</td></tr>'), 'BDI', options));
  for (const rows of [row('2026/09/04', '2841', '4.06%') + row('2026/09/04', '2841', '-9%'),
    row('2026/09/04', '2841', '-9%') + row('2026/09/04', '2841', '4.06%')]) {
    assert.throws(() => parseStockqFreight(page(rows), 'BDI', options));
  }
  assert.equal(isUsableFreightCache(4, '2026-08-10T00:00:00Z', 0.04, options.nowMs), false);
  assert.equal(isUsableFreightCache(2841, null, 0.04, options.nowMs), false);
  assert.equal(isUsableFreightCache(2841, '2026-02-30T00:00:00Z', 0.04, options.nowMs), false);
  assert.equal(isUsableFreightCache(2841, '2026-09-06T00:00:00Z', 0.04, options.nowMs), false);
});

test('shipping fallback rejects the legacy percentage-as-index and does not mix change dates', async () => {
  const previous = { balticDryIndex: 4.06, balticDryDailyChangePct: 0.0406, balticDryUpdatedAt: '2026-08-10T00:00:00Z',
    balticDirtyTankerIndex: 2644, balticDirtyTankerDailyChangePct: 0.0049, balticDirtyTankerUpdatedAt: '2026-08-10T00:00:00Z' };
  const fallback = normalizePreviousShippingFreight(previous);
  assert.equal(fallback.balticDryIndex, null);
  assert.equal(fallback.balticDryDailyChangePct, null);
  assert.equal(fallback.sourceStatus.dryBulk, 'missing');
  assert.equal(fallback.balticDirtyTankerIndex, 2644);
  const failed = combineShippingFreightResults(previous, Array.from({ length: 3 }, () => ({ status: 'rejected' })));
  assert.equal(failed.balticDryIndex, null);
  assert.equal(failed.sourceStatus.dirtyTanker, 'fallback');
  const fresh = combineShippingFreightResults(previous, Array.from({ length: 3 }, () => ({ status: 'fulfilled', value: { value: 2800, dailyChangePct: null, updatedAt: '2026-09-04T00:00:00Z' } })));
  assert.equal(fresh.balticDirtyTankerDailyChangePct, null);
  assert.equal(fresh.sourceStatus.dryBulk, 'live');
});


test('public ticker cache keeps its origin and date through total outage and partial fallback', () => {
  const official = 'BalticExchangePublicTicker';
  const previous = { source: `${official}:BDTI; ${official}:BCTI; ${official}:BDI`,
    balticDirtyTankerIndex: 7964, balticDirtyTankerDailyChangePct: 0.014,
    balticDirtyTankerUpdatedAt: '2026-10-09T00:00:00Z',
    balticCleanTankerIndex: 2403, balticCleanTankerDailyChangePct: null,
    balticCleanTankerUpdatedAt: '2026-10-09T00:00:00Z',
    balticDryIndex: 2917, balticDryDailyChangePct: -0.018,
    balticDryUpdatedAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' };
  const failed = { status: 'rejected' };
  const cached = combineShippingFreightResults(previous, [failed, failed, failed]);
  assert.equal(cached.source, previous.source);
  assert.equal(cached.balticDirtyTankerUpdatedAt, previous.balticDirtyTankerUpdatedAt);
  assert.equal(cached.balticDryIndex, 2917);
  assert.deepEqual(cached.sourceStatus, { dirtyTanker: 'fallback', cleanTanker: 'fallback', dryBulk: 'fallback' });
  const mixed = combineShippingFreightResults(previous, [failed,
    { status: 'fulfilled', value: { provider: 'StockQ', value: 2400, dailyChangePct: null, updatedAt: '2026-10-10T00:00:00Z' } },
    { status: 'fulfilled', value: { provider: official, value: 2900, dailyChangePct: null, updatedAt: '2026-10-10T00:00:00Z' } }]);
  assert.equal(mixed.source, `${official}:BDTI; StockQ:BCTI; ${official}:BDI`);
  assert.equal(mixed.balticDirtyTankerUpdatedAt, previous.balticDirtyTankerUpdatedAt);
  assert.equal(mixed.balticCleanTankerDailyChangePct, null);
  assert.equal(mixed.sourceStatus.dirtyTanker, 'fallback');
  const invalid = normalizePreviousShippingFreight({ ...previous, source: 'Unknown:BDTI' });
  assert.equal(invalid.balticDryIndex, null);
  assert.equal(invalid.sourceStatus.dryBulk, 'missing');
});

test('Daily resolver performs one ticker read and only falls back for a missing index', async () => {
  const originalFetch = globalThis.fetch;
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const ticker = ['BDTI', 'BCTI', 'BDI'].map((symbol, i) => ({
    indexName: symbol, indexDataSetName: symbol,
    indexDataSetTitle: ['Baltic Dirty Tanker Index', 'Baltic Clean Tanker Index', 'Baltic Dry Index'][i],
    current: { value: [7964, 2403, 2917][i], indexDate: `${day}T16:00:00` },
  }));
  let omitClean = false;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url) === 'https://blacksun-api.balticexchange.com/api/ticker') {
      return new Response(JSON.stringify(omitClean ? ticker.filter(x => x.indexName !== 'BCTI') : ticker),
        { headers: { 'content-type': 'application/json' } });
    }
    assert.match(String(url), /BCTI/u);
    return new Response(`<title>Baltic Clean Tanker Index - StockQ</title><table><tr><td>Date</td><td>Index</td><td>Change%</td></tr><tr><td>${day.replaceAll('-', '/')}</td><td>2400</td><td></td></tr></table>`);
  };
  try {
    const fresh = await resolveShippingFreight(null);
    assert.equal(calls.length, 1);
    assert.equal(fresh.balticDryIndex, 2917);
    assert.equal(fresh.balticDryDailyChangePct, null);
    assert.deepEqual(fresh.sourceStatus, { dirtyTanker: 'live', cleanTanker: 'live', dryBulk: 'live' });
    calls.length = 0; omitClean = true;
    const mixed = await resolveShippingFreight(fresh);
    assert.equal(calls.length, 2);
    assert.equal(mixed.balticCleanTankerIndex, 2400);
    assert.equal(mixed.source, 'BalticExchangePublicTicker:BDTI; StockQ:BCTI; BalticExchangePublicTicker:BDI');
    assert.equal(mixed.balticCleanTankerUpdatedAt.slice(0, 10), day);
  } finally { globalThis.fetch = originalFetch; }
});
