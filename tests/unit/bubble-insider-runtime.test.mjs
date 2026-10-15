import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQualifiedAbsFixture } from '../helpers/bubble-qualified-builder.mjs';
import { validateEvidenceScoreFields } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import { validateInsiderPublication } from '../../scripts/bubble-watch/qualified-insider-publication.mjs';

test('actual r2 builder collects only bounded insider requests and carries 25 cards/history',async()=>{
  const first=await buildQualifiedAbsFixture();
  const result=await buildQualifiedAbsFixture({revision:2,baselineOutput:first.output,baselineHistory:first.history,clock:'2026-10-15T12:00:00Z'});
  assert.equal(result.networkCalls,12);
  for(let i=1;i<result.requestStarts.length;i++)assert.ok(result.requestStarts[i]-result.requestStarts[i-1]>=6500);
  assert.deepEqual([...result.writes.keys()],['manual-artifacts/bubble-qualified-refresh-candidate.json']);
  for(const card of result.output.indicators.filter(i=>!['dc_abs_spread','insider_sell_buy'].includes(i.id))) {
    assert.deepEqual(card,first.output.indicators.find(i=>i.id===card.id));
  }
  assert.deepEqual(result.history.entries.slice(0,first.history.entries.length),first.history.entries);
  assert.equal(result.output.scoring.model_version,'bubble-watch-v3-core23-shadow4-r2');
  assert.equal(result.output.meta.qualified_refresh.fullRefreshAsOfDate,'2026-10-12');
  assert.equal(result.output.meta.qualified_refresh.carriedObservationCount,25);
  const card=result.output.indicators.find(i=>i.id==='insider_sell_buy');
  assert.equal(card.status,'yellow');assert.equal(card.as_of,'2026-10-14');
  assert.match(card.source_name,/XOOMAR/u);assert.match(card.note,/完整性未核实/u);
  assert.deepEqual(validateInsiderPublication(card,result.output.as_of_date),[]);
  assert.deepEqual(validateEvidenceScoreFields(result.output),[]);
  assert.equal(JSON.stringify(result.output).includes('FixtureInsiderPrivate'),false);
});

test('actual r2 builder records source failures and publishes bounded pending evidence',async()=>{
  const result=await buildQualifiedAbsFixture({revision:2,insiderHttpStatus:403});
  assert.equal(result.networkCalls,1);
  const card=result.output.indicators.find(i=>i.id==='insider_sell_buy');
  assert.equal(card.status,'unknown');assert.equal(card.as_of,null);
  assert.equal(card.evidence_gap.checkedDate,'2026-10-13');
  assert.match(card.note,/金额与倍数待确认/u);
  assert.doesNotMatch(card.note,/返回样本卖出0美元|买入0美元|计划属性未披露0笔/u);
  assert.deepEqual(result.output.meta.fetch_failures,[{id:'insider_sell_buy',reason:'NVDA:http_403'}]);
  assert.deepEqual(result.output.summary.primary_score_range_pct,{lower:30.4,upper:39.1});
  assert.deepEqual(validateEvidenceScoreFields(result.output),[]);
});

test('ambiguous duplicate sample is quarantined without inventing a failed HTTP request',async()=>{
  const result=await buildQualifiedAbsFixture({revision:2,duplicateSymbol:'META',publish:true});
  const card=result.output.indicators.find(i=>i.id==='insider_sell_buy');
  assert.equal(card.status,'yellow');assert.equal(card.provenance.detail.validResponseSymbols.length,11);
  assert.deepEqual(card.provenance.detail.rejectedSamples,[{symbol:'META',reason:'duplicate_transaction'}]);
  assert.deepEqual(result.output.meta.fetch_failures,[]);
  assert.match(card.note,/1家公司样本暂不可用/u);
  assert.deepEqual([...result.writes.keys()],['data/bubble-watch.json','data/bubble-watch-history.json']);
});

test('r2 UTC-day crossing and expired immutable anchor stop before any output writes',async()=>{
  await assert.rejects(buildQualifiedAbsFixture({revision:2,clock:'2026-10-15T23:59:30Z'}),
    error=>/cannot publish|UTC window/u.test(error.message)&&error.fixtureWrites.length===0&&error.fixtureNetworkCalls===12);
  await assert.rejects(buildQualifiedAbsFixture({revision:2,clock:'2026-11-17T12:00:00Z'}),
    error=>/complete-refresh anchor/u.test(error.message)&&error.fixtureWrites.length===0&&error.fixtureNetworkCalls===0);
});
