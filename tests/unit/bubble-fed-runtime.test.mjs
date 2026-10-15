import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQualifiedAbsFixture}from'../helpers/bubble-qualified-builder.mjs';
import {validateFedMarketPathPublication}from'../../scripts/bubble-watch/qualified-fed-publication.mjs';
import {validateEvidenceScoreFields}from'../../scripts/bubble-watch/evidence-score-contract.mjs';
for(const publish of [false,true])test(`r4 uses actual collector, preserves23 cards and old history (${publish?'publish':'candidate'})`,async()=>{
 const r=await buildQualifiedAbsFixture({revision:4,clock:'2026-10-15T12:00:00Z',publish});
 assert.equal(r.networkCalls,18);
 const fed=r.output.indicators.find(i=>i.id==='fed_policy');
 assert.equal(fed.status,'red');assert.equal(fed.as_of,'2026-10-13');
 assert.equal(fed.provenance.detail.result.paths[0].targetDate,'2027-01-15');
 assert.equal(fed.provenance.detail.result.paths[1].targetDate,'2027-04-15');
 assert.deepEqual(validateFedMarketPathPublication(fed,r.output.as_of_date),[]);
 assert.deepEqual(validateEvidenceScoreFields(r.output),[]);
 assert.match(fed.note,/不是下次会议/u);assert.match(fed.note,/不沿用年末/u);
 assert.match(fed.source_name,/Yahoo/u);assert.doesNotMatch(fed.source_name,/点阵/u);
 assert.equal(r.output.meta.qualified_refresh.carriedObservationCount,23);
 assert.equal(r.output.meta.qualified_refresh.paidCalls,0);
 assert.deepEqual(r.output.meta.fetch_failures,[]);
 for(const card of r.output.indicators.filter(i=>!['dc_abs_spread','insider_sell_buy','capex_reaction','fed_policy'].includes(i.id)))
  assert.deepEqual(card,r.baseline['data/bubble-watch.json'].indicators.find(i=>i.id===card.id));
 assert.deepEqual(r.history.entries.slice(0,-1),r.baseline['data/bubble-watch-history.json'].entries);
 assert.deepEqual([...r.writes.keys()],publish?['data/bubble-watch.json','data/bubble-watch-history.json']:['manual-artifacts/bubble-qualified-refresh-candidate.json']);
});
for(const fedOptions of [{statusSource:'calendar',status:403},{statusSource:'DFF',status:500},{statusSource:'ZQF27.CBT',status:429},{barMode:'timezone'}])
 test(`r4 failed or unqualified Fed input stays unknown: ${JSON.stringify(fedOptions)}`,async()=>{
  const r=await buildQualifiedAbsFixture({revision:4,clock:'2026-10-15T12:00:00Z',fedOptions});
  const fed=r.output.indicators.find(i=>i.id==='fed_policy');
  assert.equal(fed.status,'unknown');assert.equal(fed.as_of,null);assert.equal(fed.value_display,'待确认');
  assert.deepEqual(validateFedMarketPathPublication(fed,r.output.as_of_date),[]);
  assert.deepEqual(validateEvidenceScoreFields(r.output),[]);
  assert.equal(r.output.summary.scoring_unknown_count,3);
  assert.equal(r.output.summary.primary_score_pct,null);
  assert.ok(r.output.summary.primary_score_range_pct.upper>r.output.summary.primary_score_range_pct.lower);
  assert.equal(r.output.meta.fetch_failures.length,fedOptions.barMode?0:1);
  if(!fedOptions.barMode)assert.equal(r.output.meta.fetch_failures[0].id,'fed_policy');
  assert.doesNotMatch(fed.note,/隐含有效利率约0/u);
 });
