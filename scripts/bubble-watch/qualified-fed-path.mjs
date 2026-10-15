// Reviewed source policy: delayed NY-date Yahoo daily-bar price proxy, never CME settlement.
export const FED_PATH_POLICY='fed_3_6_calendar_month_yahoo_daily_proxy_v1';
export const FED_CALENDAR_URL='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export const FED_MEETINGS=Object.freeze({
  2026:Object.freeze(['01-28','03-18','04-29','06-17','07-29','09-16','10-28','12-09']),
  2027:Object.freeze(['01-27','03-17','04-28','06-09','07-28','09-15','10-27','12-08'])
});
const BANK_HOLIDAYS={2026:['01-01','01-19','02-16','05-25','06-19','07-04','09-07','10-12','11-11','11-26','12-25'],
  2027:['01-01','01-18','02-15','05-31','06-19','07-04','07-05','09-06','10-11','11-11','11-25','12-25']};
const DAY=86400000;
export function realDay(s){const t=typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(s)?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;}
function epoch(s){if(!realDay(s))throw Error('invalid_date');return Date.parse(`${s}T00:00:00Z`);}
export function utcClock(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(s)||!Number.isFinite(Date.parse(s)))return false;return new Date(s).toISOString()===(s.length===20?s.slice(0,-1)+'.000Z':s);}
const shiftDay=(s,n)=>new Date(epoch(s)+n*DAY).toISOString().slice(0,10);
const monthOf=s=>s.slice(0,7);
function shiftMonth(month,n){const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
function monthDays(month){const d=new Date(`${month}-01T00:00:00Z`);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();}
export function addMonthsClamped(s,n){epoch(s);const m=shiftMonth(monthOf(s),n);return `${m}-${String(Math.min(Number(s.slice(8)),monthDays(m))).padStart(2,'0')}`;}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
function assert(ok,reason){if(!ok)throw Error(reason);}
function bankDay(s){const y=Number(s.slice(0,4));const dow=new Date(epoch(s)).getUTCDay();return BANK_HOLIDAYS[y]&&dow>0&&dow<6&&!BANK_HOLIDAYS[y].includes(s.slice(5));}
function calendarCheck(calendar,today,checkedAt){
  assert(only(calendar,['sourceUrl','checkedAt','lastUpdated','years']),'calendar_schema');
  assert(calendar.sourceUrl===FED_CALENDAR_URL&&utcClock(calendar.checkedAt)&&calendar.checkedAt.slice(0,10)===today
    &&Date.parse(calendar.checkedAt)<=Date.parse(checkedAt)&&Date.parse(checkedAt)-Date.parse(calendar.checkedAt)<=600000,'calendar_clock');
  assert(realDay(calendar.lastUpdated)&&calendar.lastUpdated<=today,'calendar_publication_date');
  assert(only(calendar.years,['2026','2027']),'calendar_years_not_reviewed');
  for(const [year,dates]of Object.entries(FED_MEETINGS))assert(equal(calendar.years[year],dates.map(d=>`${year}-${d}`)),'calendar_schedule_changed');
}
function decisions(calendar,month){const year=month.slice(0,4);assert(calendar.years[year],'calendar_year_unavailable');return calendar.years[year].filter(d=>monthOf(d)===month);}
function meeting(calendar,month){const dates=decisions(calendar,month);assert(dates.length<=1,'multiple_monthly_meetings');if(!dates.length)return null;
  const d=dates[0];assert(new Date(epoch(d)).getUTCDay()===3&&bankDay(shiftDay(d,1)),'unsupported_effective_business_day');return d;}
export function fedQuotePlan(today,calendar,checkedAt){
  epoch(today);assert(utcClock(checkedAt)&&checkedAt.slice(0,10)===today,'check_clock');calendarCheck(calendar,today,checkedAt);
  const required=new Set();const horizons=[];
  for(const months of [3,6]){
    const targetDate=addMonthsClamped(today,months),chain=[];let m=monthOf(targetDate),anchor=null;
    for(let i=0;i<=3;i++){
      required.add(m);chain.push(m);
      if(!meeting(calendar,m)){anchor=m;break;}m=shiftMonth(m,1);
    }
    assert(anchor,'anchor_chain_limit');horizons.push({months,targetDate,chain,anchor});
  }
  assert(required.size<=8,'quote_budget');
  return {horizons,requiredMonths:[...required].sort()};
}
export function fedFutureSymbol(month){return `ZQ${'FGHJKMNQUVXZ'[Number(month.slice(5))-1]}${month.slice(2,4)}.CBT`;}
const nyFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
function nyParts(t){return Object.fromEntries(nyFormat.formatToParts(new Date(t)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
function nyMidnight(s){for(const hour of [4,5]){const t=Date.parse(`${s}T0${hour}:00:00Z`),p=nyParts(t);if(`${p.year}-${p.month}-${p.day}`===s&&p.hour==='00')return t;}throw Error('ny_midnight_unresolved');}
export function normalizeFedDailyBar(row,today,checkedAt){
  assert(only(row,['month','symbol','sourceUrl','exchangeName','instrumentType','exchangeTimezoneName','dataGranularity','timestamp','rawClose','reportedVolume']),'quote_schema');
  assert(/^\d{4}-(0[1-9]|1[0-2])$/u.test(row.month)&&row.symbol===fedFutureSymbol(row.month),'contract_identity');
  assert(row.sourceUrl===`https://query1.finance.yahoo.com/v8/finance/chart/${row.symbol}?range=10d&interval=1d`,'quote_source');
  assert(row.exchangeName==='CBT'&&row.instrumentType==='FUTURE'&&row.exchangeTimezoneName==='America/New_York'&&row.dataGranularity==='1d','quote_meta');
  assert(Number.isSafeInteger(row.timestamp)&&row.timestamp>0,'quote_timestamp');
  const t=row.timestamp*1000,p=nyParts(t),labelDate=`${p.year}-${p.month}-${p.day}`;
  assert(realDay(labelDate)&&t===nyMidnight(labelDate),'quote_not_ny_midnight');
  const end=nyMidnight(shiftDay(labelDate,1)),now=Date.parse(checkedAt);
  assert(now-end>=DAY&&(epoch(today)-epoch(labelDate))/DAY<=7&&labelDate<=today,'quote_label_not_isolated_or_stale');
  assert(Number.isSafeInteger(row.reportedVolume)&&row.reportedVolume>0,'quote_volume_missing');
  assert(typeof row.rawClose==='number'&&Number.isFinite(row.rawClose)&&row.rawClose>=75&&row.rawClose<=100,'quote_price_invalid');
  assert(row.month>=shiftMonth(monthOf(today),2),'front_month_tick_not_supported');
  const tick=Math.round(row.rawClose/0.005),priceUnits=tick*50;
  assert(Math.abs(row.rawClose-priceUnits/10000)<0.00001,'quote_off_remote_tick');
  return {month:row.month,symbol:row.symbol,labelDate,sourceTimestamp:new Date(t).toISOString(),derivedLabelEndAt:new Date(end).toISOString(),
    rawClose:row.rawClose,normalizedPrice:(priceUnits/10000).toFixed(4),priceUnits:String(priceUnits),reportedVolume:row.reportedVolume,
    normalizationPolicy:'remote_zq_0p005_v1'};
}
function gcd(a,b){a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a||1n;}
function rat(n,d=1n){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
const mul=(a,b)=>rat(a.n*BigInt(b),a.d);
const minus=(a,b)=>rat(a.n*b.d-b.n*a.d,a.d*b.d);
const div=(a,b)=>rat(a.n,a.d*BigInt(b));
const emit=a=>({numerator:a.n.toString(),denominator:a.d.toString(),unit:'0.0001_percent'});
const pct=a=>Number(a.n)/Number(a.d)/10000;
function exactRate(value){assert(typeof value==='string'&&/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/u.test(value),'baseline_value');const [whole,frac='']=value.split('.');const n=BigInt(whole)*10000n+BigInt(frac.padEnd(4,'0'));assert(n<=250000n,'baseline_rate_range');return n;}
export function qualifyFedMarketPath(input,today,checkedAt){
  try{
    assert(only(input,['calendar','baseline','quotes']),'input_schema');
    const plan=fedQuotePlan(today,input.calendar,checkedAt);
    const baseline=input.baseline;
    assert(only(baseline,['series','sourceUrl','observedAt','value','checkedAt']),'baseline_schema');
    assert(baseline.series==='DFF'&&baseline.sourceUrl==='https://fred.stlouisfed.org/series/DFF','baseline_source');
    assert(realDay(baseline.observedAt)&&baseline.observedAt<=today&&(epoch(today)-epoch(baseline.observedAt))/DAY<=7,'baseline_stale');
    assert(utcClock(baseline.checkedAt)&&baseline.checkedAt.slice(0,10)===today&&Date.parse(baseline.checkedAt)<=Date.parse(checkedAt),'baseline_clock');
    const base=rat(exactRate(baseline.value));
    for(const year of new Set([baseline.observedAt.slice(0,4),today.slice(0,4)])){
      assert(input.calendar.years[year],'baseline_calendar_unavailable');
      for(const d of input.calendar.years[year])assert(!(shiftDay(d,1)>baseline.observedAt&&shiftDay(d,1)<=today),'baseline_crosses_effective_meeting');
    }
    assert(Array.isArray(input.quotes)&&input.quotes.length===plan.requiredMonths.length,'quote_chain_incomplete');
    const normalized=input.quotes.map(r=>normalizeFedDailyBar(r,today,checkedAt));
    assert(equal(normalized.map(r=>r.month).sort(),plan.requiredMonths),'quote_month_set');
    const label=normalized[0].labelDate;
    assert(normalized.every(r=>r.labelDate===label),'mixed_quote_labels');assert(baseline.observedAt<=label,'baseline_after_quote_label');
    const byMonth=Object.fromEntries(normalized.map(r=>[r.month,r]));
    const paths=plan.horizons.map(h=>{
      let next=null;const nodes={};
      for(const m of [...h.chain].reverse()){
        const avg=rat(1000000n-BigInt(byMonth[m].priceUnits));
        const decision=meeting(input.calendar,m);let start,end;
        if(!decision){start=avg;end=avg;}else{end=next;assert(end,'anchor_missing');const pre=Number(decision.slice(8));start=div(minus(mul(avg,monthDays(m)),mul(end,monthDays(m)-pre)),pre);}
        assert(start.n>=0n&&start.n<=250000n*start.d&&end.n>=0n&&end.n<=250000n*end.d,'derived_rate_outside_support');
        nodes[m]={start,end};next=start;
      }
      const month=monthOf(h.targetDate),decision=meeting(input.calendar,month),before=decision&&h.targetDate<=decision;
      const rate=decision?(before?nodes[month].start:nodes[month].end):nodes[month].start,delta=minus(rate,base);
      return {...h,segment:decision?(before?'before_effective_date':'after_effective_date'):'nonmeeting_month',rate:emit(rate),delta:emit(delta),
        expectedRatePct:pct(rate),deltaBp:pct(delta)*100};
    });
    const deltas=paths.map(p=>({n:BigInt(p.delta.numerator),d:BigInt(p.delta.denominator)}));
    const red=deltas.some(d=>d.n>=1500n*d.d),green=deltas.every(d=>d.n<=-1500n*d.d);
    return {policy:FED_PATH_POLICY,status:red?'red':green?'green':'yellow',quoteLabelDate:label,baselineObservedAt:baseline.observedAt,
      normalizedQuotes:normalized,paths,thresholdBp:15};
  }catch(error){return {policy:FED_PATH_POLICY,status:'unknown',reason:/^[a-z][a-z0-9_]{0,64}$/u.test(error.message)?error.message:'input_unusable'};}
}
