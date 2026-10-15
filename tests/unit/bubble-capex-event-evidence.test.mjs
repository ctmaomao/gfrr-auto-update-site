import test from 'node:test';
import assert from 'node:assert/strict';
import {capexEventEvidenceHold,validateCapexEventPublication} from '../../scripts/bubble-watch/capex-event-evidence.mjs';
const today='2026-10-15';
function fixture(){return {id:'capex_reaction',score_role:'core',status:'unknown',as_of:null,stale:false,
  evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today},
  provenance:{mode:'auto',checkedAt:`${today}T07:25:00Z`,detail:capexEventEvidenceHold(today)}};}
test('unadmitted complete latest earnings adapter publishes only a fixed-four gap',()=>{
 const card=fixture();assert.deepEqual(validateCapexEventPublication(card,today),[]);
 assert.deepEqual(card.provenance.detail.companies,['MSFT','META','AMZN','GOOGL']);
 assert.equal(card.provenance.detail.qualifiedEventCount,0);
 for(const status of ['red','yellow','green']){const c=fixture();c.status=status;assert.ok(validateCapexEventPublication(c,today).length);}
});
test('manual approvals, prices and parameters cannot unlock or contaminate a pending proof',()=>{
 for(const key of ['approved','latestConfirmed','prices','threshold','events','sourceReviewId']){
  const c=fixture();c.provenance.detail[key]=true;assert.ok(validateCapexEventPublication(c,today).length,key);
 }
 for(const mutate of [d=>d.companies.pop(),d=>d.companies.reverse(),d=>d.qualifiedEvents.push({symbol:'MSFT'}),
 d=>d.qualifiedEventCount=4,d=>d.missingRequirements.pop(),d=>d.adapterStatus='approved',d=>d.numericThresholdStatus='approved',
 d=>d.legacyRollingReturnsEligible=true,d=>d.newsCountEligible=true,d=>d.checkedDate='2026-10-16']){
  const c=fixture();mutate(c.provenance.detail);assert.ok(validateCapexEventPublication(c,today).length);
 }
});
test('null observations and exact check dates cannot be replaced with quotes or stale clocks',()=>{
 for(const mutate of [c=>c.as_of=today,c=>c.stale=true,c=>c.provenance.mode='curated',
 c=>c.provenance.checkedAt='2026-10-14T07:25:00Z',c=>c.provenance.checkedAt='2026-10-15T99:25:00Z',
 c=>c.evidence_gap.reasonCode='other',c=>c.evidence_gap.checkedDate='2026-10-14']){
 const c=fixture();mutate(c);assert.ok(validateCapexEventPublication(c,today).length);}
 for(const invalid of [null,'2026-02-30','2026-13-15','2026-10-15T00:00:00Z']){
 assert.throws(()=>capexEventEvidenceHold(invalid),/Invalid capex check date/u);
 assert.ok(validateCapexEventPublication(fixture(),invalid).length);}
});


test('check clocks reject normalized invalid calendar days and midnight rollover',()=>{
  for(const [checkDate,clock] of [['2026-03-02','2026-02-30T07:25:00Z'],['2026-10-15','2026-10-14T24:00:00Z'],
    ['2026-10-15','2026-10-15T24:00:00Z']]){
    const card=fixture();card.provenance.checkedAt=clock;
    card.provenance.detail=capexEventEvidenceHold(checkDate);card.evidence_gap.checkedDate=checkDate;
    assert.ok(validateCapexEventPublication(card,checkDate).includes('capex check clock invalid'));
  }
  const card=fixture();card.provenance.checkedAt=`${today}T07:25:00.000Z`;
  assert.deepEqual(validateCapexEventPublication(card,today),[]);
});
