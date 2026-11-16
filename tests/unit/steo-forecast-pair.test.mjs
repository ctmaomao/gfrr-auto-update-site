import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STEO_PAIR, extractSteoForecastCells, compareSteoForecastCells, inspectSteoPair } from '../../scripts/oil-directional/steo-forecast-pair.mjs';
function sheet(i) {
  const cells = {
    B1: 'Table 3a.  World Petroleum and Other Liquid Fuels Production, Consumption, and Inventories',
    B2: `U.S. Energy Information Administration  |  Short-Term Energy Outlook  - ${STEO_PAIR[i].issue}`,
    A3: 'Forecast date:', A4: STEO_PAIR[i].forecastDate,
    B5: 'Production (million barrels per day) (a)', A6: 'papr_world', A10: 'papr_world', B6: 'World total', B10: 'World total',
    B18: 'Consumption (million barrels per day) (c)', A19: 'patc_world', B19: 'World total',
    BK3: 2027, BK4: 'Jan', BL4: 'Feb', BM4: 'Mar', B55: 'Forecasts: EIA Short-Term Integrated Forecasting System. ',
  };
  for (const [j,col] of ['BK','BL','BM'].entries()) { cells[`${col}6`] = cells[`${col}10`] = 100+j+i; cells[`${col}19`] = 99+j; }
  return Object.fromEntries(Object.entries(cells).map(([k,v]) => [k,{v,t:typeof v==='number'?'n':'s'}]));
}
test('synthetic pair uses same future quarter, day-weighted means and revision, never forecast accuracy', () => {
  const input=[sheet(0),sheet(1)], before=structuredClone(input);const r=compareSteoForecastCells(input);
  assert.equal(r.reports[0].quarterDayWeighted.production,101);
  assert.equal(r.revisionNovemberLessOctober.production,1);
  assert.equal(r.revisionNovemberLessOctober.consumption,0);
  assert.equal(r.revisionNovemberLessOctober.productionLessConsumption,1);
  assert.equal(r.eligibleForEvaluation,false);assert.equal(r.eligibleForPublicProbability,false);assert.equal(r.forecastAccuracyMeasured,false);
  assert.equal(r.reports[0].historicalVintageAuthenticityVerified,false);assert.deepEqual(input,before);
});
test('weights follow actual quarter days, not a simple monthly average',()=>{
 const s=sheet(0);s.BL6.v=s.BL10.v=200;
 assert.equal(extractSteoForecastCells(s,0).quarterDayWeighted.production,(100*31+200*28+102*31)/90);
});
test('wrong year/month, units, issue, source, labels and duplicate rows fail closed',()=>{
 for(const key of ['BK3','BK4','BL4','BM4','B5','B18','B55','B2','A4','A6','A19','BK10']){
  const s=sheet(0);s[key].v='wrong';assert.throws(()=>extractSteoForecastCells(s,0),/rejected/);
 }
 assert.throws(()=>compareSteoForecastCells([sheet(1),sheet(0)]),/rejected/);
 assert.throws(()=>compareSteoForecastCells([sheet(0)]),/rejected/);
 assert.throws(()=>extractSteoForecastCells(sheet(0),2),/rejected/);
});
test('missing/nonfinite/string/zero/negative/formula values never coerce or refill',()=>{
 for(const value of [null,undefined,NaN,Infinity,'100',0,-1]){const s=sheet(0);s.BK19.v=value;assert.throws(()=>extractSteoForecastCells(s,0),/invalid/);}
 const s=sheet(0);s.BK19.f='SUM(A1:A2)';assert.throws(()=>extractSteoForecastCells(s,0),/invalid/);
 delete s.BK19;assert.throws(()=>extractSteoForecastCells(s,0),/invalid/);
});
test('real-byte interface rejects arbitrary data and symlink before XLSX parsing',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'steo-pair-test-'));
 try {const p=path.join(dir,'fake.xlsx');fs.writeFileSync(p,'PK synthetic not a source');
  await assert.rejects(inspectSteoPair([p,p]),/source bytes differ/);
  const link=path.join(dir,'link.xlsx');fs.symlinkSync(p,link);await assert.rejects(inspectSteoPair([link,p]),/regular bounded/);
  await assert.rejects(inspectSteoPair([p]),/supply October/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('standard-library helper rejects unreviewed bytes without parsing or exposing input',async()=>{
 const {spawnSync}=await import('node:child_process');
 const helper=new URL('../../scripts/oil-directional/steo_forecast_cells.py',import.meta.url);
 for(const input of ['PRIVATE',Buffer.alloc(5242881,65)]){
  const r=spawnSync('python3',[helper.pathname],{input,encoding:'utf8',timeout:15000});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr.trim(),'STEO fixed XML extraction rejected');
 }
});
