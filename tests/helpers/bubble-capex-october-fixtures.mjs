import assert from 'node:assert/strict';
import {OCTOBER_CAPEX_EVENTS as events} from '../../scripts/bubble-watch/capex-october-panel.mjs';
export const clauses={
 MSFT:'We recognize the full principal value of finance leases in capex at the time of lease commencement. Therefore, for the calendar year, spend should be approximately $170 billion due to the 3P capacity delays noted earlier.',
 META:'We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $135 billion-$145 billion, narrowed from our prior outlook of $130 billion-$145 billion.',
 AMZN:'We still expect 2026 cash CapEx of approximately $220 billion.',
 GOOGL:'our full year 2026 CapEx guidance range of $195 billion to $205 billion remain unchanged.'
};
export const transcript=s=>`<h1>(${s}) Earnings Call: ${events[s].quarter}</h1><script>eventDate:"${events[s].date}",eventTitle:"${events[s].quarter}"</script><p>${clauses[s]}</p>`;
export const primary={
 MSFT:`Wednesday, October 28, 2026. ${clauses.MSFT}`,
 META:'Meta Reports Third Quarter 2026 Results. We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $135-145 billion, narrowed from our prior outlook of $130-145 billion. 1:30 p.m. PT. <script>{"datePublished":"2026-10-21T21:01:00+01:00"}</script>',
 AMZN:'Third quarter results; expectations as of October 29, 2026. We continue to expect 2026 cash capital expenditures to be approximately $220 billion.',
 GOOGL:'Q3 2026 earnings call. Sundar Pichai. <script>{"datePublished":"2026-10-28T21:05:00+00:00"}</script>'
};
export const schedule={MSFT:'after the close of the market on Wednesday, Oct. 28, 2026. 2:30 p.m. Pacific Time',AMZN:'Thursday, October 29, 2026, at 2:00 p.m. PT/5:00 p.m. ET'};
export const comparison='Wednesday, July 29, 2026. Our calendar year 2026 CapEx investment expectations remain unchanged. However, the shift from finance to operating leases adjusts our expectation to approximately $175 billion. Finance leases are included in capital expenditures, while operating leases are not.';
export const listing=s=>`<a href="/stocks/${s.toLowerCase()}/transcripts/${events[s].id}/">${events[s].quarter}</a>`;
export function transport(options={}){
 const calls=[];
 const fetchFn=async(url,opts)=>{
  calls.push(url);assert.equal(opts.redirect,'error');assert.ok(opts.signal);const u=new URL(url);
  if(options.blockHost===u.hostname)return new Response('',{status:403});
  if(options.oversize)return new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'text/html'}});
  if(u.hostname==='query1.finance.yahoo.com'){
   const symbol=u.pathname.split('/').at(-1),days=['2026-10-21','2026-10-22','2026-10-28','2026-10-29','2026-10-30'];
   let prices={QQQ:[100,100,100,100,100],META:[100,96,100,100,100],MSFT:[100,100,100,110,110],AMZN:[100,100,100,100,110],GOOGL:[100,100,100,90,90]}[symbol];
   if(symbol==='META'&&options.metaAfter!==undefined)prices=[100,options.metaAfter,100,100,100];
   return Response.json({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York',dataGranularity:'1d',instrumentType:symbol==='QQQ'?'ETF':'EQUITY'},timestamp:days.map(d=>Date.parse(d+'T13:30:00Z')/1000),indicators:{quote:[{close:prices,volume:prices.map(()=>1000)}],adjclose:[{adjclose:prices}]}}]}});
  }
  let body;
  for(const [s,e]of Object.entries(events)){
   if(url===e.primary)body=primary[s];if(url===e.timing)body=schedule[s];if(url===e.comparison)body=comparison;
   if(url===`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/`)body=options.newQuarter?listing(s).replace(e.id,'999999-q4-2027'):listing(s);
   if(url===`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/${e.id}/`)body=transcript(s);
  }
  assert.ok(body,'Unexpected source URL');if(options.largeBodies)body+=' '.repeat(1900000);
  return new Response(body,{headers:{'content-type':'text/html'}});
 };
 return {calls,fetchFn};
}
