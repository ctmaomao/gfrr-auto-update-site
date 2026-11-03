import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOctoberCapexPanel,latestOctoberQuarter,octoberGuidance,octoberTiming,OCTOBER_CAPEX_EVENTS as events} from '../../scripts/bubble-watch/capex-october-panel.mjs';
import {replayQuarterlyCapexPanel} from '../../scripts/bubble-watch/capex-quarterly-replay.mjs';
import {validateQuarterlyCapexPublication,QUARTERLY_CAPEX_LABELS,QUARTERLY_CAPEX_SOURCE,QUARTERLY_CAPEX_THRESHOLD} from '../../scripts/bubble-watch/capex-quarterly-publication.mjs';
import {collectQuarterlyCapexPanel} from '../../scripts/bubble-watch/capex-quarterly-panel.mjs';
import {clauses,transcript,primary,schedule,comparison,listing,transport} from '../helpers/bubble-capex-october-fixtures.mjs';
const today='2026-11-03',now=()=>Date.parse('2026-11-03T08:00:00Z');
const collect=async options=>{const t=transport(options);return {t,p:await collectOctoberCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn})};};
test('new admission defaults offline; legacy collector still rejects the new quarter',async()=>{
 const p=await collectOctoberCapexPanel({today,now,fetchFn:()=>{throw Error('network');}});assert.equal(p.requests.length,0);assert.equal(p.decision.status,'unknown');assert.equal(p.productionEligible,false);
 const t=transport(),legacy=await collectQuarterlyCapexPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn});assert.equal(t.calls.length,4);assert.ok(legacy.companies.every(row=>row.gaps.includes('latest_quarter_not_reviewed')));
});
test('October collector binds complete four-company evidence, prior basis and one common QQQ request',async()=>{
 const {t,p}=await collect();assert.equal(t.calls.length,20);assert.equal(t.calls.filter(url=>url.includes('/chart/QQQ?')).length,1);assert.deepEqual(p.sourceFailures,[]);
 assert.ok(p.companies.every(row=>row.status==='qualified'&&!row.gaps.length));assert.equal(p.companies[0].guidance.status,'lowered_or_mixed');
 assert.equal(p.companies[1].guidance.status,'lower_bound_raised');assert.ok(p.companies.slice(2).every(row=>row.guidance.status==='unchanged'));
 assert.deepEqual(p.decision,{status:'yellow',raisedCount:1,punishedCount:0,rewardedCount:0});
 assert.deepEqual(replayQuarterlyCapexPanel(p,today,{now}),{ok:true,errors:[],decision:p.decision});
 assert.ok(p.companies.every(row=>row.timing.firstGuidanceDisclosureVerified===false&&row.window.capexCausalityEstablished===false));
 assert.equal(p.companies[0].window.beforeDate,'2026-10-28');assert.equal(p.companies[0].window.afterDate,'2026-10-29');
 assert.equal(p.companies[1].window.afterDate,'2026-10-22');assert.equal(p.companies[2].window.afterDate,'2026-10-30');
});
test('quarter catalog refuses newer, ambiguous, foreign and empty listings',()=>{
 for(const s of Object.keys(events)){
  assert.equal(latestOctoberQuarter(listing(s),s).id,events[s].id);
  for(const body of ['',listing(s).replace(events[s].id,'999999-q4-2027'),listing(s)+listing(s).replace(events[s].id,events[s].id.replace(/^\d+/u,'999999')),listing(s).replace(`/stocks/${s.toLowerCase()}/`,'/stocks/other/')])assert.throws(()=>latestOctoberQuarter(body,s));
  assert.throws(()=>latestOctoberQuarter(listing(s)+`<a href="/stocks/${s.toLowerCase()}/transcripts/unparsed-q5-2027/">New event</a>`,s));
  assert.throws(()=>latestOctoberQuarter(listing(s)+`<a href='/stocks/${s.toLowerCase()}/transcripts/unparsed-new/'>Earnings Call: Q1 2028</a>`,s));
  assert.equal(latestOctoberQuarter(listing(s)+`<a href="/stocks/${s.toLowerCase()}/transcripts/999999-technology-conference-2026/">Technology Conference</a>`,s).id,events[s].id);
 }
});
test('guidance preserves current/prior endpoints and rejects wrong year, duplicate or changed facts',()=>{
 for(const s of Object.keys(events)){
  assert.doesNotThrow(()=>octoberGuidance(transcript(s),s));
  assert.throws(()=>octoberGuidance(transcript(s).replace(clauses[s],clauses[s]+' '+clauses[s]),s));
  assert.throws(()=>octoberGuidance(transcript(s).replace('eventDate:','changedDate:'),s));
 }
 for(const [s,from,to]of[['MSFT','$170','$175'],['META','$135','$136'],['AMZN','$220','$225'],['GOOGL','$205','$210']])assert.throws(()=>octoberGuidance(transcript(s).replace(from,to),s));
 assert.throws(()=>octoberGuidance(transcript('META').replace('anticipate 2026','anticipate 2027'),'META'));
 assert.throws(()=>octoberGuidance(transcript('MSFT').replace('finance leases in capex','operating leases in capex'),'MSFT'));
});
test('official call anchors, authentic publication clocks and prior MSFT classification are required',()=>{
 for(const s of Object.keys(events))assert.doesNotThrow(()=>octoberTiming(primary[s],schedule[s],s==='MSFT'?comparison:null,s));
 assert.throws(()=>octoberTiming(primary.MSFT,schedule.MSFT,comparison.replace('$175','$170'),'MSFT'));
 assert.throws(()=>octoberTiming(primary.MSFT,schedule.MSFT.replace('2:30','9:30'),comparison,'MSFT'));
 assert.throws(()=>octoberTiming(primary.META.replace('21:01:00','22:01:00'),null,null,'META'));
 assert.throws(()=>octoberTiming(primary.META.replace('$135','$136'),null,null,'META'));
 assert.throws(()=>octoberTiming(primary.GOOGL.replace('21:05:00','20:45:00'),null,null,'GOOGL'));
 assert.throws(()=>octoberTiming(primary.AMZN.replace('October 29','July 30'),schedule.AMZN,null,'AMZN'));
});
test('unchanged issuers never become punished raises; exact -5pp stays outside punishment',async()=>{
 for(const [metaAfter,punished,rewarded]of[[95,0,0],[94.999,1,0],[107,0,1]]){
  const {p}=await collect({metaAfter});assert.equal(p.decision.raisedCount,1);assert.equal(p.decision.punishedCount,punished);assert.equal(p.decision.rewardedCount,rewarded);
  assert.equal(p.decision.status,'yellow');assert.equal(replayQuarterlyCapexPanel(p,today,{now}).ok,true);
 }
});
test('independent replay rejects changes to all proof layers and forbids raw or credential fields',async()=>{
 const {p}=await collect();
 const mutations=[r=>r.registryId='unreviewed',r=>r.schemaVersion='bubble-quarterly-capex-panel-v1',r=>r.companies.pop(),r=>r.companies[0].symbol='META',
  r=>r.companies[0].catalog.id='old-quarter',r=>r.companies[0].guidance.previous=[170,170],r=>r.companies[1].guidance.current=[135,150],
  r=>r.companies[0].timing.comparisonUrl=events.MSFT.primary,r=>r.companies[0].timing.comparisonDigest='0'.repeat(64),r=>r.companies[3].timing.anchorAt='2026-10-28T20:45:00Z',
  r=>r.companies[0].window.afterDate='2026-10-30',r=>r.companies[0].prices.excessReturnPp=0,r=>r.companies[0].prices.stock[0].volume=0,
  r=>r.companies[0].prices.qqq[0].adjustedClose=99,r=>r.requests.pop(),r=>r.requests[0].url='https://unreviewed.example/',
  r=>r.requests[0].sha256='bad',r=>r.requests[0].checkedAt='2026-11-04T00:00:00.000Z',r=>r.requests[0].authorization='private',
  r=>r.budget.applicationRetries=1,r=>r.budget.maximumRequests=21,r=>r.budget.totalBytes++,r=>r.budget.redirects='follow',r=>r.budget.totalBudgetExhausted=true,
  r=>r.checkedAt='2026-11-03T09:00:00.000Z',r=>r.sourceFailures.push({reason:'http_403'}),r=>r.scoringEligible=true,r=>r.rawHtml='raw',r=>r.companies[0].guidance.rawText='raw',
  r=>r.companies[0].timing.capexCausalityEstablished=true,r=>r.decision.status='green'];
 for(const mutate of mutations){const copy=structuredClone(p);mutate(copy);assert.equal(replayQuarterlyCapexPanel(copy,today,{now}).ok,false,mutate.toString());}
 assert.equal(replayQuarterlyCapexPanel(p,'2027-03-01',{now:()=>Date.parse('2027-03-01T12:00:00Z')}).ok,false);
});
test('HTTP host circuit, response and cumulative streaming budgets stay fail closed without retry',async()=>{
 const blocked=await collect({blockHost:'stockanalysis.com'});assert.equal(blocked.t.calls.length,1);assert.equal(blocked.p.sourceFailures.length,1);assert.equal(blocked.p.decision.status,'unknown');
 const tooLarge=await collect({oversize:true});assert.equal(tooLarge.p.decision.status,'unknown');assert.ok(tooLarge.p.sourceFailures.length>0);
 const cumulative=await collect({largeBodies:true});assert.equal(cumulative.p.budget.totalBudgetExhausted,true);assert.equal(cumulative.p.decision.status,'unknown');assert.ok(cumulative.t.calls.length<20);
 const expired=await collectOctoberCapexPanel({allowNetwork:true,today:'2027-03-01',now:()=>Date.parse('2027-03-01T12:00:00Z'),fetchFn:()=>{throw Error('unexpected');}});assert.equal(expired.requests.length,0);
});
test('publication accepts only fully replayed October evidence with the original observation date',async()=>{
 const {p}=await collect();const card={id:'capex_reaction',score_role:'core',status:p.decision.status,as_of:'2026-10-29',stale:false,
  value_display:QUARTERLY_CAPEX_LABELS[p.decision.status],source_name:QUARTERLY_CAPEX_SOURCE,threshold_text:QUARTERLY_CAPEX_THRESHOLD,
  provenance:{mode:'auto',checkedAt:p.checkedAt,detail:p}};
 assert.deepEqual(validateQuarterlyCapexPublication(card,today,{now}),[]);
 for(const mutate of[c=>c.as_of=today,c=>c.status='green',c=>c.evidence_gap={},c=>c.provenance.detail.companies[0].guidance.current=[175,175]]){
  const copy=structuredClone(card);mutate(copy);assert.ok(validateQuarterlyCapexPublication(copy,today,{now}).length);
 }
});
