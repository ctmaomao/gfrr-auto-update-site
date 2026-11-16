import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWithThermalReceipt, THERMAL_RECEIPT_PATH, isCurrentThermalReceipt } from '../../scripts/oil-directional/thermal-receipt-run.mjs';
import { parseArgs } from '../../scripts/oil-directional/build-oil-thermal-watch.mjs';
const env={GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',THERMAL_ACTUAL_CHECKOUT_SHA:'a'.repeat(40)};
const config={facilities:[{id:'fixture',bbox:{string:'0,0,1,1'}}]};
const options={sources:['VIIRS_NOAA20_NRT'],dayRange:1,timeoutMs:2000};
const input={enabled:true,config,options,env};
const at='2026-11-15T01:00:00.000Z';
const receipt={source:options.sources[0],areaId:'fixture',bbox:'0,0,1,1',dayRange:1,outcome:'parsed',logicalRequestStartedAt:at,bodyReceivedAt:at,classifiedAt:at,researchCsvShapeValid:true,records:[],diagnostics:{outcome:'success',httpStatus:200,attempts:1,retryCount:0}};
async function isolated(fn){const cwd=process.cwd(),directory=mkdtempSync(join(tmpdir(),'thermal-receipt-run-'));process.chdir(directory);try{await fn();}finally{process.chdir(cwd);rmSync(directory,{recursive:true,force:true});}}
test('CLI is opt-in and disabled/bad metadata create no research files or change build result',()=>isolated(async()=>{
  assert.equal(parseArgs([]).researchReceipt,false);assert.equal(parseArgs(['--research-receipt']).researchReceipt,true);
  for(const change of [{enabled:false},{env:{}},{env:{...env,THERMAL_ACTUAL_CHECKOUT_SHA:'SECRET_CANARY'}}]) {
    assert.equal(await runWithThermalReceipt({...input,...change},r=>{assert.equal(r,null);return 'production';}),'production');
    assert.equal(existsSync(THERMAL_RECEIPT_PATH),false);
  }
}));
test('current run, actual checkout and expected request count bind a finalized receipt',()=>isolated(async()=>{
  assert.equal(await runWithThermalReceipt(input,r=>{r.record(receipt);return 'production';}),'production');
  const text=readFileSync(THERMAL_RECEIPT_PATH,'utf8'),s=JSON.parse(text);assert.equal(s.finalized,true);assert.equal(s.complete,true);assert.equal(s.receipts.length,1);
  const identity={runId:'123',runAttempt:'1',checkoutSha:env.THERMAL_ACTUAL_CHECKOUT_SHA};
  assert.equal(isCurrentThermalReceipt(text,identity),true);
  for(const changes of [{runId:'124'},{runAttempt:'2'},{checkoutSha:'b'.repeat(40)}])assert.equal(isCurrentThermalReceipt(text,{...identity,...changes}),false);
  assert.equal(isCurrentThermalReceipt('x'.repeat(262145),identity),false);
}));
test('unfinished builder writes non-finalized bounded evidence and preserves original error',()=>isolated(async()=>{
  await assert.rejects(runWithThermalReceipt(input,r=>{r.record(receipt);throw Error('production failure');}),/production failure/);
  assert.equal(JSON.parse(readFileSync(THERMAL_RECEIPT_PATH,'utf8')).finalized,false);
}));
test('missing callbacks are incomplete even after successful production build',()=>isolated(async()=>{
  await runWithThermalReceipt(input,()=> 'production');const s=JSON.parse(readFileSync(THERMAL_RECEIPT_PATH,'utf8'));
  assert.equal(s.finalized,true);assert.equal(s.complete,false);assert.ok(s.limitations.includes('incomplete_run'));
}));
test('write failure/symlink rejection cannot alter production result or disclose errors',()=>isolated(async()=>{
  writeFileSync('manual-artifacts','fixture blocking file');
  assert.equal(await runWithThermalReceipt(input,r=>{r.record(receipt);return 'production';}),'production');
  rmSync('manual-artifacts');mkdirSync('elsewhere');symlinkSync('elsewhere','manual-artifacts');
  assert.equal(await runWithThermalReceipt(input,()=> 'production'),'production');assert.equal(existsSync('elsewhere/oil-thermal-research'),false);
}));

test('fresh-write marker is emitted only after successful atomic write, not for old same-run files',()=>isolated(async()=>{
  const withOutput={...input,env:{...env,GITHUB_OUTPUT:'step-output'}};
  await runWithThermalReceipt(withOutput,r=>{r.record(receipt);return 'production';});
  assert.equal(readFileSync('step-output','utf8'),'research_receipt_written=true\n');
  writeFileSync('step-output','');
  await runWithThermalReceipt({...withOutput,options:{...options,sources:[]}},()=> 'production');
  assert.equal(readFileSync('step-output','utf8'),'');assert.equal(existsSync(THERMAL_RECEIPT_PATH),true);
}));

test('workflow keeps research upload after production commit with current-write guard and bounded exact artifact',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/refresh-oil-thermal-watch.yml',import.meta.url),'utf8');
  assert.ok(workflow.indexOf('- name: Commit')<workflow.indexOf('- name: Verify current-run research receipt'));
  assert.match(workflow,/research_receipt_written == 'true'/);assert.match(workflow,/THERMAL_CAPTURE_CHECKOUT_SHA: \$\{\{ steps\.thermal_refresh\.outputs\.actual_checkout_sha \}\}/);
  const upload=workflow.slice(workflow.indexOf('- name: Upload bounded thermal research receipt'));
  assert.match(upload,/continue-on-error: true/);assert.match(upload,/timeout-minutes: 2/);assert.match(upload,/retention-days: 7/);
  assert.match(upload,/path: manual-artifacts\/oil-thermal-research\/receipt\.json/);assert.match(upload,/include-hidden-files: false/);
  assert.doesNotMatch(upload,/path:.*\*/);assert.match(workflow,/git add data\/oil-thermal-watch\.json/);
});
