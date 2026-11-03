// Release guard for the existing free, four-indicator refresh; no network/write.
import {isDeepStrictEqual} from 'node:util';
import {METHOD_ORDER,validateEvidenceScoreFields} from './evidence-score-contract.mjs';
import {validateQuarterlyCapexPublication} from './capex-quarterly-publication.mjs';
import {validateInsiderPublication} from './qualified-insider-publication.mjs';
import {validateFedMarketPathPublication} from './qualified-fed-publication.mjs';
import {OCTOBER_CAPEX_SCHEMA} from './capex-october-panel.mjs';
const equal=(a,b)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const day=86400000;
const week=date=>{const n=Date.parse(`${date}T00:00:00Z`),weekday=new Date(n).getUTCDay();return n-(weekday+6)%7*day;};
export function verifyQualifiedRefresh({before,beforeHistory,after,history,today=new Date().toISOString().slice(0,10),now=()=>Date.now()}){
 const errors=[],check=(ok,label)=>{if(!ok)errors.push(label);};
 try{
  check(before.contractVersion==='bubble-watch-v3'&&before.scoring.model_version==='bubble-watch-v3-core23-shadow4-r5','baseline must be current r5');
  check(after.contractVersion===before.contractVersion&&after.scoring.model_version===before.scoring.model_version,'model changed');
  check(after.as_of_date===today&&before.as_of_date<=today&&Number.isFinite(Date.parse(after.generated_at))&&Date.parse(after.generated_at)<=now(),'refresh date invalid');
  check(validateEvidenceScoreFields(after).length===0,'score replay invalid');
  const meta=after.meta.qualified_refresh,anchor=before.meta?.qualified_refresh?.fullRefreshAsOfDate||before.as_of_date;
  check(meta&&equal(meta.indicatorIds,METHOD_ORDER)&&meta.carriedObservationCount===23&&meta.paidCalls===0,'qualified refresh scope invalid');
  check(meta.fullRefreshAsOfDate===anchor&&meta.carriedFromIssueDate===before.as_of_date,'complete refresh anchor changed');
  const age=(Date.parse(today+'T00:00:00Z')-Date.parse(anchor+'T00:00:00Z'))/day;
  check(Number.isFinite(age)&&age>=0&&age<=35,'complete refresh anchor expired');
  check(Array.isArray(after.meta.fetch_failures)&&after.meta.fetch_failures.length===0&&after.meta.paid_wind_fallback_count===0,'source failure or paid fallback');
  const byId=new Map(after.indicators.map(card=>[card.id,card]));
  const capex=byId.get('capex_reaction');
  check(capex?.status!=='unknown'&&capex?.provenance?.detail?.schemaVersion===OCTOBER_CAPEX_SCHEMA,'October capex evidence incomplete');
  check(validateQuarterlyCapexPublication(capex,today,{now}).length===0,'capex proof invalid');
  check(validateInsiderPublication(byId.get('insider_sell_buy'),today).length===0,'insider proof invalid');
  check(validateFedMarketPathPublication(byId.get('fed_policy'),today,{now:now()}).length===0,'Fed proof invalid');
  const abs=byId.get('dc_abs_spread'),beforeAbs=before.indicators.find(card=>card.id==='dc_abs_spread');
  check(abs?.status==='unknown'&&beforeAbs?.status==='unknown'&&abs.as_of===null&&abs.evidence_gap?.reasonCode==='dc_abs_direct_spread_unavailable'
   &&abs.evidence_gap.checkedDate===today&&abs.provenance.detail.status==='unknown','ABS gap changed or relabeled');
  for(const id of ['insider_sell_buy','fed_policy'])if(before.indicators.find(card=>card.id===id)?.status!=='unknown')check(byId.get(id)?.status!=='unknown',`${id} lost known evidence`);
  for(const prior of before.indicators.filter(card=>!METHOD_ORDER.includes(card.id))){
   const expected=structuredClone(prior);
   if(expected.provenance.mode!=='auto')expected.stale=Math.max(0,Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(expected.provenance.asOfDate+'T00:00:00Z'))/day))>expected.provenance.maxAgeDays;
   check(equal(byId.get(prior.id),expected),'unmigrated card changed');
  }
  check(equal(after.credit_spreads,before.credit_spreads)&&equal(after.market_technical_heat,before.market_technical_heat),'carried chart changed');
  check(!Object.hasOwn(after.summary,'weekly_editorial'),'old exact-bound AI commentary carried');
  check(history.contractVersion===beforeHistory.contractVersion&&Array.isArray(history.entries),'history layout invalid');
  check(equal({...history,entries:[]},{...beforeHistory,entries:[]}),'history metadata changed');
  const retained=beforeHistory.entries.filter(row=>!(week(row.date)===week(today)&&row.scoring_model_version===after.scoring.model_version));
  check(history.entries.length===retained.length+1&&retained.every(row=>history.entries.some(candidate=>equal(row,candidate))),'prior model/history rows changed');
  const latest=history.entries.at(-1);
  check(latest.date===today&&latest.scoring_model_version===after.scoring.model_version&&equal(latest.statuses,Object.fromEntries(after.indicators.map(card=>[card.id,card.status]))),'latest history differs');
 }catch{check(false,'malformed qualified refresh');}
 return {ok:errors.length===0,errors,paidCalls:0};
}
