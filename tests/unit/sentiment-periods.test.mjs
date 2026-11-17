import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sentimentPeriods, cachedSentimentPeriods } from '../../scripts/daily/sentiment-periods.mjs';
import { buildDivergenceLayer } from '../../scripts/daily/divergence-layer.mjs';
import { buildAiInterpretationLayer } from '../../scripts/daily/rule-based-interpretation.mjs';
import { buildCrossValidationMatrix } from '../../scripts/modules/buildCrossValidationMatrix.js';
const now = '2026-11-17T12:00:00Z';
const row = (date, value) => ({date, value});
// Minimal cited official points: Surveys of Consumers, University of Michigan,
// Consumer Sentiment © [UMCSENT], retrieved from FRED, https://fred.stlouisfed.org/series/UMCSENT, 2026-11-17.
const real = [row('2026-06-01',49.5),row('2026-08-01',51.7),row('2026-09-01',48.1)];
const synthetic = [row('2026-03-01',50),row('2026-06-01',60),row('2026-08-01',70),row('2026-09-01',80)];
const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url),'utf8');
function harness(rows) {
  let pmiCalls=0;
  const names=['buildMissingConsumer','classifyConsumerRegime','classifyPmiRegime','normalizePreviousConsumer','resolveConsumerSentiment'];
  const functions=names.map(name=>{const i=source.indexOf(`function ${name}(`);assert.ok(i>=0);const end=source.indexOf('\n}',i);return (source.slice(i-6,i)==='async '?'async ':'')+source.slice(i,end+2);});
  const api=vm.runInNewContext(functions.join('\n')+'\n({resolveConsumerSentiment,normalizePreviousConsumer})',{
    isoNow:now,sentimentPeriods,cachedSentimentPeriods,
    fetchFredSeries:async(id,days)=>{assert.equal(id,'UMCSENT');assert.equal(days,420);if(rows===null)throw Error('offline');return rows;},
    fetchIsmManufacturingPmiReport:async()=>{pmiCalls++;return {status:'live',latestPmi:55.5,pmi3mChange:-0.1,diagnostics:{reportMonthLabel:'October'}};},
  });
  return {...api,pmiCalls:()=>pmiCalls};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('actual monthly points keep Sep observation and -1.4 three-month change, not publication month',()=>{
  const p=sentimentPeriods(real,now);assert.equal(p.umichSentiment,48.1);assert.equal(p.previousValue,51.7);
  assert.equal(p.threeMonthChange,-1.4);assert.equal(p.sixMonthChange,null);assert.equal(p.updatedAt,'2026-09-01T00:00:00Z');
});

test('1/3/6-month omissions are independent; no nearest month or single-row zero',()=>{
  const full=sentimentPeriods(synthetic,now);assert.equal(full.previousValue,70);assert.equal(full.threeMonthChange,20);assert.equal(full.sixMonthChange,30);
  for(const [index,field] of [[0,'sixMonthChange'],[1,'threeMonthChange'],[2,'previousValue']]){
    const p=sentimentPeriods(synthetic.filter((_,i)=>i!==index),now);assert.equal(p[field],null);
    for(const other of ['previousValue','threeMonthChange','sixMonthChange'].filter(x=>x!==field))assert.equal(p[other],full[other]);
  }
  const only=sentimentPeriods([synthetic.at(-1)],now);assert.equal(only.threeMonthChange,null);assert.equal(only.sixMonthChange,null);
  assert.equal(sentimentPeriods([row('2025-11-01',10),row('2026-02-01',10)],now).threeMonthChange,0);
  assert.equal(sentimentPeriods([row('2023-11-01',0),row('2024-02-01',10)],now).threeMonthChange,10);
});

test('duplicates/order, malformed/non-month-start/future dates and invalid values do not certify changes',()=>{
  for(const rows of [[...real,real.at(-1)],[real[1],real[0],real[2]],
    [row('2026-06-02',49.5),real[2]],[row('2026-06-01',null),real[2]],
    [row('2026-06-01','49.5'),real[2]],[row('2026-06-01',-1),real[2]],
    [row('2026-02-30',49.5),real[2]],[...real,row('2026-12-01',40)]]){
    assert.equal(sentimentPeriods(rows,now).threeMonthChange,null);
  }
});

test('cache preserves proven original month and rejects missing/changed references or stale labels',()=>{
  const prev={...sentimentPeriods(synthetic,now),sourceStatus:{umichSentiment:'live'}};
  assert.deepEqual(cachedSentimentPeriods(prev,now),sentimentPeriods(synthetic,now));
  for(const patch of [{sentimentReferences:null},{umichSentiment:81},{threeMonthChange:19},
    {updatedAt:'2026-10-01T00:00:00Z'},{sourceStatus:{umichSentiment:'missing'}},
    {sentimentReferences:{...prev.sentimentReferences,threeMonthChange:{date:'2026-05-01',value:60}}}]){
    const p=cachedSentimentPeriods({...prev,...patch},now);assert.equal(p.threeMonthChange,null);
  }
  const malformed=cachedSentimentPeriods({...prev,updatedAt:'2026-09-01garbage'},now);assert.equal(malformed.updatedAt,null);
});

test('cache extra keys or later reference dates cannot replace the original current observation',()=>{
  const old={...sentimentPeriods([row('2025-09-01',48.1)],now),sourceStatus:{umichSentiment:'live'}};
  const extra={...old,sentimentReferences:{...old.sentimentReferences,extra:{date:'2026-11-01',value:999}}};
  const result=cachedSentimentPeriods(extra,now);
  assert.equal(result.umichSentiment,48.1);assert.equal(result.updatedAt,old.updatedAt);assert.equal(result.threeMonthChange,null);
  const named={...old,sentimentReferences:{...old.sentimentReferences,threeMonthChange:{date:'2026-11-01',value:999}}};
  const held=cachedSentimentPeriods(named,now);
  assert.equal(held.umichSentiment,48.1);assert.equal(held.updatedAt,old.updatedAt);assert.equal(held.sentimentReferences,null);
});

test('actual resolver/cache maintain level/source month, downgrade regime and leave PMI pathway unchanged',async()=>{
  const h=harness(real);const live=await h.resolveConsumerSentiment(null);
  assert.equal(live.threeMonthChange,-1.4);assert.equal(live.regime,'稳定');assert.equal(h.pmiCalls(),1);
  const partialHarness=harness([real.at(-1)]);const partial=await partialHarness.resolveConsumerSentiment(live);
  assert.equal(partial.umichSentiment,48.1);assert.equal(partial.updatedAt,live.updatedAt);assert.equal(partial.regime,'未知');
  assert.equal(partial.ismManufacturingPmi,live.ismManufacturingPmi);assert.equal(partial.ismManufacturingPmi3mChange,live.ismManufacturingPmi3mChange);assert.equal(partialHarness.pmiCalls(),1);
  const off=harness(null);const cache=await off.resolveConsumerSentiment(live);assert.equal(cache.threeMonthChange,-1.4);assert.equal(cache.updatedAt,live.updatedAt);assert.equal(cache.sourceStatus.umichSentiment,'fallback');assert.equal(off.pmiCalls(),0);
  const legacy=await off.resolveConsumerSentiment({...plain(live),sentimentReferences:undefined,regime:'改善'});assert.equal(legacy.umichSentiment,48.1);assert.equal(legacy.threeMonthChange,null);assert.equal(legacy.regime,'未知');assert.equal(legacy.updatedAt,live.updatedAt);
});

test('all actual interpretation consumers omit absent change rather than describing it as zero/healthy',async()=>{
  const consumer=await harness([real.at(-1)]).resolveConsumerSentiment(null);
  const data={risk:{score:40,modules:{}},displayInputsBaseline:{spx:5100,vix:16,hyOas:3.5,us10y:4},macroDrivers:{consumer},confidenceScore:80};
  const layer=buildDivergenceLayer({...data,realtimePayload:{},generatedAt:now});
  const check=layer.checks.find(c=>c.key==='consumer_vs_asset_pricing');
  assert.equal(check.status,'insufficient_data');assert.equal(check.score,0);assert.deepEqual(check.evidence,[]);
  // Existing finite-score contract uses zero as storage only; missing checks are excluded from its average.
  const valid=layer.checks.filter(c=>c.status!=='insufficient_data');
  const expected=valid.length?Math.max(0,Math.min(100,Math.round(valid.reduce((s,c)=>s+c.score,0)/valid.length))):0;
  assert.equal(layer.score,expected);
  const explanation=buildAiInterpretationLayer({...data,divergenceLayer:layer},now);
  assert.ok(!explanation.dataInferences.some(x=>x.key==='consumer_margin_observation'));
  const matrix=buildCrossValidationMatrix(data);
  assert.ok(!JSON.stringify(matrix).includes('umich_improving'));
  const known={...data,macroDrivers:{consumer:await harness(synthetic).resolveConsumerSentiment(null)}};
  assert.ok(buildAiInterpretationLayer(known,now).dataInferences.some(x=>x.key==='consumer_margin_observation'));
  assert.ok(JSON.stringify(buildCrossValidationMatrix(known)).includes('umich_improving'));
  assert.equal(data.risk.score,40);
});
