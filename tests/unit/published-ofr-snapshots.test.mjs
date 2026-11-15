import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent } from '../../scripts/daily/ofr-publication-contract.mjs';
import { inspectPublishedOfr } from '../../scripts/lib/published-ofr-snapshots.mjs';
import { inspectContent, probePublishedSnapshots, SITES, TARGETS } from '../../scripts/lib/published-snapshots.mjs';

// Synthetic dated observations, never production data or evidence of accuracy.
const time = '2026-11-07T12:00:00Z';
const now = Date.parse(time);
function component(value = -2) {
  const rows = [{ date: '2026-10-28', value: -1 }, { date: '2026-11-04', value }];
  const readout = buildOfrReadout(rows, { asOf: time, retrievedAt: time, snapshotSha256: 'a'.repeat(64) });
  return buildPublishedOfrComponent({ readout, rows, now: time });
}
const inspect = (mainPressureReadout, clock = now) => inspectPublishedOfr({ mainPressureReadout }, clock);

test('raw negative and true zero retain dated weekly endpoints', () => {
  for (const value of [-2, 0]) {
    const c = component(value), result = inspect(c);
    assert.deepEqual(result.errors, []);
    assert.equal(result.sources[0].observedAt, '2026-11-04');
    assert.equal(result.sources[0].retrievedAt, time);
    assert.equal(result.sources[0].currentEligibleAtCheck, true);
    assert.equal(c.weeklyChange.value, value + 1);
  }
});
test('missing migration component is rejected; legacy snapshots stay supported', () => {
  assert.deepEqual(inspectPublishedOfr({}, now), { errors: [], sources: [] });
  for (const marker of [{ advicePolicy: {} }, { scoreRole: 'legacy_model_audit_only' }, { legacyModelAudit: {} }, { legacyModelAudit: null }]) {
    assert.deepEqual(inspectPublishedOfr(marker, now).errors, ['ofr_readout_missing']);
  }
  assert.deepEqual(inspect(null).errors, ['ofr_contract_invalid']);
});
test('current freshness is UTC calendar age, not payload age or receipt age', () => {
  const c = component();
  const day7 = inspect(c, Date.parse('2026-11-11T23:59:59Z')).sources[0];
  assert.equal(day7.ageExceeded, false); assert.equal(day7.currentEligibleAtCheck, true);
  const day8 = inspect(c, Date.parse('2026-11-12T00:00:00Z')).sources[0];
  assert.equal(day8.ageExceeded, true); assert.equal(day8.currentEligibleAtCheck, false);
  assert.equal(c.index.ageDays, 3);
});
test('cached, stale, missing and unavailable remain explicit without zero substitution', () => {
  const first = component();
  for (const [c, status] of [
    [buildPublishedOfrComponent({ previous: first, now: '2026-11-08T12:00:00Z' }), 'cached'],
    [buildPublishedOfrComponent({ previous: first, now: '2026-11-12T12:00:00Z' }), 'stale'],
    [component(null), 'missing_current'],
    [buildPublishedOfrComponent({ now: time }), 'unavailable']
  ]) {
    const result = inspect(c, Date.parse(c.asOf));
    assert.deepEqual(result.errors, []);
    assert.equal(result.sources[0].status, status);
    assert.equal(result.sources[0].currentEligibleAtCheck, false);
  }
});
test('future publication and malformed contracts fail without leaking source text', () => {
  assert.ok(inspect(component(), now - 3600000).errors.includes('ofr_time_future'));
  const c = component(); c.index.ageDays = 0; c.retrieval.error = 'SECRET';
  assert.deepEqual(inspect(c).errors, ['ofr_contract_invalid']);
  assert.doesNotMatch(JSON.stringify(inspect(c)), /SECRET/);
});
test('weekly arithmetic, missing endpoint and target-date corruption fail independently', () => {
  for (const mutate of [
    c => { c.weeklyChange.value = 123; },
    c => { c.history.shift(); },
    c => { c.history[0].value = -9; },
    c => { c.weeklyChange.targetDate = '2026-10-27'; }
  ]) {
    const c = component(); mutate(c);
    assert.ok(inspect(c).errors.includes('ofr_weekly_history_mismatch'));
  }
});
test('both-site delivery probe warns on cached/missing OFR without extra requests or outages', async () => {
  for (const c of [component(null), buildPublishedOfrComponent({ previous: component(), now: time }), oldComponent(62), oldComponent(91)]) {
    const texts = Object.fromEntries(TARGETS.map(t => [t.path, t.kind === 'html' ? '<script src="scripts/app.js?v=test"></script>' : t.kind === 'script' ? "const APP_VERSION = 'test';" : JSON.stringify({ [t.clock]: time, score: 50, modules: {}, mainPressureReadout: c, externalSources: {}, evidence: {}, sourceStatus: {} })]));
    const baseline = Object.fromEntries(TARGETS.map(t => [t.path, { text: texts[t.path], committedAt: time }]));
    let calls = 0;
    const result = await probePublishedSnapshots({ baseline, now, fetchImpl: async url => {
      calls++; const site = SITES.find(s => url.startsWith(s.base)); assert.ok(site);
      return new Response(texts[url.slice(site.base.length)]);
    } });
    assert.equal(calls, 12); assert.equal(result.status, 'warn');
    for (const row of result.rows.filter(r => r.path === 'data/radar-data.json')) {
      assert.deepEqual(row.errors, []); assert.ok(row.warnings.includes('source_degraded'));
    }
  }
});
test('radar inspector exposes OFR errors even with fresh root snapshot', () => {
  const target = TARGETS.find(t => t.kind === 'radar');
  const c = component(); c.weeklyChange.value = 99;
  const result = inspectContent(target, JSON.stringify({ score: 50, modules: {}, updatedAt: time, mainPressureReadout: c }), now);
  assert.ok(result.errors.includes('ofr_weekly_history_mismatch'));
  assert.ok(!result.errors.includes('snapshot_stale'));
});

function oldComponent(ageDays) {
  const day = n => new Date(Date.parse(time.slice(0, 10)) - n * 86400000).toISOString().slice(0, 10);
  const rows = [{ date: day(ageDays + 7), value: -1 }, { date: day(ageDays), value: -2 }];
  const readout = buildOfrReadout(rows, { asOf: time, retrievedAt: time, snapshotSha256: 'a'.repeat(64) });
  return buildPublishedOfrComponent({ readout, rows, now: time });
}
test('legitimate stale histories trimmed at publication are unverifiable, not contradictory', () => {
  for (const age of [62, 63, 64, 91]) {
    const c = oldComponent(age), result = inspect(c);
    assert.equal(c.status, 'stale');
    assert.deepEqual(result.errors, []);
    assert.equal(result.sources[0].weeklyHistoryStatus, 'unverifiable_retention');
    assert.equal(result.sources[0].ageExceeded, true);
    assert.equal(result.sources[0].currentEligibleAtCheck, false);
  }
});
test('retention boundary is inclusive and anchored to publication, never monitor time', () => {
  const c = oldComponent(56); // fromDate is exactly 63 days old and must remain.
  assert.equal(inspect(c).sources[0].weeklyHistoryStatus, 'verified_internal');
  c.history.shift();
  for (const clock of [now, now + 100 * 86400000]) {
    assert.ok(inspect(c, clock).errors.includes('ofr_weekly_history_mismatch'));
  }
  const missingTo = oldComponent(62); missingTo.history = [];
  assert.ok(inspect(missingTo).errors.includes('ofr_weekly_history_mismatch'));
});
test('trimmed history never excuses target corruption or retained numeric contradictions', () => {
  const target = oldComponent(91); target.weeklyChange.targetDate = '2026-01-01';
  assert.ok(inspect(target).errors.includes('ofr_weekly_history_mismatch'));
  const fromOnly = oldComponent(91);
  fromOnly.history = [{ date: fromOnly.weeklyChange.fromDate, value: -9 }];
  assert.ok(inspect(fromOnly).errors.includes('ofr_weekly_history_mismatch'));
  const both = oldComponent(91);
  both.history = [{ date: both.weeklyChange.fromDate, value: -1 }, { date: both.weeklyChange.toDate, value: -2 }];
  both.weeklyChange.value = 8;
  assert.ok(inspect(both).errors.includes('ofr_weekly_history_mismatch'));
});