import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildHistoricalScoreInputs, deriveHistoricalRisk } from '../../scripts/daily/historical-score.mjs';
import { structuralLagValue } from '../../scripts/daily/structural-freshness.mjs';
const rules = JSON.parse(readFileSync(new URL('../../config/rules.json', import.meta.url)));
const date = '2026-06-12';
const point = (date, value) => ({ date, value });
const base = () => Object.fromEntries(Object.entries({ brent:80, dxy:115, vix:18, hyOas:3, us10y:4, real10y:1.8 })
  .map(([key,value]) => [key,[point(date,value)]]));
const delayed = () => ({ ...base(),
  walcl:[point('2026-05-06',8000000),point('2026-05-13',7000000),point('2026-06-03',7000000)],
  onRrp:[point('2026-06-03',1000),point('2026-06-05',500),point('2026-06-10',500)],
  t10y2y:[point('2026-06-03',-.5),point('2026-06-05',-.1),point('2026-06-10',-.1)]
});
test('delayed-but-usable structural observations anchor changes to their own date, not replay date', () => {
  const rows=delayed(), input=buildHistoricalScoreInputs(date,rows,rules);
  assert.equal(structuralLagValue(rows.walcl,28,7),8000000);
  assert.equal(structuralLagValue(rows.onRrp,7,3),1000);
  assert.equal(structuralLagValue(rows.t10y2y,7,3),-.5);
  assert.equal(input.macroDrivers.fedLiquidity.walcl4wChange,-12.5);
  assert.equal(input.macroDrivers.fedLiquidity.onRrpWeekChange,-50);
  assert.equal(input.macroDrivers.curve.t10y2yWeekChange,.4);
  assert.equal(input.macroDrivers.curve.steepeningAlert,true);
  const result=deriveHistoricalRisk(date,rows,rules);
  assert.equal(result.components.curveSteepeningRisk,80);
  assert.equal(result.components.fedAssetRisk,100);
});
test('nearest production lag may follow target but future rows never enter historical calculation', () => {
  const rows={...base(),onRrp:[point('2026-06-02',1000),point('2026-06-06',600),point(date,300)]};
  assert.equal(buildHistoricalScoreInputs(date,rows,rules).macroDrivers.fedLiquidity.onRrpWeekChange,-50);
  const future=Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,[...v,point('2026-06-13',999999)]]));
  assert.deepEqual(deriveHistoricalRisk(date,future,rules),deriveHistoricalRisk(date,rows,rules));
});
test('production lag gap bounds, missing/zero denominators, staleness and rounding are retained', () => {
  const evaluate=(key,rows)=>buildHistoricalScoreInputs(date,{...base(),[key]:rows},rules).macroDrivers;
  assert.equal(evaluate('onRrp',[point('2026-06-01',1000),point(date,500)]).fedLiquidity.onRrpWeekChange,null);
  assert.equal(evaluate('onRrp',[point('2026-06-02',1000),point(date,500)]).fedLiquidity.onRrpWeekChange,-50);
  assert.equal(evaluate('onRrp',[point('2026-06-05',0),point(date,500)]).fedLiquidity.onRrpWeekChange,null);
  assert.equal(evaluate('onRrp',[point(date,500)]).fedLiquidity.onRrpWeekChange,null);
  assert.equal(evaluate('onRrp',[point('2026-05-01',1000),point('2026-05-08',500)]).fedLiquidity.onRrpWeekChange,null);
  assert.equal(evaluate('onRrp',[point('2026-06-05',3),point(date,2)]).fedLiquidity.onRrpWeekChange,-33.333);
  assert.equal(evaluate('t10y2y',[point('2026-06-05',-.2),point(date,-.05001)]).curve.t10y2yWeekChange,.15);
});

test('warmup retains the earliest allowed delayed WALCL baseline at the evaluation boundary', () => {
  const rows={...base(),walcl:[point('2026-04-24',8000000),point('2026-05-29',7000000)]};
  assert.equal(buildHistoricalScoreInputs(date,rows,rules).macroDrivers.fedLiquidity.walcl4wChange,-12.5);
  assert.equal(buildHistoricalScoreInputs(date,{...rows,walcl:rows.walcl.slice(1)},rules).macroDrivers.fedLiquidity.walcl4wChange,null);
});
