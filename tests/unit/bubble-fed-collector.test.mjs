import test from 'node:test';import assert from 'node:assert/strict';
import {fedFutureSymbol}from'../../scripts/bubble-watch/qualified-fed-path.mjs';
import {parseReviewedFomcCalendar}from'../../scripts/bubble-watch/fed-calendar-parser.mjs';
import {collectFedMarketPath}from'../../scripts/bubble-watch/fed-market-path-collector.mjs';
import {today,now,calendarHtml,transport}from'../helpers/bubble-fed-source-fixtures.mjs';
test('official calendar parser requires exactly eight paired rows per reviewed year',()=>{
 const html=calendarHtml(),p=parseReviewedFomcCalendar(html,new Date(now()).toISOString());assert.equal(p.years[2027].length,8);assert.equal(p.lastUpdated,'2026-10-07');
 for(const bad of [html.replace('2027 FOMC Meetings','2028 FOMC Meetings'),html.replace('26-27</div>','27-28</div>'),
 html.replace('fomc-meeting__date','other'),html.replace('<div>Last Update','<div class="row fomc-meeting">new</div><div>Last Update'),
 html.replace('October 07, 2026','February 30, 2026')])assert.throws(()=>parseReviewedFomcCalendar(bad,new Date(now()).toISOString()));
});
test('six fixed free requests produce a common isolated NY label and actual matching DFF',async()=>{
 const t=transport(),r=await collectFedMarketPath({today,now,fetchFn:t.fetchFn});
 assert.equal(r.result.status,'red',JSON.stringify(r));assert.equal(r.result.quoteLabelDate,'2026-10-13');assert.equal(r.sourceEvidence.baseline.observedAt,'2026-10-13');
 assert.equal(r.collectionPolicy.actualRequests,6);assert.deepEqual(r.attemptedSources,['calendar','DFF',...['2027-01','2027-02','2027-04','2027-05'].map(fedFutureSymbol)]);
 assert.equal(r.collectionPolicy.applicationRetries,0);assert.deepEqual(r.sourceFailures,[]);assert.deepEqual(r.qualityIssues,[]);
 assert.ok(t.calls.every(c=>c.opts.signal.aborted));
 assert.equal(r.sourceEvidence.quotes.length,4);assert.ok(!JSON.stringify(r).includes('transactions'));
});
test('missing DFF values are skipped as missing observations, never coerced to zero',async()=>{
 const t=transport({csv:'observation_date,DFF\n2026-10-12,4.00\n2026-10-13,\n2026-10-14,4.00'}),r=await collectFedMarketPath({today,now,fetchFn:t.fetchFn});
 assert.equal(r.sourceEvidence.baseline.observedAt,'2026-10-12');assert.equal(r.sourceEvidence.baseline.value,'4.00');
 const empty=transport({csv:'observation_date,DFF\n2026-10-13,.'});const hold=await collectFedMarketPath({today,now,fetchFn:empty.fetchFn});
 assert.equal(hold.result.status,'unknown');assert.equal(hold.sourceEvidence.baseline,null);assert.equal(hold.collectionPolicy.actualRequests,2);
});
test('HTTP authorization and throttle failures stop requests without retries or hidden fallback',async()=>{
 for(const [source,status,count]of [['calendar',403,1],['DFF',500,2],['ZQF27.CBT',429,3]]){
 const t=transport({statusSource:source,status}),r=await collectFedMarketPath({today,now,fetchFn:t.fetchFn});
 assert.equal(r.result.status,'unknown');assert.equal(t.calls.length,count);assert.deepEqual(r.sourceFailures,[{source,reason:`http_${status}`}]);assert.equal(r.result.paths,undefined);
 }
});
test('daily identity, byte caps, UTF8 and timestamp order cannot manufacture a qualified rate',async()=>{
 for(const barMode of ['timezone','oversize','streamOversize','utf8','duplicate','timeout']){
  const t=transport({barMode}),r=await collectFedMarketPath({today,now,fetchFn:t.fetchFn});
  assert.equal(r.result.status,'unknown',barMode);assert.equal(t.calls.length,6);assert.equal(r.result.paths,undefined);
  assert.ok(!JSON.stringify(r).includes('private_body_must_not_leak'));
  if(barMode==='timezone'){assert.equal(r.qualityIssues.length,4);assert.deepEqual(r.sourceFailures,[]);}else assert.equal(r.sourceFailures.length,4);
 }
});
test('changed reviewed schedule is an explicit unsupported policy gap; broken HTML stays source failure',async()=>{
 const changed=transport({html:calendarHtml().replace('26-27</div>','27-28</div>')}),r=await collectFedMarketPath({today,now,fetchFn:changed.fetchFn});
 assert.equal(r.result.status,'unknown');assert.equal(r.collectionPolicy.actualRequests,1);assert.equal(r.qualityIssues[0].reason,'reviewed_schedule_changed');assert.deepEqual(r.sourceFailures,[]);
 const broken=transport({html:'<html>unavailable</html>'}),b=await collectFedMarketPath({today,now,fetchFn:broken.fetchFn});
 assert.deepEqual(b.sourceFailures,[{source:'calendar',reason:'response_unusable'}]);
});
