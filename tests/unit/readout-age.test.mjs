import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildBubbleFreshnessView, evidenceFreshnessAtAudit } from '../../scripts/modules/evidenceAge.js';
import { worldOrderWarningView, tailWarningView } from '../../scripts/modules/independentWarningView.js';
import { buildFourLaneReadout } from '../../scripts/modules/fourLaneReadout.js';

const now = Date.parse('2026-11-23T12:00:00Z');
test('single-file Bubble renderer and offline audit agree across age boundaries and invalid evidence', () => {
  const html = fs.readFileSync('bubble-watch.html', 'utf8');
  const source = html.split('// BEGIN INLINE EVIDENCE AGE')[1].split('\n').slice(1).join('\n').split('// END INLINE EVIDENCE AGE')[0];
  const inline = vm.runInNewContext(`${source}\n buildBubbleFreshnessView`);
  const data = { as_of_date: '2026-11-02', indicators: [
    { id: 'a', as_of: '2026-11-01', provenance: { maxAgeDays: 21 }, stale: false },
    { id: 'b', as_of: '2026-02-30', provenance: { maxAgeDays: 21 } },
    { id: 'c', as_of: '2026-11-03', provenance: {} },
    { id: 'd', as_of: null, provenance: { maxAgeDays: 35 } }
  ] };
  for (const clock of ['2026-11-02', '2026-11-22', '2026-11-23', '2026-12-07', '2026-12-08']) {
    const at = Date.parse(clock + 'T12:00:00Z');
    assert.deepEqual(JSON.parse(JSON.stringify(inline(data, at))), buildBubbleFreshnessView(data, at));
  }
  assert.doesNotMatch(html, /<script[^>]*src=|import .*evidenceAge/);
});
test('issue and individual card clocks are independent and preserve published status', () => {
  const data = { as_of_date: '2026-11-02', indicators: [
    { id: 'green', as_of: '2026-11-01', status: 'green', stale: false, provenance: { maxAgeDays: 21 } },
    { id: 'boundary', as_of: '2026-11-02', stale: false, provenance: { maxAgeDays: 21 } },
    { id: 'no-policy', as_of: '2026-11-02', stale: false, provenance: {} }
  ] };
  const original = JSON.stringify(data), view = buildBubbleFreshnessView(data, now);
  assert.equal(view.issue.status, 'within_policy_age');
  assert.equal(view.cards[0].status, 'stale'); assert.equal(view.cards[0].publishedStale, false);
  assert.equal(view.cards[1].status, 'within_policy_age');
  assert.equal(view.cards[2].status, 'unknown'); assert.match(view.cards[2].label, /政策未记录/);
  assert.equal(JSON.stringify(data), original);
  assert.equal(buildBubbleFreshnessView(data, Date.parse('2026-12-07T23:59:59Z')).issue.status, 'within_policy_age');
  assert.equal(buildBubbleFreshnessView(data, Date.parse('2026-12-08T00:00:00Z')).issue.status, 'stale');
});
for (const date of [null, '2026-02-30', '2026-11-24']) test(`invalid/future card date stays unknown: ${date}`, () => {
  const view = evidenceFreshnessAtAudit({ as_of: date, provenance: { maxAgeDays: 21 } }, new Date(now).toISOString());
  assert.equal(view.status, 'unknown');
});
test('invalid audit clock and publication stale flag do not create freshness', () => {
  assert.equal(buildBubbleFreshnessView({ as_of_date: '2026-11-02' }, NaN).issue.status, 'unknown');
  const card = buildBubbleFreshnessView({ indicators: [{ id: 'a', as_of: '2026-11-23', stale: true, provenance: { maxAgeDays: 21 } }] }, now).cards[0];
  assert.equal(card.status, 'within_policy_age'); assert.equal(card.publishedStale, true);
});
test('world order requires a dated snapshot and exposes partial/old source window', () => {
  const data = { score: 59, updatedAt: '2026-11-23T01:00:00Z', freshness: 'partial', externalSources: { gdeltEvents: { status: 'stale', summary: { windowStartDay: '20261112', windowEndDay: '20261118' } } } };
  const view = worldOrderWarningView(data, now);
  assert.match(view, /部分来源/); assert.match(view, /Events 已过期/); assert.match(view, /2026-11-12 → 2026-11-18/);
  assert.match(worldOrderWarningView({ ...data, updatedAt: '2026-11-20T01:00:00Z' }, now), /历史快照/);
  assert.match(worldOrderWarningView({ ...data, updatedAt: null }, now), /日期无效/);
  assert.match(worldOrderWarningView(null, now), /记录缺失/);
  assert.match(worldOrderWarningView({ ...data, score: null }, now), /分值缺失/);
  assert.match(worldOrderWarningView({ ...data, updatedAt: '2026-11-24T01:00:00Z' }, now), /日期无效/);
});
for (const [name, reasons, expected] of [
  ['missing', undefined, /记录缺失/], ['empty', [], /未记录尾部触发/],
  ['invalid', [{ key: 'invented', floor: 82 }], /全部无效/],
  ['partial', [{ key: 'invented', floor: 82 }, { key: 'energy_inflation_tail', floor: 68 }], /部分或全部无效.*能源/]
]) test(`tail record ${name} retains its identity across current and old snapshots`, () => {
  for (const [updatedAt, qualifier] of [['2026-11-23T01:00:00Z', /本期快照/], ['2026-11-01T01:00:00Z', /历史快照/], ['invalid', /日期无效/]]) {
    const radar = { updatedAt, tailRiskOverlay: { reasons } };
    const shock = buildFourLaneReadout(radar, now).lanes.shock;
    const view = tailWarningView(shock, radar);
    assert.match(view.status, expected); assert.match(view.status, qualifier);
    if (name !== 'empty') assert.doesNotMatch(view.status, /未记录尾部触发/);
    assert.match(view.detail, /不加分OFR/);
  }
});
