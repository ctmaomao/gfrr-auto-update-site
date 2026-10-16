import {QUARTERLY_CAPEX_EVENTS as events,QUARTERLY_CAPEX_POLICY,QUARTERLY_CAPEX_LIMITATION,reviewedQuarterlyGuidance,quarterlyPanelDecision} from './capex-quarterly-panel.mjs';
import {cashEventWindow,realDate} from './capex-event-session.mjs';
import {matchedPrices} from './capex-event-collector.mjs';
import {isDeepStrictEqual} from 'node:util';
// Publication/checker fixtures may cross VM realms; compare JSON values,
// preserving all keys/array order without treating prototypes as evidence.
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const validClock=(s,today)=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s&&s.slice(0,10)===today;
export function replayQuarterlyCapexPanel(panel,today,{now=()=>Date.now()}={}){
 try{return replay(panel,today,now());}catch{return {ok:false,errors:['malformed capex evidence'],decision:{status:'unknown'}};}
}
function replay(panel,today,nowMs){
 const errors=[],check=(ok,s)=>{if(!ok)errors.push(s);};
 if(!realDate(today)||!panel||typeof panel!=='object')return {ok:false,errors:['invalid capex panel/date'],decision:{status:'unknown'}};
 check(only(panel,['schemaVersion','policy','asOfDate','checkedAt','companies','decision','requests','sourceFailures','scope','firstGuidanceDiscoveryComplete','scoringEligible','productionEligible','budget','limitation'])&&panel.limitation===QUARTERLY_CAPEX_LIMITATION,'capex derived-only panel fields');
 check(panel.policy===QUARTERLY_CAPEX_POLICY&&panel.schemaVersion==='bubble-quarterly-capex-panel-v1','capex panel identity');
 check(panel.asOfDate===today&&validClock(panel.checkedAt,today)&&Number.isFinite(nowMs)&&Date.parse(panel.checkedAt)<=nowMs,'capex panel clock');
 check(panel.scope==='reviewed_latest_quarterly_call_fixed_four'&&panel.firstGuidanceDiscoveryComplete===false&&panel.scoringEligible===false&&panel.productionEligible===false,'capex panel scope');
 const rows=panel.companies,requests=panel.requests;
 if(!Array.isArray(rows)||rows.length!==4||new Set(rows.map(r=>r?.symbol)).size!==4||!Object.keys(events).every(s=>rows.some(r=>r?.symbol===s)))return {ok:false,errors:[...errors,'capex fixed-four layout'],decision:{status:'unknown'}};
 if(!Array.isArray(requests)||requests.length!==19||new Set(requests.map(r=>r?.url)).size!==19)return {ok:false,errors:[...errors,'capex request layout'],decision:{status:'unknown'}};
 check(Array.isArray(panel.sourceFailures)&&panel.sourceFailures.length===0,'capex source failure');
 check(only(panel.budget,['actualRequests','maximumRequests','responseMaxBytes','totalMaxBytes','totalBytes','totalBudgetExhausted','requestTimeoutMs','applicationRetries','redirects']),'capex budget fields');
 check(panel.budget?.actualRequests===19&&panel.budget?.applicationRetries===0&&panel.budget?.redirects==='error'&&panel.budget?.totalBudgetExhausted===false,'capex collection budget');
 check(panel.budget?.maximumRequests===20&&panel.budget?.responseMaxBytes===2*1024*1024&&panel.budget?.totalMaxBytes===12*1024*1024&&panel.budget?.requestTimeoutMs===12000,'capex fixed request policy');
 check(requests.every(r=>only(r,['url','checkedAt','status','bytes','sha256'])&&r.status==='ok'&&sha(r.sha256)&&validClock(r.checkedAt,today)&&r.checkedAt<=panel.checkedAt&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=2*1024*1024),'capex request proof');
 check(requests.reduce((n,r)=>n+(r.bytes||0),0)===panel.budget?.totalBytes&&panel.budget?.totalBytes<=12*1024*1024,'capex byte budget');
 const expectedUrls=new Set();
 const bound=(url,hash)=>{expectedUrls.add(url);return sha(hash)&&requests.some(r=>r.url===url&&r.sha256===hash);};
 const dates=Object.values(events).map(e=>e.date).sort();
 const start=Date.parse(dates[0]+'T00:00:00Z')/1000;
 // Reconstruct all event pairs before deriving the common bounded quote query.
 const windows=Object.fromEntries(Object.entries(events).map(([s,e])=>{
  const anchor=s==='GOOGL'?'2026-07-22T20:45:00Z':e.callAt;
  try{const w=cashEventWindow(anchor,panel.checkedAt);delete w.originalPublishedAt;return [s,{...w,anchorAt:anchor,association:'latest_quarterly_earnings_call'}];}catch{return [s,null];}
 }));
 const afterDates=Object.values(windows).filter(Boolean).map(w=>w.afterDate).sort();
 const end=afterDates.length?Date.parse(afterDates.at(-1)+'T00:00:00Z')/1000+2*86400:NaN;
 const quoteUrl=s=>`https://query1.finance.yahoo.com/v8/finance/chart/${s}?period1=${start}&period2=${end}&interval=1d&events=div%2Csplits`;
 expectedUrls.add(quoteUrl('QQQ'));
 for(const row of rows){
  const s=row.symbol,e=events[s],catalogUrl=`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/`,transcriptUrl=catalogUrl+e.id+'/';
  check(only(row,['symbol','status','gaps','catalog','guidance','timing','window','prices']),'capex derived-only company fields');
  check(row.status==='qualified'&&Array.isArray(row.gaps)&&row.gaps.length===0,`${s} evidence unavailable`);
  const age=(Date.parse(today+'T00:00:00Z')-Date.parse(e.date+'T00:00:00Z'))/86400000;
  check(age>=0&&age<=120,`${s} event expired`);
  check(only(row.catalog,['id','quarter','scope','sourceDigest','sourceUrl'])&&row.catalog.id===e.id&&row.catalog.quarter===e.quarter&&row.catalog.scope==='latest_published_quarter_in_stockanalysis_catalog'&&row.catalog.sourceUrl===catalogUrl&&bound(catalogUrl,row.catalog.sourceDigest),`${s} catalog proof`);
  const g=row.guidance,expected=reviewedQuarterlyGuidance(s);
  check(only(g,[...Object.keys(expected),'clauseDigest','documentDigest','sourceRole','sourceUrl'])&&Object.entries(expected).every(([k,v])=>equal(g[k],v))&&g.sourceRole==='secondary_attributed_call_transcript'&&g.sourceUrl===transcriptUrl&&sha(g.clauseDigest)&&bound(transcriptUrl,g.documentDigest),`${s} guidance proof`);
  const t=row.timing;
  check(only(t,['eventDate','anchorAt','anchorKind','primaryDigest','firstGuidanceDisclosureVerified','capexCausalityEstablished','primaryUrl',...(e.timing?['scheduleDigest','scheduleUrl']:[])])&&t.eventDate===e.date&&t.anchorAt===windows[s]?.anchorAt&&t.anchorKind===(s==='GOOGL'?'official_call_remarks_publication':'official_scheduled_quarterly_call')&&t.firstGuidanceDisclosureVerified===false&&t.capexCausalityEstablished===false&&t.primaryUrl===e.primary&&bound(e.primary,t.primaryDigest),`${s} timing proof`);
  if(e.timing)check(t?.scheduleUrl===e.timing&&bound(e.timing,t.scheduleDigest),`${s} schedule proof`);
  check(only(row.window,['policy','beforeDate','afterDate','association','capexCausalityEstablished','anchorAt'])&&windows[s]&&equal(row.window,windows[s]),`${s} event session`);
  expectedUrls.add(quoteUrl(s));
  try{
   const envelope=(symbol,pair)=>({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York',dataGranularity:'1d',instrumentType:symbol==='QQQ'?'ETF':'EQUITY'},timestamp:pair.map(p=>p.timestamp),indicators:{quote:[{close:pair.map(p=>p.rawClose),volume:pair.map(p=>p.volume)}],adjclose:[{adjclose:pair.map(p=>p.adjustedClose)}]}}]}});
   const p=row.prices;check(only(p,['policy','stock','qqq','stockReturnPct','qqqReturnPct','excessReturnPp','scoringEligible'])&&p.stock.length===2&&p.qqq.length===2&&[...p.stock,...p.qqq].every(r=>only(r,['date','rawClose','adjustedClose','volume','timestamp'])),`${s} derived-only price fields`);
   const replay=matchedPrices(envelope(s,p.stock),envelope('QQQ',p.qqq),windows[s],s);
   check(equal(replay,p),`${s} price replay differs`);
  }catch{check(false,`${s} price pair invalid`);}
 }
 // Benchmark pairs differ across event dates; compare only overlapping dates.
 const benchmark=new Map();for(const row of rows)for(const p of row.prices?.qqq||[]){if(benchmark.has(p.date))check(equal(benchmark.get(p.date),p),'capex benchmark observation conflict');else benchmark.set(p.date,p);}
 check(expectedUrls.size===19&&requests.every(r=>expectedUrls.has(r.url)),'capex source URL mismatch');
 const decision=quarterlyPanelDecision(rows);check(equal(decision,panel.decision),'capex decision differs');
 return {ok:errors.length===0,errors,decision:errors.length?{status:'unknown'}:decision};
}
