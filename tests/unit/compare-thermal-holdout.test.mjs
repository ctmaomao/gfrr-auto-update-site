import test from 'node:test';
import assert from 'node:assert/strict';
import {compareThermalHoldout} from '../../tools/oil-directional/compare-thermal-holdout.mjs';
const day = day => `2025-01-${String(day).padStart(2,'0')}T00:00:00.000Z`;
function packet() {
  const windows = Array.from({length:6},(_,i)=>({id:String(i),start:day(i+2),end:day(i+3),cutoff:day(i+3),negativeBlockId:String(Math.floor(i/2))}));
  const manifest = {frozenAt:day(1),holdoutStart:day(2),ascertainmentCutoff:day(9),trainingEpisodeIds:[],windows,minEventEpisodes:2,minNegativeBlocks:2};
  const evidence = windows.map(({id,cutoff},i)=>({windowId:id,truth:i<3?'event':'event_free',planning:i===0?'planned':'unplanned',
    truthReceipt:{independent:true,reference:'synthetic-review',knownAt:day(9)},episodeId:i===0?'episode-1':i<3?'episode-2':null,a:{alert:false,knownAt:cutoff},
    thermal:{status:i===0?'unavailable':'available',knownAt:cutoff},b:{alert:true,knownAt:cutoff}}));
  return {manifest,evidence};
}
test('paired episode gain and block harm; explicit unavailable falls back to A',()=>{
  const {manifest,evidence}=packet();
  const result=compareThermalHoldout(manifest,evidence);
  assert.equal(result.status,'descriptive_only');
  assert.deepEqual(result.coverage,{pairedObservableWindows:5,fallbackWindows:1,missingTruthWindows:0,missingAsOfWindows:0,adjudicatedOutOfScopeWindows:0});
  assert.deepEqual(result.gain,{bOnly:1,aOnly:0,total:2,estimate:.5,interval95:[0,1]});
  assert.deepEqual(result.harm,{bOnly:3,aOnly:0,total:3,estimate:100,interval95:[100,100]});
  assert.deepEqual(compareThermalHoldout(manifest,[...evidence].reverse()),result);
  assert.equal(compareThermalHoldout({...manifest,minimumGain:.1,maximumHarm:5},evidence).status,'fails_frozen_margins');
});
test('missing evidence, unknown cutoff, or a same-episode control abstains',()=>{
  for (const [blocker,modify] of [
    ['unresolved_independent_truth',rows=>rows.pop()],
    ['unresolved_as_of_receipt',rows=>{rows[1].a.knownAt=null;}],
    ['unresolved_as_of_receipt',rows=>{rows[1].b.knownAt=day(10);}],
    ['episode_linked_control',rows=>{rows[3].episodeId='episode-1';}],
    ['episode_linked_control',rows=>{rows[3].episodeId='unknown-episode';}],
    ['insufficient_negative_blocks',rows=>{rows[3].truth='out_of_scope';}]
  ]) {
    const {manifest,evidence}=packet();modify(evidence);
    const result=compareThermalHoldout(manifest,evidence);
    assert.equal(result.status,'inconclusive');assert.equal(result.gain,null);assert.equal(result.harm,null);
    assert.ok(result.blockers.includes(blocker));
  }
});
test('duplicates, overlap and noncontiguous reuse of a negative block are rejected',()=>{
  const {manifest,evidence}=packet();
  assert.throws(()=>compareThermalHoldout(manifest,[evidence[0],evidence[0]]),/Duplicate/);
  manifest.windows[2].start=day(3);
  assert.throws(()=>compareThermalHoldout(manifest,evidence),/overlapping holdout/);
  manifest.windows[2].start=day(4);
  manifest.windows[4].negativeBlockId='0';
  assert.throws(()=>compareThermalHoldout(manifest,evidence),/Overlapping negative/);
});

test('out of scope must have timely independent ascertainment, and control links cannot be blank',()=>{
  const {manifest,evidence}=packet();
  evidence[3].truth='out_of_scope';
  for (const changes of [{knownAt:day(10)}, {knownAt:day(4)}, {reference:' '}, {independent:false}]) {
    const malformed=structuredClone(evidence);
    Object.assign(malformed[3].truthReceipt,changes);
    const result=compareThermalHoldout(manifest,malformed);
    assert.equal(result.coverage.missingTruthWindows,1);
    assert.equal(result.coverage.adjudicatedOutOfScopeWindows,0);
    assert.equal(result.gain,null);
  }
  assert.equal(compareThermalHoldout(manifest,evidence).coverage.adjudicatedOutOfScopeWindows,1);
  for (const episodeId of [undefined,'',' ']) {
    evidence[4].episodeId=episodeId;
    assert.throws(()=>compareThermalHoldout(manifest,evidence),/Control needs/);
  }
});

test('paired subset reports its own support and missingness by planning; explicit training overlap blocks',()=>{
  const {manifest,evidence}=packet();
  const result=compareThermalHoldout(manifest,evidence);
  assert.equal(result.pairedObservable.eventEpisodes,1);
  assert.equal(result.pairedObservable.gain,null);
  assert.deepEqual(result.pairedObservable.harm,result.harm);
  assert.equal(result.byStratum.planned.fallbackWindows,1);
  assert.equal(result.byStratum.unplanned.pairedObservableWindows,2);
  const leak=compareThermalHoldout({...manifest,trainingEpisodeIds:['episode-2']},evidence);
  assert.ok(leak.blockers.includes('training_episode_overlap'));
  assert.equal(leak.harm,null);
  evidence[2].thermal.knownAt=day(1);
  const stale=compareThermalHoldout(manifest,evidence);
  assert.equal(stale.byStratum.unplanned.missingAsOfWindows,1);
  assert.equal(stale.gain,null);
});

test('decision cutoff is inside its sealed window, independent of later ascertainment',()=>{
  const {manifest,evidence}=packet();
  for (const cutoff of [day(1),day(4)]) {
    manifest.windows[0].cutoff=cutoff;
    assert.throws(()=>compareThermalHoldout(manifest,evidence),/Invalid decision or ascertainment cutoff/);
  }
});
