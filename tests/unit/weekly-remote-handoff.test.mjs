import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const issue = '2026-11-23';
const html = Buffer.from('<!doctype html><html><head><title>周报 2026年11月23日</title></head><body><main><section>已验收正文</section></main></body></html>');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gfrr-remote-test-'));
  const seed = join(root, 'seed'), remote = join(root, 'remote.git'), input = join(root, 'issue.html');
  mkdirSync(seed); mkdirSync(join(seed, 'reports'));
  const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:'pipe'}).trim();
  git(seed, 'init', '-b', 'main');
  git(seed, 'config','user.name','Test'); git(seed, 'config','user.email','test@example.invalid');
  writeFileSync(join(seed, 'reports/2026-11-09.html'), '<!doctype html><html><head><title>旧期</title></head><body><main><section>旧期</section></main></body></html>');
  git(seed, 'add','.'); git(seed, 'commit','-m','baseline'); git(root, 'clone','--bare',seed,remote);
  writeFileSync(input, html);
  const moduleDir=join(root,'module'); mkdirSync(moduleDir);
  for (const name of ['weekly-original.mjs','weekly-remote-handoff.mjs','build-weekly-reports.mjs']) {
    let contents=readFileSync(new URL('../../scripts/'+name,import.meta.url),'utf8');
    if (name==='weekly-remote-handoff.mjs') {
      const original="const productionRemote = 'https://github.com/ctmaomao/gfrr-auto-update-site.git';";
      assert.ok(contents.includes(original));
      contents=contents.replace(original,`const productionRemote = ${JSON.stringify(remote)};`);
    }
    writeFileSync(join(moduleDir,name),contents);
  }
  const moduleUrl=pathToFileURL(join(moduleDir,'weekly-remote-handoff.mjs')).href;
  const client=await import(moduleUrl);
  return { root, remote, input, git, client, moduleUrl };
}
test('remote handoff persists and reads back identical original; retries do not overwrite', async () => {
  const {remote,input,git,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
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
test('missing and mismatched handoffs fail closed', async () => {
  const {remote,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  assert.throws(() => readRemoteHandoff({remote,date:issue,sha:digest(html)}),/failed/i);
  assert.throws(() => readRemoteHandoff({remote,date:'../invalid',sha:digest(html)}));
});
test('real CLI requires remote handoff and explicit expected identity before admission', async () => {
  const {root,remote,input,git,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const project = join(root,'project');
  git(root,'clone',remote,project);
  mkdirSync(join(project,'scripts')); mkdirSync(join(project,'weekly-reports'));
  for (const name of ['weekly-original.mjs','weekly-remote-handoff.mjs','build-weekly-reports.mjs','check-weekly-admission.mjs']) {
    let contents=readFileSync(new URL('../../scripts/'+name,import.meta.url),'utf8');
    // Isolated test copy substitutes only the fixed destination; production has no override flag.
    if (name==='weekly-remote-handoff.mjs') {
      const original="const productionRemote = 'https://github.com/ctmaomao/gfrr-auto-update-site.git';";
      assert.ok(contents.includes(original));
      contents=contents.replace(original,`const productionRemote = ${JSON.stringify(remote)};`);
    }
    writeFileSync(join(project,'scripts',name),contents);
  }
  const run = (...args) => execFileSync(process.execPath,args,{cwd:project,encoding:'utf8',stdio:'pipe'});
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',issue,digest(html)),/Git operation failed/);
  run('scripts/weekly-original.mjs','save',issue,digest(html),input);
  run('scripts/weekly-original.mjs','install',issue,digest(html));
  assert.throws(()=>run('scripts/check-weekly-admission.mjs'),/Missing explicitly/);
  run('scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input);
  run('scripts/weekly-original.mjs','prepare',issue,digest(html));
  assert.match(run('scripts/weekly-original.mjs','check',issue,digest(html)),/Verified remote handoff commit/);
  assert.match(run('scripts/check-weekly-admission.mjs'),/remote_originals_verified/);
});

test('accepted push with lost response is read back without a second push', async () => {
  const {root,remote,input,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const wrapperDir = join(root,'bin'); mkdirSync(wrapperDir);
  const wrapper = join(wrapperDir,'git');
  const realGit = execFileSync('which',['git'],{encoding:'utf8'}).trim();
  const log = join(root,'push-count');
  writeFileSync(wrapper, '#!/bin/sh\ncase " $* " in *" push "*) "$TEST_REAL_GIT" "$@"; result=$?; if [ "$result" -eq 0 ]; then printf x >> "$TEST_PUSH_LOG"; exit 1; fi; exit "$result";; esac\nexec "$TEST_REAL_GIT" "$@"\n');
  chmodSync(wrapper,0o700);
  const program = `import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); const r=persistRemoteHandoff({remote,source,date,sha}); console.log(r.commit);`;
  const child = spawnSync(process.execPath,['--input-type=module','-e',program,remote,input,issue,digest(html)],{encoding:'utf8',timeout:20000,env:{...process.env,PATH:wrapperDir+':'+process.env.PATH,TEST_REAL_GIT:realGit,TEST_PUSH_LOG:log}});
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/^[a-f0-9]{40}\s*$/);
  assert.equal(readFileSync(log,'utf8'),'x');
  assert.deepEqual(readRemoteHandoff({remote,date:issue,sha:digest(html)}).bytes,html);
});

test('two competing originals for one date cannot both be accepted', async () => {
  const {root,remote,input,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const alternate = join(root,'alternate.html');
  const other = Buffer.from(html.toString().replace('已验收正文','另一份原件'));
  writeFileSync(alternate,other);
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

test('batch read verifies multiple independently stored weekly originals', async () => {
  const {root,remote,input,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const nextDate='2026-11-30';
  const next=Buffer.from(html.toString().replace('2026年11月23日','2026年11月30日'));
  const nextInput=join(root,'next.html'); writeFileSync(nextInput,next);
  const first=persistRemoteHandoff({remote,source:input,date:issue,sha:digest(html)});
  const second=persistRemoteHandoff({remote,source:nextInput,date:nextDate,sha:digest(next)});
  const result=readRemoteHandoffs({remote,issues:[{date:issue,sha:digest(html)},{date:nextDate,sha:digest(next)}]});
  assert.deepEqual(result.map(x=>x.commit),[first.commit,second.commit]);
  assert.deepEqual(result.map(x=>x.bytes),[html,next]);
});

test('production CLI refuses fetch and push URL rewrites before any remote mutation', async () => {
  const {root,remote,input,git,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const canonical='https://github.com/ctmaomao/gfrr-auto-update-site.git';
  for (const key of ['insteadOf','pushInsteadOf']) {
    const config=join(root,'poison-'+key);
    writeFileSync(config,`[url "file://${remote}"]\n\t${key} = ${canonical}\n`);
    const env={...process.env,GIT_CONFIG_GLOBAL:config};
    for (const args of [
      ['scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input],
      ['scripts/weekly-remote-handoff.mjs','verify',issue,digest(html)],
      ['scripts/weekly-original.mjs','prepare',issue,digest(html)],
      ['scripts/weekly-original.mjs','check',issue,digest(html)],
    ]) {
      const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000,env});
      assert.equal(child.status,1,child.stderr);
      assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
      assert.doesNotMatch(child.stderr,/remote\.git/);
    }
    assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
  }
});

test('production CLI refuses a separately configured pushurl', async () => {
  const {remote,input,git,client,moduleUrl} = await fixture();
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'remote.origin.pushurl',GIT_CONFIG_VALUE_0:`file://${remote}`};
  const child=spawnSync(process.execPath,['scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input],{encoding:'utf8',timeout:5000,env});
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
  assert.doesNotMatch(child.stderr,/remote\.git/);
  assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
});

test('production CLI rejects URL-specific TLS and redirect overrides before network access', async () => {
  const {root,remote,input,git}=await fixture();
  const wrapperDir=join(root,'network-blocker'); mkdirSync(wrapperDir);
  const wrapper=join(wrapperDir,'git');
  const realGit=execFileSync('which',['git'],{encoding:'utf8'}).trim();
  const log=join(root,'unexpected-network');
  writeFileSync(wrapper, '#!/bin/sh\ncase " $* " in *" fetch "*|*" push "*|*" ls-remote "*) printf x >> "$TEST_NETWORK_LOG"; exit 77;; esac\nexec "$TEST_REAL_GIT" "$@"\n');
  chmodSync(wrapper,0o700);
  for (const [key,value] of [['sslVerify','false'],['followRedirects','true']]) {
    const config=join(root,'unsafe-'+key);
    writeFileSync(config,`[http "https://github.com/ctmaomao/gfrr-auto-update-site.git"]\n\t${key} = ${value}\n`);
    const env={...process.env,GIT_CONFIG_GLOBAL:config,PATH:wrapperDir+':'+process.env.PATH,TEST_REAL_GIT:realGit,TEST_NETWORK_LOG:log};
    for (const args of [
      ['scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input],
      ['scripts/weekly-remote-handoff.mjs','verify',issue,digest(html)],
      ['scripts/weekly-original.mjs','prepare',issue,digest(html)],
      ['scripts/weekly-original.mjs','check',issue,digest(html)],
    ]) {
      const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000,env});
      assert.equal(child.status,1,child.stderr);
      assert.match(child.stderr,/Unsafe effective Git HTTPS settings/);
    }
    assert.throws(()=>readFileSync(log));
    assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
  }
});

test('exported production entry points ignore an injected destination', async () => {
  const {root,remote,input,git}=await fixture();
  const config=join(root,'rewrite');
  writeFileSync(config,`[url "file://${remote}"]\n\tinsteadOf = https://github.com/ctmaomao/gfrr-auto-update-site.git\n`);
  const moduleUrl=new URL('../../scripts/weekly-remote-handoff.mjs',import.meta.url).href;
  const program=`import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); try { persistRemoteHandoff({remote,source,date,sha}); process.exitCode=9; } catch(e) { console.error(e.message); process.exitCode=1; }`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program,remote,input,issue,digest(html)],{encoding:'utf8',timeout:5000,env:{...process.env,GIT_CONFIG_GLOBAL:config}});
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
  assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
});

test('production CLI rejects a custom Git remote transport before network access', async () => {
  const {root,input}=await fixture();
  const wrapperDir=join(root,'transport-blocker'); mkdirSync(wrapperDir);
  const realGit=execFileSync('which',['git'],{encoding:'utf8'}).trim();
  const log=join(root,'unexpected-transport');
  writeFileSync(join(wrapperDir,'git'), '#!/bin/sh\ncase " $* " in *" fetch "*|*" push "*|*" ls-remote "*) printf x >> "$TEST_NETWORK_LOG"; exit 77;; esac\nexec "$TEST_REAL_GIT" "$@"\n');
  chmodSync(join(wrapperDir,'git'),0o700);
  const env={...process.env,PATH:wrapperDir+':'+process.env.PATH,TEST_REAL_GIT:realGit,TEST_NETWORK_LOG:log,
    GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'remote.origin.vcs',GIT_CONFIG_VALUE_0:'untrusted'};
  for (const args of [
    ['scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input],
    ['scripts/weekly-remote-handoff.mjs','verify',issue,digest(html)],
    ['scripts/weekly-original.mjs','prepare',issue,digest(html)],
    ['scripts/weekly-original.mjs','check',issue,digest(html)],
  ]) {
    const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000,env});
    assert.equal(child.status,1,child.stderr);
    assert.match(child.stderr,/Unexpected Git remote transport/);
  }
  assert.throws(()=>readFileSync(log));
});
