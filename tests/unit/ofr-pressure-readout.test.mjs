import test from 'node:test';
import assert from 'node:assert/strict';
import { OFR_COLUMNS, OFR_CSV_URL, OFR_LIMITS, parseOfrCsv, buildOfrReadout, ofrHistoricalPercentile, compareOfrSnapshots, fetchOfrSnapshot, rawSha256, strictOfrDate } from '../../scripts/daily/ofr-pressure-readout.mjs';

// Synthetic unit fixtures only; never published as observed market data.
const line = (date, value) => [date, value, 0, 0, 0, 0, 0, 0, 0, 0].join(',');
const csv = (...lines) => OFR_COLUMNS.join(',') + '\n' + lines.join('\n') + '\n';
const receipt = { asOf: '2026-11-01T12:00:00Z', retrievedAt: '2026-11-01T11:59:00Z', snapshotSha256: 'a'.repeat(64) };
const rows = () => parseOfrCsv(csv(line('2026-10-21', -0.5), line('2026-10-28', -1)));
const dailyHistory = () => Array.from({ length: 4000 }, (_, i) => ({ date: new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10), value: (i % 11) - 5 }));

test('strict dates reject rollover, non-date strings and future-shaped invalid day', () => {
  assert.equal(strictOfrDate('2024-02-29'), true);
  for (const value of ['2025-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z', null]) assert.equal(strictOfrDate(value), false);
});
test('raw negative index and genuine zero survive unchanged', () => {
  assert.deepEqual(parseOfrCsv(csv(line('2026-10-27', -2.5), line('2026-10-28', 0))).map(r => r.value), [-2.5, 0]);
});
test('BOM, CRLF and quoted schema remain valid', () => {
  const input = '\uFEFF' + OFR_COLUMNS.map(c => `"${c}"`).join(',') + '\r\n' + line('2026-10-28', -1.2) + '\r\n';
  assert.equal(parseOfrCsv(input)[0].value, -1.2);
});
test('schema drift is rejected, including swapped columns', () => {
  assert.throws(() => parseOfrCsv(csv(line('2026-10-28', 1)).replace('Credit,Equity valuation', 'Equity valuation,Credit')), /schema/);
});
test('missing total and contribution remain null rather than zero', () => {
  for (const missing of ['', '.', 'NA', 'N/A', 'null']) assert.equal(parseOfrCsv(csv(line('2026-10-28', missing)))[0].value, null);
});
test('invalid numeric forms, infinity, booleans and currency text fail closed', () => {
  for (const value of ['Infinity', 'NaN', 'true', '$1', '1x']) assert.throws(() => parseOfrCsv(csv(line('2026-10-28', value))), /numeric|Nonfinite/);
});
test('duplicate, reversed, invalid-date and missing-column rows are rejected', () => {
  for (const input of [csv(line('2026-10-28', 0), line('2026-10-28', 1)), csv(line('2026-10-28', 0), line('2026-10-27', 1)), csv(line('2026-02-30', 0)), OFR_COLUMNS.join(',') + '\n2026-10-28,1\n']) assert.throws(() => parseOfrCsv(input));
});
test('unclosed and malformed quoted CSV never become usable observations', () => {
  assert.throws(() => parseOfrCsv(csv(line('2026-10-28', '"1'))), /CSV/);
  assert.throws(() => parseOfrCsv(csv(line('2026-10-28', '1"'))), /CSV/);
});
test('blank input and excessive parser bytes are rejected', () => {
  assert.throws(() => parseOfrCsv(''));
  assert.throws(() => parseOfrCsv(' '.repeat(OFR_LIMITS.maxBytes + 1)), /size/);
});
test('readout uses official raw index and dated delta without any score or tier', () => {
  const result = buildOfrReadout(rows(), receipt);
  assert.equal(result.index.value, -1); assert.equal(result.status, 'available');
  assert.equal(result.relativeToAverage, 'below_historical_average');
  assert.equal(result.weeklyChange.value, -0.5); assert.equal(result.weeklyChange.fromDate, '2026-10-21');
  assert.equal(result.productionEligible, false); assert.equal(result.boundaries.decisionMapping, null);
  assert.equal(Object.hasOwn(result, 'score'), false); assert.equal(result.boundaries.tailFloorAdded, false);
});
test('index zero means at average, not missing or a crisis probability', () => {
  const result = buildOfrReadout(parseOfrCsv(csv(line('2026-10-28', 0))), receipt);
  assert.equal(result.index.value, 0); assert.equal(result.relativeToAverage, 'at_historical_average');
  assert.equal(result.boundaries.calibratedProbability, false);
});
test('latest missing total does not silently choose older valid total as current', () => {
  const result = buildOfrReadout(parseOfrCsv(csv(line('2026-10-21', 2), line('2026-10-28', 'NA'))), receipt);
  assert.equal(result.status, 'missing_current'); assert.equal(result.index.value, null);
  assert.deepEqual(result.lastKnown, { value: 2, observedDate: '2026-10-21' });
});
test('aged observation is preserved and explicitly stale despite a fresh receipt', () => {
  const result = buildOfrReadout(rows(), { ...receipt, asOf: '2026-11-06T00:00:00Z', retrievedAt: '2026-11-06T00:00:00Z' });
  assert.equal(result.status, 'stale'); assert.equal(result.index.ageDays, 9); assert.equal(result.index.value, -1);
});
test('future receipt or source observation fails closed', () => {
  assert.throws(() => buildOfrReadout(rows(), { ...receipt, retrievedAt: '2026-11-02T00:00:00Z' }), /receipt/);
  assert.throws(() => buildOfrReadout(parseOfrCsv(csv(line('2026-11-02', 1))), receipt), /Future/);
});
test('invalid clock/date/hash cannot grant source freshness', () => {
  for (const asOf of ['2026-02-30T00:00:00Z', '2026-11-01T25:00:00Z', '2026-11-01T00:00:00', 'yesterday']) assert.throws(() => buildOfrReadout(rows(), { ...receipt, asOf }));
  assert.throws(() => buildOfrReadout(rows(), { ...receipt, snapshotSha256: 'fake' }));
});
test('weekly delta needs a finite, sufficiently close prior observation', () => {
  for (const earlier of [line('2026-10-01', 1), line('2026-10-21', 'NA')]) assert.equal(buildOfrReadout(parseOfrCsv(csv(earlier, line('2026-10-28', 2))), receipt).weeklyChange.value, null);
});
test('percentile excludes future and current observations and uses midrank ties', () => {
  const data = [{ date: '2026-10-20', value: 1 }, { date: '2026-10-21', value: 2 }, { date: '2026-10-22', value: 2 }, { date: '2026-10-23', value: 3 }, { date: '2026-10-24', value: 2 }];
  const p = ofrHistoricalPercentile(data, '2026-10-24', { years: null, minimumRows: 2 });
  assert.equal(p.value, 50); assert.equal(p.historyRows, 4);
  assert.deepEqual(ofrHistoricalPercentile([...data, { date: '2026-10-25', value: 999 }], '2026-10-24', { years: null, minimumRows: 2 }), p);
});
test('short, sparse or late-starting history yields null percentile, raw remains usable', () => {
  const result = buildOfrReadout(rows(), receipt); assert.equal(result.percentile.value, null); assert.equal(result.index.value, -1);
  const sparse = [{ date: '2016-10-28', value: 1 }, { date: '2026-10-21', value: 1 }, { date: '2026-10-28', value: 1 }];
  assert.ok(ofrHistoricalPercentile(sparse, '2026-10-28', { minimumRows: 2 }).reasons.includes('history_gap_exceeds_14_days'));
});
test('full ten-year history gives bounded percentile without a classification', () => {
  const data = dailyHistory(), current = data.at(-1).date, p = ofrHistoricalPercentile(data, current);
  assert.equal(p.reasons.length, 0); assert.ok(p.value >= 0 && p.value <= 100); assert.ok(p.historyRows > 3600);
});
test('February29 prior-window boundary clamps to February28', () => {
  const data = [{ date: '2014-02-28', value: 1 }, { date: '2024-02-29', value: 2 }];
  assert.equal(ofrHistoricalPercentile(data, '2024-02-29', { minimumRows: 2 }).startDate, '2014-02-28');
});
test('percentile prefix is stable under appended later observations', () => {
  const data = dailyHistory(), index = 3700, p = ofrHistoricalPercentile(data, data[index].date);
  assert.deepEqual(ofrHistoricalPercentile(data.slice(0, index + 1), data[index].date), p);
});
test('snapshot revisions distinguish numeric changes from null/zero availability', () => {
  const previous = [{ date: '2026-10-20', value: null }, { date: '2026-10-21', value: 1 }, { date: '2026-10-22', value: 2 }];
  const result = compareOfrSnapshots(previous, [{ date: '2026-10-20', value: 0 }, { date: '2026-10-21', value: 2 }]);
  assert.deepEqual(result.changes.map(r => r.kind), ['availability_change', 'numeric_revision']);
  assert.deepEqual(result.priorDatesNotReturned, ['2026-10-22']); assert.equal(previous[0].value, null);
});
const fixedClock = () => '2026-11-01T12:00:00.000Z';
test('bounded source success is exactly one official request and no side-effecting writer', async () => {
  let count = 0;
  const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async (url, options) => { count++; assert.equal(url, OFR_CSV_URL); assert.equal(options.redirect, 'error'); assert.ok(options.signal); return new Response(csv(line('2026-10-28', -1))); } });
  assert.equal(count, 1); assert.equal(result.receipt.status, 'received'); assert.equal(result.readout.index.value, -1);
  assert.equal(result.receipt.rawSha256, rawSha256(result.raw)); assert.equal(result.readout.productionEligible, false);
});
test('HTTP429, HTTP500, redirect and transport failures never retry or produce a readout', async () => {
  for (const status of [302, 429, 500]) {
    let count = 0; const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async () => { count++; return new Response('', { status }); } });
    assert.equal(count, 1); assert.equal(result.readout, null); assert.equal(result.receipt.status, 'fetch_failed');
  }
  let count = 0;const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async () => { count++; throw new Error('network'); } });assert.equal(count, 1);assert.equal(result.rows, null);
});
test('malformed200 is isolated with parse failure and original raw hash', async () => {
  const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async () => new Response('<html>not data</html>') });
  assert.equal(result.receipt.status, 'parse_failed'); assert.equal(result.readout, null); assert.equal(result.receipt.rawSha256, rawSha256(result.raw));
});
test('streamed byte overflow stops without parse or retry', async () => {
  let count = 0;const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async () => { count++; return new Response(new Uint8Array(OFR_LIMITS.maxBytes + 1)); } });
  assert.equal(count, 1);assert.equal(result.readout, null);assert.match(result.receipt.error, /size/);
});
test('source dates after receipt are parse failures, not fresh future readings', async () => {
  const result = await fetchOfrSnapshot({ clock: fixedClock, fetchImpl: async () => new Response(csv(line('2026-11-02', 1))) });
  assert.equal(result.receipt.status, 'parse_failed');assert.equal(result.readout, null);
});
