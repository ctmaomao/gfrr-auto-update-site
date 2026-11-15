import test from 'node:test';
import assert from 'node:assert/strict';
import { brentObservationAudit, brentComparability, finiteAuditNumber, inputIdentity } from '../../scripts/audit/brent-observation.mjs';
import { compareField, summarizePayload, buildDrift } from '../../scripts/audit-daily-vs-worker.mjs';
const now = '2026-11-14T12:00:00Z';
const payload = () => ({ updatedAt: now, values: { brent: 90 }, sourceDetails: { brent: { source: 'fred:DCOILBRENTEU', timestamp: '2026-11-10' } }, brentValidation: { promotion: { applied: false, reason: 'fred-anchor-fresh-enough' }, candidates: [] } });
const selected = p => brentObservationAudit(p, now).selected;

test('audit missing values stay null, real zero and numeric strings remain numbers', () => {
  for (const v of [null, undefined, '', ' ', false, true, [], {}, Infinity, 'NaN']) assert.equal(finiteAuditNumber(v), null);
  assert.equal(finiteAuditNumber('0'), 0); assert.equal(finiteAuditNumber(0), 0);
  assert.deepEqual(compareField('brent', null, 90), {daily:null,worker:90,absDiff:null,pctDiff:null,material:false});
  assert.equal(compareField('brent', 0, 90).absDiff, 90);
  assert.equal(compareField('brent', 0, 90).pctDiff, null);
});
test('observation date retains day precision, never payload clock or fetched clock', () => {
  const p=payload(), a=selected(p);
  assert.equal(a.observedAt,'2026-11-10'); assert.equal(a.timeType,'observation-date');
  assert.equal(a.ageMinutes,null); assert.equal(a.ageDays,4); assert.equal(a.fetchedAt,null);
  p.sourceDetails.brent.timestamp=null; assert.equal(selected(p).observedAt,null);
});
test('realtime promotion retains raw candidate day rather than synthetic selected timestamp', () => {
  const p=payload(); p.sourceDetails.brent={source:'stooq:public-consensus-promoted',timestamp:now};
  p.brentValidation={promotion:{applied:true,selectedObservedAt:now,selectedCandidateObservedAt:'2026-11-13'},candidates:[{source:'stooq',value:90,observedAt:'2026-11-13',fetchedAt:now}]};
  const a=selected(p); assert.equal(a.observedAt,'2026-11-13'); assert.equal(a.ageDays,1); assert.equal(a.fetchedAt,now);
  p.brentValidation.candidates=[]; p.brentValidation.promotion.selectedCandidateObservedAt=null;
  assert.equal(selected(p).observedAt,null);
});
test('Worker derived average and held prior input do not inherit a single quote time', () => {
  const p=payload(); p.sourceDetails.brent={source:'yahoo:BZ=F+tradingeconomics:brent-crude-oil-average promoted over stale FRED anchor',timestamp:now};
  p.brentValidation={promotion:{applied:true},candidates:[{source:'yahoo:BZ=F',value:89,timestamp:now}]};
  assert.equal(selected(p).instrument,'derived-two-source-average'); assert.equal(selected(p).observedAt,null);
  assert.equal(brentObservationAudit(p,now).candidates[0].observedAt,now);
  p.sourceDetails.brent={source:'fred:DCOILBRENTEU held after unconfirmed Brent jump',timestamp:now,promotionHeld:true};
  p.brentValidation.promotion={applied:false,moveStatus:'unconfirmed-jump-hold'};
  assert.equal(selected(p).observedAt,null);
});
test('ICE contract, observation timestamp and independently computed age survive allowlist', () => {
  const p=payload();p.sourceDetails.brent={source:'ice:public-consensus-promoted'};
  p.brentValidation={promotion:{applied:true},candidates:[{source:'ice',value:90,contract:'Jan27',observedAt:'2026-11-14T11:00:00Z',fetchedAt:'2026-11-14T11:30:00Z',ageMinutes:0,url:'secret',raw:'secret'}]};
  const a=selected(p);assert.equal(a.contract,'Jan27');assert.equal(a.ageMinutes,60);
  assert.equal(a.fetchedAt,'2026-11-14T11:30:00Z');assert.equal(JSON.stringify(a).includes('secret'),false);
});
test('invalid, future and absent timestamps never report valid freshness', () => {
  const p=payload();
  for(const v of ['2026-02-30','today','2026-11-14T99:00:00Z','secret']){p.sourceDetails.brent.timestamp=v;assert.equal(selected(p).timeType,'unknown');}
  p.sourceDetails.brent.timestamp='2026-11-15';assert.equal(selected(p).timeStatus,'future');assert.equal(selected(p).ageDays,null);
});
test('comparable, different basis and unknown are distinct from arithmetic threshold', () => {
  const a=selected(payload());assert.equal(brentComparability(a,a).status,'comparable');
  assert.equal(brentComparability(a,{...a,instrument:'ice-brent-futures'}).status,'different-basis');
  assert.equal(brentComparability(a,{...a,observedAt:'2026-11-09'}).status,'different-basis');
  assert.equal(brentComparability(a,{...a,value:null}).status,'unknown');
  const f={...a,instrument:'ice-brent-futures',contract:null};assert.equal(brentComparability(f,f).status,'unknown');
  assert.equal(brentComparability({...f,contract:'Jan27'},{...f,contract:'Feb27'}).status,'different-basis');
  const p=payload(), q=payload();q.values.brent=99;q.sourceDetails.brent.source='unknown';
  const d=buildDrift(summarizePayload(p,now),summarizePayload(q,now));
  assert.equal(d.fields.brent.absDiff,9);assert.equal(d.fields.brent.material,true);assert.equal(d.brentComparison.status,'unknown');
});
test('whitelist omits raw errors, URLs, unknown source/contract and arbitrary reasons; identity is bounded', () => {
  const p=payload();p.sourceDetails.brent.source='https://secret.invalid/?token=x';p.brentValidation.promotion.reason='secret';
  p.brentValidation.candidates=[{source:'secret',contract:'secret',reason:'secret',fetchedAt:'secret',observedAt:'secret',value:false}];
  const before=JSON.stringify(p), a=brentObservationAudit(p,now);assert.equal(JSON.stringify(a).includes('secret'),false);assert.equal(a.promotionReason,'unknown');assert.equal(JSON.stringify(p),before);
  assert.equal(inputIdentity(p,'token').commit,null);assert.equal(inputIdentity(p,'a'.repeat(40)).commit,'a'.repeat(40));
  assert.match(inputIdentity(p).payloadSha256,/^[a-f0-9]{64}$/u);
});

test('actual CLI writes allowlisted metadata to Summary and unavailable Worker never creates zero', async t => {
  const fs = await import('node:fs'); const os=await import('node:os'); const path=await import('node:path'); const {spawnSync}=await import('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-brent-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'realtime'));const p=payload();fs.writeFileSync(path.join(dir,'realtime/market.json'),JSON.stringify(p));
  const summaryPath=path.join(dir,'summary.md');const entry=new URL('../../scripts/audit-daily-vs-worker.mjs',import.meta.url).href;
  for(const available of [true,false]) {
    const code=`process.argv.push('--github-summary');globalThis.fetch=async()=>({ok:${available},status:${available?200:403},text:async()=>${JSON.stringify(JSON.stringify(p))}});const {main}=await import(${JSON.stringify(entry)});await main();`;
    const run=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:dir,encoding:'utf8',env:{...process.env,GITHUB_STEP_SUMMARY:summaryPath,GFRR_REALTIME_COMMIT_SHA:'a'.repeat(40)}});
    assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout);
    assert.equal(out.dailyInput.inputIdentity.commit,'a'.repeat(40));assert.equal(out.worker.available,available);
    assert.equal(out.drift.fields.brent.absDiff,available?0:null);assert.equal(out.drift.brentComparison.status,available?'comparable':'unknown');
  }
  const summary=fs.readFileSync(summaryPath,'utf8');assert.match(summary,/Brent observation metadata/u);assert.match(summary,/not quote age/u);
  fs.writeFileSync(path.join(dir,'realtime/market.json'),'private-input-secret invalid json');
  const bad=spawnSync(process.execPath,['--input-type=module','-e',`const {main}=await import(${JSON.stringify(entry)});await main();`],{cwd:dir,encoding:'utf8'});
  assert.equal(bad.status,1);assert.match(bad.stderr,/realtime-input-read-or-json-failed/u);assert.equal(bad.stderr.includes('private-input-secret'),false);
});

test('cached fallback provenance and acquisition/unknown clocks do not become FRED observations', () => {
  const p=payload();
  for(const timestampKind of ['snapshot_acquisition','provider_acquisition','unknown','reported_candidate_time']) {
    p.sourceDetails.brent={source:'fred:DCOILBRENTEU',timestamp:now,timestampKind,ok:false,fallbackUsed:true};
    const a=selected(p);assert.equal(a.source,'unknown');assert.equal(a.observedAt,null);assert.equal(a.value,90);
    p.sourceDetails.brent.ok=true;assert.equal(selected(p).observedAt,null);
  }
  p.sourceDetails.brent={source:'fred:DCOILBRENTEU',timestamp:'2026-11-10',timestampKind:'observation_date',ok:true,fallbackUsed:true};
  assert.equal(selected(p).observedAt,'2026-11-10'); // Successful alternate is not a cached fallback.
  p.brentValidation.candidates=[{source:'ice',excludedFromConsensus:'observedAt-stale(123m)',participatesInConsensus:false}];
  const c=brentObservationAudit(p,now).candidates[0];assert.equal(c.exclusionReason,'observedAt-stale');assert.equal(c.participatesInConsensus,false);
});
