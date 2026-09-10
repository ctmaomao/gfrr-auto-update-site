import test from 'node:test';
import assert from 'node:assert/strict';
import { acledFreshness, acledExpiryBlocks, applyAcledFreshness } from '../../scripts/world-order/acled-freshness.mjs';
import { scoreWorldOrderStress } from '../../scripts/world-order/score-world-order-stress.mjs';
const source={status:'ok',confidence:0.9,summary:{latestWeek:'2026-08-28',monthlyAsOfDate:'2026-08-21',eventsDelta4Vs12:0.1,fatalitiesLast4Weeks:1000,civilianTargetingShareLast4Weeks:0.1},warnings:[],evidence:[{confidence:0.9}]};
const score=acled=>scoreWorldOrderStress({externalSources:{acled,gdelt:{status:'ok',confidence:0.75,summary:{}},ofac:{status:'ok',confidence:0.8,summary:{}},sipri:{status:'ok',confidence:0.85,summary:{}}},marketConfirmation:{score:0,confidence:1,evidence:[]},dataPayload:{modules:{}},rules:{}});
test('source aging reaches status, confidence, warnings and actual overlay contribution',()=>{
  const before=structuredClone(source);
  const fresh=applyAcledFreshness(source,Date.parse('2026-09-10T00:00:00Z'));
  const stale=applyAcledFreshness(source,Date.parse('2026-10-01T00:00:00Z'));
  const expired=applyAcledFreshness(source,Date.parse('2027-03-10T00:00:00Z'));
  assert.equal(fresh.status,'ok'); assert.equal(fresh.confidence,0.9);
  assert.equal(stale.status,'partial'); assert.ok(stale.confidence<fresh.confidence && stale.confidence>0);
  assert.equal(expired.status,'partial'); assert.equal(expired.confidence,0); assert.equal(expired.warnings.length,2);
  const value=s=>score(s).dimensions.peaceDividendRetreat.evidence[1].value;
  assert.ok(value(stale)<value(fresh)); assert.equal(value(expired),0);
  assert.ok(score(expired).confidence<=0.75);
  assert.equal(expired.summary.latestWeek,source.summary.latestWeek); assert.deepEqual(source,before);
});
test('cadence boundaries reject future and invalid dates',()=>{
  const now=Date.parse('2026-09-10T00:00:00Z');
  assert.equal(acledFreshness('2026-08-28','weekly',now),'fresh');
  assert.equal(acledFreshness('2026-08-27','weekly',now),'aging');
  assert.equal(acledFreshness('2026-08-10','weekly',now),'stale');
  for(const date of [null,'2026-02-30','2026-09-11'])assert.equal(acledFreshness(date,'weekly',now),'expired');
});
test('monthly-only aging never substitutes a placeholder for available weekly evidence',()=>{
  const now=Date.parse('2026-09-10T00:00:00Z');
  const value=s=>score(s).dimensions.peaceDividendRetreat.evidence[1].value;
  const expected=value(applyAcledFreshness(source,now));
  for(const monthlyAsOfDate of ['2026-07-31','2025-01-01']) {
    const result=applyAcledFreshness({...source,summary:{...source.summary,monthlyAsOfDate}},now);
    assert.equal(result.status,'partial'); assert.equal(result.summary.sourceFreshness,'fresh');
    assert.equal(value(result),expected);
  }
});
test('operator expiry gate stays strict while runtime retains valid historical files',()=>{
  for(const [cadence,limit] of [['weekly',90],['monthly',180]]){
    assert.equal(acledExpiryBlocks(limit,cadence),false);
    assert.equal(acledExpiryBlocks(limit+1,cadence),true);
    assert.equal(acledExpiryBlocks(limit+1,cadence,true),false);
  }
  for(const status of ['error','manual_required']){const input={status};assert.equal(applyAcledFreshness(input),input);}
});
