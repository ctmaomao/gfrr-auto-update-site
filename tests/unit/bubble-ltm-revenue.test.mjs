import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifiedEdgarLtmRevenue, qualifiedMirrorLtmRevenue } from '../../scripts/bubble-watch/ltm-revenue.mjs';

// Synthetic fiscal disclosures, not historical market observations.
const today = '2026-11-02';
const row = (start, end, val, filed = '2026-08-25') => ({ start, end, val: val * 1e9, filed, form: '10-Q' });
const quarters = () => [row('2025-07-28', '2025-10-26', 50, '2025-11-20'),
  row('2025-10-27', '2026-01-25', 60, '2026-02-20'), row('2026-01-26', '2026-04-26', 70, '2026-05-20'),
  row('2026-04-27', '2026-07-26', 80)];

test('continuous four-quarter USD revenue preserves period dates and raw total', () => {
  const result = qualifiedEdgarLtmRevenue(quarters(), today);
  assert.equal(result.value, 260e9);
  assert.equal(result.observationDate, '2026-07-26');
  assert.equal(result.freshness.ageDays, 99);
  assert.equal(result.quarters.length, 4);
});

test('four short stub periods do not masquerade as a full trailing fiscal year', () => {
  const end = Date.parse('2026-07-26');
  const q = Array.from({ length: 4 }, (_, i) => ({
    start: new Date(end - ((3 - i) * 75 + 74) * 86400000).toISOString().slice(0, 10),
    end: new Date(end - (3 - i) * 75 * 86400000).toISOString().slice(0, 10),
    val: 50e9, filed: '2026-08-25', form: '10-Q'
  }));
  assert.throws(() => qualifiedEdgarLtmRevenue(q, today), /ltm_window/);
});

test('a newly filed old concept cannot become current revenue', () => {
  const old = quarters().map(q => ({ ...q, start: q.start.replace(/^202[56]/u, '2018'), end: q.end.replace(/^202[56]/u, '2018'), filed: today }));
  // Keep an internally consistent prior fiscal year to isolate age from gaps.
  const prior = quarters().map(q => ({ ...q, start: `${Number(q.start.slice(0, 4)) - 7}${q.start.slice(4)}`, end: `${Number(q.end.slice(0, 4)) - 7}${q.end.slice(4)}`, filed: today }));
  assert.throws(() => qualifiedEdgarLtmRevenue(prior, today), /stale/);
  assert.throws(() => qualifiedEdgarLtmRevenue(old, today));
});

test('latest missing value or absent quarter cannot be replaced by four older values', () => {
  assert.throws(() => qualifiedEdgarLtmRevenue([...quarters(), row('2026-07-27', '2026-10-25', null, '2026-11-01')].map(q => q.end === '2026-10-25' ? { ...q, val: null } : q), today));
  const q = quarters(); q.splice(1, 1);
  assert.throws(() => qualifiedEdgarLtmRevenue(q, today), /four_quarters/);
  const gap = quarters(); gap[2].start = '2026-01-27';
  assert.throws(() => qualifiedEdgarLtmRevenue(gap, today), /contiguous/);
});

test('cumulative YTD reports are differenced, never added as separate quarters', () => {
  const cumulative = [row('2025-01-27', '2025-10-26', 120, '2025-11-20'),
    { ...row('2025-01-27', '2026-01-25', 180, '2026-02-20'), form: '10-K' },
    row('2026-01-26', '2026-04-26', 70, '2026-05-20'), row('2026-01-26', '2026-07-26', 150),
    row('2026-01-26', '2026-10-25', 240, '2026-11-01')];
  const result = qualifiedEdgarLtmRevenue(cumulative, today);
  assert.deepEqual(result.quarters.map(q => q.value / 1e9), [60, 70, 80, 90]);
  assert.equal(result.value, 300e9);
});

test('latest amendments win; conflicting same-filing values fail closed', () => {
  const q = quarters();
  assert.equal(qualifiedEdgarLtmRevenue([...q, { ...q[3], val: 90e9, filed: '2026-10-01', form: '10-Q/A' }], today).value, 270e9);
  assert.throws(() => qualifiedEdgarLtmRevenue([...q, { ...q[3], val: 90e9 }], today), /conflict/);
});

test('future filings cannot affect the as-of prefix; invalid forms and missing filing clocks do not qualify', () => {
  const q = quarters();
  assert.deepEqual(qualifiedEdgarLtmRevenue([...q, row('2026-07-27', '2026-10-25', 900, '2026-11-03')], today), qualifiedEdgarLtmRevenue(q, today));
  for (const field of [{ form: '8-K' }, { filed: null }, { filed: '2026-02-30' }]) {
    assert.throws(() => qualifiedEdgarLtmRevenue(q.map(r => ({ ...r, ...field })), today));
  }
});

const dates = ['2026-07-26', '2026-04-26', '2026-01-25', '2025-10-26', '2025-07-27'];
const mirror = (values = ['80,000.5', '70,000', '60,000', '50,000', '40,000'], ds = dates) =>
  `<p>Financials in millions USD.</p><table><tr><th>Period Ending</th>${ds.map(d => `<th id="${d}">${d}</th>`).join('')}</tr><tr><td>Revenue</td>${values.map(v => `<td>${v}</td>`).join('')}</tr></table>`;
test('mirror keeps decimal millions, aligned dates, and exactly four latest quarters', () => {
  assert.equal(qualifiedMirrorLtmRevenue(mirror(), today).value, 260000.5e6);
  assert.equal(qualifiedMirrorLtmRevenue(mirror(), today).observationDate, dates[0]);
});
test('responsive mirror dates and hidden label measurement do not displace revenue columns', () => {
  // Synthetic amounts in the responsive header shape; not real issuer disclosures.
  const labels = ["Jul '26", "Apr '26", "Jan '26", "Oct '25", "Jul '25"];
  const full = ['Jul 26, 2026', 'Apr 26, 2026', 'Jan 25, 2026', 'Oct 26, 2025', 'Jul 27, 2025'];
  const html = `<p>Financials in millions USD.</p><table><tr><th>Period Ending</th>${full.map((d, i) => `<th><span class="inline sm:hidden">${labels[i]}</span> <span class="hidden sm:inline">${d}</span></th>`).join('')}</tr><tr><td><div>Revenue</div><div class="invisible" aria-hidden="true">Revenue Growth</div></td>${['80,000.5', '70,000', '60,000', '50,000', '40,000'].map(v => `<td>${v}</td>`).join('')}</tr></table>`;
  const result = qualifiedMirrorLtmRevenue(html, today);
  assert.equal(result.value, 260000.5e6); assert.equal(result.observationDate, '2026-07-26');
});
test('mirror rejects missing latest, undated, annual, stale, future and unknown-scale cells', () => {
  for (const html of [mirror(['-', '70000', '60000', '50000']), mirror().replace('millions USD', 'billions USD'),
    mirror().replaceAll('2026-07-26', 'pending'), mirror(undefined, ['2026-07-26', '2025-07-26', '2024-07-26', '2023-07-26']),
    mirror(undefined, dates.map(d => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`)),
    mirror(undefined, ['2026-11-03', ...dates.slice(1)])]) assert.throws(() => qualifiedMirrorLtmRevenue(html, today));
});

test('four mirror end dates cannot prove the first quarter start', () => {
  assert.throws(() => qualifiedMirrorLtmRevenue(mirror(['80000','70000','60000','50000'], dates.slice(0,4)), today));
});
