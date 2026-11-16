import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { pressureFeatures, scorePressure, validateResearchProtocol, quantile, mean, digest } from '../../scripts/daily/pressure-model.mjs';
import { isHistoricalDate } from '../../scripts/daily/historical-validation.mjs';
import { FROZEN_PRESSURE as F, validateSharedCycle, consumeSharedPressureRetrieval } from '../../scripts/daily/pressure-shared-retrieval.mjs';
import { main, parseResearchArgs, implementationHash, evaluateResearch } from '../../scripts/research-pressure-model.mjs';
import { agreementMetrics, bootstrapAgreement, appendShadowLedger, shadowReadiness, validateShadowLedger } from '../../scripts/daily/pressure-evaluation.mjs';
import { parseFredCsv } from '../../scripts/audit-main-score-backtest.mjs';
import { deriveHistoricalRisk } from '../../scripts/daily/historical-score.mjs';
import { describeRiskImplementation } from '../../scripts/run-daily-pipeline.mjs';
import { pressureRemediationDiagnostics } from '../../scripts/daily/pressure-remediation.mjs';
const target = 'a'.repeat(64), start='2026-11-16T10:00:00.000Z', finish='2026-11-16T10:01:00.000Z';
const relative='manual-artifacts/main-score-audit/pressure-model';
function fixture() {
  const protocol={sources:{vix:{seriesId:'VIXCLS'}},benchmarks:{}};
  const sourceIds={vix:'VIXCLS',hyOas:'BAMLH0A0HYM2',igOas:'BAMLC0A0CM',real10y:'DFII10',walcl:'WALCL',onRrp:'RRPONTSYD',t10y2y:'T10Y2Y'};
  const series=Object.fromEntries(Object.keys(sourceIds).map(k=>[k,k==='vix'?[{date:'2026-11-12',value:20},{date:'2026-11-13',value:21}]:[]]));
  const sourceStatus=Object.fromEntries(Object.entries(sourceIds).map(([k,seriesId])=>[k,k==='vix'?{seriesId,status:'available',count:2,firstDate:'2026-11-12',lastDate:'2026-11-13'}:{seriesId,status:'unavailable',reason:'fetch_or_parse_failed'}]));
  const cache={schemaVersion:'pressure-source-cache-v1',vintage:'latest_revised_not_point_in_time',retrievedAt:finish,series,sourceStatus};
  const previous={implementationHash:F.implementation,protocolHash:digest(protocol),records:[{date:'2026-11-15',recordHash:'prior'}]};
  const ledger={...previous,records:[...structuredClone(previous.records),{date:'2026-11-16',sourceRetrievedAt:finish,recordedAt:finish,recordHash:'new',scoreInputs:{evidence:{vix:{observationDate:'2026-11-13',value:21}}}}]};
  const report={implementationHash:F.implementation,protocolHash:digest(protocol),sourceRetrievedAt:finish,generatedAt:finish,sourceStatus};
  return {protocol,previous,ledger,cache,report,startedAt:start,finishedAt:finish,identity:{runId:'123',attempt:'1'},targetImplementation:target};
}
test('shared evidence binds same cycle, old prefix, exact sources, observed inputs and distinct target',()=>{
  assert.equal(validateSharedCycle(fixture()).evaluationDate,'2026-11-16');
  for(const mutate of [x=>x.cache.retrievedAt=start.replace('10:00','09:59'),x=>x.finishedAt='2026-11-17T00:00:00Z',
    x=>x.ledger.records.pop(),x=>x.ledger.records[0].recordHash='changed',x=>x.report.sourceRetrievedAt=start,
    x=>x.targetImplementation=F.implementation,x=>x.cache.series.extra=[],x=>x.cache.sourceStatus.vix.status='unavailable',
    x=>x.cache.series.vix[1].value=22,x=>x.ledger.records[1].recordedAt='bad',x=>x.report.generatedAt='bad',
    x=>x.identity.attempt='x',x=>x.cache.sourceStatus.vix.count=9]) {
    const value=fixture();mutate(value);assert.throws(()=>validateSharedCycle(value),/shared_retrieval_hold/,String(mutate));
  }
});

// Execute actual supervisor source in a VM with OS execution replaced, never
// production dependency injection. No collector or child process runs in tests.
function harness(mode='ok', realFixture=null) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pressure-shared-')),old=path.join(root,'old'),current=realFixture ? process.cwd() : path.join(root,'new');
  fs.mkdirSync(path.join(old,'config'),{recursive:true});fs.mkdirSync(path.join(old,relative),{recursive:true});if(!realFixture)fs.mkdirSync(current);
  const data=realFixture?.data ?? fixture(),runId=realFixture?.runId ?? '123',previous=path.join(old,relative,'previous.json');
  fs.writeFileSync(path.join(old,'config/pressure-model-research.json'),JSON.stringify(data.protocol));fs.writeFileSync(previous,JSON.stringify(data.previous));
  const configBytes=fs.readFileSync(path.join(old,'config/pressure-model-research.json'));
  const configBlob=createHash('sha1').update(`blob ${configBytes.length}\0`).update(configBytes).digest('hex');
  if(mode==='hidden-dirty')fs.writeFileSync(path.join(old,'config/pressure-model-research.json'),JSON.stringify({...data.protocol,modified:true}));
  let clock=data.startedAt, acquisitions=0, validations=0;
  class Clock extends Date { constructor(...args){super(...(args.length?args:[clock]));} }
  const execute=async(command,args)=>{
    if(command==='git') return {stdout:args[0]==='rev-parse'?(mode==='wrong-commit'?'other':F.commit):args[0]==='status'?(mode==='dirty'?' M file':''):args[0]==='ls-tree'?`100644 blob ${configBlob}\tconfig/pressure-model-research.json\0`:''};
    if(args.includes('--print-cohort')) return {stdout:mode==='wrong-cohort'?'wrong':F.cohort};
    if(args.includes('--input-type=module')) return {stdout:mode==='wrong-implementation'?'wrong':F.implementation};
    acquisitions++;clock=data.finishedAt;
    const output=args[args.indexOf('--output')+1],cache=args[args.indexOf('--cache')+1];
    if(mode==='old-fails') {fs.writeFileSync(output,'partial');throw new Error('old failed');}
    if(mode==='no-append') data.ledger=data.previous;
    if(mode==='changed-prefix') data.ledger.records[0].recordHash='altered';
    if(mode==='old-cache') data.cache.retrievedAt='2026-11-15T10:00:00Z';
    if(mode!=='no-cache') fs.writeFileSync(cache,JSON.stringify(data.cache));
    fs.writeFileSync(output,JSON.stringify(data.report));fs.writeFileSync(path.join(path.dirname(output),'shadow-ledger.json'),JSON.stringify(data.ledger));
    return {stdout:'ok'};
  };
  const processMock={env:{GITHUB_ACTIONS:'true',GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:'1',PATH:'/safe'},cwd:()=>current,execPath:'/node'};
  const source=fs.readFileSync(new URL('../../scripts/daily/pressure-shared-retrieval.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const api=vm.runInNewContext(source+'\n({prepareSharedPressureCycle,consumeSharedPressureRetrieval})',{
    fs,path,createHash,execFile:()=>assert.fail('real exec forbidden'),promisify:()=>execute,digest,isHistoricalDate,
    validateShadowLedger:(...args)=>{validations++;if(realFixture)validateShadowLedger(...args);},process:processMock,Date:Clock,structuredClone
  });
  return {api,root,current,old,data,previous,processMock,Clock,runId,get acquisitions(){return acquisitions;},get validations(){return validations;},
    prepare:()=>api.prepareSharedPressureCycle({legacyRoot:old,previousLedger:previous,targetImplementation:realFixture?.implementation ?? target,legacyUntil:'2026-12-10'}),
    consume:receipt=>api.consumeSharedPressureRetrieval(receipt,{protocol:data.protocol,implementation:target,now:finish,output:path.join(current,relative,'corrected-123-1/report.json')}),
    close:()=>{fs.rmSync(root,{recursive:true,force:true});if(realFixture){
      for(const directory of [path.join(current,relative,'legacy-preserved',`shared-${runId}-1`),path.join(current,relative,`corrected-${runId}-1`)]) fs.rmSync(directory,{recursive:true,force:true});
    }}};
}
test('one old acquisition yields one immutable memory receipt and independently preserved old files',async()=>{
  const h=harness();try {
    const result=await h.prepare();assert.equal(h.acquisitions,1);assert.equal(h.validations,2);
    const before=fs.readFileSync(path.join(result.archive,'shadow-ledger.json'),'utf8');
    const raw=path.join(h.old,relative,'shared-123-1/source-cache.json');
    assert.equal(result.provenance.cacheSha256,createHash('sha256').update(fs.readFileSync(raw)).digest('hex'));
    fs.writeFileSync(raw,'tampered after receipt');result.provenance.targetImplementation='forged';
    const shared=h.consume(result.receipt);assert.equal(shared.cache.series.vix[1].value,21);
    assert.equal(shared.provenance.targetImplementation,target);
    assert.throws(()=>h.consume(result.receipt),/invalid_or_consumed/);
    // A subsequent corrected-model failure cannot delete/overwrite old archive.
    assert.throws(()=>{throw new Error('corrected failed');},/corrected failed/);
    assert.equal(fs.readFileSync(path.join(result.archive,'shadow-ledger.json'),'utf8'),before);
  } finally {h.close();}
});
test('legacy failure, partial outputs, stale cache, modified prefix and wrong checkout cannot authorize new track',async()=>{
  for(const mode of ['wrong-commit','dirty','hidden-dirty','wrong-cohort','wrong-implementation','old-fails','no-cache','no-append','changed-prefix','old-cache']) {
    const h=harness(mode);try {await assert.rejects(h.prepare());assert.equal(fs.existsSync(path.join(h.current,relative,'legacy-preserved')),false);} finally {h.close();}
  }
});
test('receipt binding and directory isolation fail closed, even on retry',async()=>{
  for(const mode of ['run','output','midnight']) {
    const h=harness();try {const {receipt}=await h.prepare();
      if(mode==='run')h.processMock.env.GITHUB_RUN_ID='124';
      if(mode==='output')fs.mkdirSync(path.join(h.current,relative,'corrected-123-1'),{recursive:true});
      if(mode==='midnight')assert.throws(()=>h.api.consumeSharedPressureRetrieval(receipt,{protocol:h.data.protocol,implementation:target,now:'2026-11-17T00:00:00Z'}),/receipt_binding/);
      else assert.throws(()=>h.consume(receipt),/shared_retrieval_hold/);
      assert.throws(()=>h.consume(receipt),/invalid_or_consumed/);
    } finally {h.close();}
  }
});
test('public CLI cannot forge cache recording or enable network with a shared token',async()=>{
  assert.throws(()=>parseResearchArgs(['--record-shadow']),/requires a new live retrieval/);
  assert.throws(()=>parseResearchArgs(['--record-shadow','--allow-network'],true),/forbids network/);
  assert.throws(()=>consumeSharedPressureRetrieval({},{}),/invalid_or_consumed/);
  let calls=0;const original=globalThis.fetch;globalThis.fetch=()=>{calls++;throw new Error('network forbidden');};
  try {await assert.rejects(main(['--record-shadow'],{sharedRetrieval:{}}),/invalid_or_consumed/);assert.equal(calls,0);} finally {globalThis.fetch=original;}
  const baseline=implementationHash(file=>file,'fixed');
  assert.notEqual(implementationHash(file=>file+(file.endsWith('pressure-shared-retrieval.mjs')?' altered':''),'fixed'),baseline);
});

function validFixture() {
  const protocol=JSON.parse(fs.readFileSync('config/pressure-model-research.json','utf8'));
  const rules=JSON.parse(fs.readFileSync('config/rules.json','utf8'));
  const data=fixture(),end=Date.parse('2026-11-16T00:00:00Z'),day=86400000;
  const ids={...Object.fromEntries(Object.entries(protocol.sources).map(([k,p])=>[k,p.seriesId])),...protocol.benchmarks,
    hyOas:'BAMLH0A0HYM2',igOas:'BAMLC0A0CM',real10y:'DFII10',walcl:'WALCL',onRrp:'RRPONTSYD',t10y2y:'T10Y2Y'};
  const series=Object.fromEntries(Object.keys(ids).map(k=>[k,[]]));
  for(let i=1500;i>=0;i--){
    const date=new Date(end-i*day).toISOString().slice(0,10),wave=Math.sin(i/70);
    const values={baa10y:2+wave,vix:20+5*wave,spx:5000-i,dxy:110-i/100,brent:80-i/100,us10y:4-i/1000,
      breakeven10y:2.5,hyOas:3,igOas:1,real10y:1.5,walcl:6000000,onRrp:50,t10y2y:.2,stlfsi:wave,nfci:wave};
    for(const k of Object.keys(series))if(!['stlfsi','nfci'].includes(k)||new Date(date).getUTCDay()===5)series[k].push({date,value:values[k]});
  }
  const sourceStatus=Object.fromEntries(Object.entries(ids).map(([k,seriesId])=>[k,{seriesId,status:'available',count:series[k].length,firstDate:series[k][0].date,lastDate:series[k].at(-1).date}]));
  const cache={schemaVersion:'pressure-source-cache-v1',vintage:'latest_revised_not_point_in_time',retrievedAt:finish,series,sourceStatus};
  const record=(date,at)=>{
    const result=evaluateResearch(cache,protocol,date,rules),current=result.current;
    const scoreInputs={evidence:current.evidence,features:current.features,references:current.references,
      parameters:Object.fromEntries(current.candidates.map(r=>[r.variant,Number.isFinite(r.score)?{calibration:r.calibration,weights:r.weights}:null]))};
    const selected=current.candidates.find(r=>r.variant==='diversified_156');
    return {date,recordedAt:at,sourceRetrievedAt:at,protocolHash:digest(protocol),implementationHash:F.implementation,
      scoreInputs,inputHash:digest(scoreInputs),variant:selected.variant,score:selected.score,
      variantScores:Object.fromEntries(current.candidates.map(r=>[r.variant,r.score])),
      variantStatus:Object.fromEntries(current.candidates.map(r=>[r.variant,{status:r.status,trainingWeeks:r.trainingWeeks??null,reasons:r.reasons||[]}]))};
  };
  const previous=appendShadowLedger(null,record('2026-11-15','2026-11-15T10:01:00Z'),protocol,'2026-11-15T10:01:00Z');
  const ledger=appendShadowLedger(previous,record('2026-11-16',finish),protocol,finish);
  return {...data,protocol,previous,ledger,cache,report:{...data.report,protocolHash:digest(protocol),sourceStatus}};
}

test('full valid ledger and receipt drive actual corrected main offline; real new-track failure preserves old ledger',async()=>{
  const data=validFixture();
  for(const failNew of [false,true]){
    const runId=`${Date.now()}${failNew?2:1}`,h=harness('ok',{data,runId,implementation:implementationHash()});
    let extraFile=null,calls=0;
    try{
      const result=await h.prepare();assert.equal(h.validations,2);assert.equal(h.acquisitions,1);
      const oldBytes=fs.readFileSync(path.join(result.archive,'shadow-ledger.json'));
      let source=fs.readFileSync('scripts/research-pressure-model.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
      source=source.slice(0,source.indexOf('\nif(process.argv[1]'));
      const actualMain=vm.runInNewContext(source+'\nmain',{
        fs,path,process:h.processMock,Date:h.Clock,console:{log:()=>{}},
        pressureFeatures,scorePressure,validateResearchProtocol,digest,quantile,mean,agreementMetrics,bootstrapAgreement,
        appendShadowLedger,shadowReadiness,validateShadowLedger,parseFredCsv,deriveHistoricalRisk,describeRiskImplementation,
        isHistoricalDate,pressureRemediationDiagnostics,consumeSharedPressureRetrieval:h.api.consumeSharedPressureRetrieval,
        fetch:()=>{calls++;throw new Error('corrected network forbidden');}
      });
      const output=path.join(h.current,relative,`corrected-${runId}-1/report.json`),args=['--record-shadow','--output',output];
      if(failNew){
        extraFile=path.join(h.current,relative,`test-wrong-prior-${runId}.json`);fs.writeFileSync(extraFile,oldBytes,{flag:'wx'});
        args.push('--previous-ledger',extraFile);
        await assert.rejects(actualMain(args,{sharedRetrieval:result.receipt}),/mismatch/);
        assert.equal(fs.existsSync(output),false);
      }else{
        await actualMain(args,{sharedRetrieval:result.receipt});
        const ledger=JSON.parse(fs.readFileSync(path.join(path.dirname(output),'shadow-ledger.json')));
        validateShadowLedger(ledger,data.protocol,implementationHash(),finish);
        assert.equal(ledger.records.length,1);assert.notEqual(ledger.implementationHash,F.implementation);
        assert.equal(ledger.records[0].sourceRetrievedAt,finish);
        const report=JSON.parse(fs.readFileSync(output));assert.equal(report.sharedRetrieval.runId,runId);
        assert.equal(report.sharedRetrieval.cacheSha256,result.provenance.cacheSha256);
      }
      assert.equal(calls,0);assert.deepEqual(fs.readFileSync(path.join(result.archive,'shadow-ledger.json')),oldBytes);
    }finally{if(extraFile)fs.unlinkSync(extraFile);h.close();}
  }
});
