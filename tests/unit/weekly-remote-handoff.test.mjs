import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const issue = '2026-11-23';
const html = Buffer.from('<!doctype html><html><head><title>周报 2026年11月23日</title></head><body><main><section>已验收正文</section></main></body></html>');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const childCloses = [];
  const root = mkdtempSync(join(tmpdir(), 'gfrr-remote-test-'));
  t.after(async () => {
    // Promise.all in the race tests can reject while another child still uses the fixture.
    await Promise.all(childCloses);
    rmSync(root, { force: true, recursive: true });
  });
  function trackChild(child) {
    childCloses.push(new Promise(resolve => child.once('close', resolve)));
    return child;
  }
  const seed = join(root, 'seed'), remote = join(root, 'remote.git'), input = join(root, 'issue.html');
  mkdirSync(seed); mkdirSync(join(seed, 'reports'));
  const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:'pipe'}).trim();
  git(seed, 'init', '-b', 'main');
  git(seed, 'config','user.name','Test'); git(seed, 'config','user.email','test@example.invalid');
  writeFileSync(join(seed, 'reports/2026-11-09.html'), '<!doctype html><html><head><title>旧期</title></head><body><main><section>旧期</section></main></body></html>');
  git(seed, 'add','.'); git(seed, 'commit','-m','baseline'); git(root, 'clone','--bare',seed,remote);
  writeFileSync(input, html);
  const moduleDir=join(root,'module'); mkdirSync(moduleDir);
  for (const name of ['weekly-original.mjs','weekly-remote-handoff.mjs','build-weekly-reports.mjs','weekly-issue-identity.mjs']) {
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
  return { root, remote, input, git, client, moduleUrl, trackChild };
}
function frozenProductionCli(root) {
  // Keep the real canonical host and CLI bytes, but do not couple the transport
  // guards to whichever issue happens to be latest in the production checkout.
  const cwd = join(root, 'seed');
  const scripts = join(cwd, 'scripts');
  mkdirSync(scripts);
  for (const name of ['weekly-original.mjs', 'weekly-remote-handoff.mjs', 'build-weekly-reports.mjs', 'weekly-issue-identity.mjs']) {
    copyFileSync(new URL('../../scripts/' + name, import.meta.url), join(scripts, name));
  }
  return (args, env) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 5000, env });
}
test('remote handoff persists and reads back identical original; retries do not overwrite', async t => {
  const {remote,input,git,client,moduleUrl} = await fixture(t);
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
test('missing and mismatched handoffs fail closed', async t => {
  const {remote,client,moduleUrl} = await fixture(t);
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  assert.throws(() => readRemoteHandoff({remote,date:issue,sha:digest(html)}),/failed/i);
  assert.throws(() => readRemoteHandoff({remote,date:'../invalid',sha:digest(html)}));
});
test('real CLI requires remote handoff and explicit expected identity before admission', async t => {
  const {root,remote,input,git,client,moduleUrl} = await fixture(t);
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const project = join(root,'project');
  git(root,'clone',remote,project);
  mkdirSync(join(project,'scripts')); mkdirSync(join(project,'weekly-reports'));
  for (const name of ['weekly-original.mjs','weekly-remote-handoff.mjs','build-weekly-reports.mjs','check-weekly-admission.mjs','weekly-issue-identity.mjs']) {
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

  const next = '2026-11-30', revision = next+'-r2';
  const nextDraft = Buffer.from(html.toString().replace('11月23日','11月30日'));
  // Exercise handoff, preparation and both fixed copies without dropping a legal UTF-8 BOM.
  const revised = Buffer.from('\uFEFF'+nextDraft.toString().replace('11月30日','11月30日 · 第2版'));
  const nextPath = join(root,'next.html');
  writeFileSync(nextPath,nextDraft);
  const old = JSON.parse(run('scripts/weekly-remote-handoff.mjs','save',next,digest(nextDraft),nextPath));
  writeFileSync(nextPath,revised);
  const nextReceipt = JSON.parse(run('scripts/weekly-remote-handoff.mjs','save',revision,digest(revised),nextPath,old.sha256,old.remote_commit));
  const pins = [nextReceipt.remote_commit,old.sha256,old.remote_commit];
  assert.deepEqual(nextReceipt.predecessor,{sha256:old.sha256,handoffCommit:old.remote_commit});
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',revision,digest(revised)),/HANDOFF_COMMIT/);
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',revision,digest(revised),'e'.repeat(40),...pins.slice(1)),/explicitly pinned/);
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',revision,digest(revised),...pins.slice(0,2),'e'.repeat(40)),/explicitly pinned/);
  assert.equal(existsSync(join(project,'weekly-originals',revision)),false);
  const lock = join(project,'weekly-originals','.prepare.lock');
  writeFileSync(lock,'123456\n',{flag:'wx'});
  assert.throws(()=>run('scripts/weekly-original.mjs','prepare',revision,digest(revised),...pins),/holds .prepare.lock/);
  assert.equal(existsSync(join(project,'weekly-originals',revision)),false);
  unlinkSync(lock);
  run('scripts/weekly-original.mjs','prepare',revision,digest(revised),...pins);
  assert.match(run('scripts/weekly-original.mjs','check',revision,digest(revised),...pins),/Verified remote handoff commit/);
  assert.match(run('scripts/check-weekly-admission.mjs'),/"revision":2/);
  for (const prefix of ['reports','weekly-reports']) {
    assert.equal(existsSync(join(project,prefix,next+'.html')),false);
    assert.deepEqual(readFileSync(join(project,prefix,revision+'.html')),revised);
  }
  assert.equal(existsSync(join(project,'weekly-originals',next)),false);
  assert.doesNotMatch(readFileSync(join(project,'weekly-reports.html'),'utf8'),new RegExp(next+'\\.html'));
});

test('same-date revision pins its predecessor without exposing it or advancing its branch', async t => {
  const {root,remote,input,git,client,moduleUrl} = await fixture(t);
  const revision = issue + '-r2';
  const revised = Buffer.from(html.toString().replace('11月23日','11月23日 · 第2版').replace('已验收正文','已验收修订稿'));
  const revisedInput = join(root,'revised.html');
  writeFileSync(revisedInput,revised);
  const first = client.persistRemoteHandoff({source:input,date:issue,sha:digest(html)});
  const predecessor = {sha256:first.sha256,handoffCommit:first.commit};
  const args = {source:revisedInput,date:revision,sha:digest(revised),predecessor};
  const firstRef = `refs/heads/weekly-originals/${issue}`;
  const revisionRef = firstRef + '-r2';
  assert.throws(() => client.persistRemoteHandoff({...args,predecessor:undefined}),/pinned predecessor/);
  assert.throws(() => client.persistRemoteHandoff({...args,predecessor:{...predecessor,handoffCommit:'a'.repeat(40)}}),/predecessor commit differs/);
  assert.throws(() => git(remote,'show-ref','--verify',revisionRef));
  const accepted = client.persistRemoteHandoff(args);
  assert.deepEqual(accepted.predecessor,predecessor);
  assert.deepEqual(accepted.bytes,revised);
  assert.equal(git(remote,'rev-parse',firstRef),first.commit);
  assert.deepEqual(git(remote,'ls-tree','-r','--name-only',revisionRef).split('\n'), [
    `weekly-originals/${revision}/${digest(revised)}.html`, `weekly-originals/${revision}/identity.sha256`, `weekly-originals/${revision}/predecessor.json`,
  ].sort());
  assert.equal(git(remote,'rev-list','--count',revisionRef),'1');
  assert.equal(client.persistRemoteHandoff(args).commit,accepted.commit);
  assert.deepEqual(client.readRemoteHandoffs({issues:[{date:revision,sha:args.sha},{date:issue,sha:predecessor.sha256}]}).map(x=>x.commit),[accepted.commit,first.commit]);
  const replacement = Buffer.concat([revised,Buffer.from('\n')]);
  const replacementInput = join(root,'replacement.html');
  writeFileSync(replacementInput,replacement);
  assert.throws(() => client.persistRemoteHandoff({...args,source:replacementInput,sha:digest(replacement)}),/differs/);
  assert.equal(git(remote,'rev-parse',revisionRef),accepted.commit);
  // An unchanged original file at a different branch tip still fails the pinned commit check.
  const changedTip = git(remote,'-c','user.name=Test','-c','user.email=test@example.invalid','commit-tree',git(remote,'rev-parse',firstRef+'^{tree}'),'-p',first.commit,'-m','changed tip');
  git(remote,'update-ref',firstRef,changedTip,first.commit);
  assert.throws(() => client.readRemoteHandoff({date:revision,sha:args.sha}),/predecessor commit differs/);
  assert.throws(() => client.readRemoteHandoffs({issues:[{date:revision,sha:args.sha}]}),/predecessor commit differs/);
  git(remote,'update-ref','-d',firstRef,changedTip);
  assert.throws(() => client.readRemoteHandoff({date:revision,sha:args.sha}),/Git operation failed/);
});

test('accepted push with lost response is read back without a second push', async t => {
  const {root,remote,input,client,moduleUrl} = await fixture(t);
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

test('two competing originals for one date cannot both be accepted', async t => {
  const {root,remote,input,client,moduleUrl,trackChild} = await fixture(t);
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const alternate = join(root,'alternate.html');
  const other = Buffer.from(html.toString().replace('已验收正文','另一份原件'));
  writeFileSync(alternate,other);
  const program = `import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); try { const r=persistRemoteHandoff({remote,source,date,sha}); console.log(r.sha256); } catch { process.exitCode=1; }`;
  const run = (source,sha) => new Promise((resolve,reject) => {
    const child=trackChild(spawn(process.execPath,['--input-type=module','-e',program,remote,source,issue,sha],{stdio:['ignore','pipe','pipe']}));
    let output=''; child.stdout.on('data',chunk=>output+=chunk); child.on('error',reject); child.on('close',status=>resolve({status,output:output.trim()}));
  });
  const results=await Promise.all([run(input,digest(html)),run(alternate,digest(other))]);
  assert.equal(results.filter(result=>result.status===0).length,1);
  const winner=results.find(result=>result.status===0).output;
  assert.ok([digest(html),digest(other)].includes(winner));
  assert.equal(readRemoteHandoff({remote,date:issue,sha:winner}).sha256,winner);
});

test('racing revisions cannot overwrite the winning remote handoff', async t => {
  const {root,remote,input,git,client,moduleUrl,trackChild} = await fixture(t);
  const initial = client.persistRemoteHandoff({source:input,date:issue,sha:digest(html)});
  const revision = issue + '-r2';
  const predecessor = {sha256:initial.sha256,handoffCommit:initial.commit};
  const program = `import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [source,date,sha,prior]=process.argv.slice(1); try { console.log(persistRemoteHandoff({source,date,sha,predecessor:JSON.parse(prior)}).sha256); } catch { process.exitCode=1; }`;
  const variants = ['修订正文甲','修订正文乙'].map((body,i) => {
    const source = join(root,'r2-'+i+'.html');
    const bytes = Buffer.from(html.toString().replace('11月23日','11月23日 · 第2版').replace('已验收正文',body));
    writeFileSync(source,bytes);
    return {source,sha:digest(bytes)};
  });
  const results = await Promise.all(variants.map(({source,sha}) => new Promise((resolve,reject) => {
    const child = trackChild(spawn(process.execPath,['--input-type=module','-e',program,source,revision,sha,JSON.stringify(predecessor)],{stdio:['ignore','pipe','pipe']}));
    let digestOut=''; child.stdout.on('data',chunk=>digestOut+=chunk);
    child.on('error',reject); child.on('close',status=>resolve({status,digestOut:digestOut.trim()}));
  })));
  const winners = results.filter(result=>result.status===0);
  assert.equal(winners.length,1);
  assert.equal(client.readRemoteHandoff({date:revision,sha:winners[0].digestOut}).sha256,winners[0].digestOut);
  assert.equal(git(remote,'rev-parse','refs/heads/weekly-originals/'+issue),initial.commit);
});

test('batch read verifies multiple independently stored weekly originals', async t => {
  const {root,remote,input,client,moduleUrl} = await fixture(t);
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

test('production CLI refuses fetch and push URL rewrites before any remote mutation', async t => {
  const {root,remote,input,git,client,moduleUrl} = await fixture(t);
  const cli = frozenProductionCli(root);
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
      const child = cli(args, env);
      assert.equal(child.status,1,child.stderr);
      assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
      assert.doesNotMatch(child.stderr,/remote\.git/);
    }
    assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
  }
});

test('production CLI refuses a separately configured pushurl', async t => {
  const {remote,input,git,client,moduleUrl} = await fixture(t);
  const {persistRemoteHandoff,readRemoteHandoff,readRemoteHandoffs}=client;
  const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'remote.origin.pushurl',GIT_CONFIG_VALUE_0:`file://${remote}`};
  const child=spawnSync(process.execPath,['scripts/weekly-remote-handoff.mjs','save',issue,digest(html),input],{encoding:'utf8',timeout:5000,env});
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
  assert.doesNotMatch(child.stderr,/remote\.git/);
  assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
});

test('production CLI rejects URL-specific TLS and redirect overrides before network access', async t => {
  const {root,remote,input,git}=await fixture(t);
  const cli = frozenProductionCli(root);
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
      const child = cli(args, env);
      assert.equal(child.status,1,child.stderr);
      assert.match(child.stderr,/Unsafe effective Git HTTPS settings/);
    }
    assert.throws(()=>readFileSync(log));
    assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
  }
});

test('exported production entry points ignore an injected destination', async t => {
  const {root,remote,input,git}=await fixture(t);
  const config=join(root,'rewrite');
  writeFileSync(config,`[url "file://${remote}"]\n\tinsteadOf = https://github.com/ctmaomao/gfrr-auto-update-site.git\n`);
  const moduleUrl=new URL('../../scripts/weekly-remote-handoff.mjs',import.meta.url).href;
  const program=`import {persistRemoteHandoff} from ${JSON.stringify(moduleUrl)}; const [remote,source,date,sha]=process.argv.slice(1); try { persistRemoteHandoff({remote,source,date,sha}); process.exitCode=9; } catch(e) { console.error(e.message); process.exitCode=1; }`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program,remote,input,issue,digest(html)],{encoding:'utf8',timeout:5000,env:{...process.env,GIT_CONFIG_GLOBAL:config}});
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/Unexpected Git fetch or push endpoint/);
  assert.throws(()=>git(remote,'show-ref','--verify',`refs/heads/weekly-originals/${issue}`));
});

test('production CLI rejects a custom Git remote transport before network access', async t => {
  const {root,input}=await fixture(t);
  const cli = frozenProductionCli(root);
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
    const child = cli(args, env);
    assert.equal(child.status,1,child.stderr);
    assert.match(child.stderr,/Unexpected Git remote transport/);
  }
  assert.throws(()=>readFileSync(log));
});
