// Manual-only regressions: real Chromium -> localhost, plus temporary ledgers/fake platform transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createNodeSqliteAdapter } from '../../workers/gfrr-csp-report-receiver/src/storage-adapter.js';
import { applySchema } from '../../workers/gfrr-csp-report-receiver/src/storage.js';
import { createCspReceiverObject } from '../../workers/gfrr-csp-report-receiver/src/receiver-object.js';
import { handleReceiverRequest } from '../../workers/gfrr-csp-report-receiver/src/index.js';
import { nativeDirect, validateNativeRequest } from './native-direct.mjs';
import { nativePlan, runNativeSequence, validateInspection } from './controlled-native-platform.mjs';
import { ORIGIN, TARGET } from './controlled-platform.mjs';

const base = Date.parse('2026-10-09T12:00:00.000Z');
const inspection = (at = base + 1000) => ({ status: 'healthy', alerts: [], ingestBudget: 2500, ingestUsed: 0,
  expectedWatermark: '2026-09-26', observations: { contract: 'csp-retention-inspection-v1', observedAt: at, alarmAt: at + 86400000,
    last_cleaned_bucket: '2026-10-09', cleanup_completed_at: String(base - 1000), cleanup_started_at: '', cleanup_attempts: '0', retention_days: '14' } });
function nativeRequest(doc = 'index', target = TARGET + '/csp-report') {
  return { url: target, method: 'POST', contentType: 'application/csp-report', body: JSON.stringify({ 'csp-report': {
    'document-uri': ORIGIN + '/' + doc + '.html?synthetic=fiction-only', 'effective-directive': 'script-src-elem',
    'violated-directive': 'script-src-elem', 'original-policy': "default-src 'none'; script-src 'none'; report-uri " + target,
    'blocked-uri': 'inline', disposition: 'report', 'status-code': 200, referrer: '', 'script-sample': '',
  } }) };
}
test('native bytes are limited to exact fictional documents and known metadata', () => {
  assert.equal(validateNativeRequest(nativeRequest()), 'index');
  for (const change of [r => { r.url += '?other'; }, r => { r.method = 'GET'; }, r => { r.contentType = 'application/json'; },
    r => { r.body = '{}'; }, r => { r.body = r.body.replace('fiction-only', 'private'); },
    r => { const p = JSON.parse(r.body); p['csp-report'].referrer = 'https://private.test/'; r.body = JSON.stringify(p); },
    r => { const p = JSON.parse(r.body); p['csp-report']['script-sample'] = 'secret'; r.body = JSON.stringify(p); },
    r => { const p = JSON.parse(r.body); p['csp-report']['source-file'] = ORIGIN + '/index.html?private=secret'; r.body = JSON.stringify(p); },
    r => { const p = JSON.parse(r.body); p['csp-report'].unexpected = 'field'; r.body = JSON.stringify(p); }]) {
    const request = nativeRequest(); change(request); assert.throws(() => validateNativeRequest(request));
  }
});
test('raw inspection preserves missing alarm, read failure and default health contract without writes', async () => {
  const db = new DatabaseSync(':memory:'); const adapter = createNodeSqliteAdapter(db); applySchema(adapter);
  const ctx = { storage: { getAlarm: async () => null, setAlarm: async () => { throw Error('inspection cannot schedule'); } } };
  const ObjectClass = createCspReceiverObject(class {}); const object = new ObjectClass(ctx, {}); object.adapter = adapter;
  adapter.run("INSERT INTO meta(k,v) VALUES('last_cleaned_bucket','2026-10-09')");
  const before = JSON.stringify(adapter.all('SELECT k,v FROM meta ORDER BY k'));
  const ordinary = await object.health({ now: base }); assert.equal(ordinary.observations, undefined);
  const raw = await object.health({ now: base, inspect: true }); assert.equal(raw.observations.alarmAt, null);
  assert.equal(raw.observations.cleanup_completed_at, null); assert.equal(raw.observations.last_cleaned_bucket, '2026-10-09');
  assert.ok(raw.alerts.includes('schedule-missing')); assert.throws(() => validateInspection(raw, base));
  assert.equal(JSON.stringify(adapter.all('SELECT k,v FROM meta ORDER BY k')), before);
  object.adapter = { ...adapter, all: () => { throw Error('read failure'); } };
  const failed = await object.health({ now: base, inspect: true }); assert.equal(failed.status, 'unknown'); assert.equal(failed.observations, undefined);
  assert.deepEqual(failed.alerts, ['cannot-confirm']); db.close();
});
test('inspection uses the existing trial gate, no CORS and no stub access while closed', async () => {
  let calls = 0; const env = { CSP_TRIAL_ENABLED: 'false', CSP_RECEIVER: { idFromName() { calls++; throw Error('closed'); } } };
  const closed = await handleReceiverRequest(new Request(TARGET + '/health?inspect=retention-v1'), env, { now: () => base });
  assert.equal(closed.status, 503); assert.equal(calls, 0); assert.equal(closed.headers.get('access-control-allow-origin'), null);
  env.CSP_TRIAL_ENABLED = 'true'; env.CSP_TRIAL_START_AT = new Date(base).toISOString(); env.CSP_TRIAL_END_AT = new Date(base + 10000).toISOString();
  env.CSP_RECEIVER = { idFromName: () => 'singleton', get: () => ({ health: async args => { assert.deepEqual(args, { now: base, inspect: true }); return inspection(base); } }) };
  const open = await handleReceiverRequest(new Request(TARGET + '/health?inspect=retention-v1'), env, { now: () => base });
  assert.equal(open.status, 200); assert.equal(open.headers.get('access-control-allow-origin'), null);
});
test('raw observation validation rejects missing/past alarm, absent completion, delay and nonhealthy state', () => {
  validateInspection(inspection(), base + 1000);
  for (const mutate of [r => { r.observations.alarmAt = null; }, r => { r.observations.alarmAt = base; },
    r => { r.observations.cleanup_completed_at = null; }, r => { r.observations.observedAt = base - 20000; },
    r => { r.observations.cleanup_started_at = '123'; }, r => { r.observations.cleanup_attempts = '1'; },
    r => { r.observations.retention_days = '1'; }, r => { r.observations.last_cleaned_bucket = '2026-99-99'; },
    r => { r.expectedWatermark = '2026-10-01'; }, r => { r.status = 'unknown'; }]) {
    const raw = inspection(); mutate(raw); assert.throws(() => validateInspection(raw, base + 1000));
  }
});

test('inspection exposes the actual getAlarm value without computing or repairing its schedule',async()=>{
  const db=new DatabaseSync(':memory:');const adapter=createNodeSqliteAdapter(db);applySchema(adapter);
  const actual=base+1234567;let writes=0;
  const ObjectClass=createCspReceiverObject(class {});const object=new ObjectClass({storage:{getAlarm:async()=>actual,setAlarm:async()=>{writes++;}}},{});object.adapter=adapter;
  const result=await object.health({now:base,inspect:true});assert.equal(result.observations.alarmAt,actual);assert.equal(writes,0);db.close();
});

function fixture() {
  let clock = base, calls = 0, used = 0;
  const dir = mkdtempSync(join(tmpdir(), 'csp-native-'));
  const previousResult = { outcome: 'controlled-sequence-pass', reserved: 8, attempts: [
    ['closed-health',503], ['open-health-before',200], ['native-relay-index',200], ['native-relay-bubble-watch',200],
    ['open-health-after',200], ['expired-report',503], ['expired-health',503],
  ].map(([label,status]) => ({label,status,passed:true})) };
  const previous = { result: previousResult, fingerprint: createHash('sha256').update(JSON.stringify(previousResult)).digest('hex') };
  const auth = { ...nativePlan(new Date(base + 1000).toISOString(), new Date(base + 5000).toISOString()), approved: true, previousResultFingerprint: previous.fingerprint };
  const readback = enabled => ({ reviewed: true, target: TARGET, sourceFingerprint: auth.sourceFingerprint,
    version: enabled ? '22222222-2222-2222-2222-222222222222' : '11111111-1111-1111-1111-111111111111',
    percent: 100, plan: 'Free', logs: false, traces: false, issues: false, exportDestinations: [],
    vars: { CORS_ALLOWED_ORIGINS: ORIGIN, CSP_TRIAL_ENABLED: enabled ? 'true' : 'false', CSP_TRIAL_START_AT: enabled ? auth.startAt : '', CSP_TRIAL_END_AT: enabled ? auth.endAt : '' } });
  const statePath=join(dir,'budget.json'),markerPath=join(dir,'once.json'),outDir=join(dir,'output');
  writeFileSync(statePath,JSON.stringify({cumulative:50,limit:500}));
  const options = { auth, previous, closedReadback:readback(false), statePath,markerPath,outDir,
    now:()=>clock,pause:async ms=>{clock+=ms;},waitForOpen:async()=>readback(true),
    fetchImpl:async(url,init)=>{calls++;assert.equal(JSON.parse(readFileSync(statePath)).cumulative,58);
      assert.equal(init.redirect,'manual');const closed=clock<base+1000||clock>=base+5000;
      const body=closed?{ok:false,status:'unknown',error:'trial-closed'}:{...inspection(clock),ingestUsed:used};
      return new Response(JSON.stringify(body),{status:closed?503:200,headers:{'cache-control':'no-store'}});},
    sendNative:async gate=>{for(const doc of ['index','bubble-watch']){const record=gate.beforeSend(doc);calls++;
      assert.equal(JSON.parse(readFileSync(join(outDir,'result.json'))).attempts.length,calls);used+=2;
      gate.afterResponse(record,{status:200,headers:{'cache-control':'no-store'},bodyInspectable:false});}},
  };
  return {options,calls:()=>calls,budget:()=>JSON.parse(readFileSync(statePath)),clock:v=>{clock=v;}};
}
test('independent sequence reserves 50 to 58 before transport, binds inspection and releases only success lock',async()=>{
  const f=fixture();const result=await runNativeSequence(f.options);assert.equal(f.calls(),7);assert.equal(f.budget().cumulative,58);
  assert.equal(result.outcome,'native-direct-sequence-pass');assert.equal(result.nativeDirectVerified,true);
  assert.equal(result.nextAlarmVerified,true);assert.equal(result.deletionVerified,false);assert.equal(existsSync(f.options.statePath+'.lock'),false);
  await assert.rejects(runNativeSequence(f.options));assert.equal(f.calls(),7);
});
test('approval/fingerprint/ancestry/readback/shared lock failures cannot send or consume budget',async()=>{
  for(const mutate of [f=>{f.options.auth.approved=false;},f=>{f.options.auth.runnerFingerprint='wrong';},f=>{f.options.auth.producerFingerprint='wrong';},
    f=>{f.options.auth.harnessFingerprint='wrong';},f=>{f.options.previous.result.attempts[0].passed=false;},f=>{f.options.closedReadback.logs=true;},
    f=>{f.options.auth.maxRequests=9;},f=>{f.options.auth.cumulativeBefore=42;},f=>{writeFileSync(f.options.statePath+'.lock','KEEP');}]){
    const f=fixture();mutate(f);await assert.rejects(runNativeSequence(f.options));assert.equal(f.calls(),0);assert.equal(f.budget().cumulative,50);
  }
});
test('failed native response latches gate, retains reservation/lock, and prevents second send',async()=>{
  const f=fixture();let nativeCalls=0;f.options.sendNative=async gate=>{
    const record=gate.beforeSend('index');nativeCalls++;
    assert.throws(()=>gate.afterResponse(record,{status:500,headers:{'cache-control':'no-store'},bodyInspectable:false}));
    assert.throws(()=>gate.beforeSend('bubble-watch'));
  };await assert.rejects(runNativeSequence(f.options));assert.equal(nativeCalls,1);assert.equal(f.budget().cumulative,58);
  assert.equal(existsSync(f.options.statePath+'.lock'),true);assert.equal(JSON.parse(readFileSync(join(f.options.outDir,'result.json'))).outcome,'stopped');
});
test('duplicate or expired browser report cannot pass the synchronous send gate',async()=>{
  for(const duplicate of [true,false]){const f=fixture();let calls=0;f.options.sendNative=async gate=>{
    gate.beforeSend('index');calls++;if(!duplicate)f.clock(base+5000);assert.throws(()=>gate.beforeSend(duplicate?'index':'bubble-watch'));
    gate.onFailure(Error('blocked duplicate/expired'));};await assert.rejects(runNativeSequence(f.options));assert.equal(calls,1);assert.equal(f.budget().cumulative,58);}
});
test('default/unknown CLI cannot create a live native batch',()=>{
  const script=fileURLToPath(new URL('./controlled-native-platform.mjs',import.meta.url));
  const dry=spawnSync(process.execPath,[script,'--dry-run'],{encoding:'utf8'});assert.equal(dry.status,0);
  const plan=JSON.parse(dry.stdout);assert.equal(plan.approved,false);assert.equal(plan.cumulativeBefore,50);assert.equal(plan.cumulativeAfter,58);
  for(const args of [['--live'],['--target',TARGET],['--live','--authorization','test-results/csp-platform-batch2-authorization.json']]){
    const child=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.notEqual(child.status,0);assert.equal(child.stdout,'');
  }
});

test('real Chromium sends original report bytes directly to localhost; synchronous denial sends zero',async()=>{
  for(const deny of [false,true]){
    let received=0,permitted=0,responses=0,failures=0;
    const collector=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received++;
      validateNativeRequest({url:'http://127.0.0.1:8766/csp-report',method:req.method,contentType:req.headers['content-type'],body},'http://127.0.0.1:8766/csp-report');
      res.writeHead(200,{'cache-control':'no-store','content-type':'application/json'});res.end('{"ok":true}');});
    await new Promise((done,reject)=>{collector.once('error',reject);collector.listen(8766,'127.0.0.1',done);});
    try{const task=nativeDirect({target:'http://127.0.0.1:8766/csp-report',beforeSend(doc){if(deny)throw Error('deny');permitted++;return {doc};},
      afterResponse(record,response){assert.equal(response.status,200);responses++;},onFailure(){failures++;}});
      if(deny)await assert.rejects(task);else await task;
      assert.equal(received,deny?0:2);assert.equal(permitted,deny?0:2);assert.equal(responses,deny?0:2);assert.equal(failures,deny?1:0);
    }finally{await new Promise(done=>collector.close(done));}
  }
});

test('a redirect or HTTP failure stops native delivery before a second document and follows no redirect',async()=>{
  for(const status of [307,500]){
    let reports=0,redirects=0,failures=0;
    const collector=createServer((req,res)=>{req.resume();if(req.url==='/csp-report')reports++;else redirects++;
      res.writeHead(status,{'location':'http://127.0.0.1:8766/redirect-target','cache-control':'no-store'});res.end();});
    await new Promise((done,reject)=>{collector.once('error',reject);collector.listen(8766,'127.0.0.1',done);});
    try{await assert.rejects(nativeDirect({target:'http://127.0.0.1:8766/csp-report',beforeSend:doc=>({doc}),
      afterResponse(record,response){assert.equal(response.status,200);},onFailure(){failures++;}}));
      assert.equal(reports,1);assert.equal(redirects,0);assert.equal(failures,1);
    }finally{await new Promise(done=>collector.close(done));}
  }
});
