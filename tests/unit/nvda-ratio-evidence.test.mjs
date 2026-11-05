import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { inspectNvdaNumerator, qualifyNvdaRatio, validateNvdaRatioRecord, buildNvdaGap } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
import { qualifiedEdgarLtmRevenue, qualifiedMirrorLtmRevenue } from '../../scripts/bubble-watch/ltm-revenue.mjs';
import { isRegisteredEvidenceGap, replayEvidenceScores, validateEvidenceScoreFields } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { nvdaDisplayState } from '../../scripts/modules/evidenceAge.js';
import { NVDA_NUMERATOR_MAX_AGE_DAYS, nvdaNumeratorAgeAt } from '../../scripts/modules/nvdaEvidencePolicy.js';
import { nvdaEvidenceFixture } from '../helpers/nvda-evidence-fixture.mjs';

// Entirely synthetic same-period records; no assertion of real commitments.
const today = '2026-11-04', clock = `${today}T12:00:00Z`;
const quarters = [
  ['2025-07-28','2025-10-26',50,'2025-11-20'], ['2025-10-27','2026-01-25',60,'2026-02-20'],
  ['2026-01-26','2026-04-26',70,'2026-05-20'], ['2026-04-27','2026-07-26',80,'2026-08-25']
].map(([start,end,value,filed]) => ({start,end,val:value*1e9,filed,form:'10-Q'}));
function config() { return { params: { nvdaCommitments: {
  contractVersion:'nvda-period-aligned-commitments-v1',issuer:'NVDA',currency:'USD',usd:50e9,
  basis:'signed_customer_equity_commitments_in_period', includesGuarantees:false, includesCollateralizedDebt:false,
  asOfDate:'2026-11-01',periodStart:'2025-07-28',periodEnd:'2026-07-26',review:{status:'accepted',reviewedAt:'2026-11-01'},
  records:[{id:'synthetic-only',kind:'equity_commitment',bindingStatus:'signed',counterpartyRole:'customer',
    signedDate:'2026-06-01',usd:50e9,sourceUrl:'https://investor.nvidia.com/synthetic-fixture'}]
} }, autoFallback:{nvda_invest_revenue:{asOfDate:'2026-11-01',maxAgeDays:30}} }; }
const source = {provider:'SEC',issuer:'NVDA',currency:'USD',url:'https://data.sec.gov/api/xbrl/companyconcept/CIK0001045810/us-gaap/Revenues.json'};
function revenue() { return {...qualifiedEdgarLtmRevenue(quarters,today),source}; }
function qualified() { return qualifyNvdaRatio(inspectNvdaNumerator(config(),today),revenue()); }
const base = {id:'nvda_invest_revenue',score_role:'core',axis:'stage',category:'capital'};
test('malformed top-level indicator containers return a contract error instead of throwing',()=>{
  for(const indicators of [null,{},'bad']) assert.deepEqual(validateEvidenceScoreFields({contractVersion:'bubble-watch-v3',scoring:{model_version:'bubble-watch-v3-core23-shadow4-r5'},indicators}),['Expected 27 evidence cards']);
});
function item() { const proof=qualified(); return {...base,status:'yellow',as_of:'2026-07-26',stale:false,value_display:'≈19%',note:'synthetic',provenance:{mode:'auto',detail:{...proof,qualificationStatus:'qualified',currentEligible:true}}}; }
function atNumeratorDate(recordDate, issueDate = today) {
  const c=config();c.params.nvdaCommitments.asOfDate=recordDate;c.params.nvdaCommitments.review.reviewedAt=recordDate;
  c.autoFallback.nvda_invest_revenue.asOfDate=recordDate;
  const numerator=inspectNvdaNumerator(c,issueDate);
  const proof=qualifyNvdaRatio(numerator,{...qualifiedEdgarLtmRevenue(quarters,issueDate),source});
  assert.equal(proof.status,'qualified');
  return {...item(),provenance:{mode:'auto',detail:{...proof,qualificationStatus:'qualified',currentEligible:true}}};
}
function inlineNvda() {
  const html=fs.readFileSync('bubble-watch.html','utf8');
  const source=html.split('// BEGIN INLINE EVIDENCE AGE')[1].split('// END INLINE EVIDENCE AGE')[0];
  return vm.runInNewContext(`${source}\n nvdaDisplayState`);
}
function assertQualification(record, auditDate, expected) {
  assert.equal(validateNvdaRatioRecord(record,auditDate).length===0,expected,'backend');
  const at=Date.parse(`${auditDate}T12:00:00Z`);
  assert.equal(nvdaDisplayState(record,at).qualified,expected,'module frontend');
  assert.equal(inlineNvda()(record,at).qualified,expected,'single-file frontend');
}

test('trusted numerator policy matches curated configuration and cannot be selected by an evidence record',()=>{
  const c=JSON.parse(fs.readFileSync('config/bubble-watch-curated.json'));
  assert.equal(NVDA_NUMERATOR_MAX_AGE_DAYS,30);
  assert.equal(c.autoFallback.nvda_invest_revenue.maxAgeDays,NVDA_NUMERATOR_MAX_AGE_DAYS);
  for(const limit of [undefined,null,9000,31,0,'30']) {
    const current=item();current.provenance.detail.numerator.freshness.maxAgeDays=limit;
    assertQualification(current,today,false);
    assert.equal(qualifyNvdaRatio(current.provenance.detail.numerator,current.provenance.detail.revenue).status,'unavailable');
    const cfg=config();cfg.autoFallback.nvda_invest_revenue.maxAgeDays=limit;
    assert.equal(inspectNvdaNumerator(cfg,today).status,'unavailable');
  }
  const missing=item();delete missing.provenance.detail.numerator.freshness;
  assertQualification(missing,today,false);
});
test('99-day numerator cannot claim a 9000-day policy or forged fresh age/status',()=>{
  const forged=item(),n=forged.provenance.detail.numerator;
  n.asOfDate='2026-07-28';
  n.freshness={observationDate:n.asOfDate,asOfDate:today,ageDays:99,maxAgeDays:9000,status:'fresh'};
  assertQualification(forged,today,false);
  n.freshness.maxAgeDays=30;n.freshness.ageDays=0;
  assert.equal(nvdaNumeratorAgeAt(n,today),null);
  assertQualification(forged,today,false);
  n.freshness={observationDate:n.asOfDate,asOfDate:'2026-07-31',ageDays:3,maxAgeDays:30,status:'fresh'};
  assert.equal(nvdaNumeratorAgeAt(n,today).ageDays,99);
  assertQualification(forged,today,false);
});
test('stored freshness fields cannot disagree with their original clock in either frontend or backend',()=>{
  for(const patch of [{ageDays:99},{status:'stale'},{observationDate:'2026-10-01'},{asOfDate:'2026-11-05'}]) {
    const bad=item();Object.assign(bad.provenance.detail.numerator.freshness,patch);assertQualification(bad,today,false);
  }
});
test('real 29/30-day boundaries qualify; 31 days retires a previously eligible numerator',()=>{
  assertQualification(atNumeratorDate('2026-10-06'),today,true);
  assertQualification(atNumeratorDate('2026-10-05'),today,true);
  const expired=atNumeratorDate('2026-10-04','2026-11-03');
  assertQualification(expired,'2026-11-03',true);
  assertQualification(expired,today,false);
  const cfg=config();cfg.params.nvdaCommitments.asOfDate='2026-10-04';cfg.params.nvdaCommitments.review.reviewedAt='2026-10-04';
  cfg.autoFallback.nvda_invest_revenue.asOfDate='2026-10-04';
  assert.equal(inspectNvdaNumerator(cfg,today).reason,'numerator_record_stale');
  const future=item();future.provenance.detail.numerator.asOfDate='2026-11-05';assertQualification(future,today,false);
});
test('missing or widened revenue policy also fails consistently in backend and both frontends',()=>{
  for(const limit of [undefined,9000]) {
    const bad=item();bad.provenance.detail.revenue.freshness.maxAgeDays=limit;assertQualification(bad,today,false);
  }
});
test('unaltered prior-day proof remains eligible without renewing its recorded clocks or ages',()=>{
  const carried=nvdaEvidenceFixture('2026-11-01','2026-11-03'),before=JSON.stringify(carried);
  assert.equal(carried.provenance.detail.numerator.freshness.ageDays,2);
  assertQualification(carried,'2026-11-03',true);
  assertQualification(carried,'2026-11-04',true);
  assert.equal(nvdaNumeratorAgeAt(carried.provenance.detail.numerator,'2026-11-04').ageDays,3);
  assert.equal(JSON.stringify(carried),before);
});
test('carried revenue accepts day 120 and retires at day 121 independently of the numerator',()=>{
  const record=nvdaEvidenceFixture('2026-11-20','2026-11-22'),before=JSON.stringify(record);
  assert.equal(record.provenance.detail.revenue.freshness.ageDays,119);
  assertQualification(record,'2026-11-23',true);
  assertQualification(record,'2026-11-24',false);
  assert.equal(JSON.stringify(record),before);
});
test('carry rejects altered proof clocks/ages, changed original review date and future proofs',()=>{
  for(const mutate of [
    d=>d.numerator.freshness.ageDays=0,d=>d.revenue.freshness.ageDays=0,
    d=>d.numerator.freshness.asOfDate='2026-11-04',d=>d.revenue.freshness.asOfDate='2026-11-04',
    d=>d.revenue.freshness.observationDate='2026-07-25',d=>d.numerator.review.reviewedAt='2026-11-04',
    d=>d.numerator.freshness.maxAgeDays=9000,d=>d.revenue.freshness.maxAgeDays=9000
  ]) {
    const bad=nvdaEvidenceFixture('2026-11-01','2026-11-03');mutate(bad.provenance.detail);assertQualification(bad,today,false);
  }
  assertQualification(nvdaEvidenceFixture('2026-11-01','2026-11-05'),today,false);
  const badClock=nvdaEvidenceFixture('2026-11-01','2026-11-03');assertQualification(badClock,'2026-02-30',false);
});

test('comparable four-quarter inputs replay the unchanged ratio and light thresholds',()=>{
  assert.equal(qualified().ratioPct,50/260*100); assert.deepEqual(validateNvdaRatioRecord(item(),today),[]);
  assert.equal(nvdaDisplayState(item(),Date.parse(clock)).qualified,true);
  const bad=item();bad.status='green';assert.notDeepEqual(validateNvdaRatioRecord(bad,today),[]);
});
test('actual newer ledger is protected, never parsed from prose or replaced by old parameters',()=>{
  const c=JSON.parse(fs.readFileSync('config/bubble-watch-curated.json'));
  const before=JSON.stringify(c), n=inspectNvdaNumerator(c,today);
  assert.equal(n.status,'unavailable');assert.equal(n.reason,'newer_ledger_requires_comparable_evidence');
  assert.equal(n.newerLedgerProtected,true);assert.equal(n.latestLedgerDate,c.autoFallback.nvda_invest_revenue.asOfDate);
  assert.equal(JSON.stringify(c),before);
});
test('cumulative, guarantees, unsigned intent, missing dates, wrong currency or unmatched records cannot qualify',()=>{
  for(const change of [p=>p.basis='cumulative_commitments',p=>p.includesGuarantees=true,p=>p.includesCollateralizedDebt=true,
    p=>p.currency='CNY',p=>p.review.status='pending',p=>p.records[0].bindingStatus='letter_of_intent',
    p=>p.records[0].signedDate='2026-07-27',p=>p.records[0].sourceUrl='https://example.com/press',
    p=>p.records.push({...p.records[0]}),p=>p.usd+=100,p=>p.asOfDate='2026-11-05',p=>p.periodStart=null]) {
    const c=config();change(c.params.nvdaCommitments);assert.equal(inspectNvdaNumerator(c,today).status,'unavailable',change.toString());
  }
});
test('different periods, stale revenue, wrong issuer, quarter gap and forged fresh label all fail closed',()=>{
  for(const change of [r=>r.quarters[0].start='2025-07-29',r=>r.quarters[1].start='2025-10-28',
    r=>r.value+=1,r=>r.source={...source,issuer:'AMD'},r=>r.source={...source,currency:'EUR'},
    r=>r.freshness.maxAgeDays=9000,r=>r.observationDate='2026-11-04']) {
    const r=revenue();change(r);assert.equal(qualifyNvdaRatio(inspectNvdaNumerator(config(),today),r).status,'unavailable',change.toString());
  }
  const c=config();c.params.nvdaCommitments.periodStart='2025-07-29';
  assert.equal(qualifyNvdaRatio(inspectNvdaNumerator(c,today),revenue()).status,'unavailable');
  const late='2026-12-01', freshNum=config();freshNum.params.nvdaCommitments.asOfDate=late;freshNum.params.nvdaCommitments.review.reviewedAt=late;
  freshNum.autoFallback.nvda_invest_revenue.asOfDate=late;
  const r=revenue();r.freshness={...r.freshness,status:'fresh',asOfDate:late,ageDays:0};
  assert.equal(qualifyNvdaRatio(inspectNvdaNumerator(freshNum,late),r).status,'unavailable');
});
test('r5 narrowly registers the gap and keeps the fixed Core-23 uncertainty denominator',()=>{
  const gap=buildNvdaGap(base,today,inspectNvdaNumerator(JSON.parse(fs.readFileSync('config/bubble-watch-curated.json')),today),clock);
  assert.equal(isRegisteredEvidenceGap(gap,{revision:5,asOfDate:today}),true);
  for(const revision of [1,2,3,4]) assert.equal(isRegisteredEvidenceGap(gap,{revision,asOfDate:today}),false);
  for(const mutate of [i=>i.id='cape',i=>i.as_of=today,i=>i.stale=true,i=>i.provenance.detail.ratioPct=0,
    i=>i.provenance.detail.currentEligible=true,i=>i.evidence_gap.checkedDate='2026-11-03']) {
    const bad=structuredClone(gap);mutate(bad);assert.equal(isRegisteredEvidenceGap(bad,{revision:5,asOfDate:today}),false);
  }
  const data=JSON.parse(fs.readFileSync('data/bubble-watch.json'));
  const cards=data.indicators.map(i=>i.id===base.id?gap:i), r=replayEvidenceScores(cards,5);
  assert.equal(r.primary,null);assert.equal(Object.values(r.counts).reduce((a,b)=>a+b),23);
  assert.equal(r.counts.unknown,2);assert.deepEqual(r.primaryRange,{lower:26.1,upper:34.8});
});
test('legacy ratio and expired qualified evidence cannot be presented as current; publication stays intact',()=>{
  const legacy=JSON.parse(fs.readFileSync('data/bubble-watch.json')).indicators.find(i=>i.id===base.id);
  const before=JSON.stringify(legacy);assert.equal(nvdaDisplayState(legacy,Date.parse(clock)).qualified,false);
  assert.match(nvdaDisplayState(legacy).value,/待核验/);assert.equal(JSON.stringify(legacy),before);
  assert.equal(nvdaDisplayState(item(),Date.parse('2026-12-01')).qualified,false);
  const wrong=item();wrong.provenance.detail.revenue.periodStart='2025-07-29';assert.equal(nvdaDisplayState(wrong,Date.parse(clock)).qualified,false);
});

function runtime(c,responses=[]) {
  const code=fs.readFileSync('scripts/build-bubble-watch.mjs','utf8');
  const concept=code.slice(code.indexOf('async function edgarConcept('),code.indexOf('async function edgarSubmissions('));
  const a=code.indexOf("    if (EVIDENCE_REVISION >= 5 && def.id === 'nvda_invest_revenue'");
  const b=code.indexOf("    if (EVIDENCE_REVISION >= 4 && def.id === 'fed_policy'",a);
  const calls=[];
  const RealDate=Date;class FixedDate extends RealDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return RealDate.parse(clock);}}
  const context={Date:FixedDate,EVIDENCE_REVISION:5,QUALIFIED_REFRESH_ONLY:false,config:c,today,inspectNvdaNumerator,qualifyNvdaRatio,buildNvdaGap,
    qualifiedEdgarLtmRevenue,qualifiedMirrorLtmRevenue,EDGAR_CIK:{NVDA:'0001045810'},EDGAR_UA:'offline-test',
    baseIndicator:()=>({...base}),classifyNumeric:(v,r,y)=>v>r?'red':v>y?'yellow':'green',
    fetchWithTimeout:async url=>{calls.push(url);const r=responses[calls.length-1];if(r instanceof Error)throw r;return {cik:1045810,units:{USD:r}};},
    fetchSaFinancialPage:async()=>{calls.push('mirror');throw new Error('fixture mirror unavailable');}};
  const run=vm.runInNewContext(`${concept}\n async function run(){const indicators=[];let autoCount=0;for(const def of [{id:'nvda_invest_revenue'}]){${code.slice(a,b)}}return indicators[0];} run`,context);
  return {run,calls};
}
test('actual r5 builder performs zero revenue calls for the protected newer text ledger',async t=>{
  // VM Date cannot freeze an imported helper's default clock in the ESM realm.
  // Freeze that realm too, without replacing the production helper or its gate.
  t.mock.timers.enable({apis:['Date'],now:Date.parse(clock)});
  const c=JSON.parse(fs.readFileSync('config/bubble-watch-curated.json')),r=runtime(c),out=await r.run();
  assert.equal(out.status,'unknown');assert.equal(out.as_of,null);assert.equal(r.calls.length,0);
  assert.equal(out.provenance.checkedAt,new Date(clock).toISOString());
  assert.equal(isRegisteredEvidenceGap(out,{revision:5,asOfDate:today}),true);
});

test('actual gap default clock accepts the issue day edges and rejects UTC rollover',async t=>{
  const c=JSON.parse(fs.readFileSync('config/bubble-watch-curated.json'));
  for(const checkedAt of [`${today}T00:00:00.000Z`,`${today}T23:59:59.999Z`]) {
    t.mock.timers.enable({apis:['Date'],now:Date.parse(checkedAt)});
    const r=runtime(c),out=await r.run();
    assert.equal(out.provenance.checkedAt,checkedAt);assert.equal(r.calls.length,0);
    assert.equal(isRegisteredEvidenceGap(out,{revision:5,asOfDate:today}),true);
    t.mock.timers.reset();
  }
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-05T00:00:00.000Z')});
  const crossed=runtime(c);
  await assert.rejects(crossed.run(),/nvda_check_clock_invalid/);
  assert.equal(crossed.calls.length,0);
});
test('actual r5 builder rejects stale first SEC concept, then qualifies the current concept',async()=>{
  const old=quarters.map(q=>({...q,start:q.start.replace('2025','2018').replace('2026','2019'),end:q.end.replace('2025','2018').replace('2026','2019')}));
  const r=runtime(config(),[old,quarters]),out=await r.run();assert.equal(r.calls.length,2);
  assert.match(r.calls[1],/Revenues\.json$/);assert.equal(out.status,'yellow');assert.equal(out.as_of,'2026-07-26');
  assert.deepEqual(validateNvdaRatioRecord(out,today),[]);
});
