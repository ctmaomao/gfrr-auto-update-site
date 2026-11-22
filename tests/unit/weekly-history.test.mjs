import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWeeklyHistory } from '../../scripts/check-weekly-history.mjs';
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'weekly-history-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  git('init', '-b', 'main');
  git('config','user.name','Test'); git('config','user.email','test@example.invalid');
  for (const dir of ['reports','weekly-reports','weekly-originals/2026-11-23']) mkdirSync(join(cwd,dir), {recursive:true});
  for (const path of ['reports/2026-11-23.html','weekly-reports/2026-11-23.html','weekly-originals/2026-11-23/identity.sha256']) writeFileSync(join(cwd,path),'original');
  git('add','.'); git('commit','-m','baseline');
  return {cwd,git,anchor:git('rev-parse','HEAD')};
}
test('trusted history catches paired replacement and paired deletion even after commits', t => {
  const {cwd,git,anchor} = fixture(t);
  assert.equal(checkWeeklyHistory({cwd,anchor}),3);
  for (const p of ['reports/2026-11-23.html','weekly-reports/2026-11-23.html']) writeFileSync(join(cwd,p),'replacement');
  git('add','.'); git('commit','-m','replace both');
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/Historical weekly file changed/);
  for (const p of ['reports/2026-11-23.html','weekly-reports/2026-11-23.html']) rmSync(join(cwd,p));
  git('add','-A'); git('commit','-m','delete both');
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/Historical weekly file missing/);
});
test('new dated paths are permitted, and missing trusted anchor is refused', t => {
  const {cwd,anchor}=fixture(t);
  writeFileSync(join(cwd,'reports/2026-11-30.html'),'new');
  assert.equal(checkWeeklyHistory({cwd,anchor}),3);
  assert.throws(()=>checkWeeklyHistory({cwd,anchor:'a'.repeat(40)}),/anchor/);
});

test('index-only paired removals and staged edits cannot evade the baseline', t => {
  const {cwd,git,anchor} = fixture(t);
  for (const p of ['reports/2026-11-23.html','weekly-reports/2026-11-23.html']) git('rm','--cached',p);
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}), /missing from index/);
});

test('rename into a dated path cannot erase its historical identity', t => {
  const {cwd,git,anchor} = fixture(t);
  writeFileSync(join(cwd,'reports/draft'),'renamed');
  git('add','reports/draft'); git('commit','-m','draft');
  git('mv','reports/draft','reports/2026-12-07.html'); git('commit','-m','publish by rename');
  assert.equal(checkWeeklyHistory({cwd,anchor}),4);
  rmSync(join(cwd,'reports/2026-12-07.html')); git('add','-A'); git('commit','-m','delete');
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/Historical weekly file missing/);
});
test('an anchor only on a second-parent branch is not a trusted first-parent baseline', t => {
  const {cwd,git}=fixture(t);
  git('switch','-c','side'); writeFileSync(join(cwd,'side.txt'),'side'); git('add','.'); git('commit','-m','side');
  const anchor=git('rev-parse','HEAD');
  git('switch','main'); writeFileSync(join(cwd,'main.txt'),'main'); git('add','.'); git('commit','-m','main');
  git('merge','--no-ff','side','-m','merge side');
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/first-parent/);
});

test('both fixed revision URLs and predecessor metadata become immutable on the first-parent history', t => {
  const {cwd,git,anchor} = fixture(t);
  const revision = '2026-11-23-r2';
  mkdirSync(join(cwd,'weekly-originals',revision));
  const paths = ['reports/'+revision+'.html','weekly-reports/'+revision+'.html',
    ...['identity.sha256','predecessor.json','handoff.json','a'.repeat(64)+'.html'].map(name=>'weekly-originals/'+revision+'/'+name)];
  for (const path of paths) writeFileSync(join(cwd,path),'revision');
  git('add','.'); git('commit','-m','publish revision');
  assert.equal(checkWeeklyHistory({cwd,anchor}),9);
  writeFileSync(join(cwd,paths[3]),'replacement predecessor');
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/Historical weekly file changed/);
  writeFileSync(join(cwd,paths[3]),'revision');
  git('rm','--cached',paths[0],paths[1]);
  assert.throws(()=>checkWeeklyHistory({cwd,anchor}),/missing from index/);
});
