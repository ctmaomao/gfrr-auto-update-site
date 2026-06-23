import fs from 'node:fs';
import path from 'node:path';

const version = process.argv[2];
const safeVersionPattern = /^[A-Za-z0-9._-]+$/u;
const usage = 'Usage: node scripts/bump-frontend-asset-version.mjs <version>';
const moduleDir = 'scripts/modules';
const fixedFiles = [
  'index.html',
  'scripts/app.js',
  'scripts/check-workflows.mjs',
  'README.md',
  'AGENTS.md',
  'docs/OPERATIONS.md',
  'docs/DATA_CONTRACT.md',
  'workers/gfrr-realtime-worker/README.md',
  // L0 metadata: these two carry the cache-version of record but used to be
  // missed by every bump (not scanned), causing recurring L0 drift. Tightly
  // anchored regexes below keep their single cache-version reference in sync.
  'docs/PROJECT_BACKLOG.md',
  'docs/MILESTONE_INDEX.md',
];

function fail(message) {
  console.error(message);
  console.error(usage);
  process.exit(1);
}

if (!version || process.argv.length > 3) {
  fail('Expected exactly one frontend asset version argument.');
}

if (!safeVersionPattern.test(version)) {
  fail('Version may only contain letters, numbers, dot, hyphen, and underscore.');
}

function listModuleFiles() {
  if (!fs.existsSync(moduleDir)) return [];
  return fs.readdirSync(moduleDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join(moduleDir, file).replaceAll('\\', '/'));
}

function replaceFrontendAssetVersion(text) {
  return text
    .replace(/\?v=[A-Za-z0-9._-]+/gu, `?v=${version}`)
    .replace(
      /(__GFRR_FRONTEND_VERSION__\s*=\s*['"])[A-Za-z0-9._-]+(['"])/gu,
      `$1${version}$2`,
    )
    .replace(
      /(frontendAssetVersion\s*=\s*['"])[A-Za-z0-9._-]+(['"])/gu,
      `$1${version}$2`,
    )
    // scripts/app.js runtime banner constant (not covered by the ?v= rule)
    .replace(
      /(APP_VERSION\s*=\s*['"])[A-Za-z0-9._-]+(['"])/gu,
      `$1${version}$2`,
    )
    // docs/PROJECT_BACKLOG.md Section 1 maintenance-table cell
    .replace(/(\|\s*Cache version\s*\|\s*`)[A-Za-z0-9._-]+(`)/gu, `$1${version}$2`)
    // docs/MILESTONE_INDEX.md Active line "当前 `X`;`check:all`" (suffix-anchored
    // so it never touches Handoff/history references to past versions)
    .replace(/(当前 `)[A-Za-z0-9._-]+(`;`check:all`)/gu, `$1${version}$2`)
    // Inline "current version" prose snapshots that defer to scripts/app.js APP_VERSION
    // (AGENTS.md §1, docs/DATA_CONTRACT.md, docs/OPERATIONS.md, worker README). These used
    // to go stale on every bump — the tool flipped the surrounding ?v=/command examples but
    // not the parenthetical snapshot, leaving same-line self-contradiction. Anchored on
    // "为准…现 `X`", a phrasing that only ever means "currently X" (never a historical
    // "在 X 版本中…" ref); full/half-width （ and ， both covered.
    .replace(/(为准[（(，,]现\s*`)[A-Za-z0-9._-]+(`)/gu, `$1${version}$2`)
    // Console-line variant "…APP_VERSION=<版本>`（当前 `X`）" — anchored on the literal
    // APP_VERSION=<版本>` code span so historical "当前 X" prose elsewhere is left alone.
    // DATA_CONTRACT uses half-width "(当前 )", OPERATIONS uses full-width "（当前 ）".
    .replace(/(APP_VERSION=<版本>`[（(]当前\s*`)[A-Za-z0-9._-]+(`)/gu, `$1${version}$2`)
    // "<version> Frontend Asset Cache Busting" heading: write the exact canonical
    // version argument with NO auto-prefix. Descriptive versions like
    // odp-hero-ref-1 must not become vodp-hero-ref-1; a numeric arg like
    // v28.0M-99V is written verbatim (the caller owns any leading "v").
    .replace(/[A-Za-z0-9._-]+(?=\s+Frontend Asset Cache Busting)/gu, version)
    .replace(/(当前正式版本仍是\s*[`'"]?)[A-Za-z0-9._-]+/gu, `$1${version}`)
    .replace(/(正式版本仍保持\s*[`'"]?)[A-Za-z0-9._-]+/gu, `$1${version}`)
    .replace(/(当前 frontend asset cache version 是\s*[`'"]?)[A-Za-z0-9._-]+/giu, `$1${version}`)
    .replace(/(Current frontend asset cache version\s*[:：]\s*[`'"]?)[A-Za-z0-9._-]+/giu, `$1${version}`)
    .replace(/(node\s+scripts\/bump-frontend-asset-version\.mjs\s+)[A-Za-z0-9._-]+/gu, `$1${version}`)
    .replace(/(npm\s+run\s+bump:frontend-asset-version\s+--\s+)[A-Za-z0-9._-]+/gu, `$1${version}`);
}

const files = [...new Set([...fixedFiles, ...listModuleFiles()])];
let changedCount = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`${file}: skipped (missing)`);
    continue;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = replaceFrontendAssetVersion(before);
  const changed = after !== before;

  if (changed) {
    fs.writeFileSync(file, after);
    changedCount += 1;
  }

  console.log(`${file}: ${changed ? 'changed' : 'unchanged'}`);
}

if (changedCount === 0) {
  console.error('No frontend asset version changes were made.');
  process.exit(1);
}

console.log(`Frontend asset version bumped to ${version}`);
