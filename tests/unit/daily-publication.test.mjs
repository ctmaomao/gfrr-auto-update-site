import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, lstatSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUBBLE_CREDIT_OUTPUTS, publishBubbleCreditCandidate, WORLD_ORDER_OUTPUTS, publishWorldOrderCandidate, retainWorldOrderCandidate, DAILY_OUTPUTS, publishDailyCandidate, safeConcurrentPath, retainDailyCandidate } from '../../scripts/publish-daily-candidate.mjs';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(outputs = DAILY_OUTPUTS, baseDoc = null, updatedOutputs = outputs, baseDocLink = null) {
  const dir = mkdtempSync(join(tmpdir(), 'daily-publication-test-'));
  const remote = join(dir, 'remote.git'), cwd = join(dir, 'daily'), other = join(dir, 'other');
  git(dir, 'init', '--bare', remote); git(dir, 'clone', remote, cwd);
  git(cwd, 'checkout', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.invalid');
  for (const file of outputs) { mkdirSync(join(cwd, 'data'), { recursive: true }); writeFileSync(join(cwd, file), 'old\n'); }
  if (baseDoc) {
    mkdirSync(join(cwd, 'docs'));
    if (baseDocLink) symlinkSync(baseDocLink, join(cwd, baseDoc));
    else writeFileSync(join(cwd, baseDoc), 'original\n');
    git(cwd, 'add', '--', baseDoc);
  }
  writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n');
  git(cwd, 'add', 'data', '.gitignore'); git(cwd, 'commit', '-m', 'base'); git(cwd, 'push', 'origin', 'main');
  git(dir, 'clone', '--branch', 'main', remote, other);
  git(other, 'config', 'user.name', 'Test'); git(other, 'config', 'user.email', 'test@example.invalid');
  for (const file of updatedOutputs) writeFileSync(join(cwd, file), 'candidate\n');
  git(cwd, 'add', 'data'); git(cwd, 'commit', '-m', 'candidate');
  const candidate = git(cwd, 'rev-parse', 'HEAD');
  function advance(path, content = 'concurrent\n', symlink = false) {
    mkdirSync(join(other, path, '..'), { recursive: true });
    if (symlink) symlinkSync(content, join(other, path)); else writeFileSync(join(other, path), content);
    git(other, 'add', path); git(other, 'commit', '-m', 'concurrent'); git(other, 'push', 'origin', 'main');
  }
  return { cwd, other, remote, candidate, advance, head: () => git(dir, '--git-dir', remote, 'rev-parse', 'main') };
}
test('unchanged main publishes exact validated candidate without regeneration', () => {
  const f = fixture(); const r = publishDailyCandidate({ cwd: f.cwd, validate: () => assert.fail('unneeded validation') });
  assert.equal(f.head(), f.candidate); assert.equal(r.attempts, 1);
  assert.equal(publishDailyCandidate({ cwd: f.cwd }).alreadyPublished, true);
});
test('documentation race retains remote content and candidate bytes, rechecks merged tree, original checkout untouched', () => {
  const f = fixture(); f.advance('docs/验收说明 (Daily).md'); let checked = 0;
  const r = publishDailyCandidate({ cwd: f.cwd, validate: cwd => { checked++; assert.equal(readFileSync(join(cwd, 'docs/验收说明 (Daily).md'), 'utf8'), 'concurrent\n'); for (const p of DAILY_OUTPUTS) assert.equal(readFileSync(join(cwd, p), 'utf8'), 'candidate\n'); } });
  assert.equal(checked, 1); assert.equal(f.head(), r.published); assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
});
test('moving a regular document within the permitted paths preserves an inert concurrent change', () => {
  const before = 'docs/初稿.md', after = 'docs/定稿 [Daily].md';
  const f = fixture(DAILY_OUTPUTS, before);
  git(f.other, 'mv', before, after);
  git(f.other, 'commit', '-m', 'rename document');
  git(f.other, 'push', 'origin', 'main');
  assert.equal(publishDailyCandidate({ cwd: f.cwd, validate: cwd => {
    assert.equal(readFileSync(join(cwd, after), 'utf8'), 'original\n');
    assert.throws(() => readFileSync(join(cwd, before)), /ENOENT/);
  } }).published, f.head());
});
test('another safe push during validation retries boundedly with all concurrent files intact', () => {
  const f = fixture(); f.advance('docs/a.md'); let checked = 0;
  const r = publishDailyCandidate({ cwd: f.cwd, validate: () => { if (++checked === 1) f.advance('tests/b.txt'); } });
  assert.equal(r.attempts, 2); assert.equal(checked, 2); assert.equal(git(f.cwd, 'show', `${f.head()}:tests/b.txt`), 'concurrent');
});
test('generation inputs, outputs, workflows, source code, symlinks fail closed without overwriting', () => {
  for (const path of ['config/new.json', 'scripts/new.mjs', '.github/workflows/x.yml', 'data/radar-data.json', 'docs/link']) {
    const f = fixture(); f.advance(path, 'changed', path === 'docs/link'); const before = f.head();
    assert.throws(() => publishDailyCandidate({ cwd: f.cwd, validate: () => assert.fail('unsafe tree') }), /daily_generation_inputs_changed/);
    assert.equal(f.head(), before);
  }
  assert.equal(safeConcurrentPath('docs-other/x'), false);
});
test('validation failure and repeated races never force push or discard candidate', () => {
  const f = fixture(); f.advance('docs/a.md'); const before = f.head();
  assert.throws(() => publishDailyCandidate({ cwd: f.cwd, validate: () => { throw new Error('validation failed'); } }), /validation failed/);
  assert.equal(f.head(), before);
  let n = 0;
  assert.throws(() => publishDailyCandidate({ cwd: f.cwd, validate: () => f.advance(`docs/race-${++n}.md`) }), /daily_publish_retry_exhausted/);
  assert.equal(n, 3); assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
});
test('candidate scope and attempt bound cannot be broadened', () => {
  const f = fixture(); writeFileSync(join(f.cwd, 'extra.txt'), 'bad'); git(f.cwd, 'add', 'extra.txt'); git(f.cwd, 'commit', '--amend', '--no-edit');
  assert.throws(() => publishDailyCandidate({ cwd: f.cwd }), /daily_candidate_path_rejected/);
  assert.throws(() => retainDailyCandidate({ cwd: f.cwd }), /daily_candidate_path_rejected/);
  assert.throws(() => publishDailyCandidate({ cwd: f.cwd, maxAttempts: 4 }), /daily_publish_attempt_limit/);
});
test('workflow preserves full validation and narrowly retains only validated failed candidate with identity', () => {
  const source = readFileSync(new URL('../../.github/workflows/build-daily-radar-data.yml', import.meta.url), 'utf8');
  assert.match(source, /npm run check:all\s+git commit/);
  assert.match(source, /node scripts\/publish-daily-candidate.mjs --receipt/);
  assert.match(source, /failure\(\).*steps.publish_daily.outputs.candidate_sha != ''/);
  assert.match(source, /retention-days: 3/);
  assert.match(source, /daily-candidate-artifact\/receipt.json/);
  assert.doesNotMatch(source, /git push --force|git reset --hard|git rebase/);
});

test('final push response loss is read-only confirmed; final fetch failure remains unknown', () => {
  for (const unknown of [false, true]) {
    const f = fixture(); let pushes = 0;
    const runGit = (args, cwd) => {
      if (args[0] === 'push') {
        if (++pushes === 3) git(cwd, ...args);
        throw new Error('lost response');
      }
      if (unknown && pushes === 3 && args[0] === 'fetch') throw new Error('transport unavailable');
      return git(cwd, ...args);
    };
    if (unknown) assert.throws(() => publishDailyCandidate({ cwd: f.cwd, runGit }), /daily_publish_outcome_unknown/);
    else assert.equal(publishDailyCandidate({ cwd: f.cwd, runGit }).alreadyPublished, true);
    assert.equal(pushes, 3); assert.equal(f.head(), f.candidate);
  }
});
test('retention exports exact immutable blobs, ignores dirty worktree, and is create-only', () => {
  const f = fixture(); writeFileSync(join(f.cwd, DAILY_OUTPUTS[0]), 'unvalidated dirty data');
  const receipt = retainDailyCandidate({ cwd: f.cwd });
  assert.equal(receipt.candidate, f.candidate); assert.equal(receipt.status, 'publication_not_confirmed');
  for (const path of DAILY_OUTPUTS) assert.equal(readFileSync(join(f.cwd, 'daily-candidate-artifact', path), 'utf8'), 'candidate\n');
  assert.equal(Object.keys(receipt.files).length, 3);
  assert.throws(() => retainDailyCandidate({ cwd: f.cwd }), /EEXIST/);
});
test('oversized immutable output cannot create an upload candidate', () => {
  const f = fixture(); writeFileSync(join(f.cwd, DAILY_OUTPUTS[0]), Buffer.alloc(5 * 1024 * 1024));
  git(f.cwd, 'add', 'data'); git(f.cwd, 'commit', '--amend', '--no-edit');
  assert.throws(() => retainDailyCandidate({ cwd: f.cwd }), /daily_candidate_artifact_size_limit/);
});

test('World Order publishes only its checked outputs over inert concurrent documentation', () => {
  const f = fixture(WORLD_ORDER_OUTPUTS); f.advance('docs/note.md'); let checks = 0;
  const result = publishWorldOrderCandidate({ cwd: f.cwd, validate: cwd => {
    checks++;
    assert.equal(readFileSync(join(cwd, 'docs/note.md'), 'utf8'), 'concurrent\n');
    for (const path of WORLD_ORDER_OUTPUTS) assert.equal(readFileSync(join(cwd, path), 'utf8'), 'candidate\n');
  } });
  assert.equal(checks, 1);
  assert.equal(f.head(), result.published);
  assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
});
test('World Order holds source, config, workflow and concurrent output changes and retains exact checked blobs', () => {
  for (const path of ['scripts/world-order/reader.mjs', 'config/world-order-acled-global-monthly.json', '.github/workflows/refresh-world-order-stress.yml', WORLD_ORDER_OUTPUTS[0]]) {
    const f = fixture(WORLD_ORDER_OUTPUTS); f.advance(path); const before = f.head();
    assert.throws(() => publishWorldOrderCandidate({ cwd: f.cwd, validate: () => assert.fail('unsafe tree') }), /world_order_generation_inputs_changed/);
    assert.equal(f.head(), before);
    const receipt = retainWorldOrderCandidate({ cwd: f.cwd });
    assert.deepEqual(Object.keys(receipt.files), WORLD_ORDER_OUTPUTS);
    assert.ok(!('realtimeInputCommit' in receipt));
  }
  assert.throws(() => publishWorldOrderCandidate({ cwd: fixture().cwd }), /world_order_candidate_path_rejected/);
});
test('World Order workflow validates, uses bounded publisher and conditionally retains only committed production outputs', () => {
  const source = readFileSync(new URL('../../.github/workflows/refresh-world-order-stress.yml', import.meta.url), 'utf8');
  assert.match(source, /npm run check:all\s+git commit/);
  assert.match(source, /node scripts\/publish-daily-candidate.mjs --world-order\n/);
  assert.match(source, /failure\(\).*steps.publish_world_order.outputs.candidate_sha != ''/);
  assert.match(source, /node scripts\/publish-daily-candidate.mjs --world-order-receipt/);
  assert.doesNotMatch(source, /git push|git reset --hard|git rebase/);
});


test('Bubble credit replays the exact allowlisted pair once per safe main revision, including an unchanged file', () => {
  assert.deepEqual(BUBBLE_CREDIT_OUTPUTS, ['data/bubble-watch.json', 'data/bubble-market-observations.json']);
  const f = fixture(BUBBLE_CREDIT_OUTPUTS, null, BUBBLE_CREDIT_OUTPUTS.slice(0, 1));
  f.advance('docs/refresh note.md');
  let validations = 0;
  const result = publishBubbleCreditCandidate({ cwd: f.cwd, validate: cwd => {
    assert.equal(readFileSync(join(cwd, 'docs/refresh note.md'), 'utf8'), 'concurrent\n');
    assert.deepEqual(git(cwd, 'diff', '--name-only', 'HEAD^', 'HEAD').split('\n'), BUBBLE_CREDIT_OUTPUTS.slice(0, 1));
    for (const path of BUBBLE_CREDIT_OUTPUTS) {
      assert.equal(git(cwd, 'rev-parse', `HEAD:${path}`), git(f.cwd, 'rev-parse', `${f.candidate}:${path}`));
    }
    if (++validations === 1) f.advance('tests/concurrent.txt');
    else assert.equal(readFileSync(join(cwd, 'tests/concurrent.txt'), 'utf8'), 'concurrent\n');
  } });
  assert.equal(validations, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.published, f.head());
  assert.notEqual(result.published, f.candidate);
  assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
});

test('replay makes existing dependencies usable inside a Git-ignored real directory', () => {
  const f = fixture(BUBBLE_CREDIT_OUTPUTS);
  f.advance('docs/validation.md');
  const deps = join(f.cwd, 'node_modules');
  const packageDir = join(deps, '@fixture', 'checked');
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(join(deps, '.bin'));
  writeFileSync(join(packageDir, 'index.js'), 'module.exports = "resolved";\n');
  symlinkSync('../@fixture/checked/index.js', join(deps, '.bin', 'checked'));
  const result = publishBubbleCreditCandidate({ cwd: f.cwd, validate: cwd => {
    const replayDeps = join(cwd, 'node_modules');
    assert.equal(lstatSync(replayDeps).isDirectory(), true);
    assert.equal(git(cwd, 'ls-files', '--others', '--exclude-standard'), '');
    assert.equal(readFileSync(join(replayDeps, '.bin', 'checked'), 'utf8'), 'module.exports = "resolved";\n');
    assert.equal(execFileSync(process.execPath, ['-p', 'require("@fixture/checked")'], { cwd, encoding: 'utf8' }).trim(), 'resolved');
  } });
  assert.equal(result.published, f.head());
});

test('Bubble credit rejects changes to either output, producer code or config, and docs symlinks before any push', () => {
  for (const path of [...BUBBLE_CREDIT_OUTPUTS, 'scripts/refresh-bubble-credit-spreads.mjs', 'config/bubble-credit-spreads.json', 'docs/link']) {
    const f = fixture(BUBBLE_CREDIT_OUTPUTS);
    f.advance(path, 'remote', path === 'docs/link');
    const before = f.head();
    assert.throws(() => publishBubbleCreditCandidate({
      cwd: f.cwd, validate: () => assert.fail('unsafe tree was revalidated'),
      runGit: (args, cwd) => {
        assert.notEqual(args[0], 'push');
        return git(cwd, ...args);
      }
    }), /bubble_credit_generation_inputs_changed/);
    assert.equal(f.head(), before);
    assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
  }
});

test('replay rejects removal or replacement of a previously non-regular docs entry', () => {
  for (const replace of [false, true]) {
    const path = 'docs/link';
    const f = fixture(BUBBLE_CREDIT_OUTPUTS, path, BUBBLE_CREDIT_OUTPUTS, '../data/bubble-watch.json');
    unlinkSync(join(f.other, path));
    if (replace) writeFileSync(join(f.other, path), 'regular replacement\n');
    git(f.other, 'add', '--', path);
    git(f.other, 'commit', '-m', 'change previously non-regular doc');
    git(f.other, 'push', 'origin', 'main');
    const before = f.head();
    assert.throws(() => publishBubbleCreditCandidate({ cwd: f.cwd, validate: () => assert.fail('unsafe tree') }), /bubble_credit_generation_inputs_changed/);
    assert.equal(f.head(), before);
  }
});

test('Bubble credit never pushes a failed or replaced replay and rejects unrelated staged content', () => {
  const f = fixture(BUBBLE_CREDIT_OUTPUTS);
  f.advance('tests/fixtures.txt'); const before = f.head();
  assert.throws(() => publishBubbleCreditCandidate({ cwd: f.cwd, validate: () => { throw new Error('full validation failed'); } }), /full validation failed/);
  assert.throws(() => publishBubbleCreditCandidate({ cwd: f.cwd, validate: cwd => {
    writeFileSync(join(cwd, BUBBLE_CREDIT_OUTPUTS[0]), 'replacement\n');
    git(cwd, 'add', BUBBLE_CREDIT_OUTPUTS[0]);
    git(cwd, 'commit', '--amend', '--no-edit');
  } }), /bubble_credit_replay_identity_changed/);
  assert.equal(f.head(), before);
  writeFileSync(join(f.cwd, 'unrelated.txt'), 'not approved');
  git(f.cwd, 'add', 'unrelated.txt'); git(f.cwd, 'commit', '--amend', '--no-edit');
  assert.throws(() => publishBubbleCreditCandidate({ cwd: f.cwd }), /bubble_credit_candidate_path_rejected/);
  assert.equal(f.head(), before);
});

test('Bubble credit refuses a fourth push and never force-pushes', () => {
  const f = fixture(BUBBLE_CREDIT_OUTPUTS);
  let pushes = 0;
  const runGit = (args, cwd) => {
    if (args[0] === 'push') {
      pushes++;
      assert.match(args.join(' '), /^push origin [0-9a-f]{40}:refs\/heads\/main$/u);
      f.advance(`docs/race-${pushes}.md`);
    }
    return git(cwd, ...args);
  };
  assert.throws(() => publishBubbleCreditCandidate({ cwd: f.cwd, validate: () => {}, runGit }), /bubble_credit_publish_retry_exhausted/);
  assert.equal(pushes, 3);
  assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.candidate);
});

test('Bubble credit workflow keeps no-change successful, dispatches EdgeOne only after success and retains no new artifact', () => {
  const source = readFileSync(new URL('../../.github/workflows/refresh-bubble-credit-spreads.yml', import.meta.url), 'utf8');
  const block = source.match(/      - name: Commit and publish only the verified Bubble display payload\n        run: \|\n([\s\S]+?)(?=      - name:)/u);
  assert.ok(block);
  assert.match(source, /npm run check:all\n      - name: Commit and publish/u);
  assert.match(block[1], /git add data\/bubble-watch\.json data\/bubble-market-observations\.json\n          if ! git diff --cached --quiet; then\n            git commit[^\n]+\n            node scripts\/publish-daily-candidate\.mjs --bubble-credit\n          fi\s*$/u);
  assert.match(source, /name: Request the existing guarded custom-domain publisher\n(?:        #[^\n]*\n)?        if: \$\{\{ success\(\) \}\}[\s\S]+?gh workflow run publish-edgeone-release\.yml/u);
  assert.doesNotMatch(source, /git push|git rebase|git reset|continue-on-error|--receipt|upload-artifact|retention-days/u);
  assert.equal(source.match(/scripts\/refresh-bubble-credit-spreads\.mjs --write/gu)?.length, 1);
  assert.equal(source.match(/scripts\/refresh-bubble-market-observations\.mjs --write/gu)?.length, 1);
});
