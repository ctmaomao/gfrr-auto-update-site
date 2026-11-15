import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildArrGap, publishedArrRejectionEvidence, validateArrGap, validateArrEvidenceRecord, parseArrStaleFailure, isExpectedArrGapFailure } from '../../scripts/bubble-watch/arr-evidence.mjs';
import { CORE_LAYOUT, SHADOW_IDS, replayEvidenceScores, isRegisteredEvidenceGap, METHOD_ORDER } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { assessUnderlyingObservationFreshness } from '../../scripts/bubble-watch/observation-freshness.mjs';

const today = '2026-11-10', checkedAt = `${today}T06:00:00Z`;
const base = { id: 'arr_2nd_deriv', score_role: 'core', axis: 'trigger', category: 'fundamentals' };
const entry = JSON.parse(fs.readFileSync(new URL('../../config/bubble-watch-curated.json', import.meta.url))).curated.arr_2nd_deriv;
const failure = 'hybrid_live_source_failed: arr_underlying_observation_stale: latest milestone 2026-05-28 is 166d old (max 45d)';
const gap = () => buildArrGap(base, entry, today, failure, checkedAt, publishedArrRejectionEvidence());

test('r6 keeps stale historical and rejected live dates without qualifying either', () => {
  const item = gap();
  assert.equal(item.as_of, null); assert.equal(item.stale, false); assert.equal(item.status, 'unknown');
  assert.equal(item.provenance.detail.historicalObservation.ageDays, 102);
  assert.equal(item.provenance.detail.rejectedLiveObservation.ageDays, 166);
  assert.equal(validateArrGap(item, today), true);
  assert.deepEqual(validateArrEvidenceRecord(item, today), []);
  assert.equal(isRegisteredEvidenceGap(item, { revision: 6, asOfDate: today }), true);
  for (let revision = 1; revision <= 5; revision++) assert.equal(isRegisteredEvidenceGap(item, { revision, asOfDate: today }), false);
  assert.deepEqual(METHOD_ORDER, ['dc_abs_spread', 'insider_sell_buy', 'capex_reaction', 'fed_policy']);
});

test('only the matching replayed stale-source rejection can be a warning', () => {
  assert.equal(isExpectedArrGapFailure({ id: base.id, reason: failure }, gap(), today), true);
  for (const reason of ['HTTP 403', 'unexpected_schema', `${failure}; HTTP 500`, failure.replace('166d', '165d'), failure.replace('45d', '120d'), failure.replace('2026-05-28', '2027-05-28')]) {
    assert.equal(parseArrStaleFailure(reason, today), null);
    assert.equal(isExpectedArrGapFailure({ id: base.id, reason }, gap(), today), false);
  }
  assert.equal(isExpectedArrGapFailure({ id: 'vc_ai_share', reason: failure }, gap(), today), false);
});

test('missing, forged, renewed, expired proof or widened gate fails closed', () => {
  const mutations = [i => { i.provenance.detail.currentEligible = true; }, i => { i.provenance.checkedAt = '2026-11-09T06:00:00Z'; },
    i => { i.provenance.detail.historicalObservation.ageDays = 2; }, i => { i.provenance.detail.historicalObservation.maxAgeDays = 120; },
    i => { i.provenance.detail.historicalObservation.observationDate = '2026-11-08'; }, i => { delete i.provenance.detail.rejectedLiveObservation; },
    i => { i.as_of = today; }, i => { i.stale = true; }, i => { i.evidence_gap.checkedDate = '2026-11-09'; },
    i => { i.provenance.detail.historicalSourceObservation.anchors[2].amountUsdB = 99; },
    i => { for (const key of ['historicalObservation', 'rejectedLiveObservation']) i.provenance.detail[key] = assessUnderlyingObservationFreshness({ observationDate: '2026-01-01', asOfDate: today, maxAgeDays: 45 }); },
    i => { i.provenance.detail.rejectionEvidence.sourceSnapshotSha256 = '0'.repeat(64); }];
  for (const mutate of mutations) { const item = gap(); mutate(item); assert.equal(validateArrGap(item, today), false); }
  assert.equal(validateArrGap(gap(), '2026-11-11'), false);
  assert.throws(() => buildArrGap(base, { ...entry, maxAgeDays: 120 }, today, failure, checkedAt));
  assert.throws(() => buildArrGap(base, { ...entry, asOfDate: '2026-10-01' }, today, failure, checkedAt));
});

function live(at) {
  const rows = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-28'].map((date, n) => ({ date, arrB: [2, 3, 5, 9][n], sourceId: [315823, 322211, 323715, 325206][n] }));
  const slope = n => (rows[n].arrB - rows[n - 1].arrB) / ((Date.parse(rows[n].date) - Date.parse(rows[n - 1].date)) / (30.4375 * 86400000));
  const ratio = slope(3) / slope(2);
  return { ...base, status: 'green', as_of: '2026-05-28', stale: false, provenance: { mode: 'auto', detail: {
    source: 'SaaStr WordPress public API', milestones: rows, slopeRatio: ratio,
    underlyingObservationFreshness: assessUnderlyingObservationFreshness({ observationDate: '2026-05-28', asOfDate: at, maxAgeDays: 45 }) } } };
}

test('existing comparable four-post proxy must replay and retain 45-day boundary', () => {
  const good = live('2026-07-12'); assert.deepEqual(validateArrEvidenceRecord(good, '2026-07-12'), []);
  assert.ok(validateArrEvidenceRecord(good, '2026-07-13').length);
  for (const mutate of [i => { i.as_of = '2026-07-12'; }, i => { i.provenance.detail.milestones[0].sourceId = 999; },
    i => { i.provenance.detail.milestones.pop(); }, i => { i.provenance.detail.slopeRatio = 0; },
    i => { i.provenance.detail.milestones[3].arrB = 100; }, i => { i.provenance.detail.underlyingObservationFreshness.maxAgeDays = 120; },
    i => { i.provenance.detail.source = 'SEC quarterly revenue annualized'; }]) {
    const item = structuredClone(good); mutate(item); assert.ok(validateArrEvidenceRecord(item, '2026-07-12').length);
  }
});

test('withdrawing red widens uncertainty rather than improving a risk estimate', () => {
  const cards = [...CORE_LAYOUT.map(([id, axis, category]) => ({ id, axis, category, score_role: 'core', status: 'green' })),
    ...SHADOW_IDS.map(id => ({ id, score_role: 'shadow', status: 'green' }))];
  const prior = cards.find(i => i.id === base.id); prior.status = 'red';
  const before = replayEvidenceScores(cards, 5);
  const after = replayEvidenceScores(cards.map(i => i.id === base.id ? gap() : i), 6);
  assert.equal(before.primary, 4.3); assert.equal(after.primary, null);
  assert.deepEqual(after.primaryRange, { lower: 0, upper: 4.3 });
  assert.deepEqual(after.pressureRange, { lower: 0, upper: 4.3 });
  assert.equal(after.counts.green, 22); assert.equal(after.counts.unknown, 1);
});
