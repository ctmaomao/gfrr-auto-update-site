import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWeeklyAdmission } from '../../scripts/check-weekly-admission.mjs';
import { installOriginal, recoverRemoteOriginal, saveOriginal, writeExpectedIssue, writeHandoffReceipt } from '../../scripts/weekly-original.mjs';
const date = '2026-11-23';
const bytes = Buffer.from('<!doctype html><html><head><title>2026年11月23日</title></head><body><main><section>已验收</section></main></body></html>');
const sha = createHash('sha256').update(bytes).digest('hex');
const commit = 'a'.repeat(40);
const remote = () => ([{ date, sha256: sha, commit, bytes }]);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'weekly-admission-'));
  mkdirSync(join(root,'reports'));
  return root;
}
test('publication admission requires expected date, digest and a matching remote readback', () => {
  const root = fixture();
  const input = join(root,'input.html'); writeFileSync(input,bytes);
  saveOriginal({root,source:input,date,sha}); installOriginal({root,date,sha});
  assert.throws(() => checkWeeklyAdmission({cwd:root,readRemote:remote}), /Missing explicitly/);
  writeHandoffReceipt({root,date,sha,commit});
  writeExpectedIssue({root,date,sha,commit});
  assert.equal(checkWeeklyAdmission({cwd:root,readRemote:remote}).status,'remote_originals_verified');
  assert.throws(() => checkWeeklyAdmission({cwd:root,readRemote:()=>[{...remote()[0],commit:'b'.repeat(40)}]}),/differs/);
  assert.throws(() => checkWeeklyAdmission({cwd:root,readRemote:()=>{throw Error('remote missing');}}),/remote missing/);
  assert.throws(() => writeExpectedIssue({root,date,sha:'0'.repeat(64),commit}),/conflicting/);
  writeFileSync(join(root,'weekly-originals/expected.json'), JSON.stringify({date:'2026-11-30',sha256:sha,handoffCommit:commit}));
  assert.throws(() => checkWeeklyAdmission({cwd:root,readRemote:remote}),/latest/);
});
test('new checkout recovers remote original before installation and missing remote writes nothing', () => {
  const root = fixture();
  assert.throws(() => recoverRemoteOriginal({root,date,sha,readRemote:()=>{throw Error('missing');}}),/missing/);
  assert.equal(existsSync(join(root,'weekly-originals',date)),false);
  assert.equal(recoverRemoteOriginal({root,date,sha,readRemote:()=>remote()[0]}),commit);
  assert.deepEqual(readFileSync(join(root,'weekly-originals',date,sha+'.html')),bytes);
});
test('actual check and prepare command entry points terminate without cyclic module deadlock', () => {
  for (const action of ['check','prepare']) {
    const child = spawnSync(process.execPath,['scripts/weekly-original.mjs',action,date,'invalid'],{encoding:'utf8',timeout:5000});
    assert.equal(child.status,1,child.stderr);
    assert.doesNotMatch(child.stderr,/unsettled top-level await/i);
    assert.match(child.stderr,/SHA-256/);
  }
});

test('an older added issue cannot hide behind the legacy or latest issue', () => {
  const root = fixture();
  writeFileSync(join(root,'reports/2026-11-09.html'),'legacy');
  writeFileSync(join(root,'reports/2026-11-02.html'),'unverified');
  assert.throws(() => checkWeeklyAdmission({cwd:root,readRemote:()=>assert.fail('remote should not run')}),/expected|receipt/);
});

test('all dated issues require separate receipts and remote verification', () => {
  const root = fixture();
  const input = join(root,'input.html'); writeFileSync(input,bytes);
  saveOriginal({root,source:input,date,sha}); installOriginal({root,date,sha});
  writeHandoffReceipt({root,date,sha,commit}); writeExpectedIssue({root,date,sha,commit});
  const older = '2026-11-16';
  const oldBytes = Buffer.from(bytes.toString().replace('2026年11月23日','2026年11月16日'));
  const oldSha = createHash('sha256').update(oldBytes).digest('hex');
  mkdirSync(join(root,'weekly-originals',older),{recursive:true});
  writeFileSync(join(root,'reports',older+'.html'),oldBytes);
  writeFileSync(join(root,'weekly-originals',older,'identity.sha256'),oldSha+'\n');
  writeFileSync(join(root,'weekly-originals',older,oldSha+'.html'),oldBytes);
  assert.throws(()=>checkWeeklyAdmission({cwd:root,readRemote:remote}),/receipt/);
  writeHandoffReceipt({root,date:older,sha:oldSha,commit});
  assert.throws(()=>checkWeeklyAdmission({cwd:root,readRemote:remote}),/Incomplete remote/);
  const both = () => [{date,sha256:sha,commit,bytes},{date:older,sha256:oldSha,commit,bytes:oldBytes}];
  assert.equal(checkWeeklyAdmission({cwd:root,readRemote:both}).issues,2);
});
test('explicitly expected issue missing from reports cannot pass as the legacy issue', () => {
  const root = fixture();
  writeFileSync(join(root,'reports/2026-11-09.html'),'legacy');
  mkdirSync(join(root,'weekly-originals'));
  writeFileSync(join(root,'weekly-originals/expected.json'), JSON.stringify({date,sha256:sha,handoffCommit:commit}));
  assert.throws(()=>checkWeeklyAdmission({cwd:root,readRemote:()=>assert.fail('remote not needed')}),/latest/);
});
