import {isDeepStrictEqual} from 'node:util';
import {OCTOBER_CAPEX_EVENTS as events,OCTOBER_CAPEX_SCHEMA,OCTOBER_CAPEX_REGISTRY,octoberGuidanceFacts} from './capex-october-panel.mjs';
import {QUARTERLY_CAPEX_POLICY,QUARTERLY_CAPEX_LIMITATION,quarterlyPanelDecision} from './capex-quarterly-panel.mjs';
import {cashEventWindow,realDate} from './capex-event-session.mjs';
import {matchedPrices} from './capex-event-collector.mjs';
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
const clock=(s,today)=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s&&s.slice(0,10)===today;
export function replayOctoberCapexPanel(panel,today,{now=()=>Date.now()}={}){
 try{return replay(panel,today,now());}catch{return {ok:false,errors:['malformed October capex evidence'],decision:{status:'unknown'}};}
}
function replay(p,today,now){
 const errors=[],check=(ok,why)=>{if(!ok)errors.push(why);};
 check(realDate(today)&&Number.isFinite(now),'capex date invalid');
 check(only(p,['schemaVersion','registryId','policy','asOfDate','checkedAt','companies','decision','requests','sourceFailures','scope','firstGuidanceDiscoveryComplete','scoringEligible','productionEligible','budget','limitation']),'capex derived-only panel fields');
 check(p.schemaVersion===OCTOBER_CAPEX_SCHEMA&&p.registryId===OCTOBER_CAPEX_REGISTRY&&p.policy===QUARTERLY_CAPEX_POLICY&&p.limitation===QUARTERLY_CAPEX_LIMITATION,'capex October identity');
 check(p.asOfDate===today&&clock(p.checkedAt,today)&&Date.parse(p.checkedAt)<=now,'capex panel clock');
 check(p.scope==='reviewed_latest_quarterly_call_fixed_four'&&p.firstGuidanceDiscoveryComplete===false&&p.scoringEligible===false&&p.productionEligible===false,'capex panel scope');
 const rows=p.companies,requests=p.requests;
 if(!Array.isArray(rows)||rows.length!==4||new Set(rows.map(r=>r?.symbol)).size!==4||!Object.keys(events).every(s=>rows.some(r=>r?.symbol===s)))return {ok:false,errors:[...errors,'capex fixed-four layout'],decision:{status:'unknown'}};
 if(!Array.isArray(requests)||requests.length!==20||new Set(requests.map(r=>r?.url)).size!==20)return {ok:false,errors:[...errors,'capex request layout'],decision:{status:'unknown'}};
 check(Array.isArray(p.sourceFailures)&&p.sourceFailures.length===0,'capex source failure');
 check(only(p.budget,['actualRequests','maximumRequests','responseMaxBytes','totalMaxBytes','totalBytes','totalBudgetExhausted','requestTimeoutMs','applicationRetries','redirects']),'capex budget fields');
 check(p.budget.actualRequests===20&&p.budget.maximumRequests===20&&p.budget.responseMaxBytes===2*1024*1024&&p.budget.totalMaxBytes===12*1024*1024
  &&p.budget.totalBudgetExhausted===false&&p.budget.requestTimeoutMs===12000&&p.budget.applicationRetries===0&&p.budget.redirects==='error','capex fixed request policy');
 check(requests.every(r=>only(r,['url','checkedAt','status','bytes','sha256'])&&r.status==='ok'&&hash(r.sha256)&&clock(r.checkedAt,today)&&r.checkedAt<=p.checkedAt&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=2*1024*1024),'capex request proof');
 check(requests.reduce((n,r)=>n+(r.bytes||0),0)===p.budget.totalBytes&&p.budget.totalBytes<=12*1024*1024,'capex byte budget');
 const urls=new Set(),bound=(url,digest)=>{urls.add(url);return hash(digest)&&requests.some(r=>r.url===url&&r.sha256===digest);};
 const windows=Object.fromEntries(Object.entries(events).map(([symbol,event])=>{
  const w=cashEventWindow(event.anchorAt,p.checkedAt);delete w.originalPublishedAt;return [symbol,{...w,anchorAt:event.anchorAt,association:'latest_quarterly_earnings_call'}];
 }));
 const dates=Object.values(windows).flatMap(w=>[w.beforeDate,w.afterDate]).sort();
 const start=Date.parse(dates[0]+'T00:00:00Z')/1000,end=Date.parse(dates.at(-1)+'T00:00:00Z')/1000+2*86400;
 const quoteUrl=symbol=>`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=1d&events=div%2Csplits`;
 urls.add(quoteUrl('QQQ'));
 for(const row of rows){
  const s=row.symbol,e=events[s],catalogUrl=`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/`,transcriptUrl=catalogUrl+e.id+'/';
  check(only(row,['symbol','status','gaps','catalog','guidance','timing','window','prices'])&&row.status==='qualified'&&Array.isArray(row.gaps)&&row.gaps.length===0,`${s} complete evidence`);
  const age=(Date.parse(today+'T00:00:00Z')-Date.parse(e.date+'T00:00:00Z'))/86400000;
  check(age>=0&&age<=120,`${s} event expired`);
  check(only(row.catalog,['id','quarter','scope','sourceDigest','sourceUrl'])&&row.catalog.id===e.id&&row.catalog.quarter===e.quarter&&row.catalog.scope==='latest_published_quarter_in_stockanalysis_catalog'
   &&row.catalog.sourceUrl===catalogUrl&&bound(catalogUrl,row.catalog.sourceDigest),`${s} catalog proof`);
  const g=row.guidance,expected=octoberGuidanceFacts(s);
  check(only(g,[...Object.keys(expected),'clauseDigest','documentDigest','sourceRole','sourceUrl'])&&Object.entries(expected).every(([key,value])=>equal(g[key],value))
   &&g.sourceRole==='secondary_attributed_call_transcript'&&g.sourceUrl===transcriptUrl&&hash(g.clauseDigest)&&bound(transcriptUrl,g.documentDigest),`${s} guidance proof`);
  const t=row.timing;
  check(only(t,['eventDate','anchorAt','anchorKind','primaryDigest',...(e.timing?['scheduleDigest']:[]),...(e.comparison?['comparisonDigest']:[]),
   'firstGuidanceDisclosureVerified','capexCausalityEstablished','primaryUrl',...(e.timing?['scheduleUrl']:[]),...(e.comparison?['comparisonUrl']:[])])
   &&t.eventDate===e.date&&t.anchorAt===e.anchorAt&&t.anchorKind===(s==='GOOGL'?'official_call_remarks_publication':'official_scheduled_quarterly_call')
   &&t.firstGuidanceDisclosureVerified===false&&t.capexCausalityEstablished===false&&t.primaryUrl===e.primary&&bound(e.primary,t.primaryDigest),`${s} timing proof`);
  if(e.timing)check(t.scheduleUrl===e.timing&&bound(e.timing,t.scheduleDigest),`${s} schedule proof`);
  if(e.comparison)check(t.comparisonUrl===e.comparison&&bound(e.comparison,t.comparisonDigest),`${s} prior guidance proof`);
  check(only(row.window,['policy','beforeDate','afterDate','association','capexCausalityEstablished','anchorAt'])&&equal(row.window,windows[s]),`${s} event session`);
  urls.add(quoteUrl(s));
  try{
   const envelope=(symbol,pair)=>({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York',dataGranularity:'1d',instrumentType:symbol==='QQQ'?'ETF':'EQUITY'},timestamp:pair.map(v=>v.timestamp),indicators:{quote:[{close:pair.map(v=>v.rawClose),volume:pair.map(v=>v.volume)}],adjclose:[{adjclose:pair.map(v=>v.adjustedClose)}]}}]}});
   const prices=row.prices;
   check(only(prices,['policy','stock','qqq','stockReturnPct','qqqReturnPct','excessReturnPp','scoringEligible'])&&prices.stock.length===2&&prices.qqq.length===2
    &&[...prices.stock,...prices.qqq].every(v=>only(v,['date','rawClose','adjustedClose','volume','timestamp'])),`${s} derived-only prices`);
   check(equal(matchedPrices(envelope(s,prices.stock),envelope('QQQ',prices.qqq),windows[s],s),prices),`${s} price replay differs`);
  }catch{check(false,`${s} price pair invalid`);}
 }
 const benchmark=new Map();for(const row of rows)for(const v of row.prices?.qqq||[]){if(benchmark.has(v.date))check(equal(benchmark.get(v.date),v),'capex benchmark observation conflict');else benchmark.set(v.date,v);}
 check(urls.size===20&&requests.every(r=>urls.has(r.url)),'capex source URL mismatch');
 const decision=quarterlyPanelDecision(rows);check(equal(decision,p.decision),'capex decision differs');
 return {ok:errors.length===0,errors,decision:errors.length?{status:'unknown'}:decision};
}
