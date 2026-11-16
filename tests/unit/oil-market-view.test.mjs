import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOilMarketView} from '../../scripts/modules/oilMarketModel.js';
const now=Date.parse('2026-11-15T21:00:00Z');
test('missing datasets stay unknown and cannot create a verdict',()=>{const v=buildOilMarketView({},now);assert.equal(v.qualified.physicalUsable,false);assert.equal(v.brent.value,null);assert.equal(v.thermal,null);assert.ok(v.freight.every(r=>r.value===null));assert.ok(v.routes.every(r=>r.value===null));});
test('source-reported zero trade estimate stays zero and is not missing or a blockade conclusion',()=>{const v=buildOilMarketView({radar:{macroDrivers:{energyTransport:{chokepoints:{hormuz:{latest:{nTanker:0,capacityTanker:0,date:'2026-11-15'},avg30d:{nTanker:2},sourceStatus:'live'}}}}}},now);assert.equal(v.routes[0].value,0);assert.equal(v.routes[0].estimatedTradeVolume,0);assert.equal(v.routes[0].tradeEstimateState,'zero');assert.equal(v.routes[0].average,2);assert.equal(v.qualified.physicalUsable,false);});
test('old and future dates never become live through snapshot refresh',()=>{for(const date of ['2026-10-01','2026-12-01',null]){const v=buildOilMarketView({radar:{updatedAt:'2026-11-15',macroDrivers:{shippingFreight:{balticDirtyTankerIndex:4,balticDirtyTankerUpdatedAt:date,sourceStatus:{dirtyTanker:'live'}}}}},now);assert.notEqual(v.freight[0].sourceStatus,'live');}});
test('thermal raw anomaly cannot become prediction or score',()=>{const v=buildOilMarketView({thermal:{module:'oil-thermal-watch',status:'partial',aggregate:{rowCount:0},facilities:[{rawSignalLevel:'extreme',rowCount:0}]}},now);assert.equal(v.thermal.rows,0);assert.equal(v.qualified.displayBias,'insufficient_data');assert.equal(v.forecast,undefined);assert.equal(v.score,undefined);});
test('published baseline uses identical qualification to radar and preserves all eight routes',()=>{const read=name=>JSON.parse(readFileSync(new URL('../../data/'+name+'.json',import.meta.url)));const v=buildOilMarketView({radar:read('radar-data'),oil:read('oil-directional-pressure'),thermal:read('oil-thermal-watch')},now);assert.equal(v.routes.length,8);assert.equal(v.freight.length,3);assert.equal(v.thermal.facilities.length,read('oil-thermal-watch').facilities.length);assert.equal(v.qualified.evidence.crackSpread.value,null);});

test('thermal old and future clocks are not current observations',()=>{for(const at of ['2020-01-01','2027-01-01',null]){const v=buildOilMarketView({thermal:{module:'oil-thermal-watch',generatedAt:at,aggregate:{rowCount:2,latestAcqAt:at}}},now);assert.notEqual(v.thermal.clockStatus,'live');assert.notEqual(v.thermal.observationStatus,'live');}});

// Fixture values qualify the existing gate only; they are never production inputs.
function qualifiedFixture() {
 const radar={brentPricingLayer:{selectedBrent:{value:100,source:'fred:DCOILBRENTEU'},publicSpotProxy:{value:100,source:'fred',observedAt:'2026-11-13',status:'ok'},futuresPriceCurve:{frontMinusBack:2,frontPrice:102,backPrice:100,slopeRegime:'backwardation',curveStatus:'live_public_monthly',updatedAt:'2026-11-13',contracts:[{price:102,updatedAt:'2026-11-13'},{price:100,updatedAt:'2026-11-13'}]}}};
 const keys=['crudeStocksExSpr','sprStocks','distillateStocks','gasolineStocks','refineryUtilization','refinerCrudeInputs','demandGasolineSupplied','demandDistillateSupplied'];
 const oil={builtAt:'2026-11-14',finalBias:'false_down_physical_stress',interpretation:{physicalBias:'moderate_bullish'},evidence:{...Object.fromEntries(keys.map(k=>[k,{value:1,asOfDate:'2026-11-06',sourceStatus:'live'}])),brentPrice:{value:100,asOfDate:'2026-11-13',source:'fred:DCOILBRENTEU'},curve:{asOfDate:'2026-11-13',frontMinusBack:2,frontPrice:102,backPrice:100,slopeRegime:'backwardation'}},signals:{priceContext:{brentChangePct4w:-5,priceDirectionSource:'dated_same_source_brent_observations',brentSource:'fred:DCOILBRENTEU',brentObservedAt:'2026-11-13',brentStartObservedAt:'2026-10-16',curveSlopeRegime:'backwardation'}}};return {radar,oil};
}
test('qualified price, absent price, absent physical and expired evidence keep separate meanings',()=>{
 const input=qualifiedFixture();const v=buildOilMarketView(input,now);assert.equal(v.qualified.priceUsable,true);assert.equal(v.verdict,'价格下跌 · 美国周度供需仍紧');assert.equal(v.physicalSummary,'美国周度供需偏紧');
 const noPrice=structuredClone(input);noPrice.radar=null;const p=buildOilMarketView(noPrice,now);assert.equal(p.verdict,'油价方向暂不足判断');assert.equal(p.physicalSummary,'美国周度供需偏紧');
 const noPhysical=structuredClone(input);noPhysical.oil.evidence.sprStocks.value=null;assert.equal(buildOilMarketView(noPhysical,now).verdict,'数据不足 · 暂不判断');assert.match(buildOilMarketView(noPhysical,now).physicalSummary,/数据不足/);
 const expired=buildOilMarketView(input,now+30*86400000);assert.equal(expired.verdict,'数据不足 · 暂不判断');assert.match(expired.physicalSummary,/超龄/);
 assert.equal(buildOilMarketView({},now).verdict,'数据不可用');
});

test('oil route trade estimate distinguishes a source zero from missing without fabricating capacity',()=>{
 for(const [estimate,state] of [[0,'zero'],[15038,'reported'],[null,'missing'],[undefined,'missing'],['0','zero'],['','missing'],[true,'missing'],['invalid','missing'],[NaN,'missing']]) {
  const input={radar:{macroDrivers:{energyTransport:{chokepoints:{hormuz:{latest:{nTanker:1,capacityTanker:estimate,date:'2026-11-08'},avg30d:{nTanker:2},sourceStatus:'live'}}}}}};
  const before=structuredClone(input);const row=buildOilMarketView(input,now).routes[0];
  assert.equal(row.value,1);assert.equal(row.tradeEstimateState,state);
  assert.equal(row.estimatedTradeVolume,state==='missing'?null:Number(estimate));
  assert.equal(row.capacity,undefined);assert.equal(row.incomplete,undefined);
  assert.deepEqual(input,before);
 }
});
