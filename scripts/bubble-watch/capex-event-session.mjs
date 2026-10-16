// Diagnostic US cash-equity session support. No scoring rule is admitted.
const DAY=86400000;
export function realDate(s){return typeof s==='string'&&/^\d{4}-\d\d-\d\d$/u.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const closed=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25']);
const early=new Set(['2026-11-27','2026-12-24']);
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function nyClock(ms){const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,seconds:Number(p.hour)*3600+Number(p.minute)*60+Number(p.second)};}
function open(s){if(!realDate(s)||!s.startsWith('2026-'))throw Error('calendar_year_not_reviewed');const day=new Date(s+'T12:00:00Z').getUTCDay();return day!==0&&day!==6&&!closed.has(s);}
export function cashEventWindow(timestamp,now){
 if(typeof timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/u.test(timestamp)||!Number.isFinite(Date.parse(timestamp)))throw Error('original_publication_time_missing');
 const ms=Date.parse(timestamp);if(ms>Date.parse(now))throw Error('publication_time_future');
 const parts=timestamp.match(/T(\d\d):(\d\d):(\d\d)/u);
 if(!realDate(timestamp.slice(0,10))||Number(parts[1])>23||Number(parts[2])>59||Number(parts[3])>59)throw Error('publication_time_invalid');
 const {date,seconds}=nyClock(ms);if(!realDate(date))throw Error('publication_time_invalid');
 const regular=open(date);if(regular&&early.has(date))throw Error('early_close_event_not_supported');
 if(regular&&seconds>=9.5*3600&&seconds<=16*3600)throw Error('intraday_or_close_boundary_not_supported');
 let after=date;if(!regular||seconds>16*3600)do{after=shift(after,1);}while(!open(after));
 if(early.has(after))throw Error('first_session_early_close_not_supported');
 let before=shift(after,-1);while(!open(before))before=shift(before,-1);
 if(early.has(before))throw Error('baseline_session_early_close_not_supported');
 // The current NY calendar date is excluded, even after the close; this is delayed evidence.
 if(after>=nyClock(Date.parse(now)).date)throw Error('event_session_not_isolated');
 return {policy:'us_cash_regular_2026_v1',beforeDate:before,afterDate:after,originalPublishedAt:timestamp,
  association:'earnings_release_only',capexCausalityEstablished:false};
}
