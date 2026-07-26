#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function requireMarker(text, marker, label) {
  if (!text.includes(marker)) errors.push(`${label} missing marker: ${marker}`);
}

const page = read('bubble-watch.html');
const e2e = read('tests/e2e/site-smoke.spec.mjs');
const design = read('DESIGN.md');
const contract = read('docs/DATA_CONTRACT.md');

for (const marker of [
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '.headline { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);',
  '@media (max-width: 720px) { .headline { grid-template-columns: 1fr; } }',
  '.axes-grid { display: grid; grid-template-columns: 1fr 1fr;',
  '@media (max-width: 720px) { .axes-grid { grid-template-columns: 1fr; } }',
  'grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));',
  '.technical-audit-summary { grid-template-columns: 1fr; }',
  'overflow-wrap: anywhere;',
  'const labelStep = W < 560 ? Math.ceil(seed.length / 5) : 1;',
  'width="${W}" height="${H}" role="img" aria-label="Core-23'
]) {
  requireMarker(page, marker, 'bubble-watch.html');
}

for (const marker of [
  'async function expectBubbleWatchContract',
  'async function expectNoHorizontalOverflow',
  "page.locator('section.category article.indicator')",
  'toHaveCount(27)',
  "page.locator('.score-role.core')",
  'toHaveCount(23)',
  "page.locator('.score-role.shadow')",
  'toHaveCount(4)',
  'document.documentElement.scrollWidth',
  'headlineColumns',
  'axesColumns',
  "Bubble Watch fails closed when its dedicated JSON is unavailable"
]) {
  requireMarker(e2e, marker, 'tests/e2e/site-smoke.spec.mjs');
}

for (const [text, label, markers] of [
  [design, 'DESIGN.md', ['390px', '27 / Core-23 / Shadow-4', '横向溢出']],
  [contract, 'docs/DATA_CONTRACT.md', ['Bubble Watch responsive/data-contract acceptance', '390px', 'fail-closed']]
]) {
  for (const marker of markers) requireMarker(text, marker, label);
}

if (errors.length > 0) {
  console.error('Bubble Watch responsive acceptance check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  'Bubble Watch responsive acceptance check: PASS ' +
  '(390px single-column/no-overflow, 27/Core-23/Shadow-4 DOM, JSON-bound scores, fail-closed data error)'
);
