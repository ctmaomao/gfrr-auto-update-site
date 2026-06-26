// P46 display-only guard: keep ODP readable on narrow screens without adding
// scoring, probability, or production-data behavior.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function fail(message) {
  errors.push(message);
}

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

function extractBlockAfter(text, marker, afterIndex = 0) {
  const markerIndex = text.indexOf(marker, afterIndex);
  if (markerIndex < 0) return '';
  const braceIndex = text.indexOf('{', markerIndex);
  if (braceIndex < 0) return '';

  let depth = 0;
  for (let index = braceIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(markerIndex, index + 1);
    }
  }

  return '';
}

function requireNoSecondScore(scope, text) {
  for (const marker of [
    'responsiveScore',
    'readabilityScore',
    'mobileScore',
    'directionScore',
    'predictionScore',
    'priceForecastScore',
    'probabilityScore',
  ]) {
    if (text.includes(marker)) fail(`${scope}: must not introduce second-score marker ${marker}`);
  }
}

const html = read('index.html');
const css = read('assets/styles.css');
const app = read('scripts/app.js');
const packageJson = read('package.json');
const suite = read('scripts/check-suite.mjs');
const renderOilDirectional = read('scripts/modules/renderOilDirectional.js');
const realtime = read('scripts/modules/realtime.js');
const currentVersion = currentAssetVersion(app);

const sectionStart = html.indexOf('id="oil-directional-pressure"');
const sectionEnd = html.indexOf('id="detail-data"', sectionStart);
const odpHtml = sectionStart >= 0 && sectionEnd > sectionStart
  ? html.slice(sectionStart, sectionEnd)
  : '';
if (!odpHtml) fail('index.html: cannot isolate #oil-directional-pressure section');

const odpCssStart = css.indexOf('/* ===== PR4 · Oil Directional Pressure');
const mobileCssStart = css.indexOf('MOBILE / NARROW-SCREEN OVERRIDES');
const odpBaseCss = odpCssStart >= 0 && mobileCssStart > odpCssStart
  ? css.slice(odpCssStart, mobileCssStart)
  : '';
if (!odpBaseCss) fail('assets/styles.css: cannot isolate ODP base CSS before mobile overrides');

const media760 = extractBlockAfter(css, '@media (max-width: 760px)', odpCssStart);
const mobileOverrideStart = mobileCssStart >= 0 ? mobileCssStart : 0;
const media600 = extractBlockAfter(css, '@media (max-width: 600px)', mobileOverrideStart);

if (!media760) fail('assets/styles.css: missing ODP @media (max-width: 760px) block');
if (!media600) fail('assets/styles.css: missing mobile override @media (max-width: 600px) block');

for (const marker of [
  '.odp-reader-flow { gap: 16px;',
  '.odp-flow-block { padding-top: 12px;',
  '.odp-flow-heading,',
  '.odp-support-grid,',
  '.odp-challenge-panels,',
  '.odp-ladder,',
  '.odp-evidence-timing-summary,',
  '.odp-reason-panels { grid-template-columns: minmax(0, 1fr);',
  '.odp-flow-heading { gap: 4px;',
  '.odp-flow-heading strong { font-size: 17px;',
  '.odp-flow-heading em { font-size: 12px;',
  '.odp-evidence-row { gap: 3px;',
]) {
  requireIncludes('ODP 760px readability CSS', media760, marker);
}

for (const marker of [
  '#oil-directional-pressure .editorial-section-body { padding-left: 0; padding-right: 0;',
  '.odp-meta { display: grid; grid-template-columns: minmax(0, 1fr);',
  '.odp-meta > div { display: grid; grid-template-columns: 96px minmax(0, 1fr);',
  '.odp-meta dd { min-width: 0; overflow-wrap: anywhere;',
  '.odp-reasons li { grid-template-columns: minmax(0, 1fr);',
  '.odp-reason-label { align-self: start;',
  '.odp-evidence-timing-summary { gap: 10px;',
  '.odp-energy-metrics { grid-template-columns: minmax(0, 1fr);',
  '.odp-energy-metrics div.wide { grid-column: auto;',
  '.odp-energy-core-item { grid-template-columns: minmax(0, 1fr);',
]) {
  requireIncludes('ODP 600px readability CSS', media600, marker);
}

for (const marker of [
  'class="odp-reader-flow"',
  '01 · VERDICT',
  '02 · EVIDENCE CHAIN',
  '03 · COUNTERWEIGHT',
  '04 · 证据矩阵与审计详情',
  'id="odp-evidence-timing-summary"',
]) {
  requireIncludes('ODP section structure', odpHtml, marker);
}

if (/<details[^>]*class="[^"]*\bodp-detail\b[^"]*"[^>]*\bopen\b/i.test(odpHtml)) {
  fail('ODP detail must remain folded by default; remove open attribute');
}

const odpCssLines = css
  .split(/\r?\n/u)
  .filter((line) => line.includes('.odp-') || line.includes('#oil-directional-pressure'));

for (const line of odpCssLines) {
  if (/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/iu.test(line)) {
    fail(`ODP CSS must use tokens, not direct hex colors: ${line.trim()}`);
  }
  if (line.includes('box-shadow')) {
    fail(`ODP CSS must not use box-shadow: ${line.trim()}`);
  }
  if (/border-radius\s*:/u.test(line)) {
    fail(`ODP CSS must not add rounded cards: ${line.trim()}`);
  }
}

requireNoSecondScore('ODP HTML', odpHtml);
requireNoSecondScore('ODP CSS', odpBaseCss + media760 + media600);
requireNoSecondScore('renderOilDirectional', renderOilDirectional);

for (const marker of [
  `"check:oil-directional-responsive-readability"`,
  'check-oil-directional-responsive-readability.mjs',
]) {
  requireIncludes('package.json', packageJson, marker);
}
requireIncludes('scripts/check-suite.mjs', suite, 'check:oil-directional-responsive-readability');

for (const marker of [
  `const APP_VERSION = '${currentVersion}'`,
  `assets/styles.css?v=${currentVersion}`,
  `scripts/app.js?v=${currentVersion}`,
]) {
  const source = marker.startsWith('const APP_VERSION') ? app : html;
  requireIncludes('asset version', source, marker);
}

if (currentVersion && realtime.includes(currentVersion)) {
  fail('scripts/modules/realtime.js is frozen/unconnected and must not be asset-bumped for P46');
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure responsive-readability check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log('Oil Directional Pressure responsive-readability check: PASS (narrow-screen reading flow locked)');
