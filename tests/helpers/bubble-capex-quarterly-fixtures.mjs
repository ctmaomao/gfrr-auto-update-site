import assert from 'node:assert/strict';
import {QUARTERLY_CAPEX_EVENTS as events} from '../../scripts/bubble-watch/capex-quarterly-panel.mjs';
const clauses={
 MSFT:'Finance leases are included in capital expenditures, while operating leases are not. Outside of this useful life impact, our calendar year 2026 CapEx investment expectations remain unchanged. However, the shift from finance to operating leases adjusts our expectation to approximately $175 billion.',
 META:'We anticipate 2026 capital expenditures, including principal payments on finance leases, to be in the range of $130 billion-$ 145 billion, narrowed from our prior outlook of $125 billion-$ 145 billion.',
 AMZN:'We now believe we will spend approximately $220 billion in cash CapEx in 2026. The higher cost of memory pushing this number up from our prior estimate of about $200 billion.',
 GOOGL:'we are updating our full-year 2026 CapEx guidance range to $195 billion-$205 billion, up from our previous estimate of $180 billion-$190 billion.'};
const transcript=s=>`<h1>(${s}) Earnings Call: ${events[s].quarter}</h1><script>eventDate:"${events[s].date}",eventTitle:"${events[s].quarter}"</script><p>${clauses[s]}</p>`;
const primary={
 MSFT:'<p>Wednesday, July 29, 2026. Our calendar year 2026 CapEx investment expectations remain unchanged. approximately $175 billion.</p>',
 META:'<h1>Meta Reports Second Quarter 2026 Results</h1><p>2026 capital expenditures, including principal payments on finance leases, to be in the range of $130-145 billion, narrowed from our prior outlook of $125-145 billion. 1:30 p.m. PT</p><script>"datePublished":"2026-07-29T16:01:00-04:00"</script>',
 AMZN:'<p>second quarter results; expectations as of July 30, 2026.</p>',
 GOOGL:'<h1>Q2 2026 earnings call</h1><p>Sundar Pichai</p><script>"datePublished":"2026-07-22T20:45:00+00:00"</script>'};
const schedule={MSFT:'after the close of the market on Wednesday, July 29, 2026. 2:30 p.m. Pacific Time',AMZN:'Thursday, July 30, 2026, at 2:00 p.m. PT/5:00 p.m. ET'};
const listing=s=>`<a href="/stocks/${s.toLowerCase()}/transcripts/${events[s].id}/">${events[s].quarter}</a>`;
function transport(options={}){
 const calls=[];
 const fetchFn=async(url,opts)=>{
  calls.push(url);assert.equal(opts.redirect,'error');assert.ok(opts.signal);const u=new URL(url);
  if(options.blockHost===u.hostname)return new Response('',{status:403});
  if(options.oversize)return new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'text/html'}});
  if(u.hostname==='query1.finance.yahoo.com'){
   const symbol=u.pathname.split('/').at(-1),days=['2026-07-22','2026-07-23','2026-07-29','2026-07-30','2026-07-31'];
   let prices={QQQ:[100,100,100,100,100],MSFT:[100,100,100,110,110],META:[100,100,100,90,90],AMZN:[100,100,100,100,110],GOOGL:[100,90,100,100,100]}[symbol];
   if(symbol!=='QQQ'&&options.priceMode==='red')prices=[100,90,100,90,81];
   if(symbol!=='QQQ'&&options.priceMode==='green')prices=[100,110,100,110,121];
   return Response.json({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York',dataGranularity:'1d',instrumentType:symbol==='QQQ'?'ETF':'EQUITY'},timestamp:days.map(d=>Date.parse(d+'T13:30:00Z')/1000),indicators:{quote:[{close:prices,volume:prices.map(()=>1000)}],adjclose:[{adjclose:prices}]}}]}});
  }
  let body;
  for(const [s,e]of Object.entries(events)){
   if(url===e.primary)body=primary[s];if(url===e.timing)body=schedule[s];
   if(url===`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/`)body=options.newQuarter?listing(s).replace(e.id,'999999-q3-2026'):listing(s);
   if(url===`https://stockanalysis.com/stocks/${s.toLowerCase()}/transcripts/${e.id}/`)body=transcript(s);
  }
  assert.ok(body,'Unexpected URL');if(options.largeBodies)body+=' '.repeat(1900000);return new Response(body,{headers:{'content-type':'text/html'}});
 };
 return {calls,fetchFn};
}

export {events,clauses,transcript,primary,schedule,listing,transport};
