import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pressureFeatures, scorePressure, digest, FEATURE_KEYS, replayPressureInputs } from './daily/pressure-model.mjs';
import { isHistoricalDate, historicalNumber } from './daily/historical-validation.mjs';
import { weeklyDates } from './research-pressure-model.mjs';

// Fixed before retrieval, deliberately include early periods that may lack data.
export const AUDIT_DATES = ['2008-10-10','2011-08-12','2019-09-20','2020-03-20','2022-06-17','2023-03-17','2024-08-09'];
const ROOT=path.resolve('manual-artifacts/main-score-audit/pressure-vintages');
const START='2005-01-01';
const DAY=86400000;
export function parseVintageCsv(text, seriesId, vintage) {
  if(!isHistoricalDate(vintage)||!/^[A-Z0-9]+$/.test(seriesId)) throw new Error('Invalid vintage request');
  const lines=text.trim().replace(/^\uFEFF/,'').split(/\r?\n/);
  if(lines.shift()!==`observation_date,${seriesId}_${vintage.replaceAll('-','')}`) throw new Error('Vintage header mismatch');
  const rows=[];let previous='',missing=0;
  for(const line of lines) {
    const columns=line.split(',');if(columns.length!==2) throw new Error('Invalid vintage CSV width');
    const [date,raw]=columns;
    if(!isHistoricalDate(date)||date<=previous||date>vintage) throw new Error('Invalid/future/duplicate vintage observation');
    previous=date;
    if(raw==='.'||raw==='') {missing++;continue;}
    const value=historicalNumber(raw);if(!Number.isFinite(value)) throw new Error('Invalid vintage value');
    rows.push({date,value});
  }
  return {rows,missing};
}
export function compareVintageRows(archived, revised, asOf) {
  const old=new Map(archived.map(row=>[row.date,row.value]));
  const newer=new Map(revised.filter(row=>row.date<=asOf).map(row=>[row.date,row.value]));
  let changed=0,maximumAbsoluteRevision=0;
  for(const [date,value] of old) if(newer.has(date)&&newer.get(date)!==value) {
    changed++;maximumAbsoluteRevision=Math.max(maximumAbsoluteRevision,Math.abs(newer.get(date)-value));
  }
  return {archivedObservations:old.size,revisedObservations:newer.size,changed,
    retrospectivelyAdded:[...newer.keys()].filter(date=>!old.has(date)).length,
    removedFromLatest:[...old.keys()].filter(date=>!newer.has(date)).length,maximumAbsoluteRevision};
}
export function replayVintagePanel(series, date, protocol) {
  const history=weeklyDates(protocol.evaluation.startDate,date).map(day=>pressureFeatures(series,day,protocol));
  const current=pressureFeatures(series,date,protocol);
  return {date,missing:current.missing,
    candidates:protocol.variants.map(variant=>{
      const row=scorePressure(current,history,protocol,variant);
      return {variant:row.variant,status:row.status,score:row.score,trainingWeeks:row.trainingWeeks??null};
    })};
}
export function calibrationDriftDiagnostic(protocol) {
  const date='2026-09-11',end=Date.parse(date+'T00:00:00Z');
  const make=(day,value)=>({date:day,features:Object.fromEntries(FEATURE_KEYS.map(key=>[key,value]))});
  const current=make(date,10),variant=protocol.variants.find(row=>row.id==='diversified_156');
  const rows=[0,52,104,156].map(highWeeks=>{
    const history=Array.from({length:156},(_,i)=>make(new Date(end-(156-i)*7*DAY).toISOString().slice(0,10),i>=156-highWeeks?10:0));
    const result=scorePressure(current,history,protocol,variant);
    return {highWeeks,currentInput:10,score:result.score,calibration:result.calibration,weights:result.weights};
  });
  const frozen={calibration:rows[0].calibration,weights:rows[0].weights};
  return {type:'synthetic_fixed_input_moving_history',notObservedMarketData:true,
    inputChange:0,rows:rows.map(row=>({highWeeks:row.highWeeks,score:row.score,
      fixedInitialCalibrationScore:replayPressureInputs(current.features,frozen,variant)})),
    interpretation:'Relative pressure can normalize during persistent elevated inputs; this is not evidence that absolute market conditions improved.'};
}
export function decomposeScoreChange(previous,current,variant) {
  const before=replayPressureInputs(previous.scoreInputs.features,previous.scoreInputs.parameters[variant.id],variant);
  const intermediate=replayPressureInputs(current.scoreInputs.features,previous.scoreInputs.parameters[variant.id],variant);
  const after=replayPressureInputs(current.scoreInputs.features,current.scoreInputs.parameters[variant.id],variant);
  if(!Number.isFinite(previous.variantScores?.[variant.id])||!Number.isFinite(current.variantScores?.[variant.id])
    ||Math.abs(before-previous.variantScores[variant.id])>1e-9||Math.abs(after-current.variantScores[variant.id])>1e-9) throw new Error('Recorded score mismatch');
  return {variant:variant.id,fromDate:previous.date,toDate:current.date,totalChange:after-before,
    marketInputStep:intermediate-before,recalibrationStep:after-intermediate,
    method:'inputs_first_then_calibration_order_dependent',causalAttribution:false};
}
function write(file,value) {fs.mkdirSync(ROOT,{recursive:true});fs.writeFileSync(path.join(ROOT,file),JSON.stringify(value,null,2)+'\n');}
export function parseLatestCsv(text,seriesId,retrievedDate) {
  if(text.replace(/^\uFEFF/,'').split(/\r?\n/)[0]!==`observation_date,${seriesId}`) throw new Error('Latest CSV header mismatch');
  return parseVintageCsv(text.replace(`observation_date,${seriesId}`,`observation_date,${seriesId}_${retrievedDate.replaceAll('-','')}`),seriesId,retrievedDate);
}
async function fetchPanel(protocol,vintage,network,kind='archived') {
  const fileName=`raw-${kind==='latest'?'latest-':''}${vintage}.json`,file=path.join(ROOT,fileName);
  if(!network) {
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(saved.vintage!==vintage||saved.protocolHash!==digest(protocol)||(saved.kind||'archived')!==kind) throw new Error('Vintage cache identity mismatch');
    // Revalidate raw headers and every observation on offline reuse.
    saved.series={};
    for(const key of Object.keys(protocol.sources)) {
      const item=saved.sources[key];
      if(!item||!['available','unavailable'].includes(item.status)) throw new Error('Incomplete source status');
      if(item.status==='available'&&item.rawHash!==digest(item.rawCsv)) throw new Error('Cached source hash mismatch');
      saved.series[key]=item.status==='available'?(kind==='latest'?parseLatestCsv:parseVintageCsv)(item.rawCsv,protocol.sources[key].seriesId,vintage).rows:[];
    }
    return saved;
  }
  const series={},sources={};
  for(const [key,policy] of Object.entries(protocol.sources)) {
    const url=new URL(kind==='latest'?'https://fred.stlouisfed.org/graph/fredgraph.csv':'https://alfred.stlouisfed.org/graph/alfredgraph.csv');
    for(const [name,value] of Object.entries({id:policy.seriesId,cosd:START,coed:AUDIT_DATES.at(-1),...(kind==='archived'?{vintage_date:vintage}:{})})) url.searchParams.set(name,value);
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`HTTP_${response.status}`);
      if(!/csv/.test(response.headers.get('content-type')||'')) throw new Error('Not CSV');
      const rawCsv=await response.text(),parsed=(kind==='latest'?parseLatestCsv:parseVintageCsv)(rawCsv,policy.seriesId,vintage);
      if(!parsed.rows.length) throw new Error('No vintage observations');
      series[key]=parsed.rows;sources[key]={status:'available',url:url.href,rawCsv,rawHash:digest(rawCsv),
        retrievedAt:new Date().toISOString(),missing:parsed.missing,firstDate:parsed.rows[0].date,lastDate:parsed.rows.at(-1).date};
    } catch(error) {series[key]=[];sources[key]={status:'unavailable',url:url.href,reason:error.message};}
    console.log(`[vintage-audit] ${vintage} ${key}: ${sources[key].status}`);
  }
  const panel={vintage,kind,protocolHash:digest(protocol),series,sources};write(fileName,panel);return panel;
}
export async function main(args=process.argv.slice(2)) {
  if(args.some(arg=>!['--allow-network','--latest-only'].includes(arg))||args.includes('--latest-only')&&!args.includes('--allow-network')) throw new Error('Invalid audit flags; dates are fixed and latest-only requires network authorization');
  const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));
  const network=args.includes('--allow-network'),latestOnly=args.includes('--latest-only');
  const today=network?new Date().toISOString().slice(0,10):JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'),'utf8')).latestVintage;
  if(!isHistoricalDate(today)||today>new Date().toISOString().slice(0,10)) throw new Error('Invalid retrieval date');
  const manifest={protocolHash:digest(protocol),dates:AUDIT_DATES,latestVintage:today,
    maximumRequests:network?(latestOnly?1:AUDIT_DATES.length+1)*Object.keys(protocol.sources).length:0,modelTuning:false,productionWrites:false};
  console.log(JSON.stringify(manifest));if(network) write('manifest.json',manifest);
  const latest=await fetchPanel(protocol,today,network,'latest'),events=[];
  for(const date of AUDIT_DATES) {
    const archived=await fetchPanel(protocol,date,network&&!latestOnly);
    const snapshot=replayVintagePanel(archived.series,date,protocol),revised=replayVintagePanel(latest.series,date,protocol);
    events.push({date,snapshot,revised,
      comparison:protocol.variants.map((v,i)=>({variant:v.id,scoreDifference:Number.isFinite(snapshot.candidates[i].score)&&Number.isFinite(revised.candidates[i].score)?revised.candidates[i].score-snapshot.candidates[i].score:null})),
      inputs:Object.fromEntries(Object.keys(protocol.sources).map(key=>[key,{
        status:archived.sources[key].status,reason:archived.sources[key].reason??null,
        comparisonAvailable:archived.sources[key].status==='available'&&latest.sources[key].status==='available',
        revisions:archived.sources[key].status==='available'&&latest.sources[key].status==='available'?compareVintageRows(archived.series[key],latest.series[key],date):null}])),
      provenance:Object.fromEntries(Object.entries(archived.sources).map(([key,item])=>[key,{...item,rawCsv:undefined}]))});
  }
  const report={schemaVersion:'pressure-vintage-audit-v1',generatedAt:new Date().toISOString(),manifest,events,
    latestProvenance:Object.fromEntries(Object.entries(latest.sources).map(([key,item])=>[key,{...item,rawCsv:undefined}])),
    calibrationDrift:calibrationDriftDiagnostic(protocol),
    limitations:['Selected dates are retrospective case studies, not an untouched test set.',
      'Date-level ALFRED snapshots do not prove intraday availability; configured release lags remain assumptions.',
      'Historical calibration at each case uses the history known in that case vintage, not the latest history.',
      'Missing vintage series are unavailable; no current-vintage fallback is used to fill an archived panel.',
      'No full continuous historical vintage panel, probability calibration, portfolio utility or automatic promotion is established.'],
    eligibleForProduction:false};
  write('report.json',report);console.log(JSON.stringify({report:path.join(ROOT,'report.json'),events:events.map(e=>({date:e.date,score:e.snapshot.candidates[0].score,missing:e.snapshot.missing}))}));
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
