// Diagnostic collection only. This module cannot activate the r3 scoring hold.
import {createHash}from'node:crypto';
import {htmlToText}from'./public-html-parsers.mjs';
import {cashEventWindow,realDate,nyClock}from'./capex-event-session.mjs';
export const CAPEX_COMPANIES=Object.freeze({MSFT:'0000789019',META:'0001326801',AMZN:'0001018724',GOOGL:'0001652044'});
export const CAPEX_COLLECTION_POLICY='capex_sec_quarterly_release_diagnostic_v1';
const DAY=86400000,MAX_BYTES=3*1024*1024,MAX_TOTAL=18*1024*1024;
const assert=(ok,why)=>{if(!ok)throw Error(why);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const dayMs=d=>Date.parse(d+'T00:00:00Z');
const oldDate=(today,n)=>new Date(dayMs(today)-n*DAY).toISOString().slice(0,10);
const gaps=new Set(['enumeration_incomplete','quarter_history_missing','earnings_8k_not_identified','ambiguous_earnings_exhibit','earnings_period_not_confirmed','original_publication_time_missing','publication_time_future','publication_time_invalid','calendar_year_not_reviewed','early_close_event_not_supported','intraday_or_close_boundary_not_supported','first_session_early_close_not_supported','baseline_session_early_close_not_supported','event_session_not_isolated','guidance_not_comparable','guidance_first_disclosure_not_verified','price_pair_unqualified','latest_report_amended','newer_unmatched_earnings_filing']);
export function secRows(data,today){
 const keys=['accessionNumber','filingDate','reportDate','acceptanceDateTime','form','items','primaryDocument'];
 assert(data&&keys.every(k=>Array.isArray(data[k])),'submissions_schema');
 const size=data.accessionNumber.length;assert(size>0&&size<=12000&&keys.every(k=>data[k].length===size),'submissions_arrays');
 const seen=new Set();
 return data.accessionNumber.map((acc,i)=>{
  assert(/^\d{10}-\d{2}-\d{6}$/u.test(acc)&&!seen.has(acc),'submission_identity');seen.add(acc);
  assert(realDate(data.filingDate[i])&&data.filingDate[i]<=today,'submission_date');
  assert(typeof data.form[i]==='string'&&typeof data.items[i]==='string'&&typeof data.primaryDocument[i]==='string','submission_value');
  assert(!data.reportDate[i]||realDate(data.reportDate[i]),'submission_report_date');
  return Object.fromEntries(keys.map(k=>[k,data[k][i]]));
 });
}
export function selectQuarterReports(rows,today){
 const min=oldDate(today,200);
 const reports=rows.filter(r=>['10-Q','10-K'].includes(r.form)&&r.reportDate>=min&&r.reportDate<=today).sort((a,b)=>b.reportDate.localeCompare(a.reportDate)||b.filingDate.localeCompare(a.filingDate));
 const unique=reports.filter((r,i)=>reports.findIndex(x=>x.reportDate===r.reportDate)===i);
 assert(unique.length>=2,'quarter_history_missing');
 assert(!rows.some(r=>r.form==='8-K'&&r.items.split(/[,;\s]+/u).includes('2.02')&&r.filingDate>unique[0].filingDate),'newer_unmatched_earnings_filing');
 assert(!rows.some(r=>['10-Q/A','10-K/A'].includes(r.form)&&r.reportDate===unique[0].reportDate),'latest_report_amended');
 return unique.slice(0,2).map(q=>{
  const candidates=rows.filter(r=>r.form==='8-K'&&r.items.split(/[,;\s]+/u).includes('2.02')&&r.filingDate>=q.reportDate&&r.filingDate<=q.filingDate).sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.acceptanceDateTime.localeCompare(a.acceptanceDateTime));
  assert(candidates.length>0,'earnings_8k_not_identified');
  // Do not skip the latest candidate to find an older conveniently parseable release.
  return {report:q,earnings:candidates[0]};
 });
}
export function earningsExhibit(html){
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)].map(m=>m[0]).filter(s=>/Document Format Files/iu.test(s));
 assert(tables.length===1,'ambiguous_earnings_exhibit');
 const matches=[];
 for(const row of tables[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)){
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(m=>m[1]);
  if(cells.some(c=>htmlToText(c).trim()==='EX-99.1')){
   const hrefs=[...row[1].matchAll(/href=["']([^"']+)["']/giu)].map(m=>m[1]);
   for(const href of hrefs)if(/^[A-Za-z0-9_.-]+\.html?$/u.test(href))matches.push(href);
   // SEC tables may use a root-relative archive path. Keep only its filename;
   // the caller reconstructs and binds the CIK/accession directory independently.
   for(const href of hrefs)if(/^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.-]+\.html?$/u.test(href))matches.push(href);
  }
 }
 assert(matches.length===1,'ambiguous_earnings_exhibit');return matches[0];
}
function docText(html){return htmlToText(html).replace(/\s+/gu,' ').trim();}
export function parseRelease(html,period,today,{fiscalYearEnd=null}={}){
 assert(realDate(period)&&realDate(today),'earnings_period_not_confirmed');
 const text=docText(html),head=text.slice(0,3000);
 assert(/(?:quarter|fiscal).{0,100}(?:result|earnings)|(?:result|earnings).{0,100}quarter/iu.test(head),'earnings_period_not_confirmed');
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const m=months[Number(period.slice(5,7))-1],d=Number(period.slice(8)),y=period.slice(0,4);
 assert(new RegExp(`${m}\\s+${d}(?:,)?\\s+${y}`,'iu').test(text),'earnings_period_not_confirmed');
 const times=[...html.matchAll(/<meta\b(?=[^>]*(?:property|name)=["'](?:article:published_time|datePublished)["'])[^>]*content=["']([^"']+)["'][^>]*>/giu)].map(m=>m[1]);
 // Extract only publication metadata; never substitute SEC acceptance as release time.
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)){
  try{const json=JSON.parse(match[1]);const visit=o=>{if(!o||typeof o!=='object')return;if(['NewsArticle','Article','PressRelease'].includes(o['@type'])&&typeof o.datePublished==='string')times.push(o.datePublished);if(Array.isArray(o['@graph']))o['@graph'].forEach(visit);};(Array.isArray(json)?json:[json]).forEach(visit);}catch{}
 }
 const valid=[...new Set(times)];const publishedAt=valid.length===1?valid[0]:null;
 if(publishedAt)assert(Number.isFinite(Date.parse(publishedAt))&&publishedAt.slice(0,10)<=today,'publication_time_future');
 const paragraphs=[...html.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/giu)].map(m=>docText(m[1])).filter(s=>/(?:expect|anticipat|outlook|guidance|plan)/iu.test(s)&&/capital expenditures|capex/iu.test(s));
 const numeric=[];
 for(const paragraph of paragraphs){
 for(const p of paragraph.split(/(?<=[.!?;])\s+(?=[A-Z])/u)){
  // Bind the amount to one capex forecast clause, never a neighboring metric.
  if(!/(?:expect|anticipat|outlook|guidance|plan)/iu.test(p)||!/capital expenditures|capex/iu.test(p)||/revenue|earnings per share|net income|operating income|free cash flow/iu.test(p))continue;
  if(!/(?:capital expenditures|capex)[^$]{0,180}\$/iu.test(p))continue;
  const year=p.match(/(?:calendar\s+year|fiscal\s+year|CY|FY)?\s*(20\d{2})/iu)?.[1];
  const scope=/fiscal\s+year|FY\s*20\d{2}/iu.test(p)?'fiscal':/calendar\s+year|CY\s*20\d{2}/iu.test(p)?'calendar':fiscalYearEnd==='1231'?'issuer_calendar_fiscal_year':null;
  const amounts=[...p.matchAll(/\$\s*(\d+(?:\.\d+)?)\s*(?:[-–]\s*\$?\s*(\d+(?:\.\d+)?))?\s*billion/giu)];
  if(year&&scope&&amounts.length===1&&new Set(p.match(/20\d{2}/gu)).size===1&&[...p.matchAll(/capital expenditures|capex/giu)].length===1){const a=amounts[0];numeric.push({year:Number(year),periodBasis:scope,currency:'USD',unit:'billion',lower:Number(a[1]),upper:Number(a[2]||a[1]),leaseBasis:/including\s+principal payments\s+(?:on|for)\s+finance leases/iu.test(p)?'includes_finance_lease_principal':'not_explicit',basisChange:/reclassif|shift.{0,50}operating leases|useful life/iu.test(p),evidenceDigest:hash(p)});}
 }
 }
 return {periodEnd:period,documentDigest:hash(html),publishedAt,guidance:numeric.length===1?numeric[0]:null,
  guidanceCandidateCount:numeric.length,scope:'quarterly_release_only',guidanceDiscoveryComplete:false};
}
export function compareGuidance(previous,current){
 const keys=['year','periodBasis','currency','unit','leaseBasis'];
 if(!previous||!current||previous.basisChange||current.basisChange||previous.leaseBasis==='not_explicit'||!keys.every(k=>previous[k]===current[k]))return {status:'unavailable',reason:'guidance_not_comparable'};
 if(![previous.lower,previous.upper,current.lower,current.upper].every(v=>Number.isFinite(v)&&v>=0)||previous.lower>previous.upper||current.lower>current.upper)return {status:'unavailable',reason:'guidance_not_comparable'};
 const up=current.lower>=previous.lower&&current.upper>=previous.upper&&(current.lower>previous.lower||current.upper>previous.upper);
 return {status:up?'raised':current.lower===previous.lower&&current.upper===previous.upper?'unchanged':'lowered_or_mixed',previous,current,scoringEligible:false};
}
export function matchedPrices(stock,qqq,window,symbol){
 const parse=(json,wanted)=>{
  const r=json?.chart?.result;assert(Array.isArray(r)&&r.length===1,'price_pair_unqualified');const x=r[0],q=x.indicators?.quote?.[0],adjusted=x.indicators?.adjclose?.[0]?.adjclose;
  assert(x.meta?.symbol===wanted&&x.meta.exchangeTimezoneName==='America/New_York'&&x.meta.dataGranularity==='1d'&&['EQUITY','ETF'].includes(x.meta.instrumentType),'price_pair_unqualified');
  assert(Array.isArray(x.timestamp)&&x.timestamp.length<=32&&Array.isArray(adjusted)&&Array.isArray(q?.close)&&Array.isArray(q?.volume)&&[adjusted,q.close,q.volume].every(a=>a.length===x.timestamp.length),'price_pair_unqualified');
  const rows=new Map();let prior=-1;
  x.timestamp.forEach((t,i)=>{assert(Number.isSafeInteger(t)&&t>prior,'price_pair_unqualified');prior=t;const day=nyClock(t*1000).date;assert(!rows.has(day),'price_pair_unqualified');rows.set(day,{date:day,rawClose:q.close[i],adjustedClose:adjusted[i],volume:q.volume[i],timestamp:t});});
  const selected=[window.beforeDate,window.afterDate].map(d=>rows.get(d));
  assert(selected.every(r=>r&&[r.rawClose,r.adjustedClose].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&Number.isSafeInteger(r.volume)&&r.volume>0),'price_pair_unqualified');return selected;
 };
 const a=parse(stock,symbol),b=parse(qqq,'QQQ'),returnPct=r=>(r[1].adjustedClose/r[0].adjustedClose-1)*100;
 return {policy:'yahoo_latest_vintage_adjusted_close_pair_v1',stock:a,qqq:b,stockReturnPct:returnPct(a),qqqReturnPct:returnPct(b),excessReturnPp:returnPct(a)-returnPct(b),scoringEligible:false};
}
export async function collectCapexEventPanel({allowNetwork=false,today=new Date().toISOString().slice(0,10),fetchFn=globalThis.fetch,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 assert(realDate(today),'invalid_collection_day');
 const requests=[],failures=[],circuits=new Set(),companies=[];let bytes=0,lastSec=-Infinity,totalBudgetExhausted=false;
 async function get(url,kind,symbol){
  const u=new URL(url);assert(['data.sec.gov','www.sec.gov','query1.finance.yahoo.com'].includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password,'source_not_allowed');
  if(totalBudgetExhausted||bytes>=MAX_TOTAL)throw Error('total_byte_budget_not_requested');
  if(circuits.has(u.hostname))throw Error('source_host_circuit_not_requested');
  if(requests.length>=36||requests.filter(r=>r.symbol===symbol).length>=9)throw Error('request_budget_exhausted');
  if(u.hostname.endsWith('sec.gov')){const pause=Math.max(0,300-(now()-lastSec));if(pause)await sleep(pause);lastSec=now();}
  const entry={symbol,url,checkedAt:new Date(now()).toISOString()};requests.push(entry);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const r=await fetchFn(url,{redirect:'error',signal:controller.signal,headers:{'User-Agent':'gfrr-auto-update-site capex ctmaomao@users.noreply.github.com',Accept:kind==='json'?'application/json':'text/html'}});
   if(!r.ok){if([401,403,429].includes(r.status))circuits.add(u.hostname);const e=Error('source_http');e.status=r.status;throw e;}
   assert((kind==='json'?/json/iu:/html/iu).test(r.headers.get('content-type')||''),'response_type');
   const length=Number(r.headers.get('content-length'));assert(!Number.isFinite(length)||length<=MAX_BYTES,'body_budget');
   const reader=r.body?.getReader();assert(reader,'response_body');const chunks=[];let count=0;
   try{while(true){const{value,done}=await reader.read();if(done)break;count+=value.byteLength;bytes+=value.byteLength;if(bytes>=MAX_TOTAL)totalBudgetExhausted=true;assert(count<=MAX_BYTES&&bytes<=MAX_TOTAL,'body_budget');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
   const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));entry.bytes=count;entry.sha256=hash(text);entry.status='ok';return kind==='json'?JSON.parse(text):text;
  }catch(e){entry.status='failed';entry.reason=e.status?`http_${e.status}`:e.name==='AbortError'?'timeout':'response_unusable';failures.push({symbol,url,reason:entry.reason});throw Error('source_failed');}
  finally{clearTimeout(timer);controller.abort();}
 }
 for(const[symbol,cik]of Object.entries(CAPEX_COMPANIES)){
  const row={symbol,cik,status:'not_requested',secFilingEnumerationComplete:false,latestSecReportConfirmed:false,reports:[],guidanceComparison:null,releaseWindow:null,prices:null,gaps:[],scoringEligible:false,productionEligible:false};companies.push(row);
  if(!allowNetwork){row.gaps.push('network_not_enabled');continue;}
  try{
   const sourceUrl=`https://data.sec.gov/submissions/CIK${cik}.json`,data=await get(sourceUrl,'json',symbol);
   assert(String(data.cik).padStart(10,'0')===cik&&Array.isArray(data.tickers)&&data.tickers.includes(symbol),'issuer_identity');
   let rows=secRows(data.filings?.recent,today);const cutoff=oldDate(today,370),shards=data.filings?.files;
   assert(Array.isArray(shards)&&shards.length<=100,'submissions_shards');
   const names=new Set();
   for(const f of shards){
    assert(new RegExp(`^CIK${cik}-submissions-\\d{3}\\.json$`,'u').test(f.name)&&!names.has(f.name)&&realDate(f.filingFrom)&&realDate(f.filingTo)&&f.filingFrom<=f.filingTo&&f.filingTo<=today&&Number.isSafeInteger(f.filingCount)&&f.filingCount>0,'submissions_shards');names.add(f.name);
   }
   // The official API declares historical partitions. Read every declared partition
   // intersecting the review horizon; do not infer completeness from day gaps.
   const needed=shards.filter(f=>f.filingTo>=cutoff).sort((a,b)=>b.filingTo.localeCompare(a.filingTo));
   assert(needed.length<=2,'enumeration_incomplete');
   const segments=[{kind:'recent',from:rows.map(r=>r.filingDate).sort()[0],through:rows.map(r=>r.filingDate).sort().at(-1),filings:rows.length}];
   for(const f of needed){
    const part=secRows(await get(`https://data.sec.gov/submissions/${f.name}`,'json',symbol),today);
    const dates=part.map(r=>r.filingDate).sort();
    assert(part.length===f.filingCount&&dates[0]===f.filingFrom&&dates.at(-1)===f.filingTo,'submissions_shards');
    segments.push({kind:'declared_historical_partition',name:f.name,from:f.filingFrom,through:f.filingTo,filings:part.length});rows.push(...part);
   }
   const minimum=rows.map(r=>r.filingDate).sort()[0];
   assert(minimum<=cutoff&&new Set(rows.map(r=>r.accessionNumber)).size===rows.length,'enumeration_incomplete');
   row.secFilingEnumerationComplete=true;row.coverage={from:minimum,through:today,requiredCutoff:cutoff,scope:'SEC_filed_reports_only',basis:'official_submissions_recent_and_all_declared_intersecting_partitions',allDeclaredRequiredShardsRead:true,segments,filings:rows.length,sourceUrl};
   const selected=selectQuarterReports(rows,today);row.latestSecReportConfirmed=true;row.status='partial';
   for(const q of selected){
    const acc=q.earnings.accessionNumber.replaceAll('-',''),base=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/`;
    const index=await get(`${base}${q.earnings.accessionNumber}-index.html`,'html',symbol),href=earningsExhibit(index);
    const url=href.startsWith('/')?`https://www.sec.gov${href}`:base+href;assert(url.startsWith(base),'attachment_owner_mismatch');
   const html=await get(url,'html',symbol),release=parseRelease(html,q.report.reportDate,today,{fiscalYearEnd:data.fiscalYearEnd});
    row.reports.push({reportPeriod:q.report.reportDate,form:q.report.form,reportAccession:q.report.accessionNumber,releaseAccession:q.earnings.accessionNumber,archiveAcceptedAt:q.earnings.acceptanceDateTime,sourceUrl:url,...release});
   }
   row.guidanceComparison=compareGuidance(row.reports[1].guidance,row.reports[0].guidance);
   if(row.guidanceComparison.status==='unavailable')row.gaps.push('guidance_not_comparable');
   // Filed releases do not enumerate calls, presentations or interim guidance.
   row.gaps.push('guidance_first_disclosure_not_verified');
   row.releaseWindow=cashEventWindow(row.reports[0].publishedAt,new Date(now()).toISOString());
   const start=Math.floor(dayMs(row.releaseWindow.beforeDate)/1000),end=Math.floor((dayMs(row.releaseWindow.afterDate)+2*DAY)/1000);
   const quote=s=>get(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?period1=${start}&period2=${end}&interval=1d&events=div%2Csplits`,'json',symbol);
   row.prices=matchedPrices(await quote(symbol),await quote('QQQ'),row.releaseWindow,symbol);
  }catch(e){row.gaps.push(gaps.has(e.message)?e.message:['source_failed','source_host_circuit_not_requested','request_budget_exhausted','total_byte_budget_not_requested'].includes(e.message)?e.message:'source_material_unusable');}
  if(row.gaps.length&&row.status==='not_requested'&&requests.some(r=>r.symbol===symbol))row.status='unavailable';
 }
 return {schemaVersion:'bubble-capex-event-panel-diagnostic-v1',policy:CAPEX_COLLECTION_POLICY,asOfDate:today,checkedAt:new Date(now()).toISOString(),
  scope:'latest_SEC_filed_quarterly_releases_only',companies,requests,sourceFailures:failures,
  budget:{actualRequests:requests.length,maximumRequests:36,maximumRequestsPerCompany:9,maximumHistoryShardsPerCompany:2,requestTimeoutMs:12000,minimumSecStartSpacingMs:300,responseMaxBytes:MAX_BYTES,totalMaxBytes:MAX_TOTAL,totalBytes:bytes,totalBudgetExhausted,applicationRetries:0,redirects:'error'},
  scoringEligible:false,productionEligible:false,limitation:'SEC releases do not prove completeness or first timing of guidance disclosed in calls, IR materials or interim updates; no capex light admitted.'};
}
