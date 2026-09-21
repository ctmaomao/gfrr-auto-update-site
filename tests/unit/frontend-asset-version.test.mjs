// Guard for the frontend asset cache-version rule (AGENTS.md §1).
//
// The scenario that matters most is the one that shipped broken: a repository with a
// real multi-version APP_VERSION history plus an unbumped frontend edit. The previous
// implementation located its baseline with `git log -S 'APP_VERSION ='`, which returns
// the commit that introduced the literal (2026-05-27) rather than the most recent value
// change, so the guard reported PASS for exactly the case it existed to catch. A fixture
// with a single commit could not reveal that, hence the multi-commit fixture below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  getFrontendScope,
  extractAppVersion,
  evaluateFrontendAssetVersionStatus,
} from '../../scripts/review-frontend-asset-version.mjs';

const CHECKER = 'scripts/check-frontend-asset-version.mjs';

function git(root, args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@localhost', ...args], {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', message]);
}

let templateRepo = null;

/** Build the multi-version-history fixture once; each test gets a cheap copy of it. */
function buildTemplateRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-asset-version-template-'));
  git(root, ['init', '-b', 'main']);
  fs.mkdirSync(path.join(root, 'scripts/modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<html></html>\n');
  fs.writeFileSync(path.join(root, 'scripts/app.js'), "const APP_VERSION = 'import-1';\n");
  fs.writeFileSync(path.join(root, 'scripts/modules/health.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'scripts/modules/realtime.js'), '// @frozen M-94 V0 Path C\n');
  commitAll(root, 'initial import');

  fs.writeFileSync(path.join(root, 'scripts/app.js'), "const APP_VERSION = 'bump-2';\n");
  commitAll(root, 'bump to bump-2');

  fs.writeFileSync(path.join(root, 'scripts/app.js'), "const APP_VERSION = 'bump-3';\n");
  commitAll(root, 'bump to bump-3');

  return root;
}

/**
 * Fixture with real history: an initial import, then two successive version bumps, so a
 * string-introduction search and a value-change search disagree. Rebuilding git history
 * per test costs ~2s each, so the history is built once and copied.
 */
function makeRepoWithHistory(t) {
  if (templateRepo === null) {
    templateRepo = buildTemplateRepo();
    process.on('exit', () => fs.rmSync(templateRepo, { recursive: true, force: true }));
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-asset-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(templateRepo, root, { recursive: true });
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [path.resolve(CHECKER)], { cwd: root, encoding: 'utf8' });
}

test('scope is derived from the bump tool: entries plus loaded modules minus frozen', () => {
  const scope = getFrontendScope();
  assert.deepStrictEqual(scope.entryFiles, ['index.html', 'scripts/app.js']);
  assert.ok(scope.loadedModules.includes('scripts/modules/health.js'));
  assert.ok(!scope.loadedModules.includes('scripts/modules/realtime.js'));
  assert.deepStrictEqual(scope.frozenModules, ['scripts/modules/realtime.js']);
});

test('a modified loaded module without a bump FAILS in a repository with real version history', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'scripts/modules/health.js'), 'export const a = 2;\n');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'unbumped_frontend_changes');
  assert.deepStrictEqual(result.changedScopeFiles, ['scripts/modules/health.js']);
  assert.equal(result.workingVersion, 'bump-3');
  assert.equal(result.headVersion, 'bump-3');

  const run = runChecker(root);
  assert.equal(run.status, 1, 'the gate must block an unbumped frontend change');
  assert.match(run.stderr, /Unbumped|without an APP_VERSION bump|FAIL/u);
});

test('a committed frontend change without a bump FAILS even though the tree is clean', (t) => {
  // This is the shape that actually reached production: the commit was merged with an
  // inline-only change to a loaded module and no bump at all, so every later visitor kept
  // the cached module graph. A working-tree-only check cannot see it.
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'scripts/modules/health.js'), 'export const a = 2;\n');
  commitAll(root, 'change module without bumping');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'unbumped_committed_frontend_changes');
  assert.deepStrictEqual(result.committedScopeChanges, ['scripts/modules/health.js']);
  assert.deepStrictEqual(result.workingScopeChanges, []);
  assert.equal(runChecker(root).status, 1);
});

test('a committed change followed by a committed bump PASSES', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'scripts/modules/health.js'), 'export const a = 2;\n');
  commitAll(root, 'change module');
  fs.writeFileSync(path.join(root, 'scripts/app.js'), "const APP_VERSION = 'bump-4';\n");
  commitAll(root, 'bump after the fact');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'ok', result.reason);
  assert.equal(result.versionChangeVersion, 'bump-4');
  assert.deepStrictEqual(result.committedScopeChanges, []);
  assert.equal(runChecker(root).status, 0);
});

test('the same edit accompanied by a bump PASSES', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'scripts/modules/health.js'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(root, 'scripts/app.js'), "const APP_VERSION = 'bump-4';\n");

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'ok');
  assert.equal(result.versionBumped, true);
  assert.equal(runChecker(root).status, 0);
});

test('an index.html-only change without a bump FAILS', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'index.html'), '<html><body>changed</body></html>\n');
  assert.equal(evaluateFrontendAssetVersionStatus({ repoRoot: root }).status, 'unbumped_frontend_changes');
  assert.equal(runChecker(root).status, 1);
});

test('a clean working tree passes regardless of history depth', (t) => {
  const root = makeRepoWithHistory(t);
  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'ok');
  assert.deepStrictEqual(result.workingScopeChanges, []);
  assert.equal(runChecker(root).status, 0);
});

test('frozen and out-of-scope changes never fail the gate', (t) => {
  const root = makeRepoWithHistory(t);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/OPERATIONS.md'), 'note\n');
  fs.writeFileSync(path.join(root, 'scripts/modules/realtime.js'), '// @frozen M-94 V0 Path C\n// touched\n');
  fs.writeFileSync(path.join(root, 'scripts/check-unrelated.mjs'), 'export {};\n');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'ok');
  assert.deepStrictEqual(result.workingScopeChanges, []);
  assert.equal(runChecker(root).status, 0);
});

test('a page with no cache-bust token is reported as a known limitation, not a failure', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'bubble-watch.html'), '<html>bubble</html>\n');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'ok');
  assert.deepStrictEqual(result.workingNoTokenChanges, ['bubble-watch.html']);
  assert.ok(result.knownLimitations.some((line) => line.includes('bubble-watch.html')));
  assert.equal(runChecker(root).status, 0);
  assert.match(runChecker(root).stdout, /known limitation/u);
});

test('a missing APP_VERSION is reported as WATCH rather than a policy violation', (t) => {
  const root = makeRepoWithHistory(t);
  fs.writeFileSync(path.join(root, 'scripts/app.js'), 'const SOMETHING_ELSE = 1;\n');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: root });
  assert.equal(result.status, 'app_version_missing');
  assert.equal(runChecker(root).status, 0);
  assert.match(runChecker(root).stderr, /WATCH/u);
});

test('extractAppVersion reads only the version constant', () => {
  assert.equal(extractAppVersion("const APP_VERSION = 'x-1';\n"), 'x-1');
  assert.equal(extractAppVersion('const APP_VERSION = "x-2";\n'), 'x-2');
  assert.equal(extractAppVersion('const OTHER = 1;\n'), null);
  assert.equal(extractAppVersion(null), null);
});

test('the real repository is currently in sync', () => {
  const result = evaluateFrontendAssetVersionStatus();
  assert.equal(result.status, 'ok', result.reason);
  assert.ok(result.workingVersion);
  assert.equal(result.workingVersion, result.headVersion);
  assert.ok(result.scopeFiles.includes('scripts/modules/renderOilDirectional.js'));
  assert.ok(!result.scopeFiles.includes('scripts/modules/realtime.js'));
});
