import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateResearchProtocol, scorePressure, observationAt, pressureFeatures, FEATURE_KEYS, digest } from '../../scripts/daily/pressure-model.mjs';
import { auc, agreementMetrics, appendShadowLedger, shadowReadiness, validateShadowLedger, bootstrapAgreement } from '../../scripts/daily/pressure-evaluation.mjs';
import { outputPath, parseResearchArgs, legacyAvailableSeries, evaluateResearch, implementationHash } from '../../scripts/research-pressure-model.mjs';
import { describeRiskImplementation } from '../../scripts/run-daily-pipeline.mjs';

const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));
const today='2026-09-11', DAY=86400000, end=Date.parse(`${today}T00:00:00Z`);
const variant=protocol.variants.find(row=>row.id==='diversified_156');
const featureRow=(date,value)=>({date,features:Object.fromEntries(FEATURE_KEYS.map(key=>[key,value]))});
const history=Array.from({length:156},(_,i)=>featureRow(new Date(end-(156-i)*7*DAY).toISOString().slice(0,10),1+(i%19)/10));
const current=featureRow(today,3);

test('declared inputs map exactly once to implemented channels and invalid research policies fail closed',()=>{
  assert.doesNotThrow(()=>validateResearchProtocol(protocol));
  for(const mutate of [p=>p.productionReplacementEnabled=true,p=>p.sources.vix.assumedReleaseLagDays=-1,
    p=>p.sources.vix.maxAgeDays=NaN,p=>p.channels.credit.minimumScale=0,p=>p.channels.credit.inputs=['vix'],
    p=>{[p.channels.credit.inputs,p.channels.volatility.inputs]=[p.channels.volatility.inputs,p.channels.credit.inputs];},
    p=>p.channels.credit.transformation='price_level']) {
    const p=structuredClone(protocol);mutate(p);assert.throws(()=>validateResearchProtocol(p));
  }
  assert.throws(()=>scorePressure(current,history,protocol,{...variant,tailBlend:0.9}),/frozen/);
});

test('calibration requires genuine prior weekly observations and no future sample can change a score',()=>{
  const before=JSON.stringify(history);
  const expected=scorePressure(current,history,protocol,variant);
  assert.equal(expected.status,'research_only');assert.equal(expected.calibrationEnd,'2026-09-04');
  assert.deepEqual(scorePressure(current,[...history,featureRow('2030-01-04',9999)],protocol,variant),expected);
  assert.equal(JSON.stringify(history),before);
  assert.equal(scorePressure(current,history.slice(-10),protocol,variant).score,null);
  const daily=Array.from({length:104},(_,i)=>featureRow(new Date(end-(104-i)*DAY).toISOString().slice(0,10),i));
  assert.throws(()=>scorePressure(current,daily,protocol,variant),/weekly Friday/);
  assert.throws(()=>scorePressure(current,[...history,history.at(-1)],protocol,variant),/duplicate/);
});

test('smooth score remains responsive without a threshold floor and handles every channel monotonically',()=>{
  const base=scorePressure(current,history,protocol,variant);
  for(const key of FEATURE_KEYS) {
    const small=structuredClone(current);small.features[key]+=0.0001;
    const higher=scorePressure(small,history,protocol,variant);
    assert.ok(higher.score>base.score);assert.ok(higher.score-base.score<0.01);
    const large=structuredClone(current);large.features[key]=30;
    const huge=structuredClone(current);huge.features[key]=300;
    assert.ok(scorePressure(huge,history,protocol,variant).score>scorePressure(large,history,protocol,variant).score);
  }
  assert.ok(base.score>0&&base.score<100);assert.equal(base.calibratedProbability,false);
  assert.equal(base.reliability.defaultsUsed,false);
});

test('weight concentration never claims independent evidence and fully correlated channels have one participation dimension',()=>{
  const result=scorePressure(current,history,protocol,variant);
  assert.ok(Math.abs(result.reliability.weightEffectiveCount-6)<1e-9);
  assert.ok(Math.abs(result.reliability.correlationParticipationRatio-1)<1e-9);
  assert.equal(result.reliability.independenceProven,false);
  assert.ok(Math.abs(Object.values(result.weights).reduce((a,b)=>a+b,0)-1)<1e-12);
});

test('null, nonfinite or missing features produce no research score or default scenario',()=>{
  for(const key of FEATURE_KEYS) for(const value of [null,undefined,NaN,Infinity,'0']) {
    const row=structuredClone(current);row.features[key]=value;
    assert.equal(scorePressure(row,history,protocol,variant).score,null);
  }
});

function sourceFixture() {
  const series=Object.fromEntries(Object.keys(protocol.sources).map(key=>[key,[]]));
  for(let i=500;i>=0;i--) {
    const date=new Date(end-i*DAY).toISOString().slice(0,10);
    const value={baa10y:2,vix:20,spx:5000-i,dxy:110-i/100,brent:80-i/100,us10y:4-i/1000,breakeven10y:2.5};
    for(const key of Object.keys(series)) series[key].push({date,value:value[key]});
  }
  return series;
}
test('transformed equity/oil pressure is invariant to index rebasing and absolute price units',()=>{
  const series=sourceFixture(), base=pressureFeatures(series,today,protocol);
  assert.ok(base.features);
  const changed=structuredClone(series);
  for(const row of changed.spx) row.value*=10;
  for(const row of changed.brent) row.value*=10;
  for(const row of changed.us10y) row.value+=20;
  const result=pressureFeatures(changed,today,protocol);
  for(const key of FEATURE_KEYS) assert.ok(Math.abs(result.features[key]-base.features[key])<1e-12,key);
});

test('observation and reference nulls cannot turn into zero; future data and negative lag are rejected',()=>{
  const policy={maxAgeDays:7,assumedReleaseLagDays:1};
  assert.equal(observationAt([{date:'2026-09-10',value:null}],today,policy),null);
  assert.equal(observationAt([{date:'2026-09-12',value:1}],today,policy),null);
  assert.throws(()=>observationAt([],today,{...policy,assumedReleaseLagDays:-1}));
  for(const missingDate of ['2026-09-10','2026-08-13']) {
    const series=sourceFixture();series.us10y.find(row=>row.date===missingDate).value=null;
    const result=pressureFeatures(series,today,protocol);
    assert.equal(result.features,null);assert.ok(result.missing.length);
  }
  const rows=sourceFixture();const before=pressureFeatures(rows,today,protocol);
  for(const values of Object.values(rows)) values.push({date:'2030-01-01',value:9999});
  assert.deepEqual(pressureFeatures(rows,today,protocol),before);
});

test('contemporaneous benchmark statistics handle ties and do not report probability calibration or forecast lead time',()=>{
  assert.equal(auc([1,2,3,4],[false,false,true,true]),1);
  assert.equal(auc([1,1,1,1],[false,false,true,true]),0.5);
  assert.equal(auc([1,2],[false,false]),null);
  const result=agreementMetrics([{score:80,benchmark:1},{score:20,benchmark:-1}],protocol.evaluation);
  assert.deepEqual(result.confusion,{tp:1,fp:0,tn:1,fn:0});
  assert.equal(result.weightedError,0);assert.equal(result.probabilityCalibrationApplicable,false);assert.equal(result.forecastLeadTimeApplicable,false);
});

test('prospective records cannot be backfilled, overwritten, mixed across protocols or multiplied by reruns',()=>{
  const now=today+'T10:00:00.000Z';
  const inputs=pressureFeatures(sourceFixture(),today,protocol);
  const scores=protocol.variants.map(v=>scorePressure(inputs,history,protocol,v));
  const scoreInputs={evidence:inputs.evidence,references:inputs.references,features:inputs.features,
    parameters:Object.fromEntries(scores.map(row=>[row.variant,{calibration:row.calibration,weights:row.weights}]))};
  const record={date:today,recordedAt:now,sourceRetrievedAt:now,protocolHash:digest(protocol),implementationHash:'implementation',
    scoreInputs,inputHash:digest(scoreInputs),variant:variant.id,variantScores:Object.fromEntries(scores.map(row=>[row.variant,row.score])),
    variantStatus:Object.fromEntries(scores.map(row=>[row.variant,{status:row.status,trainingWeeks:row.trainingWeeks,reasons:[]} ])),
    score:scores.find(row=>row.variant===variant.id).score};
  const first=appendShadowLedger(null,record,protocol,now);
  assert.deepEqual(appendShadowLedger(first,record,protocol,now),first);
  assert.throws(()=>appendShadowLedger(first,{...record,score:80},protocol,now),/variant mismatch/);
  assert.throws(()=>appendShadowLedger(null,{...record,variant:'unknown'},protocol,now),/variant mismatch/);
  assert.throws(()=>appendShadowLedger(null,{...record,date:'2020-01-01'},protocol,now),/backfill/);
  const altered=structuredClone(first);altered.records[0].score=99;
  assert.throws(()=>appendShadowLedger(altered,record,protocol,now),/integrity/);
  const changed=structuredClone(protocol);changed.modelId+='changed';
  assert.throws(()=>appendShadowLedger(first,record,changed,now),/mismatch/);
  assert.doesNotThrow(()=>validateShadowLedger(first,protocol,'implementation',now));
  for(const mutate of [row=>row.recordedAt='2020-01-01T10:00:00.000Z',row=>row.sourceRetrievedAt='2020-01-01T10:00:00.000Z',
    row=>row.protocolHash='wrong',row=>{row.scoreInputs.features.credit+=1;row.inputHash=digest(row.scoreInputs);}]) {
    const forged=structuredClone(first);mutate(forged.records[0]);
    forged.records[0].recordHash=digest({...forged.records[0],recordHash:undefined});
    assert.throws(()=>validateShadowLedger(forged,protocol,'implementation',now));
  }
  const readiness=shadowReadiness(first,protocol);
  assert.equal(readiness.elapsedDays,0);assert.equal(readiness.distinctInputs,1);assert.equal(readiness.eligibleForProduction,false);
});

test('legacy comparison shares explicit availability lags and cannot use same-day unpublished observations',()=>{
  const original=sourceFixture(), filtered=legacyAvailableSeries(original,today,protocol);
  for(const [key,p] of Object.entries(protocol.sources)) {
    const latest=new Date(end-p.assumedReleaseLagDays*DAY).toISOString().slice(0,10);
    assert.equal(filtered[key].at(-1).date,latest);
    assert.equal(original[key].at(-1).date,today);
  }
  const invalid=structuredClone(protocol);delete invalid.legacyAdditionalAssumedReleaseLagDays.hyOas;
  assert.throws(()=>legacyAvailableSeries(original,today,invalid),/Missing legacy/);
});

test('research CLI is offline by default and cannot write production data or backfill shadow using cached inputs',()=>{
  assert.equal(parseResearchArgs([]).allowNetwork,false);
  assert.throws(()=>parseResearchArgs(['--record-shadow']),/new live retrieval/);
  assert.throws(()=>outputPath('data/radar-data.json'),/ignored/);
  assert.throws(()=>parseResearchArgs(['--start-date','2008-01-01']),/Unknown/);
});

test('frozen retrospective cutoff cannot silently expand as new shadow dates arrive',()=>{
  const p=structuredClone(protocol);p.evaluation.startDate=today;
  const cache={series:Object.fromEntries(Object.keys(p.sources).map(key=>[key,[]]))};
  const result=evaluateResearch(cache,p,'2026-09-18',{});
  assert.equal(result.current.date,'2026-09-18');
  for(const rows of Object.values(result.weeklyScores)) assert.deepEqual(rows.map(row=>row.date),[today]);
});

function researchRecord(priorHistory) {
  const now=today+'T10:00:00.000Z', inputs=pressureFeatures(sourceFixture(),today,protocol);
  const candidates=protocol.variants.map(v=>scorePressure(inputs,priorHistory,protocol,v));
  const scoreInputs={evidence:inputs.evidence,references:inputs.references,features:inputs.features,
    parameters:Object.fromEntries(candidates.map(row=>[row.variant,Number.isFinite(row.score)?{calibration:row.calibration,weights:row.weights}:null]))};
  return {date:today,recordedAt:now,sourceRetrievedAt:now,protocolHash:digest(protocol),implementationHash:'test-v2',
    scoreInputs,inputHash:digest(scoreInputs),variant:variant.id,score:candidates.find(row=>row.variant===variant.id).score,
    variantScores:Object.fromEntries(candidates.map(row=>[row.variant,row.score])),
    variantStatus:Object.fromEntries(candidates.map(row=>[row.variant,{status:row.status,trainingWeeks:row.trainingWeeks,reasons:row.reasons||[]}]))};
}

test('one missing calibration week cannot discard six available candidates or fabricate the seventh',()=>{
  const sparse=history.filter((_,i)=>i!==146), record=researchRecord(sparse);
  assert.equal(record.variantScores.diversified_104,null);
  assert.equal(record.variantStatus.diversified_104.trainingWeeks,103);
  assert.equal(Object.values(record.variantScores).filter(Number.isFinite).length,6);
  const ledger=appendShadowLedger(null,record,protocol,record.recordedAt);
  assert.equal(ledger.schemaVersion,'pressure-shadow-ledger-v2');
  assert.equal(ledger.records.length,1);
  const fake=structuredClone(record);fake.variantScores.diversified_104=0;
  assert.throws(()=>appendShadowLedger(null,fake,protocol,fake.recordedAt),/unavailable shadow variant/);
});

test('warm-up records retain observations with null scores and never pass matched-benchmark gates',()=>{
  const record=researchRecord(history.slice(-3));
  assert.equal(record.score,null);assert.ok(Object.values(record.variantScores).every(value=>value===null));
  const ledger=appendShadowLedger(null,record,protocol,record.recordedAt);
  assert.equal(shadowReadiness(ledger,protocol).benchmarkWeeksGatePassed,false);
  const malformed=structuredClone(record);malformed.variantStatus.equal_156.trainingWeeks=104;
  assert.throws(()=>appendShadowLedger(null,malformed,protocol,record.recordedAt),/unavailable shadow variant/);
});

test('research fingerprint ignores unrelated Daily text but includes score helpers and input validation',()=>{
  const initial=implementationHash(),files=[];
  const reader=file=>{files.push(file);return fs.readFileSync(file,'utf8')+(file==='scripts/run-daily-pipeline.mjs'?'\n// display-only change':'');};
  assert.equal(implementationHash(reader),initial);
  assert.ok(!files.includes('scripts/run-daily-pipeline.mjs'));
  const dependency=describeRiskImplementation();dependency.functions.buildTailRiskOverlay+=' changed';
  assert.notEqual(implementationHash(undefined,dependency),initial);
  assert.notEqual(implementationHash(file=>fs.readFileSync(file,'utf8')+(file==='scripts/daily/historical-validation.mjs'?' changed':'')),initial);
  for(const name of ['deriveRisk','clamp','clampRange','roundMetric','normalizeCalibrationPoints','interpolateRiskFromCalibration',
    'buildTailRiskOverlay','buildTransportShockScoringImpact','scoreInput','validateScoreWeights','structuralSourceUsable']) assert.ok(dependency.functions[name]);
});

test('bootstrap discloses missing calendar weeks instead of calling paired rows continuous weeks',()=>{
  const rows=Array.from({length:30},(_,i)=>({date:new Date(end-(31-i+(i<10?1:0))*7*DAY).toISOString().slice(0,10),score:i,benchmark:i-15}));
  const result=bootstrapAgreement(rows,protocol.evaluation);
  assert.equal(result.blockUnit,'paired_observations');assert.equal(result.calendarWeekBlocksProven,false);
  assert.equal(result.calendarGaps.count,1);assert.equal(result.calendarGaps.maximumDays,14);
});
