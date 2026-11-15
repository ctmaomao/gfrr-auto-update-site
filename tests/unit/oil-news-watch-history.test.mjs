import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WATCH_PATH, readCommitRows, readWatchAtCommit } from '../../scripts/oil-directional/oil-news-watch-history.mjs';

function repository(t) {
  const cwd = process.cwd();
  const root = mkdtempSync(path.join(os.tmpdir(), 'gfrr-oil-history-test-'));
  const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_')));
  t.after(() => {
    process.chdir(cwd);
    for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
    Object.assign(process.env, gitEnvironment);
    rmSync(root, { recursive: true, force: true });
  });
  // Neither child Git commands nor the helper may inherit another repository,
  // credential helper, template hook or global/system configuration.
  for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
  const emptyConfig = path.join(root, 'isolated-config');
  const emptyTemplate = path.join(root, 'empty-template');
  writeFileSync(emptyConfig, ''); mkdirSync(emptyTemplate);
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_CONFIG_GLOBAL = emptyConfig;
  process.chdir(root);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('-c', `init.templateDir=${emptyTemplate}`, 'init', '-q');
  git('config', 'core.hooksPath', emptyTemplate);
  // Keep isolation files outside the worktree contents asserted below.
  mkdirSync('.git/info', { recursive: true });
  writeFileSync('.git/info/exclude', '/isolated-config\n/empty-template/\n');
  git('config', 'user.name', 'History Test');
  git('config', 'user.email', 'history-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const commit = (file, text, subject, date) => {
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text);
    git('add', '--', file);
    execFileSync('git', ['commit', '-q', '-m', subject], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return git('rev-parse', 'HEAD').trim();
  };
  return { git, commit };
}

test('real Git history preserves filtering, limits, timestamps, subjects and exact watch bytes', t => {
  const { git, commit } = repository(t);
  const first = commit(WATCH_PATH, '{"sample":1}\n', 'first watch', '2026-01-01T12:00:00Z');
  const second = commit(WATCH_PATH, '{"sample":2}\n', 'second\twatch', '2026-01-02T12:00:00Z');
  commit('unrelated.txt', 'not a watch', 'unrelated', '2026-01-03T12:00:00Z');
  const expected = [
    { hash: second, committedAt: '2026-01-02T12:00:00.000Z', subject: 'second\twatch' },
    { hash: first, committedAt: '2026-01-01T12:00:00.000Z', subject: 'first watch' }
  ];
  assert.deepEqual(readCommitRows(30), expected);
  assert.deepEqual(readCommitRows(1), expected.slice(0, 1));
  assert.deepEqual(readWatchAtCommit(expected[1]), {
    text: '{"sample":1}\n',
    source: { type: 'git_history', path: WATCH_PATH, commitHash: first, committedAt: expected[1].committedAt, commitSubject: 'first watch' }
  });
  assert.equal(git('status', '--porcelain'), '', 'reading history must not alter tracked or untracked files');
  assert.equal(git('rev-parse', 'HEAD').trim() === second, false, 'reader must not reset unrelated HEAD');
});

test('repository with commits but no watch history returns an empty list', t => {
  const { commit } = repository(t);
  commit('unrelated.txt', 'no watch', 'unrelated', '2026-01-01T12:00:00Z');
  assert.deepEqual(readCommitRows(30), []);
});

test('Git failures preserve the exact command and stderr instead of returning fabricated samples', t => {
  repository(t);
  const args = ['show', `missing:${WATCH_PATH}`];
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.throws(() => readWatchAtCommit({ hash: 'missing' }), { message: `git ${args.join(' ')} failed: ${result.stderr.trim()}` });
  assert.throws(() => readCommitRows(1), /git log --max-count=1 .* failed:/);
});

test('missing Git executable remains an explicit spawn failure', t => {
  repository(t);
  const original = process.env.PATH;
  try {
    process.env.PATH = '';
    assert.throws(() => readCommitRows(1), /Failed to run git log --max-count=1 .*: spawnSync git ENOENT/);
  } finally {
    if (original === undefined) delete process.env.PATH; else process.env.PATH = original;
  }
});
