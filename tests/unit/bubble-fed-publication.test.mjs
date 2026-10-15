import test from 'node:test';import assert from 'node:assert/strict';
import {collectFedMarketPath}from'../../scripts/bubble-watch/fed-market-path-collector.mjs';
import {qualifyFedMarketPath}from'../../scripts/bubble-watch/qualified-fed-path.mjs';
import {validateFedMarketPathPublication,FED_PATH_LABELS,FED_THRESHOLD_TEXT}from'../../scripts/bubble-watch/qualified-fed-publication.mjs';
import {today,now,transport}from'../helpers/bubble-fed-source-fixtures.mjs';
function card(report){return {id:'fed_policy',axis:'trigger',category:'macro',score_role:'core',status:report.result.status,
 as_of:report.result.status==='unknown'?null:report.result.quoteLabelDate,stale:false,
 value_display:FED_PATH_LABELS[report.result.status],threshold_text:FED_THRESHOLD_TEXT,
 provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report},
 ...(report.result.status==='unknown'?{evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today}}:{})};}
async function fixture(options){return card(await collectFedMarketPath({today,now,fetchFn:transport(options).fetchFn}));}
const validate=c=>validateFedMarketPathPublication(c,today,{now:now()});
test('publication replays actual metadata, rational paths, display horizon and collection budget',async()=>{
 const c=await fixture();assert.deepEqual(validate(c),[]);
 for(const mutate of [c=>c.status='green',c=>c.as_of=today,c=>c.provenance.checkedAt='2026-10-15T12:00:01Z',
 c=>c.value_display='年末路径隐含加息',c=>c.threshold_text='0=绿',
 c=>c.provenance.detail.result.paths[0].expectedRatePct=0,c=>c.provenance.detail.result.paths[0].delta.numerator='0',
 c=>c.provenance.detail.result.thresholdBp=10,c=>c.provenance.detail.collectionPolicy.applicationRetries=1,
 c=>c.provenance.detail.collectionPolicy.maximumRequests=100,c=>c.provenance.detail.attemptedSources[2]='ZQZ26.CBT']){
  const changed=structuredClone(c);mutate(changed);assert.ok(validate(changed).length);
 }
});
test('unknown source reports preserve a real gap without admitting raw rows or private fields',async()=>{
 for(const options of [{statusSource:'calendar',status:403},{statusSource:'DFF',status:500},{statusSource:'ZQF27.CBT',status:429},{barMode:'timezone'}]){
  const c=await fixture(options);assert.equal(c.status,'unknown');assert.deepEqual(validate(c),[],JSON.stringify(c));
 }
 const c=await fixture();
 for(const [index,mutate] of [r=>r.sourceEvidence.calendar.latestConfirmed=true,r=>r.sourceEvidence.baseline.rawRows=[],
 r=>r.sourceEvidence.quotes[0].rawRows=[],r=>r.sourceEvidence.quotes[0].apiKey='must_not_be_allowed',
 r=>r.result.rawRows=[],r=>r.collectionPolicy.rawBody='must_not_be_allowed',r=>r.sourceFailures.push({source:'DFF',reason:'http_500',rawBody:'private'})].entries()){
  const changed=structuredClone(c);mutate(changed.provenance.detail);
  // Even reclassifying the modified input as pending cannot smuggle unreviewed public fields.
  const r=changed.provenance.detail;if(index<4)r.result=qualifyFedMarketPath(r.sourceEvidence,today,r.checkedAt);
  changed.status=r.result.status;changed.as_of=r.result.status==='unknown'?null:r.result.quoteLabelDate;
  changed.value_display=FED_PATH_LABELS[changed.status];
  if(changed.status==='unknown')changed.evidence_gap={policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today};
  assert.ok(validate(changed).length);
 }
});
test('request prefix cannot conceal retries or an unexplained early stop',async()=>{
 const c=await fixture();
 for(const mutate of [r=>r.attemptedSources.splice(2),r=>r.attemptedSources.splice(1),r=>r.attemptedSources.push(r.attemptedSources.at(-1)),
 r=>r.sourceFailures.push({source:'not_requested',reason:'http_403'}),r=>r.qualityIssues.push({source:'calendar',reason:'approval_granted'})]){
  const changed=structuredClone(c);mutate(changed.provenance.detail);changed.provenance.detail.collectionPolicy.actualRequests=changed.provenance.detail.attemptedSources.length;
  assert.ok(validate(changed).length);
 }
 const changed=structuredClone(c);changed.provenance.detail.checkedAt='2026-10-15T12:00:00.001Z';changed.provenance.checkedAt=changed.provenance.detail.checkedAt;
 assert.ok(validate(changed).some(e=>e.endsWith('check clock')));
});


test('pending reports cannot retain observations from failed or unrequested stages',async()=>{
 const original=await fixture();
 for(const mutate of [r=>{r.attemptedSources=['calendar'];r.sourceFailures=[{source:'calendar',reason:'http_403'}];},
  r=>{r.attemptedSources=['calendar'];r.sourceFailures=[];r.qualityIssues=[{source:'calendar',reason:'unsupported_calendar_horizon'}];},
  r=>{r.attemptedSources=['calendar','DFF'];r.sourceFailures=[{source:'DFF',reason:'http_500'}];},
  r=>{r.attemptedSources.splice(3);r.sourceFailures=[{source:r.attemptedSources.at(-1),reason:'http_429'}];},
  r=>{r.sourceFailures=[{source:r.attemptedSources.at(-1),reason:'http_500'}];},
  r=>{r.qualityIssues=[{source:r.attemptedSources.at(-1),reason:'historical_daily_bar_unqualified'}];}]){
  const changed=structuredClone(original),r=changed.provenance.detail;mutate(r);
  r.collectionPolicy.actualRequests=r.attemptedSources.length;
  r.sourceEvidence.baseline.observedAt='2026-10-01';
  r.result=qualifyFedMarketPath(r.sourceEvidence,today,r.checkedAt);
  changed.status='unknown';changed.as_of=null;changed.value_display=FED_PATH_LABELS.unknown;
  changed.evidence_gap={policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today};
  assert.equal(r.result.status,'unknown');assert.ok(validate(changed).length);
 }
 const empty=structuredClone(original),r=empty.provenance.detail;r.sourceEvidence.quotes=[];
 r.result=qualifyFedMarketPath(r.sourceEvidence,today,r.checkedAt);empty.status='unknown';empty.as_of=null;empty.value_display=FED_PATH_LABELS.unknown;
 empty.evidence_gap={policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today};
 assert.ok(validate(empty).some(e=>e.includes('empty quote stage')));
});
