import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

// Check 1: index.html has new main-module structure for realtime band
const htmlPath = resolve('index.html');
const htmlContent = readFileSync(htmlPath, 'utf8');

// Verify realtime band uses main-module classes
if (!htmlContent.includes('editorial-realtime-category')) {
  fail('M-55b: editorial-realtime-category class not found in index.html (realtime band not repainted to main-module standard)');
}
if (!htmlContent.includes('editorial-realtime-grid')) {
  fail('M-55b: editorial-realtime-grid class not found in index.html');
}
if (!htmlContent.includes('editorial-realtime-card')) {
  fail('M-55b: editorial-realtime-card class not found in index.html');
}

// Verify 7 sub-cards in realtime grid
const cardMatches = htmlContent.match(/class="editorial-realtime-card"/g) || [];
if (cardMatches.length !== 7) {
  fail(`M-55b: expected 7 editorial-realtime-card sub-cards, found ${cardMatches.length}`);
}

// Verify all 16 realtime DOM ids preserved
const realtimeIds = [
  'rt-brent', 'rt-brent-delta', 'rt-brent-source', 'rt-brent-move',
  'rt-dxy', 'rt-dxy-delta',
  'rt-vix', 'rt-vix-delta',
  'rt-hy', 'rt-hy-delta',
  'rt-us10y', 'rt-gold', 'rt-spx',
  'rt-source-mode',
  'realtime-updated-at', 'realtime-notes'
];
for (const id of realtimeIds) {
  if (!htmlContent.includes(`id="${id}"`)) {
    fail(`M-55b: realtime DOM id "${id}" not found in index.html`);
  }
}

// Verify wow-key-changes is no longer static HTML (moved to JS runtime)
const staticWowPattern = /<section\s+id="wow-key-changes"/;
if (staticWowPattern.test(htmlContent)) {
  fail('M-55b: wow-key-changes should NOT be a static <section> in index.html (must be JS-runtime via renderMacroOverview.js)');
}
if (htmlContent.includes('id="wow-key-changes"')) {
  fail('M-55b: static wow-key-changes id should not remain in index.html');
}

// Check 2: renderMacroOverview.js has appendEditorialKeyChanges runtime section
const renderPath = resolve('scripts/modules/renderMacroOverview.js');
const renderContent = readFileSync(renderPath, 'utf8');

if (!renderContent.includes('appendEditorialKeyChanges')) {
  fail('M-55b: appendEditorialKeyChanges function not found in renderMacroOverview.js');
}

// Verify wow-key-changes literal is referenced in renderMacroOverview.js
if (!renderContent.includes("'wow-key-changes'")) {
  fail('M-55b: wow-key-changes literal not found in renderMacroOverview.js');
}

// Check 3: assets/styles.css has new realtime classes
const cssPath = resolve('assets/styles.css');
const cssContent = readFileSync(cssPath, 'utf8');

const requiredClasses = [
  '.editorial-realtime-category',
  '.editorial-realtime-grid',
  '.editorial-realtime-card',
  '.editorial-realtime-kicker',
  '.editorial-realtime-card-title',
  '.editorial-realtime-value',
];
for (const cls of requiredClasses) {
  if (!cssContent.includes(cls)) {
    fail(`M-55b: CSS class ${cls} not found in styles.css`);
  }
}

// Verify .editorial-subsection-equivalent is removed (M-55a legacy)
if (cssContent.includes('.editorial-subsection-equivalent')) {
  fail('M-55b: .editorial-subsection-equivalent should be REMOVED (M-55a legacy, no longer needed)');
}

// Check 4: Cache version
if (!htmlContent.includes('?v=28.0M-55bV')) {
  fail('M-55b: cache version 28.0M-55bV not found in index.html');
}
if (htmlContent.includes('?v=28.0M-55V')) {
  fail('M-55b: stale cache version 28.0M-55V still present in index.html');
}

if (errors.length > 0) {
  console.error('Frontend visual M-55b check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Frontend visual M-55b check: PASS (realtime band repainted to main-module standard + wow-key-changes JS-runtime + .editorial-subsection-equivalent removed + 16 realtime ids preserved)');
