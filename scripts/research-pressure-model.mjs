#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pressureFeatures, scorePressure, validateResearchProtocol, digest, quantile, mean } from './daily/pressure-model.mjs';
import { agreementMetrics, bootstrapAgreement, appendShadowLedger, shadowReadiness, validateShadowLedger } from './daily/pressure-evaluation.mjs';
import { parseFredCsv } from './audit-main-score-backtest.mjs';
import { deriveHistoricalRisk } from './daily/historical-score.mjs';
import { isHistoricalDate } from './daily/historical-validation.mjs';

const ROOT=path.resolve('manual-artifacts/main-score-audit/pressure-model');
const LEGACY={hyOas:'BAMLH0A0HYM2',igOas:'BAMLC0A0CM',real10y:'DFII10',walcl:'WALCL',onRrp:'RRPONTSYD',t10y2y:'T10Y2Y'};
const DAY=86400000;
export function implementationHash() {
  return digest(['scripts/daily/pressure-model.mjs','scripts/daily/pressure-evaluation.mjs','scripts/research-pressure-model.mjs',
    'scripts/daily/historical-score.mjs','scripts/daily/score-input-contract.mjs','scripts/daily/structural-freshness.mjs',
    'scripts/run-daily-pipeline.mjs','config/rules.json'].map(file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')));
}
export function outputPath(file) {
  const target=path.resolve(file);
  if(!target.startsWith(ROOT+path.sep)) throw new Error('Research output must stay under ignored pressure-model artifact directory');
  return target;
}
export function weeklyDates(start,end) {
  let ms=Date.parse(`${start}T00:00:00Z`), last=Date.parse(`${end}T00:00:00Z`);
  while(new Date(ms).getUTCDay()!==5) ms+=DAY;
  const dates=[]; for(;ms<=last;ms+=7*DAY) dates.push(new Date(ms).toISOString().slice(0,10));
  return dates;
}
export function parseResearchArgs(argv) {
  const options={allowNetwork:false,recordShadow:false,output:path.join(ROOT,'report.json'),cache:path.join(ROOT,'source-cache.json'),previousLedger:null};
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--allow-network') options.allowNetwork=true;
    else if(arg==='--record-shadow') options.recordShadow=true;
    else if(['--output','--cache','--previous-ledger'].includes(arg)) {
      const value=argv[++i]; if(!value) throw new Error(`Missing value: ${arg}`);
      options[arg==='--output'?'output':arg==='--cache'?'cache':'previousLedger']=value;
    } else throw new Error(`Unknown research argument: ${arg}`);
  }
  outputPath(options.output); outputPath(options.cache);
  if(options.recordShadow&&!options.allowNetwork) throw new Error('Prospective recording requires a new live retrieval');
  return options;
}
function writeJson(file,value) { const target=outputPath(file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n'); }
function validateRows(rows) {
  let prior=''; for(const row of rows) {if(!isHistoricalDate(row.date)||row.date<=prior||!Number.isFinite(row.value)) throw new Error('Invalid/duplicate source dates');prior=row.date;}
}
async function retrieve(protocol,options,now) {
  if(!options.allowNetwork) {
    const cache=JSON.parse(fs.readFileSync(options.cache,'utf8'));
    if(cache.schemaVersion!=='pressure-source-cache-v1') throw new Error('Invalid source cache');
    for(const rows of Object.values(cache.series)) validateRows(rows);
    return cache;
  }
  const ids={...Object.fromEntries(Object.entries(protocol.sources).map(([key,p])=>[key,p.seriesId])),...protocol.benchmarks,...LEGACY};
  const series={},sourceStatus={};
  for(const [key,id] of Object.entries(ids)) {
    try {
      const url=new URL('https://fred.stlouisfed.org/graph/fredgraph.csv');
      url.searchParams.set('id',id);url.searchParams.set('cosd','2005-01-01');url.searchParams.set('coed',now.slice(0,10));
      const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'GFRR-pressure-research/1.0'}});
      if(!response.ok) throw new Error(`HTTP_${response.status}`);
      const rows=parseFredCsv(await response.text());validateRows(rows);
      if(rows.length<2) throw new Error('insufficient_observations');
      series[key]=rows;sourceStatus[key]={seriesId:id,status:'available',count:rows.length,firstDate:rows[0].date,lastDate:rows.at(-1).date};
    } catch(error) {series[key]=[];sourceStatus[key]={seriesId:id,status:'unavailable',reason:error.name==='TimeoutError'?'timeout':'fetch_or_parse_failed'};}
    console.log(`[pressure-research] ${key}: ${sourceStatus[key].status}`);
  }
  const cache={schemaVersion:'pressure-source-cache-v1',retrievedAt:new Date().toISOString(),vintage:'latest_revised_not_point_in_time',series,sourceStatus};
  // Do not overwrite a usable local cache with a failed core-source retrieval.
  if(Object.keys(protocol.sources).every(key=>sourceStatus[key].status==='available')) writeJson(options.cache,cache);
  return cache;
}
function compareRows(rows, benchmark, protocol) {
  const values=new Map(benchmark.map(row=>[row.date,row.value]));
  const matched=rows.filter(row=>Number.isFinite(row.score)&&values.has(row.date)).map(row=>({date:row.date,score:row.score,benchmark:values.get(row.date)}));
  return {overall:{...agreementMetrics(matched,protocol.evaluation),uncertainty:bootstrapAgreement(matched,protocol.evaluation)},
    byYear:Object.fromEntries([...new Set(matched.map(row=>row.date.slice(0,4)))].map(year=>[year,agreementMetrics(matched.filter(row=>row.date.startsWith(year)),protocol.evaluation)]))};
}
export function legacyAvailableSeries(series,date,protocol) {
  const lags={...Object.fromEntries(Object.entries(protocol.sources).map(([key,p])=>[key,p.assumedReleaseLagDays])),...protocol.legacyAdditionalAssumedReleaseLagDays};
  if(Object.keys(LEGACY).some(key=>!Number.isInteger(lags[key])||lags[key]<0)) throw new Error('Missing legacy lag assumption');
  return Object.fromEntries(Object.entries(series).map(([key,rows])=>{
    if(!Object.hasOwn(lags,key)) return [key,rows];
    const cutoff=new Date(Date.parse(`${date}T00:00:00Z`)-lags[key]*DAY).toISOString().slice(0,10);
    return [key,rows.filter(row=>row.date<=cutoff)];
  }));
}
export function evaluateResearch(cache,protocol,today,rules) {
  validateResearchProtocol(protocol);
  const dates=weeklyDates(protocol.evaluation.startDate,today),series=cache.series;
  const features=dates.map(date=>pressureFeatures(series,date,protocol));
  const histories=Object.fromEntries(protocol.variants.map(variant=>[variant.id,features.map(current=>scorePressure(current,features,protocol,variant))]));
  const commonDates=new Set(dates.filter((date,i)=>date<=protocol.evaluation.historicalCutoff&&Object.values(histories).every(rows=>Number.isFinite(rows[i].score))));
  const legacy=dates.filter(date=>commonDates.has(date)).map(date=>deriveHistoricalRisk(date,series,rules)).filter(Boolean);
  const legacyLagged=dates.filter(date=>commonDates.has(date)).map(date=>deriveHistoricalRisk(date,legacyAvailableSeries(series,date,protocol),rules)).filter(Boolean);
  const matchedDates=new Set(legacyLagged.filter(row=>legacy.some(other=>other.date===row.date)).map(row=>row.date));
  const comparison={};
  for(const [id,rows] of Object.entries({...histories,legacy_current_rules:legacy,legacy_assumed_lags:legacyLagged})) {
    const common=rows.filter(row=>commonDates.has(row.date)&&matchedDates.has(row.date));
    comparison[id]={coverage:common.length,firstDate:common[0]?.date||null,lastDate:common.at(-1)?.date||null,
      scoreRange:common.length?[Math.min(...common.map(row=>row.score)),Math.max(...common.map(row=>row.score))]:null,
      benchmarks:Object.fromEntries(Object.keys(protocol.benchmarks).map(key=>[key,compareRows(common,series[key]||[],protocol)]))};
  }
  const current=pressureFeatures(series,today,protocol);
  const candidates=protocol.variants.map(variant=>scorePressure(current,features,protocol,variant));
  const extraLag=features.map(row=>pressureFeatures(series,row.date,protocol,3));
  const lagged=extraLag.map(row=>scorePressure(row,extraLag,protocol,protocol.variants.find(v=>v.id==='diversified_156')));
  const central=histories.diversified_156;
  const lagDifferences=central.flatMap((row,i)=>row.date<=protocol.evaluation.historicalCutoff&&Number.isFinite(row.score)&&Number.isFinite(lagged[i].score)?[Math.abs(row.score-lagged[i].score)]:[]);
  const variantSpreads=dates.flatMap((date,i)=>commonDates.has(date)?[Math.max(...Object.values(histories).map(rows=>rows[i].score))-Math.min(...Object.values(histories).map(rows=>rows[i].score))]:[]);
  return {comparison,current:{date:today,evidence:current.evidence,features:current.features,references:current.references,missing:current.missing,candidates},
    diagnostics:{requestedWeeks:dates.length,commonWeeks:commonDates.size,legacyMatchedWeeks:matchedDates.size,
      missingFeatureWeeks:features.filter(row=>!row.features).length,legacyProxyWeeks:legacy.filter(row=>row.inputs.creditProxyUsed).length,
      lagMatchedLegacyProxyWeeks:legacyLagged.filter(row=>matchedDates.has(row.date)&&row.inputs.creditProxyUsed).length,
      lagMatchedExcludedDates:[...commonDates].filter(date=>!matchedDates.has(date)),
      lagPlus3Days:{pairedWeeks:lagDifferences.length,medianAbsoluteChange:quantile(lagDifferences,0.5),p95AbsoluteChange:quantile(lagDifferences,0.95)},
      candidateSpread:{median:quantile(variantSpreads,0.5),p95:quantile(variantSpreads,0.95)},
      sourceCoveragePreventsFullCrisisHistory:true},
    baselineComparison:{primary:'legacy_assumed_lags',diagnostic:'legacy_current_rules',
      sameAssumedAvailabilityForSharedInputs:true,trueReleaseVintages:false,
      limitation:'Legacy-only inputs retain separate explicit lag assumptions; missing structural inputs and historical proxies remain disclosed.'},
    weeklyScores:Object.fromEntries(Object.entries(histories).map(([id,rows])=>[id,rows.filter(row=>row.date<=protocol.evaluation.historicalCutoff).map(row=>({date:row.date,score:row.score,status:row.status}))]))};
}

export async function main(argv=process.argv.slice(2)) {
  if(argv.length===1&&argv[0]==='--print-cohort') {
    const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));validateResearchProtocol(protocol);
    console.log(`pressure-shadow-${digest({protocol,implementation:implementationHash()}).slice(0,16)}`);return;
  }
  const options=parseResearchArgs(argv), now=new Date().toISOString(), today=now.slice(0,10);
  const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));
  const rules=JSON.parse(fs.readFileSync('config/rules.json','utf8'));validateResearchProtocol(protocol);
  // Emit a fingerprint before source retrieval/results; retain this protocol for
  // the prospective cohort. Historical comparisons remain retrospective.
  console.log(`[pressure-research] protocol=${digest(protocol)}`);
  const cache=await retrieve(protocol,options,now);
  const results=evaluateResearch(cache,protocol,today,rules);
  const existing=options.previousLedger&&fs.existsSync(options.previousLedger)?JSON.parse(fs.readFileSync(options.previousLedger,'utf8')):null;
  validateShadowLedger(existing,protocol,implementationHash(),new Date().toISOString());
  let ledger=existing;
  const selected=results.current.candidates.find(row=>row.variant==='diversified_156');
  if(options.recordShadow&&Number.isFinite(selected?.score)) {
    const recordedAt=new Date().toISOString();
    const scoreInputs={evidence:results.current.evidence,features:results.current.features,references:results.current.references,
      parameters:Object.fromEntries(results.current.candidates.map(row=>[row.variant,{calibration:row.calibration,weights:row.weights}]))};
    const legacy=deriveHistoricalRisk(today,legacyAvailableSeries(cache.series,today,protocol),rules);
    ledger=appendShadowLedger(existing,{date:today,recordedAt,protocolHash:digest(protocol),implementationHash:implementationHash(),
      scoreInputs,inputHash:digest(scoreInputs),sourceRetrievedAt:cache.retrievedAt,score:selected.score,
      variant:selected.variant,channels:selected.channels,weights:selected.weights,calibration:selected.calibration,
      variantScores:Object.fromEntries(results.current.candidates.map(row=>[row.variant,row.score])),
      legacy:{score:legacy?.score??null,reason:legacy?'lag_matched_public_history_replay_not_actual_production_snapshot':'unavailable',
        inputDiagnostics:legacy?.inputDiagnostics||{},components:legacy?.components||{},
        proxyInputs:legacy?.historicalProxyInputs||[],defaultedInputs:legacy?.defaultedHistoricalInputs||[],
        modelHash:digest({rules,code:fs.readFileSync('scripts/run-daily-pipeline.mjs','utf8').replaceAll('\r\n','\n')})},
      sourceObservationDates:Object.fromEntries(Object.entries(results.current.evidence).map(([key,row])=>[key,row?.observationDate||null]))},protocol,recordedAt);
    writeJson(path.join(path.dirname(options.output),'shadow-ledger.json'),ledger);
  }
  const paired=(ledger?.records||[]).filter(row=>Number.isFinite(row.legacy?.score)&&protocol.variants.every(v=>Number.isFinite(row.variantScores?.[v.id])));
  const prospective=Object.fromEntries([...protocol.variants.map(v=>v.id),'legacy_assumed_lags'].map(id=>[id,
    Object.fromEntries(Object.keys(protocol.benchmarks).map(key=>[key,compareRows(paired.map(row=>({date:row.date,score:id==='legacy_assumed_lags'?row.legacy.score:row.variantScores[id]})),cache.series[key]||[],protocol)]))]));
  const benchmarkWeeks=Math.min(...Object.values(prospective).flatMap(results=>Object.values(results).map(result=>result.overall.n)));
  const report={schemaVersion:'pressure-model-research-report-v1',generatedAt:new Date().toISOString(),protocolHash:digest(protocol),implementationHash:implementationHash(),
    modelId:protocol.modelId,validation:{historicalPointInTime:false,untouchedHistoricalTest:false,predictiveEvidence:false,
      probabilityCalibration:false,positionSizingValidation:false,benchmarkIndependence:false,automaticPromotion:false},
    sourceStatus:cache.sourceStatus,sourceRetrievedAt:cache.retrievedAt,limitations:protocol.limitations,...results,
    prospectiveComparison:prospective,shadow:shadowReadiness(ledger,protocol,benchmarkWeeks),decision:'continue_prospective_shadow_no_production_replacement'};
  writeJson(options.output,report);
  console.log(JSON.stringify({output:options.output,commonWeeks:results.diagnostics.commonWeeks,
    current:results.current.candidates.map(row=>({id:row.variant,score:row.score,status:row.status})),shadow:report.shadow}));
  if(options.recordShadow&&!Number.isFinite(selected?.score)) throw new Error('Shadow unavailable: preserve previous ledger; no fabricated score');
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(`[pressure-research] ${error.message}`);process.exitCode=1;});
