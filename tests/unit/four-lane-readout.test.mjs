import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Share the actual versioned builder instance used by the renderer/app.
const RENDERER_URL = pathToFileURL(`${process.cwd()}/scripts/modules/renderFourLaneReadout.js`);
const rendererSource = fs.readFileSync(RENDERER_URL, 'utf8');
const builderSpecifier = /from\s+['"]([^'"]*fourLaneReadout\.js\?v=[^'"]+)['"]/.exec(rendererSource)?.[1];
assert.ok(builderSpecifier, 'renderFourLaneReadout must import a versioned fourLaneReadout.js');
const { buildFourLaneReadout } = await import(new URL(builderSpecifier, RENDERER_URL).href);

const now = Date.parse('2026-10-23T08:00:00Z');
const baseline = { brent: 125.4, dxy: 121.4, vix: 16.46, hyOas: 3.29, us10y: 5.1, real10y: 2.78, breakeven10y: 2.35, gold: 4166, spx: 7659, asOf: '2026-10-23T00:48:31.687Z' };

function snapshot(over = {}) {
  return {
    updatedAt: '2026-10-23T00:48:31.687Z',
    displayInputsBaseline: baseline,
    macroDrivers: {
      credit: {
        hyOas: 3.29,
        igOas: 0.87,
        nfci: -0.499,
        sourceObservedAt: { hyOas: '2026-10-21', igOas: '2026-10-21' },
      },
      energyTransport: { latestAgeDays: 7, guards: { latestFresh: true, sourceLive: true } },
    },
    tailRiskOverlay: { reasons: [{ key: 'energy_inflation_tail', labelZh: '能源与通胀尾部冲击', floor: 68 }] },
    transportShockScoringImpact: { applied: true, contributionPct: 2, reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied', guards: { latestFresh: true } },
    ...over,
  };
}

test('four lanes keep totals null, evidence dated, and per-alert expiry', () => {
  const out = buildFourLaneReadout(snapshot(), now);
  assert.equal(out.lanes.continuous.total, null);
  assert.equal(out.lanes.continuous.headline, '综合读数待验证');
  const hy = out.lanes.continuous.evidence.find((e) => e.key === 'hyOas');
  const nfci = out.lanes.continuous.evidence.find((e) => e.key === 'nfci');
  assert.equal(hy.value, 3.29);
  assert.equal(hy.date, '2026-10-21');
  assert.equal(nfci.value, -0.499);
  assert.equal(nfci.date, null);
  assert.equal(nfci.dateStatus, 'unknown');
  assert.equal(out.lanes.fragility.total, null);
  assert.deepEqual(out.lanes.fragility.gaps.map((g) => g.label), ['杠杆', '偿债', '估值']);
  assert.equal(out.lanes.shock.tail.length, 1);
  assert.equal(out.lanes.shock.tailKnown, true);
  assert.equal(out.lanes.shock.tailRecordCount, 1);
  assert.equal(out.lanes.shock.tail[0].floor, 68);
  assert.equal(out.lanes.shock.tail[0].expiryAt, null);
  assert.equal(out.lanes.shock.transport.counted, true);
  assert.equal(out.lanes.credibility.coverage.present, 9);
  assert.equal(out.lanes.credibility.label, '主表数值齐全，源日期未齐');
  assert.equal(out.flags.accuracy, 'not_assessed');
});

test('missing/empty/invalid tail records remain distinguishable and dates are rejected', () => {
  const empty = buildFourLaneReadout({}, now);
  assert.equal(empty.lanes.shock.tailKnown, false);
  assert.equal(empty.lanes.shock.tailRecordCount, null);
  assert.equal(empty.lanes.shock.tail.length, 0);
  assert.equal(empty.lanes.shock.transport.counted, false);
  assert.equal(empty.lanes.shock.transport.status, '未知');
  assert.equal(empty.lanes.credibility.coverage.present, 0);

  const validEmpty = buildFourLaneReadout(snapshot({ tailRiskOverlay: { reasons: [] } }), now);
  assert.equal(validEmpty.lanes.shock.tailKnown, true);
  assert.equal(validEmpty.lanes.shock.tailRecordCount, 0);
  assert.equal(validEmpty.lanes.shock.tail.length, 0);

  const badTail = buildFourLaneReadout(snapshot({ tailRiskOverlay: { reasons: [{ key: 'unknown_key', floor: 68 }] } }), now);
  assert.equal(badTail.lanes.shock.tailKnown, true);
  assert.equal(badTail.lanes.shock.tailRecordCount, 1);
  assert.equal(badTail.lanes.shock.tail.length, 0);

  const future = buildFourLaneReadout(snapshot({ macroDrivers: { credit: { hyOas: 3.23, sourceObservedAt: { hyOas: '2026-10-24' } }, energyTransport: {} }, displayInputsBaseline: {} }), now);
  assert.equal(future.lanes.continuous.evidence.find((e) => e.key === 'hyOas').date, null);
  const invalid = buildFourLaneReadout(snapshot({ macroDrivers: { credit: { hyOas: 3.23, sourceObservedAt: { hyOas: '2026-02-30' } }, energyTransport: {} }, displayInputsBaseline: {} }), now);
  assert.equal(invalid.lanes.continuous.evidence.find((e) => e.key === 'hyOas').date, null);

  const laterThanSnapshot = snapshot();
  laterThanSnapshot.updatedAt = '2026-10-21T00:48:31.687Z';
  laterThanSnapshot.macroDrivers.credit.sourceObservedAt.hyOas = '2026-10-22';
  assert.equal(buildFourLaneReadout(laterThanSnapshot, now).lanes.continuous.evidence.find((e) => e.key === 'hyOas').date, null);

  for (const bad of [null, undefined, '', false, true, '3.29']) {
    const data = snapshot();
    data.macroDrivers.credit.hyOas = bad;
    assert.equal(buildFourLaneReadout(data, now).lanes.continuous.evidence.find((e) => e.key === 'hyOas').value, null, `invalid ${String(bad)}`);
  }
  const zero = snapshot();
  zero.macroDrivers.credit.hyOas = 0;
  assert.equal(buildFourLaneReadout(zero, now).lanes.continuous.evidence.find((e) => e.key === 'hyOas').value, 0);

  const invalidSnapshot = buildFourLaneReadout(snapshot({ updatedAt: 'not-a-date' }), now);
  assert.equal(invalidSnapshot.lanes.credibility.snapshot.status, 'invalid');
  assert.equal(invalidSnapshot.lanes.shock.tail[0].status, '未知');
  assert.equal(invalidSnapshot.lanes.shock.transport.status, '未知');
});

test('zero values are valid, transport states stay scoped, and stale snapshots are labeled', () => {
  const zero = buildFourLaneReadout(snapshot({
    displayInputsBaseline: { ...baseline, vix: 0, brent: 0 },
    macroDrivers: { credit: { hyOas: 0, igOas: 0, nfci: 0, sourceObservedAt: {} }, energyTransport: {} },
  }), now);
  assert.equal(zero.lanes.continuous.evidence.find((e) => e.key === 'hyOas').value, 0);
  assert.equal(zero.lanes.continuous.evidence.find((e) => e.key === 'vix').value, 0);

  const blocked = buildFourLaneReadout(snapshot({
    transportShockScoringImpact: { applied: false, contributionPct: 0, reason: 'candidate_not_eligible_zero_contribution' },
  }), now);
  assert.equal(blocked.lanes.shock.transport.counted, true);
  assert.equal(blocked.lanes.shock.transport.applied, false);
  assert.equal(blocked.lanes.shock.transport.status, '未记录触发/阻塞');

  const stale = buildFourLaneReadout(snapshot(), Date.parse('2026-10-25T08:00:00Z'));
  assert.equal(stale.lanes.shock.tail[0].status, '历史快照记录');
  assert.equal(stale.lanes.shock.transport.status, '历史快照记录');
  assert.equal(stale.lanes.credibility.snapshot.status, 'stale');
});
