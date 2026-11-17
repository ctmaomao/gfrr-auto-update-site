import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reviewSyntheticBrentV2Graph as review } from '../../scripts/oil-directional/brent-v2-quality-graph.mjs';
const day = i => new Date(Date.UTC(2017, 5, 1 + i)).toISOString().slice(0, 10);
function fixture() {
  const slots = Array.from({ length: 45 }, (_, i) => ({ id: `s${i}`, quoteDate: day(i), availabilityDate: day(i), state: 'numeric', value: 70 }));
  const cases = slots.flatMap(s => [1, 5, 20].map(horizon => ({ batchDate: s.availabilityDate, horizon,
    featureIds: [], quotePathIds: [], selectionSupport: { currentLatest: [], previousLatest: [], featureSelection: [], anchorSelection: [] },
    featureClosureKnownAtUTC: null, labelClosureKnownAtUTC: null })));
  for (const c of cases.filter(c => c.batchDate === day(20))) {
    c.featureIds = slots.slice(0, 21).map(s => s.id);
    c.quotePathIds = slots.slice(23, 24 + c.horizon).map(s => s.id);
    c.selectionSupport = { currentLatest: ['s20'], previousLatest: ['s19'], featureSelection: [...c.featureIds], anchorSelection: ['s21', 's22', 's23'] };
    c.featureClosureKnownAtUTC = `${day(22)}T00:00:00.000Z`;
    c.labelClosureKnownAtUTC = `${day(44)}T00:00:00.000Z`;
  }
  return { syntheticFixtureOnly: true, slots, cases, asOfUTC: '2018-01-01T00:00:00.000Z' };
}
const chosen = (out, h = 5) => out.results.find(c => c.batchDate === day(20) && c.horizon === h);
const graph = f => f.cases.find(c => c.batchDate === day(20) && c.horizon === 5);
test('draft only, v1 bytes unchanged; graph retains all batches and never returns prices or probabilities', () => {
  const p = JSON.parse(readFileSync(new URL('../../config/brent-spot-release-direction-v2-draft.json', import.meta.url)));
  assert.match(p.status, /^draft/); assert.equal(p.limits.realFittingEnabled, false);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../../config/brent-spot-release-direction-protocol.json', import.meta.url))).digest('hex'), p.predecessor.sha256);
  const f = fixture(), original = structuredClone(f), out = review(f);
  assert.deepEqual(f, original); assert.equal(out.coverage.originalCandidates, 135);
  assert.equal(out.originalAvailabilityBatches.length, 45); assert.equal(chosen(out).syntheticGraphQualityPass, true);
  for (const k of ['dependencyCompletenessVerified', 'caseConstructionVerified', 'historicalAsOfVerified', 'eligibleForEvaluation', 'eligibleForPublicProbability', 'eligibleForMainScore', 'realExecutionEnabled', 'modelFitted']) assert.equal(out[k], false);
  assert.ok(!JSON.stringify(out).includes('"value"'));
});
test('taint overlays only reject; they do not move feature, anchor, endpoint or horizon', () => {
  const clean = chosen(review(fixture()));
  for (const id of ['s19', 's20', 's21', 's22', 's23', 's25', 's28']) {
    for (const change of [{ state: 'unknown', value: null }, { state: 'quarantined', value: null }, { value: -1 }, { value: NaN }]) {
      const f = fixture(); Object.assign(f.slots.find(s => s.id === id), change);
      const r = chosen(review(f)); assert.equal(r.syntheticGraphQualityPass, false);
      for (const k of ['featureIds', 'quotePathIds', 'anchorId', 'endpointId', 'horizon']) assert.deepEqual(r[k], clean[k]);
    }
  }
});
test('all original interval slots participate even when absent from fixed quote path', () => {
  const f = fixture(), c = graph(f); c.quotePathIds = ['s23', 's24', 's26', 's27', 's28', 's29'];
  assert.ok(chosen(review(f)).reasons.includes('numeric_interval_slot_omitted'));
  f.slots[25].state = 'source_null'; f.slots[25].value = null;
  assert.equal(chosen(review(f)).syntheticGraphQualityPass, true);
  f.slots[25].state = 'unknown'; const r = chosen(review(f));
  assert.ok(r.intervalSlotIds.includes('s25')); assert.ok(r.reasons.includes('quarantined_dependency')); assert.equal(r.endpointId, 's29');
});
test('availability before quote is quarantined without date correction or deleting its batch', () => {
  const f = fixture(); f.slots[25].availabilityDate = day(24);
  // The caller must supply the original declared batch grid, not orphan candidates.
  f.cases = f.cases.filter(c => c.batchDate !== day(25));
  const r = chosen(review(f)); assert.ok(r.reasons.includes('quarantined_dependency'));
  assert.equal(r.anchorId, 's23'); assert.equal(r.endpointId, 's28'); assert.equal(f.slots[25].availabilityDate, day(24));
});
test('unknown closure, future selection support and closure across phase boundary remain unavailable', () => {
  for (const field of ['featureClosureKnownAtUTC', 'labelClosureKnownAtUTC']) {
    const f = fixture(); graph(f)[field] = null; assert.equal(chosen(review(f)).syntheticGraphQualityPass, false);
  }
  const f = fixture(); graph(f).selectionSupport.featureSelection.push('s21');
  assert.ok(chosen(review(f)).reasons.includes('feature_support_after_cutoff'));
  const delayed = fixture(); graph(delayed).labelClosureKnownAtUTC = '2018-01-01T00:00:00.000Z';
  assert.ok(chosen(review(delayed)).reasons.includes('purged_phase_boundary'));
  delayed.asOfUTC = '2017-12-31T23:59:59.999Z';
  assert.ok(chosen(review(delayed)).reasons.includes('label_not_mature'));
});
test('malformed/ambiguous universe or graph is a global stop; real-mode assertion is refused', () => {
  for (const edit of [f => { f.syntheticFixtureOnly = false; }, f => { f.slots[0].quoteDate = '2017-02-30'; },
    f => { f.slots.push({ ...f.slots[0] }); }, f => { f.cases.pop(); }, f => { f.cases.push(structuredClone(f.cases[0])); },
    f => { graph(f).featureIds.push('missing'); }, f => { graph(f).quotePathIds.reverse(); },
    f => { f.slots[0].extra = true; }, f => { delete f.slots[2]; }]) {
    const f = fixture(); edit(f); assert.throws(() => review(f));
  }
});
test('permutation preserves case identity and coverage, rejection reasons explicitly overlap', () => {
  const f = fixture(), a = review(f); f.slots.reverse(); f.cases.reverse();
  assert.deepEqual(review(f), a);
  assert.equal(a.coverage.reasonsMayOverlap, true);
  assert.equal(a.coverage.byYearPhaseHorizon['2017/train/5'].candidates, 45);
  assert.equal(a.coverage.byYearPhaseHorizon['2017/train/5'].graphQualityPass, 1);
});

test('derived full intervals count toward bounded dependency budget', () => {
  const f = fixture();
  f.slots = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, quoteDate: day(i),
    availabilityDate: new Date(Date.UTC(2011, 0, 1 + i)).toISOString().slice(0, 10), state: 'numeric', value: 70 }));
  f.cases = f.slots.flatMap(s => [1, 5, 20].map(horizon => ({ batchDate: s.availabilityDate, horizon,
    featureIds: [], quotePathIds: [...Array.from({ length: horizon }, (_, i) => `s${i}`), 's199'],
    selectionSupport: { currentLatest: [], previousLatest: [], featureSelection: [], anchorSelection: [] },
    featureClosureKnownAtUTC: null, labelClosureKnownAtUTC: null })));
  assert.throws(() => review(f), /dependency budget/);
});
