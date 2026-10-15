import test from 'node:test';
import assert from 'node:assert/strict';
import {FED_MEETINGS,FED_CALENDAR_URL,addMonthsClamped,fedQuotePlan,fedFutureSymbol,normalizeFedDailyBar,qualifyFedMarketPath} from '../../scripts/bubble-watch/qualified-fed-path.mjs';
const daysBefore=(s,n)=>new Date(Date.parse(`${s}T00:00:00Z`)-n*86400000).toISOString().slice(0,10);
function fixture(today='2026-10-15',price=95.8){
 const checkedAt=`${today}T12:00:00Z`,labelDate=daysBefore(today,3);
 const calendar={sourceUrl:FED_CALENDAR_URL,checkedAt,lastUpdated:'2026-10-07',years:Object.fromEntries(Object.entries(FED_MEETINGS).map(([y,days])=>[y,days.map(d=>`${y}-${d}`)]))};
 const plan=fedQuotePlan(today,calendar,checkedAt);
 const offset=labelDate<'2026-11-01'?'04':'05';
 const quotes=plan.requiredMonths.map(month=>({month,symbol:fedFutureSymbol(month),sourceUrl:`https://query1.finance.yahoo.com/v8/finance/chart/${fedFutureSymbol(month)}?range=10d&interval=1d`,exchangeName:'CBT',instrumentType:'FUTURE',exchangeTimezoneName:'America/New_York',dataGranularity:'1d',timestamp:Date.parse(`${labelDate}T${offset}:00:00Z`)/1000,rawClose:price,reportedVolume:100}));
 return {today,checkedAt,input:{calendar,baseline:{series:'DFF',sourceUrl:'https://fred.stlouisfed.org/series/DFF',observedAt:labelDate,value:'4.00',checkedAt},quotes}};
}
const evaluate=f=>qualifyFedMarketPath(f.input,f.today,f.checkedAt);
test('clamped calendar horizons preserve dates across year and leap boundaries',()=>{
 assert.equal(addMonthsClamped('2026-11-30',3),'2027-02-28');
 assert.equal(addMonthsClamped('2027-11-30',3),'2028-02-29');
 assert.equal(addMonthsClamped('2026-10-15',6),'2027-04-15');
 assert.throws(()=>addMonthsClamped('2026-02-30',3));
});
test('meeting months derive pre-effective targets from next nonmeeting anchors',()=>{
 const f=fixture();
 const prices={'2027-01':95.805,'2027-02':95.71,'2027-04':95.535,'2027-05':95.45};
 for(const q of f.input.quotes)q.rawClose=prices[q.month];
 const r=evaluate(f);assert.equal(r.status,'red',JSON.stringify(r));
 assert.deepEqual(r.paths.map(p=>p.targetDate),['2027-01-15','2027-04-15']);
 assert.deepEqual(r.paths.map(p=>p.segment),['before_effective_date','before_effective_date']);
 assert.ok(Math.abs(r.paths[0].expectedRatePct-((31*4.195-4*4.29)/27))<1e-12);
 assert.notEqual(r.paths[0].expectedRatePct,4.195);
 const post=fixture('2026-10-28');post.input.baseline.observedAt='2026-10-23';
 for(const q of post.input.quotes)q.timestamp=Date.parse('2026-10-23T04:00:00Z')/1000;
 const p=evaluate(post);assert.equal(p.status,'red',JSON.stringify(p));
 assert.deepEqual(p.paths.map(x=>x.segment),['after_effective_date','before_effective_date']);
});
test('exact15bp comparisons use normalized ticks and rationals without display rounding',()=>{
 for(const [price,status]of [[95.85,'red'],[95.855,'yellow'],[95.845,'red'],[96.15,'green'],[96.145,'yellow'],[96.155,'green']]){
  const f=fixture('2026-11-15',price+0.0000002),r=evaluate(f);
  assert.equal(r.status,status,`${price}: ${JSON.stringify(r)}`);
 }
 const f=fixture('2026-11-15',96.15);f.input.quotes[0].rawClose=95.85;assert.equal(evaluate(f).status,'red');
});
test('calendar, clocks, baseline and quote proof gaps cannot become zero or green',()=>{
 const mutations=[f=>f.input.quotes.pop(),f=>f.input.quotes[0].timestamp+=86400,
 f=>f.input.quotes[0].reportedVolume=0,f=>f.input.quotes[0].rawClose=95.801,
 f=>f.input.quotes[0].exchangeTimezoneName='UTC',f=>f.input.quotes[0].dataGranularity='1m',
 f=>f.input.quotes[0].timestamp+=3600,f=>f.input.baseline.observedAt='2026-10-14',
 f=>f.input.baseline.observedAt='2026-10-01',f=>f.input.baseline.value='',
 f=>f.input.calendar.years[2027][0]='2027-01-28',f=>f.input.calendar.years[2027].pop(),
 f=>f.input.calendar.approved=true,f=>f.input.quotes[0].latestConfirmed=true,
 f=>f.input.quotes[0].rawClose=null,f=>f.checkedAt='2026-10-14T24:00:00Z'];
 for(const mutate of mutations){const f=fixture();mutate(f);const r=evaluate(f);assert.equal(r.status,'unknown',JSON.stringify(r));assert.ok(r.reason);assert.equal(r.paths,undefined);}
 const current=fixture();for(const q of current.input.quotes)q.timestamp=Date.parse('2026-10-14T04:00:00Z')/1000;
 assert.equal(evaluate(current).status,'unknown');
 const stale=fixture();for(const q of stale.input.quotes)q.timestamp=Date.parse('2026-10-01T04:00:00Z')/1000;
 assert.equal(evaluate(stale).status,'unknown');
});
test('DFF cannot cross an effective policy meeting on either side of the price label',()=>{
 const f=fixture('2026-11-02');f.input.baseline.observedAt='2026-10-27';
 for(const q of f.input.quotes)q.timestamp=Date.parse('2026-10-27T04:00:00Z')/1000;
 assert.equal(evaluate(f).reason,'baseline_crosses_effective_meeting');
 const between=fixture('2026-11-02');between.input.baseline.observedAt='2026-10-27';
 for(const q of between.input.quotes)q.timestamp=Date.parse('2026-10-30T04:00:00Z')/1000;
 assert.equal(evaluate(between).reason,'baseline_crosses_effective_meeting');
});
test('NY label end honors DST and never claims a supplier or exchange close timestamp',()=>{
 const f=fixture('2026-11-04');const q=f.input.quotes[0];q.timestamp=Date.parse('2026-11-01T04:00:00Z')/1000;
 const r=normalizeFedDailyBar(q,f.today,f.checkedAt);assert.equal(r.derivedLabelEndAt,'2026-11-02T05:00:00.000Z');
 assert.equal(r.sessionCloseAt,undefined);
 const unsupported=fixture('2026-11-15');unsupported.input.quotes[0].month='2026-12';
 assert.throws(()=>fedQuotePlan('2027-10-15',unsupported.input.calendar,'2027-10-15T12:00:00Z'));
});


test('consecutive March-April meetings both unwind from the May anchor',()=>{
 const f=fixture('2026-12-15');
 const prices={'2027-03':95.9,'2027-04':95.8,'2027-05':95.7,'2027-06':95.6,'2027-07':95.5,'2027-08':95.4};
 for(const q of f.input.quotes)q.rawClose=prices[q.month];
 const r=evaluate(f);assert.notEqual(r.status,'unknown',JSON.stringify(r));
 const aprilPre=(30*4.2-2*4.3)/28, marchPre=(31*4.1-14*aprilPre)/17;
 assert.ok(Math.abs(r.paths[0].expectedRatePct-marchPre)<1e-12);
 assert.deepEqual(r.paths[0].chain,['2027-03','2027-04','2027-05']);
 assert.ok(Object.isFrozen(FED_MEETINGS[2027]));
});
test('tick tolerance is symmetric and isolation/freshness exact boundaries are explicit',()=>{
 for(const tail of [-0.000009,0.000009]){const f=fixture('2026-11-15',95.85+tail);assert.equal(evaluate(f).status,'red');}
 for(const tail of [-0.000011,0.000011]){const f=fixture('2026-11-15',95.85+tail);assert.equal(evaluate(f).reason,'quote_off_remote_tick');}
 const f=fixture(),q=f.input.quotes[0];q.timestamp=Date.parse('2026-10-13T04:00:00Z')/1000;
 assert.equal(normalizeFedDailyBar(q,f.today,'2026-10-15T04:00:00Z').labelDate,'2026-10-13');
 assert.throws(()=>normalizeFedDailyBar(q,f.today,'2026-10-15T03:59:59.999Z'),/quote_label_not_isolated_or_stale/u);
 q.timestamp=Date.parse('2026-10-08T04:00:00Z')/1000;
 assert.equal(normalizeFedDailyBar(q,f.today,f.checkedAt).labelDate,'2026-10-08');
 q.timestamp=Date.parse('2026-10-07T04:00:00Z')/1000;assert.throws(()=>normalizeFedDailyBar(q,f.today,f.checkedAt),/quote_label_not_isolated_or_stale/u);
});
test('identity, duplicate contracts, invalid publication date and future source clocks fail closed',()=>{
 for(const mutate of [f=>f.input.quotes[0]=structuredClone(f.input.quotes[1]),f=>f.input.quotes[0].symbol='ZQZ26.CBT',
 f=>f.input.calendar.lastUpdated='2026-02-30',f=>f.input.calendar.lastUpdated='2026-10-16',
 f=>f.input.calendar.checkedAt='2026-10-15T12:00:01Z',f=>f.input.baseline.checkedAt='2026-10-15T12:00:01Z']){
 const f=fixture();mutate(f);assert.equal(evaluate(f).status,'unknown');}
 const f=fixture('2026-10-31');f.input.baseline.observedAt='2026-10-29';
 for(const q of f.input.quotes)q.timestamp=Date.parse('2026-10-29T04:00:00Z')/1000;
 assert.notEqual(evaluate(f).status,'unknown',JSON.stringify(evaluate(f)));
});
