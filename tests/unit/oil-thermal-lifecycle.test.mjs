import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fetchFirmsText, getFirmsErrorDiagnostics, createFirmsRetryBudget } from '../../scripts/oil-directional/firms-request-policy.mjs';
import { buildLiveArtifact, readFacilityConfig, readBaselineConfig } from '../../scripts/oil-directional/build-oil-thermal-watch.mjs';
import { classifyOilThermalSampleHealth } from '../../scripts/oil-directional/oil-thermal-sample-health.mjs';
import { thermalObservationHealth, matchesLegacyThermalSources } from '../../scripts/modules/oilThermalSourceLifecycle.js';
import { shippingFreightDisplay } from '../../scripts/modules/macroOverviewDisplayHelpers.js';
const sources = ['VIIRS_SNPP_NRT','VIIRS_NOAA20_NRT','VIIRS_NOAA21_NRT'];
const before = '2026-11-02T15:39:59Z';
const after = '2026-11-06T00:00:00Z';
const header = 'acq_date,acq_time,confidence,frp,daynight\n';
const csv = header + '2026-11-01,1200,h,100,D\n';
const url = source => 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/TEST_ONLY/' + source + '/0,0,1,1/1';
test('retired S-NPP is classified without network, retry, secret, or response disclosure', async () => {
  let calls=0; const budget=createFirmsRetryBudget();
  await assert.rejects(fetchFirmsText(url(sources[0]), { nowMs:Date.parse(after), retryBudget:budget, fetchImpl:async()=>{calls++; throw Error('unexpected');} }), error=>{
    const d=getFirmsErrorDiagnostics(error); assert.equal(d.category,'source_retired');assert.equal(d.attempts,0);assert.equal(d.retryCount,0);assert.equal(d.retryable,false);assert.ok(!JSON.stringify(d).includes('TEST_ONLY'));return true;
  }); assert.equal(calls,0);assert.equal(budget.used,0);
});
test('retirement boundary preserves earlier/historical windows and active NOAA satellites', async () => {
  let calls=0; const fetchImpl=async()=>{calls++;return new Response(header,{status:200});};
  for(const [u,t] of [[url(sources[0]),before],[url(sources[0])+'/2026-10-31',after],[url(sources[1]),after],[url(sources[2]),after]]) {
    const result=await fetchFirmsText(u,{timeoutMs:2000,nowMs:Date.parse(t),fetchImpl});assert.equal(result.diagnostics.outcome,'success');
  }
  assert.equal(calls,4);
  for(const [u,t] of [[url(sources[0]),'2026-11-02T15:40:00Z'],[url(sources[0])+'/2026-11-02',after]]) await assert.rejects(fetchFirmsText(u,{nowMs:Date.parse(t),fetchImpl}));
  assert.equal(calls,4);
});
function inputs(generatedAt, selected=sources) {
  return { generatedAt, options:{sources:selected,dayRange:1,timeoutMs:2000,baselinePath:'config/oil-thermal-watch-baseline.json',facilitiesPath:'config/oil-thermal-watch-facilities.json'},
    config:{schemaVersion:'oil-thermal-facilities-production-v1',facilities:[{id:'synthetic-test',label:'Synthetic only',region:'test',assetType:'test',sourceNote:'synthetic fixture only',bbox:{string:'0,0,1,1'}}]},
    baselineConfig:{schemaVersion:'oil-thermal-baseline-production-v1',status:'established',notes:[],sourceReview:null,
      policy:{minSamplesPerFacility:8,minRepeatSources:2,rowCountP95Margin:1,maxFrpP95Margin:1,highConfidenceP95Margin:0,frpOver50P95Margin:0,elevatedMinFrp:50,elevatedMinHighConfidenceCount:2,elevatedMinFrpOver50Count:1,elevatedMinFrpOver100Count:1},
      facilitiesById:new Map([['synthetic-test',{sampleCount:20,rowCountP95:0,maxFrpP95:0,highConfidenceCountP95:0,frpOver50CountP95:0,sourcesWithDetectionsP95:0}]])},
    keyResolution:{mapKey:'TEST_ONLY',status:'configured'} };
}
async function build(generatedAt,{selected=sources,body=csv,failNoaa=false}={}) {
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async u=>{calls++;return failNoaa&&u.includes('NOAA20')?new Response('',{status:403}):new Response(body,{status:200});};
  try{return {artifact:await buildLiveArtifact(inputs(generatedAt,selected)),calls};}finally{globalThis.fetch=old;}
}
test('post-retirement keeps NOAA detections but cannot use old three-source baseline', async()=>{
  const {artifact:a,calls}=await build(after);assert.equal(calls,2);assert.equal(a.aggregate.rowCount,2);assert.equal(a.aggregate.requestDiagnostics.totalAttemptCount,2);
  assert.equal(a.aggregate.requestDiagnostics.failuresByCategory.source_retired,1);assert.equal(a.status,'partial');assert.equal(a.signalState,'source_unavailable');
  assert.equal(a.aggregate.repeatedObservationCount,0);assert.equal(a.aggregate.elevatedRepeatedObservationCount,0);assert.equal(a.facilities[0].baselineComparison.aboveBaselineStrength,false);
  assert.match(a.displayStatusZh,/S-NPP/);assert.equal(a.facilities[0].baselineComparison.status,'established');assert.match(a.facilities[0].anomalyLabelZh,/暂不判断/);assert.equal(a.facilities[0].anomalyLevel,a.facilities[0].rawSignalLevel);assert.equal(a.facilities[0].rawSignalLevel,'elevated_watch');assert.equal(classifyOilThermalSampleHealth(a).eligible,false);assert.ok(Object.values(a.productionImpact).every(v=>v===false));
});
test('empty remaining sources are unknown, not no-detections evidence', async()=>{
  const {artifact:a}=await build(after,{body:header});assert.equal(a.aggregate.rowCount,0);assert.equal(a.signalState,'source_unavailable');assert.notEqual(a.status,'ok');
});
test('pre-retirement complete cohort preserves existing repeated-observation mathematics', async()=>{
  const {artifact:a,calls}=await build(before);assert.equal(calls,3);assert.equal(a.aggregate.rowCount,3);assert.equal(a.aggregate.elevatedRepeatedObservationCount,1);assert.equal(a.status,'ok');assert.equal(classifyOilThermalSampleHealth(a).eligible,true);
});
test('partial requests and source selection changes cannot bypass comparison guard', async()=>{
  for(const opts of [{failNoaa:true},{selected:sources.slice(1)}]) {const {artifact:a}=await build(before,opts);assert.equal(a.status,'partial');assert.equal(a.signalState,'source_unavailable');assert.equal(a.aggregate.repeatedObservationCount,0);}
  assert.equal(matchesLegacyThermalSources([...sources].reverse()),true);assert.equal(matchesLegacyThermalSources([sources[0],sources[0],sources[1]]),false);
});
test('old successful post-retirement artifact is quarantined even with zero HTTP errors', async()=>{
  const {artifact:a}=await build(before);a.generatedAt=after;assert.equal(classifyOilThermalSampleHealth(a).eligible,false);
  assert.ok(classifyOilThermalSampleHealth(a).reasons.includes('source_transition_requires_baseline_review'));
});
test('display health separates missing, stale, future, partial and source-transition', async()=>{
  const {artifact:a}=await build(before); const now=Date.parse(before);
  assert.equal(thermalObservationHealth(a,now).usable,true);
  assert.equal(thermalObservationHealth(a,now+86400001).reason,'stale');
  assert.equal(thermalObservationHealth({...a,generatedAt:after},now).reason,'clock');
  assert.equal(thermalObservationHealth({...a,status:'partial'},now).reason,'partial');
  assert.equal(thermalObservationHealth({...a,generatedAt:after},Date.parse(after)).reason,'source_transition');
  assert.equal(thermalObservationHealth(null,now).reason,'missing');
});
function node(){return {children:[],textContent:'',className:'',append(...n){this.children.push(...n);}};}
const ctx={thermalObservationHealth,shippingFreightDisplay,document:{createElement:node,getElementById:()=>null}};
const renderer=fs.readFileSync('scripts/modules/renderOilDirectional.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function ');
vm.runInNewContext(renderer+'\nglobalThis.api={renderSatelliteThermalWatch,thermalWindowText,thermalSignalText,thermalTone,thermalReadiness,crossThermalLayer,transportReadiness};',ctx);
test('degraded renderer never claims no thermal confirmation or a usable green baseline', async()=>{
  const {artifact:a}=await build(after);assert.equal(ctx.api.thermalTone(a),'yellow');assert.equal(ctx.api.crossThermalLayer(a).stance,'unknown');assert.match(ctx.api.thermalSignalText(a),/不据此判断无异常/);assert.match(ctx.api.thermalReadiness(a).className,/yellow/);
  assert.doesNotMatch(ctx.api.thermalSignalText(null),/^0 条/);
});
test('freight context preserves missing quotes and explicitly blocks route confirmation',()=>{
  const item=ctx.api.transportReadiness({macroDrivers:{shippingFreight:{balticDirtyTankerIndex:null}}});
  const text=item.children.map(n=>n.textContent).join(' ');assert.match(text,/BDTI —/);assert.match(text,/均非路线报价/);assert.match(text,/路线级油轮运费与市场确认仍未接入/);assert.doesNotMatch(text,/BDTI 0/);
});

test('legacy missing, duplicate and changed source declarations cannot enter the three-source cohort',async()=>{
  const {artifact:a}=await build(before);
  for(const altered of [undefined,sources.slice(1),[sources[0],sources[0],sources[1]]]) {
    const row={...a,sources:altered};assert.equal(classifyOilThermalSampleHealth(row).eligible,false);assert.equal(thermalObservationHealth(row,Date.parse(before)).reason,'source_set');
  }
});
test('one failed facility suppresses whole-run repeated comparisons while keeping measurements',async()=>{
  const input=inputs(before);input.config.facilities.push({...input.config.facilities[0],id:'second-synthetic',bbox:{string:'2,2,3,3'}});
  input.baselineConfig.facilitiesById.set('second-synthetic',input.baselineConfig.facilitiesById.get('synthetic-test'));
  const old=globalThis.fetch;globalThis.fetch=async u=>new Response(u.includes('2,2,3,3')&&u.includes('NOAA20')?'':csv,{status:u.includes('2,2,3,3')&&u.includes('NOAA20')?403:200});
  try{const a=await buildLiveArtifact(input);assert.equal(a.aggregate.rowCount,5);assert.equal(a.aggregate.repeatedObservationCount,0);assert.equal(a.aggregate.elevatedRepeatedObservationCount,0);assert.ok(a.facilities.every(f=>f.baselineComparison.repeatedObservation===false));}finally{globalThis.fetch=old;}
});
test('window display distinguishes snapshot time, detection time and an empty returned window',async()=>{
  const {artifact:a}=await build(before,{body:header});const text=ctx.api.thermalWindowText(a);assert.match(text,/快照 2026-11-02/);assert.match(text,/本查询未返回热源记录/);assert.doesNotMatch(text,/尚未查询/);
  a.freshness.latestAcqAt='2026-11-01T12:00:00Z';a.freshness.latestAgeHours=99999;const measured=ctx.api.thermalWindowText(a);assert.match(measured,/最新检出 2026-11-01/);assert.doesNotMatch(measured,/99999/);
});

test('full production-shape synthetic retirement output passes the unchanged contract assertions',async()=>{
  const options={sources,dayRange:1,timeoutMs:2000,baselinePath:'config/oil-thermal-watch-baseline.json',facilitiesPath:'config/oil-thermal-watch-facilities.json'};
  const config=readFacilityConfig(options.facilitiesPath),baselineConfig=readBaselineConfig(options.baselinePath);
  const old=globalThis.fetch;let calls=0;globalThis.fetch=async u=>{assert.ok(!u.includes('VIIRS_SNPP_NRT'));calls++;return new Response(header,{status:200});};
  let artifact;try{artifact=await buildLiveArtifact({generatedAt:after,options,config,baselineConfig,keyResolution:{mapKey:'TEST_ONLY',status:'configured'}});}finally{globalThis.fetch=old;}
  assert.equal(calls,config.facilities.length*2);assert.equal(artifact.aggregate.requestDiagnostics.failuresByCategory.source_retired,config.facilities.length);
  const checker=fs.readFileSync('scripts/check-oil-thermal-watch-contract.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
  const output=[];vm.runInNewContext(checker,{readFileSync:path=>path==='data/oil-thermal-watch.json'?JSON.stringify(artifact):fs.readFileSync(path,'utf8'),resolve:x=>x,process:{exit:code=>{throw Error('contract exit '+code+' '+output.join(' '));}},console:{log:x=>output.push(x),error:(...x)=>output.push(x.join(' '))}});
  assert.ok(output.some(line=>line.includes('PASS')));
});
test('repeated thermal rendering clears a prior green state and old counts on missing data',async()=>{
  const elements=new Map();ctx.document.getElementById=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  let now=Date.parse(before);ctx.thermalObservationHealth=data=>thermalObservationHealth(data,now);
  try {
    const {artifact:healthy}=await build(before,{body:header});ctx.api.renderSatelliteThermalWatch(healthy);assert.match(elements.get('odp-thermal-status').className,/green/);
    now=Date.parse(after);const {artifact:held}=await build(after);ctx.api.renderSatelliteThermalWatch(held);assert.match(elements.get('odp-thermal-status').className,/yellow/);assert.match(elements.get('odp-thermal-signal').textContent,/不据此判断无异常/);
    ctx.api.renderSatelliteThermalWatch(null);assert.doesNotMatch(elements.get('odp-thermal-status').className,/green/);assert.match(elements.get('odp-thermal-signal').textContent,/检出计数未知/);assert.doesNotMatch(elements.get('odp-thermal-signal').textContent,/已返回 2/);
  } finally {ctx.thermalObservationHealth=thermalObservationHealth;ctx.document.getElementById=()=>null;}
});
