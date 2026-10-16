import test from 'node:test';
import assert from 'node:assert/strict';
import {collectQuarterlyCapexPanel,QUARTERLY_CAPEX_EVENTS as events,latestQuarter,quarterlyGuidance,quarterlyTiming,quarterlyPanelDecision,quarterlyPriceReaction} from '../../scripts/bubble-watch/capex-quarterly-panel.mjs';
import {replayQuarterlyCapexPanel} from '../../scripts/bubble-watch/capex-quarterly-replay.mjs';
import {quarterlyCapexHold,validateQuarterlyCapexPublication,QUARTERLY_CAPEX_LABELS,QUARTERLY_CAPEX_SOURCE,QUARTERLY_CAPEX_THRESHOLD} from '../../scripts/bubble-watch/capex-quarterly-publication.mjs';
const today='2026-10-16',now=()=>Date.parse('2026-10-16T08:00:00Z');
import {clauses,transcript,primary,schedule,listing,transport} from '../helpers/bubble-capex-quarterly-fixtures.mjs';
test('default is offline, fixed four, unknown and never production eligible',async()=>{
 const r=await collectQuarterlyCapexPanel({today,now,fetchFn:()=>{throw Error('network');}});
 assert.equal(r.budget.actualRequests,0);assert.equal(r.companies.length,4);assert.equal(r.decision.status,'unknown');assert.equal(r.productionEligible,false);assert.equal(r.scoringEligible,false);
});
test('actual collector binds catalog/call/official timing and all matched prices',async()=>{
 const t=transport(),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 assert.equal(t.calls.length,19);assert.equal(t.calls.filter(u=>u.includes('/chart/QQQ?')).length,1);assert.deepEqual(r.sourceFailures,[]);
 assert.deepEqual(r.decision,{status:'yellow',raisedCount:3,punishedCount:2,rewardedCount:1});
 assert.ok(r.companies.every(c=>c.status==='qualified'&&c.gaps.length===0&&c.prices.stock.length===2&&c.prices.qqq.length===2));
 assert.equal(r.companies[0].guidance.status,'economic_investment_unchanged');assert.equal(r.companies[1].guidance.status,'lower_bound_raised');
 assert.equal(r.companies[2].window.afterDate,'2026-07-31');assert.equal(r.companies[3].window.beforeDate,'2026-07-22');
 assert.ok(!JSON.stringify(r).includes('We now believe'));assert.ok(r.companies.every(c=>!Object.hasOwn(c.window,'originalPublishedAt')&&c.timing.firstGuidanceDisclosureVerified===false));
 assert.deepEqual(replayQuarterlyCapexPanel(r,today,{now}),{ok:true,errors:[],decision:r.decision});
});
test('complete replay refuses mutated facts, windows, selected prices, claims and source joins',async()=>{
 const t=transport(),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 const mutations=[p=>p.companies.pop(),p=>p.companies[0].guidance.status='raised',p=>p.companies[1].guidance.current[0]=140,
  p=>p.companies[2].timing.anchorAt='2026-07-30T13:00:00Z',p=>p.companies[2].window.afterDate='2026-07-30',p=>p.companies[1].prices.excessReturnPp=10,
  p=>p.companies[1].prices.qqq[0].date='2026-07-28',p=>p.companies[0].catalog.sourceDigest='0'.repeat(64),p=>p.requests[0].url='https://unreviewed.invalid/',
  p=>p.requests[1].status='failed',p=>p.decision.status='red',p=>p.firstGuidanceDiscoveryComplete=true,p=>p.companies[0].timing.firstGuidanceDisclosureVerified=true,
  p=>p.companies[1].guidance.sourceRole='official',p=>p.budget.applicationRetries=1,p=>p.checkedAt='2026-10-15T08:00:00.000Z',p=>p.requests[0]=null,
  p=>p.checkedAt='2026-10-16T23:59:59.999Z',p=>p.requests[0].checkedAt='2026-10-16T23:59:59.999Z',p=>p.budget.maximumRequests=1000,
  p=>p.budget.requestTimeoutMs=9999999,p=>p.budget.responseMaxBytes=9999999,p=>p.budget.totalMaxBytes=9999999,
  p=>p.rawBody='raw',p=>p.companies[0].guidance.rawHtml='raw',p=>p.requests[0].authorization='private',p=>p.budget.private='private',
  p=>p.companies[0].catalog.raw='raw',p=>p.companies[0].timing.raw='raw',p=>p.companies[0].raw='raw',p=>p.companies[0].prices.stock[0].raw='raw',p=>p.limitation='private'];
 for(const mutate of mutations){const p=structuredClone(r);mutate(p);const result=replayQuarterlyCapexPanel(p,today,{now});assert.equal(result.ok,false);assert.equal(result.decision.status,'unknown');}
 assert.equal(replayQuarterlyCapexPanel(null,today).ok,false);
});
test('latest unreviewed catalog quarter holds, without reading older transcripts or prices',async()=>{
 const t=transport({newQuarter:true}),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 assert.equal(t.calls.length,4);assert.ok(r.companies.every(c=>c.gaps.includes('latest_quarter_not_reviewed')));assert.equal(r.decision.status,'unknown');
 assert.throws(()=>latestQuarter(listing('AMZN'),'META'),/quarter_catalog_unusable/u);
 assert.throws(()=>latestQuarter(listing('META')+'<a href="/stocks/meta/transcripts/999999-q3-2026/">New</a>','META'),/latest_quarter_not_reviewed/u);
 assert.throws(()=>latestQuarter(listing('META')+'<a href="/stocks/meta/transcripts/999999-q2-2026/">Other</a>','META'),/quarter_catalog_ambiguous/u);
 assert.doesNotThrow(()=>latestQuarter(listing('META')+listing('META'),'META'));
});
test('host 403 opens circuit across all companies, with no retry',async()=>{
 const t=transport({blockHost:'stockanalysis.com'}),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 assert.equal(t.calls.length,1);assert.equal(r.sourceFailures.length,1);assert.equal(r.decision.status,'unknown');assert.equal(r.budget.applicationRetries,0);
});
test('body cap isolates oversized responses',async()=>{
 const t=transport({oversize:true}),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 assert.equal(r.decision.status,'unknown');assert.ok(r.sourceFailures.length>0);assert.ok(r.budget.totalBytes<=12*1024*1024+2*1024*1024+1);
});
test('cumulative byte exhaustion prevents all later network requests',async()=>{
 const t=transport({largeBodies:true}),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 assert.equal(t.calls.length,7);assert.equal(r.budget.totalBudgetExhausted,true);assert.equal(r.decision.status,'unknown');assert.ok(r.companies.slice(2).every(c=>c.gaps.includes('request_budget_exhausted')));
});
test('issuer, event date, year, annual basis and both endpoints cannot drift',()=>{
 for(const s of Object.keys(events)){
  assert.doesNotThrow(()=>quarterlyGuidance(transcript(s),s));
  assert.throws(()=>quarterlyGuidance(transcript(s).replace(`eventDate:"${events[s].date}"`,'eventDate:"2026-07-01"'),s),/transcript_event_mismatch/u);
  assert.throws(()=>quarterlyGuidance(transcript(s).replace(`(${s})`,'(OTHER)'),s),/transcript_issuer_mismatch/u);
  assert.throws(()=>quarterlyGuidance(transcript(s).replace('calendar year 2026','calendar year 2027').replace('anticipate 2026','anticipate 2027').replace('CapEx in 2026','CapEx in 2027').replace('full-year 2026','full-year 2027'),s),/guidance_year_not_reviewed/u);
 }
 assert.throws(()=>quarterlyGuidance(transcript('META').replace('$130 billion','$140 billion'),'META'),/reviewed_guidance_changed/u);
 assert.throws(()=>quarterlyGuidance(transcript('AMZN').replace('cash CapEx','revenue'),'AMZN'),/guidance_clause_ambiguous/u);
 assert.throws(()=>quarterlyGuidance(transcript('AMZN')+`<p>${clauses.AMZN}</p>`,'AMZN'),/guidance_clause_ambiguous/u);
 assert.throws(()=>quarterlyGuidance(transcript('MSFT').replace('while operating leases are not','while operating leases are included'),'MSFT'),/lease_reclassification_unexplained/u);
});
test('official timing and actual event identity are required, not transcript import time',()=>{
 for(const s of Object.keys(events)){assert.doesNotThrow(()=>quarterlyTiming(primary[s],schedule[s],s));assert.throws(()=>quarterlyTiming('',schedule[s],s));}
 assert.throws(()=>quarterlyTiming(primary.AMZN,schedule.AMZN.replace('5:00','9:00'),'AMZN'),/official_call_time_unverified/u);
 assert.throws(()=>quarterlyTiming(primary.META.replace('$130-145','$120-145'),null,'META'),/official_guidance_conflict/u);
});
test('green requires affirmative rewards; missing rows and zero raises do not imply green',()=>{
 const pair=(stock,qqq=100)=>({stock:[{adjustedClose:100},{adjustedClose:stock}],qqq:[{adjustedClose:100},{adjustedClose:qqq}]});
 const rows=Object.keys(events).map(symbol=>({symbol,status:'qualified',guidance:{status:symbol==='MSFT'?'economic_investment_unchanged':'raised'},window:{},prices:pair(101,101)}));
 assert.equal(quarterlyPanelDecision(rows).status,'yellow');assert.equal(quarterlyPanelDecision(rows.slice(1)).status,'unknown');
 for(const r of rows)r.prices=pair(107,101);assert.equal(quarterlyPanelDecision(rows).status,'green');
 for(const r of rows)r.prices=pair(95);assert.equal(quarterlyPanelDecision(rows).status,'yellow');
 for(const r of rows)r.prices=pair(94.999);assert.equal(quarterlyPanelDecision(rows).status,'red');
 assert.deepEqual(quarterlyPriceReaction(pair(105)),{rewarded:false,punished:false});assert.deepEqual(quarterlyPriceReaction(pair(95)),{rewarded:false,punished:false});
 for(const r of rows)r.guidance.status='unchanged';assert.equal(quarterlyPanelDecision(rows).status,'unknown');
});
test('expired event cannot reuse old known quarter',async()=>{
 const t=transport(),r=await collectQuarterlyCapexPanel({allowNetwork:true,today:'2026-12-01',now:()=>Date.parse('2026-12-01T08:00:00Z'),fetchFn:t.fetchFn});assert.equal(t.calls.length,0);assert.ok(r.companies.every(c=>c.gaps.includes('quarter_event_expired')));
});
test('r5 source admission accepts a canonical empty hold, never arbitrary failed-report facts',async()=>{
 const card={id:'capex_reaction',score_role:'core',status:'unknown',as_of:null,stale:false,value_display:QUARTERLY_CAPEX_LABELS.unknown,source_name:QUARTERLY_CAPEX_SOURCE,threshold_text:QUARTERLY_CAPEX_THRESHOLD,
  provenance:{mode:'auto',checkedAt:new Date(now()).toISOString(),detail:quarterlyCapexHold(today)},evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today}};
 assert.deepEqual(validateQuarterlyCapexPublication(card,today,{now}),[]);
 for(const mutate of [c=>c.status='green',c=>c.provenance.detail.manualApproved=true,c=>c.provenance.detail.companies.pop(),c=>c.provenance.checkedAt='2026-10-16T23:59:59.999Z',c=>c.as_of=today,c=>c.provenance.detail= {status:'failed'}]){
  const c=structuredClone(card);mutate(c);assert.ok(validateQuarterlyCapexPublication(c,today,{now}).length>0);
 }
 const t=transport(),r=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});
 const valid={...card,status:r.decision.status,as_of:'2026-07-30',value_display:QUARTERLY_CAPEX_LABELS[r.decision.status],provenance:{mode:'auto',checkedAt:r.checkedAt,detail:r}};delete valid.evidence_gap;
 assert.deepEqual(validateQuarterlyCapexPublication(valid,today,{now}),[]);
 for(const mutate of [c=>c.status='red',c=>c.as_of=today,c=>c.provenance.detail.companies[1].prices.excessReturnPp=100,c=>c.provenance.detail.rawBody='raw',c=>c.provenance.detail.companies[0].guidance.rawHtml='raw',c=>c.provenance.detail.requests[0].authorization='private']){const c=structuredClone(valid);mutate(c);assert.ok(validateQuarterlyCapexPublication(c,today,{now}).length>0);}
});
