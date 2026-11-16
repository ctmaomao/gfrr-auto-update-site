import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSyntheticProbabilities as metrics, bootstrapSyntheticPairedBrier as bootstrap,
  linearQuantileForFixtures as quantile, runSyntheticBrentProtocol as run } from '../../scripts/oil-directional/brent-release-study-evaluation.mjs';
const flag={syntheticFixtureOnly:true};
const close=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
function segment(year,n){return Array.from({length:n},(_,i)=>{
  const date=new Date(Date.UTC(year,0,1)+i*86400000).toISOString().slice(0,10);
  return {quoteDate:date,initialAvailableDate:date,value:100+8*Math.sin(i/5)+i*0.01};
});}
const records=[...segment(2015,300),...segment(2018,180),...segment(2021,300),...segment(2026,100)];
let cached;const report=()=>cached??=run({records,retrievalCutoff:'2027-01-01T00:00:00.000Z',...flag});
test('Brier/logloss/reliability/ECE agree with manual arithmetic; clipping is only for logloss',()=>{
  const m=metrics({targets:[0,1],probabilities:[0.2,0.8],...flag});close(m.brier,0.04);close(m.logloss,-Math.log(.8));close(m.ece,.2);
  assert.deepEqual(m.reliability.map(b=>b.count),[0,1,0,0,1]);assert.equal(m.reliability[0].observedUpFrequency,null);assert.equal(m.reliability[4].upperInclusive,true);
  const perfect=metrics({targets:[0,1],probabilities:[0,1],...flag});assert.equal(perfect.brier,0);close(perfect.logloss,-Math.log(1-1e-6));assert.equal(perfect.ece,0);
  const wrong=metrics({targets:[0,1],probabilities:[1,0],...flag});assert.equal(wrong.brier,1);close(wrong.logloss,-Math.log(1e-6),1e-9);
  assert.throws(()=>metrics({targets:[0,1],probabilities:[.5],...flag}));assert.throws(()=>metrics({targets:[0,,1],probabilities:[.5,.5,.5],...flag}));
  assert.throws(()=>metrics({targets:[0,1],probabilities:[.2,NaN],...flag}));assert.throws(()=>metrics({targets:[0,1],probabilities:[-1,1],...flag}));
});
test('linear percentile quantile uses (N-1)*p interpolation and does not mutate inputs',()=>{
  const a=[10,0];close(quantile(a,.025),.25);close(quantile(a,.975),9.75);assert.deepEqual(a,[10,0]);assert.throws(()=>quantile([1,,2],.5));
});
test('noncircular paired moving blocks use exact fixed seed/replicates, trim final block and report all lengths',()=>{
  const targets=Array.from({length:17},(_,i)=>i%2),candidate=Array.from({length:17},(_,i)=>(i+1)/20);
  const args={targets,candidate,symmetric:Array(17).fill(.5),pretestFrequency:Array(17).fill(.4),...flag};
  const result=bootstrap(args);assert.deepEqual(result.map(r=>r.blockLength),[8,4,12]);assert.deepEqual(bootstrap(args),result);
  // Independent Python uint32 Mulberry32 + explicit contiguous-index reference,
  // generated only from these synthetic 17 rows before any real experiment.
  const expected=[[-.01573529411764705,.09294117647058825,-.01985294117647059,.07705882352941176],
    [-.000602941176470575,.09941544117647061,-.0123639705882353,.08486397058823532],
    [.0030882352941176464,.09529411764705885,-.0010294117647058948,.07941176470588236]];
  result.forEach((r,i)=>{
    assert.equal(r.seed,20261116);assert.equal(r.replicates,1000);assert.equal(r.noncircular,true);assert.equal(r.sampleSize,17);assert.equal(r.rng,'mulberry32_uint32');
    const actual=[r.intervals.symmetric.lower,r.intervals.symmetric.upper,r.intervals.pretestFrequency.lower,r.intervals.pretestFrequency.upper];actual.forEach((v,j)=>close(v,expected[i][j]));
  });
  const tiny=bootstrap({targets:[0],candidate:[.2],symmetric:[.5],pretestFrequency:[.4],...flag});assert.ok(tiny.every(r=>r.status==='unavailable'));
});
test('paired samples preserve a pointwise baseline difference in both interval endpoints, no separate resampling or wrap',()=>{
  const n=9,candidate=Array(n).fill(.5);candidate[8]=0;
  const r=bootstrap({targets:Array(n).fill(0),candidate,symmetric:Array(n).fill(.5),pretestFrequency:Array(n).fill(.4),...flag})[0];
  close(r.intervals.symmetric.lower,-.25/9);close(r.intervals.symmetric.upper,0);
  close(r.intervals.pretestFrequency.lower-r.intervals.symmetric.lower,.09);close(r.intervals.pretestFrequency.upper-r.intervals.symmetric.upper,.09);
});
test('synthetic runner separates partitions/horizons, uses only train+cal baseline and keeps all paired eligible cases',()=>{
  const r=report();assert.equal(r.horizons['5'].status,'synthetic_model_fitted');
  for(const h of ['5','1','20']){
    const x=r.horizons[h];assert.equal(x.secondaryMinimumRule,'same_conservative_sample_and_class_counts_as_primary');
    if(h!=='5')assert.equal(x.horizonRole,'secondary_cannot_rescue_primary');
    for(const part of [x.test,x.holdout2026]){
      assert.equal(part.status,'evaluated_synthetic_only');assert.equal(part.allPredictionsPaired,true);assert.equal(part.droppedForForecastOrOutcome,0);
      assert.equal(part.metrics.candidate.n,part.metrics.symmetric.n);assert.equal(part.metrics.candidate.n,part.metrics.pretestFrequency.n);assert.equal(part.bootstrap.length,3);
    }
    const c=x.sampleCounts;close(x.empiricalPretestUpFrequency,(c.train.up+c.calibration.up)/(c.train.n+c.calibration.n));
  }
  assert.equal(r.eligibleForPublicProbability,false);assert.equal(r.eligibleForMainScore,false);assert.equal(r.prospectiveEvidence,false);assert.equal(r.engineeringVerificationIsNotPredictiveEvidence,true);
  assert.equal(r.syntheticPrimaryAndHoldoutGatesPass,r.horizons['5'].test.gatePassed===true&&r.horizons['5'].holdout2026.gatePassed===true);
});
test('test outcome distribution never changes fitting or empirical baseline; class shortage is unavailable, not selective dropping',()=>{
  const changed=records.map(row=>row.quoteDate.startsWith('2021')?{...row,value:100+Date.parse(row.quoteDate)/86400000}:row);
  const r=run({records:changed,retrievalCutoff:'2027-01-01T00:00:00.000Z',...flag}),original=report();
  assert.deepEqual(r.horizons['5'].model,original.horizons['5'].model);assert.equal(r.horizons['5'].empiricalPretestUpFrequency,original.horizons['5'].empiricalPretestUpFrequency);
  assert.equal(r.horizons['5'].test.status,'unavailable');assert.equal(r.horizons['5'].test.reason,'minimum_samples_or_classes');assert.equal(r.syntheticPrimaryAndHoldoutGatesPass,false);
});
test('unavailable 2026 cannot be pooled into test or rescue qualification; sample/class limits remain separate',()=>{
  const r=run({records:records.filter(r=>!r.quoteDate.startsWith('2026')),retrievalCutoff:'2027-01-01T00:00:00.000Z',...flag});
  assert.equal(r.horizons['5'].holdout2026.status,'unavailable');assert.equal(r.horizons['5'].holdout2026.sampleCounts.minimumSamples,40);
  assert.equal(r.horizons['5'].holdout2026.sampleCounts.minimumEachClass,10);assert.equal(r.syntheticPrimaryAndHoldoutGatesPass,false);
  const insufficient=run({records:segment(2015,40),retrievalCutoff:'2027-01-01T00:00:00.000Z',...flag});
  assert.equal(insufficient.horizons['5'].status,'unavailable');assert.equal(insufficient.horizons['5'].sampleCounts.train.minimumSamples,250);assert.equal(insufficient.horizons['5'].sampleCounts.calibration.minimumSamples,100);
});
test('missing fixture authorization and the known inverted-availability example stop before any fitting',()=>{
  assert.throws(()=>run({records,retrievalCutoff:'2027-01-01T00:00:00.000Z'}),/Synthetic/);
  assert.throws(()=>run({records:[...records,{quoteDate:'2012-12-27',initialAvailableDate:'2012-12-26',value:100}],retrievalCutoff:'2027-01-01T00:00:00.000Z',...flag}),/availability chronology/);
});
