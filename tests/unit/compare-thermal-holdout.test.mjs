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
test('supplied frozen margins must be a complete finite pair in their stated units',()=>{
  const {manifest,evidence}=packet();
  for (const margins of [
    {minimumGain:-.1,maximumHarm:101}, // formerly cleared despite 100 additional false alerts per 100
    {minimumGain:.1,maximumHarm:101},
    {minimumGain:5,maximumHarm:5}, // percentage points in a fraction field
    {minimumGain:.1,maximumHarm:-1},
    {minimumGain:null,maximumHarm:null},
    {minimumGain:'0.1',maximumHarm:5},
    {minimumGain:.1,maximumHarm:'5'},
    {minimumGain:NaN,maximumHarm:5},
    {minimumGain:.1,maximumHarm:Infinity},
    {minimumGain:.1},
    {maximumHarm:5},
    {minimumGain:undefined}
  ]) {
    const result=compareThermalHoldout({...manifest,...margins},evidence);
    assert.equal(result.status,'inconclusive',JSON.stringify(margins));
    assert.deepEqual(result.blockers,['invalid_frozen_margins']);
    assert.equal(result.eligibleForProduction,false);
  }
});

test('valid frozen margins include endpoints and retain strict interval comparisons',()=>{
  const {manifest,evidence}=packet();
  evidence[0].thermal.status='available';
  for (const row of evidence.slice(3)) row.b.alert=false;
  for (const [minimumGain,maximumHarm,status] of [
    [0,100,'clears_frozen_margins'],
    [1,100,'inconclusive'], // gain touches its margin
    [0,0,'inconclusive'] // harm touches its cap
  ]) {
    const result=compareThermalHoldout({...manifest,minimumGain,maximumHarm},evidence);
    assert.equal(result.status,status);
    assert.deepEqual(result.blockers,[]);
    assert.deepEqual(result.gain.interval95,[1,1]);
    assert.deepEqual(result.harm.interval95,[0,0]);
    assert.equal(result.eligibleForProduction,false);
  }
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
test('malformed receipt clocks retain the sealed cohort but withhold all estimates',()=>{
  for (const invalid of ['not-a-date','2025-02-30T00:00:00.000Z','2025-01-05T00:00:00Z',0]) {
    for (const [receipt,index,field,blocker,stratum] of [
      ['truthReceipt',1,'missingTruthWindows','unresolved_independent_truth','unknown'],
      ['truthReceipt',3,'missingTruthWindows','unresolved_independent_truth','unknown'],
      ['a',1,'missingAsOfWindows','unresolved_as_of_receipt','unplanned'],
      ['thermal',0,'missingAsOfWindows','unresolved_as_of_receipt','planned'],
      ['thermal',1,'missingAsOfWindows','unresolved_as_of_receipt','unplanned'],
      ['b',1,'missingAsOfWindows','unresolved_as_of_receipt','unplanned']
    ]) {
      const {manifest,evidence}=packet();
      // An unreadable out-of-scope receipt cannot silently remove a window either.
      if (receipt==='truthReceipt' && index===3) evidence[index].truth='out_of_scope';
      evidence[index][receipt].knownAt=invalid;
      const result=compareThermalHoldout(manifest,evidence);
      assert.equal(result.status,'inconclusive');
      assert.ok(result.blockers.includes(blocker));
      assert.equal(result.sealedWindows,manifest.windows.length);
      assert.equal(result.coverage[field],1);
      assert.equal(result.byStratum[stratum][field],1);
      assert.equal(result.coverage.adjudicatedOutOfScopeWindows,0);
      assert.equal(result.gain,null);
      assert.equal(result.harm,null);
      assert.equal(result.pairedObservable.gain,null);
      assert.equal(result.pairedObservable.harm,null);
      assert.equal(result.eligibleForProduction,false);
    }
  }
});

test('malformed sealed manifest clocks still reject structural input',()=>{
  for (const field of ['frozenAt','holdoutStart','ascertainmentCutoff','start','end','cutoff']) {
    const {manifest,evidence}=packet();
    const target=Object.hasOwn(manifest,field) ? manifest : manifest.windows[0];
    target[field]='2025-02-30T00:00:00.000Z';
    assert.throws(()=>compareThermalHoldout(manifest,evidence),/Expected canonical UTC timestamp/);
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

for (const [name,modify,message] of [
  ['training episode',manifest=>{manifest.trainingEpisodeIds=['episode-2 '];},/Expected sealed training episode list/],
  ['alternate row in the same episode',(_,rows)=>{rows[2].episodeId=' episode-2';},/Missing adjudicated event episode/],
  ['split negative block',manifest=>{manifest.windows[5].negativeBlockId='2\t';},/Missing sealed time block/],
  ['matched window and evidence', (manifest,rows)=>{manifest.windows[0].id=rows[0].windowId='0 ';},/Duplicate or invalid sealed window/],
  ['linked control',(_,rows)=>{rows[3].episodeId='episode-1 ';},/Control needs explicit null or canonical episode identifier/]
]) {
  test(`rejects a padded identifier: ${name}`,()=>{
    const {manifest,evidence}=packet();
    modify(manifest,evidence);
    assert.throws(()=>compareThermalHoldout(manifest,evidence),message);
  });
}

test('a nonblank free-text truth reference need not be a canonical identifier',()=>{
  const {manifest,evidence}=packet();
  const result=compareThermalHoldout(manifest,evidence);
  evidence[0].truthReceipt.reference=' synthetic-review ';
  assert.deepEqual(compareThermalHoldout(manifest,evidence),result);
});
