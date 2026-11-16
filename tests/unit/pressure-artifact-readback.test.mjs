import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PRESSURE_PERSISTENCE_IDENTITY } from '../../scripts/daily/pressure-artifact-readback.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const head='a'.repeat(40), target='b'.repeat(64), time='2026-11-16T12:00:04.000Z';
const repo='ctmaomao/gfrr-auto-update-site', workflow='.github/workflows/pressure-model-shadow.yml';
const source=fs.readFileSync(new URL('../../scripts/daily/pressure-artifact-readback.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function fixture() {
  const report=Buffer.from('{"report":"derived"}'),ledger=Buffer.from('{"records":["derived"]}');
  const manifest={schemaVersion:'pressure-shared-persistence-v1',repositoryId:1214037901,runId:'123',attempt:'2',workflowId:355507532,
    runnerName:'test-runner-1',jobName:'research',workflowPath:workflow,headSha:head,checkoutSha:head,legacyArtifactId:'101',legacyCommit:'5f4fb4c1ea4c870af0dd36b6c3e0683a79f026f6',
    legacyImplementation:'d3723b145c0eab8538938d3d95bdf033c68dd8ee7e68e85630b354c6d5e8001b',protocolHash:'c'.repeat(64),targetImplementation:target,
    retrievedAt:'2026-11-16T12:00:01.000Z',evaluationDate:'2026-11-16',legacyRecordHash:'d'.repeat(64),
    startedAt:'2026-11-16T12:00:00.000Z',finishedAt:'2026-11-16T12:00:01.000Z',cacheSha256:'e'.repeat(64),
    legacyReportSha256:sha(report),legacyLedgerSha256:sha(ledger)};
  const run={id:123,run_attempt:2,workflow_id:355507532,path:workflow,repository:{id:1214037901},head_repository:{id:1214037901},head_branch:'main',head_sha:head,event:'schedule',status:'in_progress',run_started_at:'2026-11-16T11:59:00Z'};
  return {report,ledger,manifest,run};
}
function zip(entries) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pressure-test-zip-')),file=path.join(root,'data.zip');
  try {
    fs.writeFileSync(path.join(root,'entries.json'),JSON.stringify(entries.map(([k,v])=>[k,Buffer.from(v).toString('base64')])));
    execFileSync('python3',['-I','-c','import base64,json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:\n for k,v in json.load(open(sys.argv[2])): z.writestr(k,base64.b64decode(v))',file,path.join(root,'entries.json')],{stdio:['ignore','pipe','pipe']});
    return fs.readFileSync(file);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
function harness(mutate=()=>{}) {
  const data=fixture(),calls=[];
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1214037901',GITHUB_REF:'refs/heads/main',
    GITHUB_WORKFLOW_REF:`${repo}/${workflow}@refs/heads/main`,GITHUB_EVENT_NAME:'schedule',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:head,
    GITHUB_JOB:'research',RUNNER_NAME:'test-runner-1',GH_TOKEN:'test-read-token',PATH:process.env.PATH};
  const context={data,env,head,entries:null,fail:null,metadataMutate:()=>{},corrupt:false,now:time};mutate(context);
  const oldZip=zip(context.entries??[['report.json',data.report],['shadow-ledger.json',data.ledger]]);
  const manifestZip=zip([['retrieval-receipt.json',JSON.stringify(data.manifest)]]);
  const options={legacyArtifactId:'101',legacyArtifactDigest:sha(oldZip),manifestArtifactId:'102',manifestArtifactDigest:sha(manifestZip),targetImplementation:target};
  const metadata=(id,name,bytes,created_at)=>({id,name,expired:false,size_in_bytes:bytes.length,digest:`sha256:${sha(bytes)}`,created_at,
    workflow_run:{id:123,repository_id:1214037901,head_repository_id:1214037901,head_branch:'main',head_sha:head}});
  const old=metadata(101,'pressure-shadow-29d69c0ecb7b98a0',oldZip,'2026-11-16T12:00:02Z');
  const shared=metadata(102,'pressure-shared-123-2',manifestZip,'2026-11-16T12:00:03Z');context.metadataMutate(old,shared);
  const mockExecute=async(program,args,opts)=>{
    calls.push({program,args,env:opts.env});
    if(context.fail===program)throw new Error('token must never escape: test-read-token');
    if(program==='git')return {stdout:context.head};
    if(program==='python3')return {stdout:execFileSync(program,args,{env:opts.env,maxBuffer:opts.maxBuffer,stdio:['ignore','pipe','pipe']})};
    assert.equal(program,'gh');assert.equal(opts.env.GH_TOKEN,'test-read-token');
    const endpoint=args.at(-1);
    const value=endpoint.endsWith('/attempts/2')?data.run:endpoint.endsWith('/101')?old:endpoint.endsWith('/102')?shared:null;
    if(value)return {stdout:Buffer.from(JSON.stringify(value))};
    if(endpoint.endsWith('/101/zip'))return {stdout:context.corrupt?Buffer.alloc(oldZip.length):oldZip};
    if(endpoint.endsWith('/102/zip'))return {stdout:manifestZip};
    assert.fail(`unexpected endpoint ${endpoint}`);
  };
  class Clock extends Date { static now(){return Date.parse(context.now);} }
  const api=vm.runInNewContext(source+'\n({readPersistedPressureArtifacts})',{fs,os,path,createHash,Buffer,Date:Clock,process:{env,cwd:()=>process.cwd()},
    execFile:()=>assert.fail('real gh forbidden'),promisify:()=>mockExecute});
  return {api,options,data,calls,env};
}
test('authenticated exact dual-ID readback returns only bound derived bytes, using native tools and read token',async()=>{
  const h=harness(),result=await h.api.readPersistedPressureArtifacts(h.options);
  assert.deepEqual(result.reportBytes,h.data.report);assert.deepEqual(result.ledgerBytes,h.data.ledger);
  assert.equal(result.manifest.cacheSha256,h.data.manifest.cacheSha256);
  assert.equal(result.receipt,undefined);assert.equal(result.cache,undefined);
  assert.equal(h.calls.filter(c=>c.program==='gh').length,5);
  assert.ok(h.calls.filter(c=>c.program!=='gh').every(c=>!('GH_TOKEN' in c.env)));
});
test('wrong CI, IDs, checkout, token and digest fail closed without caller-proof fallback',async()=>{
  for(const mutation of [x=>x.env.GITHUB_REF='refs/pull/1/merge',x=>x.env.GITHUB_RUN_ATTEMPT='0',x=>x.env.GITHUB_REPOSITORY_ID='9',
    x=>x.env.GITHUB_EVENT_NAME='pull_request',x=>x.env.GITHUB_JOB='other',x=>delete x.env.RUNNER_NAME,x=>delete x.env.GH_TOKEN,x=>x.head='c'.repeat(40),x=>x.corrupt=true]) {
    const h=harness(mutation);await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),/pressure_artifact_hold/);
  }
  const h=harness();await assert.rejects(h.api.readPersistedPressureArtifacts({...h.options,legacyArtifactId:'102'}),/execution_identity/);
  assert.equal(h.calls.length,0);
});
test('run, attempt, workflow, artifact identity and creation order are authenticated, not just artifact name',async()=>{
  for(const mutation of [x=>x.data.run.run_attempt=1,x=>x.data.run.workflow_id=1,x=>x.data.run.head_repository.id=9,
    x=>x.data.run.head_sha='c'.repeat(40),x=>x.data.run.status='completed',x=>x.data.run.run_started_at='2026-11-16T12:01:00Z',
    x=>x.metadataMutate=a=>a.workflow_run.id=122,x=>x.metadataMutate=a=>a.id=99,x=>x.metadataMutate=a=>a.expired=true,x=>x.metadataMutate=a=>a.size_in_bytes=9*1024*1024,
    x=>x.metadataMutate=a=>a.digest='sha256:'+'0'.repeat(64),x=>x.metadataMutate=a=>a.created_at='2026-11-16T11:58:59Z',
    x=>x.metadataMutate=(a,b)=>b.created_at='2026-11-16T12:00:01Z']) {
    const h=harness(mutation);await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),/pressure_artifact_hold/);
  }
});
test('strict ZIP member set rejects raw, missing, duplicate and traversal entries',async()=>{
  for(const names of [['report.json'],['report.json','shadow-ledger.json','source-cache.json'],['report.json','report.json'],['report.json','../shadow-ledger.json']]) {
    const h=harness(x=>x.entries=names.map(n=>[n,'{}']));await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),/archive_members/);
  }
});
test('manifest proves the same original bytes, identity, retrieval window and target without new data claims',async()=>{
  for(const mutation of [m=>m.runnerName='other-runner',m=>m.jobName='other',m=>m.attempt='1',m=>m.legacyArtifactId='99',m=>m.targetImplementation='a'.repeat(64),m=>m.headSha='c'.repeat(40),
    m=>m.checkoutSha='c'.repeat(40),m=>m.cacheSha256='bad',m=>m.legacyLedgerSha256='f'.repeat(64),m=>m.raw={series:[]},
    m=>m.retrievedAt='2026-11-16T11:59:59Z',m=>m.startedAt='2026-11-16T11:40:00Z',m=>m.finishedAt='2026-11-16T12:00:03Z',
    m=>m.evaluationDate='2026-11-15']) {
    const h=harness(x=>mutation(x.data.manifest));await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),/pressure_artifact_hold/);
  }
});
test('API or parser failure surfaces sanitized hold, not credential-bearing subprocess errors',async()=>{
  for(const program of ['gh','python3']) {
    const h=harness(x=>x.fail=program);
    await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),e=>/pressure_artifact_hold/.test(e.message)&&!e.message.includes('test-read-token'));
  }
});

test('readback expiry and same-second GitHub timestamps respect original precision',async()=>{
  const expired=harness(x=>x.now='2026-11-16T12:15:00.001Z');
  await assert.rejects(expired.api.readPersistedPressureArtifacts(expired.options),/manifest_clock/);
  const midnight=harness(x=>x.now='2026-11-17T00:00:00Z');
  await assert.rejects(midnight.api.readPersistedPressureArtifacts(midnight.options),/manifest_clock/);
  const sameSecond=harness(x=>{x.data.manifest.finishedAt='2026-11-16T12:00:02.500Z';});
  const result=await sameSecond.api.readPersistedPressureArtifacts(sameSecond.options);
  assert.equal(result.manifest.finishedAt,'2026-11-16T12:00:02.500Z');
  const oneSecond=harness(x=>{
    x.data.run.run_started_at='2026-11-16T12:00:00.500Z';
    Object.assign(x.data.manifest,{startedAt:'2026-11-16T12:00:00.600Z',retrievedAt:'2026-11-16T12:00:00.700Z',finishedAt:'2026-11-16T12:00:00.800Z'});
    x.metadataMutate=a=>a.created_at='2026-11-16T12:00:00Z';
  });
  assert.ok(await oneSecond.api.readPersistedPressureArtifacts(oneSecond.options));
});

test('small compressed ZIP cannot bypass expanded-member budget',async()=>{
  const h=harness(x=>x.entries=[['report.json','x'.repeat(8*1024*1024+1)],['shadow-ledger.json','{}']]);
  await assert.rejects(h.api.readPersistedPressureArtifacts(h.options),/archive_members/);
});

test('shared persistence identity is frozen and identifies the existing repository workflow',()=>{
  assert.deepEqual(PRESSURE_PERSISTENCE_IDENTITY,{repository:repo,repositoryId:1214037901,workflowId:355507532,workflowPath:workflow});
  assert.equal(Object.isFrozen(PRESSURE_PERSISTENCE_IDENTITY),true);
});
