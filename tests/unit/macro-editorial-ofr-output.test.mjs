import { fixtureDeepSeekBudget } from '../helpers/deepseek-budget-fixture.mjs';
import { planAdmission, REPOSITORY } from '../../scripts/macro-risk/editorial-refresh-admission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ofrEditorialFixture } from '../fixtures/macro-editorial-ofr.mjs';
import { validateEditorialOutput } from '../../scripts/macro-risk/editorial-contract.mjs';
import { reviewEditorial, projectEditorial, applyEditorialProjection, validateEditorialProduction } from '../../scripts/macro-risk/editorial-production.mjs';
import { validateOfrPublicationIfPresent } from '../../scripts/daily/ofr-publication-contract.mjs';
import { requestEditorial } from '../../scripts/macro-risk/editorial-provider.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fixture=()=>{const x=ofrEditorialFixture();const review=reviewEditorial({input:x.input,output:x.output,generatedAt:x.at});return {...x,review,layer:projectEditorial({...x,review,generatedAt:x.at,sourceCommit:'b'.repeat(40),runId:'123'})};};
test('evidence-backed brief passes as warn, program injects true zero and writer changes only layer',()=>{
 const {input,output,radar,layer,review,at}=fixture();
 assert.equal(validateEditorialOutput(output,input).ok,true);assert.equal(review.status,'warn');
 assert.equal(layer.pressureSnapshot.index.value,0);assert.equal(output.pressureSnapshot,undefined);
 const before=structuredClone(radar), next=applyEditorialProjection(radar,layer,new Date(at),input);
 assert.equal(validateOfrPublicationIfPresent(next),true);delete next.macroRiskEditorialLayer;assert.deepEqual(next,before);assert.deepEqual(radar,before);
});
const changes={oldScore:o=>o.scoreSynthesis={score:999},moduleScore:o=>o.contextAnalysis=[{score:999,assessmentZh:'观察',sourceRefIds:o.sourceRefIds}],pressureNumber:o=>o.pressureSynthesis.assessmentZh='OFR原值为999。',wrongCurrency:o=>o.weeklyTimeline[0].detailZh='政策利率为4美元。',wrongUnit:o=>o.weeklyTimeline[0].detailZh='政策利率为4基点。',wrongSign:o=>o.weeklyTimeline[0].detailZh='政策利率为-4%。',unknownRef:o=>o.watchNext[0].sourceRefIds=['missing'],emptyWatch:o=>o.watchNext=[],emptyGap:o=>o.dataGaps=[],unsafe:o=>o.leadZh='建议加仓',quote:o=>o.weeklyTimeline[0].detailZh='官员表示：“Everything is safe”。',futureDate:o=>o.weeklyTimeline[0].date='2026-11-20',oversize:o=>o.leadZh='长'.repeat(1000),malformed:o=>o.weeklyTimeline={},nullClaim:o=>o.contextAnalysis=[null]};
for(const [name,mutate] of Object.entries(changes))test(`OFR brief rejects ${name}`,()=>{const {input,output}=ofrEditorialFixture();mutate(output);assert.equal(validateEditorialOutput(output,input).ok,false);});
test('output mutation with recalculated digest still fails final writer review',()=>{
 const {input,radar,layer,at}=fixture();layer.output.weeklyTimeline[0].detailZh='政策利率为400美元。';layer.provenance.artifactDigest=layer.validation.artifactDigest=hash(layer.output);
 assert.throws(()=>applyEditorialProjection(radar,layer,new Date(at),input),/revalidation/);
});
test('trusted snapshot and source ledger cannot be replaced after projection',()=>{
 for(const change of [l=>l.pressureSnapshot.index.value=999,l=>l.pressureFreshness.currentEligibleAtCheck=false,l=>l.sourceLedger[0].sourceName='forged']){
 const {input,radar,layer,at}=fixture();change(layer);assert.throws(()=>applyEditorialProjection(radar,layer,new Date(at),input));
 }
});
test('writer rejects same timestamp different pressure source and stale output',()=>{
 const {input,radar,layer,at}=fixture();radar.mainPressureReadout.source.snapshotSha256='c'.repeat(64);assert.equal(validateEditorialProduction(layer,radar,new Date(at)).ok,false);
 assert.throws(()=>applyEditorialProjection(radar,layer,new Date('2026-11-03T00:00:00Z'),input));
});
test('mocked provider produces v2 without accepting model-supplied score labels',async()=>{
 const {input,output,at}=ofrEditorialFixture();let calls=0;
 const result=await requestEditorial({budget:fixtureDeepSeekBudget,input,apiKey:'fixture-not-secret',now:()=>new Date(at),fetchImpl:async(_u,o)=>{calls++;const body=JSON.parse(o.body);assert.match(body.messages[0].content,/OFR/);return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})};}});
 assert.equal(calls,1);assert.equal(result.output.schemaVersion,'macro-risk-editorial-ofr-output-v2');assert.equal(result.diagnostics.retryCount,0);
});

test('review counterexamples: Chinese pressure numerals, compound currency units and explicit quotations remain blocked',()=>{
 for (const text of ['OFR 金融压力原值为负九十九，周变化为正七，历史百分位为九十九。']) { const {input,output}=ofrEditorialFixture();output.pressureSynthesis.assessmentZh=text;assert.equal(validateEditorialOutput(output,input).ok,false); }
 for(const [evidence,claim] of [['The price is 4 USD per barrel.','价格为4美元/吨。'],['Officials said "Data remain mixed".','美联储官员宣布：“Everything is safe”。']]) {
  const {input,output}=ofrEditorialFixture();input.newsContext.stories[0].snippet=evidence;output.weeklyTimeline[0].detailZh=claim;assert.equal(validateEditorialOutput(output,input).ok,false);
 }
 const {input,output}=ofrEditorialFixture();input.newsContext.stories[0].snippet='The policy rate increased by 25 basis points.';output.weeklyTimeline[0].detailZh='政策利率上调0.25个百分点。';assert.equal(validateEditorialOutput(output,input).ok,true);
});
test('publication revalidation rejects unsafe output even after attacker recalculates digests',()=>{
 const {radar,layer,at}=fixture();layer.output.leadZh='建议加仓';layer.validation.artifactDigest=layer.provenance.artifactDigest=hash(layer.output);radar.macroRiskEditorialLayer=layer;
 assert.equal(validateEditorialProduction(layer,radar,new Date(at)).ok,false);assert.throws(()=>validateOfrPublicationIfPresent(radar));
});
test('incomplete provider finish and aborted body never retry',async()=>{
 for(const finish of ['length','content_filter',null]) { const {input,output,at}=ofrEditorialFixture();let calls=0;await assert.rejects(requestEditorial({budget:fixtureDeepSeekBudget,input,apiKey:'fixture',now:()=>new Date(at),fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{finish_reason:finish,message:{content:JSON.stringify(output)}}]})};}}),e=>e.category=== (finish==='length'?'provider_output_truncated':'provider_completion_invalid'));assert.equal(calls,1); }
 const {input}=ofrEditorialFixture();await assert.rejects(requestEditorial({budget:fixtureDeepSeekBudget,input,apiKey:'fixture',fetchImpl:async()=>({ok:true,status:200,json:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}})}),e=>e.category==='provider_timeout');
});


test('complete OFR migration admits planning only, incomplete/retired output still stops before cost',()=>{
 const {radar,at}=ofrEditorialFixture();const context={eventName:'workflow_dispatch',event:{inputs:{allow_network:true,acknowledge_cost:true}},runAttempt:'1',repository:REPOSITORY,ref:'refs/heads/main',radar,world:{updatedAt:at},oil:{builtAt:at},now:at};
 assert.equal(planAdmission(context).ready,true);
 for(const mutate of [d=>delete d.advicePolicy,d=>delete d.mainPressureReadout,d=>d.macroRiskEditorialLayer={schemaVersion:'macro-risk-editorial-production-v1'},d=>d.mainPressureReadout.weeklyChange.value=99]){const bad=structuredClone(context);mutate(bad.radar);assert.equal(planAdmission(bad).reason,'model_contract_transition');}
 const noCost=structuredClone(context);noCost.event.inputs.acknowledge_cost=false;assert.equal(planAdmission(noCost).reason,'manual_authorization_missing');
});


test('currency amount and denominator remain inseparable through scaling, order and omission',()=>{
 for(const [evidence,claim] of [['The price is USD 400 million per barrel.','价格为4亿美元/吨。'],['The price is 4 USD per barrel.','价格为每吨4美元。'],['The price is 4 USD per barrel.','价格为4美元。']]) {
  const {input,output}=ofrEditorialFixture();input.newsContext.stories[0].snippet=evidence;output.weeklyTimeline[0].detailZh=claim;assert.equal(validateEditorialOutput(output,input).ok,false,claim);
 }
 for(const claim of ['价格为每桶4美元。','价格为4美元/桶。']) {const {input,output}=ofrEditorialFixture();input.newsContext.stories[0].snippet='The price is 4 USD per barrel.';output.weeklyTimeline[0].detailZh=claim;const result=validateEditorialOutput(output,input);assert.equal(result.ok,true,result.errors.join(';'));}
});

test('Chinese rate assertions cannot disappear from OFR grounding or final writer review',()=>{
 for (const claim of ['政策利率为九十九个基点。','政策利率上调九十九个百分点。','政策利率为九十九%。','政策利率为负四个基点。']) {
  const {input,output,radar,layer,at}=fixture();
  output.weeklyTimeline[0].detailZh=claim;
  assert.equal(validateEditorialOutput(output,input).ok,false,claim);
  layer.output=output;layer.validation.artifactDigest=layer.provenance.artifactDigest=hash(output);
  assert.throws(()=>applyEditorialProjection(radar,layer,new Date(at),input),/revalidation/,claim);
 }
});

test('OFR preserves supported Arabic rates and exact Chinese rates without guessing translations',()=>{
 for(const [evidence,claim] of [['Policy rate is 4%.','政策利率为4%。'],['The rate increased by 25 basis points.','利率上调0.25个百分点。'],['政策利率上调二十五个基点。','政策利率上调二十五个基点。']]) {
  const x=ofrEditorialFixture();x.input.newsContext.stories[0].snippet=evidence;x.output.weeklyTimeline[0].detailZh=claim;
  const review=reviewEditorial({input:x.input,output:x.output,generatedAt:x.at});
  const layer=projectEditorial({...x,review,generatedAt:x.at,sourceCommit:'b'.repeat(40),runId:'123'});
  assert.equal(applyEditorialProjection(x.radar,layer,new Date(x.at),x.input).macroRiskEditorialLayer.output.weeklyTimeline[0].detailZh,claim);
 }
 const {input,output}=ofrEditorialFixture();input.newsContext.stories[0].snippet='政策利率上调二十五个基点。';output.weeklyTimeline[0].detailZh='政策利率上调九十九个基点。';
 assert.equal(validateEditorialOutput(output,input).ok,false);
});

test('spelled-out dollar aliases bind denominators through translation and final writer review',()=>{
 for (const currency of ['US dollar','US dollars','U.S. dollar','U.S. dollars']) {
  const x=ofrEditorialFixture();x.input.newsContext.stories[0].snippet=`The price is 4 ${currency} per barrel.`;
  for (const faithful of ['价格为每桶4美元。','价格为4美元/桶。',`The price is 4 ${currency} per barrel.`]) {
   x.output.weeklyTimeline[0].detailZh=faithful;
   const review=reviewEditorial({input:x.input,output:x.output,generatedAt:x.at});
   const layer=projectEditorial({...x,review,generatedAt:x.at,sourceCommit:'b'.repeat(40),runId:'123'});
   assert.equal(applyEditorialProjection(x.radar,layer,new Date(x.at),x.input).macroRiskEditorialLayer.output.weeklyTimeline[0].detailZh,faithful);
   for (const claim of [`The price is 4 ${currency} per tonne.`,`The price is 4 ${currency}.`,'价格为4美元/吨。','价格为4美元。']) {
    const changed=structuredClone(layer);changed.output.weeklyTimeline[0].detailZh=claim;
    changed.validation.artifactDigest=changed.provenance.artifactDigest=hash(changed.output);
    assert.equal(validateEditorialOutput(changed.output,x.input).ok,false,claim);
    assert.throws(()=>applyEditorialProjection(x.radar,changed,new Date(x.at),x.input),/revalidation/,claim);
   }
  }
 }
});

test('compound denominator words ignore case but SI symbols retain case',()=>{
 for (const evidence of ['The price is 4 US dollars PER BARREL.','The price is PER BARREL 4 US dollars.','The price is 4 US dollars PeR BaRrEl.']) {
  const x=ofrEditorialFixture();x.input.newsContext.stories[0].snippet=evidence;
  for (const claim of ['价格为4美元/桶。','The price is 4 US dollars pEr barrels.','The price is PER Barrel 4 US dollars.']) {
   x.output.weeklyTimeline[0].detailZh=claim;
   const result=validateEditorialOutput(x.output,x.input);assert.equal(result.ok,true,result.errors.join(';'));
  }
  for (const claim of ['The price is 4 US dollars PER TONNE.','The price is PER TONNE 4 US dollars.','价格为4美元。']) {
   x.output.weeklyTimeline[0].detailZh=claim;assert.equal(validateEditorialOutput(x.output,x.input).ok,false,claim);
  }
 }
 for (const [evidence,claim,ok] of [['4 USD per MWh','4美元/MWh',true],['4 USD per MWh','4美元/mWh',false],['4 USD per mWh','4美元/MWh',false],['4 USD per kWh','4美元/KWH',false]]) {
  const x=ofrEditorialFixture();x.input.newsContext.stories[0].snippet=evidence;x.output.weeklyTimeline[0].detailZh=claim;
  assert.equal(validateEditorialOutput(x.output,x.input).ok,ok,`${evidence} -> ${claim}`);
 }
});
