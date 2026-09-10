import test from 'node:test';
import assert from 'node:assert/strict';
import calibration from '../../config/gdelt-score-calibration.json' with { type: 'json' };
import { gdeltRawPressure, scoreGdeltPressure } from '../../scripts/world-order/gdelt-score.mjs';
import { scoreWorldOrderStress } from '../../scripts/world-order/score-world-order-stress.mjs';

test('frozen reference is reproducible and restores historical dynamic range', () => {
  const pressures = calibration.samples.map(s => gdeltRawPressure(s)).sort((a,b)=>a-b);
  assert.equal(calibration.samples.length, 30);
  assert.equal(new Set(calibration.samples.map(s=>s.day)).size, 30);
  assert.equal(Math.round((pressures[14]+pressures[15])*5000)/10000, calibration.pressureScale);
  const scores = calibration.samples.map(summary => scoreGdeltPressure({status:'ok',summary}));
  assert.ok(Math.min(...scores) >= 36 && Math.max(...scores) <= 53);
  assert.ok(new Set(scores).size > 8);
  assert.ok(pressures.every(p=>p>100)); // Legacy formula saturated every sample.
});

test('pressure is monotone and stale discount survives extreme counts', () => {
  const values=[0,100,500,1131,5000,1e12].map(conflictEvents => {
    const summary={conflictEvents};
    const fresh=scoreGdeltPressure({status:'ok',summary});
    const stale=scoreGdeltPressure({status:'stale',summary});
    assert.ok(stale<=35 && stale<=fresh);
    if(conflictEvents)assert.ok(stale<fresh);
    assert.ok(scoreGdeltPressure({status:'partial',summary})<=75);
    return fresh;
  });
  assert.deepEqual([...values].sort((a,b)=>a-b),values);
  assert.equal(new Set(values).size,values.length);
  for(const status of ['error','manual_required','not_configured',undefined])assert.equal(scoreGdeltPressure({status,summary:{conflictEvents:5000}}),0);
  for(const conflictEvents of [null,-1,Infinity,'100'])assert.equal(scoreGdeltPressure({status:'ok',summary:{conflictEvents}}),0);
});

test('actual overlay consumes new scale and exposes non-comparability', () => {
  const args={externalSources:{
    gdelt:{status:'ok',confidence:0.75,summary:calibration.samples[0]},
    ofac:{status:'ok',confidence:0.8,summary:{}},
    sipri:{status:'ok',confidence:0.8,summary:{}},
    acled:{status:'error',confidence:0,summary:{}}
  },marketConfirmation:{score:20,confidence:0.5,evidence:[]},dataPayload:{modules:{}},rules:{}};
  const before=structuredClone(args);
  const result=scoreWorldOrderStress(args);
  assert.deepEqual(args,before);
  assert.equal(result.scoringModel.comparableToLegacy,false);
  args.externalSources.gdelt.status='stale';
  const stale=scoreWorldOrderStress(args);
  assert.ok(stale.dimensions.multiTheaterConflict.score < result.dimensions.multiTheaterConflict.score);
  assert.ok(stale.score<result.score);
  assert.match(result.warnings[0],/旧版不可直接比较/); // Existing renderer displays only the first warning.
  assert.match(result.warnings[0],/不构成战争预测或投资建议/);
});
