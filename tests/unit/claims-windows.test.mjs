import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { claimsWindow, cachedClaimsWindow } from '../../scripts/daily/claims-windows.mjs';
import { parseFredApiObservations } from '../../scripts/lib/fred-observations.mjs';
import { buildMacroCoherence } from '../../scripts/modules/buildCrossValidationMatrix.js';
const now = '2026-11-18T00:00:00Z';
const row = (date,value) => ({date,value});
const dates = ['2026-09-05','2026-09-12','2026-09-19','2026-09-26','2026-10-03','2026-10-10','2026-10-17','2026-10-24','2026-10-31'];
const rows = dates.map((date,i)=>row(date,i===0?100000:200000));
const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs',import.meta.url),'utf8');
function extract(name) { const start=source.indexOf(`function ${name}(`); assert.ok(start>=0); return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,source.indexOf('\n}',start)+2); }
function harness(icsa,ccsa=icsa) {
  const names=['buildMissingEmployment','normalizePreviousEmployment','resolveEmploymentBreadth','classifyClaimsRegime','classifyJoltsRegime','classifyIndustryDiffusionRegime','classifyLaborQualityRegime','latestIsoDate','averageRecentValues'];
  return vm.runInNewContext(names.map(extract).join('\n')+'\n({resolveEmploymentBreadth,averageRecentValues})',{
    isoNow:now,claimsWindow,cachedClaimsWindow,EMPLOYMENT_SOURCE:'test',EMPLOYMENT_INDUSTRY_PAYROLL_SERIES:[],
    verifiedPayrollBasketFallback:()=>({}),calculateIndustryPayrollDiffusion:()=>({}),
    fetchFredSeries:async(id)=>{const data=id==='ICSA'?icsa:id==='CCSA'?ccsa:null;if(data===null)throw Error('offline');return data;}
  });
}

test('normal current official claims means unchanged; zero retained',()=>{
  // U.S. Employment and Training Administration via FRED ICSA/CCSA, retrieved 2026-11-17.
  // https://fred.stlouisfed.org/series/ICSA and https://fred.stlouisfed.org/series/CCSA
  const initial=[row('2026-10-17',195000),row('2026-10-24',195000),row('2026-10-31',191000),row('2026-11-07',200000)];
  const continued=[row('2026-10-10',1722000),row('2026-10-17',1695000),row('2026-10-24',1717000),row('2026-10-31',1697000)];
  assert.equal(claimsWindow(initial,now).average,195250);assert.equal(claimsWindow(continued,now).average,1707750);
  const zero=claimsWindow(rows.map(r=>({...r,value:0})),now);assert.equal(zero.average,0);assert.equal(zero.change,0);
  const normal=claimsWindow(rows,now);assert.equal(normal.average,200000);assert.equal(normal.change,0);
});

test('missing current or prior week never slides four-week windows',()=>{
  for(let i=1;i<9;i++){
    const result=claimsWindow(rows.filter((_,index)=>index!==i),now);
    if(i===8) { assert.equal(result.change,25000); continue; } // latest earlier week is its own valid window
    assert.equal(result.change,null);
    assert.equal(result.average,i<5?200000:null);
  }
  assert.equal(claimsWindow(rows.slice(-3),now).average,null);
});

test('invalid dates, future rows, duplicates, order and numeric types cannot certify a window',()=>{
  for(const bad of [row('2026-02-30',200000),row('2027-01-01',200000),row('2026-10-24',null),row('2026-10-24','200000'),row('2026-10-24',-1)]){
    assert.equal(claimsWindow([...rows.slice(0,-2),bad,rows.at(-1)],now).average,null);
  }
  assert.equal(claimsWindow([...rows,rows.at(-1)],now).average,null);
  assert.equal(claimsWindow([...rows.slice(0,-2),rows.at(-1),rows.at(-2)],now).average,null);
});

test('cache needs recomputable proof, preserves original clock and rejects stale claims labels',async()=>{
  const live=await harness(rows).resolveEmploymentBreadth(null);
  const cached=await harness(null).resolveEmploymentBreadth({...live,updatedAt:'2026-11-17T00:00:00Z',claimsRegime:'明显走弱'});
  assert.equal(cached.initialClaims4wChange,0);assert.equal(cached.claimsRegime,'稳定');assert.equal(cached.updatedAt,'2026-10-31T00:00:00Z');
  assert.equal(cached.sourceStatus.icsa,'fallback');
  const legacy=await harness(null).resolveEmploymentBreadth({...live,claimsWindowEvidence:undefined,claimsRegime:'明显走弱'});
  assert.equal(legacy.initialClaims,200000);assert.equal(legacy.initialClaims4wAverage,null);assert.equal(legacy.initialClaims4wChange,null);assert.equal(legacy.claimsRegime,'未知');assert.equal(legacy.updatedAt,null);
  const p=claimsWindow(rows,now);
  for(const [level,average,change,evidence] of [[1,p.average,p.change,p.evidence],[p.level,1,p.change,p.evidence],[p.level,p.average,1,p.evidence],[p.level,p.average,p.change,null]]){
    assert.equal(cachedClaimsWindow(level,average,change,evidence,now).average,null);
  }
});

test('actual parser and resolver omit a missing-week change before downstream interpretation',async()=>{
  const parsed=parseFredApiObservations(JSON.stringify({observations:rows.map(r=>({...r,value:r.date==='2026-10-03'?'.':String(r.value)}))}));
  const before=harness(rows).averageRecentValues(parsed,4)-harness(rows).averageRecentValues(parsed,4,4);
  assert.equal(before,25000);
  const old=buildMacroCoherence({macroDrivers:{employment:{initialClaims4wChange:before}},displayInputsBaseline:{vix:16}});
  assert.equal(old.signals.find(s=>s.id==='main_vs_wall').verdict,'背离');
  const result=await harness(parsed).resolveEmploymentBreadth(null);
  assert.equal(result.initialClaims,200000);assert.equal(result.initialClaims4wAverage,200000);assert.equal(result.initialClaims4wChange,null);assert.equal(result.claimsRegime,'稳定');
  const matrix=buildMacroCoherence({macroDrivers:{employment:result},displayInputsBaseline:{vix:16}});
  assert.ok(!JSON.stringify(matrix).includes('初请 4 周 +25,000'));
  const legacy=await harness(null).resolveEmploymentBreadth({...result,claimsWindowEvidence:undefined});
  const missing=buildMacroCoherence({macroDrivers:{employment:legacy},displayInputsBaseline:{vix:16}});
  assert.ok(JSON.stringify(missing).includes('就业/零售实体数据未刷新'));
});

test('shared CARTS mean stays row-based for its 48-week calendar',()=>{
  const unusual=[row('2026-09-28',100),row('2026-10-07',200),row('2026-10-14',300),row('2026-10-21',400)];
  assert.equal(harness(rows).averageRecentValues(unusual,4),250);
  assert.equal(claimsWindow(unusual,now).average,null);
});

test('actual employment renderer resets prior populated cells on missing-window and legacy fallback',async()=>{
  const renderSource=fs.readFileSync(new URL('../../scripts/modules/renderMacroOverview.js',import.meta.url),'utf8');
  const names=['renderC4UsEconomyTemperature','asNumber','formatK','signedK','formatCountM','signedPercentFromDecimal'];
  const functions=names.map(name=>{const start=renderSource.indexOf(`function ${name}(`);assert.ok(start>=0);return renderSource.slice(start,renderSource.indexOf('\n}',start)+2);});
  const cells={};
  const render=vm.runInNewContext(functions.join('\n')+'\nrenderC4UsEconomyTemperature',{
    setLeafText:(id,text)=>{cells[id]=text;},renderConsumerRetail:()=>{},setPendingIndicator:()=>{},
    employmentBasketDisplay:()=>({value:'—',period:'—',live:false}),
    console:{error:(_msg,error)=>{throw error;}}
  });
  const live=await harness(rows).resolveEmploymentBreadth(null);
  render({radarData:{macroDrivers:{employment:live}}});
  assert.equal(cells['c4-employment-claims-change'],'+0k');
  assert.ok(cells['c4-employment-continuing'].includes('4w avg'));
  const gap=await harness(rows.filter(r=>r.date!=='2026-10-17')).resolveEmploymentBreadth(null);
  render({radarData:{macroDrivers:{employment:gap}}});
  assert.equal(cells['c4-employment-claims-change'],'—');assert.equal(cells['c4-employment-aux'],'—');assert.equal(cells['c4-employment-continuing'],'—');
  const legacy=await harness(null).resolveEmploymentBreadth({...live,claimsWindowEvidence:undefined});
  render({radarData:{macroDrivers:{employment:legacy}}});
  assert.equal(cells['c4-employment-number'],'200');assert.equal(cells['c4-employment-claims-change'],'—');
});
