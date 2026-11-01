import test from 'node:test';
import assert from 'node:assert/strict';
import { OFR_COLUMNS, parseOfrCsv, buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice, validatePublishedOfrComponent, validateOfrPublicationIfPresent } from '../../scripts/daily/ofr-publication-contract.mjs';

// All inputs below are synthetic fixtures, not observations or accuracy evidence.
const now = '2026-11-01T12:00:00Z';
function source(value = -1) {
  const rows = parseOfrCsv(OFR_COLUMNS.join(',') + '\n' + [['2026-10-14', -0.2], ['2026-10-21', -0.5], ['2026-10-28', value]].map(([d, v]) => [d, v, 0, 0, 0, 0, 0, 0, 0, 0].join(',')).join('\n'));
  return { rows, readout: buildOfrReadout(rows, { asOf: now, retrievedAt: '2026-11-01T11:59:00Z', snapshotSha256: 'a'.repeat(64) }), now };
}
const live = value => buildPublishedOfrComponent(source(value));
const legacy = () => ({ updatedAt: now, version: 'v27.0', score: 68, tailRiskOverlay: { baseScore: 57, floor: 68 }, macroDrivers: { vix: 12 }, warningSystem: { active: ['energy'] }, decisionModel: { stateScore: 68, structuralSignals: [{ code: 'energy', label: '能源条件' }] }, tradingSystem: { positioning: { equityPct: 30 } }, assetReturnMap: { rows: ['old advice'] }, dailyBrief: { old: true }, aiInterpretationLayer: {}, macroRiskEditorialLayer: {}, scenarios: ['old'], positionGuidance: { riskBudget: 30 } });

test('official raw negative and zero publish unchanged, without floors, contributions or crisis probability', () => {
  for (const v of [-1, 0]) {
    const x = live(v);
    assert.equal(x.index.value, v); assert.equal(x.weeklyChange.value, v + 0.5);
    assert.equal(x.currentEligible, true); assert.equal(x.status, 'available');
    assert.equal(x.percentile.value, null); assert.equal(x.contributionsPublished, false);
    assert.equal(x.boundaries.positionMapping, null); assert.equal(x.boundaries.tailFloorAdded, false);
    assert.equal(validatePublishedOfrComponent(x), true);
  }
});
test('failed refresh preserves original receipt, observed date and raw hash; cache never claims current eligibility', () => {
  const first = live(-1), before = structuredClone(first);
  const cached = buildPublishedOfrComponent({ previous: first, now: '2026-11-02T12:00:00Z', retrievalError: 'timeout' });
  assert.equal(cached.status, 'cached'); assert.equal(cached.currentEligible, false);
  assert.equal(cached.index.ageDays, 5); assert.deepEqual(cached.source, first.source);
  assert.equal(cached.retrieval.fallbackUsed, true); assert.deepEqual(first, before);
  const stale = buildPublishedOfrComponent({ previous: cached, now: '2026-11-06T12:00:00Z' });
  assert.equal(stale.status, 'stale'); assert.equal(stale.index.ageDays, 9);
  assert.equal(stale.index.value, -1); assert.equal(stale.source.retrievedAt, first.source.retrievedAt);
});
test('latest missing value does not become zero or an older current value', () => {
  const x = live(''); assert.equal(x.status, 'missing_current');
  assert.equal(x.index.value, null); assert.equal(x.index.observedDate, '2026-10-28');
  assert.equal(x.lastKnown.observedDate, '2026-10-21'); assert.equal(x.currentEligible, false);
});
test('first and repeated retrieval failures remain unavailable, with no invented timestamps or values', () => {
  const first = buildPublishedOfrComponent({ now });
  const second = buildPublishedOfrComponent({ previous: first, now: '2026-11-02T12:00:00Z' });
  for (const x of [first, second]) { assert.equal(x.status, 'unavailable'); assert.equal(x.index.ageDays, null); assert.equal(x.source.retrievedAt, null); assert.equal(x.retrieval.fallbackUsed, false); }
});
test('last known observation cannot introduce future, fabricated or non-finite values through cache', () => {
  for (const mutate of [x => x.lastKnown.observedDate = '2099-01-01', x => x.lastKnown.value = 123, x => x.lastKnown.value = null, x => x.lastKnown = null]) {
    const x = live(-1); mutate(x);
    assert.throws(() => validatePublishedOfrComponent(x));
    assert.throws(() => buildPublishedOfrComponent({ previous: x, now: '2026-11-02T12:00:00Z' }));
  }
  const input = source(); input.readout.lastKnown.value = 123;
  assert.throws(() => buildPublishedOfrComponent(input));
  const missing = live(''); missing.lastKnown.observedDate = missing.index.observedDate;
  assert.throws(() => validatePublishedOfrComponent(missing));
  const cachedMissing = buildPublishedOfrComponent({ previous: live(''), now: '2026-11-02T12:00:00Z' });
  assert.equal(cachedMissing.index.value, null); assert.equal(cachedMissing.lastKnown.value, -0.5);
});
test('publication rejects source/history substitution, future receipts and invalid observation shape', () => {
  for (const mutate of [x => x.rows.at(-1).value++, x => x.readout.source.provider = 'other', x => x.readout.source.snapshotSha256 = 'bad', x => x.readout.source.retrievedAt = '2026-11-02T00:00:00Z', x => x.rows.reverse()]) {
    const input = source(); mutate(input); assert.throws(() => buildPublishedOfrComponent(input));
  }
});
test('retirement preserves raw inputs, source safety and independent warnings, without mutating input', () => {
  const old = legacy(), before = structuredClone(old), output = retireLegacyAdvice(old, live(-1));
  assert.deepEqual(old, before); assert.deepEqual(output.macroDrivers, old.macroDrivers);
  assert.equal(output.warningSystem.status, '数据与独立警报'); assert.deepEqual(output.warningSystem.rules, []); assert.deepEqual(output.tailRiskOverlay, old.tailRiskOverlay);
  assert.equal(output.score, 68); assert.equal(output.legacyModelAudit.score, 68); assert.equal(output.scoreRole, 'legacy_model_audit_only');
  assert.deepEqual(output.independentWarnings.structuralSignals, old.decisionModel.structuralSignals);
  assert.equal(output.decisionModel.strategyState, 'ObservationOnly'); assert.equal(Object.hasOwn(output.decisionModel, 'stateScore'), false);
  assert.deepEqual(output.decisionModel.actionQueue.priorityActions, []); assert.equal(output.tradingSystem.positioning.status, 'retired');
  assert.equal(output.advicePolicy.ofrToPositionMapping, null); assert.deepEqual(output.assetReturnMap.rows, []);
  for (const k of ['dailyBrief', 'aiInterpretationLayer', 'macroRiskEditorialLayer']) assert.equal(Object.hasOwn(output, k), false);
  assert.equal(validateOfrPublicationIfPresent(output), true);
});
test('legacy genuine zero remains audit zero while unavailable OFR stays null', () => {
  const old = legacy(); old.score = 0;
  const x = retireLegacyAdvice(old, buildPublishedOfrComponent({ now }));
  assert.equal(x.score, 0); assert.equal(x.legacyModelAudit.score, 0); assert.equal(x.mainPressureReadout.index.value, null);
});
test('new component strictly rejects stale advice, fake empty arrays and hidden allocations', () => {
  for (const mutate of [x => x.decisionModel.stateScore = 0, x => x.tradingSystem.positioning.riskBudget = 30, x => x.decisionModel.actionQueue.priorityActions = { length: 0 }, x => x.decisionModel.actionQueue.priorityActions.push('buy'), x => x.dailyBrief = {}, x => x.advicePolicy.ofrToPositionMapping = {}, x => x.score++]) {
    const x = retireLegacyAdvice(legacy(), live(-1)); mutate(x); assert.throws(() => validateOfrPublicationIfPresent(x));
  }
});
test('invalid publication eligibility, clocks, contributions, ranks and advice boundaries are rejected', () => {
  for (const mutate of [x => x.currentEligible = false, x => x.index.ageDays = 0, x => x.contributions = {}, x => x.boundaries.tailFloorAdded = true, x => x.percentile.value = 50, x => x.history.push({ date: '2026-10-27', value: 0 }), x => x.retrieval.fallbackUsed = true]) {
    const x = live(-1); mutate(x); assert.throws(() => validatePublishedOfrComponent(x));
  }
});
test('old payloads remain on their exact existing validation path; partial migration fails closed', () => {
  assert.equal(validateOfrPublicationIfPresent(legacy()), false);
  assert.throws(() => validateOfrPublicationIfPresent({ ...legacy(), mainPressureReadout: live(-1) }));
  assert.throws(() => validateOfrPublicationIfPresent({ ...legacy(), advicePolicy: { mode: 'retired' } }));
});
