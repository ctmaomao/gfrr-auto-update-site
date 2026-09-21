import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const FROZEN_MODULES = new Set(['scripts/modules/realtime.js']);
const FRONTEND_FIXED_ENTRIES = ['index.html', 'scripts/app.js'];

export function getFrontendScopeFiles(repoRoot = process.cwd()) {
  const scope = [...FRONTEND_FIXED_ENTRIES];
  const moduleDir = path.join(repoRoot, 'scripts/modules');

  if (fs.existsSync(moduleDir)) {
    const modules = fs.readdirSync(moduleDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => `scripts/modules/${file}`)
      .filter((file) => !FROZEN_MODULES.has(file));
    scope.push(...modules);
  }

  return scope;
}

export function extractAppVersion(repoRoot = process.cwd()) {
  const appJsPath = path.join(repoRoot, 'scripts/app.js');
  if (!fs.existsSync(appJsPath)) return null;

  const content = fs.readFileSync(appJsPath, 'utf8');
  const match = /APP_VERSION\s*=\s*['"]([A-Za-z0-9._-]+)['"]/u.exec(content);
  return match ? match[1] : null;
}

export function evaluateFrontendAssetVersionStatus(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const currentVersion = extractAppVersion(repoRoot);
  const scopeFiles = getFrontendScopeFiles(repoRoot);
  const scopeSet = new Set(scopeFiles);

  const git = (args) => {
    try {
      return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return null;
    }
  };

  // Check working tree (staged & unstaged & untracked)
  const untracked = (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean);
  const modifiedDiff = (git(['diff', '--name-only', 'HEAD']) || '').split('\n').filter(Boolean);
  const uncommittedScopeChanges = [...new Set([...untracked, ...modifiedDiff])].filter((file) => scopeSet.has(file));

  // Check if bubble-watch.html is modified in uncommitted or recent changes
  const uncommittedBubbleWatch = [...new Set([...untracked, ...modifiedDiff])].includes('bubble-watch.html');

  // Find commit where APP_VERSION was last changed
  const lastBumpCommit = git(['log', '-n', '1', '--format=%H', '-S', 'APP_VERSION =', '--', 'scripts/app.js']);
  const isShallow = git(['rev-parse', '--is-shallow-repository']) === 'true';

  let committedScopeChanges = [];
  let committedBubbleWatch = false;
  let historyAvailable = true;
  let lastBumpVersion = null;

  if (lastBumpCommit) {
    const bumpAppJs = git(['show', `${lastBumpCommit}:scripts/app.js`]);
    if (bumpAppJs) {
      const match = /APP_VERSION\s*=\s*['"]([A-Za-z0-9._-]+)['"]/u.exec(bumpAppJs);
      lastBumpVersion = match ? match[1] : null;
    }
    const diffFromBump = git(['diff', '--name-only', `${lastBumpCommit}..HEAD`]);
    if (diffFromBump !== null) {
      const filesFromBump = diffFromBump.split('\n').filter(Boolean);
      committedScopeChanges = filesFromBump.filter((file) => scopeSet.has(file));
      committedBubbleWatch = filesFromBump.includes('bubble-watch.html');
    }
  } else if (isShallow) {
    historyAvailable = false;
  }

  const uncommittedScopeWithoutAppJs = uncommittedScopeChanges.filter((file) => file !== 'scripts/app.js' && file !== 'index.html');
  const isVersionBumped = currentVersion !== null && lastBumpVersion !== null && currentVersion !== lastBumpVersion;

  let status = 'ok';
  let reason = 'Frontend asset cache token is in sync with modified frontend scope files.';

  if (!currentVersion) {
    status = 'app_version_missing';
    reason = 'Could not extract APP_VERSION from scripts/app.js.';
  } else if (!historyAvailable && uncommittedScopeChanges.length > 0) {
    status = 'shallow_history_fallback';
    reason = 'Git history is shallow; could not locate previous APP_VERSION bump commit.';
  } else if (uncommittedScopeWithoutAppJs.length > 0 && !isVersionBumped) {
    status = 'unbumped_frontend_changes';
    reason = `Frontend scope files modified in working tree (${uncommittedScopeWithoutAppJs.join(', ')}) without an APP_VERSION bump.`;
  }

  const knownLimitations = [];
  if (uncommittedBubbleWatch || committedBubbleWatch) {
    knownLimitations.push('bubble-watch.html modified: Note that bubble-watch.html is a standalone single-file page with no query cache-bust token mechanism.');
  }

  return {
    status,
    currentVersion,
    lastBumpVersion,
    reason,
    scopeFiles,
    uncommittedScopeChanges,
    committedScopeChanges,
    bubbleWatchModified: uncommittedBubbleWatch || committedBubbleWatch,
    knownLimitations,
    lastBumpCommit: lastBumpCommit || null,
    isShallow,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = evaluateFrontendAssetVersionStatus();
  console.log(`Frontend Asset Version Review: ${result.status.toUpperCase()}`);
  console.log(`Current APP_VERSION: ${result.currentVersion || 'UNKNOWN'}`);
  console.log(`Reason: ${result.reason}`);
  if (result.uncommittedScopeChanges.length > 0) {
    console.log(`Uncommitted scope files: ${result.uncommittedScopeChanges.join(', ')}`);
  }
  if (result.knownLimitations.length > 0) {
    for (const limitation of result.knownLimitations) {
      console.log(`[Known Limitation] ${limitation}`);
    }
  }
}
