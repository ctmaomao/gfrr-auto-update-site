import test from 'node:test';
import assert from 'node:assert/strict';
import { getEiaStructuralReference, compareRoundedOilComponents, compareAlternativeOilTotals, compareSyntheticRoundedOilCells } from '../../scripts/oil-directional/eia-structural-reference.mjs';
const records = getEiaStructuralReference().records;
const pick = (table, product='total_oil_flows') => records.find(r=>r.table===table&&r.productScope===product);
test('pinned source cells preserve exact locator, raw units, clocks and provenance without backdated availability',()=>{
  const s=getEiaStructuralReference();assert.equal(s.records.length,10);assert.equal(s.snapshotBytes,78814);
  assert.equal(s.snapshotHash,'812535df648559d204165128b3f5f8835c8aab846107feb082670b80d998bd85');
  assert.equal(s.topicReleaseDate,'2026-08-12');assert.equal(s.surroundingSteoReleaseDate,'2026-11-10');
  assert.equal(s.retrievedAt,'2026-11-16T00:29:31.053Z');assert.equal(s.firstSeenInThisDataset,s.retrievedAt);assert.equal(s.providerFirstPublishedAt,null);
  for(const r of [s,...s.records])for(const flag of ['sourceVintageVerified','historicalAsOfEligible','eligibleForEvaluation','eligibleForMainScore'])assert.equal(r[flag],false);
  assert.deepEqual(pick(4).period,{label:'2026Q2',start:'2026-04-01T00:00:00.000Z',endExclusive:'2026-07-01T00:00:00.000Z',observationCoverageVerified:false});
  assert.equal(pick(2).period.start,'2025-10-01T00:00:00.000Z');assert.equal(pick(2).period.endExclusive,'2026-01-01T00:00:00.000Z');
  assert.equal(pick(4).row,'Total oil flows through the Strait of Hormuz');assert.equal(pick(4).column,'2Q26');
});
test('Hormuz total/components are rounding-compatible, not an exact sum or source correction',()=>{
  const total=pick(4), crude=pick(4,'crude_oil_and_condensate'), products=pick(4,'petroleum_products');
  assert.deepEqual([total.rawValue,crude.rawValue,products.rawValue],['4.9','3.7','1.1']);
  const result=compareRoundedOilComponents(total,crude,products);assert.equal(result.result,'compatible_under_rounding_assumption');
  assert.deepEqual(result.intervals.map(i=>[i.lower,i.upper]),[[4.85,4.95],[4.7,4.9]]);assert.equal(result.correctedValue,null);assert.equal(result.roundingAssumption.providerRoundingVerified,false);
});
test('Malacca conflicting totals remain separate; neither table wins and no reconciliation is fabricated',()=>{
  const t2=pick(2),t3=pick(3),crude=pick(3,'crude_oil_and_condensate'),products=pick(3,'petroleum_products');
  assert.deepEqual([t2.rawValue,t3.rawValue,crude.rawValue,products.rawValue],['24.9','24.0','18.0','6.9']);
  assert.equal(compareAlternativeOilTotals(t2,t3).result,'conflict_under_rounding_assumption');
  assert.equal(compareRoundedOilComponents(t3,crude,products).result,'conflict_under_rounding_assumption');
  assert.equal(compareAlternativeOilTotals(t2,t3).correctedValue,null);assert.equal(getEiaStructuralReference().records.filter(r=>r.geographicScope==='strait_of_malacca'&&r.productScope==='total_oil_flows').length,2);
});
test('geography and product/unit boundaries prevent Suez, Bosporus and LNG substitutions',()=>{
  assert.equal(pick(5).geographicScope,'suez_canal_and_sumed_pipeline');assert.equal(pick(5).rawValue,'5.8');
  assert.equal(pick(8).geographicScope,'turkish_straits_dardanelles');assert.equal(pick(8).rawValue,'4.1');
  const lng=pick(6,'lng');assert.equal(lng.rawValue,'-');assert.equal(lng.value,null);assert.equal(lng.rawUnit,'billion cubic feet per day');assert.equal(lng.unitSource,'row_label_overrides_table_header');
  assert.equal(compareAlternativeOilTotals(pick(4),lng).result,'incomparable');
  assert.equal(compareAlternativeOilTotals(pick(5),{...pick(5),recordId:'fake',geographicScope:'suez_canal'}).result,'incomparable');
  assert.equal(compareAlternativeOilTotals(pick(8),{...pick(8),recordId:'fake',geographicScope:'bosporus'}).result,'incomparable');
});
test('duplicate components, mismatched quarters/snapshots, malformed values and numeric tampering are not comparable',()=>{
  const t=pick(4),c=pick(4,'crude_oil_and_condensate'),p=pick(4,'petroleum_products');
  assert.equal(compareRoundedOilComponents(t,c,c).result,'incomparable');
  for(const patch of [{column:'3Q26'},{snapshotHash:'0'.repeat(64)},{rawValue:''},{rawValue:'NaN'},{rawValue:'-1.0'},{value:99},{period:{...p.period,endExclusive:'2026-06-30'}}])assert.equal(compareRoundedOilComponents(t,c,{...p,...patch}).result,'incomparable');
  assert.equal(compareRoundedOilComponents(t,c,{...p,rawValue:'-',value:null}).result,'incomparable');
  assert.equal(compareSyntheticRoundedOilCells('4.9','3.7','-').result,'unknown_missing_value');
});
test('real numeric zero stays zero; closed rounding envelopes do not rely on float equality',()=>{
  const result=compareSyntheticRoundedOilCells('0.1','0.0','0.0');assert.equal(result.syntheticFixtureOnly,true);assert.equal(result.result,'compatible_under_rounding_assumption');assert.deepEqual(result.intervals[1],{lower:0,upper:0.1,unit:'million barrels per day'});
});
test('caller mutation cannot change the pinned research reference; no global sum, weights or prediction',()=>{
  const a=getEiaStructuralReference();a.records[0].value=99;a.records[0].period.label='fake';a.limitations.length=0;
  const b=getEiaStructuralReference();assert.equal(b.records[0].value,4.9);assert.equal(b.records[0].period.label,'2026Q2');assert.ok(b.limitations.length>0);
  for(const field of ['globalOilTotal','routeWeights','pricePrediction','independentSourceCount'])assert.equal(b[field],null);
});

test('source comparisons cannot hide Malacca conflict by editing both raw and numeric values under the original snapshot identity',()=>{
  const edited={...pick(2),rawValue:'24.0',value:24};
  assert.equal(compareAlternativeOilTotals(edited,pick(3)).result,'incomparable');
  assert.equal(compareAlternativeOilTotals({...pick(2),row:'fabricated'},pick(3)).result,'incomparable');
  assert.equal(compareAlternativeOilTotals({...pick(2),table:7,recordId:'table-7:strait_of_malacca:total_oil_flows:4Q25'},pick(3)).result,'incomparable');
});

test('original table product descriptions remain pinned and normalized oil totals do not certify semantic equivalence',()=>{
  assert.match(pick(2).tableTitle,/crude oil and petroleum liquids/);
  assert.match(pick(3).tableTitle,/crude oil, condensate, petroleum products, and liquefied natural gas/);
  assert.equal(compareAlternativeOilTotals({...pick(2),tableTitle:pick(3).tableTitle},pick(3)).result,'incomparable');
  assert.equal(compareAlternativeOilTotals(pick(2),pick(3)).semanticEquivalenceVerified,false);
  assert.equal(getEiaStructuralReference().layer,'research_structural_reference');
});
