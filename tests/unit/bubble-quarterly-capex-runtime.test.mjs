import test from'node:test';import assert from'node:assert/strict';
import{buildQualifiedAbsFixture}from'../helpers/bubble-qualified-builder.mjs';
import{validateQuarterlyCapexPublication}from'../../scripts/bubble-watch/capex-quarterly-publication.mjs';
import{validateEvidenceScoreFields}from'../../scripts/bubble-watch/evidence-score-contract.mjs';
for(const publish of[false,true])test(`r5 actually collects complete quarter panel and preserves23 other cards (${publish?'publish':'candidate'})`,async()=>{
 const r=await buildQualifiedAbsFixture({revision:5,clock:'2026-10-15T12:00:00Z',publish});assert.equal(r.networkCalls,37);
 const c=r.output.indicators.find(i=>i.id==='capex_reaction');assert.equal(c.status,'yellow');assert.equal(c.as_of,'2026-07-30');assert.deepEqual(validateQuarterlyCapexPublication(c,r.output.as_of_date),[]);
 assert.equal(c.provenance.detail.companies.length,4);assert.equal(c.provenance.detail.decision.punishedCount,2);assert.equal(c.provenance.detail.decision.rewardedCount,1);
 assert.match(c.note,/租赁重分类/u);assert.match(c.note,/仅下限提高/u);assert.match(c.note,/二手电话会/u);assert.match(c.note,/不证明首次披露时点或资本开支因果/u);
 assert.deepEqual(validateEvidenceScoreFields(r.output),[]);assert.equal(r.output.scoring.model_version,'bubble-watch-v3-core23-shadow4-r5');assert.equal(r.output.summary.scoring_unknown_count,1);
 assert.deepEqual(r.output.summary.primary_score_range_pct,{lower:30.4,upper:34.8});assert.deepEqual(r.output.meta.fetch_failures,[]);
 assert.equal(r.output.meta.qualified_refresh.carriedObservationCount,23);assert.equal(r.output.meta.qualified_refresh.paidCalls,0);
 for(const card of r.output.indicators.filter(i=>!['dc_abs_spread','insider_sell_buy','capex_reaction','fed_policy'].includes(i.id)))assert.deepEqual(card,r.baseline['data/bubble-watch.json'].indicators.find(i=>i.id===card.id));
 assert.deepEqual(r.history.entries.slice(0,-1),r.baseline['data/bubble-watch-history.json'].entries);
 assert.deepEqual([...r.writes.keys()],publish?['data/bubble-watch.json','data/bubble-watch-history.json']:['manual-artifacts/bubble-qualified-refresh-candidate.json']);
});
for(const quarterlyOptions of[{blockHost:'stockanalysis.com'},{newQuarter:true}])test(`r5 missing quarter evidence stays canonical unknown: ${JSON.stringify(quarterlyOptions)}`,async()=>{
 const r=await buildQualifiedAbsFixture({revision:5,clock:'2026-10-15T12:00:00Z',quarterlyOptions});const c=r.output.indicators.find(i=>i.id==='capex_reaction');assert.equal(c.status,'unknown');assert.equal(c.as_of,null);assert.deepEqual(validateQuarterlyCapexPublication(c,r.output.as_of_date),[]);assert.equal(r.output.summary.scoring_unknown_count,2);
 assert.equal(r.networkCalls,quarterlyOptions.blockHost?19:22);assert.equal(r.output.meta.fetch_failures.filter(f=>f.id==='capex_reaction').length,quarterlyOptions.blockHost?1:0);assert.deepEqual(validateEvidenceScoreFields(r.output),[]);
});
for(const status of['green','red'])test(`r5 builder admits replayed ${status} association without changing source scope`,async()=>{
 const r=await buildQualifiedAbsFixture({revision:5,clock:'2026-10-15T12:00:00Z',quarterlyOptions:{priceMode:status}}),c=r.output.indicators.find(i=>i.id==='capex_reaction');assert.equal(c.status,status);assert.deepEqual(validateQuarterlyCapexPublication(c,r.output.as_of_date),[]);assert.deepEqual(validateEvidenceScoreFields(r.output),[]);assert.equal(c.provenance.detail.firstGuidanceDiscoveryComplete,false);
});
