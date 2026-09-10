import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessDailyInput, prepareDailyInput } from '../../scripts/daily/prepare-realtime-input.mjs';
const now = Date.parse('2026-09-10T06:00:00Z');
const payload = { updatedAt: '2026-09-10T05:40:00Z', sourceMode: 'live', values: { brent: 100 }, healthScore: 100 };
const candidate = { sha: 'a'.repeat(40), payload };
test('workflow reaches mandatory preflight after an initial fetch failure, before paid generation', () => {
  const workflow=fs.readFileSync(new URL('../../.github/workflows/build-daily-radar-data.yml',import.meta.url),'utf8');
  const initial=workflow.indexOf('- name: Use latest realtime payload');
  const preflight=workflow.indexOf('- name: Prepare trusted Daily input before generation');
  const generation=workflow.indexOf('- name: Generate radar data');
  assert.ok(initial>=0 && preflight>initial && generation>preflight);
  assert.match(workflow.slice(initial,preflight),/continue-on-error: true/);
  assert.doesNotMatch(workflow.slice(preflight,generation),/continue-on-error|if:/);
  assert.match(workflow.slice(preflight,generation),/prepare-realtime-input\.mjs --recover/);
});
test('preflight rejects stale, future, malformed and untrusted input before generation', () => {
  for (const patch of [{updatedAt:'2026-09-10T01:18:00Z'}, {updatedAt:'2026-09-10T06:01:00Z'}, {updatedAt:null}, {sourceMode:'mock'}, {cacheOnly:true}, {healthScore:0}, {values:null}]) {
    assert.equal(assessDailyInput({...payload,...patch},now).ok,false);
  }
  assert.equal(assessDailyInput({...payload,updatedAt:'2026-09-10T04:30:00Z'},now).ok,true);
  // Invalid individual leaves remain eligible for the existing Wind leaf fallback, not a new full-payload substitute.
  assert.equal(assessDailyInput({...payload,values:{brent:null}},now).ok,true);
});
test('fresh input skips recovery; unusable input requests exactly one recovery and reads the new commit', async () => {
  const forbidden = async () => {throw Error('must not recover/wait');};
  assert.equal(await prepareDailyInput({read:async()=>candidate,recover:forbidden,wait:forbidden,now:()=>now}),candidate);
  let reads=0, calls=0;
  const result=await prepareDailyInput({read:async()=>{if(++reads<3)throw Error('unavailable');return candidate;},recover:async()=>calls++,wait:async()=>{},now:()=>now});
  assert.equal(result.sha,candidate.sha); assert.equal(calls,1); assert.equal(reads,3);
});
test('failed recovery and exhausted polling fail closed without repeated dispatch', async () => {
  let calls=0,reads=0;
  await assert.rejects(prepareDailyInput({read:async()=>{reads++;return {...candidate,sha:'bad'};},recover:async()=>calls++,wait:async()=>{},now:()=>now,maxPolls:2}),/generation must not start/);
  assert.equal(calls,1); assert.equal(reads,3);
  await assert.rejects(prepareDailyInput({read:async()=>null,recover:async()=>{throw Error('dispatch failed');},wait:async()=>{throw Error('must not poll');}}),/dispatch failed/);
});
