import { correlation, quantile, digest, replayPressureInputs } from './pressure-model.mjs';
import { isHistoricalDate } from './historical-validation.mjs';

export function ranks(values) {
  const sorted=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value), output=[];
  for(let i=0;i<sorted.length;) { let j=i+1; while(j<sorted.length && sorted[j].value===sorted[i].value) j++;
    for(let k=i;k<j;k++) output[sorted[k].index]=(i+j-1)/2+1; i=j; }
  return output;
}
export function auc(scores, labels) {
  const positives=labels.filter(Boolean).length, negatives=labels.length-positives;
  if(!positives || !negatives) return null;
  const rank=ranks(scores), sum=rank.reduce((s,r,i)=>s+(labels[i] ? r : 0),0);
  return (sum-positives*(positives+1)/2)/(positives*negatives);
}
export function agreementMetrics(rows, evaluation) {
  const valid=rows.filter(row=>Number.isFinite(row.score)&&Number.isFinite(row.benchmark));
  const scores=valid.map(row=>row.score), labels=valid.map(row=>row.benchmark>0);
  let tp=0,fp=0,tn=0,fn=0;
  scores.forEach((score,i)=>{if(score>=evaluation.alertThreshold) labels[i] ? tp++ : fp++; else labels[i] ? fn++ : tn++;});
  return {n:valid.length,positiveWeeks:tp+fn,auroc:auc(scores,labels),
    rankCorrelation:valid.length>=3 ? correlation(ranks(scores),ranks(valid.map(row=>row.benchmark))) : null,
    confusion:{tp,fp,tn,fn},sensitivity:tp+fn ? tp/(tp+fn) : null,specificity:tn+fp ? tn/(tn+fp) : null,
    weightedError:valid.length ? (evaluation.falseNegativeCost*fn+evaluation.falsePositiveCost*fp)/valid.length : null,
    probabilityCalibrationApplicable:false,forecastLeadTimeApplicable:false};
}
export function bootstrapAgreement(rows, evaluation) {
  if(rows.length<26) return {status:'insufficient_weeks',rankCorrelation95:null};
  let state=evaluation.seed>>>0;
  const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  const estimates=[];
  for(let replicate=0;replicate<evaluation.bootstrapReplicates;replicate++) {
    const sample=[];
    while(sample.length<rows.length) { const start=Math.floor(random()*rows.length);
      for(let j=0;j<evaluation.blockBootstrapWeeks && sample.length<rows.length;j++) sample.push(rows[(start+j)%rows.length]); }
    const value=agreementMetrics(sample,evaluation).rankCorrelation;
    if(Number.isFinite(value)) estimates.push(value);
  }
  return {status:'retrospective_uncertainty_only',method:'circular_block_bootstrap',replicates:estimates.length,
    rankCorrelation95:estimates.length>=20 ? [quantile(estimates,0.025),quantile(estimates,0.975)] : null};
}

// Original dated records are immutable; duplicates cannot manufacture elapsed
// time, independent inputs or an unseen validation set.
export function validateShadowLedger(previous, protocol, implementationHash, now = new Date().toISOString()) {
  if(!previous) return;
  const last=previous.records?.at(-1);
  if(!last) throw new Error('Empty restored shadow ledger');
  // Reuse the complete integrity/replay check without adding or changing a row.
  appendShadowLedger(previous,{...last,implementationHash},protocol,now,true);
}
export function appendShadowLedger(previous, record, protocol, now = new Date().toISOString(), validateOnly = false) {
  const protocolHash=digest(protocol), records=previous?.records || [];
  if(previous && (previous.schemaVersion!=='pressure-shadow-ledger-v1' || previous.protocolHash!==protocolHash || previous.implementationHash!==record.implementationHash)) throw new Error('Shadow protocol mismatch; preserve and start a distinct cohort');
  const validateRecord=row=>{
    if(!isHistoricalDate(row.date)||!Number.isFinite(Date.parse(row.recordedAt))||row.recordedAt.slice(0,10)!==row.date
      ||Date.parse(row.recordedAt)>Date.parse(now)||!Number.isFinite(Date.parse(row.sourceRetrievedAt))
      ||row.sourceRetrievedAt.slice(0,10)!==row.date||Date.parse(row.sourceRetrievedAt)>Date.parse(row.recordedAt)
      ||row.protocolHash!==protocolHash||row.implementationHash!==record.implementationHash
      ||!row.scoreInputs||row.inputHash!==digest(row.scoreInputs)) throw new Error('Invalid restored shadow time, cohort or inputs');
    for(const key of Object.keys(protocol.sources)) {
      const evidence=row.scoreInputs.evidence?.[key];
      const age=(Date.parse(row.date)-Date.parse(evidence?.observationDate))/86400000, policy=protocol.sources[key];
      if(!isHistoricalDate(evidence?.observationDate)||!Number.isFinite(evidence.value)
        ||age<policy.assumedReleaseLagDays||age>policy.maxAgeDays||evidence.assumedReleaseLagDays!==policy.assumedReleaseLagDays) throw new Error('Invalid shadow evidence');
    }
    if(!row.scoreInputs.references?.spx||['us10y','dxy','brent'].some(key=>!Number.isFinite(row.scoreInputs.references?.[key]?.value))) throw new Error('Missing shadow references');
    const {evidence,references,features}=row.scoreInputs, value=key=>evidence[key].value;
    for(const key of ['us10y','dxy','brent']) {
      const gap=(Date.parse(evidence[key].observationDate)-Date.parse(references[key].date))/86400000;
      if(!isHistoricalDate(references[key].date)||gap<28||gap>32) throw new Error('Invalid shadow reference date');
    }
    const equity=references.spx,span=(Date.parse(equity.endDate)-Date.parse(equity.startDate))/86400000;
    if(!isHistoricalDate(equity.startDate)||equity.endDate!==evidence.spx.observationDate||span<330||span>365
      ||!Number.isInteger(equity.observations)||equity.observations<200||!Number.isFinite(equity.high)||equity.high<value('spx')
      ||['vix','spx','dxy','brent'].some(key=>value(key)<=0)||references.dxy.value<=0||references.brent.value<=0) throw new Error('Invalid shadow market reference');
    const rebuilt={credit:value('baa10y'),volatility:Math.log(value('vix')),equity:-Math.log(value('spx')/equity.high),
      rates:Math.abs(value('us10y')-references.us10y.value),dollarFunding:Math.max(0,Math.log(value('dxy')/references.dxy.value)),
      oil:Math.abs(Math.log(value('brent')/references.brent.value)),inflation:value('breakeven10y')};
    if(Object.entries(rebuilt).some(([key,value])=>!Number.isFinite(features?.[key])||Math.abs(value-features[key])>1e-12)) throw new Error('Shadow feature replay mismatch');
    for(const variant of protocol.variants) {
      const replay=replayPressureInputs(row.scoreInputs.features,row.scoreInputs.parameters?.[variant.id],variant);
      if(!Number.isFinite(row.variantScores?.[variant.id])||Math.abs(replay-row.variantScores[variant.id])>1e-9) throw new Error('Shadow score replay mismatch');
    }
    if(!protocol.variants.some(v=>v.id===row.variant)||!Number.isFinite(row.score)||Math.abs(row.score-row.variantScores[row.variant])>1e-9) throw new Error('Shadow reference variant mismatch');
  };
  const seen=new Set(); let priorHash=null,previousDate='';
  for(const row of records) {
    if(!isHistoricalDate(row.date)||row.date<=previousDate||seen.has(row.date)||row.previousHash!==priorHash||row.recordHash!==digest({...row,recordHash:undefined})) throw new Error('Shadow ledger integrity failure');
    validateRecord(row);seen.add(row.date); priorHash=row.recordHash;previousDate=row.date;
  }
  if(previous&&records.length&&previous.createdAt!==records[0].recordedAt) throw new Error('Invalid cohort creation date');
  if(validateOnly) return;
  if(record.date!==now.slice(0,10)||record.recordedAt!==now||!Number.isFinite(Date.parse(now))) throw new Error('Shadow backfill/future recording forbidden');
  if(record.protocolHash!==protocolHash||typeof record.inputHash!=='string'||!record.inputHash||typeof record.implementationHash!=='string'||!record.implementationHash||!Number.isFinite(record.score)) throw new Error('Invalid shadow record');
  validateRecord(record);
  if(records.some(row=>row.date>record.date)) throw new Error('Shadow date regression');
  if(seen.has(record.date)) return structuredClone(previous);
  const next={...record,previousHash:priorHash}; next.recordHash=digest(next);
  return {schemaVersion:'pressure-shadow-ledger-v1',protocolHash,implementationHash:record.implementationHash,createdAt:previous?.createdAt||now,records:[...records,next]};
}

export function shadowReadiness(ledger, protocol, benchmarkWeeks = 0) {
  const rows=ledger?.records||[], dates=rows.map(row=>Date.parse(`${row.date}T00:00:00Z`));
  const span=dates.length ? (Math.max(...dates)-Math.min(...dates))/86400000 : 0;
  // Recalibrating coefficients alone must not manufacture new market inputs.
  const distinct=new Set(rows.map(row=>digest({evidence:row.scoreInputs.evidence,references:row.scoreInputs.references}))).size, e=protocol.evaluation;
  return {eligibleForProduction:false,elapsedDays:span,records:rows.length,distinctInputs:distinct,benchmarkWeeks,
    elapsedTimeGatePassed:span>=e.minimumProspectiveDays,
    distinctInputsGatePassed:distinct>=e.minimumDistinctProspectiveInputs,
    benchmarkWeeksGatePassed:benchmarkWeeks>=e.minimumProspectiveBenchmarkWeeks,
    independentModelReviewRequired:true,
    reason:'research_and_shadow_do_not_authorize_automatic_model_promotion'};
}
