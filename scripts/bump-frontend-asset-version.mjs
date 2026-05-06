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
    .replace(/v[A-Za-z0-9._-]+(?=\s+Frontend Asset Cache Busting)/gu, `v${version}`)
    .replace(/(当前正式版本仍是\s*[`'"]?)[A-Za-z0-9._-]+/gu, `$1${version}`)
    .replace(/(正式版本仍保持\s*[`'"]?)[A-Za-z0-9._-]+/gu, `$1${version}`)
    .replace(/(当前 frontend asset cache version 是\s*[`'"]?)[A-Za-z0-9._-]+/giu, `$1${version}`)
    .replace(/(Current frontend asset cache version\s*[:：]\s*[`'"]?)[A-Za-z0-9._-]+/giu, `$1${version}`)
    .replace(/((?:应返回|should return)\s+[`'"])[A-Za-z0-9._-]+([`'"])/giu, `$1${version}$2`);
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
