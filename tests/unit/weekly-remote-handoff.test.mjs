import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistRemoteHandoff, readRemoteHandoff, readRemoteHandoffs } from '../../scripts/weekly-remote-handoff.mjs';

const issue = '2026-11-23';
const html = Buffer.from('<!doctype html><html><head><title>周报 2026年11月23日</title></head><body><main><section>已验收正文</section></main></body></html>');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gfrr-remote-test-'));
  const seed = join(root, 'seed'), remote = join(root, 'remote.git'), input = join(root, 'issue.html');
  mkdirSync(seed); mkdirSync(join(seed, 'reports'));
  const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:'pipe'}).trim();
  git(seed, 'init', '-b', 'main');
  git(seed, 'config','user.name','Test'); git(seed, 'config','user.email','test@example.invalid');
  writeFileSync(join(seed, 'reports/2026-11-09.html'), '<!doctype html><html><head><title>旧期</title></head><body><main><section>旧期</section></main></body></html>');
  git(seed, 'add','.'); git(seed, 'commit','-m','baseline'); git(root, 'clone','--bare',seed,remote);
  writeFileSync(input, html);
  return { root, remote, input, git };
}
test('remote handoff persists and reads back identical original; retries do not overwrite', () => {
  const {remote,input,git} = fixture();
  const args = {remote,source:input,date:issue,sha:digest(html)};
  const first = persistRemoteHandoff(args);
  assert.deepEqual(first.bytes,html);
  assert.match(first.commit,/^[a-f0-9]{40}$/);
  const again = persistRemoteHandoff(args);
  assert.equal(again.commit,first.commit);
  assert.deepEqual(readRemoteHandoff(args).bytes,html);
  assert.deepEqual(readRemoteHandoffs({remote,issues:[{date:issue,sha:digest(html)}]})[0].bytes,html);
  const changed = Buffer.concat([html,Buffer.from('\n')]);
  writeFileSync(input,changed);
  assert.throws(() => persistRemoteHandoff({...args,sha:digest(changed)}), /failed|differs/i);
  assert.equal(git(remote,'rev-parse',`refs/heads/weekly-originals/${issue}`),first.commit);
  assert.deepEqual(readRemoteHandoff(args).bytes,html);
});
test('missing and mismatched handoffs fail closed', () => {
  const {remote} = fixture();
  assert.throws(() => readRemoteHandoff({remote,date:issue,sha:digest(html)}),/failed/i);
  assert.throws(() => readRemoteHandoff({remote,date:'../invalid',sha:digest(html)}));
});
test('real CLI requires remote handoff and explicit expected identity before admission', () => {
  const {root,remote,input,git} = fixture();
  const project = join(root,'project');
  git(root,'clone',remote,project);
  mkdirSync(join(project,'scripts')); mkdirSync(join(project,'weekly-reports'));
  for (const name of ['weekly-original.mjs','weekly-remote-handoff.mjs','build-weekly-reports.mjs','check-weekly-admission.mjs']) {
    writeFileSync(join(project,'scripts',name),readFileSync(new URL('../../scripts/'+name,import.meta.url)));
  }
  const config = join(root,'gitconfig');
  writeFileSync(config, `[url "file://${remote}"]\n\tinsteadOf = https://github.com/ctmaomao/gfrr-auto-update-site.git\n`);
  const run = (...args) => execFileSync(process.execPath,args,{cwd:project,encoding:'utf8',stdio:'pipe',env:{...process.env,GIT_CONFIG_GLOBAL:config}});
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',issue,digest(html)),/Git operation failed/);
  run('scripts/weekly-original.mjs','save',issue,digest(html),input);
  run('scripts/weekly-original.mjs','install',issue,digest(html));
  assert.throws(()=>run('scripts/check-weekly-admission.mjs'),/Missing explicitly/);
  run('scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input);
  run('scripts/weekly-original.mjs','prepare',issue,digest(html));
  assert.match(run('scripts/weekly-original.mjs','check',issue,digest(html)),/Verified remote handoff commit/);
  assert.match(run('scripts/check-weekly-admission.mjs'),/remote_originals_verified/);
});

test('accepted push with lost response is read back without a second push', () => {
  const {root,remote,input} = fixture();
  const wrapperDir = join(root,'bin'); mkdirSync(wrapperDir);
  const wrapper = join(wrapperDir,'git');
  const realGit = execFileSync('which',['git'],{encoding:'utf8'}).trim();
  const log = join(root,'push-count');
  writeFileSync(wrapper, '#!/bin/sh\ncase " $* " in *" push "*) "$TEST_REAL_GIT" "$@"; result=$?; if [ "$result" -eq 0 ]; then printf x >> "$TEST_PUSH_LOG"; exit 1; fi; exit "$result";; esac\nexec "$TEST_REAL_GIT" "$@"\n');
  chmodSync(wrapper,0o700);
  const moduleUrl = new URL('../../scripts/weekly-remote-handoff.mjs',import.meta.url).href;
  const program = `import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); const r=persistRemoteHandoff({remote,source,date,sha}); console.log(r.commit);`;
  const child = spawnSync(process.execPath,['--input-type=module','-e',program,remote,input,issue,digest(html)],{encoding:'utf8',timeout:20000,env:{...process.env,PATH:wrapperDir+':'+process.env.PATH,TEST_REAL_GIT:realGit,TEST_PUSH_LOG:log}});
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/^[a-f0-9]{40}\s*$/);
  assert.equal(readFileSync(log,'utf8'),'x');
  assert.deepEqual(readRemoteHandoff({remote,date:issue,sha:digest(html)}).bytes,html);
});

test('two competing originals for one date cannot both be accepted', async () => {
  const {root,remote,input} = fixture();
  const alternate = join(root,'alternate.html');
  const other = Buffer.from(html.toString().replace('已验收正文','另一份原件'));
  writeFileSync(alternate,other);
  const moduleUrl = new URL('../../scripts/weekly-remote-handoff.mjs',import.meta.url).href;
  const program = `import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); try { const r=persistRemoteHandoff({remote,source,date,sha}); console.log(r.sha256); } catch { process.exitCode=1; }`;
  const run = (source,sha) => new Promise((resolve,reject) => {
    const child=spawn(process.execPath,['--input-type=module','-e',program,remote,source,issue,sha],{stdio:['ignore','pipe','pipe']});
    let output=''; child.stdout.on('data',chunk=>output+=chunk); child.on('error',reject); child.on('close',status=>resolve({status,output:output.trim()}));
  });
  const results=await Promise.all([run(input,digest(html)),run(alternate,digest(other))]);
  assert.equal(results.filter(result=>result.status===0).length,1);
  const winner=results.find(result=>result.status===0).output;
  assert.ok([digest(html),digest(other)].includes(winner));
  assert.equal(readRemoteHandoff({remote,date:issue,sha:winner}).sha256,winner);
});

test('batch read verifies multiple independently stored weekly originals', () => {
  const {root,remote,input} = fixture();
  const nextDate='2026-11-30';
  const next=Buffer.from(html.toString().replace('2026年11月23日','2026年11月30日'));
  const nextInput=join(root,'next.html'); writeFileSync(nextInput,next);
  const first=persistRemoteHandoff({remote,source:input,date:issue,sha:digest(html)});
  const second=persistRemoteHandoff({remote,source:nextInput,date:nextDate,sha:digest(next)});
  const result=readRemoteHandoffs({remote,issues:[{date:issue,sha:digest(html)},{date:nextDate,sha:digest(next)}]});
  assert.deepEqual(result.map(x=>x.commit),[first.commit,second.commit]);
  assert.deepEqual(result.map(x=>x.bytes),[html,next]);
});
