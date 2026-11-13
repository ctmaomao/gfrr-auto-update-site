import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketInputProvenance as build, validateMarketInputProvenance as validate } from '../../scripts/world-order/market-input-provenance.mjs';
import { buildMarketConfirmation, selectMarketConfirmationInput } from '../../scripts/world-order/build-market-confirmation.mjs';
const values = { gold: 3979, dxy: 121.8803 };
const details = { dxy: { ok: true, value: 121.8803, source: 'fred:DTWEXBGS', timestamp: '2026-11-06' } };
test('matched metadata preserves reported series and date without freshness or calibration claim', () => {
  const output = build(values, details);
  assert.deepEqual(output.dxy, { status: 'matched_metadata', source: 'fred:DTWEXBGS', reportedTimestamp: '2026-11-06', reportedFallbackUsed: null, reason: null, qualification: 'not_assessed' });
  assert.equal(output.gold.status, 'unknown');
  assert.equal(output.brent.reason, 'selected_value_missing');
  assert.equal(validate(output, values), true);
  // Old or future metadata is preserved as metadata, never promoted to a quote.
  for (const timestamp of ['2000-01-01', '2099-01-01']) assert.equal(build(values, { dxy: { ...details.dxy, timestamp } }).dxy.qualification, 'not_assessed');
});
test('mismatched, missing and malformed metadata never borrows a wrapper timestamp/source', () => {
  for (const patch of [{ ok: false }, { value: 100 }, { value: '121.8803' }, { value: null }, { source: '' }, { timestamp: null }, { timestamp: 'bad' }]) {
    const output = build(values, { dxy: { ...details.dxy, ...patch }, updatedAt: '2026-11-13' });
    assert.equal(output.dxy.status, 'unknown'); assert.equal(output.dxy.reportedTimestamp, null);
    assert.equal(validate(output, values), true);
  }
});
test('optional provenance cannot change legacy score or confidence', () => {
  const input = { source: 'local-realtime', ...values, brent: 100, vix: 30, hyOas: 4, spx: 7000 };
  assert.deepEqual(buildMarketConfirmation({ marketConfirmationInput: input }), buildMarketConfirmation({ marketConfirmationInput: { ...input, observationProvenance: build(input, details) } }));
});
test('validator rejects qualification promotion and malformed optional metadata', () => {
  for (const mutate of [x => { x.dxy.qualification = 'fresh'; }, x => { x.dxy.reportedTimestamp = 'bad'; }, x => { x.dxy.source = null; }, x => { delete x.gold; }, x => { x.gold.reason = 'fresh'; }, x => { x.extra = {}; }]) {
    const output = build(values, details); mutate(output); assert.throws(() => validate(output, values));
  }
});

test('selector preserves exact Worker/local provenance but never borrows it for Daily', async t => {
  const now = '2026-11-13T00:00:00Z';
  t.mock.method(Date, 'now', () => Date.parse(now));
  const input = { sourceMode: 'worker-generated-preview', updatedAt: now, healthScore: 100, criticalMissing: 0, values: { brent: 100, ...values }, sourceDetails: details };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(input)));
  assert.equal((await selectMarketConfirmationInput()).observationProvenance.dxy.status, 'matched_metadata');
  globalThis.fetch = async () => new Response('{}');
  assert.equal((await selectMarketConfirmationInput({ realtimePayload: { ...input, sourceMode: 'live' } })).observationProvenance.dxy.status, 'matched_metadata');
  const daily = await selectMarketConfirmationInput({ dataPayload: { updatedAt: now, displayInputsBaseline: input.values, sourceDetails: details } });
  assert.equal(daily.source, 'daily-baseline');
  assert.equal(daily.observationProvenance.dxy.status, 'unknown');
});
