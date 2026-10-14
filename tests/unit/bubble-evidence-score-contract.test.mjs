import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CORE_LAYOUT, SHADOW_IDS, GAP_REASONS, replayEvidenceScores, validateEvidenceScoreFields, evidenceModelVersion } from '../../scripts/bubble-watch/evidence-score-contract.mjs';

const recorded = JSON.parse(fs.readFileSync(new URL('../../docs/fixtures/bubble-watch/score-snapshot-2026-10-12.json', import.meta.url))).indicators;
const gap = (items, ids) => structuredClone(items).map(item => ids.includes(item.id)
  ? { ...item, status: 'unknown', as_of: null, stale: false,
    evidence_gap: { reasonCode: GAP_REASONS[item.id], policy: 'bubble-qualified-evidence-v1', checkedDate: '2026-10-12' },
    provenance: { mode: 'auto', checkedAt: '2026-10-12T13:22:04.262Z' } } : item);
const greenCards = () => [
  ...CORE_LAYOUT.map(([id, axis, category]) => ({ id, axis, category, score_role: 'core', status: 'green' })),
  ...SHADOW_IDS.map(id => ({ id, axis: 'trigger', category: 'valuation', score_role: 'shadow', status: 'green' }))
];
const payload = (items, revision = 1) => {
  const r = replayEvidenceScores(items, revision);
  return {
    contractVersion: 'bubble-watch-v3', as_of_date: '2026-10-12', indicators: items,
    summary: {
      primary_score_pct: r.primary, red_pct: r.primary, weighted_risk_score: r.pressure,
      stage_score: r.stage, trigger_score: r.trigger,
      primary_score_range_pct: r.primaryRange, weighted_risk_score_range: r.pressureRange,
      stage_score_range: r.stageRange, trigger_score_range: r.triggerRange,
      scoring_unknown_count: r.unknownIds.length, scoring_total_indicators: 23,
      ...Object.fromEntries(['red', 'yellow', 'green'].map(s => [`scoring_${s}_count`, r.counts[s]])),
      category_scores: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, v.point])),
      category_score_ranges: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, { lower: v.lower, upper: v.upper }])),
      verdict_label: r.verdictLabel
    },
    scoring: { model_version: r.modelVersion, effective_tier: r.effectiveTier, tier_range: r.tierRange, unknown_core_ids: r.unknownIds,
      base_tier: r.baseTier, override_active: r.overrideActive, two_axis_upgrade: r.twoAxisUpgrade }
  };
};

test('full evidence preserves fixed-denominator primary and genuine zero', () => {
  const zero = replayEvidenceScores(greenCards());
  assert.equal(zero.primary, 0);
  assert.deepEqual(zero.primaryRange, { lower: 0, upper: 0 });
  assert.equal(zero.effectiveTier, 'observation');
  const r = replayEvidenceScores(recorded);
  assert.equal(r.primary, 30.4);
  assert.equal(r.pressure, 47.8);
  assert.equal(r.stage, 60);
  assert.equal(r.trigger, 38.5);
});

test('recorded ABS gap is not green, zero, or a Core-22 denominator', () => {
  const r = replayEvidenceScores(gap(recorded, ['dc_abs_spread']));
  assert.equal(r.primary, null);
  assert.equal(r.pressure, null);
  assert.equal(r.counts.unknown, 1);
  assert.equal(r.counts.green, 8);
  assert.deepEqual(r.primaryRange, { lower: 30.4, upper: 34.8 });
  assert.deepEqual(r.pressureRange, { lower: 45.7, upper: 50 });
  assert.equal(r.stage, 60);
  assert.equal(r.trigger, null);
  assert.deepEqual(r.triggerRange, { lower: 34.6, upper: 42.3 });
  assert.deepEqual(r.categories.credit, { point: null, lower: 12.5, upper: 37.5 });
  assert.equal(r.effectiveTier, 'alert');
});

test('uncertainty crossing an effective tier cannot publish a point verdict', () => {
  const items = greenCards();
  const stage = items.filter(i => i.score_role === 'core' && i.axis === 'stage');
  stage.forEach((i, n) => { i.status = n < 4 ? 'red' : 'yellow'; });
  const trigger = items.filter(i => i.score_role === 'core' && i.axis === 'trigger' && i.id !== 'dc_abs_spread');
  trigger.forEach((i, n) => { i.status = n < 5 ? 'red' : n < 11 ? 'yellow' : 'green'; });
  const r = replayEvidenceScores(gap(items, ['dc_abs_spread']));
  assert.deepEqual(r.triggerRange, { lower: 61.5, upper: 69.2 });
  assert.deepEqual(r.tierRange, { lower: 'alert', upper: 'top' });
  assert.equal(r.effectiveTier, 'pending');
  assert.equal(r.verdictLabel, '判读待确认');
});

test('all 81 four-gap light completions are inside bounds and agree with a guaranteed tier', () => {
  const ids = Object.keys(GAP_REASONS);
  const gapped = gap(recorded, ids);
  const bounds = replayEvidenceScores(gapped, 4);
  for (let n = 0; n < 81; n++) {
    let state = n;
    const statuses = Object.fromEntries(ids.map(id => { const s = ['green', 'yellow', 'red'][state % 3]; state = Math.floor(state / 3); return [id, s]; }));
    const completed = gapped.map(i => i.status === 'unknown' ? { ...i, status: statuses[i.id] } : i);
    const r = replayEvidenceScores(completed, 4);
    for (const [value, range] of [[r.primary, bounds.primaryRange], [r.pressure, bounds.pressureRange], [r.trigger, bounds.triggerRange]]) {
      assert.ok(value >= range.lower && value <= range.upper);
    }
    assert.equal(r.effectiveTier, bounds.effectiveTier);
  }
});

test('shadow colour cannot narrow uncertainty or alter core scores', () => {
  const items = gap(recorded, ['dc_abs_spread']);
  const a = replayEvidenceScores(items);
  const b = replayEvidenceScores(items.map(i => i.score_role === 'shadow' ? { ...i, status: 'red' } : i));
  assert.deepEqual(a, b);
});

test('unknown, null, duplicate, moved-axis and prematurely migrated states fail closed', () => {
  for (const items of [
    gap(recorded, ['cape']),
    recorded.map(i => i.id === 'cape' ? { ...i, status: null } : i),
    recorded.map(i => i.id === 'cape' ? { ...i, axis: 'trigger' } : i),
    [...recorded.slice(0, 26), recorded[0]],
    gap(recorded, ['fed_policy'])
  ]) assert.throws(() => replayEvidenceScores(items, 1));
  assert.throws(() => evidenceModelVersion(0));
  assert.throws(() => evidenceModelVersion(5));
});

test('contract rejects invented point scores, changed denominator, bounds, counts and verdict', () => {
  const good = payload(gap(recorded, ['dc_abs_spread']));
  assert.deepEqual(validateEvidenceScoreFields(good), []);
  const mutations = [
    d => { d.summary.primary_score_pct = 0; },
    d => { d.summary.red_pct = 30.4; },
    d => { d.summary.scoring_total_indicators = 22; },
    d => { d.summary.primary_score_range_pct.upper = 30.4; },
    d => { d.summary.scoring_green_count++; },
    d => { d.summary.category_scores.credit = 0; },
    d => { d.summary.trigger_score = 38.5; },
    d => { d.scoring.unknown_core_ids = []; },
    d => { d.summary.verdict_label = '观察期'; },
    d => { d.scoring.model_version = 'bubble-watch-v3-core23-shadow4-r9'; },
    d => { d.indicators.find(i => i.status === 'unknown').as_of = '2026-10-12'; },
    d => { d.indicators.find(i => i.status === 'unknown').evidence_gap.checkedDate = '2026-10-11'; },
    d => { d.indicators.find(i => i.status === 'unknown').provenance.checkedAt = '2026-10-13T01:00:00Z'; },
    d => { d.indicators.find(i => i.status === 'unknown').evidence_gap.policy = 'arbitrary'; }
  ];
  for (const mutate of mutations) { const d = structuredClone(good); mutate(d); assert.ok(validateEvidenceScoreFields(d).length); }
});
