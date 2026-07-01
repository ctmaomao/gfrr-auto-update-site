// P45 display-only guard: keep ODP readable as verdict -> evidence -> counterweight -> detail.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function requireIncludes(scope, text, marker) {
  if (!text.includes(marker)) fail(`${scope}: missing ${marker}`);
}

function currentAssetVersion(appText) {
  const match = appText.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/u);
  if (!match) fail('scripts/app.js: missing APP_VERSION for asset-version guard');
  return match?.[1] || '';
}

function requireOrder(scope, text, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index === -1) {
      fail(`${scope}: missing ordered marker ${marker}`);
      continue;
    }
    if (index <= cursor) fail(`${scope}: marker out of order ${marker}`);
    cursor = index;
  }
}

const html = read('index.html');
const css = read('assets/styles.css');
const app = read('scripts/app.js');
const packageJson = read('package.json');
const suite = read('scripts/check-suite.mjs');
const currentVersion = currentAssetVersion(app);

const sectionStart = html.indexOf('id="oil-directional-pressure"');
const sectionEnd = html.indexOf('id="detail-data"', sectionStart);
const odpHtml = sectionStart >= 0 && sectionEnd > sectionStart
  ? html.slice(sectionStart, sectionEnd)
  : '';
const odpCssStart = css.indexOf('/* ===== PR4 · Oil Directional Pressure');
const odpCssEnd = css.indexOf('/* ================================================================', odpCssStart);
const odpCss = odpCssStart >= 0 && odpCssEnd > odpCssStart
  ? css.slice(odpCssStart, odpCssEnd)
  : '';

if (!odpHtml) fail('index.html: cannot isolate #oil-directional-pressure section');
if (!odpCss) fail('assets/styles.css: cannot isolate ODP style block');

requireOrder('ODP reading flow', odpHtml, [
  'class="odp-reader-flow"',
  '01 · VERDICT',
  'id="odp-headline"',
  'id="odp-brent-basis-alert"',
  'class="odp-flow-block odp-flow-why"',
  '02 · EVIDENCE CHAIN',
  'id="odp-attribution-thesis"',
  'class="odp-ladder"',
  'id="odp-attribution-support"',
  'class="odp-flow-block odp-flow-challenge"',
  '03 · COUNTERWEIGHT',
  'id="odp-attribution-counter"',
  'id="odp-attribution-caps"',
  'id="odp-attribution-triggers"',
  'class="odp-flow-block odp-detail"',
  '04 · DETAIL LEDGER',
  'id="odp-evidence-timing-summary"',
  'id="odp-evidence-readiness-matrix"',
  'id="odp-evidence-list"',
]);

for (const id of [
  'odp-physical-bias',
  'odp-divergence',
  'odp-confidence',
  'odp-data-sufficiency',
  'odp-asof',
  'odp-ladder-core',
  'odp-ladder-market',
  'odp-ladder-global',
  'odp-ladder-watch',
  'odp-reason-diesel',
  'odp-reason-refinery',
  'odp-reason-inventory',
  'odp-reason-spr',
  'odp-reason-demand',
  'odp-reason-curve',
]) {
  requireIncludes('ODP section', odpHtml, `id="${id}"`);
}

if (/<details[^>]*class="[^"]*\bodp-after-verdict-fold\b[^"]*"[^>]*\bopen\b/i.test(odpHtml)) {
  fail('ODP 02-04 fold must remain folded by default; remove open attribute');
}

if (/<details[^>]*class="[^"]*\bodp-detail\b[^"]*"/i.test(odpHtml)) {
  fail('ODP 04 detail must be a peer .odp-flow-block, not a nested details block');
}

requireIncludes('ODP section note', odpHtml, '不参与平台评分');

for (const marker of [
  '.odp-reader-flow',
  '.odp-flow-block',
  '.odp-flow-heading',
  '.odp-support-grid',
  '.odp-challenge-panels',
  'var(--paper-line-strong)',
  'var(--font-display)',
  'var(--font-serif)',
  'var(--font-mono)',
]) {
  requireIncludes('assets/styles.css', css, marker);
}

for (const forbidden of [
  'border-radius: 8px',
  'border-radius: 12px',
  'box-shadow',
  'narrativeScore',
  'storyScore',
  'directionScore',
  'probability',
]) {
  if (odpCss.includes(forbidden) || odpHtml.includes(forbidden)) {
    fail(`P45 display structure must not introduce forbidden marker: ${forbidden}`);
  }
}

for (const marker of [
  '"check:oil-directional-reading-structure"',
  'check-oil-directional-reading-structure.mjs',
]) {
  requireIncludes('package.json', packageJson, marker);
}
requireIncludes('scripts/check-suite.mjs', suite, 'check:oil-directional-reading-structure');

for (const marker of [
  `const APP_VERSION = '${currentVersion}'`,
  `assets/styles.css?v=${currentVersion}`,
  `scripts/app.js?v=${currentVersion}`,
]) {
  const source = marker.startsWith('const APP_VERSION') ? app : html;
  requireIncludes('asset version', source, marker);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure reading-structure check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log('Oil Directional Pressure reading-structure check: PASS (01 verdict visible -> folded 02 evidence / 03 counterweight / 04 details peers)');
