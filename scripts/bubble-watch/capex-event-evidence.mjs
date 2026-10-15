// Pending-only capex event policy. No reviewed complete event adapter is admitted.
// A future numerical adapter requires a separate ADR/checker review, never a flag.
export const CAPEX_EVENT_COMPANIES=Object.freeze(['MSFT','META','AMZN','GOOGL']);
export const CAPEX_EVENT_POLICY='capex_latest_earnings_event_hold_v1';
function day(value) {
  const stamp=typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===value;
}
export function capexEventEvidenceHold(today) {
  if(!day(today)) throw new Error('Invalid capex check date');
  return {
    policy:CAPEX_EVENT_POLICY,
    adapterStatus:'not_admitted',
    status:'unknown',
    scope:'latest_quarterly_earnings_guidance_fixed_four',
    companies:[...CAPEX_EVENT_COMPANIES],
    qualifiedEventCount:0,
    qualifiedEvents:[],
    missingRequirements:[
      'complete_official_latest_earnings_listing',
      'reviewed_comparable_guidance_raise',
      'first_guidance_disclosure_timestamp',
      'first_full_regular_session_calendar',
      'matched_stock_and_qqq_prices'
    ],
    checkedDate:today,
    numericThresholdStatus:'not_admitted',
    legacyRollingReturnsEligible:false,
    newsCountEligible:false
  };
}
export function validateCapexEventPublication(card,today) {
  const errors=[];
  const check=(ok,msg)=>{if(!ok)errors.push(msg);};
  let expected;
  try{expected=capexEventEvidenceHold(today);}catch{return ['capex check date invalid'];}
  check(card?.id==='capex_reaction' && card.score_role==='core','capex identity invalid');
  check(card?.status==='unknown' && card.as_of===null && card.stale===false,'capex unadmitted events must remain pending');
  check(card?.provenance?.mode==='auto','capex evidence mode invalid');
  const clock=card?.provenance?.checkedAt;
  check(typeof clock==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(clock)
    && Number.isFinite(Date.parse(clock)) && clock.slice(0,10)===today
    && new Date(clock).toISOString()===(clock.length===20 ? clock.slice(0,-1)+'.000Z' : clock),'capex check clock invalid');
  const gap=card?.evidence_gap;
  check(gap?.policy==='bubble-qualified-evidence-v1' && gap.reasonCode==='capex_qualified_event_unavailable' && gap.checkedDate===today,'capex evidence gap invalid');
  // Exact canonical proof; cannot smuggle manual approvals, prior prices or rows.
  const detail=card?.provenance?.detail;
  check(detail && typeof detail==='object' && !Array.isArray(detail)
    && Object.keys(detail).length===Object.keys(expected).length
    && Object.keys(expected).every(key=>JSON.stringify(detail[key])===JSON.stringify(expected[key])), 'capex event hold proof differs from reviewed policy');
  return errors;
}
