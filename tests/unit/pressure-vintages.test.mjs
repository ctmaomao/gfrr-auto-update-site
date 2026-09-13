import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseVintageCsv, parseLatestCsv, compareVintageRows, replayVintagePanel, calibrationDriftDiagnostic, decomposeScoreChange, AUDIT_DATES } from '../../scripts/audit-pressure-vintages.mjs';
import { FEATURE_KEYS, CHANNEL_KEYS, replayPressureInputs } from '../../scripts/daily/pressure-model.mjs';
const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));
const header='observation_date,VIXCLS_20200320\n';
test('vintage parser requires the exact requested series/date, ordered finite observations and no future rows',()=>{
  assert.deepEqual(parseVintageCsv(header+'2020-03-18,0\n2020-03-19,.\n2020-03-20,12','VIXCLS','2020-03-20'),
    {rows:[{date:'2020-03-18',value:0},{date:'2020-03-20',value:12}],missing:1});
  for(const csv of [header.replace('20200320','20200321')+'2020-03-20,1',header+'2020-03-21,2',
    header+'2020-03-20,1\n2020-03-20,2',header+'2020-02-30,1',header+'2020-03-20,NaN',header+'2020-03-20,1,2']) {
    assert.throws(()=>parseVintageCsv(csv,'VIXCLS','2020-03-20'));
  }
});
test('revision audit distinguishes changed values, removed observations and later-added past data',()=>{
  const row=(date,value)=>({date,value});
  const result=compareVintageRows([row('2020-03-18',2),row('2020-03-19',3)],
    [row('2020-03-17',1),row('2020-03-18',4),row('2020-03-21',99)],'2020-03-20');
  assert.deepEqual(result,{archivedObservations:2,revisedObservations:2,changed:1,retrospectivelyAdded:1,removedFromLatest:1,maximumAbsoluteRevision:2});
});
test('missing historical series produce unavailable replay, never current-data substitution or a zero score',()=>{
  const panel=Object.fromEntries(Object.keys(protocol.sources).map(key=>[key,[]]));
  const result=replayVintagePanel(panel,AUDIT_DATES[0],protocol);
  assert.equal(result.missing.length,7);assert.ok(result.candidates.every(row=>row.score===null&&row.status==='unavailable'));
});
test('fixed current inputs disclose normalization caused exclusively by changing calibration history',()=>{
  const result=calibrationDriftDiagnostic(protocol);
  assert.equal(result.inputChange,0);assert.equal(result.notObservedMarketData,true);
  assert.ok(result.rows[0].score>99);assert.ok(Math.abs(result.rows.at(-1).score-50)<1e-10);
  assert.ok(result.rows.every(row=>row.fixedInitialCalibrationScore===result.rows[0].fixedInitialCalibrationScore));
});
test('latest revised data cannot masquerade as an archived vintage',()=>{
  const csv='observation_date,VIXCLS\n2020-03-20,12';
  assert.throws(()=>parseVintageCsv(csv,'VIXCLS','2020-03-20'),/header mismatch/);
  assert.equal(parseLatestCsv(csv,'VIXCLS','2026-09-13').rows[0].value,12);
  assert.throws(()=>parseLatestCsv(header+'2020-03-20,12','VIXCLS','2026-09-13'),/header mismatch/);
});
test('observed score change splits input and calibration steps without claiming causal independence',()=>{
  const variant=protocol.variants[0],features=Object.fromEntries(FEATURE_KEYS.map(key=>[key,10]));
  const make=(date,center)=>{
    const parameters={calibration:Object.fromEntries(FEATURE_KEYS.map(key=>[key,{center,scale:1}])),weights:Object.fromEntries(CHANNEL_KEYS.map(key=>[key,1/6]))};
    return {date,scoreInputs:{features,parameters:{[variant.id]:parameters}},variantScores:{[variant.id]:replayPressureInputs(features,parameters,variant)}};
  };
  const previous=make('2026-09-11',0),current=make('2026-09-12',10),result=decomposeScoreChange(previous,current,variant);
  assert.equal(result.marketInputStep,0);assert.equal(result.recalibrationStep,result.totalChange);
  assert.equal(result.causalAttribution,false);current.variantScores[variant.id]=0;
  assert.throws(()=>decomposeScoreChange(previous,current,variant),/score mismatch/);
});
