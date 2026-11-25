import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/realtime/switch-publish-branch.sh', import.meta.url));
const publisher = fileURLToPath(new URL('../../scripts/realtime/publish-market.sh', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const bash = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
  : 'bash';
const switchBranch = cwd => spawnSync(bash, [script], { cwd, encoding: 'utf8' });

function fixture(t, ref = 'refs/tags/realtime-data') {
  const root = mkdtempSync(join(tmpdir(), 'gfrr-realtime-publish-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const remote = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const runner = join(root, 'runner');
  git(root, 'init', '--bare', remote);
  git(root, 'init', '-b', 'main', seed);
  git(seed, 'config', 'user.name', 'Test');
  git(seed, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(seed, 'realtime'));
  mkdirSync(join(seed, 'scripts/realtime'), { recursive: true });
  writeFileSync(join(seed, 'realtime/market.json'), '{"fixture":"prior"}\n');
  writeFileSync(join(seed, 'scripts/realtime/switch-publish-branch.sh'), readFileSync(script));
  writeFileSync(join(seed, 'scripts/realtime/publish-market.sh'), readFileSync(publisher));
  git(seed, 'add', 'realtime', 'scripts');
  git(seed, 'commit', '-m', 'main seed');
  git(seed, 'push', remote, 'main');
  git(seed, 'rm', '-r', 'scripts'); // Publisher must finish even if switching removes its own file.
  git(seed, 'commit', '-m', 'publish seed');
  const publishSha = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'push', remote, `HEAD:${ref}`);

  // actions/checkout initializes origin, fetches main shallowly, and writes a tracking ref.
  git(root, 'init', runner);
  git(runner, 'remote', 'add', 'origin', pathToFileURL(remote).href);
  git(runner, 'fetch', '--depth=1', 'origin', '+refs/heads/main:refs/remotes/origin/main');
  git(runner, 'switch', '-c', 'main', 'origin/main');
  return { root, remote, runner, publishSha, missingRemote: join(root, 'no-such-remote.git') };
}

test('shallow main checkout switches to existing realtime-data and tracks the fetched commit', t => {
  const { runner, publishSha } = fixture(t, 'refs/heads/realtime-data');
  const out = switchBranch(runner);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(git(runner, 'branch', '--show-current'), 'realtime-data');
  assert.equal(git(runner, 'rev-parse', '@{upstream}'), publishSha);
  assert.equal(git(runner, 'rev-parse', 'HEAD'), publishSha);
});

test('a successful probe with only a same-name tag creates a local branch from main', t => {
  const { runner } = fixture(t);
  const before = git(runner, 'rev-parse', 'HEAD');
  const out = switchBranch(runner);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(git(runner, 'branch', '--show-current'), 'realtime-data');
  assert.equal(git(runner, 'rev-parse', 'HEAD'), before);
});

test('a branch whose name shares the full ref suffix does not establish the target branch', t => {
  const { runner } = fixture(t, 'refs/heads/archive/refs/heads/realtime-data');
  const out = switchBranch(runner);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Unable to verify the exact realtime-data ref; publication stopped/);
  assert.equal(git(runner, 'branch', '--show-current'), 'main');
});
test('a failed remote probe preserves its real Git exit status and does not switch or create a branch', t => {
  const { runner, missingRemote } = fixture(t);
  git(runner, 'remote', 'set-url', 'origin', pathToFileURL(missingRemote).href);
  const args = ['ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/realtime-data'];
  const probe = spawnSync('git', args, { cwd: runner });
  assert.ok(probe.status > 2);
  const out = switchBranch(runner);
  assert.equal(out.status, probe.status);
  assert.match(out.stderr, /Unable to verify realtime-data.*publication stopped/);
  assert.ok(!out.stderr.includes(missingRemote));
  assert.equal(git(runner, 'branch', '--show-current'), 'main');
  assert.equal(git(runner, 'branch', '--list', 'realtime-data'), '');
});

const workflowCases = [
  ['build-realtime-market', 'chore: refresh realtime market', 'No changes to commit.'],
  ['recover-stale-realtime-market', 'chore: recover stale realtime market', 'No changes to commit']
];

test('both workflows keep validation ahead of the shared switch and existing non-force publish', () => {
  const publisherSource = readFileSync(publisher, 'utf8');
  assert.match(publisherSource, /bash scripts\/realtime\/switch-publish-branch\.sh[\s\S]*?git push --set-upstream origin realtime-data/);
  assert.doesNotMatch(publisherSource, /git ls-remote|git push.*--force/);
  for (const [filename, message, noop] of workflowCases) {
    const source = readFileSync(new URL(`../../.github/workflows/${filename}.yml`, import.meta.url), 'utf8');
    const invocation = `bash scripts/realtime/publish-market.sh "${message}" "${noop}"`;
    assert.ok(source.indexOf('npm run check:realtime-local-schema') > -1);
    assert.ok(source.indexOf(invocation) > source.indexOf('npm run check:realtime-local-schema'));
    assert.equal(source.split(invocation).length, 2);
    assert.ok(source.replaceAll('\r\n', '\n').includes(`        run: |\n          ${invocation}\n`),
      'publisher command with a colon-space in its shell arguments must use a YAML block scalar');
    assert.doesNotMatch(source, /git ls-remote|git push.*--force/);
  }
});

for (const [filename, message, noop] of workflowCases) {
  test(`${filename}: shared publish writes only changed realtime bytes with existing commit subject`, t => {
    const { root, remote, runner, publishSha } = fixture(t, 'refs/heads/realtime-data');
    const payload = '{"fixture":"updated"}\n';
    writeFileSync(join(runner, 'realtime/market.json'), payload);
    const out = spawnSync(bash, ['scripts/realtime/publish-market.sh', message, noop], {
      cwd: runner, env: { ...process.env, RUNNER_TEMP: root }, encoding: 'utf8'
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(git(remote, 'rev-parse', 'realtime-data^'), publishSha);
    assert.equal(git(remote, 'show', '-s', '--format=%s', 'realtime-data'), message);
    assert.equal(git(remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'realtime-data'), 'realtime/market.json');
    assert.equal(execFileSync('git', ['show', 'realtime-data:realtime/market.json'], { cwd: remote, encoding: 'utf8' }), payload);
  });

  test(`${filename}: identical realtime payload retains exact no-op outcome without pushing`, t => {
    const { root, remote, runner, publishSha } = fixture(t, 'refs/heads/realtime-data');
    const out = spawnSync(bash, ['scripts/realtime/publish-market.sh', message, noop], {
      cwd: runner, env: { ...process.env, RUNNER_TEMP: root }, encoding: 'utf8'
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.ok(out.stdout.split(/\r?\n/).includes(noop));
    assert.equal(git(remote, 'rev-parse', 'realtime-data'), publishSha);
  });
}
