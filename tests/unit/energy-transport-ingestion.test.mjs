import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnergyTransportLayer, resolveEnergyTransport, buildTransportShockScoringImpact } from '../../scripts/run-daily-pipeline.mjs';

const today = new Date().toISOString().slice(0, 10);
function rowsWithDeviation(portid = 'chokepoint6', field = 'capacityTanker', ratio = 0) {
  // Synthetic 30-day window with an exact 10,000 average, not saved AIS records.
  const latest = 10000 * (1 + ratio);
  const prior = (300000 - latest) / 29;
  return Array.from({ length: 30 }, (_, day) => Array.from({ length: 8 }, (_, port) => ({
    portid: `chokepoint${port + 1}`,
    date: new Date(Date.parse(`${today}T00:00:00Z`) - day * 86400000).toISOString().slice(0, 10),
    nTanker: 10000, nTotal: 100000, capacityTanker: 10000, capacityTotal: 100000,
    ...(`chokepoint${port + 1}` === portid ? { [field]: day === 0 ? latest : prior } : {})
  }))).flat();
}

async function resolveRows(t, rows, previous) {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    assert.match(String(url), /^https:\/\/services9\.arcgis\.com\/.*Daily_Chokepoints_Data\/FeatureServer\/0\/query\?/u);
    return new Response(JSON.stringify({ features: rows.map(row => ({ attributes: {
      portid: row.portid, date: row.date, n_tanker: row.nTanker, n_total: row.nTotal,
      capacity_tanker: row.capacityTanker, capacity: row.capacityTotal
    } })) }), { status: 200 });
  });
  const result = await resolveEnergyTransport(previous);
  assert.equal(calls, 1, 'contract rejection must not retry the source');
  return result;
}

function assertNoScore(layer) {
  assert.equal(layer.transportShockCandidate.eligibleForMainScore, false);
  assert.equal(layer.transportShockCandidate.boundaries.affectsScoring, false);
  assert.equal(layer.transportShockCandidate.routeFreightConfirmation, 'not_connected');
  assert.equal(layer.transportShockCandidate.marketConfirmation, 'not_connected');
  assert.equal(buildTransportShockScoringImpact(layer, 50).contributionPct, 0);
}

test('Daily incident ratio 2.0893 is rejected before candidate/production projection', () => {
  assert.throws(() => buildEnergyTransportLayer(rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893)),
    /ratio_out_of_contract:hormuz.capacityTankerVs30dPct/u);
});

test('both count and capacity reject overflow for every chokepoint, including non-core ports', () => {
  for (let port = 1; port <= 8; port++) {
    for (const field of ['nTanker', 'capacityTanker']) {
      assert.throws(() => buildEnergyTransportLayer(rowsWithDeviation(`chokepoint${port}`, field, 2.0001)), /ratio_out_of_contract/u);
    }
  }
});

test('supported boundary and real zero retain exact ratios without clamping', () => {
  for (const ratio of [-1, 0, 1.9999, 2]) {
    const layer = buildEnergyTransportLayer(rowsWithDeviation('chokepoint6', 'capacityTanker', ratio));
    assert.equal(layer.sourceStatus.chokepoints, 'live');
    assert.equal(layer.chokepoints.hormuz.capacityTankerVs30dPct, ratio);
  }
});

test('zero average remains an unavailable ratio, while an absent core still fails closed', () => {
  const rows = rowsWithDeviation().map(row => row.portid === 'chokepoint6' ? { ...row, nTanker: 0, capacityTanker: 0 } : row);
  const zero = buildEnergyTransportLayer(rows).chokepoints.hormuz;
  assert.equal(zero.latest.nTanker, 0);
  assert.equal(zero.latestVs30dPct, null);
  assert.equal(zero.capacityTankerVs30dPct, null);
  const missing = buildEnergyTransportLayer(rows.filter(row => row.portid !== 'chokepoint6'));
  assert.equal(missing.sourceStatus.chokepoints, 'missing');
  assertNoScore(missing);
});

test('resolver preserves a fresh valid cache as fallback and disables its prior pressure score', async t => {
  const previous = buildEnergyTransportLayer(rowsWithDeviation('chokepoint6', 'capacityTanker', -0.6));
  assert.equal(previous.transportShockCandidate.eligibleForMainScore, true);
  const before = structuredClone(previous);
  const result = await resolveRows(t, rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893), previous);
  assert.equal(result.sourceStatus.chokepoints, 'fallback');
  assert.equal(result.latestDate, previous.latestDate);
  assert.deepEqual(result.chokepoints, previous.chokepoints);
  assert.deepEqual(previous, before);
  assert.match(result.fetchReason, /ratio_out_of_contract:hormuz.capacityTankerVs30dPct/u);
  assertNoScore(result);
});

test('resolver without cache returns missing, not a fabricated zero or capped reading', async t => {
  const result = await resolveRows(t, rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893));
  assert.equal(result.sourceStatus.chokepoints, 'missing');
  assert.equal(result.chokepoints.hormuz.capacityTankerVs30dPct, null);
  assert.equal(result.latestDate, null);
  assertNoScore(result);
});

test('out-of-contract fallback cache is not reintroduced', async t => {
  const previous = buildEnergyTransportLayer(rowsWithDeviation());
  previous.chokepoints.hormuz.capacityTankerVs30dPct = 2.0893;
  const result = await resolveRows(t, rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893), previous);
  assert.equal(result.sourceStatus.chokepoints, 'missing');
  assert.match(result.fetchReason, /previous_ratio_out_of_contract/u);
  assertNoScore(result);
});

test('invalid cached rerouting ratio cannot bypass the fallback guard', async t => {
  const previous = buildEnergyTransportLayer(rowsWithDeviation());
  previous.reroutingProxy.capeTankerVs30dPct = -2.0001;
  const result = await resolveRows(t, rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893), previous);
  assert.equal(result.sourceStatus.chokepoints, 'missing');
  assert.match(result.fetchReason, /previous_ratio_out_of_contract:reroutingProxy.capeTankerVs30dPct/u);
  assertNoScore(result);
});

test('stale cache remains stale and cannot be relabelled fresh by a failed fetch', async t => {
  const previous = buildEnergyTransportLayer(rowsWithDeviation());
  // Display cache expires after 21 days; the distinct scoring gate is 7 days.
  previous.latestDate = new Date(Date.parse(`${today}T00:00:00Z`) - 22 * 86400000).toISOString().slice(0, 10);
  const result = await resolveRows(t, rowsWithDeviation('chokepoint6', 'capacityTanker', 2.0893), previous);
  assert.equal(result.sourceStatus.chokepoints, 'stale');
  assert.equal(result.latestDate, previous.latestDate);
  assertNoScore(result);
});
