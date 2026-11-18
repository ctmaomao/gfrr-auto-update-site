import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildPagesArtifact } from '../../scripts/build-pages-artifact.mjs';
import { compareEdgeOneTree } from '../../scripts/review-edgeone-noop.mjs';

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
    'Bubble Watch Editorial Follow-up', 'Refresh Oil Directional Pressure', name, 'Refresh Oil Thermal Watch', 'Build Daily Radar Data'
  ]);
  assert.ok(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && (github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success') }}"),
    'failed/cancelled upstream runs cannot publish');
  const commit = producer.slice(producer.indexOf('- name: Commit'));
  assert.ok(commit.indexOf('git push') > commit.indexOf('git commit'));
  assert.match(step('Checkout source repository'), /ref: main/u,
    'completion sees the committed latest main even when the earlier trigger SHA predates the news');
});

test('successful thermal completion uses the existing guarded publication path', async () => {
  const producer = readFileSync(new URL('../../.github/workflows/refresh-oil-thermal-watch.yml', import.meta.url), 'utf8');
  const name = /^name: (.+)$/mu.exec(producer)?.[1].trim();
  assert.equal(name, 'Refresh Oil Thermal Watch');
  assert.ok(workflow.includes(`, ${name}, Build Daily Radar Data]`));
  const commit = producer.slice(producer.indexOf('- name: Commit'));
  assert.ok(commit.indexOf('git push') > commit.indexOf('git commit'));
  assert.match(step('Checkout source repository'), /ref: main/u);
  assert.ok(workflow.includes('node scripts/review-pages-deployment.mjs --upstream-only'));
  const { reviewMacroBudgetSkip } = await import('../../scripts/review-pages-deployment.mjs');
  const decision = await reviewMacroBudgetSkip({
    eventName: 'workflow_run', event: { workflow_run: { name } },
    fetchImpl: () => { throw new Error('thermal completion must not query Macro evidence'); }
  });
  assert.deepEqual(decision, { shouldPublish: true, reason: 'not_macro_budget_skip' });
});

test('successful Daily completion uses normal admission without Macro budget evidence', async () => {
  const producer = readFileSync(new URL('../../.github/workflows/build-daily-radar-data.yml', import.meta.url), 'utf8');
  const name = /^name: (.+)$/mu.exec(producer)?.[1].trim();
  assert.equal(name, 'Build Daily Radar Data');
  assert.ok(workflow.includes(`, ${name}]`));
  assert.ok(producer.includes('node scripts/publish-daily-candidate.mjs'));
  assert.match(step('Checkout source repository'), /ref: main/u);
  const { reviewMacroBudgetSkip } = await import('../../scripts/review-pages-deployment.mjs');
  assert.deepEqual(await reviewMacroBudgetSkip({
    eventName: 'workflow_run', event: { workflow_run: { name } },
    fetchImpl: () => { throw new Error('Daily must not query Macro evidence'); }
  }), { shouldPublish: true, reason: 'not_macro_budget_skip' });
});

test('completion listeners cannot request collection or broaden data push publication', () => {
  const pushPaths = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('\npermissions:'));
  assert.doesNotMatch(pushPaths, /data\/\*\*|data\/oil-(?:news-event|thermal)-watch\.json|data\/radar-(?:data|history(?:-full)?)\.json/u);
  assert.doesNotMatch(workflow, /workflow run |workflow_dispatch.*refresh|build:oil-(?:news|thermal)|build:data|publish-daily-candidate|TAVILY|BRAVE_API|DEEPSEEK|FIRMS_MAP_KEY/u);
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


test('only a successful schedule-specific no-op proof can skip the unchanged publish path', () => {
  const probe = step('Prove scheduled EdgeOne artifact is unchanged');
  assert.match(probe, /if: github.event_name == 'schedule' && steps.review.outcome == 'success' && steps.review.outputs.should_publish == 'true'/);
  assert.match(probe, /SOURCE_SHA=\$\(git rev-parse HEAD\)\s+export SOURCE_SHA\s+npm ci\s+node scripts\/review-edgeone-noop\.mjs/);
  assert.match(probe, /continue-on-error: true/);
  assert.doesNotMatch(probe, /GH_TOKEN|secrets\.|deploy.key/i);
  assert.ok(workflow.includes("(steps.noop.outcome != 'success' || steps.noop.outputs.identical != 'true')"));
  assert.ok(workflow.includes("needs.publication_check.result != 'success' || needs.publication_check.outputs.should_publish != 'false'"));
});

function noopFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'edgeone-proof-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const source = join(root, 'source');
  const release = join(root, 'release');
  const staging = join(root, 'stage');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  for (const dir of [source, release, staging]) mkdirSync(dir);
  for (const dir of [source, release]) {
    git(dir, 'init', '-b', 'main');
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'config', 'user.email', 'test@example.invalid');
  }
  for (const dir of [release, staging]) {
    writeFileSync(join(dir, 'index.html'), 'hello\n');
    writeFileSync(join(dir, 'edgeone.json'), '{"headers":[]}\n');
  }
  git(source, 'commit', '--allow-empty', '-m', 'source');
  git(release, 'add', '.');
  git(release, 'commit', '-m', 'release');
  const sourceSha = git(source, 'rev-parse', 'HEAD');
  const sourceUrl = pathToFileURL(source).href;
  const releaseUrl = pathToFileURL(release).href;
  const compare = overrides => compareEdgeOneTree({ staging, scratch: mkdtempSync(join(root, 'bare-')),
    sourceUrl, releaseUrl, sourceSha, ...overrides });
  return { root, source, release, staging, git, sourceSha, compare };
}

test('scheduled proof compares complete staged and release Git trees, including config and extra or missing paths', t => {
  const f = noopFixture(t);
  assert.deepEqual(f.compare(), { reason: 'identical_release_tree', sourceSha: f.sourceSha,
    releaseCommit: f.git(f.release, 'rev-parse', 'HEAD'), releaseTree: f.git(f.release, 'rev-parse', 'HEAD^{tree}') });
  for (const [path, original] of [['index.html', 'hello\n'], ['edgeone.json', '{"headers":[]}\n']]) {
    writeFileSync(join(f.staging, path), 'different\n');
    assert.equal(f.compare().reason, 'tree_differs', path);
    writeFileSync(join(f.staging, path), original);
  }
  writeFileSync(join(f.staging, 'extra.txt'), 'extra\n');
  assert.equal(f.compare().reason, 'tree_differs', 'extra path');
  rmSync(join(f.staging, 'extra.txt'));
  rmSync(join(f.staging, 'index.html'));
  assert.equal(f.compare().reason, 'tree_differs', 'missing path');
});

test('scheduled proof includes Git executable modes even when bytes match', { skip: process.platform === 'win32' }, t => {
  const f = noopFixture(t);
  chmodSync(join(f.staging, 'index.html'), 0o755);
  assert.equal(f.compare().reason, 'tree_differs');
});

test('ambient Git attributes cannot normalize unequal staging bytes into an equal tree', t => {
  const f = noopFixture(t);
  const old = process.env.XDG_CONFIG_HOME;
  t.after(() => {
    if (old === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = old;
  });
  const configHome = join(f.root, 'config-home');
  mkdirSync(join(configHome, 'git'), { recursive: true });
  writeFileSync(join(configHome, 'git', 'attributes'), '*.html text\n');
  process.env.XDG_CONFIG_HOME = configHome;
  writeFileSync(join(f.staging, 'index.html'), 'hello\r\n');
  assert.equal(f.compare().reason, 'tree_differs');
});

test('regular content cannot match a release symbolic link', { skip: process.platform === 'win32' }, t => {
  const f = noopFixture(t);
  rmSync(join(f.release, 'index.html'));
  symlinkSync('hello\n', join(f.release, 'index.html'));
  f.git(f.release, 'add', 'index.html');
  f.git(f.release, 'commit', '-m', 'replace regular file with link');
  assert.equal(f.compare().reason, 'tree_differs');
});

test('a private Pages artifact target cannot replace an existing path', t => {
  const root = mkdtempSync(join(tmpdir(), 'edgeone-proof-output-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const marker = join(root, 'marker');
  writeFileSync(marker, 'preserve');
  assert.throws(() => buildPagesArtifact(root), /EEXIST/);
  assert.equal(readFileSync(marker, 'utf8'), 'preserve');
});

test('missing proof, and a source or release ref race leave publication on its normal validated path', t => {
  const f = noopFixture(t);
  assert.equal(f.compare({ releaseUrl: pathToFileURL(join(f.release, 'missing')).href }).reason, 'proof_unavailable');
  assert.equal(f.compare({ git(cwd, ...args) {
    if (args[0] === 'ls-remote' && args.includes(pathToFileURL(f.release).href)) {
      f.git(f.release, 'commit', '--allow-empty', '-m', 'release moved');
    }
    return f.git(cwd, ...args);
  } }).reason, 'ref_changed');
  f.git(f.source, 'commit', '--allow-empty', '-m', 'source moved');
  assert.equal(f.compare().reason, 'ref_changed');
});
