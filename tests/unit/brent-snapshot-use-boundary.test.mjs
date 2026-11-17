import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewBrentSnapshotUse as review } from '../../scripts/oil-directional/brent-snapshot-use-boundary.mjs';
const purposes = ['feature_at_origin', 'training_label_at_origin', 'posterior_evaluation_label_candidate'];
function fixture(purpose = purposes[0], originUTC = '2026-11-16T00:00:00.000Z') {
  const bytes = Buffer.from('observation_date,DCOILBRENTEU\n2026-10-01,77.125\n2026-11-16,.\n');
  const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd=2026-10-01&coed=2026-11-16';
  return { purpose, originUTC, useAtUTC: '2026-11-18T00:00:00.000Z', snapshot: { bytes,
    plan: { expectedUrl: url, seriesId: 'DCOILBRENTEU', startDate: '2026-10-01', endDate: '2026-11-16', maxBytes: 4096, maxRows: 47, frozenAtUTC: '2026-11-17T01:00:00.000Z' },
    receipt: { url, status: 200, fetchStartedAtUTC: '2026-11-17T01:00:01.000Z', receivedAtUTC: '2026-11-17T01:00:02.000Z', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    snapshotReadAtUTC: '2026-11-17T01:00:03.000Z' } };
}
test('three purposes stay isolated before and after reception; posterior never grants historical use', () => {
  for (const origin of ['2026-11-16T00:00:00.000Z', '2026-11-17T01:00:02.000Z', '2026-11-17T02:00:00.000Z']) {
    for (const purpose of purposes) {
      const out = review(fixture(purpose, origin));
      assert.equal(out.status, purpose === purposes[2] ? 'pending_independent_review' : 'rejected');
      assert.equal(out.receivedAfterOrigin, origin < '2026-11-17T01:00:02.000Z');
      if (out.receivedAfterOrigin && purpose !== purposes[2]) assert.ok(out.reasons.includes('received_after_origin'));
      if (purpose === purposes[2]) assert.ok(out.reasons.includes('not_historical_training_permission'));
      assert.equal(out.eligibleForEvaluation, false); assert.equal(out.eligibleForV2Fit, false); assert.equal(out.trainingLabelEligible, false);
      assert.equal(Object.hasOwn(out, 'allowed'), false);
    }
  }
});
test('raw bytes/receipt reverified; fabricated summaries and authentication flags cannot substitute', () => {
  for (const edit of [f => { f.snapshot = { publicSummary: { receiptConsistencyVerified: true } }; },
    f => { f.summary = { eligibleForEvaluation: true }; }, f => { f.snapshot.publicSummary = {}; },
    f => { f.snapshot.receipt.sha256 = '0'.repeat(64); }, f => { f.snapshot.receipt.bytes++; },
    f => { f.snapshot.bytes = Buffer.from('DATE,DCOILWTICO\n2026-10-01,70'); },
    f => { f.snapshot.receipt.inputAuthenticityVerified = true; }]) { const f = fixture(); edit(f); assert.throws(() => review(f)); }
});
test('strict schema/type/calendar rejects unsupported use, getters, missing fields and extra fields', () => {
  for (const edit of [f => { f.purpose = 'evaluate'; }, f => { f.purpose = true; }, f => { delete f.originUTC; },
    f => { f.originUTC = 1; }, f => { f.originUTC = '2026-02-30T00:00:00.000Z'; },
    f => { f.useAtUTC = '2026-11-18'; }, f => { f.useAtUTC = '2026-11-18T00:00:00+00:00'; },
    f => { Object.defineProperty(f, 'originUTC', { get() { throw new Error('must not call getter'); } }); }]) {
    const f = fixture(); edit(f); assert.throws(() => review(f));
  }
  for (const bad of [null, [], 'summary', 7]) assert.throws(() => review(bad));
});
test('review chronology cannot backdate read/reception or set origin after use', () => {
  for (const edit of [f => { f.originUTC = '2026-11-19T00:00:00.000Z'; },
    f => { f.useAtUTC = '2026-11-17T01:00:02.000Z'; },
    f => { f.snapshot.snapshotReadAtUTC = '2026-11-17T01:00:01.000Z'; },
    f => { f.snapshot.receipt.fetchStartedAtUTC = '2026-11-17T01:00:04.000Z'; }]) {
    const f = fixture(); edit(f); assert.throws(() => review(f));
  }
  const f = fixture(); f.useAtUTC = f.snapshot.snapshotReadAtUTC; f.originUTC = f.useAtUTC;
  assert.equal(review(f).status, 'rejected');
});
test('public result contains no price/label/return/raw fields; every qualification stays false', () => {
  const f = fixture(purposes[2]), before = Buffer.from(f.snapshot.bytes), out = review(f);
  assert.deepEqual(f.snapshot.bytes, before); assert.equal(out.rowCount, 2); assert.equal(out.missingCount, 1);
  for (const [k, value] of Object.entries(out)) if (/Verified$|Eligible$|^eligibleFor/.test(k) && k !== 'receiptConsistencyVerified') assert.equal(value, false);
  for (const forbidden of ['77.125', '"rows"', '"value"', '"target"', '"return"', '"plan"', '"url"']) assert.ok(!JSON.stringify(out).includes(forbidden));
});
