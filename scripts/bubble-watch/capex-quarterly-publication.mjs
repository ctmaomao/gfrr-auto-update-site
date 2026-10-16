// Separately reviewed r5 source admission. Active production stays r4 in this PR.
import {isDeepStrictEqual} from 'node:util';
import {QUARTERLY_CAPEX_EVENTS,QUARTERLY_CAPEX_POLICY} from './capex-quarterly-panel.mjs';
import {replayQuarterlyCapexPanel} from './capex-quarterly-replay.mjs';
import {realDate} from './capex-event-session.mjs';
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
export const QUARTERLY_CAPEX_LABELS=Object.freeze({unknown:'待确认',green:'上调获奖励',yellow:'偶发惩罚或反应分化',red:'广泛惩罚'});
export const QUARTERLY_CAPEX_SOURCE='Stock Analysis季度电话会整理 · 公司公告 · Yahoo/QQQ';
export const QUARTERLY_CAPEX_THRESHOLD='固定四家最新季度；指引上调后自身下跌且较QQQ落后超过5个百分点计为受罚，三家及以上红灯；绿灯须至少两家上调且全部自身上涨、领先QQQ超过5个百分点';
export function quarterlyCapexHold(today){
 if(!realDate(today))throw Error('Invalid quarterly capex date');
 return {policy:QUARTERLY_CAPEX_POLICY,status:'unknown',checkedDate:today,companies:Object.keys(QUARTERLY_CAPEX_EVENTS),
  missingRequirements:['latest_reviewed_quarter_catalog','comparable_annual_guidance','official_after_close_anchor','matched_stock_qqq_pair'],
  firstGuidanceDiscoveryComplete:false,capexCausalityEstablished:false};
}
export function validateQuarterlyCapexPublication(card,today,{now=()=>Date.now()}={}){
 const errors=[],check=(ok,s)=>{if(!ok)errors.push(s);};
 try{
  check(realDate(today)&&card?.id==='capex_reaction'&&card.score_role==='core','capex identity/date invalid');
  const clock=card?.provenance?.checkedAt;
  check(typeof clock==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(clock)&&Number.isFinite(Date.parse(clock))&&new Date(clock).toISOString()===clock&&clock.slice(0,10)===today&&Date.parse(clock)<=now(),'capex check clock invalid');
  check(card?.provenance?.mode==='auto'&&card.stale===false,'capex provenance invalid');
  check(card.value_display===QUARTERLY_CAPEX_LABELS[card.status]&&card.threshold_text===QUARTERLY_CAPEX_THRESHOLD&&card.source_name===QUARTERLY_CAPEX_SOURCE,'capex display policy invalid');
  if(card.status==='unknown'){
   check(card.as_of===null&&equal(card.provenance.detail,quarterlyCapexHold(today)),'capex canonical pending proof differs');
   check(equal(card.evidence_gap,{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today}),'capex pending gap invalid');
  }else{
   const report=card.provenance.detail,result=replayQuarterlyCapexPanel(report,today,{now});
   check(result.ok,`capex quarterly replay: ${result.errors.join('; ')}`);
   check(card.status===result.decision.status&&clock===report.checkedAt,'capex light/clock differs from replay');
   check(card.as_of===Object.values(QUARTERLY_CAPEX_EVENTS).map(e=>e.date).sort().at(-1)&&!Object.hasOwn(card,'evidence_gap'),'capex original observation/gap invalid');
  }
 }catch{check(false,'malformed quarterly capex publication');}
 return errors;
}
