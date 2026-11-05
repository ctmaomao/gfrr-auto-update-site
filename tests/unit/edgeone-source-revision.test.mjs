import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/publish-edgeone-release.yml', import.meta.url), 'utf8');
const steps = workflow.split(/^      - name: /mu).slice(1);
const step = name => {
  const matches = steps.filter(value => value.startsWith(`${name}\n`) || value.startsWith(`${name}\r\n`));
  assert.equal(matches.length, 1, `exactly one ${name} step`);
  return matches[0];
};

test('successful main oil-news completion queues publication after the producer commit', () => {
  const producer = readFileSync(new URL('../../.github/workflows/refresh-oil-news-event-watch.yml', import.meta.url), 'utf8');
  const name = /^name: (.+)$/mu.exec(producer)?.[1].trim();
  assert.equal(name, 'Refresh Oil News Event Watch');
  const completion = /  workflow_run:\s+workflows: \[([^\]]+)\]\s+types: \[completed\]\s+branches: \[main\]/u.exec(workflow.replace(/^    #.*\r?\n/gmu, ''));
  assert.ok(completion, 'completed event is restricted to main');
  assert.deepEqual(completion[1].split(', ').map(value => value.trim()), [
    'Macro Risk Editorial Refresh', 'Bubble Watch Weekly Editorial Refresh',
    'Bubble Watch Editorial Follow-up', 'Refresh Oil Directional Pressure', name
  ]);
  assert.ok(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && (github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success') }}"),
    'failed/cancelled upstream runs cannot publish');
  const commit = producer.slice(producer.indexOf('- name: Commit'));
  assert.ok(commit.indexOf('git push') > commit.indexOf('git commit'));
  assert.match(step('Checkout source repository'), /ref: main/u,
    'completion sees the committed latest main even when the earlier trigger SHA predates the news');
});

test('completion listener cannot request oil-news collection or broaden data push publication', () => {
  const pushPaths = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('\npermissions:'));
  assert.doesNotMatch(pushPaths, /data\/\*\*|data\/oil-news-event-watch\.json/u);
  assert.doesNotMatch(workflow, /workflow run |workflow_dispatch.*refresh|build:oil-news|TAVILY|BRAVE_API|DEEPSEEK/u);
});

test('a producer commit after the first checkout is included by the completion checkout', t => {
  const parent = resolve(tmpdir()), root = mkdtempSync(join(parent, 'gfrr-edgeone-completion-'));
  t.after(() => {
    const target = resolve(root);
    assert.equal(dirname(target), parent);
    assert.ok(target.startsWith(join(parent, 'gfrr-edgeone-completion-')));
    rmSync(target, { recursive: true, force: true });
  });
  const source = join(root, 'source'), early = join(root, 'early'), completed = join(root, 'completed');
  mkdirSync(source);
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(source, 'init', '-q', '-b', 'main');
  git(source, 'config', 'user.name', 'Local publication fixture');
  git(source, 'config', 'user.email', 'fixture@example.invalid');
  const file = 'oil-news-event-watch.json';
  writeFileSync(join(source, file), '{"updatedAt":"2026-11-03T07:17:58Z"}\n');
  git(source, 'add', file); git(source, 'commit', '-qm', 'old snapshot');
  git(root, 'clone', '-q', '--no-local', '--branch', 'main', source, early);
  const triggerSha = git(early, 'rev-parse', 'HEAD');
  writeFileSync(join(source, file), '{"updatedAt":"2026-11-03T19:53:28Z"}\n');
  git(source, 'add', file); git(source, 'commit', '-qm', 'producer committed after early checkout');
  const latestSha = git(source, 'rev-parse', 'HEAD');
  assert.notEqual(triggerSha, latestSha);
  assert.ok(workflow.includes('Refresh Oil News Event Watch'));
  assert.match(step('Checkout source repository'), /ref: main/u);
  git(root, 'clone', '-q', '--no-local', '--branch', 'main', source, completed);
  assert.equal(git(completed, 'rev-parse', 'HEAD'), latestSha);
  assert.equal(git(early, 'rev-parse', 'HEAD'), triggerSha, 'never alter a previously checked tree');
  assert.equal(JSON.parse(readFileSync(join(completed, file))).updatedAt, '2026-11-03T19:53:28Z');
  assert.equal(JSON.parse(readFileSync(join(early, file))).updatedAt, '2026-11-03T07:17:58Z');
});

test('EdgeOne queued publication checks out main rather than its old trigger revision', () => {
  const checkout = step('Checkout source repository');
  assert.match(checkout, /with:\s+ref: main\s+fetch-depth: 0/u);
  assert.doesNotMatch(checkout, /github\.sha|github\.event|GITHUB_SHA/u);
});

test('source provenance is captured before validation and remains fixed through build', () => {
  const ordered = ['Checkout source repository', 'Record checked source revision', 'Setup Node.js',
    'Install dependencies', 'Run full check suite', 'Build allowlisted static artifact',
    'Publish changed artifact with quota guard'].map(name => workflow.indexOf(`- name: ${name}`));
  assert.ok(ordered.every((value, index) => value >= 0 && (index === 0 || value > ordered[index - 1])));
  const record = step('Record checked source revision');
  assert.ok(record.includes('source_sha=$(git rev-parse HEAD)'));
  assert.ok(record.includes('echo "sha=$source_sha" >> "$GITHUB_OUTPUT"'));
  assert.ok(record.includes('^[0-9a-f]{40}$'));
  const validated = workflow.slice(workflow.indexOf('- name: Run full check suite'),
    workflow.indexOf('- name: Publish changed artifact with quota guard'));
  assert.doesNotMatch(validated, /git\s+(?:fetch|pull|checkout|switch|reset)|actions\/checkout/u);
});

test('release attribution uses the actual checked SHA and verifies it before changing directories', () => {
  const publish = step('Publish changed artifact with quota guard');
  assert.ok(publish.includes('SOURCE_SHA: ${{ steps.source_revision.outputs.sha }}'));
  const verify = publish.indexOf('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
  assert.ok(verify >= 0 && verify < publish.indexOf('release_dir='));
  assert.ok(publish.includes('chore: publish source ${SOURCE_SHA::12}'));
  assert.doesNotMatch(publish, /GITHUB_SHA/u);
});

test('publication retains low-frequency, no-change and quota protections', () => {
  const publish = step('Publish changed artifact with quota guard');
  assert.ok(workflow.includes("cron: '55 */3 * * *'"));
  assert.ok(workflow.includes('contents: read'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
  assert.ok(publish.includes('git diff --cached --quiet'));
  assert.ok(publish.includes('"$release_count" -ge 400'));
  assert.ok(publish.indexOf('"$release_count" -ge 400') < publish.indexOf('git push origin main'));
  assert.doesNotMatch(workflow, /contents: write|EDGEONE_API_TOKEN/u);
});
