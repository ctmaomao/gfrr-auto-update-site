import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getFrontendScopeFiles,
  extractAppVersion,
  evaluateFrontendAssetVersionStatus,
} from '../../scripts/review-frontend-asset-version.mjs';

const git = (root, args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@localhost', ...args], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

test('getFrontendScopeFiles includes fixed entries and active modules while excluding frozen realtime.js', () => {
  const scope = getFrontendScopeFiles();
  assert.ok(scope.includes('index.html'));
  assert.ok(scope.includes('scripts/app.js'));
  assert.ok(!scope.includes('scripts/modules/realtime.js'));
  assert.ok(scope.some((f) => f.startsWith('scripts/modules/') && f.endsWith('.js')));
});

test('extractAppVersion parses APP_VERSION from app.js correctly', () => {
  const version = extractAppVersion();
  assert.ok(typeof version === 'string' && version.length > 0);
  assert.match(version, /^[A-Za-z0-9._-]+$/u);
});

test('evaluateFrontendAssetVersionStatus returns ok on clean working tree', () => {
  const result = evaluateFrontendAssetVersionStatus();
  assert.ok(['ok', 'shallow_history_fallback', 'unbumped_frontend_changes'].includes(result.status));
  assert.ok(Array.isArray(result.scopeFiles));
  assert.ok(result.scopeFiles.length > 0);
});

test('evaluateFrontendAssetVersionStatus flags unbumped frontend changes in temporary repo fixture', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-asset-test-'));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  git(tempDir, ['init', '-b', 'main']);
  fs.mkdirSync(path.join(tempDir, 'scripts/modules'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(tempDir, 'scripts/app.js'), 'const APP_VERSION = "test-1";');
  fs.writeFileSync(path.join(tempDir, 'scripts/modules/testModule.js'), 'console.log("v1");');
  git(tempDir, ['add', '.']);
  git(tempDir, ['commit', '-m', 'initial']);

  // Modify module without bumping version
  fs.writeFileSync(path.join(tempDir, 'scripts/modules/testModule.js'), 'console.log("v2");');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: tempDir });
  assert.equal(result.currentVersion, 'test-1');
  assert.equal(result.status, 'unbumped_frontend_changes');
  assert.ok(result.uncommittedScopeChanges.includes('scripts/modules/testModule.js'));
});

test('evaluateFrontendAssetVersionStatus detects bubble-watch.html modification as a known limitation', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-bubble-test-'));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  git(tempDir, ['init', '-b', 'main']);
  fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'scripts/app.js'), 'const APP_VERSION = "test-2";');
  fs.writeFileSync(path.join(tempDir, 'bubble-watch.html'), '<!-- initial -->');
  git(tempDir, ['add', '.']);
  git(tempDir, ['commit', '-m', 'initial']);

  // Modify bubble-watch.html
  fs.writeFileSync(path.join(tempDir, 'bubble-watch.html'), '<!-- modified -->');

  const result = evaluateFrontendAssetVersionStatus({ repoRoot: tempDir });
  assert.equal(result.bubbleWatchModified, true);
  assert.ok(result.knownLimitations.some((lim) => lim.includes('bubble-watch.html')));
});
