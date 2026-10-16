// Latest-quarter association, not first disclosure or capex causality (ADR-0072).
import {createHash} from 'node:crypto';
import {htmlToText} from './public-html-parsers.mjs';
import {cashEventWindow,realDate} from './capex-event-session.mjs';
import {matchedPrices} from './capex-event-collector.mjs';
export const QUARTERLY_CAPEX_POLICY='capex_latest_quarterly_call_association_v1';
export const QUARTERLY_CAPEX_LIMITATION='Quarterly earnings association only; secondary catalog/transcripts; no complete interim-guidance tape, first-disclosure claim or capex causality. Prices use latest-vintage adjusted historical daily closes.';
// Finite reviewed event admission: a new catalog quarter holds, never reuses July.
export const QUARTERLY_CAPEX_EVENTS=Object.freeze({
 MSFT:{id:'647770-q4-2026',quarter:'Q4 2026',date:'2026-07-29',callAt:'2026-07-29T21:30:00Z',
  primary:'https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4',
  timing:'https://news.microsoft.com/source/2026/07/08/microsoft-announces-quarterly-earnings-release-date-68/'},
 META:{id:'657318-q2-2026',quarter:'Q2 2026',date:'2026-07-29',callAt:'2026-07-29T20:30:00Z',
  primary:'https://www.prnewswire.com/news-releases/meta-reports-second-quarter-2026-results-302838214.html'},
 AMZN:{id:'657334-q2-2026',quarter:'Q2 2026',date:'2026-07-30',callAt:'2026-07-30T21:00:00Z',
  primary:'https://www.aboutamazon.com/news/company-news/amazon-earnings-q2-2026-report',
  timing:'https://press.aboutamazon.com/2026/7/amazon-com-to-webcast-second-quarter-2026-financial-results-conference-call'},
 GOOGL:{id:'657320-q2-2026',quarter:'Q2 2026',date:'2026-07-22',callAt:'2026-07-22T20:30:00Z',
  primary:'https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q2-2026/'}
});
for(const event of Object.values(QUARTERLY_CAPEX_EVENTS))Object.freeze(event);
const fail=(ok,reason)=>{if(!ok)throw Error(reason);};
const digest=s=>createHash('sha256').update(s).digest('hex');
const text=h=>htmlToText(h).replace(/\s+/gu,' ').trim();
const reviewedGuidance={MSFT:{status:'economic_investment_unchanged',reportedCurrent:[175,175],current:null,previous:null},
 META:{status:'lower_bound_raised',current:[130,145],previous:[125,145]},
 AMZN:{status:'raised',current:[220,220],previous:[200,200]},GOOGL:{status:'raised',current:[195,205],previous:[180,190]}};
export function reviewedQuarterlyGuidance(symbol){
 fail(Object.hasOwn(reviewedGuidance,symbol),'company_not_admitted');
 return {...structuredClone(reviewedGuidance[symbol]),year:2026,currency:'USD',unit:'billion',periodBasis:'calendar_year',basis:{MSFT:'lease_reclassification',META:'includes_finance_lease_principal',AMZN:'cash_capex',GOOGL:'issuer_reported_annual_capex'}[symbol]};
}
export function latestQuarter(html,symbol){
 fail(Object.hasOwn(QUARTERLY_CAPEX_EVENTS,symbol),'company_not_admitted');
 const prefix=`/stocks/${symbol.toLowerCase()}/transcripts/`;
 const links=[...html.matchAll(/href="([^"]*\/transcripts\/\d+-q[1-4]-\d{4}\/)"/gu)].map(m=>m[1]);
 fail(links.length>0&&links.every(u=>u.startsWith(prefix)),'quarter_catalog_unusable');
 const candidates=[...new Set(links)].map(link=>{const id=link.slice(prefix.length,-1),m=/^\d+-q([1-4])-(\d{4})$/u.exec(id);fail(m,'quarter_catalog_unusable');return {id,q:Number(m[1]),year:Number(m[2])};});
 const maximum=Math.max(...candidates.map(c=>c.year*4+c.q)),latest=candidates.filter(c=>c.year*4+c.q===maximum);
 fail(latest.length===1,'quarter_catalog_ambiguous');
 const {id,q,year}=latest[0];
 const expected=QUARTERLY_CAPEX_EVENTS[symbol];
 fail(id===expected.id,'latest_quarter_not_reviewed');
 return {id,quarter:`Q${q} ${year}`,scope:'latest_published_quarter_in_stockanalysis_catalog',sourceDigest:digest(html)};
}
function one(t,re){const matches=[...t.matchAll(re)];fail(matches.length===1,'guidance_clause_ambiguous');return matches[0];}
export function quarterlyGuidance(html,symbol){
 const e=QUARTERLY_CAPEX_EVENTS[symbol];fail(e,'company_not_admitted');
 fail(html.includes(`eventDate:"${e.date}"`)&&html.includes(`eventTitle:"${e.quarter}"`),'transcript_event_mismatch');
 const t=text(html);fail(t.includes(`(${symbol})`)&&t.includes(`Earnings Call: ${e.quarter}`),'transcript_issuer_mismatch');
 let m,result;
 if(symbol==='MSFT'){
  m=one(t,/Outside of this useful life impact, our calendar year (20\d{2}) CapEx investment expectations remain unchanged\. However, the shift from finance to operating leases adjusts our expectation to approximately \$([\d.]+) billion/giu);
  fail(/Finance leases are included in capital expenditures,? while operating leases are not/iu.test(t),'lease_reclassification_unexplained');
  result={status:'economic_investment_unchanged',year:Number(m[1]),basis:'lease_reclassification',reportedCurrent:[Number(m[2]),Number(m[2])],previous:null,current:null};
 }else if(symbol==='META'){
  m=one(t,/We anticipate (20\d{2}) capital expenditures, including principal payments on finance leases, to be in the range of \$([\d.]+) billion-\$\s*([\d.]+) billion, narrowed from our prior outlook of \$([\d.]+) billion-\$\s*([\d.]+) billion/giu);
  result={year:Number(m[1]),basis:'includes_finance_lease_principal',current:[Number(m[2]),Number(m[3])],previous:[Number(m[4]),Number(m[5])]};
 }else if(symbol==='AMZN'){
  m=one(t,/We now believe we will spend approximately \$([\d.]+) billion in cash CapEx in (20\d{2})\. The higher cost of memory (?:is )?pushing this number up from our prior estimate of about \$([\d.]+) billion/giu);
  result={year:Number(m[2]),basis:'cash_capex',current:[Number(m[1]),Number(m[1])],previous:[Number(m[3]),Number(m[3])]};
 }else{
  m=one(t,/we are updating our full-year (20\d{2}) CapEx guidance range to \$([\d.]+) billion-\$([\d.]+) billion, up from our previous estimate of \$([\d.]+) billion-\$([\d.]+) billion/giu);
  result={year:Number(m[1]),basis:'issuer_reported_annual_capex',current:[Number(m[2]),Number(m[3])],previous:[Number(m[4]),Number(m[5])]};
 }
 fail(result.year===2026,'guidance_year_not_reviewed');
 if(result.current){
  fail([...result.current,...result.previous].every(v=>Number.isFinite(v)&&v>0)&&result.current[0]<=result.current[1]&&result.previous[0]<=result.previous[1],'guidance_range_invalid');
  const [a,b]=result.previous,[c,d]=result.current;
  result.status=c>=a&&d>=b&&(c>a||d>b)?(c>a&&d===b?'lower_bound_raised':'raised'):c===a&&d===b?'unchanged':'lowered_or_mixed';
 }
 // A corrected same-quarter transcript is a material change requiring review;
 // it cannot silently alter the finite event admission or prior guidance basis.
 fail(Object.entries(reviewedGuidance[symbol]).every(([k,v])=>JSON.stringify(result[k])===JSON.stringify(v)),'reviewed_guidance_changed');
 return {...result,currency:'USD',unit:'billion',periodBasis:'calendar_year',clauseDigest:digest(m[0]),documentDigest:digest(html),sourceRole:'secondary_attributed_call_transcript'};
}
export function quarterlyTiming(primary,timing,symbol){
 const e=QUARTERLY_CAPEX_EVENTS[symbol],p=text(primary),s=text(timing||primary);
 if(symbol==='MSFT'){
  fail(p.includes('Wednesday, July 29, 2026')&&/calendar year 2026 CapEx investment expectations remain unchanged/iu.test(p)&&/approximately \$175 billion/iu.test(p),'official_guidance_conflict');
  fail(/after the close of the market on Wednesday, July 29, 2026/iu.test(s)&&/2:30 p\.m\. Pacific Time/iu.test(s),'official_call_time_unverified');
 }else if(symbol==='META'){
  fail(/Meta Reports Second Quarter 2026 Results/iu.test(p)&&/2026 capital expenditures, including principal payments on finance leases.{0,90}\$130-145 billion.{0,70}\$125-145 billion/iu.test(p),'official_guidance_conflict');
  fail(/2026-07-29T16:01:00-04:00/u.test(primary)&&/1:30 p\.m\. PT|1:30 p\.m\. Pacific Time/iu.test(p),'official_call_time_unverified');
 }else if(symbol==='AMZN'){
  fail(/second quarter/iu.test(p)&&/expectations as of July 30, 2026/iu.test(p),'official_event_identity_unverified');
  fail(/Thursday, July 30, 2026, at 2:00 p\.m\. PT\/5:00 p\.m\. ET/iu.test(s),'official_call_time_unverified');
 }else{
  fail(/Q2 2026 earnings call/iu.test(p)&&/Sundar Pichai/iu.test(p)&&/2026-07-22T20:45:00\+00:00/u.test(primary),'official_event_identity_unverified');
  // Official CEO remarks published during the same after-close call window;
  // this timestamp is not represented as the first disclosure of CFO guidance.
 }
 return {eventDate:e.date,anchorAt:symbol==='GOOGL'?'2026-07-22T20:45:00Z':e.callAt,
  anchorKind:symbol==='GOOGL'?'official_call_remarks_publication':'official_scheduled_quarterly_call',
  primaryDigest:digest(primary),...(timing?{scheduleDigest:digest(timing)}:{}),firstGuidanceDisclosureVerified:false,capexCausalityEstablished:false};
}
export function quarterlyPriceReaction(prices){
 // Compare the source JSON numbers' decimal representations as rational values;
 // 100->105 is exactly +5pp, even when a binary float return is 5.000000000004.
 const fraction=v=>{fail(typeof v==='number'&&Number.isFinite(v)&&v>0,'price_pair_unqualified');const m=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u.exec(String(v));fail(m,'price_pair_unqualified');const scale=(m[2]||'').length-Number(m[3]||0),n=BigInt(m[1]+(m[2]||''));return scale>=0?{n,d:10n**BigInt(scale)}:{n:n*10n**BigInt(-scale),d:1n};};
 const growth=pair=>{fail(Array.isArray(pair)&&pair.length===2,'price_pair_unqualified');const a=fraction(pair[1].adjustedClose),b=fraction(pair[0].adjustedClose);return {n:a.n*b.d,d:a.d*b.n};};
 const a=growth(prices.stock),b=growth(prices.qqq),n=100n*(a.n*b.d-b.n*a.d),d=a.d*b.d;
 return {punished:a.n<a.d&&n < -5n*d,rewarded:a.n>a.d&&n>5n*d};
}
export function quarterlyPanelDecision(rows){
 const ids=Object.keys(QUARTERLY_CAPEX_EVENTS);
 if(!Array.isArray(rows)||rows.length!==4||new Set(rows.map(r=>r.symbol)).size!==4||!ids.every(id=>rows.some(r=>r.symbol===id&&r.status==='qualified'&&r.guidance&&r.window&&r.prices)))return {status:'unknown',raisedCount:0,punishedCount:0,rewardedCount:0};
 const raised=rows.filter(r=>['raised','lower_bound_raised'].includes(r.guidance.status));
 if(!raised.length)return {status:'unknown',raisedCount:0,punishedCount:0,rewardedCount:0};
 let reactions;try{reactions=raised.map(r=>quarterlyPriceReaction(r.prices));}catch{return {status:'unknown',raisedCount:0,punishedCount:0,rewardedCount:0};}
 const punished=reactions.filter(r=>r.punished).length,rewarded=reactions.filter(r=>r.rewarded).length;
 return {status:punished>=3?'red':punished>0?'yellow':raised.length>=2&&rewarded===raised.length?'green':'yellow',raisedCount:raised.length,punishedCount:punished,rewardedCount:rewarded};
}
export async function collectQuarterlyCapexPanel({allowNetwork=false,today=new Date().toISOString().slice(0,10),now=()=>Date.now(),fetchFn=globalThis.fetch}={}){
 fail(realDate(today),'invalid_collection_day');
 const requests=[],sourceFailures=[],circuits=new Set();let bytes=0,exhausted=false;
 const get=async(url,kind='html')=>{
  const u=new URL(url);fail(['stockanalysis.com','www.microsoft.com','news.microsoft.com','www.prnewswire.com','www.aboutamazon.com','press.aboutamazon.com','blog.google','query1.finance.yahoo.com'].includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password,'source_not_allowed');
  fail(!exhausted&&requests.length<20,'request_budget_exhausted');fail(!circuits.has(u.hostname),'source_host_circuit_not_requested');
  const req={url,checkedAt:new Date(now()).toISOString()};requests.push(req);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const r=await fetchFn(url,{redirect:'error',signal:controller.signal,headers:{Accept:kind==='json'?'application/json':'text/html','User-Agent':'gfrr-auto-update-site quarterly-capex ctmaomao@users.noreply.github.com'}});
   if(!r.ok){if([401,403,429].includes(r.status))circuits.add(u.hostname);throw Error(`http_${r.status}`);}
   fail((kind==='json'?/json/iu:/html/iu).test(r.headers.get('content-type')||''),'response_type');
   const reader=r.body?.getReader();fail(reader,'response_body');const chunks=[];let n=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;bytes+=value.byteLength;if(bytes>12*1024*1024)exhausted=true;fail(n<=2*1024*1024&&!exhausted,'body_budget');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
   const h=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));req.status='ok';req.bytes=n;req.sha256=digest(h);return kind==='json'?JSON.parse(h):h;
  }catch(e){req.status='failed';req.reason=/^http_\d{3}$/u.test(e.message)?e.message:e.name==='AbortError'?'timeout':'response_unusable';sourceFailures.push({url,reason:req.reason});throw Error('source_failed');}finally{clearTimeout(timer);controller.abort();}
 };
 const companies=[];
 for(const [symbol,e]of Object.entries(QUARTERLY_CAPEX_EVENTS)){
  const row={symbol,status:'unknown',gaps:[]};companies.push(row);
  if(!allowNetwork){row.gaps.push('network_not_enabled');continue;}
  try{
   const age=(Date.parse(today+'T00:00:00Z')-Date.parse(e.date+'T00:00:00Z'))/86400000;
   fail(age>=0&&age<=120,'quarter_event_expired');
   const listingUrl=`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/transcripts/`,listing=await get(listingUrl);
   row.catalog={...latestQuarter(listing,symbol),sourceUrl:listingUrl};
   const transcriptUrl=listingUrl+row.catalog.id+'/',body=await get(transcriptUrl);
   row.guidance={...quarterlyGuidance(body,symbol),sourceUrl:transcriptUrl};
   const primary=await get(e.primary),schedule=e.timing?await get(e.timing):null;
   row.timing={...quarterlyTiming(primary,schedule,symbol),primaryUrl:e.primary,...(e.timing?{scheduleUrl:e.timing}:{})};
   row.window=cashEventWindow(row.timing.anchorAt,new Date(now()).toISOString());
   delete row.window.originalPublishedAt;
   row.window.anchorAt=row.timing.anchorAt;row.window.association='latest_quarterly_earnings_call';row.status='material_qualified';
  }catch(e){row.gaps.push(/^[a-z_]+$/u.test(e.message)?e.message:'source_material_unusable');}
 }
 // One common QQQ response, matched independently to each of the four pairs.
 if(companies.some(r=>r.status==='material_qualified')){
  const dates=companies.filter(r=>r.window).flatMap(r=>[r.window.beforeDate,r.window.afterDate]).sort();
  const start=Date.parse(dates[0]+'T00:00:00Z')/1000,end=Date.parse(dates.at(-1)+'T00:00:00Z')/1000+2*86400;
  const quote=s=>get(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?period1=${start}&period2=${end}&interval=1d&events=div%2Csplits`,'json');
  let qqq;try{qqq=await quote('QQQ');}catch{}
  for(const row of companies.filter(r=>r.status==='material_qualified')){
   try{fail(qqq,'benchmark_unavailable');row.prices=matchedPrices(await quote(row.symbol),qqq,row.window,row.symbol);row.status='qualified';}catch(e){row.status='unknown';row.gaps.push(/^[a-z_]+$/u.test(e.message)?e.message:'price_pair_unqualified');}
  }
 }
 return {schemaVersion:'bubble-quarterly-capex-panel-v1',policy:QUARTERLY_CAPEX_POLICY,asOfDate:today,checkedAt:new Date(now()).toISOString(),companies,decision:quarterlyPanelDecision(companies),requests,sourceFailures,
  scope:'reviewed_latest_quarterly_call_fixed_four',firstGuidanceDiscoveryComplete:false,scoringEligible:false,productionEligible:false,
  budget:{actualRequests:requests.length,maximumRequests:20,responseMaxBytes:2*1024*1024,totalMaxBytes:12*1024*1024,totalBytes:bytes,totalBudgetExhausted:exhausted,requestTimeoutMs:12000,applicationRetries:0,redirects:'error'},
  limitation:QUARTERLY_CAPEX_LIMITATION};
}
