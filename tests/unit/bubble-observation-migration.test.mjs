import { buildQualifiedAbsFixture } from '../helpers/bubble-qualified-builder.mjs';
import { verifyQualifiedRefresh } from '../../scripts/bubble-watch/qualified-refresh-release.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrateObservationEvidence } from '../../scripts/bubble-watch/observation-migration.mjs';
import { computeEvidenceSimilarity } from '../../scripts/bubble-watch/evidence-similarity.mjs';
import { gunzipSync } from 'node:zlib';
import { validateEvidenceScoreFields } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { buildEditorialScoringSnapshot, validateEditorialScoringSnapshot } from '../../scripts/bubble-watch/editorial-score-snapshot.mjs';
import { evidenceAwareNote } from '../../scripts/bubble-watch/evidence-wording.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const checkedAt = '2026-11-10T06:00:00Z';
function fixture() {
  const original = JSON.parse(gunzipSync(fs.readFileSync(new URL('../fixtures/bubble-r5-observation-migration.json.gz', import.meta.url))));
  return { ...original, config: read('config/bubble-watch-curated.json'), checkedAt };
}

test('bounded r6 migration preserves 24 observations and all historical epochs', () => {
  const inputs = fixture(), frozen = structuredClone(inputs);
  const { after, history } = migrateObservationEvidence(inputs);
  assert.deepEqual(inputs, frozen);
  assert.deepEqual(history.entries.slice(0, -1), inputs.history.entries);
  for (const item of inputs.before.indicators.filter(i => !['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy'].includes(i.id))) {
    assert.deepEqual(after.indicators.find(i => i.id === item.id), item);
  }
  assert.deepEqual(validateEvidenceScoreFields(after), []);
  assert.equal(after.scoring.model_version, 'bubble-watch-v3-core23-shadow4-r6');
  assert.equal(after.summary.scoring_unknown_count, 3);
  assert.deepEqual(after.summary.primary_score_range_pct, { lower: 21.7, upper: 34.8 });
  assert.deepEqual(after.summary.weighted_risk_score_range, { lower: 39.1, upper: 52.2 });
  assert.deepEqual(after.summary.stage_score_range, { lower: 45, upper: 55 });
  assert.deepEqual(after.summary.trigger_score_range, { lower: 34.6, upper: 50 });
  assert.deepEqual(after.summary.momentum, { deteriorated: 0, improved: 0, net: 0 });
  assert.deepEqual(after.history_seed, []);
  assert.match(after.wow_changes[0].note, /不代表市场风险改善/u);
  assert.equal(after.meta.observation_migration.networkCalls, 0);
  assert.equal(after.meta.observation_migration.sourceGeneratedAt, inputs.before.generated_at);
});

test('compact editorial proof retains r6 dates and rejects forged current evidence', () => {
  const { after } = migrateObservationEvidence(fixture());
  const snapshot = buildEditorialScoringSnapshot(after);
  assert.deepEqual(validateEditorialScoringSnapshot(snapshot, after.as_of_date), []);
  assert.match(snapshot.scorecardDisclosureZh, /AI收入增速的二阶导/u);
  const arr = snapshot.qualifiedEvidence.indicators.find(i => i.id === 'arr_2nd_deriv');
  assert.equal(arr.provenance.detail.historicalObservation.observationDate, '2026-07-31');
  for (const mutate of [p => { delete p.indicators.find(i => i.id === 'arr_2nd_deriv').provenance.detail; },
    p => { p.indicators.find(i => i.id === 'enterprise_deploy').provenance.detail.changePp = 0; },
    p => { p.indicators.find(i => i.id === 'arr_2nd_deriv').provenance.detail.historicalObservation.maxAgeDays = 120; }]) {
    const copy = structuredClone(snapshot); mutate(copy.qualifiedEvidence);
    assert.ok(validateEditorialScoringSnapshot(copy, after.as_of_date).length);
  }
  for (const item of after.indicators.filter(i => ['arr_2nd_deriv', 'enterprise_deploy'].includes(i.id))) assert.equal(evidenceAwareNote(item), item.note);
});

test('migration never rebinds old editorial, pretends a new fetch, repeats or changes dates', () => {
  for (const mutate of [i => { i.before.summary.weekly_editorial = {}; }, i => { i.before.summary.previous_weekly_editorial = {}; },
    i => { i.checkedAt = '2026-11-11T06:00:00Z'; }, i => { i.before.scoring.model_version = 'bubble-watch-v3-core23-shadow4-r6'; },
    i => { i.config.curated.arr_2nd_deriv.asOfDate = '2026-11-08'; },
    i => { i.before.indicators.find(c => c.id === 'arr_2nd_deriv').provenance.reason = 'HTTP 403'; }]) {
    const inputs = fixture(); mutate(inputs); assert.throws(() => migrateObservationEvidence(inputs));
  }
});

test('r6 structural comparison excludes unknown and uncalibrated semantic migrations', () => {
  const { after } = migrateObservationEvidence(fixture());
  const original = computeEvidenceSimilarity(after.indicators, 6);
  const swapped = structuredClone(after.indicators);
  for (const item of swapped.filter(i => ['arr_2nd_deriv', 'enterprise_deploy', 'nvda_invest_revenue'].includes(i.id))) item.status = 'red';
  assert.deepEqual(computeEvidenceSimilarity(swapped, 6), original);
  assert.deepEqual(original.map(i => i.denominator), [15, 15, 15, 12]);
  const cape = swapped.find(i => i.id === 'cape'); cape.status = 'unknown';
  const changed = computeEvidenceSimilarity(swapped, 6);
  assert.ok(changed.every(row => row.denominator === original.find(prior => prior.period === row.period).denominator - 1));
});


test('r6 four-source refresh preserves current proofs and holds next day before any request', async () => {
  const migrated = migrateObservationEvidence(fixture());
  const fedOptions = { barTimes: ['2026-11-05T05:00:00Z', '2026-11-06T05:00:00Z', '2026-11-09T05:00:00Z'], csv: 'observation_date,DFF\n2026-11-05,4.00\n2026-11-06,4.00' };
  const sameDay = await buildQualifiedAbsFixture({ revision: 6, clock: checkedAt, baselineOutput: migrated.after, baselineHistory: migrated.history, fedOptions });
  assert.equal(sameDay.networkCalls, 36);
  const result = verifyQualifiedRefresh({ before: migrated.after, beforeHistory: migrated.history, after: sameDay.output, history: sameDay.history, today: '2026-11-10', now: () => Date.parse(checkedAt) + 600000 });
  assert.equal(result.ok, true, result.errors.join('; '));
  await assert.rejects(buildQualifiedAbsFixture({ revision: 6, clock: '2026-11-11T06:00:00Z', baselineOutput: migrated.after, baselineHistory: migrated.history, fedOptions }),
    error => /complete free refresh/u.test(error.message) && error.fixtureNetworkCalls === 0 && error.fixtureWrites.length === 0);
});
