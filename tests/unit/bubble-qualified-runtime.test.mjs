import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQualifiedAbsFixture } from '../helpers/bubble-qualified-builder.mjs';
import { validateEvidenceScoreFields } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';

test('actual builder ABS dry-run has no network or production writes and preserves 26 original clocks',async()=>{
  const r=await buildQualifiedAbsFixture();
  assert.equal(r.networkCalls,0);
  assert.deepEqual([...r.writes.keys()],['manual-artifacts/bubble-qualified-refresh-candidate.json']);
  const before=r.baseline['data/bubble-watch.json'];
  for(const i of r.output.indicators.filter(i=>i.id!=='dc_abs_spread')) {
    const previous=before.indicators.find(row=>row.id===i.id);
    assert.deepEqual(i,previous);
  }
  const abs=r.output.indicators.find(i=>i.id==='dc_abs_spread');
  assert.equal(abs.status,'unknown');assert.equal(abs.as_of,null);assert.equal(abs.evidence_gap.checkedDate,'2026-10-13');
  assert.deepEqual(validateEvidenceScoreFields(r.output),[]);
  assert.deepEqual(r.output.summary.primary_score_range_pct,{lower:30.4,upper:34.8});
  assert.equal(r.output.summary.primary_score_pct,null);
  assert.match(r.output.summary.verdict_desc,/待确认/u);assert.ok(r.output.summary.verdict_desc.length>=650);
  assert.deepEqual(r.output.history_seed,[]);
  assert.deepEqual(r.history.entries.slice(0,-1),r.baseline['data/bubble-watch-history.json'].entries);
  assert.ok(r.output.summary.similarity.every(s=>s.denominator>0));
  const input=buildWeeklyEditorialInput({bubbleWatch:r.output});
  assert.equal(input.scoringSnapshot.primaryScorePct,null);
});
test('explicit qualified publication writes only the two Bubble outputs without a request',async()=>{
  const r=await buildQualifiedAbsFixture({publish:true});
  assert.equal(r.networkCalls,0);
  assert.deepEqual([...r.writes.keys()],['data/bubble-watch.json','data/bubble-watch-history.json']);
  assert.equal(r.output.summary.scoring_unknown_count,1);
  assert.equal(r.output.meta.qualified_refresh.carriedObservationCount,26);
});

test('repeated qualified refresh cannot renew its complete-refresh anchor',async()=>{
  const first=await buildQualifiedAbsFixture();
  const second=await buildQualifiedAbsFixture({baselineOutput:first.output,baselineHistory:first.history,clock:'2026-10-14T12:00:00Z'});
  assert.equal(second.output.as_of_date,'2026-10-14');
  for (const item of second.output.indicators.filter(i=>i.id!=='dc_abs_spread')) assert.deepEqual(item,first.output.indicators.find(i=>i.id===item.id));
  assert.equal(second.output.meta.qualified_refresh.fullRefreshAsOfDate,'2026-10-12');
  for (const publish of [false,true]) await assert.rejects(
    buildQualifiedAbsFixture({publish,baselineOutput:second.output,baselineHistory:second.history,clock:'2026-11-17T12:00:00Z'}),
    error=>/complete-refresh anchor/u.test(error.message)&&error.fixtureWrites.length===0&&error.fixtureNetworkCalls===0
  );
  const malformed=structuredClone(second.output);delete malformed.meta.qualified_refresh.fullRefreshAsOfDate;
  await assert.rejects(buildQualifiedAbsFixture({baselineOutput:malformed}),/complete-refresh anchor/u);
});

test('source health warns about pending evidence while retaining checker hard failures',()=>{
  const source=fs.readFileSync(new URL('../../scripts/audit-bubble-watch-sources.mjs',import.meta.url),'utf8');
  const functionSource=source.slice(source.indexOf('function buildReport('),source.indexOf('function markdownReport('));
  const context=vm.createContext({allowPaidWind:false,EXPECTED_PAID_FALLBACK_IDS:[],EXPECTED_CANDIDATE_ONLY_IDS:new Set(),EVIDENCE_GAP_POLICIES:{},
    isExpectedPaidSkip:()=>false,isExpectedCandidateOnly:()=>false,isExpectedPolicyFallback:()=>false,isExpectedPolicyFetchFailure:()=>false,
    isExpectedPolicyDegradedLiveRow:()=>false,sourceWarningLines:()=>[]});
  vm.runInContext(functionSource+'globalThis.report=buildReport;',context);
  const data={meta:{},indicators:[{id:'dc_abs_spread',status:'unknown',provenance:{mode:'auto'},evidence_gap:{reasonCode:'dc_abs_direct_spread_unavailable'}}]};
  const healthy={code:0,text:''};
  const result=context.report(data,healthy,healthy);
  assert.equal(result.status,'warn');assert.match(result.sourceWarnings[0],/dc_abs_spread/u);
  assert.equal(context.report(data,healthy,{code:1}).status,'fail');
  data.indicators[0].status='green';assert.equal(context.report(data,healthy,healthy).status,'pass');
  data.indicators=[{id:'insider_sell_buy',status:'yellow',provenance:{mode:'auto',detail:{
    policy:'insider_fixed_12_30_90_v1',coverageStatus:'returned_sample_completeness_unverified',
    rejectedSamples:[{symbol:'META',reason:'duplicate_transaction'}]
  }}}];
  assert.equal(context.report(data,healthy,healthy).status,'warn');
  assert.ok(context.report(data,healthy,healthy).sourceWarnings.some(line=>/META.*duplicate_transaction/u.test(line)));
  data.meta.fetch_failures=[{id:'insider_sell_buy',reason:'http_403'}];
  assert.equal(context.report(data,healthy,healthy).status,'fail');
});
