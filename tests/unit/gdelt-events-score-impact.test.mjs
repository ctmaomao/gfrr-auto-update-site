import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { scoreWorldOrderStress } from '../../scripts/world-order/score-world-order-stress.mjs';
import { violenceBounds, fitImpactBounds, normalizedBounds, buildImpactContext, replayScoreImpact } from '../../scripts/gdelt/events-score-impact.mjs';
const window = (n = 100, unknown = 0) => ({ downloadedFiles: 672, conflictingIds: 0, ambiguousIds: 0,
  quarantinedRows: unknown, statisticallyQualified: unknown === 0, validSubsetCounts: { violence: n } });
function contextFixture() {
  const sources = { gdelt: { status: 'stale', summary: { conflictEvents: 1629 } },
    ofac: { status: 'ok', summary: { recentActionsCount: 10 } },
    sipri: { status: 'manual_required', summary: {} }, acled: { status: 'ok', summary: {} } };
  const market = { score: 50, state: 'partial_confirmed', evidence: [] };
  const data = { modules: { geopolitical: 50, energy: 50, inflation: 50, liquidity: 50, debt: 50, banking: 50 } };
  const rules = { dimensionWeights: { peaceDividendRetreat: 0.16, blocFormation: 0.2, multiTheaterConflict: 0.24,
    economicWeaponization: 0.22, capitalControlRisk: 0.18 }, scoreWeights: { externalStructural: 0.6, marketConfirmation: 0.3, existingRiskModules: 0.1 } };
  const published = scoreWorldOrderStress({ externalSources: sources, marketConfirmation: market, dataPayload: data, rules });
  return { sources, market, data, rules, published };
}
test('intervals retain strict qualification and bound all unknown rows; incomplete/ambiguous data hold', () => {
  assert.deepEqual(violenceBounds(window(100, 2)), { lower: 100, upper: 102, unknownRows: 2, strictQualification: false });
  for (const patch of [{ downloadedFiles: 671 }, { conflictingIds: 1 }, { ambiguousIds: 1 }, { quarantinedRows: -1 }]) {
    assert.equal(violenceBounds({ ...window(), ...patch }), null);
  }
  assert.equal(fitImpactBounds(Array(29).fill(window())), null);
  assert.equal(fitImpactBounds(Array(30).fill(window(0))), null);
  const scale = fitImpactBounds(Array(30).fill(window(100, 2)));
  assert.deepEqual(scale, { lower: 100, upper: 102, pointScaleApproved: false });
  const b = normalizedBounds(violenceBounds(window(100, 2)), scale);
  assert.ok(b.lower < 50 && b.upper > 50);
});
test('targeted candidate preserves financial/bloc dimensions; blanket substitution does not', () => {
  const f = contextFixture(), context = buildImpactContext(f), r = context.evaluate(70);
  for (const k of ['blocFormation', 'economicWeaponization', 'capitalControlRisk']) {
    assert.equal(r.targeted.dimensions[k], context.baseline.dimensions[k]);
    assert.notEqual(r.blanket.dimensions[k], context.baseline.dimensions[k]);
  }
  assert.ok(r.targeted.dimensions.multiTheaterConflict > context.baseline.dimensions.multiTheaterConflict);
  assert.deepEqual(context.evaluate(context.oldGdeltScore).targeted, context.baseline);
  assert.throws(() => buildImpactContext({ ...f, published: { ...f.published, score: f.published.score + 1 } }), /baseline_parity/);
  assert.equal(context.evaluate(0).blanket.score >= 0, true);
  assert.equal(context.evaluate(100).blanket.score <= 100, true);
});
test('holdout never refits training interval; missing samples hold and no report grants approval', () => {
  const windows = Array.from({ length: 43 }, (_, i) => ({ ...window(), endDay:
    new Date(Date.parse('2026-08-26T00:00:00Z') + i * 86400000).toISOString().slice(0,10).replaceAll('-', '') }));
  const calibration = { windows, cohort: { sourcePeriodsDisjoint: true } };
  const context = buildImpactContext(contextFixture());
  const a = replayScoreImpact(calibration, context);
  windows[42] = { ...windows[42], ...window(10000, 2) };
  const b = replayScoreImpact(calibration, context);
  assert.deepEqual(a.researchScaleBounds, b.researchScaleBounds);
  assert.equal(b.productionEligible, false); assert.equal(b.scoringConnected, false); assert.equal(b.approvedPointScale, null);
  windows[42] = { ...windows[42], ...window(1, 100000) };
  const uncertain = replayScoreImpact(calibration, context);
  assert.equal(uncertain.scenarios.find(s => s.factor === 1).windows.at(-1).targeted.classificationRobustToUnknownRows, false);
  windows[0].downloadedFiles = 671;
  assert.equal(replayScoreImpact(calibration, context).scenarios[0].windows[0].targeted, null);
  assert.throws(() => replayScoreImpact({ ...calibration, cohort: { sourcePeriodsDisjoint: false } }, context), /split/);
});
test('offline impact CLI refuses network, production output paths and impossible dates', () => {
  for (const args of [['--allow-network'], ['--output', 'data/world-order-stress.json'], ['--end', '20260230'], ['--end', '20990101']]) {
    const r = spawnSync(process.execPath, ['scripts/world-order/replay-gdelt-events-score-impact.mjs', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /Research report:/);
  }
});
