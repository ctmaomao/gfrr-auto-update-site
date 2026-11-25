import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildPagesArtifact } from '../../scripts/build-pages-artifact.mjs';
import { compareEdgeOneTree, isEdgeOneNoopTrigger, isScheduledWorldOrderCompletion } from '../../scripts/review-edgeone-noop.mjs';

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
    'Bubble Watch Editorial Follow-up', 'Refresh Oil Directional Pressure', name, 'Refresh Oil Thermal Watch', 'Build Daily Radar Data', 'Refresh World Order Stress'
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
  assert.ok(workflow.includes(`, ${name}, Build Daily Radar Data, Refresh World Order Stress]`));
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
  assert.ok(workflow.includes(`, ${name}, Refresh World Order Stress]`));
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
  assert.doesNotMatch(pushPaths, /data\/\*\*|data\/oil-(?:news-event|thermal)-watch\.json|data\/radar-(?:data|history(?:-full)?)\.json|data\/(?:world-order-stress|gdelt-world-order-cache)\.json/u);
  assert.doesNotMatch(workflow, /workflow run |workflow_dispatch.*refresh|build:oil-(?:news|thermal)|build:data|publish-daily-candidate|build:world-order|actions\/download-artifact|TAVILY|BRAVE_API|DEEPSEEK|FIRMS_MAP_KEY/u);
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


test('only a successful eligible no-op proof can skip the unchanged publish path', () => {
  const probe = step('Prove eligible EdgeOne artifact is unchanged');
  assert.match(probe, /if: \(github.event_name == 'schedule' \|\| steps.world_order.outputs.admitted == 'true'\) && steps.review.outcome == 'success' && steps.review.outputs.should_publish == 'true'/);
  assert.match(probe, /SOURCE_SHA=\$\(git rev-parse HEAD\)\s+export SOURCE_SHA\s+node scripts\/review-edgeone-noop\.mjs/);
  assert.match(probe, /continue-on-error: true/);
  assert.doesNotMatch(probe, /GH_TOKEN|secrets\.|deploy.key/i);
  assert.ok(workflow.includes("(steps.noop.outcome != 'success' || steps.noop.outputs.identical != 'true')"));
  assert.ok(workflow.includes("needs.publication_check.result != 'success' || needs.publication_check.outputs.should_publish != 'false'"));
});

const worldOrderPath = '.github/workflows/refresh-world-order-stress.yml';
const worldOrderName = 'Refresh World Order Stress';
const worldOrderContext = () => {
  const repository = 'ctmaomao/gfrr-auto-update-site';
  const repo = () => ({ full_name: repository });
  return { eventName: 'workflow_run', ref: 'refs/heads/main', repository,
    releaseRepository: 'ctmaomao/gfrr-edgeone-release',
    event: { action: 'completed', repository: repo(), workflow_run: {
      name: worldOrderName, path: worldOrderPath, event: 'schedule', status: 'completed',
      conclusion: 'success', head_branch: 'main', repository: repo(), head_repository: repo()
    } } };
};

test('World Order admission requires exact scheduled completion identity, independently of no-op proof', t => {
  const root = mkdtempSync(join(tmpdir(), 'edgeone-world-admission-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const file = join(root, 'event.json'), output = join(root, 'output');
  const runAdmission = (context, payload) => {
    writeFileSync(file, payload);
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../../scripts/review-edgeone-noop.mjs', import.meta.url)), '--admit-world-order'
    ], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: context.eventName, GITHUB_REF: context.ref,
      GITHUB_REPOSITORY: context.repository, RELEASE_REPOSITORY: context.releaseRepository,
      GITHUB_EVENT_PATH: file, GITHUB_OUTPUT: output } });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, 'utf8');
  };
  const main = worldOrderContext();
  assert.equal(isScheduledWorldOrderCompletion(main), true);
  assert.equal(isEdgeOneNoopTrigger(main), true);
  assert.equal(runAdmission(main, JSON.stringify(main.event)), 'admitted=true\n');
  assert.equal(runAdmission(main, '{'), '', 'parsed payload is required');
  for (const [label, mutate] of Object.entries({
    manualACLED: c => { c.event.workflow_run.event = 'workflow_dispatch'; },
    otherInnerTrigger: c => { c.event.workflow_run.event = 'push'; },
    incomplete: c => { c.event.action = 'requested'; },
    wrongStatus: c => { c.event.workflow_run.status = 'in_progress'; },
    unsuccessful: c => { c.event.workflow_run.conclusion = 'failure'; },
    wrongName: c => { c.event.workflow_run.name = worldOrderName.toLowerCase(); },
    wrongPath: c => { c.event.workflow_run.path += '.bak'; },
    wrongHeadBranch: c => { c.event.workflow_run.head_branch = 'topic'; },
    wrongOuterRef: c => { c.ref = 'refs/heads/topic'; },
    wrongOuterRepo: c => { c.repository = 'fork/gfrr-auto-update-site'; },
    missingEventRepo: c => { delete c.event.repository; },
    wrongRunRepo: c => { c.event.workflow_run.repository.full_name = 'fork/gfrr-auto-update-site'; },
    fork: c => { c.event.workflow_run.head_repository.full_name = 'fork/gfrr-auto-update-site'; },
    missingPayload: c => { c.event = {}; }
  })) {
    const context = worldOrderContext();
    mutate(context);
    assert.equal(isScheduledWorldOrderCompletion(context), false, label);
    assert.equal(isEdgeOneNoopTrigger(context), false, label);
    assert.equal(runAdmission(context, JSON.stringify(context.event)), '', label);
  }
});

test('World Order guard cannot fail open into publishing; existing paths are not broadened', () => {
  const producer = readFileSync(new URL('../../' + worldOrderPath, import.meta.url), 'utf8');
  assert.equal(/^name: (.+)$/mu.exec(producer)?.[1], worldOrderName);
  assert.match(producer, /if: \$\{\{ inputs.acled_config_commit != '' \}\}[\s\S]*?verify-acled-refresh\.mjs --edgeone/u);
  const gate = step('Admit scheduled World Order completion');
  assert.match(gate, /if: github.event_name == 'workflow_run' && \(github.event.workflow_run.name == 'Refresh World Order Stress' \|\| github.event.workflow_run.path == '\.github\/workflows\/refresh-world-order-stress\.yml'\)/u);
  assert.match(gate, /node scripts\/review-edgeone-noop\.mjs --admit-world-order/u);
  assert.match(step('Review upstream publication admission'), /if: steps.world_order.outcome == 'skipped' \|\| steps.world_order.outputs.admitted == 'true'/u);
  assert.match(workflow, /world_order_admitted: \$\{\{ steps.world_order.outputs.admitted \}\}/u);
  const publish = workflow.split('\n  publish:\n')[1].split('    runs-on:')[0];
  assert.ok(publish.includes("github.event.workflow_run.name != 'Refresh World Order Stress' && github.event.workflow_run.path != '.github/workflows/refresh-world-order-stress.yml'"));
  assert.ok(publish.includes("|| needs.publication_check.outputs.world_order_admitted == 'true'"));
  assert.ok(publish.includes("github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success'"));
  assert.ok(publish.includes("github.ref == 'refs/heads/main'"));
  const context = worldOrderContext();
  assert.equal(isEdgeOneNoopTrigger({ ...context, eventName: 'schedule', event: undefined }), true);
  for (const eventName of ['workflow_dispatch', 'push']) {
    assert.equal(isEdgeOneNoopTrigger({ ...context, eventName, event: undefined }), false, eventName);
  }
  for (const name of ['Build Daily Radar Data', 'Refresh Oil News Event Watch', 'Macro Risk Editorial Refresh']) {
    context.event.workflow_run.name = name;
    assert.equal(isEdgeOneNoopTrigger(context), false, name);
  }
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
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/world-order-stress.json'), '{"updatedAt":"2026-11-19T04:02:00Z"}\n');
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

test('admitted World Order completion only early-outs on a whole-tree match', t => {
  const f = noopFixture(t);
  assert.equal(isEdgeOneNoopTrigger(worldOrderContext()), true);
  assert.equal(f.compare().reason, 'identical_release_tree');
  writeFileSync(join(f.staging, 'data/world-order-stress.json'), '{"updatedAt":"2026-11-20T04:02:00Z"}\n');
  assert.equal(f.compare().reason, 'tree_differs');
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
