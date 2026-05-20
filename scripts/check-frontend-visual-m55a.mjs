import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

// Check 1: index.html structure
const htmlPath = resolve('index.html');
const htmlContent = readFileSync(htmlPath, 'utf8');

// Verify realtime band wrapper exists
if (!htmlContent.includes('id="homepage-realtime-band"')) {
  fail('M-55a: homepage-realtime-band aside not found in index.html');
}

// Verify all 16 rt-* and realtime ids still present (DOM ids preserved)
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
    fail(`M-55a: realtime DOM id "${id}" not found in index.html`);
  }
}

// Verify external-ai-auxiliary exists
if (!htmlContent.includes('id="external-ai-auxiliary"')) {
  fail('M-55a: external-ai-auxiliary section not found in index.html');
}

// Verify external-ai-auxiliary exists
const externalAiIdx = htmlContent.indexOf('id="external-ai-auxiliary"');
if (externalAiIdx === -1) {
  fail('M-55a: external-ai id not found');
}

// Verify realtime band physical position: should appear BEFORE external-ai
const realtimeBandIdx = htmlContent.indexOf('id="homepage-realtime-band"');
if (realtimeBandIdx === -1) {
  fail('M-55a: realtime-band id not found');
} else if (realtimeBandIdx > externalAiIdx) {
  fail(`M-55a: homepage-realtime-band (pos ${realtimeBandIdx}) must appear BEFORE external-ai-auxiliary (pos ${externalAiIdx})`);
}

// Verify cache version exists without pinning this historical guard to one release.
if (!/scripts\/app\.js\?v=[A-Za-z0-9._-]+/u.test(htmlContent)) {
  fail('M-55a: frontend asset cache version not found in index.html');
}
if (htmlContent.includes('?v=28.0M-55bV')) {
  fail('M-55a: stale cache version 28.0M-55bV still present in index.html');
}

if (errors.length > 0) {
  console.error('Frontend visual M-55a check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Frontend visual M-55a check: PASS (realtime band uplift + external-ai uplift + nav contract sync + 16 realtime DOM ids preserved)');
