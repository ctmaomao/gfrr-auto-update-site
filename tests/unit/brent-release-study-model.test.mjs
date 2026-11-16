import test from 'node:test';
import assert from 'node:assert/strict';
import { logisticObjectiveAndGradientForFixtures as objective, fitSyntheticBrentModel as fit,
  calibrateSyntheticBrentLogits as calibrate, predictSyntheticBrentModel as predict } from '../../scripts/oil-directional/brent-release-study-model.mjs';
const day=(start,n)=>new Date(Date.parse(start)+n*86400000).toISOString();
function rows(start,n){return Array.from({length:n},(_,i)=>({issueAt:day(start,i),features:[(i%11-5)/5,(i%7-3)/3,0,5],target:Number(i%11>5)}));}
const train=rows('2015-01-01T00:00:00.000Z',300),calibration=rows('2018-01-01T00:00:00.000Z',120);
let cached;
const model=()=>cached??=fit({train,calibration,syntheticFixtureOnly:true});
test('analytic ridge objective gradient matches independent central finite differences, including unpenalized intercept',()=>{
  const x=[[-1,0.5],[0.3,-2],[1.4,2]],y=[0,1,1],w=[0.2,-0.7,0.4],lambda=0.37;
  const result=objective(w,x,y,lambda),epsilon=1e-6;
  for(let j=0;j<w.length;j++){const plus=[...w],minus=[...w];plus[j]+=epsilon;minus[j]-=epsilon;
    const finite=(objective(plus,x,y,lambda).objective-objective(minus,x,y,lambda).objective)/(2*epsilon);
    assert.ok(Math.abs(result.gradient[j]-finite)<1e-8);
  }
  const none=objective(w,x,y,0);assert.equal(result.gradient[0],none.gradient[0]);
  assert.ok(Math.abs(result.gradient[1]-none.gradient[1]-lambda*w[1])<1e-12);
  const extreme=objective([0,1000],[[-1],[1]],[0,1],0.1);assert.ok(Number.isFinite(extreme.objective));assert.ok(extreme.gradient.every(Number.isFinite));
});
test('fixed training-only mean/population std, zero-column mapping and deterministic convergence',()=>{
  const m=model();assert.equal(m.status,'fitted_synthetic_only');
  for(let j=0;j<4;j++){
    const mean=train.reduce((s,r)=>s+r.features[j],0)/train.length;
    const std=Math.sqrt(train.reduce((s,r)=>s+(r.features[j]-mean)**2,0)/train.length);
    assert.ok(Math.abs(m.scaler.mean[j]-mean)<1e-12);assert.ok(Math.abs(m.scaler.std[j]-std)<1e-12);
  }
  assert.equal(m.scaler.std[2],0);assert.equal(m.scaler.std[3],0);assert.equal(predict(m,[0,0,999,999]).standardized[3],0);assert.equal(predict(m,[0,0,999,5]).standardized[2],0);
  assert.ok(m.classifier.gradientNorm<=1e-7);assert.ok(m.calibrator.gradientNorm<=1e-7);assert.ok(m.calibrator.slope>0);
  assert.deepEqual(fit({train,calibration,syntheticFixtureOnly:true}),m);
  const shifted=calibration.map(r=>({...r,features:[r.features[0]*2,r.features[1],r.features[2],r.features[3]]}));
  const other=fit({train,calibration:shifted,syntheticFixtureOnly:true});assert.equal(other.status,'fitted_synthetic_only');
  assert.deepEqual(other.scaler,m.scaler);assert.deepEqual(other.classifier,m.classifier);
});
test('step size uses only fitting rows and the frozen norm formula, clip never adapts to evaluation inputs',()=>{
  const m=model(), norm=m.classifier.maximumAugmentedRowSquaredNorm;
  assert.equal(m.classifier.learningRate,Math.min(0.05,1/(0.25*norm+0.1)));
  assert.equal(m.calibrator.learningRate,Math.min(0.05,1/(0.25*m.calibrator.maximumAugmentedRowSquaredNorm+0.01)));
  const before=JSON.stringify(m);const p=predict(m,[10000,-10000,999,5]);assert.deepEqual(p.standardized.slice(0,3),[5,-5,0]);assert.equal(JSON.stringify(m),before);
  assert.ok(p.calibratedProbability>=0&&p.calibratedProbability<=1);assert.equal(p.eligibleForPublicProbability,false);
});
test('minimum train/calibration sample and class requirements cannot be lowered at fitting entry points',()=>{
  assert.equal(fit({train:train.slice(0,249),calibration,syntheticFixtureOnly:true}).reason,'minimum_samples_or_classes');
  assert.equal(fit({train,calibration:calibration.slice(0,99),syntheticFixtureOnly:true}).reason,'minimum_samples_or_classes');
  assert.equal(fit({train:train.map((r,i)=>({...r,target:Number(i<19)})),calibration,syntheticFixtureOnly:true}).reason,'minimum_samples_or_classes');
  assert.equal(calibrate({logits:[-1,1],targets:[0,1],syntheticFixtureOnly:true}).reason,'minimum_calibration_samples_or_classes');
});
test('constant/nearly constant or nonpositive-slope calibration is unavailable, never a substitute 50 percent',()=>{
  const targets=Array.from({length:100},(_,i)=>i%2);
  for(const logits of [Array(100).fill(0),Array.from({length:100},(_,i)=>(i%2)*1e-5)])assert.equal(calibrate({logits,targets,syntheticFixtureOnly:true}).reason,'constant_or_nearly_constant_logits');
  const negative=calibrate({logits:targets.map(y=>y? -1:1),targets,syntheticFixtureOnly:true});assert.equal(negative.status,'unavailable');assert.equal(negative.reason,'nonpositive_calibration_slope');
  const allConstant=fit({train:train.map(r=>({...r,features:[0,0,0,0]})),calibration:calibration.map(r=>({...r,features:[0,0,0,0]})),syntheticFixtureOnly:true});
  assert.equal(allConstant.reason,'constant_or_nearly_constant_logits');assert.throws(()=>predict(allConstant,[0,0,0,0]));
});
test('fixed-iteration nonconvergence is explicitly unavailable without changing optimizer thresholds',()=>{
  const logits=Array.from({length:100},(_,i)=>i%2?1e8:-1e8),targets=Array.from({length:100},(_,i)=>i%4<2?1:0);
  const result=calibrate({logits,targets,syntheticFixtureOnly:true});assert.equal(result.status,'unavailable');assert.equal(result.reason,'nonconvergence');
});
test('real-data entry is disabled and malformed cases/phases/duplicate issuance cannot enter a fit',()=>{
  assert.throws(()=>fit({train,calibration}),/Synthetic/);assert.throws(()=>calibrate({logits:[0,1],targets:[0,1]}),/Synthetic/);
  assert.throws(()=>fit({train:[...train,train[0]],calibration,syntheticFixtureOnly:true}),/duplicate/);
  assert.throws(()=>fit({train:calibration,calibration,syntheticFixtureOnly:true}),/phase/);
  assert.throws(()=>fit({train:train.map((r,i)=>i? r:{...r,features:[NaN,0,0,0]}),calibration,syntheticFixtureOnly:true}));
  assert.equal(calibrate({logits:[NaN],targets:[0],syntheticFixtureOnly:true}).reason,'nonfinite_calibration_logits');
  const m=model();assert.equal(m.caseConstructionVerified,false);assert.equal(m.eligibleForMainScore,false);assert.equal(m.noCurrentPredictionFromThisStudy,true);
});

test('sparse vectors, matrices and labels are rejected rather than skipped by every/reduce',()=>{
  assert.throws(()=>objective([0,1],[[1],,[2]],[0,1,1],0.1));
  assert.throws(()=>objective([0,1],[[1],[2]],[0,,],0.1));
  assert.throws(()=>objective([0,,1],[[1,2]],[1],0.1));
  assert.throws(()=>objective([0,1,1],[[1,,]],[1],0.1));
  assert.equal(calibrate({logits:Array(100),targets:Array(100).fill(0),syntheticFixtureOnly:true}).status,'unavailable');
  assert.throws(()=>predict(model(),[0,,0,0]));
});
