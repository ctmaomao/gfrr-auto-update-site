import test from 'node:test';
import assert from 'node:assert/strict';
import { worldOrderSourceClock, worldOrderSourceDisclosure } from '../../scripts/modules/worldOrderSourceDisplay.js';
const now = Date.parse('2026-11-13T12:00:00Z');
const wo = { updatedAt: '2026-11-13T07:00:00Z', score: 52, externalSources: {
  acled: { summary: { sourceFreshness: 'fresh', monthlySourceFreshness: 'expired' } },
  gdelt: { lastFetchedAt: '2026-09-23T01:14:09Z' },
  gdeltEvents: { status: 'stale', summary: { windowStartDay: '20261001', windowEndDay: '20261007', quarantinedRows: 0 } }
} };
test('source clocks distinguish generation, retrieval and observation; elapsed time advances without mutating data', () => {
  const before = structuredClone(wo);
  assert.match(worldOrderSourceClock(wo, now), /生成：2026-11-13 07:00 UTC.*已过5小时.*不是各源共同观察日/);
  assert.match(worldOrderSourceClock(wo, now + 86400000), /已过29小时/);
  const text = worldOrderSourceDisclosure(wo, now);
  assert.match(text, /ACLED 周表时效：新鲜；月表时效：已失效/);
  assert.match(text, /沿用历史窗口.*未知隔离 0 行/);
  assert.match(worldOrderSourceClock(wo, now), /历史 Cloud 摘要最后获取：2026-09-23 01:14 UTC.*已过51天/);
  assert.match(worldOrderSourceClock(wo, now), /获取日不等于事件观察日/);
  assert.deepEqual(wo, before);
});
test('missing, impossible and future clocks never appear fresh or have a negative age', () => {
  for (const value of [null, '', 'invalid', '2026-11-13T07:00:00', '2026-02-30', '2026-11-14T00:00:00Z']) {
    assert.match(worldOrderSourceClock({ updatedAt: value }, now), /本层快照生成时间待核验/);
    assert.match(worldOrderSourceClock({ externalSources: { gdelt: { lastFetchedAt: value } } }, now), /获取时间待核验/);
  }
  assert.match(worldOrderSourceClock(wo, NaN), /本层快照生成时间待核验/);
});
test('failed Events status is not described as a complete window and invalid dates stay unknown', () => {
  const copy = structuredClone(wo);
  copy.externalSources.gdeltEvents.status = 'error';
  copy.externalSources.gdeltEvents.summary.windowEndDay = '20260230';
  const text = worldOrderSourceDisclosure(copy, now);
  assert.match(text, /20261001～待核验；采集状态待确认/);
  assert.doesNotMatch(text, /完整七日/);
});
