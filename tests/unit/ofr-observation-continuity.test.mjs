import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent } from '../../scripts/daily/ofr-publication-contract.mjs';
import { prepareOfrPublication } from '../../scripts/daily/publish-ofr-pressure.mjs';

// Synthetic source responses only, not actual OFR values or accuracy evidence.
const firstAt = '2026-11-06T12:00:00Z';
const now = '2026-11-09T12:00:00Z';
function receipt(date, value, retrievedAt = now, hash = 'b') {
  const rows = [{ date: '2026-10-28', value: 1 }, { date, value }];
  return { rows, readout: buildOfrReadout(rows, {
    asOf: retrievedAt, retrievedAt, snapshotSha256: hash.repeat(64),
  }) };
}
const previous = (value = 2) => ({
  mainPressureReadout: buildPublishedOfrComponent({ ...receipt('2026-11-05', value, firstAt, 'a'), now: firstAt }),
});
async function publish(prior, source, at = now) {
  let calls = 0;
  const data = { score: 68, updatedAt: at };
  const output = await prepareOfrPublication(data, {
    previous: prior,
    fetchSnapshot: async () => { calls++; return source; },
    clock: () => at,
  });
  assert.equal(calls, 1);
  assert.equal(output.score, 68);
  assert.equal(output.advicePolicy.mode, 'retired');
  assert.equal(output.decisionModel.strategyState, 'ObservationOnly');
  return output;
}

test('older freshly fetched OFR file cannot replace the newer published observation', async () => {
  const prior = previous();
  const before = structuredClone(prior);
  const source = receipt('2026-11-04', -1);
  const originalSource = structuredClone(source);
  const output = await publish(prior, source);
  const component = output.mainPressureReadout;
  assert.equal(component.status, 'cached');
  assert.equal(component.currentEligible, false);
  assert.equal(component.index.observedDate, '2026-11-05');
  assert.equal(component.index.value, 2);
  assert.equal(component.index.ageDays, 4);
  assert.equal(component.retrieval.status, 'failed');
  assert.equal(component.retrieval.fallbackUsed, true);
  assert.equal(component.retrieval.error, 'ofr_observation_date_regressed');
  assert.deepEqual(component.source, prior.mainPressureReadout.source);
  for (const key of ['history', 'weeklyChange', 'percentile', 'lastKnown']) {
    assert.deepEqual(component[key], prior.mainPressureReadout[key]);
  }
  assert.deepEqual(prior, before);
  assert.deepEqual(source, originalSource);
});

test('repeated regressed receipts never refresh the original cache clock and eventually go stale', async () => {
  const cached = await publish(previous(), receipt('2026-11-04', -1));
  const staleAt = '2026-11-13T12:00:00Z';
  const output = await publish(cached, receipt('2026-11-04', -2, staleAt), staleAt);
  const component = output.mainPressureReadout;
  assert.equal(component.status, 'stale');
  assert.equal(component.currentEligible, false);
  assert.equal(component.index.ageDays, 8);
  assert.equal(component.index.value, 2);
  assert.equal(component.source.retrievedAt, firstAt);
  assert.equal(component.source.snapshotSha256, 'a'.repeat(64));
  assert.equal(component.retrieval.error, 'ofr_observation_date_regressed');
});

test('same-date official revisions, including genuine zero and missing, are not suppressed', async () => {
  for (const value of [-3, 0, null]) {
    const output = await publish(previous(), receipt('2026-11-05', value));
    const component = output.mainPressureReadout;
    assert.equal(component.index.value, value);
    assert.equal(component.status, value === null ? 'missing_current' : 'available');
    assert.equal(component.currentEligible, value !== null);
    assert.equal(component.source.snapshotSha256, 'b'.repeat(64));
    assert.equal(component.source.retrievedAt, now);
    assert.equal(component.retrieval.fallbackUsed, false);
    assert.equal(component.retrieval.error, null);
  }
});

test('newer observations recover normally and newer missing values never resurrect the old value', async () => {
  const cached = await publish(previous(), receipt('2026-11-04', -1));
  for (const value of [-3, 0, null]) {
    const output = await publish(cached, receipt('2026-11-06', value));
    const component = output.mainPressureReadout;
    assert.equal(component.index.observedDate, '2026-11-06');
    assert.equal(component.index.value, value);
    assert.equal(component.status, value === null ? 'missing_current' : 'available');
    assert.equal(component.currentEligible, value !== null);
    assert.equal(component.retrieval.error, null);
  }
});

test('a missing newer observation cannot be replaced by an older finite observation', async () => {
  const prior = previous(null);
  const output = await publish(prior, receipt('2026-11-04', 0));
  const component = output.mainPressureReadout;
  assert.equal(component.status, 'missing_current');
  assert.equal(component.index.observedDate, '2026-11-05');
  assert.equal(component.index.value, null);
  assert.equal(component.currentEligible, false);
  assert.deepEqual(component.lastKnown, prior.mainPressureReadout.lastKnown);
  assert.equal(component.retrieval.error, 'ofr_observation_date_regressed');
});

test('absent, unavailable or invalid prior component does not block a valid first observation', async () => {
  const unavailable = { mainPressureReadout: buildPublishedOfrComponent({ now: firstAt }) };
  const invalid = previous(); invalid.mainPressureReadout.index.observedDate = '2099-01-01';
  for (const prior of [null, unavailable, invalid]) {
    const output = await publish(prior, receipt('2026-11-04', 0));
    assert.equal(output.mainPressureReadout.status, 'available');
    assert.equal(output.mainPressureReadout.index.observedDate, '2026-11-04');
    assert.equal(output.mainPressureReadout.index.value, 0);
  }
});
