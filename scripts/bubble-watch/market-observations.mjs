// Independent dated display snapshot. Never feeds weekly scores or AI input.
import { parseCapeAtom, parseStockAnalysisMetricDate } from './source-observation-inputs.mjs';
import { alignedEtfSpread } from './aligned-etf-spread.mjs';
import { htmlToText } from './public-html-parsers.mjs';
export const CONTRACT = 'bubble-market-observations-v1';
export const BOUNDARY = 'display_only_no_score_or_editorial_impact';
export const MARKET_SOURCES = Object.freeze([
  { id:'cape', label:'CAPE 周期调整估值', unit:'倍', sourceName:'Multpl Shiller PE', sourceUrl:'https://www.multpl.com/shiller-pe/atom' },
  { id:'top5_weight', label:'SPY 前五大持仓权重', unit:'%', sourceName:'StockAnalysis SPY holdings', sourceUrl:'https://stockanalysis.com/etf/spy/holdings/' },
  { id:'nvda_fpe', label:'NVDA 远期市盈率', unit:'倍', sourceName:'StockAnalysis financial statistics', sourceUrl:'https://stockanalysis.com/stocks/nvda/statistics/' },
  { id:'spy_vs_rsp_6m', label:'SPY−RSP 六个月价格收益差', unit:'个百分点', sourceName:'Yahoo daily closes (unadjusted)', sourceUrl:'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=6mo&interval=1d' }
]);
const RSP_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/RSP?range=6mo&interval=1d';
const DAY=86400000, MAX_BYTES=2*1024*1024;
const dateOnly=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const age=(date,now)=>(Date.parse(now.toISOString().slice(0,10))-Date.parse(date))/DAY;
const validValue=(id,v)=>typeof v==='number'&&Number.isFinite(v)&&(id==='spy_vs_rsp_6m'?Math.abs(v)<10000:id==='top5_weight'?v>10&&v<60:id==='cape'?v>5&&v<100:v>3&&v<200);
function validRow(row, source, now) {
  return row?.id===source.id && Object.entries(source).every(([k,v])=>row[k]===v) && row.maxAgeDays===7
    && validValue(row.id,row.value) && dateOnly(row.observationDate) && age(row.observationDate,now)>=0
    && timestamp(row.fetchedAt) && Date.parse(row.fetchedAt)<=now.getTime()
    && row.observationDate<=row.fetchedAt.slice(0,10);
}
export function validateMarketSnapshot(data,now=new Date()) {
  const errors=[];
  if(data?.contractVersion!==CONTRACT||data?.boundary!==BOUNDARY||!timestamp(data?.checkedAt)||Date.parse(data.checkedAt)>now.getTime())errors.push('snapshot_contract_or_clock');
  if(!Array.isArray(data?.observations)||data.observations.length!==4)return [...errors,'observation_count'];
  const collectedAt = timestamp(data.checkedAt) ? new Date(data.checkedAt) : now;
  for(const source of MARKET_SOURCES){
    const rows=data.observations.filter(row=>row?.id===source.id),row=rows[0];
    if(rows.length!==1){errors.push(source.id+'_identity');continue;}
    if(row.status==='missing'){
      if(!Object.entries(source).every(([k,v])=>row[k]===v)||row.maxAgeDays!==7||row.value!==null||row.observationDate!==null||row.fetchedAt!==null)errors.push(source.id+'_missing');
    }else if(!validRow(row,source,collectedAt)||!['fresh','fallback','stale'].includes(row.status)
      ||(row.status==='fresh'&&(age(row.observationDate,collectedAt)>7||row.fetchedAt!==data.checkedAt))
      ||(row.status==='fallback'&&age(row.observationDate,collectedAt)>7)
      ||(row.status==='stale'&&age(row.observationDate,collectedAt)<=7))errors.push(source.id+'_evidence');
  }
  if(data.collection?.maximumRequests!==5||data.collection?.applicationRetries!==0||data.collection?.paidCalls!==0
    ||!Number.isInteger(data.collection?.requests)||data.collection.requests<0||data.collection.requests>5)errors.push('collection_bounds');
  return errors;
}
export function parseMarketHoldings(html,today){
  const observationDate=parseStockAnalysisMetricDate(html,'holdings',today),candidates=[];
  for(const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gu)){
    const tableRows=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gu)].map(m=>m[1]);
    const header=tableRows.find(row=>/<th\b/u.test(row));
    if(!header)continue;
    const labels=[...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gu)].map(m=>htmlToText(m[1]).trim());
    const weightIndexes=labels.flatMap((label,i)=>['Weight','% Weight','Weight %','Weight % Weight'].includes(label)?[i]:[]);
    const symbolIndex=labels.findIndex(label=>label==='Symbol');
    if(weightIndexes.length!==1||symbolIndex<0)continue;
    const rows=[];
    for(const row of tableRows){
      if(!/<td\b/u.test(row))continue;
      const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)].map(m=>m[1]);
      const symbols=[...(cells[symbolIndex]||'').matchAll(/href="\/stocks\/([a-z][a-z0-9.\-]{0,9})\/"/gu)].map(m=>m[1]);
      const weightText=htmlToText(cells[weightIndexes[0]]||'').trim();
      if(symbols.length!==1||!/^\d{1,2}(?:\.\d{1,3})?\s*%$/u.test(weightText))throw Error('holdings_row_invalid');
      const rankIndex=labels.findIndex(label=>label==='No.');
      if(rankIndex>=0&&htmlToText(cells[rankIndex]||'').trim()!==String(rows.length+1))throw Error('holdings_rank_invalid');
      rows.push({symbol:symbols[0],weight:Number(weightText.replace('%','').trim())});
    }
    if(rows.length)candidates.push(rows);
  }
  if(candidates.length!==1)throw Error('holdings_table_ambiguous');
  const rows=candidates[0];
  if(rows.length<20||new Set(rows.map(r=>r.symbol)).size!==rows.length||rows.some((r,i)=>!(r.weight>0&&r.weight<60)||(i>0&&r.weight>rows[i-1].weight)))throw Error('holdings_qualification');
  const value=rows.slice(0,5).reduce((s,r)=>s+r.weight,0);
  if(!validValue('top5_weight',value))throw Error('holdings_range');
  return {value,observationDate};
}
export function parseMarketPe(html,today){
  const observationDate=parseStockAnalysisMetricDate(html,'statistics',today);
  // Bind the value to the labelled metric, not a quote clock or another PE field.
  const matches=[...htmlToText(html).matchAll(/Forward\s+P\/?E\s+([0-9]{1,3}(?:\.[0-9]{1,2})?)(?![0-9.])/giu)].map(m=>Number(m[1]));
  if(!matches.length||new Set(matches).size!==1||!validValue('nvda_fpe',matches[0]))throw Error('pe_qualification');
  return {value:matches[0],observationDate};
}
export function parseMarketCloses(text,symbol,now){
  const result=JSON.parse(text)?.chart?.result;
  if(!Array.isArray(result)||result.length!==1||result[0]?.meta?.symbol!==symbol)throw Error('chart_identity');
  const r=result[0],times=r.timestamp,closes=r.indicators?.quote?.[0]?.close;
  if(!Array.isArray(times)||!Array.isArray(closes)||times.length!==closes.length||times.length>200)throw Error('chart_shape');
  const today=now.toISOString().slice(0,10),rows=[];
  for(let i=0;i<times.length;i++){
    if(!Number.isFinite(times[i])||times[i]<=0||times[i]*1000>now.getTime())throw Error('chart_clock');
    const date=new Date(times[i]*1000).toISOString().slice(0,10);
    // Exclude today's daily bar even during a delayed scheduled run: it may be unfinished.
    if(date>=today||closes[i]===null)continue;
    if(typeof closes[i]!=='number'||!Number.isFinite(closes[i])||closes[i]<=0)throw Error('chart_price');
    rows.push({date,close:closes[i]});
  }
  return rows;
}
export async function collectMarketObservations({previous,now=new Date(),fetchImpl=fetch,timeoutMs=12000}={}){
  const checkedAt=now.toISOString(),today=checkedAt.slice(0,10);let requests=0;
  // A five-request allowlist, bounded bodies and whole-response deadlines. No retries/fallback providers.
  const allowed=new Set([...MARKET_SOURCES.map(s=>s.sourceUrl),RSP_URL]);
  async function get(url){
    if(!allowed.has(url)||++requests>5)throw Error('request_budget');
    const controller=new AbortController();let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('source_timeout'));},timeoutMs);});
    try{return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'gfrr-bubble-market/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)'}});
      if(!response.ok||response.redirected)throw Error('source_http');
      if(Number(response.headers?.get('content-length'))>MAX_BYTES)throw Error('source_size');
      const reader=response.body?.getReader();if(!reader)throw Error('source_body');
      let size=0;const parts=[];
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('source_size');}parts.push(value);}
      return Buffer.concat(parts).toString('utf8');
    })()]);}finally{clearTimeout(timer);controller.abort();}
  }
  const responses=await Promise.allSettled([...allowed].map(url=>get(url)));
  const results=new Map([...allowed].map((url,i)=>[url,responses[i]]));
  const read=url=>{const r=results.get(url);if(r.status!=='fulfilled')throw Error('source_unavailable');return r.value;};
  const usablePrevious=validateMarketSnapshot(previous,now).length===0?previous:null;
  const observations=MARKET_SOURCES.map(source=>{
    try{
      const text=read(source.sourceUrl);let result;
      if(source.id==='cape'){result=parseCapeAtom(text,today);if(Date.parse(result.sourceTimestamp)>now.getTime())throw Error('source_future');}
      else if(source.id==='top5_weight')result=parseMarketHoldings(text,today);
      else if(source.id==='nvda_fpe')result=parseMarketPe(text,today);
      else{const detail=alignedEtfSpread(parseMarketCloses(text,'SPY',now),parseMarketCloses(read(RSP_URL),'RSP',now),today);result={value:detail.spread,observationDate:detail.observationDate};}
      const old=usablePrevious?.observations.find(x=>x.id===source.id);
      if(old?.observationDate&&result.observationDate<old.observationDate)throw Error('source_regressed');
      return {...source,value:result.value,observationDate:result.observationDate,fetchedAt:checkedAt,status:'fresh',maxAgeDays:7};
    }catch{
      const old=usablePrevious?.observations.find(x=>x.id===source.id);
      if(validRow(old,source,now))return {...old,status:age(old.observationDate,now)>7?'stale':'fallback'};
      return {...source,value:null,observationDate:null,fetchedAt:null,status:'missing',maxAgeDays:7};
    }
  });
  const output={contractVersion:CONTRACT,boundary:BOUNDARY,checkedAt,observations,collection:{requests,maximumRequests:5,applicationRetries:0,paidCalls:0}};
  if(validateMarketSnapshot(output,now).length)throw Error('snapshot_validation');
  return output;
}
