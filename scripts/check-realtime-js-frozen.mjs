import fs from 'node:fs';

const FILES = {
  app: 'scripts/app.js',
  bumpHelper: 'scripts/bump-frontend-asset-version.mjs',
  config: 'scripts/modules/config.js',
  realtime: 'scripts/modules/realtime.js',
  packageJson: 'package.json',
};

const errors = [];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fail(message) {
  errors.push(message);
}

const app = read(FILES.app);
const bumpHelper = read(FILES.bumpHelper);
const config = read(FILES.config);
const realtime = read(FILES.realtime);
const packageJson = read(FILES.packageJson);

const appVersionMatch = app.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/u);
if (!appVersionMatch) {
  fail('scripts/app.js must expose APP_VERSION for asset-version guard');
}
const currentAssetVersion = appVersionMatch?.[1] ?? null;

for (const forbidden of [
  'modules/realtime.js',
  'fetchRealtimePayload',
  'buildRuntimeState',
  'applyRealtimeOverlay',
]) {
  if (app.includes(forbidden)) {
    fail(`scripts/app.js must not reconnect frozen realtime module marker: ${forbidden}`);
  }
}

if (!/FROZEN:\s*M-94 V0 Path C[\s\S]{0,260}workerFirstEnabled:\s*true/u.test(config)) {
  fail('scripts/modules/config.js must keep FROZEN M-94 marker immediately tied to workerFirstEnabled=true');
}

const realtimeHeader = realtime.split('\n').slice(0, 8).join('\n');
if (!/@frozen\s+M-94 V0 Path C/u.test(realtimeHeader)) {
  fail('scripts/modules/realtime.js must start with @frozen M-94 V0 Path C banner');
}
if (currentAssetVersion && realtime.includes(`?v=${currentAssetVersion}`)) {
  fail('scripts/modules/realtime.js is frozen/unconnected and must not be bumped to the current frontend asset version');
}
if (!/FROZEN_FRONTEND_MODULE_FILES[\s\S]{0,180}scripts\/modules\/realtime\.js/u.test(bumpHelper)) {
  fail('scripts/bump-frontend-asset-version.mjs must keep scripts/modules/realtime.js out of frontend asset bumps');
}

if (!packageJson.includes('"check:realtime-js-frozen": "node --check scripts/check-realtime-js-frozen.mjs && node scripts/check-realtime-js-frozen.mjs"')) {
  fail('package.json must define check:realtime-js-frozen');
}
if (!packageJson.includes('npm run check:realtime-js-frozen')) {
  fail('package.json check:all must include check:realtime-js-frozen');
}

if (errors.length > 0) {
  console.error('Realtime JS frozen boundary check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Realtime JS frozen boundary check: PASS');
