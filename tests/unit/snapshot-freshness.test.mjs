import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotDisplayHealth} from '../../scripts/modules/snapshotFreshness.js';
const at=Date.parse('2026-09-10T00:00:00Z');
const data={updatedAt:new Date(at).toISOString(),score:80,dailyRealtimeInput:{healthScore:100,sourceMode:'live'}};
test('daily snapshot age changes disclosure without rewriting captured health or risk',()=>{
  const before=structuredClone(data);
  assert.equal(snapshotDisplayHealth(data,at+36*3600000).status,'current');
  const stale=snapshotDisplayHealth(data,at+36*3600000+1);
  assert.equal(stale.status,'stale');assert.match(stale.heroLabel,/历史快照.*采集时健康度 100\/100/);
  assert.doesNotMatch(stale.mastheadLabel,/数据正常|CACHE live/);
  assert.deepEqual(data,before);
});
test('invalid or future dates cannot appear current; numeric zero remains captured zero',()=>{
  for(const updatedAt of [null,'invalid','2026-02-30T00:00:00Z',new Date(at+300001).toISOString()])assert.equal(snapshotDisplayHealth({...data,updatedAt},at).status,'invalid');
  assert.equal(snapshotDisplayHealth({...data,updatedAt:new Date(at+300000).toISOString()},at).status,'current');
  for(const healthScore of [null,undefined,'100',Infinity,-1,101])assert.match(snapshotDisplayHealth({...data,dailyRealtimeInput:{healthScore}},at).collectionLabel,/未知/);
  assert.match(snapshotDisplayHealth({...data,dailyRealtimeInput:{healthScore:0}},at).collectionLabel,/0\/100/);
});
