// Finite October 2026 source admission; legacy July collection remains separate.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {htmlToText} from './public-html-parsers.mjs';
import {cashEventWindow,realDate} from './capex-event-session.mjs';
import {matchedPrices} from './capex-event-collector.mjs';
import {quarterlyPanelDecision,QUARTERLY_CAPEX_POLICY,QUARTERLY_CAPEX_LIMITATION} from './capex-quarterly-panel.mjs';

export const OCTOBER_CAPEX_SCHEMA='bubble-quarterly-capex-panel-v2';
export const OCTOBER_CAPEX_REGISTRY='2026-10-reviewed';
export const OCTOBER_CAPEX_EVENTS=Object.freeze({
 MSFT:Object.freeze({id:'718712-q1-2027',quarter:'Q1 2027',date:'2026-10-28',anchorAt:'2026-10-28T21:30:00Z',
  primary:'https://www.microsoft.com/en-us/investor/events/fy-2027/earnings-fy-2027-q1',
  timing:'https://news.microsoft.com/source/2026/10/07/microsoft-announces-quarterly-earnings-release-date-69/',
  comparison:'https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4'}),
 META:Object.freeze({id:'718643-q3-2026',quarter:'Q3 2026',date:'2026-10-21',anchorAt:'2026-10-21T20:30:00Z',
  primary:'https://www.prnewswire.com/news-releases/meta-reports-third-quarter-2026-results-302915964.html'}),
 AMZN:Object.freeze({id:'720308-q3-2026',quarter:'Q3 2026',date:'2026-10-29',anchorAt:'2026-10-29T21:00:00Z',
  primary:'https://www.aboutamazon.com/news/company-news/amazon-earnings-q3-2026-report',
  timing:'https://press.aboutamazon.com/2026/10/amazon-com-to-webcast-third-quarter-2026-financial-results-conference-call'}),
 GOOGL:Object.freeze({id:'712854-q3-2026',quarter:'Q3 2026',date:'2026-10-28',anchorAt:'2026-10-28T21:05:00Z',
  primary:'https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q3-2026/'})
});
const sha=s=>createHash('sha256').update(s).digest('hex');
const plain=h=>htmlToText(h).replace(/\s+/gu,' ').trim();
const requireFact=(ok,why)=>{if(!ok)throw Error(why);};
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const one=(s,re)=>{const rows=[...s.matchAll(re)];requireFact(rows.length===1,'guidance_clause_ambiguous');return rows[0];};
const checkedGuidance=Object.freeze({
 MSFT:{status:'lowered_or_mixed',current:[170,170],previous:[175,175],basis:'issuer_reported_annual_capex_after_lease_reclassification'},
 META:{status:'lower_bound_raised',current:[135,145],previous:[130,145],basis:'includes_finance_lease_principal'},
 AMZN:{status:'unchanged',current:[220,220],previous:[220,220],basis:'cash_capex'},
 GOOGL:{status:'unchanged',current:[195,205],previous:[195,205],basis:'issuer_reported_annual_capex'}
});
export function octoberGuidanceFacts(symbol){
 requireFact(Object.hasOwn(checkedGuidance,symbol),'company_not_admitted');
 return {...structuredClone(checkedGuidance[symbol]),year:2026,currency:'USD',unit:'billion',periodBasis:'calendar_year'};
}
export function latestOctoberQuarter(html,symbol){
 const event=OCTOBER_CAPEX_EVENTS[symbol];requireFact(event,'company_not_admitted');
 const prefix=`/stocks/${symbol.toLowerCase()}/transcripts/`;
 // Catalogs also contain conferences/AGMs: those are outside the quarterly
 // association contract. A quarter-shaped URL or earnings-call label must parse;
 // it cannot be skipped merely because a newer quarter has an unfamiliar ID.
 const links=[...html.matchAll(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gu)]
  .map(m=>({link:m[1]||m[2],label:plain(m[3])}))
  .filter(({link,label})=>link.includes('/transcripts/')&&(/-q[^/]*-\d{4}/iu.test(link)||/Earnings Call:/iu.test(label)))
  .map(({link})=>link);
 requireFact(links.length&&links.every(link=>link.startsWith(prefix)),'quarter_catalog_unusable');
 const candidates=[...new Set(links)].map(link=>{const id=link.slice(prefix.length,-1),m=/^\d+-q([1-4])-(\d{4})$/u.exec(id);requireFact(m,'quarter_catalog_unusable');return {id,rank:Number(m[2])*4+Number(m[1])};});
 const maximum=Math.max(...candidates.map(row=>row.rank)),latest=candidates.filter(row=>row.rank===maximum);
 requireFact(latest.length===1,'quarter_catalog_ambiguous');requireFact(latest[0].id===event.id,'latest_quarter_not_reviewed');
 return {id:event.id,quarter:event.quarter,scope:'latest_published_quarter_in_stockanalysis_catalog',sourceDigest:sha(html)};
}
export function octoberGuidance(html,symbol){
 const event=OCTOBER_CAPEX_EVENTS[symbol];requireFact(event,'company_not_admitted');
 requireFact(html.includes(`eventDate:"${event.date}"`)&&html.includes(`eventTitle:"${event.quarter}"`),'transcript_event_mismatch');
 const text=plain(html);requireFact(text.includes(`(${symbol})`)&&text.includes(`Earnings Call: ${event.quarter}`),'transcript_issuer_mismatch');
 let clause,current,previous;
 if(symbol==='MSFT'){
  clause=one(text,/for the calendar year, spend should be approximately \$([\d.]+) billion due to the 3P capacity delays noted earlier/giu);
  requireFact(/recognize the full principal value of finance leases in capex at the time of lease commencement/iu.test(text),'lease_basis_unverified');
  current=[Number(clause[1]),Number(clause[1])];previous=[175,175];
 }else if(symbol==='META'){
  clause=one(text,/We anticipate (20\d{2}) capital expenditures, including principal payments on finance leases, to be in the range of \$([\d.]+) billion-\$\s*([\d.]+) billion, narrowed from our prior outlook of \$([\d.]+) billion-\$\s*([\d.]+) billion/giu);
  requireFact(clause[1]==='2026','guidance_year_not_reviewed');current=[Number(clause[2]),Number(clause[3])];previous=[Number(clause[4]),Number(clause[5])];
 }else if(symbol==='AMZN'){
  clause=one(text,/We still expect (20\d{2}) cash CapEx of approximately \$([\d.]+) billion/giu);
  requireFact(clause[1]==='2026','guidance_year_not_reviewed');current=[Number(clause[2]),Number(clause[2])];previous=[...current];
 }else{
  clause=one(text,/our full[- ]year (20\d{2}) CapEx guidance range of \$([\d.]+) billion to \$([\d.]+) billion remain unchanged/giu);
  requireFact(clause[1]==='2026','guidance_year_not_reviewed');current=[Number(clause[2]),Number(clause[3])];previous=[...current];
 }
 const expected=octoberGuidanceFacts(symbol);
 requireFact(equal(current,expected.current)&&equal(previous,expected.previous),'reviewed_guidance_changed');
 return {...expected,clauseDigest:sha(clause[0]),documentDigest:sha(html),sourceRole:'secondary_attributed_call_transcript'};
}
function publicationAt(html){
 const values=[...new Set([...html.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gu)].map(m=>m[1]))];
 requireFact(values.length===1&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/u.test(values[0])&&Number.isFinite(Date.parse(values[0])),'official_publication_time_unverified');
 return Date.parse(values[0]);
}
export function octoberTiming(primary,schedule,comparison,symbol){
 const event=OCTOBER_CAPEX_EVENTS[symbol],p=plain(primary),s=plain(schedule||primary);
 requireFact(event,'company_not_admitted');
 if(symbol==='MSFT'){
  requireFact(/Wednesday, October 28, 2026/iu.test(p)&&/for the calendar year, spend should be approximately \$170 billion due to the 3P capacity delays/iu.test(p)
   &&/recognize the full principal value of finance leases in capex at the time of lease commencement/iu.test(p),'official_guidance_conflict');
  requireFact(/after the close of the market on Wednesday, (?:October|Oct\.) 28, 2026/iu.test(s)&&/2:30 p\.m\. Pacific Time/iu.test(s),'official_call_time_unverified');
  const prior=plain(comparison||'');
  requireFact(/Wednesday, July 29, 2026/iu.test(prior)&&/calendar year 2026 CapEx investment expectations remain unchanged/iu.test(prior)
   &&/shift from finance to operating leases adjusts our expectation to approximately \$175 billion/iu.test(prior)
   &&/Finance leases are included in capital expenditures,? while operating leases are not/iu.test(prior),'prior_comparable_guidance_unverified');
 }else if(symbol==='META'){
  requireFact(/Meta Reports Third Quarter 2026 Results/iu.test(p)&&/2026 capital expenditures, including principal payments on finance leases.{0,90}\$135-145 billion.{0,70}\$130-145 billion/iu.test(p),'official_guidance_conflict');
  requireFact(publicationAt(primary)===Date.parse('2026-10-21T20:01:00Z')&&/1:30 p\.m\. PT|1:30 p\.m\. Pacific Time/iu.test(p),'official_call_time_unverified');
 }else if(symbol==='AMZN'){
  requireFact(/third quarter/iu.test(p)&&/expectations as of October 29, 2026/iu.test(p)&&/continue to expect 2026 cash capital expenditures to be approximately \$220 billion/iu.test(p),'official_guidance_conflict');
  requireFact(/Thursday, October 29, 2026, at 2:00 p\.m\. PT\/5:00 p\.m\. ET/iu.test(s),'official_call_time_unverified');
 }else{
  requireFact(/Q3 2026 earnings call/iu.test(p)&&/Sundar Pichai/iu.test(p)&&publicationAt(primary)===Date.parse(event.anchorAt),'official_event_identity_unverified');
 }
 return {eventDate:event.date,anchorAt:event.anchorAt,anchorKind:symbol==='GOOGL'?'official_call_remarks_publication':'official_scheduled_quarterly_call',
  primaryDigest:sha(primary),...(event.timing?{scheduleDigest:sha(schedule)}:{}),...(event.comparison?{comparisonDigest:sha(comparison)}:{}),
  firstGuidanceDisclosureVerified:false,capexCausalityEstablished:false};
}
export async function collectOctoberCapexPanel({allowNetwork=false,today=new Date().toISOString().slice(0,10),now=()=>Date.now(),fetchFn=globalThis.fetch}={}){
 requireFact(realDate(today),'invalid_collection_day');
 const requests=[],sourceFailures=[],circuits=new Set();let bytes=0,exhausted=false;
 const get=async(url,kind='html')=>{
  const u=new URL(url);requireFact(['stockanalysis.com','www.microsoft.com','news.microsoft.com','www.prnewswire.com','www.aboutamazon.com','press.aboutamazon.com','blog.google','query1.finance.yahoo.com'].includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password,'source_not_allowed');
  requireFact(!exhausted&&requests.length<20,'request_budget_exhausted');requireFact(!circuits.has(u.hostname),'source_host_circuit_not_requested');
  const req={url,checkedAt:new Date(now()).toISOString()};requests.push(req);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const r=await fetchFn(url,{redirect:'error',signal:controller.signal,headers:{Accept:kind==='json'?'application/json':'text/html','User-Agent':'GFRR quarterly public evidence collector'}});
   if(!r.ok){if([401,403,429].includes(r.status))circuits.add(u.hostname);throw Error(`http_${r.status}`);}
   requireFact((kind==='json'?/json/iu:/html/iu).test(r.headers.get('content-type')||''),'response_type');
   const reader=r.body?.getReader();requireFact(reader,'response_body');const chunks=[];let n=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;bytes+=value.byteLength;if(bytes>12*1024*1024)exhausted=true;requireFact(n<=2*1024*1024&&!exhausted,'body_budget');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
   const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));const parsed=kind==='json'?JSON.parse(text):text;
   req.status='ok';req.bytes=n;req.sha256=sha(text);return parsed;
  }catch(e){req.status='failed';req.reason=/^http_\d{3}$/u.test(e.message)?e.message:e.name==='AbortError'?'timeout':'response_unusable';sourceFailures.push({url,reason:req.reason});throw Error('source_failed');}finally{clearTimeout(timer);controller.abort();}
 };
 const companies=[];
 for(const [symbol,event]of Object.entries(OCTOBER_CAPEX_EVENTS)){
  const row={symbol,status:'unknown',gaps:[]};companies.push(row);if(!allowNetwork){row.gaps.push('network_not_enabled');continue;}
  try{
   const age=(Date.parse(today+'T00:00:00Z')-Date.parse(event.date+'T00:00:00Z'))/86400000;requireFact(age>=0&&age<=120,'quarter_event_expired');
   const sourceUrl=`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/transcripts/`;
   row.catalog={...latestOctoberQuarter(await get(sourceUrl),symbol),sourceUrl};
   const transcriptUrl=sourceUrl+event.id+'/';row.guidance={...octoberGuidance(await get(transcriptUrl),symbol),sourceUrl:transcriptUrl};
   const primary=await get(event.primary),schedule=event.timing?await get(event.timing):null,comparison=event.comparison?await get(event.comparison):null;
   row.timing={...octoberTiming(primary,schedule,comparison,symbol),primaryUrl:event.primary,...(event.timing?{scheduleUrl:event.timing}:{}),...(event.comparison?{comparisonUrl:event.comparison}:{})};
   row.window=cashEventWindow(row.timing.anchorAt,new Date(now()).toISOString());delete row.window.originalPublishedAt;
   row.window.anchorAt=row.timing.anchorAt;row.window.association='latest_quarterly_earnings_call';row.status='material_qualified';
  }catch(e){row.gaps.push(/^[a-z_]+$/u.test(e.message)?e.message:'source_material_unusable');}
 }
 if(companies.some(row=>row.status==='material_qualified')){
  const days=companies.filter(row=>row.window).flatMap(row=>[row.window.beforeDate,row.window.afterDate]).sort();
  const start=Date.parse(days[0]+'T00:00:00Z')/1000,end=Date.parse(days.at(-1)+'T00:00:00Z')/1000+2*86400;
  const quote=symbol=>get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=1d&events=div%2Csplits`,'json');
  let qqq;try{qqq=await quote('QQQ');}catch{}
  for(const row of companies.filter(item=>item.status==='material_qualified'))try{
   requireFact(qqq,'benchmark_unavailable');row.prices=matchedPrices(await quote(row.symbol),qqq,row.window,row.symbol);row.status='qualified';
  }catch(e){row.status='unknown';row.gaps.push(/^[a-z_]+$/u.test(e.message)?e.message:'price_pair_unqualified');}
 }
 return {schemaVersion:OCTOBER_CAPEX_SCHEMA,registryId:OCTOBER_CAPEX_REGISTRY,policy:QUARTERLY_CAPEX_POLICY,asOfDate:today,checkedAt:new Date(now()).toISOString(),companies,decision:quarterlyPanelDecision(companies),requests,sourceFailures,
  scope:'reviewed_latest_quarterly_call_fixed_four',firstGuidanceDiscoveryComplete:false,scoringEligible:false,productionEligible:false,
  budget:{actualRequests:requests.length,maximumRequests:20,responseMaxBytes:2*1024*1024,totalMaxBytes:12*1024*1024,totalBytes:bytes,totalBudgetExhausted:exhausted,requestTimeoutMs:12000,applicationRetries:0,redirects:'error'},limitation:QUARTERLY_CAPEX_LIMITATION};
}
