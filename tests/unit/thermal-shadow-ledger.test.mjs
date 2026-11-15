import test from 'node:test';
import assert from 'node:assert/strict';
import { appendThermalReceipt, validateThermalLedger } from '../../scripts/oil-directional/thermal-shadow-ledger.mjs';

const manifest = { pilotId:'synthetic-global-scope', cohortId:'fixture-cohort-1', sourceSet:['SAT_A','SAT_B'], geometryRevision:'geometry-1', configRevision:'config-1' };
const identity = 'sha256:' + 'a'.repeat(64);
const observation = { identity, acquiredAt:'2026-01-01T01:00:00Z', frpMw:0, confidence:'n', dayNight:'N', processingRevision:null };
function receipt(overrides={}) {
  return { requestId:'request-1', cohortId:'fixture-cohort-1', source:'SAT_A', geometryRevision:'geometry-1', configRevision:'config-1', codeRevision:'collector-fixture-1',
    fetchStartedAt:'2026-01-01T02:00:00Z',receivedAt:'2026-01-01T02:01:00Z',windowStart:'2026-01-01T00:00:00Z',windowEnd:'2026-01-01T02:00:00Z',
    outcome:'success_detections',observations:[{...observation}],...overrides };
}
const clone = value => JSON.parse(JSON.stringify(value));
const initial = () => appendThermalReceipt(null,receipt(),manifest);

test('firstSeen comes only from receipt clock; fixture nature and unknown coverage are fixed', () => {
  const ledger=initial();
  assert.equal(ledger.observations[0].firstSeenAt,'2026-01-01T02:01:00.000Z');
  assert.notEqual(ledger.observations[0].firstSeenAt,ledger.observations[0].acquiredAt);
  assert.equal(ledger.dataAuthenticity,'synthetic_fixture_only');
  assert.equal(ledger.eligibleForEvaluation,false);assert.equal(ledger.coverage,'unknown');
  assert.deepEqual(ledger.labels,[]);assert.deepEqual(validateThermalLedger(ledger),{valid:true,errors:[]});
  assert.equal(ledger.observations[0].revisions[0].value.frpMw,0);
  const missing=receipt();delete missing.receivedAt;
  assert.throws(()=>appendThermalReceipt(null,missing,manifest));
  assert.throws(()=>appendThermalReceipt(null,{...receipt(),firstSeenAt:observation.acquiredAt},manifest));
});

test('same request is idempotent; different request and repeated observation preserve identity and firstSeen', () => {
  const first=initial();
  assert.deepEqual(appendThermalReceipt(first,receipt()),first);
  const second=appendThermalReceipt(first,receipt({requestId:'request-2',receivedAt:'2026-01-01T03:01:00Z'}));
  assert.equal(second.receipts.length,2);assert.equal(second.observations.length,1);
  assert.equal(second.observations[0].revisions.length,1);
  assert.equal(second.observations[0].firstSeenAt,first.observations[0].firstSeenAt);
  assert.throws(()=>appendThermalReceipt(first,receipt({receivedAt:'2026-01-01T03:01:00Z'})),/Conflicting request/);
});

test('different contents are retained revisions rather than new events or overwritten history', () => {
  const first=initial();
  const second=appendThermalReceipt(first,receipt({requestId:'request-2',receivedAt:'2026-01-01T03:01:00Z',observations:[{...observation,frpMw:12.5,processingRevision:'reprocessed-1'}]}));
  assert.equal(second.observations.length,1);assert.equal(second.observations[0].revisions.length,2);
  assert.equal(second.observations[0].revisions[0].value.frpMw,0);
  assert.equal(second.observations[0].revisions[1].firstSeenAt,'2026-01-01T03:01:00.000Z');
  assert.equal(second.observations[0].firstSeenAt,'2026-01-01T02:01:00.000Z');
  const unknown=appendThermalReceipt(first,receipt({requestId:'request-null',observations:[{...observation,frpMw:null}]}));
  assert.equal(unknown.observations[0].revisions[1].value.frpMw,null);
  assert.equal(Object.hasOwn(second,'events'),false);
});

test('source, geometry, config and cohort cannot change in place', () => {
  for (const change of [{source:'SAT_C'},{cohortId:'new-cohort'},{geometryRevision:'geometry-2'},{configRevision:'config-2'}]) {
    assert.throws(()=>appendThermalReceipt(initial(),receipt({requestId:'request-2',...change})));
  }
  assert.throws(()=>appendThermalReceipt(initial(),receipt({requestId:'request-2'}),{...manifest,sourceSet:['SAT_A']}));
  assert.throws(()=>appendThermalReceipt(initial(),receipt({requestId:'request-2',source:'SAT_B'})),/identity conflicts/);
  assert.throws(()=>appendThermalReceipt(initial(),receipt({requestId:'request-2',observations:[{...observation,acquiredAt:'2026-01-01T01:01:00Z'}]})),/identity conflicts/);
  const fresh=appendThermalReceipt(null,receipt({cohortId:'new-cohort'}),{...manifest,cohortId:'new-cohort'});
  assert.equal(validateThermalLedger(fresh).valid,true);
});

test('zero/error/retired receipts never create safety, event or complete-coverage claims', () => {
  for (const outcome of ['retired','error','invalid_response','success_zero']) {
    const ledger=appendThermalReceipt(null,receipt({outcome,observations:[]}),manifest);
    assert.deepEqual(ledger.observations,[]);assert.equal(ledger.coverage,'unknown');
    assert.equal(ledger.eligibleForEvaluation,false);assert.deepEqual(ledger.labels,[]);
    assert.throws(()=>appendThermalReceipt(null,receipt({outcome}),manifest));
  }
  assert.throws(()=>appendThermalReceipt(null,receipt({observations:[]}),manifest));
});

test('strict clocks reject rollover, future acquisition and backdated arrivals', () => {
  for (const receivedAt of ['',null,'2026-02-30T01:00:00Z','2026-01-01T24:00:00Z','2026-01-01T02:01:00+00:00']) {
    assert.throws(()=>appendThermalReceipt(null,receipt({receivedAt}),manifest));
  }
  assert.throws(()=>appendThermalReceipt(null,receipt({fetchStartedAt:'2026-01-01T03:00:00Z'}),manifest));
  assert.throws(()=>appendThermalReceipt(null,receipt({observations:[{...observation,acquiredAt:'2026-01-01T04:00:00Z'}]}),manifest));
  assert.throws(()=>appendThermalReceipt(initial(),receipt({requestId:'old',receivedAt:'2026-01-01T02:00:00Z'})),/Backdated/);
});

test('unknown fields and invalid values cannot silently enter the sanitized ledger', () => {
  for (const frpMw of ['',undefined,false,-1,NaN,Infinity]) {
    assert.throws(()=>appendThermalReceipt(null,receipt({observations:[{...observation,frpMw}]}),manifest));
  }
  for (const extra of [{url:'https://provider.invalid/secret'},{apiKey:'private'},{coverage:'complete'}]) {
    assert.throws(()=>appendThermalReceipt(null,{...receipt(),...extra},manifest));
    assert.throws(()=>appendThermalReceipt(null,receipt({observations:[{...observation,...extra}]}),manifest));
  }
  assert.throws(()=>appendThermalReceipt(null,receipt({requestId:'https://provider.invalid'}),manifest));
  assert.throws(()=>appendThermalReceipt(null,receipt(),{...manifest,apiKey:'private'}));
  assert.throws(()=>appendThermalReceipt(null,receipt({observations:[observation,observation]}),manifest));
});

test('input objects remain unchanged and failures cannot leave partial state', () => {
  const first=initial(), before=clone(first), input=receipt({requestId:'request-2'}), inputBefore=clone(input), manifestBefore=clone(manifest);
  appendThermalReceipt(first,input);
  assert.deepEqual(first,before);assert.deepEqual(input,inputBefore);assert.deepEqual(manifest,manifestBefore);
  const partlyValid=receipt({requestId:'bad-atomic',observations:[{...observation,identity:'sha256:'+'b'.repeat(64)},{...observation,acquiredAt:'2026-01-01T01:01:00Z'}]});
  assert.throws(()=>appendThermalReceipt(first,partlyValid));assert.deepEqual(first,before);
});

test('deterministic replay rejects forged clocks, derived history and eligibility', () => {
  for (const mutate of [l=>{l.observations[0].firstSeenAt=l.observations[0].acquiredAt;},l=>{l.eligibleForEvaluation=true;},l=>{l.coverage='complete';},l=>{l.labels=[{outage:true}];},l=>{l.observations[0].revisions=[];},l=>{l.receipts.push(clone(l.receipts[0]));}]) {
    const forged=initial();mutate(forged);
    assert.equal(validateThermalLedger(forged).valid,false);
    assert.throws(()=>appendThermalReceipt(forged,receipt({requestId:'next'})));
  }
});

test('state and row bounds fail closed', () => {
  assert.throws(()=>appendThermalReceipt(null,receipt({observations:Array.from({length:101},(_,i)=>({...observation,identity:'sha256:'+i.toString(16).padStart(64,'0')}))}),manifest),/row limit/);
  let ledger=null;
  for(let i=0;i<100;i++) ledger=appendThermalReceipt(ledger,receipt({requestId:`request-${i}`,outcome:'success_zero',observations:[]}),manifest);
  assert.throws(()=>appendThermalReceipt(ledger,receipt({requestId:'request-101',outcome:'success_zero',observations:[]})),/Receipt limit/);
  assert.throws(()=>appendThermalReceipt(null,{...receipt(),extra:'a'.repeat(1_000_000)},manifest),/byte limit/);
});


test('unique observation cap is distinct from receipt or event counts', () => {
  let ledger = null;
  for (let batch=0;batch<10;batch++) {
    const observations = Array.from({length:100},(_,i)=>({...observation,identity:'sha256:'+(batch*100+i).toString(16).padStart(64,'0')}));
    ledger = appendThermalReceipt(ledger,receipt({requestId:`batch-${batch}`,observations}),manifest);
  }
  assert.equal(ledger.observations.length,1000);
  assert.throws(()=>appendThermalReceipt(ledger,receipt({requestId:'overflow',observations:[{...observation,identity:'sha256:'+'f'.repeat(64)}]})),/Unique observation limit/);
  assert.equal(ledger.observations.length,1000);
});
