import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectMarketObservations, validateMarketSnapshot, parseMarketCloses, parseMarketHoldings, parseMarketPe, MARKET_SOURCES } from '../../scripts/bubble-watch/market-observations.mjs';
const now=new Date('2026-11-14T06:20:00.000Z');
const atom=`<entry><title>Shiller PE Ratio</title><updated>2026-11-13T16:00:00-05:00</updated><id>https://www.multpl.com/shiller-pe/2026-11-13/</id><content>Current Shiller PE Ratio: 40.24</content></entry>`;
const holdings='<p>Top 100 Holdings Updated Nov 13, 2026</p><table><tr><th>Symbol</th><th>Weight</th></tr>'+Array.from({length:25},(_,i)=>`<tr><td><a href="/stocks/s${i}/">S${i}</a></td><td>${(8-i*0.2).toFixed(2)}%</td></tr>`).join('')+'</table>';
const pe='<p>Last updated: Nov 13, 2026 Financial statistics are provided</p><table><tr><td>Forward P/E</td><td>15.23</td></tr></table>';
const chart=symbol=>({chart:{result:[{meta:{symbol},timestamp:Array.from({length:180},(_,i)=>Date.parse('2026-05-18T14:30:00Z')/1000+i*86400),indicators:{quote:[{close:Array.from({length:180},(_,i)=>100+i)}]}}]}});
function fixtureFetch(calls,override){return async(url,options)=>{calls.push({url,options});if(override){const r=await override(url,options);if(r)return r;}
 return new Response(url.includes('multpl')?atom:url.includes('holdings')?holdings:url.includes('statistics')?pe:JSON.stringify(chart(url.includes('/SPY?')?'SPY':'RSP')));
};}
test('five bounded uncredentialed requests produce four dated observations, including genuine zero spread',async()=>{
 const calls=[];const d=await collectMarketObservations({now,fetchImpl:fixtureFetch(calls)});
 assert.equal(calls.length,5);assert.equal(d.collection.requests,5);assert.deepEqual(validateMarketSnapshot(d,now),[]);
 for(const call of calls){assert.equal(call.options.redirect,'error');assert.ok(call.options.signal);assert.deepEqual(Object.keys(call.options.headers),['User-Agent']);}
 assert.ok(d.observations.every(x=>x.status==='fresh'&&x.observationDate==='2026-11-13'));
 assert.equal(d.observations.at(-1).value,0);
 assert.equal(d.summary,undefined);assert.equal(d.scoring,undefined);
});
test('failure, source regression and stale previous observations retain original clocks, never redate',async()=>{
 const first=await collectMarketObservations({now,fetchImpl:fixtureFetch([])});
 const outage=async()=>new Response('',{status:503});
 const second=await collectMarketObservations({previous:first,now:new Date('2026-11-15T06:20:00Z'),fetchImpl:outage});
 for(let i=0;i<4;i++){assert.equal(second.observations[i].status,'fallback');assert.equal(second.observations[i].fetchedAt,first.observations[i].fetchedAt);assert.equal(second.observations[i].observationDate,first.observations[i].observationDate);}
 const stale=await collectMarketObservations({previous:second,now:new Date('2026-11-25T06:20:00Z'),fetchImpl:outage});
 assert.ok(stale.observations.every(x=>x.status==='stale'));assert.deepEqual(validateMarketSnapshot(stale,new Date('2026-11-25T06:20:00Z')),[]);
 const regressed=await collectMarketObservations({previous:first,now,fetchImpl:fixtureFetch([],url=>url.includes('multpl')?new Response(atom.replaceAll('2026-11-13','2026-11-12')):null)});
 assert.equal(regressed.observations[0].status,'fallback');assert.equal(regressed.observations[0].observationDate,'2026-11-13');
});
test('invalid baseline and source failures stay missing; unhealthy source cannot erase healthy peers',async()=>{
 const bad=await collectMarketObservations({previous:{},now,fetchImpl:async()=>new Response('',{status:404})});
 assert.ok(bad.observations.every(x=>x.status==='missing'&&x.value===null&&x.fetchedAt===null));
 const mixed=await collectMarketObservations({now,fetchImpl:fixtureFetch([],url=>url.includes('statistics')?new Response('undated Forward P/E 16'):null)});
 assert.equal(mixed.observations[2].status,'missing');assert.equal(mixed.observations[0].status,'fresh');
});
test('strict metric identity, dates, source values and finished-session chart qualification',()=>{
 assert.equal(parseMarketPe(pe,'2026-11-14').value,15.23);
 assert.equal(parseMarketHoldings(holdings.replace('8.00%','8%'),'2026-11-14').value,38);
 assert.throws(()=>parseMarketHoldings(holdings.replace('8.00%','N/A'),'2026-11-14'));
 assert.throws(()=>parseMarketHoldings(holdings.replace('<a href=\"/stocks/s0/\">S0</a>','S0'),'2026-11-14'));
 assert.throws(()=>parseMarketHoldings(holdings.replace('href=\"/stocks/s0/','href=\"https://stockanalysis.com/stocks/s0/'),'2026-11-14'));
 assert.throws(()=>parseMarketHoldings(holdings.replace('8.00%','8% 99%'),'2026-11-14'));
 const extra=holdings.replace('<th>Weight</th>','<th>Weight</th><th>% Change</th>').replaceAll('%</td></tr>','%</td><td>99%</td></tr>');
 assert.equal(parseMarketHoldings(extra,'2026-11-14').value,38);
 assert.equal(parseMarketHoldings(holdings.replace('<th>Weight</th>','<th><span>Weight</span><span>% Weight</span></th>'),'2026-11-14').value,38);
 assert.throws(()=>parseMarketPe(pe+' Forward P/E 17.2','2026-11-14'));
 assert.throws(()=>parseMarketHoldings(holdings.replace('/stocks/s1/','/stocks/s0/'),'2026-11-14'));
 assert.throws(()=>parseMarketHoldings(holdings.replace('Updated Nov 13','Updated Nov 15'),'2026-11-14'));
 const c=chart('SPY');c.chart.result[0].timestamp.push(Date.parse('2026-11-14T00:00:00Z')/1000);c.chart.result[0].indicators.quote[0].close.push(10000);
 assert.equal(parseMarketCloses(JSON.stringify(c),'SPY',now).length,180);
 assert.throws(()=>parseMarketCloses(JSON.stringify(c),'RSP',now));
 c.chart.result[0].timestamp[0]=Date.parse('2026-11-15')/1000;assert.throws(()=>parseMarketCloses(JSON.stringify(c),'SPY',now));
});
test('body byte limit, redirect and whole-response timeout degrade without retries',async()=>{
 for(const fetchImpl of [async()=>new Response('x',{headers:{'content-length':'3000000'}}),async()=>new Response('x'.repeat(2*1024*1024+1)),async()=>new Response(new ReadableStream({start(){}})),async()=>({ok:true,redirected:true}),async()=>new Promise(()=>{})]){
  let calls=0;const result=await collectMarketObservations({now,timeoutMs:15,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
  assert.equal(calls,5);assert.ok(result.observations.every(x=>x.status==='missing'));
 }
});
test('snapshot validation rejects impossible dates, null-zero substitutions, future clocks and forged sources',async()=>{
 const data=await collectMarketObservations({now,fetchImpl:fixtureFetch([])});
 for(const change of [d=>d.observations[0].value=null,d=>d.observations[0].sourceUrl='https://evil.test',d=>d.observations[0].observationDate='2026-02-30',d=>d.checkedAt='2026-11-15T00:00:00.000Z',d=>d.collection.requests=6]){const d=structuredClone(data);change(d);assert.ok(validateMarketSnapshot(d,now).length);}
 for(const source of MARKET_SOURCES)assert.ok(source.sourceUrl.startsWith('https://'));
});
test('production entry point writes only independent snapshot; weekly output and AI paths absent',()=>{
 const source=fs.readFileSync(new URL('../../scripts/refresh-bubble-market-observations.mjs',import.meta.url),'utf8');
 assert.match(source,/data\/bubble-market-observations\.json/u);assert.match(source,/Market snapshot changed during collection/u);
 assert.doesNotMatch(source,/bubble-watch\.json|bubble-watch-history|weekly.editorial|DEEPSEEK|WIND|TAVILY|BRAVE/u);
});
test('actual writer dry-run, exact output path, invalid output and concurrent-write refusal',async()=>{
 const vm=await import('node:vm'),path=await import('node:path'),{fileURLToPath}=await import('node:url');
 const url=new URL('../../scripts/refresh-bubble-market-observations.mjs',import.meta.url),source=fs.readFileSync(url,'utf8');
 const output=await collectMarketObservations({now,fetchImpl:fixtureFetch([])});
 async function run({write=false,concurrent=false,invalid=false}={}){
  let reads=0;const writes=[];
  const context=vm.createContext({path:path.default,fileURLToPath,process:{argv:['node','script',...(write?['--write']:[])]},
   collectMarketObservations:async()=>invalid?{...output,contractVersion:'bad'}:output,validateMarketSnapshot,
   fs:{existsSync:()=>true,readFileSync(file){assert.ok(file.endsWith('/data/bubble-market-observations.json'));return ++reads>1&&concurrent?'{}':JSON.stringify(output);},writeFileSync(file,text){writes.push({file,text});}},console:{log(){}}});
  const executable=source.replace(/^import .*;\n/gmu,'').replaceAll('import.meta.url',JSON.stringify(url.href));
  try{await vm.runInContext(`(async()=>{${executable}})()`,context);}catch(e){e.writes=writes;throw e;}
  return writes;
 }
 assert.equal((await run()).length,0);
 const writes=await run({write:true});assert.equal(writes.length,1);assert.ok(writes[0].file.endsWith('/data/bubble-market-observations.json'));assert.deepEqual(JSON.parse(writes[0].text),output);
 for(const options of [{concurrent:true},{invalid:true}])await assert.rejects(run({...options,write:true}),e=>e.writes.length===0);
});
