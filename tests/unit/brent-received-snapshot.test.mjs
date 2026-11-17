import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyBrentReceivedSnapshot as verify } from '../../scripts/oil-directional/brent-received-snapshot.mjs';
function fixture(csv = 'observation_date,DCOILBRENTEU\r\n2026-10-01,77.125\r\n2026-10-02,\r\n2026-11-16,.\r\n') {
  const bytes = Buffer.from(csv), expectedUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd=2026-10-01&coed=2026-11-16';
  return { bytes, plan: { expectedUrl, seriesId: 'DCOILBRENTEU', startDate: '2026-10-01', endDate: '2026-11-16', maxBytes: 4096, maxRows: 64, frozenAtUTC: '2026-11-17T00:59:00.000Z' },
    receipt: { url: expectedUrl, status: 200, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      fetchStartedAtUTC: '2026-11-17T01:00:00.000Z', receivedAtUTC: '2026-11-17T01:00:01.000Z' }, snapshotReadAtUTC: '2026-11-17T01:00:02.000Z' };
}
test('raw receipt matches; all missing slots retained and public whitelist exposes no prices or raw body', () => {
  const f = fixture(), original = Buffer.from(f.bytes), out = verify(f);
  assert.deepEqual(f.bytes, original); assert.equal(out.privateResearch.rows.length, 3);
  assert.deepEqual(out.privateResearch.rows.map(r => r.value), [77.125, null, null]);
  assert.equal(out.publicSummary.numericCount, 1); assert.equal(out.publicSummary.missingCount, 2);
  assert.equal(out.publicSummary.purpose, 'posterior_snapshot_candidate_only');
  for (const obj of [out.privateResearch, out.publicSummary]) {
    for (const key of ['inputAuthenticityVerified', 'quoteCalendarCompletenessVerified', 'historicalFeatureEligible', 'historicalLabelAvailabilityVerified', 'sourceInitialVersionVerified', 'eligibleForV2Fit', 'eligibleForEvaluation', 'eligibleForPublicProbability', 'eligibleForMainScore']) assert.equal(obj[key], false);
  }
  const encoded = JSON.stringify(out.publicSummary);
  for (const forbidden of ['77.125', 'rows', 'value', 'csv', 'expectedUrl']) assert.ok(!encoded.includes(forbidden));
});
test('plan/receipt series, URL, size and exact byte hash are strict rather than authentication claims', () => {
  for (const edit of [f => { f.receipt.sha256 = '0'.repeat(64); }, f => { f.receipt.bytes++; }, f => { f.receipt.status = 302; },
    f => { f.plan.seriesId = 'DCOILWTICO'; }, f => { f.plan.startDate = '2026-09-01'; },
    f => { f.plan.expectedUrl += '&id=DCOILWTICO'; f.receipt.url = f.plan.expectedUrl; },
    f => { f.receipt.url = 'https://example.invalid/'; }, f => { f.plan.maxBytes = 1; }, f => { f.plan.maxRows = 2; },
    f => { f.receipt.extra = 'not permitted'; }]) { const f = fixture(); edit(f); assert.throws(() => verify(f)); }
});
test('started <= received <= read is required; invalid calendars and timezone shorthand rejected', () => {
  for (const [field, value] of [['fetchStartedAtUTC', '2026-11-17T01:00:03.000Z'], ['receivedAtUTC', '2026-11-17T01:00:03.000Z'],
    ['receivedAtUTC', '2026-02-30T01:00:00.000Z'], ['receivedAtUTC', '2026-11-17T01:00:01']]) {
    const f = fixture(); f.receipt[field] = value; assert.throws(() => verify(f));
  }
  for (const frozen of ['2026-11-17T01:00:00.000Z', '2026-11-17T01:00:01.000Z']) {
    const f = fixture(); f.plan.frozenAtUTC = frozen; assert.throws(() => verify(f));
  }
  const f = fixture(); f.snapshotReadAtUTC = f.receipt.receivedAtUTC; assert.ok(verify(f));
});
test('unique ascending real dates in fixed range; no sorting, duplicate removal or invented calendar completeness', () => {
  for (const body of ['2026-09-30,70', '2026-11-17,70', '2026-10-32,70', '2026-10-02,70\n2026-10-01,71',
    '2026-10-01,70\n2026-10-01,70', '2026-10-01,70\n\n2026-10-02,71']) assert.throws(() => verify(fixture(`DATE,DCOILBRENTEU\n${body}`)));
  const out = verify(fixture('DATE,DCOILBRENTEU\n2026-10-05,7.1e1\n2026-11-13,72'));
  assert.equal(out.publicSummary.rowCount, 2); assert.equal(out.publicSummary.quoteCalendarCompletenessVerified, false);
});
test('only positive finite prices or explicit missing fields; malformed UTF8/CSV/schema is rejected', () => {
  for (const raw of ['0', '-1', 'NaN', 'Infinity', '1e999', 'true', '[]', ' ', '"70"', '70,71']) assert.throws(() => verify(fixture(`DATE,DCOILBRENTEU\n2026-10-01,${raw}`)));
  for (const csv of ['DATE,DCOILWTICO\n2026-10-01,70', '\ufeffDATE,DCOILBRENTEU\n2026-10-01,70', 'DATE,DCOILBRENTEU\n']) assert.throws(() => verify(fixture(csv)));
  const f = fixture(); f.bytes = Buffer.from([0xff]); f.receipt.bytes = 1; f.receipt.sha256 = createHash('sha256').update(f.bytes).digest('hex');
  assert.throws(() => verify(f));
});
