import test from 'node:test';
import assert from 'node:assert/strict';
import { INSIDER_BASKET, insiderWindowUrl, qualifyInsiderWindows, qualifyInsiderCoverage } from '../../scripts/bubble-watch/qualified-insider.mjs';
import { collectInsiderWindows } from '../../scripts/bubble-watch/insider-window-collector.mjs';
import { validateInsiderPublication } from '../../scripts/bubble-watch/qualified-insider-publication.mjs';
const today='2026-10-15',checkedAt=`${today}T12:00:00.000Z`;
const row=(txDate,txCode,valueUsd)=>({txDate,txCode,valueUsd,isOpenMarket:true,insiderName:'Synthetic',shares:'1',pricePerShare:String(valueUsd),priceNote:null});
const samples=()=>INSIDER_BASKET.map(symbol=>({symbol,responseTicker:symbol,sourceUrl:insiderWindowUrl(symbol,today),responseBuiltAt:checkedAt,
  transactions:[row('2026-10-14','S','50000000.123456789012'),row('2026-10-10','P','1000000.000000000000'),row('2026-08-01','S','1')]}));
test('explicit bounded returned windows stay yellow with exact decimal totals, no personal rows',()=>{
  const report=qualifyInsiderWindows(samples(),today,checkedAt);
  assert.equal(report.status,'yellow');assert.equal(report.totals[30].buyUsd,'12000000');
  assert.equal(report.totals[30].sellUsd,'600000001.481481468144');
  assert.equal(report.latestTransactionDate,'2026-10-14');
  assert.equal(qualifyInsiderCoverage(report.companies,today,checkedAt).status,'yellow');
  assert.equal(JSON.stringify(report).includes('Synthetic'),false);
  assert.equal(report.totals[90].scheduleUnknownCount,36);
});
test('missing and near-zero buys are not floored, small or partial samples never green/red',()=>{
  const data=samples();data.forEach(c=>c.transactions[1].valueUsd='0.000000000001');
  const report=qualifyInsiderWindows(data,today,checkedAt);
  assert.equal(report.status,'yellow');assert.equal(report.totals[30].ratio,null);assert.equal(report.denominatorFloorApplied,false);
  assert.equal(qualifyInsiderWindows(samples().slice(0,7),today,checkedAt).status,'unknown');
  data.forEach(c=>c.transactions[0].valueUsd='0.01');
  assert.equal(qualifyInsiderWindows(data,today,checkedAt).status,'unknown');
});
test('null, approximate, malformed decimal, response/query and date defects reject whole company',()=>{
  const mutations=[c=>{c.responseTicker='WRONG';},c=>{c.responseBuiltAt='2026-10-01T00:00:00Z';},
    c=>{c.transactions[0]=null;},c=>{c.transactions.reverse();},c=>{c.transactions[0].txCode='A';},
    c=>{delete c.transactions[0].isOpenMarket;},c=>{c.transactions.push(c.transactions[0]);},
    c=>{c.transactions[0].priceNote='midpoint of reported range';},c=>{c.sourceUrl=c.sourceUrl.replace('limit=2000','limit=200');},
    c=>{c.sourceUrl+='&token=private';},c=>{c.transactions[0].txDate='2026-07-17';},
    ...[null,'',' ','1e7','1,000','1tail','Infinity','-1','0','1.1234567890123'].map(value=>c=>{c.transactions[0].valueUsd=value;})];
  for(const mutate of mutations){const data=samples();data.forEach(mutate);const report=qualifyInsiderWindows(data,today,checkedAt);
    assert.equal(report.status,'unknown');assert.equal(report.companies.length,0);assert.equal(report.rejectedSamples.length,12);
  }
});
test('empty returned arrays are observed empty samples, no invented trade date or completeness',()=>{
  const data=samples();data.forEach(c=>c.transactions=[]);
  const report=qualifyInsiderWindows(data,today,checkedAt);
  assert.equal(report.status,'unknown');assert.equal(report.validResponseSymbols.length,12);
  assert.equal(report.returnedEmptySymbols.length,12);assert.deepEqual(report.inWindowTradeSymbols,[]);
  assert.equal(report.latestTransactionDate,null);assert.equal(report.companies[0].oldestReturnedDate,null);
  assert.equal(report.totals[90].buyUsd,'0');assert.equal(report.coverageStatus,'returned_sample_completeness_unverified');
  assert.equal(qualifyInsiderCoverage(report.companies,today,checkedAt).status,'unknown');
});
test('5x and $1M thresholds use exact cross multiplication at decimal boundary',()=>{
  for(const [sell,expected] of [['4999999.999999999999','unknown'],['5000000','yellow']]){
    const data=samples();data.forEach(c=>{c.transactions=[row('2026-10-14','S',sell),row('2026-10-10','P','1000000')];});
    assert.equal(qualifyInsiderWindows(data,today,checkedAt).status,expected);
  }
});
test('aggregate proofs reject impossible directions, per-trade caps and outside-window counts',()=>{
  const original=qualifyInsiderWindows(samples(),today,checkedAt).companies;
  for(const mutate of [
    c=>{c.windows[30].transactionCount=1;c.windows[30].scheduleUnknownCount=1;},
    c=>{c.windows[30].buyUsd='2000000000000';c.windows[30].sellUsd='2000000000000';},
    c=>{c.windows[90].transactionCount=c.windows[30].transactionCount;c.windows[90].scheduleUnknownCount=c.windows[30].scheduleUnknownCount;},
    c=>{c.windows[30].scheduleUnknownCount=0;c.windows[90].scheduleUnknownCount=3;}
  ]) {
    const changed=structuredClone(original);changed.forEach(mutate);
    const rejected=qualifyInsiderCoverage(changed,today,checkedAt);
    assert.equal(rejected.status,'unknown');assert.equal(rejected.policy,undefined);
  }
});
test('free collector uses explicit parameters, rate spacing and stops 401/403/429 without retry',async()=>{
  for(const code of [200,401,403,429]){
    let time=Date.parse(checkedAt);const starts=[];
    const report=await collectInsiderWindows({today,now:()=>time,sleep:async ms=>{time+=ms;},fetchFn:async (url,options)=>{
      starts.push(time);assert.equal(options.redirect,'error');const symbol=new URL(url).pathname.split('/').at(-1);
      assert.equal(url,insiderWindowUrl(symbol,today));if(code!==200)return new Response('',{status:code});
      const sample=samples().find(c=>c.symbol===symbol);
      return Response.json({source:'xoomar.com',meta:{source:'SEC'},data:{ticker:symbol,transactions:sample.transactions},updatedAt:sample.responseBuiltAt});
    }});
    assert.equal(starts.length,code===200?12:1);assert.equal(report.collectionPolicy.actualRequests,starts.length);
    for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=6500);
    assert.equal(report.status,code===200?'yellow':'unknown');
  }
});
test('transport rejects oversized, non-JSON, bad origins and aborted responses without raw errors',async()=>{
  for(const kind of ['length','stream','content-type','json','origin','abort']) {
    let time=Date.parse(checkedAt),calls=0;
    const report=await collectInsiderWindows({today,now:()=>time,sleep:async ms=>{time+=ms;},fetchFn:async()=>{
      calls++;
      if(kind==='abort') throw new DOMException('private upstream diagnostic','AbortError');
      if(kind==='length') return new Response('{}',{headers:{'content-type':'application/json','content-length':String(1024*1024+1)}});
      if(kind==='stream') return new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'application/json'}});
      if(kind==='content-type') return new Response('private upstream diagnostic',{headers:{'content-type':'text/html'}});
      if(kind==='origin') return Response.json({source:'unapproved',meta:{source:'SEC'}});
      return new Response('private upstream diagnostic',{headers:{'content-type':'application/json'}});
    }});
    assert.equal(calls,12);assert.equal(report.status,'unknown');assert.equal(report.sourceFailures.length,12);
    assert.ok(report.sourceFailures.every(f=>f.reason===(kind==='abort'?'timeout':'response_unusable')));
    assert.equal(JSON.stringify(report).includes('private upstream diagnostic'),false);
  }
});
test('publication replays aggregate proof, actual trade date and free collection policy',async()=>{
  let time=Date.parse(checkedAt);
  const report=await collectInsiderWindows({today,now:()=>time,sleep:async ms=>{time+=ms;},fetchFn:async url=>{
    const symbol=new URL(url).pathname.split('/').at(-1),sample=samples().find(c=>c.symbol===symbol);
    return Response.json({source:'xoomar.com',meta:{source:'SEC'},data:{ticker:symbol,transactions:sample.transactions},updatedAt:sample.responseBuiltAt});
  }});
  const card={status:report.status,as_of:'2026-10-14',provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report}};
  assert.deepEqual(validateInsiderPublication(card,today),[]);
  for(const mutate of [c=>{c.status='red';},c=>{c.as_of=today;},c=>{c.provenance.detail.totals[30].ratio=999;},
    c=>{c.provenance.detail.companies[0].insiderName='Private';},c=>{c.provenance.detail.companies[0].windows[30].transactions=[];},
    c=>{c.provenance.detail.collectionPolicy.applicationRetries=1;},c=>{c.provenance.detail.sourceAttribution='SEC official API';},
    c=>{c.provenance.detail.checkedAt='2026-10-16T00:00:00Z';},c=>{c.provenance.detail.companies[0]=null;}]) {
    const changed=structuredClone(card);mutate(changed);assert.ok(validateInsiderPublication(changed,today).length>0);
  }
  const impossible=structuredClone(card);
  for(const company of impossible.provenance.detail.companies) for(const n of [30,90]) {
    company.windows[n].transactionCount=1;company.windows[n].scheduleUnknownCount=1;
  }
  assert.ok(validateInsiderPublication(impossible,today).some(error=>/invalid/u.test(error)));
});
