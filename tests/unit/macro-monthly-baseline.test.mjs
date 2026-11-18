import { calculatePayrollBasket } from '../../scripts/daily/payroll-basket.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs',import.meta.url),'utf8');
const names=['latestValue','findValueAgo','findMonthlyValueAgo','calculateMonthlyYoY','calculateMonthlyDelta',
  'latestDateIso','latestIsoDate','calculateIndustryPayrollDiffusion',
  'calculateRetailSegmentSnapshot','fredMillionsToBillions','classifyClaimsRegime','classifyJoltsRegime',
  'classifyIndustryDiffusionRegime','classifyLaborQualityRegime','resolveEmploymentBreadth'];
function helpers(series={}) {
  const functions=names.map(name=>{
    const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);
    const end=source.indexOf('\n}',start);assert.ok(end>start,name);
    return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,end+2);
  });
  return vm.runInNewContext(functions.join('\n')+`\n({${names.join(',')}})`,{
    fetchFredSeries:async id=>{if(!series[id])throw new Error('synthetic missing source');return structuredClone(series[id]);},
    calculatePayrollBasket, isoNow: '2026-11-17T12:00:00Z', normalizePreviousEmployment:()=>({}),EMPLOYMENT_INDUSTRY_PAYROLL_SERIES:[],EMPLOYMENT_SOURCE:'synthetic offline',
    CONSUMER_RETAIL_SEGMENT_SERIES:[{id:'A',key:'a',labelZh:'甲'},{id:'B',key:'b',labelZh:'乙'}]
  });
}
const row=(date,value)=>({date,value});
test('a missing three-month baseline is not replaced by a one-year observation or current value',()=>{
  const h=helpers(),rows=[row('2025-09-01',6),row('2026-08-01',7),row('2026-09-01',8)];
  assert.equal(h.findMonthlyValueAgo(rows,3),null);
  assert.equal(h.calculateMonthlyDelta(rows,3),null);
  assert.equal(h.calculateMonthlyDelta([rows.at(-1)],3),null);
});
test('monthly YoY requires the same month last year, not a neighboring month',()=>{
  const h=helpers(),rows=[row('2025-08-01',100),row('2025-10-01',110),row('2026-09-01',120)];
  assert.equal(h.calculateMonthlyYoY(rows),null);
  assert.equal(h.calculateMonthlyYoY([rows.at(-1)]),null);
});
test('calendar year transitions, leap months and real zero baselines preserve normal semantics',()=>{
  const h=helpers();
  assert.equal(h.calculateMonthlyDelta([row('2025-11-01',7.1),row('2026-02-28',7.6)],3),.5);
  assert.equal(h.calculateMonthlyDelta([row('2024-02-29',0),row('2024-05-31',2)],3),2);
  assert.equal(h.calculateMonthlyYoY([row('2025-09-01',100),row('2026-09-01',120)]),.2);
  assert.equal(h.calculateMonthlyYoY([row('2025-09-01',0),row('2026-09-01',120)]),null);
  assert.equal(h.calculateMonthlyYoY([row('2025-09-01',null),row('2026-09-01',120)]),null);
});
test('real employment resolver keeps live levels but missing comparisons do not manufacture cooling',async()=>{
  const series={U6RATE:[row('2025-09-01',6),row('2026-09-01',8)],
    CES0500000003:[row('2025-08-01',30),row('2026-09-01',32)],JTSJOL:[row('2025-08-01',7000),row('2026-09-01',7500)]};
  const result=await helpers(series).resolveEmploymentBreadth(null);
  assert.equal(result.u6Rate,8);assert.equal(result.u6Rate3mChange,null);
  assert.equal(result.averageHourlyEarnings,32);assert.equal(result.averageHourlyEarningsYoY,null);
  assert.equal(result.joltsOpenings,7500000);assert.equal(result.joltsOpeningsYoY,null);
  assert.equal(result.sourceStatus.u6,'live');assert.equal(result.laborQualityRegime,'未知');
});
test('retail segment diffusion excludes missing annual comparison but retains the actual level',()=>{
  const result=helpers().calculateRetailSegmentSnapshot([
    {status:'fulfilled',value:[row('2025-08-01',100),row('2026-09-01',120)]},
    {status:'fulfilled',value:[row('2025-09-01',100),row('2026-09-01',90)]}
  ]);
  assert.equal(result.segments[0].value,.12);assert.equal(result.segments[0].sourceStatus,'live');
  assert.equal(result.segments[0].yoy,null);assert.equal(result.segmentSeriesCount,1);
  assert.equal(result.segmentDiffusionPct,0);assert.equal(result.strongestSegment.key,'b');
});
