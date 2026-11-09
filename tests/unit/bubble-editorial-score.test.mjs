import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { replayEvidenceScores } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { buildNvdaGap } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
import { nvdaEvidenceFixture } from '../helpers/nvda-evidence-fixture.mjs';
import { buildEditorialScoringSnapshot, validateEditorialScoringSnapshot } from '../../scripts/bubble-watch/editorial-score-snapshot.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial, validateWeeklyEditorialProduction, applyWeeklyEditorialProjection } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { validateWeeklyEditorialWriteEvidence } from '../../scripts/bubble-watch/weekly-editorial-write-evidence.mjs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`,import.meta.url)));
function qualifiedBubble() {
  const d=structuredClone(read('docs/fixtures/bubble-watch/legacy-contract-bundle.json').files['data/bubble-watch.json']);
  delete d.summary.weekly_editorial;
  const i=d.indicators.find(i=>i.id==='dc_abs_spread');
  Object.assign(i,{status:'unknown',as_of:null,stale:false,evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'dc_abs_direct_spread_unavailable',checkedDate:d.as_of_date},provenance:{mode:'auto',checkedAt:`${d.as_of_date}T12:00:00Z`}});
  const r=replayEvidenceScores(d.indicators,1);
  d.contractVersion='bubble-watch-v3';
  Object.assign(d.summary,{primary_score_pct:null,red_pct:null,weighted_risk_score:null,stage_score:r.stage,trigger_score:null,trigger_label:'待确认',trigger_label_en:'Pending',
    scoring_unknown_count:1,scoring_red_count:r.counts.red,scoring_yellow_count:r.counts.yellow,scoring_green_count:r.counts.green,
    primary_score_range_pct:r.primaryRange,weighted_risk_score_range:r.pressureRange,stage_score_range:r.stageRange,trigger_score_range:r.triggerRange,
    category_scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.point])),category_score_ranges:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,{lower:v.lower,upper:v.upper}]))});
  Object.assign(d.scoring,{model_version:r.modelVersion,base_tier:r.baseTier,effective_tier:r.effectiveTier,override_active:r.overrideActive,two_axis_upgrade:r.twoAxisUpgrade,tier_range:r.tierRange,unknown_core_ids:r.unknownIds});
  return d;
}
function pack() {
  const bubble=qualifiedBubble();
  const fixture=read('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json');
  const input=buildWeeklyEditorialInput({bubbleWatch:bubble,discovery:fixture.newsContext,generatedAt:'2026-10-13T00:00:00Z'});
  return {bubble,input};
}
test('v3 compact input keeps null, exact bounds, checking clock and Chinese missing evidence',()=>{
  const {input}=pack();
  assert.equal(input.scoringSnapshot.primaryScorePct,null);
  assert.deepEqual(input.scoringSnapshot.primaryScoreRangePct,{lower:30.4,upper:34.8});
  assert.match(input.structuredFacts.find(f=>f.indicatorId==='dc_abs_spread').factZh,/待确认/u);
  assert.ok(input.dataGaps.some(text=>text.includes('待确认')));
  const result=validateWeeklyEditorialInput(input);assert.equal(result.ok,true,result.errors.join('; '));
  assert.ok(Buffer.byteLength(JSON.stringify(input))<60*1024);
});
test('v3 input rejects invented zero, changed proof, count, model, date and fact lights',()=>{
  const {input}=pack();
  for(const mutate of [i=>{i.scoringSnapshot.scorecardDisclosureZh='主分0%';},i=>{i.scoringSnapshot.triggerLabelZh='正常';},i=>{i.scoringSnapshot.stageLabelZh='正常';},i=>{i.scoringSnapshot.primaryScorePct=0;},i=>{i.scoringSnapshot.primaryScoreRangePct.lower=0;},
    i=>{i.scoringSnapshot.qualifiedEvidence.summary.scoring_total_indicators=22;},i=>{i.scoringSnapshot.modelVersion='unregistered';},
    i=>{i.scoringSnapshot.qualifiedEvidence.as_of_date='2026-10-13';},i=>{i.structuredFacts.find(f=>f.indicatorId==='dc_abs_spread').status='green';}]) {
    const i=structuredClone(input);mutate(i);assert.equal(validateWeeklyEditorialInput(i).ok,false);
  }
  assert.throws(()=>buildEditorialScoringSnapshot({...qualifiedBubble(),summary:{}}));
  assert.ok(validateEditorialScoringSnapshot({contractVersion:'bubble-watch-v9'},'2026-10-12').length);
});
test('v2 fixture contract remains valid',()=>{
  const input=read('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json');
  assert.equal(validateWeeklyEditorialInput(input).ok,true);
  assert.equal(validateWeeklyEditorialOutput(read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json'),input).ok,true);
});
test('production projection preserves qualified score proof and rejects same-date score drift',()=>{
  const {bubble,input}=pack();
  const output=read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');output.asOfDate=input.asOfDate;
  output.scorecardSynthesisZh=input.scoringSnapshot.scorecardDisclosureZh;
  const result=validateWeeklyEditorialOutput(output,input);assert.equal(result.ok,true,result.errors.join('; '));
  const invented=structuredClone(output);invented.scorecardSynthesisZh='Core-23主分为0%，所有缺口按绿灯处理，市场风险已经完全消失。';
  assert.equal(validateWeeklyEditorialOutput(invented,input).ok,false);
  const review=reviewWeeklyEditorial({input,output});
  const layer=projectWeeklyEditorial({input,output,review});
  assert.deepEqual(layer.sourceScoringSnapshot,input.scoringSnapshot);
  const valid=validateWeeklyEditorialProduction(layer,bubble);assert.equal(valid.ok,true,valid.errors.join('; '));
  assert.equal(applyWeeklyEditorialProjection(bubble,layer).summary.primary_score_pct,null);
  for(const mutate of [l=>{l.sourceScoringSnapshot.primaryScorePct=0;},l=>{delete l.sourceScoringSnapshot;}]) {
    const l=structuredClone(layer);mutate(l);assert.equal(validateWeeklyEditorialProduction(l,bubble).ok,false);
  }
  const changed=structuredClone(bubble);changed.indicators.find(i=>i.id==='cape').status='green';
  assert.equal(validateWeeklyEditorialProduction(layer,changed).ok,false);
});

test('genuine fully observed zero remains zero rather than pending',()=>{
  const d=qualifiedBubble();
  for(const i of d.indicators) i.status='green';
  const r=replayEvidenceScores(d.indicators,1);
  Object.assign(d.summary,{primary_score_pct:0,red_pct:0,weighted_risk_score:0,stage_score:0,trigger_score:0,stage_label:'早期 Displacement',trigger_label:'引线未燃',
    scoring_unknown_count:0,scoring_red_count:0,scoring_yellow_count:0,scoring_green_count:23,
    primary_score_range_pct:r.primaryRange,weighted_risk_score_range:r.pressureRange,stage_score_range:r.stageRange,trigger_score_range:r.triggerRange,
    category_scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.point])),category_score_ranges:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,{lower:v.lower,upper:v.upper}])),verdict_label:r.verdictLabel});
  Object.assign(d.scoring,{base_tier:r.baseTier,effective_tier:r.effectiveTier,override_active:r.overrideActive,two_axis_upgrade:r.twoAxisUpgrade,tier_range:r.tierRange,unknown_core_ids:[]});
  const snapshot=buildEditorialScoringSnapshot(d);
  assert.equal(snapshot.primaryScorePct,0);assert.equal(snapshot.coreUnknownCount,0);
  assert.match(snapshot.scorecardDisclosureZh,/主分0\.0%/u);
  assert.deepEqual(validateEditorialScoringSnapshot(snapshot,d.as_of_date),[]);
});
test('an r4 commentary cannot be relabeled r5, even when dates and score numbers are unchanged',()=>{
 const bubble=qualifiedBubble();bubble.scoring.model_version='bubble-watch-v3-core23-shadow4-r4';
 const fixture=read('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json');
 const input=buildWeeklyEditorialInput({bubbleWatch:bubble,discovery:fixture.newsContext,generatedAt:'2026-10-13T00:00:00Z'});
 const output=read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');output.asOfDate=input.asOfDate;output.scorecardSynthesisZh=input.scoringSnapshot.scorecardDisclosureZh;
 const review=reviewWeeklyEditorial({input,output});
 const layer=projectWeeklyEditorial({input,output,review});assert.equal(validateWeeklyEditorialProduction(layer,bubble).ok,true);
 const next=structuredClone(bubble);next.scoring.model_version='bubble-watch-v3-core23-shadow4-r5';assert.equal(validateWeeklyEditorialProduction(layer,next).ok,false);
 assert.equal(layer.sourceScoringSnapshot.modelVersion,'bubble-watch-v3-core23-shadow4-r4');
 const nextInput=buildWeeklyEditorialInput({bubbleWatch:next,discovery:fixture.newsContext,generatedAt:'2026-10-13T00:00:00Z'});
 const nextOutput=structuredClone(output);nextOutput.scorecardSynthesisZh=nextInput.scoringSnapshot.scorecardDisclosureZh;
 const nextLayer=projectWeeklyEditorial({input:nextInput,output:nextOutput,review:reviewWeeklyEditorial({input:nextInput,output:nextOutput})});assert.equal(validateWeeklyEditorialProduction(nextLayer,next).ok,true);
 assert.equal(nextLayer.sourceScoringSnapshot.modelVersion,'bubble-watch-v3-core23-shadow4-r5');
});

// Replay the next full-refresh shape without fetching or changing production data.
function r5Bubble(qualified = false) {
  const d=qualifiedBubble();d.as_of_date='2026-11-09';
  const nvda=d.indicators.find(i=>i.id==='nvda_invest_revenue');
  Object.assign(nvda,qualified ? nvdaEvidenceFixture('2026-11-01',d.as_of_date)
    : buildNvdaGap(nvda,d.as_of_date,{reason:'newer_ledger_requires_comparable_evidence',latestLedgerDate:'2026-11-08',parameterDate:'2026-06-07',newerLedgerProtected:true},`${d.as_of_date}T12:00:00Z`));
  for(const i of d.indicators.filter(i=>i.status==='unknown')) {
    i.evidence_gap.checkedDate=d.as_of_date;i.provenance.checkedAt=`${d.as_of_date}T12:00:00Z`;
  }
  const r=replayEvidenceScores(d.indicators,5);
  Object.assign(d.summary,{primary_score_pct:r.primary,red_pct:r.primary,weighted_risk_score:r.pressure,
    stage_score:r.stage,trigger_score:r.trigger,stage_label:qualified?'亢奋 Euphoria':'待确认',trigger_label:'待确认',
    scoring_unknown_count:r.unknownIds.length,scoring_red_count:r.counts.red,scoring_yellow_count:r.counts.yellow,scoring_green_count:r.counts.green,
    primary_score_range_pct:r.primaryRange,weighted_risk_score_range:r.pressureRange,stage_score_range:r.stageRange,trigger_score_range:r.triggerRange,
    category_scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.point])),category_score_ranges:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,{lower:v.lower,upper:v.upper}])),verdict_label:r.verdictLabel});
  Object.assign(d.scoring,{model_version:r.modelVersion,base_tier:r.baseTier,effective_tier:r.effectiveTier,override_active:r.overrideActive,two_axis_upgrade:r.twoAxisUpgrade,tier_range:r.tierRange,unknown_core_ids:r.unknownIds});
  return d;
}
test('r5 full-refresh NVIDIA gap survives compact projection with its original proof and named disclosure',()=>{
  const bubble=r5Bubble(),before=JSON.stringify(bubble),snapshot=buildEditorialScoringSnapshot(bubble);
  const nvda=snapshot.qualifiedEvidence.indicators.find(i=>i.id==='nvda_invest_revenue');
  assert.deepEqual(validateEditorialScoringSnapshot(snapshot,bubble.as_of_date),[]);
  assert.equal(snapshot.coreUnknownCount,2);assert.equal(snapshot.primaryScorePct,null);assert.equal(snapshot.stageScore,null);
  assert.equal(snapshot.qualifiedEvidence.summary.scoring_total_indicators,23);
  assert.deepEqual(snapshot.primaryScoreRangePct,bubble.summary.primary_score_range_pct);
  assert.match(snapshot.scorecardDisclosureZh,/NVIDIA客户投资\/收入比/u);
  assert.deepEqual(nvda.provenance.detail,{contractVersion:'nvda-period-aligned-ratio-v1',qualificationStatus:'unavailable',ratioPct:null,currentEligible:false});
  assert.equal(nvda.provenance.checkedAt,'2026-11-09T12:00:00Z');
  assert.equal(JSON.stringify(bubble),before);
  for(const mutate of [i=>delete i.provenance.detail,i=>i.provenance.detail.currentEligible=true,
    i=>i.provenance.detail.ratioPct=0,i=>i.provenance.detail.qualificationStatus='qualified',
    i=>i.provenance.detail.contractVersion='unregistered',i=>i.provenance.checkedAt='2026-11-08T12:00:00Z']) {
    const bad=structuredClone(snapshot);mutate(bad.qualifiedEvidence.indicators.find(i=>i.id==='nvda_invest_revenue'));
    assert.ok(validateEditorialScoringSnapshot(bad,bubble.as_of_date).length);
  }
});
test('r5 qualified NVIDIA projection retains replayable periods, age and arithmetic without collector extras',()=>{
  const bubble=r5Bubble(true),record=bubble.indicators.find(i=>i.id==='nvda_invest_revenue');
  record.provenance.detail.rawResponse='not for the compact pack';
  record.provenance.detail.numerator.records[0].rawResponse='not for the compact pack';
  const snapshot=buildEditorialScoringSnapshot(bubble),proof=snapshot.qualifiedEvidence.indicators.find(i=>i.id===record.id);
  assert.deepEqual(validateEditorialScoringSnapshot(snapshot,bubble.as_of_date),[]);
  assert.equal(proof.provenance.detail.numerator.asOfDate,'2026-11-01');
  assert.equal(proof.provenance.detail.numerator.freshness.ageDays,8);
  assert.equal(proof.provenance.detail.revenue.quarters.length,4);
  assert.equal(JSON.stringify(snapshot).includes('not for the compact pack'),false);
  for(const mutate of [d=>delete d.numerator,d=>delete d.revenue,d=>d.ratioPct++,d=>d.numerator.freshness.ageDays=0,
    d=>d.numerator.records[0].usd++,d=>d.revenue.quarters[0].value++,d=>d.revenue.periodStart='2025-07-29']) {
    const bad=structuredClone(snapshot);mutate(bad.qualifiedEvidence.indicators.find(i=>i.id===record.id).provenance.detail);
    assert.ok(validateEditorialScoringSnapshot(bad,bubble.as_of_date).length);
  }
});
for(const qualified of [false,true]) test(`r5 NVIDIA ${qualified?'qualified':'gap'} proof reaches input, review and guarded writer without changing the scorecard`,()=>{
  const bubble=r5Bubble(qualified),date=bubble.as_of_date;
  const discovery=read('docs/fixtures/bubble-watch-weekly-editorial/sample-input-v1.json').newsContext;
  Object.assign(discovery,{windowStart:date,windowEnd:date,generatedAt:`${date}T12:00:00Z`});
  discovery.sourceStatus={tavily:{status:'ok',successCount:6,failureCount:0},brave:{status:'ok',successCount:6,failureCount:0}};
  for(const story of discovery.stories) story.publishedAt=date;
  const input=buildWeeklyEditorialInput({bubbleWatch:bubble,discovery,generatedAt:`${date}T12:01:00Z`});
  const inputCheck=validateWeeklyEditorialInput(input);assert.equal(inputCheck.ok,true,inputCheck.errors.join('; '));
  assert.ok(Buffer.byteLength(JSON.stringify(input))<60*1024);
  const output=read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  output.asOfDate=date;output.generatedAt=`${date}T12:02:00Z`;output.scorecardSynthesisZh=input.scoringSnapshot.scorecardDisclosureZh;
  for(const event of output.weeklyTimeline) event.date=date;
  const review=reviewWeeklyEditorial({input,output,generatedAt:`${date}T12:03:00Z`});
  const layer=projectWeeklyEditorial({input,output,review,generatedAt:`${date}T12:04:00Z`,sourceCommit:'a'.repeat(40),runId:'123'});
  const projection={schemaVersion:'bubble-watch-weekly-editorial-production-projection-v1',target:'data/bubble-watch.json.summary.weekly_editorial',generatedAt:layer.generatedAt,weeklyEditorial:layer,writeEvidence:{input,review}};
  const now=`${date}T12:05:00Z`,result=validateWeeklyEditorialWriteEvidence({bubbleWatch:bubble,projection,now});
  assert.equal(result.ok,true,result.errors.join('; '));
  const written=buildWeeklyEditorialWriteResult(bubble,projection,{now});
  assert.deepEqual(written.summary.weekly_editorial.sourceScoringSnapshot,input.scoringSnapshot);
  delete written.summary.weekly_editorial;assert.deepEqual(written,bubble);
});
test('compact qualified proof ages at the issue without renewing its earlier proof clock',()=>{
  const bubble=r5Bubble(true),record=bubble.indicators.find(i=>i.id==='nvda_invest_revenue');
  Object.assign(record,nvdaEvidenceFixture('2026-11-01','2026-11-08'));
  const before=JSON.stringify(record),snapshot=buildEditorialScoringSnapshot(bubble);
  const proof=snapshot.qualifiedEvidence.indicators.find(i=>i.id===record.id).provenance.detail;
  assert.deepEqual(validateEditorialScoringSnapshot(snapshot,'2026-11-09'),[]);
  assert.equal(proof.numerator.freshness.asOfDate,'2026-11-08');assert.equal(proof.numerator.freshness.ageDays,7);
  assert.equal(proof.revenue.freshness.asOfDate,'2026-11-08');assert.equal(proof.revenue.freshness.ageDays,105);
  assert.equal(JSON.stringify(record),before);
});
