import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQualifiedAbsFixture} from '../helpers/bubble-qualified-builder.mjs';
import {validateCapexEventPublication} from '../../scripts/bubble-watch/capex-event-evidence.mjs';
import {validateEvidenceScoreFields} from '../../scripts/bubble-watch/evidence-score-contract.mjs';
for(const publish of [false,true])test(`r3 pending event builder preserves24 cards, bounds and history (${publish?'publish':'candidate'})`,async()=>{
 const r=await buildQualifiedAbsFixture({revision:3,clock:'2026-10-15T12:00:00Z',publish});
 assert.equal(r.networkCalls,12);
 const card=r.output.indicators.find(i=>i.id==='capex_reaction');
 assert.deepEqual(validateCapexEventPublication(card,r.output.as_of_date),[]);
 assert.deepEqual(validateEvidenceScoreFields(r.output),[]);
 assert.deepEqual(r.output.summary.primary_score_range_pct,{lower:30.4,upper:39.1});
 assert.equal(r.output.summary.scoring_unknown_count,2);
 assert.equal(r.output.meta.qualified_refresh.carriedObservationCount,24);
 for(const i of r.output.indicators.filter(i=>!['dc_abs_spread','insider_sell_buy','capex_reaction'].includes(i.id)))
  assert.deepEqual(i,r.baseline['data/bubble-watch.json'].indicators.find(old=>old.id===i.id));
 assert.deepEqual(r.history.entries.slice(0,-1),r.baseline['data/bubble-watch-history.json'].entries);
 assert.deepEqual([...r.writes.keys()],publish?['data/bubble-watch.json','data/bubble-watch-history.json']:['manual-artifacts/bubble-qualified-refresh-candidate.json']);
 assert.match(card.note,/新闻条数及研究评论均不替代/u);
 assert.equal(card.provenance.detail.legacyRollingReturnsEligible,false);
});
test('r3 cannot turn capex green when insider transport fails or old rolling card was green',async()=>{
 const r=await buildQualifiedAbsFixture({revision:3,insiderHttpStatus:403,clock:'2026-10-15T12:00:00Z'});
 assert.equal(r.networkCalls,1);
 assert.equal(r.output.indicators.find(i=>i.id==='capex_reaction').status,'unknown');
 assert.equal(r.output.summary.scoring_unknown_count,3);
 assert.equal(r.output.meta.fetch_failures[0].id,'insider_sell_buy');
});
