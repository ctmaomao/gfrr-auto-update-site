// Read-only frontend asset cache-version checker.
//
// Purpose: AGENTS.md §1 requires bumping the frontend asset version whenever
// index.html, scripts/app.js or a currently loaded scripts/modules/*.js changes.
// Nothing enforced that rule. The version parameter changes the resource URL, so a client
// holding the new entry point requests the new resources instead of depending on the old
// URL expiring; it does not guarantee immediate deployment propagation or refresh an
// already-open page. The JSON fetches in app.js instead pass `cache: 'no-cache'`, which
// requires revalidation before a cached response may be reused.
//
// Measured 2026-09-26: GitHub Pages serves max-age=600 for every asset, and the EdgeOne
// host serves `public, must-revalidate, max-age=0`. A missing bump is therefore a
// reliability gap inside the cache window, not permanent invisibility. Identical HTTP
// cache headers do not imply identical caching behaviour in every respect: within one page
// environment a repeated `import()` also reuses the already-loaded module instance, which
// is a mechanism outside the HTTP cache policy.
//
// Design notes, both learned the hard way:
//
//  * The scope is parsed from scripts/bump-frontend-asset-version.mjs instead of
//    being restated here, so this checker cannot drift from the tool that actually
//    performs the bump. `check-realtime-js-frozen` pins that tool's frozen-module
//    literal, so the definition cannot be extracted into a shared module without
//    weakening an existing assertion.
//
//  * `git log -S 'APP_VERSION ='` is NOT used to locate the baseline. It reports the
//    commit that first introduced the string (stage-4a-1, 2026-05-27), not the most
//    recent one that changed the value, which silently suppressed detection entirely.
//    The baseline is derived by comparing each commit against its own parent instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const BUMP_HELPER = 'scripts/bump-frontend-asset-version.mjs';
const APP_JS = 'scripts/app.js';
const REQUIRED_ENTRY_FILES = ['index.html', APP_JS];
// Used only when the bump tool cannot be read; kept identical to its declarations so a
// degraded run still classifies the same files, and surfaced via `derivedFromHelper`.
const FALLBACK_ENTRY_FILES = ['index.html', APP_JS];
const FALLBACK_FROZEN_MODULES = ['scripts/modules/realtime.js'];
// Standalone single-file page: it has no external asset reference, therefore no
// query token to bump. Reported as a known limitation rather than silently ignored.
const NO_TOKEN_PAGES = ['bubble-watch.html'];

function readIfPresent(absolutePath) {
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
}

function parseStringArray(source, anchor) {
  const at = source.indexOf(anchor);
  if (at === -1) return null;
  const open = source.indexOf('[', at);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open + 1, close).matchAll(/'([^']+)'/gu)].map((match) => match[1]);
}

/**
 * Frontend files whose change requires an asset-version bump, derived from the
 * bump tool itself: its fixed entries plus every loaded module except the frozen ones.
 * Since `check-realtime-js-frozen` pins that tool's frozen-module literal, the
 * definition cannot be extracted into a shared module without weakening it.
 *
 * If the tool is unreadable the scope falls back to this checker's own copy of the
 * same two facts, and says so, rather than throwing: an environment problem must not
 * be mistaken for a policy violation.
 */
export function getFrontendScope(repoRoot = process.cwd()) {
  const helper = readIfPresent(path.join(repoRoot, BUMP_HELPER));

  let declaredEntries = helper === null ? null : parseStringArray(helper, 'const fixedFiles');
  let frozen = helper === null ? null : parseStringArray(helper, 'FROZEN_FRONTEND_MODULE_FILES');
  const derivedFromHelper = declaredEntries !== null && frozen !== null;
  if (!derivedFromHelper) {
    declaredEntries = FALLBACK_ENTRY_FILES;
    frozen = FALLBACK_FROZEN_MODULES;
  }

  const entryFiles = REQUIRED_ENTRY_FILES.filter((file) => declaredEntries.includes(file));
  const frozenSet = new Set(frozen);
  const moduleDir = path.join(repoRoot, 'scripts/modules');
  const loadedModules = fs.existsSync(moduleDir)
    ? fs.readdirSync(moduleDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => `scripts/modules/${file}`)
      .filter((file) => !frozenSet.has(file))
      .sort()
    : [];

  return { entryFiles, loadedModules, frozenModules: [...frozenSet].sort(), derivedFromHelper };
}

export function extractAppVersion(source) {
  if (typeof source !== 'string') return null;
  const match = /APP_VERSION\s*=\s*['"]([A-Za-z0-9._-]+)['"]/u.exec(source);
  return match ? match[1] : null;
}

/**
 * The most recent commit that *introduced* the current APP_VERSION, i.e. the last bump.
 *
 * Derived by comparing each commit against its own parent while walking backwards. This
 * is the only comparison that identifies the introducing commit: walking with an eye on
 * the child instead returns the last commit that still held the *previous* value, whose
 * diff does not contain the bump at all, and `git log -S 'APP_VERSION ='` answers a
 * different question again — it reports where the string was introduced in 2026-05-27,
 * which suppressed detection entirely.
 *
 * Returns `decidable: false` when the walk stops at a history boundary rather than a real
 * root commit, which is the case in a shallow clone. A boundary must never be reported as
 * "this commit introduced the version": the commit that actually did may simply be absent,
 * and treating the boundary as the origin makes every scope file look like it changed
 * after the bump — or, worse, looks in-sync when the real change is the boundary commit.
 */
function findVersionChangeCommit(git, rev = 'HEAD') {
  const commits = (git(['rev-list', rev]) || '').split('\n').filter(Boolean);
  // True when this repository is shallow, so an unreadable parent means "history boundary"
  // rather than "root commit".
  const shallow = git(['rev-parse', '--is-shallow-repository']) === 'true';

  for (const commit of commits) {
    const version = extractAppVersion(git(['show', `${commit}:${APP_JS}`]));
    if (version === null) continue;
    // `git rev-parse <commit>^` is the boundary test: at a shallow boundary the parent
    // object is absent, so it fails. Comparing against an absent parent instead would treat
    // the boundary as a version introduction, which reported `ok` for a depth=1 clone whose
    // only commit was an unbumped frontend change.
    const parent = git(['rev-parse', `${commit}^`]);
    if (parent === null) {
      if (shallow) return { commit: null, version: null, decidable: false };
      return { commit, version, decidable: true };
    }
    if (extractAppVersion(git(['show', `${parent}:${APP_JS}`])) !== version) {
      return { commit, version, decidable: true };
    }
  }
  return { commit: null, version: null, decidable: !shallow };
}

export function evaluateFrontendAssetVersionStatus(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
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

  const scope = getFrontendScope(repoRoot);
  const scopeFiles = [...scope.entryFiles, ...scope.loadedModules];
  const scopeSet = new Set(scopeFiles);
  const appJsPath = path.join(repoRoot, APP_JS);

  const isShallow = git(['rev-parse', '--is-shallow-repository']) === 'true';
  const workingVersion = extractAppVersion(readIfPresent(appJsPath));
  const headVersion = extractAppVersion(git([`show`, `HEAD:${APP_JS}`]));
  const versionChange = findVersionChangeCommit(git);

  const reportedChanges = git(['status', '--porcelain', '--untracked-files=all']) || '';
  const changedFiles = reportedChanges
    .split('\n').filter(Boolean)
    .map((line) => line.slice(2).trimStart().replace(/^"|"$/gu, ''));

  const workingScopeChanges = changedFiles.filter((file) => scopeSet.has(file));
  const workingNoTokenChanges = changedFiles.filter((file) => NO_TOKEN_PAGES.includes(file));

  // A bump only counts if it ships in the same change set as the frontend edit, so the
  // relevant comparison is working tree versus HEAD. Comparing against the version the
  // baseline commit holds cannot work: once a bump is committed those two are identical,
  // which made every later change look already-bumped and suppressed detection entirely.
  const versionBumped = workingVersion !== null && headVersion !== null && workingVersion !== headVersion;

  // Committed history: scope files touched after the last version change were merged
  // without a bump, which is precisely the defect that reached production once already.
  // A clean working tree says nothing about this, so it is checked separately.
  //
  // Skipped when the working tree already carries a bump that HEAD does not: the developer
  // is repairing exactly that omission, and requiring them to commit the bump before the
  // check will pass would invert the normal order of work (commit and verify together).
  let committedScopeChanges = [];
  if (versionChange.commit !== null && !versionBumped) {
    const diff = git(['diff', '--name-only', `${versionChange.commit}..HEAD`]);
    if (diff !== null) {
      committedScopeChanges = diff.split('\n').filter(Boolean).filter((file) => scopeSet.has(file));
    }
  }

  const knownLimitations = workingNoTokenChanges.map(
    (file) => `${file} modified: standalone single-file page with no query cache-bust token, so its cache cannot be invalidated by an asset bump.`,
  );

  let status = 'ok';
  let reason = 'Frontend asset cache token covers every changed frontend file.';
  let offending = [];

  if (workingVersion === null) {
    status = 'app_version_missing';
    offending = workingScopeChanges;
    reason = `Could not read APP_VERSION from ${APP_JS}.`;
  } else if (workingScopeChanges.length > 0 && !versionBumped) {
    status = 'unbumped_frontend_changes';
    offending = workingScopeChanges;
    reason = `Uncommitted frontend changes without an APP_VERSION bump: ${offending.join(', ')}.`
      + ' Run: npm run bump:frontend-asset-version -- <new-version>';
  } else if (committedScopeChanges.length > 0) {
    status = 'unbumped_committed_frontend_changes';
    offending = committedScopeChanges;
    reason = `Frontend scope files changed after the last APP_VERSION bump (${versionChange.version}): ${offending.join(', ')}.`;
  } else if (!versionChange.decidable) {
    // A history boundary, not a real root commit: the introducing commit may be absent
    // entirely, so nothing here can be attributed either way.
    status = 'shallow_history_fallback';
    reason = 'History boundary reached without locating the version change (shallow clone?); committed frontend changes cannot be attributed.';
  }

  return {
    status,
    scopeFiles,
    entryFiles: scope.entryFiles,
    frozenModules: scope.frozenModules,
    workingVersion,
    headVersion,
    versionChangeVersion: versionChange.version,
    versionChangeCommit: versionChange.commit,
    versionChangeDecidable: versionChange.decidable,
    changedScopeFiles: offending,
    workingScopeChanges,
    committedScopeChanges,
    workingNoTokenChanges,
    versionBumped,
    isShallow,
    scopeDerivedFromBumpHelper: scope.derivedFromHelper,
    knownLimitations,
    reason,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = evaluateFrontendAssetVersionStatus();
  console.log(`Frontend asset version review: ${result.status}`);
  console.log(`  APP_VERSION (working tree) = ${result.workingVersion ?? 'UNKNOWN'}`);
  console.log(`  APP_VERSION (HEAD)         = ${result.headVersion ?? 'UNKNOWN'}`);
  console.log(`  last version change        = ${result.versionChangeVersion ?? 'n/a'} (at ${result.versionChangeCommit ? result.versionChangeCommit.slice(0, 8) : 'n/a'})`);
  console.log(`  scope                      = ${result.scopeFiles.length} files${result.scopeDerivedFromBumpHelper ? '' : ' (degraded: bump helper unreadable, using this checker\'s fallback scope)'}`);
  console.log(`  reason                     = ${result.reason}`);
  if (result.workingScopeChanges.length > 0) {
    console.log(`  uncommitted scope files    = ${result.workingScopeChanges.join(', ')}`);
  }
  if (result.committedScopeChanges.length > 0) {
    console.log(`  committed scope files      = ${result.committedScopeChanges.join(', ')}`);
  }
  for (const limitation of result.knownLimitations) console.log(`  [known limitation] ${limitation}`);
}
