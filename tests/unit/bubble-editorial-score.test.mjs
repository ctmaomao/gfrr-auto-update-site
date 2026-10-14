import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { replayEvidenceScores } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { buildEditorialScoringSnapshot, validateEditorialScoringSnapshot } from '../../scripts/bubble-watch/editorial-score-snapshot.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { projectWeeklyEditorial, validateWeeklyEditorialProduction, applyWeeklyEditorialProjection } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
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
  const review=read('docs/fixtures/bubble-watch-weekly-editorial/sample-review-v1.json');
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
