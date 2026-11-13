import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { goldQuoteRows, sourceTimestampAgeSeconds } from '../../scripts/realtime/gold-quote.mjs';
const now = Date.parse('2026-11-13T12:00:00Z');
const quote = () => ({ price: 4000.25, updatedAt: '2026-11-12T23:59:30Z' });

test('gold preserves one provider acquisition timestamp, not today or a fabricated previous price', () => {
  assert.deepEqual(goldQuoteRows(quote(), now), [{ date: '2026-11-12T23:59:30Z', value: 4000.25 }]);
  assert.equal(goldQuoteRows({ ...quote(), price: '4000.25' }, now)[0].value, 4000.25);
  assert.equal(goldQuoteRows({ ...quote(), updatedAt: '2020-01-01T00:00:00Z' }, now)[0].date, '2020-01-01T00:00:00Z'); // dated old, never restamped
});

test('gold rejects null/blank/boolean/nonpositive prices and unverified clocks', () => {
  for (const price of [null, undefined, '', ' ', false, true, [], {}, NaN, Infinity, 0, -1]) assert.throws(() => goldQuoteRows({ ...quote(), price }, now));
  for (const updatedAt of [null, '', 'bad', '2026-02-30T00:00:00Z', '2026-11-13', '2099-01-01T00:00:00Z', 1794560000]) assert.throws(() => goldQuoteRows({ ...quote(), updatedAt }, now));
  assert.throws(() => goldQuoteRows({ price: 4000, timestamp: quote().updatedAt }, now));
  assert.equal(goldQuoteRows({ ...quote(), updatedAt: '2026-11-13T12:04:00Z' }, now).length, 1);
  assert.throws(() => goldQuoteRows({ ...quote(), updatedAt: '2026-11-13T12:06:00Z' }, now));
});

test('age seconds accepts both true FRED dates and full provider timestamps', () => {
  assert.equal(sourceTimestampAgeSeconds('2026-11-13', now), 43200);
  assert.equal(sourceTimestampAgeSeconds('2026-11-13T11:59:30Z', now), 30);
  assert.equal(sourceTimestampAgeSeconds('bad', now), null);
});

// Execute only the actual pure adapters; importing the realtime CLI would fetch/write.
const source = readFileSync(new URL('../../scripts/run-realtime.mjs', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const adapters = vm.runInNewContext([
  section('function latest(', 'function readPrev('),
  section('function normalizeLiveResult(', 'async function resolveMetric('),
  section('function buildSourceDetails(', 'function buildSourceStatus('),
  '({ normalizeLiveResult, normalizeFallbackResult, buildSourceDetails })'
].join('\n'), { sourceTimestampAgeSeconds: value => sourceTimestampAgeSeconds(value, now), stringifyError: error => String(error) });

test('actual realtime adapters emit null gold change and explicit timestamp semantics', () => {
  const live = adapters.normalizeLiveResult('gold', { kind: 'goldapi', source: 'goldapi:XAU' }, goldQuoteRows(quote(), now), { critical: false });
  assert.equal(live.change, null); assert.equal(live.timestamp, quote().updatedAt);
  assert.equal(live.timestampKind, 'provider_acquisition'); assert.equal(live.ageSeconds, 43230);
  assert.equal(adapters.buildSourceDetails([live]).gold.timestampKind, 'provider_acquisition');
  const fred = adapters.normalizeLiveResult('dxy', { kind: 'fred', source: 'fred:DTWEXBGS' }, [{date:'2026-11-12',value:120},{date:'2026-11-13',value:121}], { critical: true });
  assert.equal(fred.change, 1); assert.equal(fred.timestampKind, 'observation_date'); assert.equal(fred.ageSeconds, 43200);
  const fallback = adapters.normalizeFallbackResult('gold', { source: 'goldapi:XAU' }, { values: { gold: 4000 }, changes: { gold1d: 0 }, sourceDetails: { gold: { timestamp: quote().updatedAt, timestampKind: 'provider_acquisition' } } }, false, 'offline');
  assert.equal(fallback.change, null); assert.equal(fallback.timestampKind, 'provider_acquisition'); assert.equal(fallback.timestamp, quote().updatedAt);
  const legacy = adapters.normalizeFallbackResult('gold', { source: 'goldapi:XAU' }, { values: { gold: 4000 }, lastSuccessAt: quote().updatedAt }, false, 'offline');
  assert.equal(legacy.timestampKind, 'snapshot_acquisition');
});

test('gold live fetch is wired to the strict adapter; promotion does not inherit FRED timestamp semantics', () => {
  assert.match(source, /return goldQuoteRows\(JSON.parse\(text\)\)/);
  assert.doesNotMatch(section("if (descriptor.kind === 'goldapi')", 'const rows = parseStooqCsv'), /const today|value: Number\(json.price\)/);
  assert.match(source, /timestamp: brentPromotion.selectedObservedAt,\s+timestampKind: 'reported_candidate_time'/);
});
