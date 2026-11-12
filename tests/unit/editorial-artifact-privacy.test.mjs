import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEditorialDiagnosticReceipt } from '../../scripts/write-editorial-diagnostic-receipt.mjs';

const cli=fileURLToPath(new URL('../../scripts/write-editorial-diagnostic-receipt.mjs',import.meta.url));
const consumers={macro:['macro-risk-editorial','macro-risk-editorial-refresh.yml','review-latest.json'],bubble:['bubble-watch-weekly-editorial','bubble-watch-weekly-editorial-refresh.yml','quality-review-latest.json']};
const privateText='PRIVATE_REJECTED_BODY https://private.example/private-id';
const make=(consumer)=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-private-artifact-test-'));const directory=path.join(root,'manual-artifacts',consumers[consumer][0]);fs.mkdirSync(directory,{recursive:true});return {root,directory};};

test('both ordinary workflows retain one exact receipt; selected successful Bubble grant has one narrow bundle exception',()=>{
  for(const [consumer,[prefix,file]] of Object.entries(consumers)) {
    const workflow=fs.readFileSync(`.github/workflows/${file}`,'utf8');
    const allUploads=workflow.split('\n      - name:').filter(step=>step.includes('uses: actions/upload-artifact@'));
    const candidateUploads=allUploads.filter(step=>step.startsWith(' Upload receipt-grant review candidate\n'));
    assert.equal(candidateUploads.length,consumer==='bubble'?1:0);
    if(consumer==='bubble') {
      assert.ok(candidateUploads[0].includes("if: inputs.budget_selection == 'editorial-bubble-receipt-20261112-v1' && steps.receipt_candidate.outcome == 'success'"));
      assert.ok(candidateUploads[0].includes('path: manual-artifacts/bubble-watch-weekly-editorial/receipt-review-candidate.json\n'));
      assert.ok(candidateUploads[0].includes('retention-days: 3'));
    }
    const uploads=allUploads.filter(step=>!step.startsWith(' Upload receipt-grant review candidate\n'));
    assert.equal(uploads.length,1,consumer);
    assert.ok(uploads[0].includes("if: always() && steps.diagnostic_receipt.outcome == 'success'"));
    assert.match(uploads[0],new RegExp(`path: manual-artifacts/${prefix}/safe-diagnostic-receipt\\.json\\n`));
    assert.equal((uploads[0].match(/path:/gu)||[]).length,1);
    for(const forbidden of ['deepseek-output','deepseek-failure','editorial-input','news-discovery','production-projection','quality-review','review-latest','path: |','**','*.json'])assert.equal(uploads[0].includes(forbidden),false,forbidden);
    const receipt=workflow.split('- name: Prepare safe editorial diagnostic receipt')[1].split('\n      - name:')[0];
    assert.ok(receipt.includes('if: always()'));
    for(const state of ['provider','review','writer','save'])assert.ok(receipt.includes(`steps.editorial_${state}.outcome`));
    assert.ok(workflow.indexOf('- name: Prepare safe editorial diagnostic receipt')>workflow.indexOf('git push origin HEAD:main'));
  }
});

test('provider rejection, later review rejection, writer failure, uncertain push and success all retain only safe receipts',()=>{
  for(const consumer of Object.keys(consumers)) {
    const {root,directory}=make(consumer);
    try {
      for(const name of ['news-discovery-latest.json','editorial-input-latest.json','deepseek-output-latest.json','production-projection-latest.json'])fs.writeFileSync(path.join(directory,name),JSON.stringify({PRIVATE_FIELD:privateText}));
      fs.writeFileSync(path.join(directory,'deepseek-failure-latest.json'),JSON.stringify({replayCandidate:{output:privateText},requestDiagnostics:{response:{responseModel:privateText,errorType:privateText,contract:{errorCount:1,errors:[privateText],claims:[{claimPath:privateText,fieldPath:privateText,ruleCode:privateText,atom:{kind:'unparsed-financial',key:privateText},sourceRefIds:[privateText]}]}}}}));
      for(const states of [
        {provider:'failure',review:'skipped',writer:'skipped',save:'skipped'},
        {provider:'success',review:'failure',writer:'skipped',save:'skipped'},
        {provider:'success',review:'success',writer:'failure',save:'skipped'},
        {provider:'success',review:'success',writer:'success',save:'failure'},
        {provider:'success',review:'success',writer:'success',save:'cancelled'},
        {provider:'success',review:'success',writer:'success',save:'success'}]) {
        fs.writeFileSync(path.join(directory,consumers[consumer][2]),JSON.stringify({status:states.review==='failure'?'fail':'pass',blockers:[privateText],warnings:[privateText]}));
        const receipt=buildEditorialDiagnosticReceipt({consumer,root,outcomes:states}),encoded=JSON.stringify(receipt);
        assert.deepEqual(receipt.stepOutcomes,states);
        assert.equal(receipt.rawTextRetained,false);assert.equal(receipt.replayPossibleFromReceipt,false);
        assert.equal(receipt.repositorySaveVerified,false);assert.equal(receipt.livePublicationVerified,false);
        for(const marker of ['PRIVATE','private.example','replayCandidate'])assert.equal(encoded.includes(marker),false);
        assert.match(receipt.files.output.sha256,/^[a-f0-9]{64}$/u);
        assert.ok(encoded.length<10000);
      }
      const run=spawnSync(process.execPath,[cli,'--consumer',consumer],{cwd:root,encoding:'utf8',env:{...process.env,EDITORIAL_PROVIDER_OUTCOME:privateText}});
      assert.equal(run.status,0,run.stderr);assert.equal((run.stdout+run.stderr).includes('PRIVATE'),false);
      assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'safe-diagnostic-receipt.json')))).includes('PRIVATE'),false);
      assert.ok(fs.readFileSync(path.join(directory,'deepseek-output-latest.json'),'utf8').includes(privateText),'transient original is preserved, never rewritten');
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  }
});

test('malformed, oversized and linked files do not expose their contents or arbitrary parse errors',()=>{
  const {root,directory}=make('macro');
  try {
    fs.writeFileSync(path.join(directory,'deepseek-failure-latest.json'),privateText);
    fs.writeFileSync(path.join(directory,'deepseek-output-latest.json'),'X'.repeat(2*1024*1024+1));
    const privateFile=path.join(root,'private-file');fs.writeFileSync(privateFile,privateText);fs.symlinkSync(privateFile,path.join(directory,'editorial-input-latest.json'));
    const r=buildEditorialDiagnosticReceipt({consumer:'macro',root});assert.equal(r.providerDiagnostics,null);assert.equal(r.files.output.state,'not_read');assert.equal(r.files.input.state,'not_read');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
    fs.symlinkSync(privateFile,path.join(directory,'safe-diagnostic-receipt.json'));
    const run=spawnSync(process.execPath,[cli,'--consumer','macro'],{cwd:root,encoding:'utf8'});assert.notEqual(run.status,0);assert.equal((run.stdout+run.stderr).includes('PRIVATE'),false);assert.equal(fs.readFileSync(privateFile,'utf8'),privateText);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('all rejected-output CLI log boundaries withhold exception text rather than publishing validator/parser strings',()=>{
  for(const file of ['scripts/macro-risk/review-editorial.mjs','scripts/macro-risk/project-editorial.mjs','scripts/bubble-watch/review-weekly-editorial.mjs','scripts/bubble-watch/project-weekly-editorial.mjs','scripts/write-macro-risk-editorial.mjs','scripts/write-bubble-watch-weekly-editorial.mjs','scripts/macro-risk/run-editorial-deepseek.mjs','scripts/bubble-watch/run-weekly-editorial-deepseek.mjs']) {
    const text=fs.readFileSync(file,'utf8');assert.equal(/console\.error\([^\n]*error\.message/u.test(text),false,file);
  }
});


test('real review/projection/writer CLIs with malformed private payloads log only fixed failure text',()=>{
  const {root,directory}=make('macro');
  try {
    const bubble=path.join(root,'manual-artifacts',consumers.bubble[0]);fs.mkdirSync(bubble,{recursive:true});
    for(const dir of [directory,bubble])for(const name of ['editorial-input-latest.json','deepseek-output-latest.json','review-latest.json','quality-review-latest.json','production-projection-latest.json'])fs.writeFileSync(path.join(dir,name),privateText);
    fs.mkdirSync(path.join(root,'data'));for(const name of ['radar-data.json','bubble-watch.json'])fs.writeFileSync(path.join(root,'data',name),privateText);
    for(const file of ['scripts/macro-risk/review-editorial.mjs','scripts/macro-risk/project-editorial.mjs','scripts/bubble-watch/review-weekly-editorial.mjs','scripts/bubble-watch/project-weekly-editorial.mjs','scripts/write-macro-risk-editorial.mjs','scripts/write-bubble-watch-weekly-editorial.mjs']) {
      const macro=file.includes('macro'),prefix=macro?consumers.macro[0]:consumers.bubble[0];
      const args=file.includes('/write-')?['--confirm-production-write','--data-only','--input',`manual-artifacts/${prefix}/production-projection-latest.json`,'--target',macro?'data/radar-data.json':'data/bubble-watch.json',...(macro?['--source-input',`manual-artifacts/${prefix}/editorial-input-latest.json`]:[])]:[];
      const run=spawnSync(process.execPath,[fileURLToPath(new URL(`../../${file}`,import.meta.url)),...args],{cwd:root,encoding:'utf8'});
      assert.notEqual(run.status,0,file);for(const marker of ['PRIVATE','private.example'])assert.equal((run.stdout+run.stderr).includes(marker),false,file);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
