import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPublishedBaseline } from '../../scripts/realtime/load-published-baseline.mjs';

test('published commit replaces checkout cache without laundering observation timestamps', t => {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-baseline-'));
  t.after(()=>{if(path.resolve(cwd).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(cwd,{recursive:true});});
  fs.mkdirSync(path.join(cwd,'realtime')); const file=path.join(cwd,'realtime','market.json');
  fs.writeFileSync(file,'old-main-cache');
  const payload={updatedAt:'2026-09-10T05:40:00Z',values:{brent:101},sourceMode:'live',sourceDetails:{brent:{timestamp:'2026-09-09T00:00:00Z'}}};
  const text=JSON.stringify(payload),sha='a'.repeat(40),calls=[];
  const result=loadPublishedBaseline({cwd,git:args=>{calls.push(args);return args[0]==='rev-parse'?sha:args[0]==='show'?text:'';}});
  assert.equal(result.sha,sha); assert.equal(fs.readFileSync(file,'utf8'),text);
  assert.deepEqual(calls,[['fetch','origin','realtime-data'],['rev-parse','origin/realtime-data'],['show',`${sha}:realtime/market.json`]]);
  for(const invalid of ['{',JSON.stringify({...payload,sourceMode:'mock'}),JSON.stringify({...payload,values:null})]){
    assert.throws(()=>loadPublishedBaseline({cwd,git:a=>a[0]==='rev-parse'?sha:a[0]==='show'?invalid:''}));
    assert.equal(fs.readFileSync(file,'utf8'),text);
  }
  assert.throws(()=>loadPublishedBaseline({cwd,git:()=>{throw Error('fetch failed');}}),/fetch failed/);
  assert.equal(fs.readFileSync(file,'utf8'),text);
});
test('both generators load the published baseline before building; skipped recovery does not fetch',()=>{
  for(const name of ['build-realtime-market','recover-stale-realtime-market']){
    const workflow=fs.readFileSync(new URL(`../../.github/workflows/${name}.yml`,import.meta.url),'utf8');
    const start=workflow.indexOf('- name: Load published realtime baseline');
    const end=workflow.indexOf('- name: Generate realtime market');
    assert.ok(start>=0 && end>start); assert.match(workflow.slice(start,end),/load-published-baseline\.mjs/);
    if(name.startsWith('recover'))assert.match(workflow.slice(start,end),/if: steps.health.outputs.shouldRecover == 'true'/);
  }
});
