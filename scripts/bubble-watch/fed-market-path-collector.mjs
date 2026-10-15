// Free, bounded collector. No production writes, provider calls or retries.
import {FED_CALENDAR_URL,fedQuotePlan,fedFutureSymbol,normalizeFedDailyBar,qualifyFedMarketPath,realDay} from './qualified-fed-path.mjs';
import {parseReviewedFomcCalendar} from './fed-calendar-parser.mjs';
async function getText(url,kind,cap,fetchFn){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
 try{
  const r=await fetchFn(url,{signal:c.signal,redirect:'error',headers:{'User-Agent':'Mozilla/5.0 (GFRR historical evidence)','Accept':kind==='json'?'application/json':kind==='html'?'text/html':'text/csv'}});
  if(!r.ok){const e=Error('source_http');e.status=r.status;throw e;}
  const type=r.headers.get('content-type')||'';
  if(!(kind==='json'?/json/iu:kind==='html'?/html/iu:/csv|plain|octet-stream/iu).test(type))throw Error('source_type');
  const length=Number(r.headers.get('content-length'));if(Number.isFinite(length)&&length>cap)throw Error('source_size');
  const reader=r.body?.getReader();if(!reader)throw Error('source_body');
  let bytes=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>cap)throw Error('source_size');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
 }finally{clearTimeout(timer);c.abort();}
}
function fredRows(csv,today){
 const lines=csv.replace(/^\uFEFF/u,'').trim().split(/\r?\n/u);
 if(lines.shift()!=='observation_date,DFF')throw Error('fred_schema');
 const seen=new Set(),rows=[];
 for(const line of lines){const parts=line.split(',');if(parts.length!==2||!realDay(parts[0])||parts[0]>today||seen.has(parts[0]))throw Error('fred_schema');seen.add(parts[0]);
  if(parts[1]==='.'||parts[1]==='')continue;
  if(!/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/u.test(parts[1]))throw Error('fred_value');
  rows.push({date:parts[0],value:parts[1]});
 }
 if(!rows.length)throw Error('fred_empty');return rows.sort((a,b)=>b.date.localeCompare(a.date));
}
export async function collectFedMarketPath({today,fetchFn=globalThis.fetch,now=()=>Date.now()}={}){
 const input={calendar:null,baseline:null,quotes:[]},sourceFailures=[],qualityIssues=[],attemptedSources=[];
 let baselineRows=[],baselineCheckedAt=null;
 const clock=()=>new Date(now()).toISOString();
 const finish=()=>{const checkedAt=clock();return {policy:'fed_market_path_collection_v1',checkedAt,sourceEvidence:input,
  result:qualifyFedMarketPath(input,today,checkedAt),sourceFailures,qualityIssues,attemptedSources,
  collectionPolicy:{actualRequests:attemptedSources.length,maximumRequests:10,requestTimeoutMs:12000,calendarMaxBytes:1048576,csvMaxBytes:65536,quoteMaxBytes:1048576,applicationRetries:0,redirects:'error'}};};
 const failure=(source,e)=>sourceFailures.push({source,reason:e.status?`http_${e.status}`:e.name==='AbortError'?'timeout':'response_unusable'});
 attemptedSources.push('calendar');
 try{const html=await getText(FED_CALENDAR_URL,'html',1048576,fetchFn);input.calendar=parseReviewedFomcCalendar(html,clock());}
 catch(e){if(e.message==='calendar_schedule_changed')qualityIssues.push({source:'calendar',reason:'reviewed_schedule_changed'});else failure('calendar',e);return finish();}
 let plan;try{plan=fedQuotePlan(today,input.calendar,clock());}catch{qualityIssues.push({source:'calendar',reason:'unsupported_calendar_horizon'});return finish();}
 attemptedSources.push('DFF');
 try{
  const from=new Date(Date.parse(`${today}T00:00:00Z`)-14*86400000).toISOString().slice(0,10);
  baselineRows=fredRows(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF&cosd=${from}`,'csv',65536,fetchFn),today);
  baselineCheckedAt=clock();
 }catch(e){failure('DFF',e);return finish();}
 const candidates=[];
 for(const month of plan.requiredMonths){
  const symbol=fedFutureSymbol(month),sourceUrl=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=10d&interval=1d`;
  attemptedSources.push(symbol);
  try{
   const json=JSON.parse(await getText(sourceUrl,'json',1048576,fetchFn)),r=json?.chart?.result?.[0],meta=r?.meta;
   if(meta?.symbol!==symbol||!Array.isArray(r.timestamp)||!Array.isArray(r.indicators?.quote?.[0]?.close)||!Array.isArray(r.indicators?.quote?.[0]?.volume))throw Error('quote_response_schema');
   const quote=r.indicators.quote[0];
   if(quote.close.length!==r.timestamp.length||quote.volume.length!==r.timestamp.length||r.timestamp.length>32)throw Error('quote_response_schema');
   if(r.timestamp.some((t,i)=>!Number.isSafeInteger(t)||(i>0&&t<=r.timestamp[i-1])))throw Error('quote_timestamp_order');
   const rows=[];
   for(let i=0;i<r.timestamp.length;i++){
    const raw={month,symbol,sourceUrl,exchangeName:meta.exchangeName,instrumentType:meta.instrumentType,exchangeTimezoneName:meta.exchangeTimezoneName,dataGranularity:meta.dataGranularity,timestamp:r.timestamp[i],rawClose:quote.close[i],reportedVolume:quote.volume[i]};
    try{rows.push({raw,normalized:normalizeFedDailyBar(raw,today,clock())});}catch{}
   }
   if(!rows.length)qualityIssues.push({source:symbol,reason:'historical_daily_bar_unqualified'});
   candidates.push(rows);
  }catch(e){failure(symbol,e);candidates.push([]);if([401,403,429].includes(e.status))break;}
 }
 if(candidates.length===plan.requiredMonths.length&&candidates.every(rows=>rows.length)){
  const common=candidates[0].map(r=>r.normalized.labelDate).filter(d=>candidates.every(rows=>rows.some(r=>r.normalized.labelDate===d))).sort().reverse();
  if(common.length)input.quotes=candidates.map(rows=>rows.find(r=>r.normalized.labelDate===common[0]).raw);
  else qualityIssues.push({source:'quotes',reason:'no_common_qualified_date_label'});
 }
 const label=input.quotes.length?normalizeFedDailyBar(input.quotes[0],today,clock()).labelDate:today;
 const baseline=baselineRows.find(r=>r.date<=label);
 if(baseline)input.baseline={series:'DFF',sourceUrl:'https://fred.stlouisfed.org/series/DFF',observedAt:baseline.date,value:baseline.value,checkedAt:baselineCheckedAt};
 return finish();
}
