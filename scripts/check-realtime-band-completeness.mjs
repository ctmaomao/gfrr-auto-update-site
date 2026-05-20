import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

const htmlPath = resolve('index.html');
const renderPath = resolve('scripts/modules/render.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const renderContent = readFileSync(renderPath, 'utf8');

const newIds = [
  'rt-dxy-source',
  'rt-vix-source',
  'rt-hy-source',
  'rt-us10y-delta',
  'rt-us10y-source',
  'rt-gold-delta',
  'rt-gold-source',
  'rt-spx-delta',
  'rt-spx-source',
];

for (const id of newIds) {
  if (!htmlContent.includes(`id="${id}"`)) {
    fail(`M-58: missing DOM id "${id}" in index.html`);
  }
}

for (const id of newIds) {
  if (!renderContent.includes(`'${id}'`)) {
    fail(`M-58: render.js does not reference DOM id "${id}"`);
  }
}

if (!renderContent.includes('fmtDeltaWithUnit')) {
  fail('M-58: fmtDeltaWithUnit helper not found in render.js');
}

if (!renderContent.includes('buildGenericSourceLabel')) {
  fail('M-58: buildGenericSourceLabel helper not found in render.js');
}

if (!renderContent.includes('FRED_SERIES_CN')) {
  fail('M-58: FRED_SERIES_CN constant not found in render.js');
}

const brentDeltaWithOrZero = /rt-brent-delta.*\|\|\s*0/;
if (brentDeltaWithOrZero.test(renderContent)) {
  fail('M-58: Brent delta still uses || 0 fallback (should use fmtDeltaWithUnit with null-check)');
}

if (!/assets\/styles\.css\?v=[A-Za-z0-9._-]+/u.test(htmlContent)
  || !/scripts\/app\.js\?v=[A-Za-z0-9._-]+/u.test(htmlContent)) {
  fail('M-58: index.html must keep versioned local stylesheet and app module assets');
}
if (htmlContent.includes('?v=28.0M-57V')) {
  fail('M-58: stale cache version 28.0M-57V still present in index.html');
}

if (errors.length > 0) {
  console.error('Realtime band completeness check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Realtime band completeness check: PASS (9 new ids + helpers + Brent bug fix + cache bump)');
