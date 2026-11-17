import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { calculatePayrollBasket, verifiedPayrollBasketFallback, PAYROLL_BASKET_METHOD } from '../../scripts/daily/payroll-basket.mjs';
const now = '2026-11-17T12:00:00Z';
const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
const series = vm.runInNewContext(source.match(/const EMPLOYMENT_INDUSTRY_PAYROLL_SERIES = (\[[\s\S]*?\]);/)[1]);
const row = (date, value) => ({date, value});
const fixture = () => series.map((_, i) => ({status:'fulfilled', value:[row('2026-09-01', 100), row('2026-10-01', i < 7 ? 101 : 99)]}));
const compute = r => calculatePayrollBasket(r, series, now);
const missing = out => { for (const k of ['industryPayrollDiffusionPct','industryPayrollPositiveCount','industryPayrollSeriesCount','industryPayrollUpdatedAt','industryPayrollMethod']) assert.equal(out[k], null, k); };
function extract(name) {
  const start = source.indexOf(`function ${name}(`); assert.ok(start >= 0);
  const end = source.indexOf('\n}',start); assert.ok(end > start);
  return (source.slice(start-6,start)==='async '?'async ':'') + source.slice(start,end+2);
}
test('frozen overlapping basket is unchanged, sources correctly named and strict positive share retained', () => {
  assert.equal(series.map(s=>s.id).join(','),'MANEMP,USCONS,USTRADE,USTPU,USPBS,USEHS,USLAH,USFIRE,USINFO,USMINE,USGOVT');
  assert.equal(series[2].label,'Retail trade'); assert.equal(series[3].label,'Trade, transportation, and utilities');
  const result=compute(fixture()); assert.equal(result.industryPayrollDiffusionPct,63.6); assert.equal(result.industryPayrollSeriesCount,11);
  assert.equal(result.industryPayrollPositiveCount,7); assert.equal(result.industryPayrollUpdatedAt,'2026-10-01T00:00:00Z');
  assert.equal(result.industryPayrollMethod,PAYROLL_BASKET_METHOD);
  const unchanged=fixture().map(r=>({...r,value:[row('2026-09-01',0),row('2026-10-01',0)]}));
  assert.equal(compute(unchanged).industryPayrollDiffusionPct,0); // not BLS half-votes
});
test('partial, mixed latest months and missing calendar predecessor never manufacture a current percentage', () => {
  missing(compute(fixture().slice(0,1)));
  for(const mutate of [r=>r[0]={status:'rejected'}, r=>r[0].value=[row('2026-08-01',100),row('2026-09-01',101)],
    r=>r[0].value=[row('2026-08-01',100),row('2026-10-01',101)], r=>r[0].value=[row('2026-10-01',101)]]) {
    const r=fixture(); mutate(r); missing(compute(r));
  }
});
test('malformed, future, duplicate, unordered and nonnumeric observations fail closed', () => {
  for(const rows of [[row('2026-09-01',100),row('2026-10-01',null)], [row('2026-09-01',100),row('2026-10-01','101')],
    [row('2026-09-01',100),row('2026-10-01',-1)], [row('2026-09-01',100),row('2026-10-02',101)],
    [row('2026-09-01',100),row('2026-13-01',101)], [row('2026-11-01',100),row('2026-12-01',101)],
    [row('2026-09-01',100),row('2026-10-01',101),row('2026-10-01',102)], [row('2026-10-01',101),row('2026-09-01',100)]]) {
    const r=fixture(); r[0].value=rows; missing(compute(r));
  }
});
test('calendar year boundary and leap-year months retain legitimate observations', () => {
  for(const [previous,current] of [['2025-12-01','2026-01-01'],['2024-02-01','2024-03-01']]) {
    const r=fixture().map(s=>({...s,value:[row(previous,100),row(current,101)]}));
    assert.equal(compute(r).industryPayrollDiffusionPct,100);
  }
});
test('only verified coherent cache may be carried forward without redating; legacy remains unverified', () => {
  const good={...compute(fixture()), sourceStatus:{industryPayroll:'live'}};
  assert.equal(verifiedPayrollBasketFallback(good,now).industryPayrollUpdatedAt,good.industryPayrollUpdatedAt);
  for(const patch of [{industryPayrollMethod:undefined},{industryPayrollMethod:'other'},{industryPayrollSeriesCount:1},
    {industryPayrollPositiveCount:7.5},{industryPayrollDiffusionPct:70},{industryPayrollUpdatedAt:'2026-10-01junkT00:00:00Z'},
    {industryPayrollUpdatedAt:'2026-12-01T00:00:00Z'},{sourceStatus:{industryPayroll:'missing'}}]) missing(verifiedPayrollBasketFallback({...good,...patch},now));
});
test('actual wrapper, prior normalization and resolver preserve method/date and never promote legacy aggregates', async () => {
  const names=['calculateIndustryPayrollDiffusion','resolveEmploymentBreadth','normalizePreviousEmployment','latestValue','averageRecentValues',
    'latestDateIso','latestIsoDate','findMonthlyValueAgo','calculateMonthlyYoY','calculateMonthlyDelta','classifyClaimsRegime','classifyJoltsRegime','classifyLaborQualityRegime','classifyIndustryDiffusionRegime'];
  const live=compute(fixture()); const prev={...live,sourceStatus:{industryPayroll:'live'}};
  const code=names.map(extract).join('\n')+'\n({resolveEmploymentBreadth,normalizePreviousEmployment})';
  const make=(fail=false)=>vm.runInNewContext(code,{calculatePayrollBasket,verifiedPayrollBasketFallback,isoNow:now, EMPLOYMENT_INDUSTRY_PAYROLL_SERIES:series,
    EMPLOYMENT_SOURCE:'synthetic',fetchFredSeries:async id=>{const i=series.findIndex(s=>s.id===id);if(fail||i<0)throw new Error('missing');return fixture()[i].value;}});
  const fresh=await make().resolveEmploymentBreadth({}); assert.equal(fresh.industryPayrollMethod,PAYROLL_BASKET_METHOD);assert.equal(fresh.sourceStatus.industryPayroll,'live');
  const retained=await make(true).resolveEmploymentBreadth(prev); assert.equal(retained.sourceStatus.industryPayroll,'fallback');assert.equal(retained.industryPayrollUpdatedAt,prev.industryPayrollUpdatedAt);
  const cleaned=make(true).normalizePreviousEmployment({...prev,industryPayrollMethod:undefined,industryDiffusionRegime:'广泛扩张',laborQualityRegime:'扩散改善'});
  assert.equal(cleaned.industryDiffusionRegime,'未知');assert.equal(cleaned.laborQualityRegime,'未知');
  const legacy=await make(true).resolveEmploymentBreadth({...prev,industryPayrollMethod:undefined}); missing(legacy);assert.equal(legacy.sourceStatus.industryPayroll,'missing');assert.equal(legacy.industryDiffusionRegime,'未知');
});
test('current published two-month FRED sample reproduces the existing 7/11 share without changing history',()=>{
  // Minimal Sep/Oct 2026 pairs read from official FRED series pages on 2026-11-17.
  const pairs=[[12662,12681],[8370,8367],[15495.3,15501.3],[28796,28818],[22534,22604],[28005,28058],
    [16977,16964],[9078,9085],[2735,2734],[606,605],[23326,23332]];
  const results=pairs.map(([a,b])=>({status:'fulfilled',value:[row('2026-09-01',a),row('2026-10-01',b)]}));
  const out=compute(results);assert.equal(out.industryPayrollPositiveCount,7);assert.equal(out.industryPayrollDiffusionPct,63.6);
});
