import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ODP_PHYSICAL_KEYS, oilEvidenceNumber, oilObservationMillis, oilObservation, resolveOdpPriceEvidence, qualifiedBrentHistory, qualifyOdpDisplay } from '../../scripts/modules/oilEvidenceQuality.js';
import { reuseFromRadar, priceContextFromReuse, globalEnergyContextFromRadar, monthlyBackgroundOverlay, buildAttribution } from '../../scripts/oil-directional/build-oil-directional-pressure.mjs';
import { finalizeBias, evaluateGlobalOverlay, GLOBAL_OVERLAY_EFFECT_VALUES, GLOBAL_OVERLAY_STATUS_VALUES } from '../../scripts/oil-directional/odp-classifier.mjs';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const DAY = 86400000;
const clone = structuredClone;
function radarFixture() {
  return { brentPricingLayer:{ selectedBrent:{value:107.03,source:'fred:DCOILBRENTEU',observedAt:'2026-11-06T10:00:00Z'},
    publicSpotProxy:{value:107.03,source:'fred-anchor',observedAt:'2026-11-03',status:'ok'},
    eiaBrentSpotProxy:{price:107.03,updatedAt:'2026-11-03',sourceStatus:'live'},
    crackSpread:80.71,crackSpread4wChange:-1.39,ulsdPrice:4.47,
    futuresPriceCurve:{frontMinusBack:8,frontPrice:108,backPrice:100,slopeRegime:'backwardation',curveStatus:'live_public_monthly',updatedAt:'2026-11-06T08:00:00Z', contracts: [{ symbol: 'BZF27.NYM', price: 108, updatedAt: '2026-11-06T08:00:00Z' }, { symbol: 'BZQ27.NYM', price: 100, updatedAt: '2026-11-06T08:00:00Z' }] } },
    macroDrivers:{energyInventoryBalance:{sourceStatus:{inventoryBalance:'live'},latestPeriod:'2026-11',latestIsForecast:true,source:'EIA STEO',updatedAt:'2026-10-13',oecdCommercialInventoryVs5yPct:-8,globalInventoryDrawMbpd:4},
    energySpareCapacity:{sourceStatus:{spareCapacity:'live'},latestPeriod:'2026-11',latestIsForecast:true,source:'EIA STEO',updatedAt:'2026-10-13',spareCapacityMbpd:0.02,bufferRegime:'极低缓冲'}} };
}
function datedHistory() { return [{date:'2026-10-07',brent:125,brentSource:'fred:DCOILBRENTEU',brentObservedAt:'2026-10-06'}, {date:'2026-11-06',brent:107.03,brentSource:'fred:DCOILBRENTEU',brentObservedAt:'2026-11-03'}]; }
function oilFixture() {
  return { builtAt:'2026-11-06T10:00:00Z', finalBias:'false_down_physical_stress',
    evidence:{brentPrice:{value:107.03,asOfDate:'2026-11-03',source:'fred:DCOILBRENTEU'},...Object.fromEntries(ODP_PHYSICAL_KEYS.map(key=>[key,{value:1,sourceStatus:'live',asOfDate:'2026-10-30'}])),curve:{asOfDate:'2026-11-06T08:00:00Z',frontMinusBack:8,frontPrice:108,backPrice:100,slopeRegime:'backwardation'}},
    signals:{priceContext:{curveSlopeRegime:'backwardation',brentChangePct4w:-14.38,priceDirectionSource:'dated_same_source_brent_observations',brentSource:'fred:DCOILBRENTEU',brentObservedAt:'2026-11-03',brentStartObservedAt:'2026-10-06',crackChange4w:-1.39}},
    interpretation:{physicalBias:'moderate_bullish'} };
}
const physical = { bias:'moderate_bullish', signals:{inventoryDrawPressure:{tight:true},dieselProductStress:{tight:true},demandDestructionRisk:{}} };
const reconcile = finalizeBias(physical,{changePct4w:-14,curveSlopeRegime:'backwardation'});

test('null, coercible objects, booleans and blanks are not measured zero',()=>{
  for(const value of [null,undefined,true,false,'',' ',[],{},[0],NaN,Infinity]) assert.equal(oilEvidenceNumber(value),null);
  assert.equal(oilEvidenceNumber(0),0);assert.equal(oilEvidenceNumber('0'),0);assert.equal(oilEvidenceNumber('-1.4'),-1.4);
});
test('exact age boundary, future and unknown observations fail closed',()=>{
  assert.equal(oilObservation(1,new Date(NOW-5*DAY).toISOString(),5,NOW,'live').sourceStatus,'live');
  assert.equal(oilObservation(1,new Date(NOW-5*DAY-1).toISOString(),5,NOW,'live').sourceStatus,'stale');
  for(const date of ['2026-11-07','invalid',null]) assert.equal(oilObservation(1,date,5,NOW,'live').sourceStatus,'stale');
  assert.equal(oilObservation(0,'2026-11-03',5,NOW,'live').value,0);
});
test('FRED anchor uses observation 11/3, never selected snapshot 11/6',()=>{
  const radar=radarFixture();const original=JSON.stringify(radar);const q=resolveOdpPriceEvidence(radar,NOW);
  assert.equal(q.brentPrice.asOfDate,'2026-11-03');assert.equal(q.brentPrice.value,107.03);assert.equal(q.brentPrice.ageDays,3.5);assert.equal(q.brentPrice.sourceStatus,'live');assert.equal(JSON.stringify(radar),original);
});
test('mismatched value and unknown source cannot borrow another quote date',()=>{
  for(const mutate of [r=>r.brentPricingLayer.publicSpotProxy.value=108,r=>r.brentPricingLayer.selectedBrent.source='unproven',r=>r.brentPricingLayer.publicSpotProxy.observedAt=null]) {
    const r=radarFixture();mutate(r);const p=resolveOdpPriceEvidence(r,NOW).brentPrice;assert.equal(p.value,null);assert.equal(p.sourceStatus,'missing');
  }
});
test('matching EIA quote preserves its own date and stale evidence never becomes live',()=>{
  const r=radarFixture();r.brentPricingLayer.selectedBrent.source='eia:brent';
  assert.equal(resolveOdpPriceEvidence(r,NOW).brentPrice.asOfDate,'2026-11-03');
  r.brentPricingLayer.eiaBrentSpotProxy.updatedAt='2026-10-01';assert.equal(resolveOdpPriceEvidence(r,NOW).brentPrice.sourceStatus,'stale');
});
test('undated ULSD and its single-leg change cannot be a qualified crack spread',()=>{
  const evidence=reuseFromRadar(NOW,radarFixture());
  assert.equal(evidence.crackSpread.value,null);assert.equal(evidence.crackSpread.change4w,null);assert.equal(evidence.crackSpread.sourceStatus,'missing');
  const attr=buildAttribution({reconcile,signals:physical.signals,priceContext:{changePct4w:-14,curveSlopeRegime:'backwardation'},crackChange4w:-999,globalOverlay:null,dataSufficiency:'full'});
  assert.ok(attr.counterEvidence.every(row=>!row.evidenceKeys.includes('crackSpread')));
  assert.ok(attr.supportEvidence.every(row=>!row.evidenceKeys.includes('crackSpread')));
});
test('same-source dated history qualifies the original four-week tolerance',()=>{
  const p=resolveOdpPriceEvidence(radarFixture(),NOW).brentPrice;const result=qualifiedBrentHistory(datedHistory(),p,NOW);
  assert.equal(result.changePct4w,-14.38);assert.equal(result.startObservedAt,'2026-10-06');assert.equal(result.endObservedAt,'2026-11-03');
});
test('legacy publication dates are not quote dates',()=>{
  const p=resolveOdpPriceEvidence(radarFixture(),NOW).brentPrice;
  assert.equal(qualifiedBrentHistory([{date:'2026-10-06',brent:125},{date:'2026-11-03',brent:107.03}],p,NOW),null);
});
test('mixed sources, stale tail, future tail, conflicting duplicates and short windows are rejected',()=>{
  const p=resolveOdpPriceEvidence(radarFixture(),NOW).brentPrice;
  const changes=[h=>h[0].brentSource='yahoo:BZ=F',h=>h[1].brentObservedAt='2020-11-03',h=>h[1].brentObservedAt='2026-11-08',h=>h.push({...h[1],brent:999}),h=>h[0].brentObservedAt='2026-10-30',h=>h[1].brent=99];
  for(const change of changes){const h=datedHistory();change(h);assert.equal(qualifiedBrentHistory(h,p,NOW),null);}
});
test('real production adapter permits qualified divergence but rejects old or incomplete curve',()=>{
  const good=priceContextFromReuse(reuseFromRadar(NOW,radarFixture()),NOW,datedHistory());
  assert.equal(finalizeBias(physical,good).finalBias,'false_down_physical_stress');
  for(const mutate of [r=>r.brentPricingLayer.futuresPriceCurve.updatedAt='2026-10-01',r=>r.brentPricingLayer.futuresPriceCurve.frontPrice=null,r=>r.brentPricingLayer.futuresPriceCurve.updatedAt='2026-11-07',r=>r.brentPricingLayer.futuresPriceCurve.curveStatus='fallback']) {
    const r=radarFixture();mutate(r);const reuse=reuseFromRadar(NOW,r);const p=priceContextFromReuse(reuse,NOW,datedHistory());
    assert.equal(p.curveSlopeRegime,null);assert.equal(finalizeBias(physical,p).finalBias,'moderate_bullish');
  }
});
test('display rechecks clocks and does not accept a legacy unqualified divergence',()=>{
  const oil=oilFixture();const r=radarFixture();const original=JSON.stringify(oil);
  assert.equal(qualifyOdpDisplay(oil,r,NOW).displayBias,'false_down_physical_stress');
  const old=clone(oil);delete old.signals.priceContext.priceDirectionSource;
  const result=qualifyOdpDisplay(old,r,NOW);assert.equal(result.priceUsable,false);assert.equal(result.priceContext.brentChangePct4w,null);assert.equal(result.displayBias,'moderate_bullish');
  assert.equal(result.priceContext.crackChange4w,null);assert.equal(JSON.stringify(oil),original);
});
test('stale or mixed-week physical anchors prevent current directional presentation',()=>{
  for(const mutate of [o=>o.evidence.crudeStocksExSpr.asOfDate='2026-10-01',o=>o.evidence.sprStocks.asOfDate='2026-10-29',o=>o.evidence.distillateStocks.value=null,o=>o.builtAt='2026-11-07']) {
    const o=oilFixture();mutate(o);assert.equal(qualifyOdpDisplay(o,radarFixture(),NOW).displayBias,'insufficient_data');
  }
});
test('browser price direction rejects invalid source, old window or stale curve',()=>{
  for(const mutate of [o=>o.signals.priceContext.brentSource='other',o=>o.signals.priceContext.brentStartObservedAt='2020-01-01',o=>o.signals.priceContext.brentChangePct4w=null]) {
    const o=oilFixture();mutate(o);assert.equal(qualifyOdpDisplay(o,radarFixture(),NOW).priceUsable,false);
  }
  const r=radarFixture();r.brentPricingLayer.futuresPriceCurve.updatedAt='2026-10-01';assert.equal(qualifyOdpDisplay(oilFixture(),r,NOW).priceUsable,false);
});
test('STEO projection flags survive and correlated fields do not raise confidence',()=>{
  const context=globalEnergyContextFromRadar(radarFixture());
  assert.equal(context.inventoryBalance.latestIsForecast,true);assert.equal(context.spareCapacity.latestIsForecast,true);
  const overlay=monthlyBackgroundOverlay(reconcile,physical,{changePct4w:-14},context);
  assert.equal(overlay.confirmationCount,0);assert.equal(overlay.confidenceAdjustment,'flat');assert.equal(overlay.confidence,'low');assert.equal(overlay.effect,'neutral');
  assert.equal(overlay.sourceWindows.inventoryIsForecast,true);assert.equal(overlay.sourceWindows.spareIsForecast,true);
});
test('missing spare capacity is unavailable even when an old regime label remains',()=>{
  for(const value of [null,'',false,[],{}]) {
    const ctx=globalEnergyContextFromRadar(radarFixture());ctx.spareCapacity.spareCapacityMbpd=value;
    assert.equal(evaluateGlobalOverlay(reconcile,physical,{},ctx).supplyBuffer,'unavailable');
  }
});
test('committed snapshots remain read-only and legacy price direction is explicitly unavailable',()=>{
  const radar=JSON.parse(readFileSync(new URL('../../data/radar-data.json',import.meta.url),'utf8'));
  const oil=JSON.parse(readFileSync(new URL('../../data/oil-directional-pressure.json',import.meta.url),'utf8'));
  const before=JSON.stringify({radar,oil});const result=qualifyOdpDisplay(oil,radar,NOW);
  if (oil.signals?.priceContext?.priceDirectionSource !== 'dated_same_source_brent_observations') assert.equal(result.priceUsable,false);
  assert.equal(result.priceContext.crackChange4w,null);assert.equal(JSON.stringify({radar,oil}),before);
});

test('missing source states cannot default into live observations',()=>{
  const o=oilFixture();for(const key of ODP_PHYSICAL_KEYS) delete o.evidence[key].sourceStatus;
  assert.equal(qualifyOdpDisplay(o,radarFixture(),NOW).physicalUsable,false);
  const r=radarFixture();delete r.brentPricingLayer.publicSpotProxy.status;
  assert.notEqual(resolveOdpPriceEvidence(r,NOW).brentPrice.sourceStatus,'live');
  assert.notEqual(oilObservation(1,'2026-11-03',5,NOW).sourceStatus,'live');
});
test('invalid calendar dates cannot normalize into apparently fresh observations',()=>{
  for(const date of ['2026-11-31','2026-02-29','2026-13-01','2026-11-00','11/03/2026','2026-11-31T12:00:00Z','2026-11-03T25:00:00Z']) assert.ok(Number.isNaN(oilObservationMillis(date)),date);
  assert.ok(Number.isFinite(oilObservationMillis('2024-02-29')));
  const r=radarFixture();r.brentPricingLayer.publicSpotProxy.observedAt='2026-11-31';
  assert.notEqual(resolveOdpPriceEvidence(r,Date.parse('2026-12-02')).brentPrice.sourceStatus,'live');
});

test('an old divergence cannot borrow a newer, opposite or changed curve snapshot',()=>{
  for(const mutate of [r=>r.brentPricingLayer.futuresPriceCurve.slopeRegime='contango',r=>{r.brentPricingLayer.futuresPriceCurve.updatedAt='2026-11-06T09:00:00Z';for(const row of r.brentPricingLayer.futuresPriceCurve.contracts)row.updatedAt='2026-11-06T09:00:00Z';},r=>r.brentPricingLayer.futuresPriceCurve.backPrice=101]) {
    const r=radarFixture();mutate(r);const q=qualifyOdpDisplay(oilFixture(),r,NOW);
    assert.equal(q.priceUsable,false);assert.equal(q.displayBias,'moderate_bullish');
  }
});

test('old pressure output cannot borrow revised quotes or observations after its build clock',()=>{
  const r=radarFixture();r.brentPricingLayer.selectedBrent.value=108;r.brentPricingLayer.publicSpotProxy.value=108;
  assert.equal(qualifyOdpDisplay(oilFixture(),r,NOW).priceUsable,false);
  const o=oilFixture();o.builtAt='2026-10-29T10:00:00Z';assert.equal(qualifyOdpDisplay(o,radarFixture(),NOW).physicalUsable,false);
  o.builtAt='2026-11-01T10:00:00Z';assert.equal(qualifyOdpDisplay(o,radarFixture(),NOW).priceUsable,false);
});

test('new reuse evidence passes the unchanged production shape, freshness and degradation contracts',()=>{
  for(const mutate of [()=>{},r=>r.brentPricingLayer.publicSpotProxy.status=undefined,r=>r.brentPricingLayer.futuresPriceCurve.curveStatus='fallback',r=>r.brentPricingLayer.futuresPriceCurve.updatedAt='invalid',r=>r.brentPricingLayer.futuresPriceCurve.frontPrice=null,r=>r.brentPricingLayer.publicSpotProxy.observedAt='2026-10-01']) {
    const r=radarFixture();mutate(r);const reuse=reuseFromRadar(NOW,r);
    const snapshot=JSON.parse(readFileSync(new URL('../../data/oil-directional-pressure.json',import.meta.url),'utf8'));
    for(const [key,value] of Object.entries(reuse)) if(key!=='globalEnergyContext')snapshot.evidence[key]=value;
    for(const name of ['contract','freshness','degradation']) {
      const code=readFileSync(new URL('../../scripts/check-oil-directional-'+name+'.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
      const errors=[];
      vm.runInNewContext(code,{readFileSync:()=>JSON.stringify(snapshot),resolve:x=>x,GLOBAL_OVERLAY_EFFECT_VALUES,GLOBAL_OVERLAY_STATUS_VALUES,console:{log(){},error(...args){errors.push(args.join(' '));}},process:{exit(code){throw new Error('contract '+name+' exit '+code+': '+errors.join('; '));}}});
    }
  }
});


test('curve aggregate date cannot renew stale, missing or future endpoint observations',()=>{
  for (const index of [0,1]) for (const date of ['2026-10-01',null,'2026-11-07','2026-11-31']) {
    const r=radarFixture();r.brentPricingLayer.futuresPriceCurve.contracts[index].updatedAt=date;
    const reuse=reuseFromRadar(NOW,r);
    assert.notEqual(reuse.curve.sourceStatus,'live');
    const pc=priceContextFromReuse(reuse,NOW,datedHistory());
    assert.equal(pc.curveSlopeRegime,null);
    assert.equal(finalizeBias(physical,pc).finalBias,'moderate_bullish');
    assert.equal(qualifyOdpDisplay(oilFixture(),r,NOW).priceUsable,false);
  }
});
test('curve requires both actual matching contract endpoints and spread',()=>{
  for (const mutate of [c=>delete c.contracts,c=>c.contracts=[],c=>c.contracts.pop(),c=>c.contracts[0].price=109,c=>c.contracts[1].price=null,c=>c.frontMinusBack=7]) {
    const r=radarFixture();mutate(r.brentPricingLayer.futuresPriceCurve);
    assert.notEqual(resolveOdpPriceEvidence(r,NOW).curve.sourceStatus,'live');
  }
});
test('fresh middle quote cannot renew either curve endpoint or the displayed observation date',()=>{
  const r=radarFixture();const c=r.brentPricingLayer.futuresPriceCurve;
  c.contracts.splice(1,0,{symbol:'BZH27.NYM',price:105,updatedAt:c.updatedAt});
  c.contracts[0].updatedAt='2026-11-03T08:00:00Z';c.contracts[2].updatedAt='2026-11-04T08:00:00Z';
  const before=JSON.stringify(r);const q=resolveOdpPriceEvidence(r,NOW).curve;
  assert.equal(q.sourceStatus,'live');assert.equal(q.asOfDate,'2026-11-03T08:00:00Z');
  assert.equal(q.ageDays,3.167);assert.equal(JSON.stringify(r),before);
  c.contracts[0].updatedAt='2026-10-01';assert.notEqual(resolveOdpPriceEvidence(r,NOW).curve.sourceStatus,'live');
});
test('curve endpoint freshness keeps the existing inclusive four-day boundary',()=>{
  const r=radarFixture();const c=r.brentPricingLayer.futuresPriceCurve;
  c.contracts[0].updatedAt='2026-11-02T12:00:00Z';
  assert.equal(resolveOdpPriceEvidence(r,NOW).curve.sourceStatus,'live');
  assert.notEqual(resolveOdpPriceEvidence(r,NOW+1).curve.sourceStatus,'live');
});

test('a newer endpoint cannot qualify a divergence built before that observation',()=>{
  const r=radarFixture();r.brentPricingLayer.futuresPriceCurve.contracts[0].updatedAt='2026-11-06T11:00:00Z';
  r.brentPricingLayer.futuresPriceCurve.updatedAt='2026-11-06T11:00:00Z';
  assert.equal(resolveOdpPriceEvidence(r,NOW).curve.sourceStatus,'live');
  assert.equal(resolveOdpPriceEvidence(r,NOW).curve.asOfDate,oilFixture().evidence.curve.asOfDate);
  assert.equal(qualifyOdpDisplay(oilFixture(),r,NOW).priceUsable,false);
});
