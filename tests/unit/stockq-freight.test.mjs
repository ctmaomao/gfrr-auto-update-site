import test from 'node:test';
import assert from 'node:assert/strict';
import { isUsableFreightCache, parseStockqFreight } from '../../scripts/daily/stockq-freight.mjs';
import { normalizePreviousShippingFreight, combineShippingFreightResults } from '../../scripts/run-daily-pipeline.mjs';

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
