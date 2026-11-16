import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrentReleaseStudyCases as build, getFrozenBrentProtocol, normalizeInitialReleaseRecords, BRENT_PROTOCOL_SHA256 } from '../../scripts/oil-directional/brent-release-study-cases.mjs';
const DAY=86400000;
const add=(date,n)=>new Date(Date.parse(date+'T00:00:00.000Z')+n*DAY).toISOString().slice(0,10);
const row=(quoteDate,initialAvailableDate=quoteDate,value=100)=>({quoteDate,initialAvailableDate,value});
const cutoff='2027-01-01T00:00:00.000Z';
function sequence(start,count,step=1){return Array.from({length:count},(_,i)=>row(add(start,i*step),add(start,i*step),Math.exp(4+i*0.01)));}
function batched(start,count,size=5){const rows=sequence(start,count);return rows.map((r,i)=>({...r,initialAvailableDate:rows[Math.min(count-1,Math.floor(i/size)*size+size-1)].quoteDate}));}
const run=(records,more={})=>build({records,retrievalCutoff:cutoff,...more});
const windowAt=(last,batchDate=last)=>sequence(add(last,-20),21).map(r=>({...r,initialAvailableDate:batchDate}));

test('strict dates, positive numbers, exact row shape, and availability chronology reject the whole input',()=>{
  const good=row('2017-01-01');
  for(const bad of [{...good,quoteDate:'2017-02-29'},{...good,initialAvailableDate:'2017-02-30'},{quoteDate:good.quoteDate,value:100},
    {...good,value:0},{...good,value:-1},{...good,value:NaN},{...good,value:Infinity},{...good,value:'100'},
    {...good,raw:'unrecognized'},row('2012-12-27','2012-12-26'),row('2011-01-01','2011-04-05'),row('2027-01-02')]) {
    assert.throws(()=>run([good,bad]));
  }
  for(const retrievalCutoff of ['2027-01-01','2027-02-30T00:00:00.000Z','2027-01-01T00:00:00+00:00'])assert.throws(()=>run([good],{retrievalCutoff}));
  assert.throws(()=>run(Array(20001).fill(good)));
});
test('identical duplicates collapse, conflicting initial values or availability never silently revise',()=>{
  const r=row('2017-01-01');const original=JSON.stringify([r,r]);
  const normalized=normalizeInitialReleaseRecords([r,r],cutoff);assert.equal(normalized.records.length,1);assert.equal(normalized.duplicateCount,1);
  assert.equal(JSON.stringify([r,r]),original);normalized.records[0].value=1;assert.equal(r.value,100);
  assert.throws(()=>run([r,{...r,value:101}]),/Conflicting/);assert.throws(()=>run([r,{...r,initialAvailableDate:'2017-01-02'}]),/Conflicting/);
});
test('protocol is immutable, exact and not a caller-tunable split/lag/model configuration',()=>{
  const p=getFrozenBrentProtocol();assert.equal(BRENT_PROTOCOL_SHA256,'2bc3f54ccda10efe2c72ea734d6dbbd6d130fcd5a606491e136fccf6236757e3');
  p.model.ridgeLambda=0.2;assert.throws(()=>run([row('2017-01-01')],{protocol:p}),/frozen/);
  assert.equal(getFrozenBrentProtocol().model.ridgeLambda,0.1);
});
test('batch issuance is once per advancing latest quote, never per historical row or revision-only batch',()=>{
  const rows=batched('2017-01-01',100), s=run(rows);assert.equal(s.availabilityBatches,20);assert.equal(s.issues.length,20);
  const initial=[row('1987-01-01','2011-04-06'),...windowAt('2011-04-04','2011-04-06'),row('1990-01-01','2011-04-10')];
  const a=run(initial);assert.equal(a.issues.length,1);assert.equal(a.issues[0].issueAt,'2011-04-08T00:00:00.000Z');
  assert.equal(a.skippedBatches[0].reason,'latest_quote_not_advanced');assert.equal(a.issues[0].features.windowCount,21);
});
test('features use only latest 21 quotes known at batch D, even when more records arrive before D+2 issuance',()=>{
  const records=[...windowAt('2017-01-21'),...sequence('2017-01-22',40)];const original=JSON.stringify(records);const s=run(records), issue=s.issues[0];
  assert.equal(issue.issueAt,'2017-01-23T00:00:00.000Z');assert.equal(issue.features.quoteDates.at(-1),'2017-01-21');
  assert.equal(issue.features.values.length,4);assert.ok(Math.abs(issue.features.values[0]-0.01)<1e-12);assert.ok(Math.abs(issue.features.values[1]-0.05)<1e-12);
  assert.ok(Math.abs(issue.features.values[2]-0.2)<1e-12);assert.ok(issue.features.values[3]<1e-12);assert.equal(JSON.stringify(records),original);
});
test('lookback size, span, consecutive gaps and latest-quote age each fail closed without fill',()=>{
  const insufficient=run(sequence('2017-01-01',20)).issues.at(-1);assert.ok(insufficient.features.reasons.includes('insufficient_21_known_quotes'));
  const wide=sequence('2017-01-01',21,3);const wideBatch=wide.map(r=>({...r,initialAvailableDate:wide.at(-1).quoteDate}));
  assert.ok(run(wideBatch).issues[0].features.reasons.includes('lookback_span_exceeded'));
  const gap=[...sequence('2017-01-01',10),...sequence('2017-01-18',11)].map(r=>({...r,initialAvailableDate:'2017-01-28'}));
  assert.ok(run(gap).issues[0].features.reasons.includes('lookback_gap_exceeded'));
  assert.ok(run(windowAt('2017-01-21','2017-02-01')).issues[0].features.reasons.includes('latest_quote_stale_at_issue'));
  assert.equal(insufficient.labels['5'].target,null);
});
test('future anchor is strictly after issue date and endpoint is anchor plus h intervals, not h rows including anchor',()=>{
  const issue=run([...windowAt('2017-01-21'),...sequence('2017-01-22',40)]).issues[0];
  assert.equal(issue.labels['1'].anchorQuoteDate,'2017-01-24');assert.equal(issue.labels['1'].endpointQuoteDate,'2017-01-25');
  assert.equal(issue.labels['5'].endpointQuoteDate,'2017-01-29');assert.equal(issue.labels['20'].endpointQuoteDate,'2017-02-13');
  assert.equal(issue.labels['5'].target,1);
  const ties=run([...windowAt('2017-01-21'),...sequence('2017-01-22',40).map(r=>({...r,value:100}))]).issues[0];
  assert.equal(ties.labels['5'].target,0);assert.equal(ties.labels['5'].targetMeaning,'up_vs_non_up_including_ties');
});
test('future span or missing endpoint never searches farther to repair the fixed label',()=>{
  const future=[row('2017-01-24'),...sequence('2017-02-20',25)];const issue=run([...windowAt('2017-01-21'),...future]).issues[0];
  assert.equal(issue.labels['5'].anchorQuoteDate,'2017-01-24');assert.equal(issue.labels['5'].endpointQuoteDate,'2017-02-24');
  assert.ok(issue.labels['5'].reasons.includes('future_interval_span_exceeded'));assert.equal(issue.labels['5'].target,null);
  const short=run(windowAt('2017-01-21')).issues[0];assert.ok(short.labels['5'].reasons.includes('no_strict_future_anchor'));
  const missing=run([...windowAt('2017-01-21'),row('2017-01-24')]).issues[0];assert.ok(missing.labels['5'].reasons.includes('insufficient_future_quote_intervals'));
});
test('both initial-release availability clocks must mature by explicit retrieval cutoff; no early labels',()=>{
  const rows=[...windowAt('2017-01-21'),row('2017-01-24','2017-02-02'),row('2017-01-25','2017-02-01')];
  const early=run(rows,{retrievalCutoff:'2017-02-03T23:59:59.999Z'}).issues[0].labels['1'];
  assert.equal(early.matureAt,'2017-02-04T00:00:00.000Z');assert.equal(early.target,null);assert.ok(early.reasons.includes('label_not_mature_at_retrieval'));
  const mature=run(rows,{retrievalCutoff:'2017-02-04T00:00:00.000Z'}).issues[0].labels['1'];assert.equal(mature.eligible,true);
  const futureIssue=run([row('2017-01-01')],{retrievalCutoff:'2017-01-01T12:00:00.000Z'}).issues[0];assert.equal(futureIssue.issuedByRetrievalCutoff,false);assert.equal(futureIssue.labels['1'].target,null);
});
test('partition by issue date; endpoint and each conservative availability purge across train/cal/test boundaries',()=>{
  for(const [year,phase,next] of [[2017,'train','calibration'],[2020,'calibration','test'],[2025,'test','secondaryFinalChronologicalHoldout']]) {
    const late=[...windowAt(`${year}-12-18`),row(`${year}-12-21`,`${year}-12-30`),row(`${year}-12-22`,`${year}-12-29`)];
    const purged=run(late).issues[0];assert.equal(purged.phase,phase);assert.ok(purged.labels['1'].reasons.includes('purged_at_phase_boundary'));assert.equal(purged.labels['1'].target,null);
    const early=late.map(r=>r.quoteDate===`${year}-12-21`?{...r,initialAvailableDate:`${year}-12-29`}:r);assert.equal(run(early).issues[0].labels['1'].eligible,true);
    const crossing=run([...windowAt(`${year}-12-27`),row(`${year+1}-01-01`),row(`${year+1}-01-02`)]).issues[0];assert.ok(crossing.labels['1'].reasons.includes('purged_at_phase_boundary'));
    assert.equal(run(windowAt(`${year}-12-30`)).issues[0].phase,next);
  }
});
test('research output cannot imply provider authenticity, current probability, a fitted model or satisfied minimum gates',()=>{
  const s=run(batched('2026-01-01',100));assert.equal(s.mode,'research_only');assert.equal(s.modelFitted,false);
  for(const flag of ['inputAuthenticityVerified','historicalAsOfVerified','quoteCalendarCompletenessVerified','eligibleForPublicProbability','eligibleForMainScore','minimumSampleAndClassGatesEvaluated'])assert.equal(s[flag],false);
  assert.equal(s.noCurrentPredictionFromThisStudy,true);assert.ok(s.issues.every(i=>i.phase==='secondaryFinalChronologicalHoldout'));
});

test('inclusive frozen span/staleness limits hold and input ordering cannot change cases',()=>{
  const quoteDates=['2017-01-01'];for(let i=1;i<21;i++)quoteDates.push(add(quoteDates.at(-1),i<=5?3:2));
  const wide=quoteDates.map(d=>row(d,quoteDates.at(-1)));const w=run(wide).issues[0];assert.equal(w.features.spanDays,45);assert.equal(w.features.eligible,true);
  const age=run(windowAt('2017-01-21','2017-01-29')).issues[0];assert.equal(age.features.latestQuoteAgeDays,10);assert.equal(age.features.eligible,true);
  const rows=[...windowAt('2017-01-21'),...['2017-01-24','2017-01-25','2017-01-26','2017-01-27','2017-01-28','2017-02-06'].map(d=>row(d))];
  const a=run(rows);assert.equal(a.issues[0].labels['5'].spanDays,14);assert.equal(a.issues[0].labels['5'].eligible,true);
  assert.deepEqual(run([...rows].reverse()),a);
});
