import assert from 'node:assert/strict';
import {FED_MEETINGS,FED_CALENDAR_URL,fedFutureSymbol}from'../../scripts/bubble-watch/qualified-fed-path.mjs';
const today='2026-10-15',now=()=>Date.parse('2026-10-15T12:00:00Z');
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
function calendarHtml(){return Object.entries(FED_MEETINGS).map(([year,dates])=>`<h4><a id="${year}">${year} FOMC Meetings</a></h4>`+dates.map(d=>`<div class="row fomc-meeting"><div class="fomc-meeting__month"><strong>${monthNames[Number(d.slice(0,2))-1]}</strong></div><div class="fomc-meeting__date">${Number(d.slice(3))-1}-${Number(d.slice(3))}</div></div>`).join('')).join('')+'<div>Last Update: October 07, 2026</div>';}
function transport({statusSource,status=403,barMode,csv='observation_date,DFF\n2026-10-12,4.00\n2026-10-13,4.00\n2026-10-14,4.00',html=calendarHtml()}={}){
 const calls=[];
 const fetchFn=async(url,opts)=>{
  const id=url===FED_CALENDAR_URL?'calendar':url.includes('fredgraph.csv')?'DFF':new URL(url).pathname.split('/').at(-1);
  calls.push({url,id,opts});assert.equal(opts.redirect,'error');assert.ok(opts.signal);
  if(id===statusSource)return new Response('',{status});
  if(id==='calendar')return new Response(html,{headers:{'Content-Type':'text/html'}});
  if(id==='DFF')return new Response(csv,{headers:{'Content-Type':'text/csv'}});
  if(barMode==='oversize')return new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'1048577'}});
  if(barMode==='streamOversize')return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1048577));c.close();}}),{headers:{'Content-Type':'application/json'}});
  if(barMode==='utf8')return new Response(new Uint8Array([255]),{headers:{'Content-Type':'application/json'}});
  if(barMode==='timeout')throw Object.assign(Error('private_body_must_not_leak'),{name:'AbortError'});
  const timestamps=[12,13,14].map(d=>Date.parse(`2026-10-${d}T04:00:00Z`)/1000);
  if(barMode==='duplicate')timestamps[1]=timestamps[0];
  return Response.json({chart:{result:[{meta:{symbol:id,exchangeName:'CBT',instrumentType:'FUTURE',exchangeTimezoneName:barMode==='timezone'?'UTC':'America/New_York',dataGranularity:'1d'},timestamp:timestamps,indicators:{quote:[{close:[95.8,95.8,95.8],volume:[100,100,100]}]}}]}});
 };
 return {calls,fetchFn};
}

export {today,now,calendarHtml,transport};
