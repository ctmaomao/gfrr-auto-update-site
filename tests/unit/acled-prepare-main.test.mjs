import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepareAcledMain, acquireAcledPublishLock } from '../../scripts/world-order/acled-prepare-main.mjs';

const config = 'config/world-order-acled-regional-weekly.json';
const raw = 'manual-artifacts/world-order/acled-input/weekly/raw.xlsx';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-acled-main-test-'));
  t.after(() => {
    // Delete only this test's mkdtemp child, containing disposable Git repositories.
    assert.equal(path.dirname(sandbox), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(sandbox).startsWith('gfrr-acled-main-test-'));
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  const root = path.join(sandbox, 'source with spaces 中文');
  const remote = path.join(sandbox, 'remote.git');
  fs.mkdirSync(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'ACLED fixture');
  git(root, 'config', 'core.hooksPath', path.join(sandbox, 'no-hooks'));
  git(root, 'config', 'core.autocrlf', 'false');
  write(root, '.gitignore', 'manual-artifacts/**/*.xlsx\npublisher-result.txt\n');
  write(root, config, '{"fixture":"baseline"}\n');
  write(root, 'config/world-order-acled-global-monthly.json', '{"fixture":"monthly"}\n');
  write(root, 'code.txt', 'main code\n');
  for (const file of ['acled-prepare-main.mjs', 'acled-publish-auto.mjs', 'acled-publish-guard.mjs']) {
    write(root, `scripts/world-order/${file}`, fs.readFileSync(new URL(`../../scripts/world-order/${file}`, import.meta.url)));
  }
  write(root, 'scripts/world-order/acled-publish.mjs', "import fs from 'node:fs'; fs.writeFileSync('publisher-result.txt', 'main publisher');\n");
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main');
  const base = git(root, 'rev-parse', 'HEAD');
  const feature = () => {
    git(root, 'switch', '-c', 'codex/fixture');
    write(root, 'code.txt', 'feature code\n');
    git(root, 'add', 'code.txt');
    git(root, 'commit', '-m', 'unmerged feature');
    return git(root, 'rev-parse', 'HEAD');
  };
  const other = () => {
    const dir = path.join(sandbox, 'other main 中文');
    git(root, 'worktree', 'add', dir, 'main');
    return dir;
  };
  const advance = (file = 'remote-only.txt') => {
    const peer = path.join(sandbox, 'peer');
    git(root, 'clone', remote, peer);
    git(peer, 'config', 'user.email', 'fixture@example.invalid');
    git(peer, 'config', 'user.name', 'ACLED fixture');
    git(peer, 'config', 'core.hooksPath', path.join(sandbox, 'no-hooks'));
    write(peer, file, 'remote update\n');
    git(peer, 'add', file);
    git(peer, 'commit', '-m', 'advance remote');
    git(peer, 'push', 'origin', 'main');
    return git(peer, 'rev-parse', 'HEAD');
  };
  return { root, remote, base, feature, other, advance };
}
const prepare = (root, dryRun = false) => prepareAcledMain({ root, dryRun, log() {} });

test('dry-run preserves feature, dirty aggregate, other main, refs and ignored input without fetching', t => {
  const f = fixture(t), featureHead = f.feature(), other = f.other();
  write(f.root, config, 'operator aggregate\n');
  write(f.root, raw, 'original workbook bytes');
  f.advance();
  const plan = prepare(f.root, true);
  assert.equal(path.resolve(plan.releaseCleanMainWorktree), other);
  assert.equal(plan.remoteCommit, f.base);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), featureHead);
  assert.equal(git(other, 'branch', '--show-current'), 'main');
  assert.equal(read(f.root, config), 'operator aggregate\n');
  assert.equal(read(f.root, raw), 'original workbook bytes');
  assert.equal(git(f.root, 'stash', 'list'), '');
  assert.equal(fs.existsSync(path.join(f.root, '.git/acled-publish-backups')), false);
});

test('feature to latest main preserves config bytes, branch history, other directory and raw inputs; never pushes', t => {
  const f = fixture(t), featureHead = f.feature(), other = f.other();
  const expected = '{"operator":"new data"}\r\n';
  write(f.root, config, expected);
  write(f.root, raw, 'source workbook');
  write(other, raw, 'other workbook');
  const remoteHead = f.advance();
  const result = prepare(f.root);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main');
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), remoteHead);
  assert.equal(git(f.root, 'rev-parse', 'codex/fixture'), featureHead);
  assert.equal(git(f.root, 'rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/main');
  assert.equal(read(f.root, 'code.txt'), 'main code\n');
  assert.equal(read(f.root, config), expected);
  assert.equal(read(f.root, raw), 'source workbook');
  assert.equal(read(other, raw), 'other workbook');
  assert.equal(git(other, 'branch', '--show-current'), '');
  assert.equal(git(other, 'rev-parse', 'HEAD'), f.base);
  assert.equal(read(result.backup, path.basename(config)), expected);
  assert.equal(git(f.root, 'rev-parse', 'refs/stash'), result.stash);
  assert.equal(git(f.remote, 'rev-parse', 'main'), remoteHead);
  assert.equal(git(f.root, 'diff', '--cached', '--name-only'), '');
});

test('current main with dirty aggregate can safely fast-forward and restore bytes', t => {
  const f = fixture(t);
  write(f.root, config, 'new aggregate\n');
  const head = f.advance();
  prepare(f.root);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), head);
  assert.equal(read(f.root, config), 'new aggregate\n');
});

for (const autocrlf of ['input', 'true']) {
  test(`operator CRLF bytes survive Git normalization with core.autocrlf=${autocrlf}`, t => {
    const f = fixture(t);
    f.feature();
    git(f.root, 'config', 'core.autocrlf', autocrlf);
    const bytes = '{\r\n  "operator": "new aggregate"\r\n}\r\n';
    write(f.root, config, bytes);
    const result = prepare(f.root);
    assert.equal(read(f.root, config), bytes);
    assert.equal(read(result.backup, path.basename(config)), bytes);
  });
}

for (const kind of ['tracked', 'untracked', 'staged', 'deleted-config', 'detached', 'merge']) {
  test(`rejects ${kind} source state without changing files or branches`, t => {
    const f = fixture(t);
    if (kind === 'tracked') write(f.root, 'code.txt', 'unfinished code');
    if (kind === 'untracked') write(f.root, 'untracked.txt', 'keep');
    if (kind === 'staged') { write(f.root, config, 'staged'); git(f.root, 'add', config); }
    if (kind === 'deleted-config') fs.unlinkSync(path.join(f.root, config));
    if (kind === 'detached') git(f.root, 'switch', '--detach');
    if (kind === 'merge') write(f.root, '.git/MERGE_HEAD', `${f.base}\n`);
    const before = git(f.root, 'status', '--porcelain');
    assert.throws(() => prepare(f.root));
    assert.equal(git(f.root, 'status', '--porcelain'), before);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.base);
    assert.equal(git(f.root, 'stash', 'list'), '');
  });
}

for (const kind of ['dirty', 'locked', 'ahead']) {
  test(`rejects ${kind} main in another worktree without releasing it`, t => {
    const f = fixture(t);
    f.feature();
    const other = f.other();
    if (kind === 'dirty') write(other, 'code.txt', 'unfinished main');
    if (kind === 'locked') git(f.root, 'worktree', 'lock', other);
    if (kind === 'ahead') { write(other, 'code.txt', 'unpublished main'); git(other, 'add', 'code.txt'); git(other, 'commit', '-m', 'unpublished'); }
    assert.throws(() => prepare(f.root));
    assert.equal(git(other, 'branch', '--show-current'), 'main');
    assert.equal(git(f.root, 'branch', '--show-current'), 'codex/fixture');
  });
}

test('remote aggregate changes stop before stashing local operator data', t => {
  const f = fixture(t);
  f.feature();
  write(f.root, config, 'operator data');
  f.advance(config);
  assert.throws(() => prepare(f.root), /远端配置已变化/);
  assert.equal(read(f.root, config), 'operator data');
  assert.equal(git(f.root, 'branch', '--show-current'), 'codex/fixture');
  assert.equal(git(f.root, 'stash', 'list'), '');
});

test('ignored input cannot be overwritten by an incoming tracked path', t => {
  const f = fixture(t);
  f.feature();
  write(f.root, 'remote-only.txt', 'private ignored data');
  fs.appendFileSync(path.join(f.root, '.git/info/exclude'), '\nremote-only.txt\n');
  f.advance();
  assert.throws(() => prepare(f.root));
  assert.equal(read(f.root, 'remote-only.txt'), 'private ignored data');
});

test('publish lock is shared across worktrees and released without deleting other files', t => {
  const f = fixture(t);
  f.feature();
  const other = f.other();
  const release = acquireAcledPublishLock(f.root);
  assert.throws(() => acquireAcledPublishLock(other), /已有自动发布/);
  release();
  acquireAcledPublishLock(other)();
  assert.equal(read(f.root, config), '{"fixture":"baseline"}\n');
});

test('auto CLI runs only main publisher after preparation, never feature publisher', t => {
  const f = fixture(t);
  f.feature();
  write(f.root, 'scripts/world-order/acled-publish.mjs', "throw new Error('FEATURE_PUBLISHER_MUST_NOT_RUN');\n");
  git(f.root, 'add', 'scripts/world-order/acled-publish.mjs');
  git(f.root, 'commit', '-m', 'unmerged publisher');
  write(f.root, config, 'operator data\n');
  const result = spawnSync(process.execPath, [path.join(f.root, 'scripts/world-order/acled-publish-auto.mjs')], { encoding: 'utf8', cwd: f.root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(f.root, 'publisher-result.txt'), 'main publisher');
  assert.equal(read(f.root, config), 'operator data\n');
  assert.equal(git(f.remote, 'rev-parse', 'main'), f.base);
  assert.equal(fs.existsSync(path.join(f.root, '.git/acled-publish-auto.lock')), false);
});

test('auto CLI rejects a dirty code tree before running publisher and releases its lock', t => {
  const f = fixture(t);
  write(f.root, 'code.txt', 'unfinished');
  const result = spawnSync(process.execPath, [path.join(f.root, 'scripts/world-order/acled-publish-auto.mjs')], { encoding: 'utf8', cwd: f.root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /无关改动/);
  assert.equal(fs.existsSync(path.join(f.root, 'publisher-result.txt')), false);
  assert.equal(fs.existsSync(path.join(f.root, '.git/acled-publish-auto.lock')), false);
  assert.equal(read(f.root, 'code.txt'), 'unfinished');
});

test('unreleased helper is visible in dry-run and blocks actual preparation before stashing', t => {
  const f = fixture(t);
  f.feature();
  f.advance();
  const peer = path.join(path.dirname(f.root), 'peer');
  git(peer, 'rm', 'scripts/world-order/acled-publish-auto.mjs');
  git(peer, 'commit', '-m', 'simulate main without new entry');
  git(peer, 'push', 'origin', 'main');
  git(f.root, 'fetch', 'origin', 'main');
  write(f.root, config, 'operator data');
  assert.equal(prepare(f.root, true).readyOnMain, false);
  assert.throws(() => prepare(f.root), /尚未合入 origin\/main/);
  assert.equal(git(f.root, 'branch', '--show-current'), 'codex/fixture');
  assert.equal(git(f.root, 'stash', 'list'), '');
  assert.equal(read(f.root, config), 'operator data');
});
