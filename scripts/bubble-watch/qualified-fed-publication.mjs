import {isDeepStrictEqual}from'node:util';
import {FED_MEETINGS,FED_CALENDAR_URL,fedQuotePlan,fedFutureSymbol,normalizeFedDailyBar,qualifyFedMarketPath,utcClock,realDay}from'./qualified-fed-path.mjs';
export const FED_PATH_LABELS=Object.freeze({red:'3/6个月路径偏上',green:'3/6个月路径偏下',yellow:'3/6个月路径未越阈值',unknown:'待确认'});
export const FED_THRESHOLD_TEXT='任一3/6月路径较同期EFFR高≥15基点=红；两者低≥15基点=绿；其余黄，证据不齐待确认';
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
export function validateFedMarketPathPublication(card,today,{now=Date.now()}={}){
 const errors=[],check=(ok,msg)=>{if(!ok)errors.push(`fed qualified source: ${msg}`);};
 try{
  check(card?.id==='fed_policy'&&card.score_role==='core'&&card.axis==='trigger'&&card.category==='macro','identity');
  const report=card?.provenance?.detail;
  if(!only(report,['policy','checkedAt','sourceEvidence','result','sourceFailures','qualityIssues','attemptedSources','collectionPolicy']))return [...errors,'fed qualified source: report schema'];
  check(report.policy==='fed_market_path_collection_v1','collection identity');
  check(card?.provenance?.mode==='auto'&&card.provenance.checkedAt===report.checkedAt,'check clock binding');
  check(utcClock(report.checkedAt)&&report.checkedAt.slice(0,10)===today&&Date.parse(report.checkedAt)<=now,'check clock');
  const input=report.sourceEvidence;
  if(!only(input,['calendar','baseline','quotes']))return [...errors,'fed qualified source: public input schema'];
  const calendar=input.calendar;
  if(calendar!==null){
   check(only(calendar,['sourceUrl','checkedAt','lastUpdated','years'])&&calendar.sourceUrl===FED_CALENDAR_URL,'calendar fields');
   check(utcClock(calendar.checkedAt)&&calendar.checkedAt.slice(0,10)===today&&Date.parse(calendar.checkedAt)<=Date.parse(report.checkedAt),'calendar clock');
   check(realDay(calendar.lastUpdated)&&calendar.lastUpdated<=today,'calendar original update');
   check(only(calendar.years,['2026','2027'])&&Object.entries(FED_MEETINGS).every(([year,dates])=>equal(calendar.years?.[year],dates.map(d=>`${year}-${d}`))),'calendar enumeration');
  }
  const baseline=input.baseline;
  if(baseline!==null){
   check(only(baseline,['series','sourceUrl','observedAt','value','checkedAt'])&&baseline.series==='DFF'&&baseline.sourceUrl==='https://fred.stlouisfed.org/series/DFF','baseline fields');
   check(realDay(baseline.observedAt)&&baseline.observedAt<=today&&typeof baseline.value==='string'&&/^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/u.test(baseline.value),'baseline original value/date');
   check(utcClock(baseline.checkedAt)&&baseline.checkedAt.slice(0,10)===today&&Date.parse(baseline.checkedAt)<=Date.parse(report.checkedAt),'baseline check clock');
  }
  check(Array.isArray(input.quotes)&&input.quotes.length<=8,'quote input budget');
  for(const quote of input.quotes||[])try{normalizeFedDailyBar(quote,today,report.checkedAt);}catch{check(false,'unqualified/raw extra quote fields');}
  if(calendar===null)check(baseline===null&&input.quotes.length===0,'calendar failure cannot carry observations');
  const replay=qualifyFedMarketPath(input,today,report.checkedAt);
  check(equal(report.result,replay),'rate/threshold/source replay');
  check(card.status===replay.status&&card.as_of===(replay.status==='unknown'?null:replay.quoteLabelDate)&&card.stale===false,'light/original label');
  check(card.value_display===FED_PATH_LABELS[replay.status]&&card.threshold_text===FED_THRESHOLD_TEXT,'visible horizon/threshold');
  if(replay.status==='unknown')check(only(card.evidence_gap,['policy','reasonCode','checkedDate'])&&card.evidence_gap.policy==='bubble-qualified-evidence-v1'&&card.evidence_gap.reasonCode==='fed_market_path_unavailable'&&card.evidence_gap.checkedDate===today,'pending gap');
  else check(!Object.hasOwn(card,'evidence_gap'),'known rate cannot carry gap');
  let expected=['calendar'],plan=null;
  try{plan=fedQuotePlan(today,calendar,report.checkedAt);expected=['calendar','DFF',...plan.requiredMonths.map(fedFutureSymbol)];}catch{}
  const attempted=report.attemptedSources;
  check(Array.isArray(attempted)&&attempted.length>=1&&attempted.length<=10&&new Set(attempted).size===attempted.length
    &&attempted.every((source,i)=>source===expected[i]),'request prefix');
  const wanted={actualRequests:attempted?.length,maximumRequests:10,requestTimeoutMs:12000,calendarMaxBytes:1048576,csvMaxBytes:65536,quoteMaxBytes:1048576,applicationRetries:0,redirects:'error'};
  check(equal(report.collectionPolicy,wanted),'collection budget/retry audit');
  const failures=report.sourceFailures,issues=report.qualityIssues;
  check(Array.isArray(failures)&&failures.length<=10&&new Set(failures.map(f=>f.source)).size===failures.length
    &&failures.every(f=>only(f,['source','reason'])&&attempted.includes(f.source)&&/^(?:http_[1-5]\d{2}|timeout|response_unusable)$/u.test(f.reason)),'unsanitized source failures');
  check(Array.isArray(issues)&&issues.length<=10&&issues.every(i=>only(i,['source','reason'])&&(
    (i.source==='calendar'&&['reviewed_schedule_changed','unsupported_calendar_horizon'].includes(i.reason))
    ||(i.source==='quotes'&&i.reason==='no_common_qualified_date_label')
    ||(attempted.includes(i.source)&&i.source!=='calendar'&&i.source!=='DFF'&&i.reason==='historical_daily_bar_unqualified'))),'unsanitized qualification issues');
  // Observations must come from the corresponding completed transport stage.
  // A pending result cannot retain a successful observation for a failed/unrun source.
  const failed=new Set(failures.map(f=>f.source));
  if(calendar!==null)check(attempted.includes('calendar')&&!failed.has('calendar'),'calendar observation without completed request');
  if(baseline!==null)check(calendar!==null&&attempted.includes('DFF')&&!failed.has('calendar')&&!failed.has('DFF'),'baseline observation without completed request');
  if(failed.has('calendar'))check(calendar===null&&baseline===null&&input.quotes.length===0&&attempted.length===1&&failures.length===1&&issues.length===0,'failed calendar retained downstream evidence');
  if(!attempted.includes('DFF')||failed.has('DFF'))check(baseline===null&&input.quotes.length===0,'unrequested/failed DFF retained evidence');
  if(failed.has('DFF'))check(attempted.length===2&&failures.length===1&&issues.length===0,'failed DFF did not stop collection');
  const quoteFailure=failures.some(f=>f.source!=='calendar'&&f.source!=='DFF');
  const quoteIssue=issues.some(i=>i.source==='quotes'||i.reason==='historical_daily_bar_unqualified');
  if(input.quotes.length){
    check(plan!==null&&attempted.length===expected.length&&input.quotes.length===plan.requiredMonths.length&&!quoteFailure&&!quoteIssue,'partial quote stage retained common-label evidence');
    check(input.quotes.every(q=>attempted.includes(q.symbol)&&!failed.has(q.symbol)),'quote observation without completed request');
  }
  if(plan!==null&&attempted.length===expected.length&&input.quotes.length===0)check(quoteFailure||quoteIssue,'empty quote stage without a recorded gap');
  for(const issue of issues){
    check(!failed.has(issue.source),'source cannot be both failed and qualified-body rejected');
    if(issue.reason==='reviewed_schedule_changed')check(calendar===null&&baseline===null&&input.quotes.length===0&&attempted.length===1,'changed calendar retained observations');
    if(issue.reason==='unsupported_calendar_horizon')check(calendar!==null&&plan===null&&baseline===null&&input.quotes.length===0&&attempted.length===1,'unsupported horizon retained observations');
  }
  if(attempted.length===1)check(failures.some(f=>f.source==='calendar')||issues.some(i=>i.source==='calendar'),'unexplained calendar stop');
  if(attempted.length===2)check(failures.some(f=>f.source==='DFF')&&baseline===null,'unexplained baseline stop');
  if(attempted.length>2&&attempted.length<expected.length)check(failures.some(f=>f.source===attempted.at(-1)&&/^http_(?:401|403|429)$/u.test(f.reason)),'unexplained early quote stop');
  if(replay.status!=='unknown')check(attempted.length===expected.length&&failures.length===0&&issues.length===0,'known result requires full clean collection');
 }catch{check(false,'malformed public proof');}
 return errors;
}
